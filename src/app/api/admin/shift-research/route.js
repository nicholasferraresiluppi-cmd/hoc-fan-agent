/**
 * GET /api/admin/shift-research?creator=NOME&period_id=YYYY-MM[&format=csv]
 *
 * RICERCA (one-shot, no KV write): per un creator × mese, scarica i wage
 * detail RAW da CP API e risponde a 3 domande:
 *
 *  Q1 — Il raw shift contiene il payment profile applicato? Con che nome campo?
 *       → scan ricorsivo di TUTTI i campi del primo shift + collezione dei
 *         campi /profil|payment|tier|seller/i su tutti gli shift.
 *
 *  Q2 — La formula scaglioni è "bracket su intero importo" o "cumulativa"?
 *       → per ogni shift MONO-creator: eff% = totalEarnings / sales.
 *         Se eff% cade su valori discreti (8/10/12/15%) → bracket whole.
 *         Se varia con continuità al crescere del venduto → cumulativa.
 *
 *  Q3 — Dataset completo per ricostruire il foglio stile "Scheda Gaja":
 *       ogni shift con data, orario, operatore, venduto sul creator,
 *       earnings, eff%, conteggio creator nel turno.
 *
 * format=csv → download diretto per costruire il foglio Sheets.
 *
 * Capability: SEED. Nessuna scrittura, solo lettura CP API.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchGroups, fetchWages, fetchWageDetailBatch } from "@/lib/creatorspro-api";

export const maxDuration = 60;

function monthBoundsIso(periodId) {
  const [y, m] = periodId.split("-").map(Number);
  return {
    startedAt: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    endedAt: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

// Scan ricorsivo: colleziona path→valore per campi che matchano la regex
function scanFields(obj, regex, path = "", out = [], depth = 0) {
  if (depth > 5 || !obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const np = path ? `${path}.${k}` : k;
    if (regex.test(k)) {
      out.push({ path: np, value: typeof v === "object" ? JSON.parse(JSON.stringify(v ?? null)) : v });
    }
    if (v && typeof v === "object" && !Array.isArray(v)) scanFields(v, regex, np, out, depth + 1);
    else if (Array.isArray(v) && v.length > 0) scanFields(v[0], regex, `${np}[0]`, out, depth + 1);
  }
  return out;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const creatorName = (url.searchParams.get("creator") || "").trim();
  const periodId = url.searchParams.get("period_id") || "";
  const format = url.searchParams.get("format") || "json";
  if (!creatorName || !/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "creator + period_id YYYY-MM richiesti" }, { status: 400 });
  }

  try {
    // 1. Trova il group CP del creator (fuzzy, emoji-safe)
    const groupsRaw = await fetchGroups();
    const allGroups = [];
    (function flatten(arr) {
      for (const g of arr || []) {
        allGroups.push(g);
        if (Array.isArray(g.childrens)) flatten(g.childrens);
      }
    })(groupsRaw);
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = norm(creatorName);
    const qTokens = creatorName.toLowerCase().split(/[\s_\-,]+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 3);
    const target =
      allGroups.find((g) => norm(g.name) === q) ||
      allGroups.find((g) => norm(g.name).includes(q) || q.includes(norm(g.name))) ||
      allGroups.find((g) => qTokens.every((t) => norm(g.name).includes(t))) ||
      allGroups.find((g) => qTokens.some((t) => norm(g.name).includes(t)));
    if (!target) {
      return Response.json({
        error: `Group CP per "${creatorName}" non trovato`,
        available_groups: allGroups.map((g) => g.name).slice(0, 40),
      }, { status: 404 });
    }

    // 2. Wage stubs del mese per quel group
    const { startedAt, endedAt } = monthBoundsIso(periodId);
    const stubs = [];
    let page = 1;
    let pageCount = 1;
    do {
      const r = await fetchWages({ startedAt, endedAt, page, limit: 25, groupId: target.id });
      stubs.push(...(r?.data || []));
      pageCount = r?.pagination?.pageCount || 1;
      page++;
    } while (page <= pageCount && page <= 10);

    const wageIds = stubs.map((w) => w?.info?.id).filter(Boolean);
    if (wageIds.length === 0) {
      return Response.json({
        creator: target.name, group_id: target.id, period_id: periodId,
        error: "Nessun wage per questo group nel periodo",
      }, { status: 404 });
    }

    // 3. Wage details RAW (batch parallelo)
    const { details } = await fetchWageDetailBatch(wageIds);
    const wages = (details || []).filter((d) => d && !d._failed);

    // 4. Q1 — campi profile-related nel RAW
    const profileRegex = /profil|payment|tier|scaglion|wage_?rate|seller/i;
    const fieldHits = new Map(); // path → {example, count}
    let sampleRawShift = null;
    let sampleRawWageInfo = null;
    for (const w of wages) {
      if (!sampleRawWageInfo && w.info) sampleRawWageInfo = w.info;
      for (const s of w.shifts || []) {
        if (!sampleRawShift) sampleRawShift = s;
        for (const hit of scanFields(s, profileRegex)) {
          const key = hit.path;
          if (!fieldHits.has(key)) fieldHits.set(key, { example: hit.value, count: 0, distinct: new Set() });
          const e = fieldHits.get(key);
          e.count++;
          try { e.distinct.add(JSON.stringify(hit.value)); } catch {}
        }
      }
      // anche a livello wage.info
      for (const hit of scanFields(w.info || {}, profileRegex, "info")) {
        const key = hit.path;
        if (!fieldHits.has(key)) fieldHits.set(key, { example: hit.value, count: 0, distinct: new Set() });
        const e = fieldHits.get(key);
        e.count++;
        try { e.distinct.add(JSON.stringify(hit.value)); } catch {}
      }
    }
    const q1_profile_fields = [...fieldHits.entries()].map(([path, e]) => ({
      path, count: e.count, distinct_values: e.distinct.size,
      examples: [...e.distinct].slice(0, 5).map((s) => { try { return JSON.parse(s); } catch { return s; } }),
    })).sort((a, b) => b.count - a.count);

    // 5. Q2 + Q3 — dataset shift per shift
    const targetAliasNorm = norm(target.name);
    const rows = [];
    for (const w of wages) {
      const memberName = w?.info?.memberName || "?";
      for (const s of w.shifts || []) {
        const takes = Array.isArray(s.takes) ? s.takes : [];
        const creatorsInShift = (s.associatedCreators || []).map((c) => c.alias || c.name).filter(Boolean);
        // sales sul creator target: somma takes il cui alias matcha
        let salesOnCreator = 0;
        let salesTotal = 0;
        for (const t of takes) {
          const amt = Number(t.amount) || 0;
          salesTotal += amt;
          const alias = norm(t?.creator?.alias || t?.creatorAlias || "");
          if (alias && (alias.includes(targetAliasNorm) || targetAliasNorm.includes(alias))) salesOnCreator += amt;
        }
        // fallback: shift mono-creator senza takes → tutto al creator
        const isMono = creatorsInShift.length <= 1;
        if (takes.length === 0 && isMono) {
          salesOnCreator = Number(s.totalAttributed) || 0;
          salesTotal = salesOnCreator;
        }
        const earnings = Number(s.totalEarnings) || 0;
        const effPct = salesTotal > 0 ? earnings / salesTotal : null;
        rows.push({
          date: (s.startedAt || "").slice(0, 10),
          start: (s.startedAt || "").slice(11, 16),
          end: (s.endedAt || "").slice(11, 16),
          operator: memberName,
          creators_in_shift: creatorsInShift.length || 1,
          mono: isMono,
          sales_on_creator: Math.round(salesOnCreator * 100) / 100,
          sales_total_shift: Math.round(salesTotal * 100) / 100,
          earnings: Math.round(earnings * 100) / 100,
          eff_pct: effPct != null ? Math.round(effPct * 10000) / 10000 : null,
          worked_hours: s.workedHours || null,
          shift_id: s.id,
        });
      }
    }
    rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    // Q2 — analisi formula sui MONO shifts con sales>0
    const mono = rows.filter((r) => r.mono && r.sales_total_shift > 50 && r.eff_pct != null);
    const buckets = {};
    for (const r of mono) {
      const b = (Math.round(r.eff_pct * 200) / 200).toFixed(3); // bucket 0.5pp
      buckets[b] = (buckets[b] || 0) + 1;
    }
    const bucketList = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    // Heuristica: se i top bucket coprono >80% dei mono shifts su <=5 valori → bracket whole
    const top5coverage = bucketList.slice(0, 5).reduce((s, [, c]) => s + c, 0) / Math.max(mono.length, 1);
    const q2_verdict = top5coverage > 0.8
      ? `BRACKET su intero importo: ${(top5coverage * 100).toFixed(0)}% dei ${mono.length} turni mono cade su <=5 percentuali discrete`
      : `Distribuzione continua (top5 bucket coprono solo ${(top5coverage * 100).toFixed(0)}%): possibile formula cumulativa o profili multipli`;

    // CSV export
    if (format === "csv") {
      const header = "date,start,end,operator,creators_in_shift,mono,sales_on_creator,sales_total_shift,earnings,eff_pct,worked_hours,shift_id";
      const lines = rows.map((r) =>
        [r.date, r.start, r.end, `"${r.operator}"`, r.creators_in_shift, r.mono, r.sales_on_creator, r.sales_total_shift, r.earnings, r.eff_pct ?? "", r.worked_hours ?? "", r.shift_id].join(",")
      );
      return new Response([header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="shift-research-${norm(creatorName)}-${periodId}.csv"`,
        },
      });
    }

    return Response.json({
      creator: target.name,
      group_id: target.id,
      period_id: periodId,
      wages_count: wages.length,
      shifts_count: rows.length,
      q1_profile_fields,
      q1_sample_raw_shift_keys: sampleRawShift ? Object.keys(sampleRawShift) : null,
      q1_sample_raw_shift: sampleRawShift,
      q1_sample_wage_info_keys: sampleRawWageInfo ? Object.keys(sampleRawWageInfo) : null,
      q2_mono_shifts_analyzed: mono.length,
      q2_eff_pct_distribution: bucketList.map(([pct, count]) => ({ eff_pct: parseFloat(pct), count })),
      q2_verdict,
      rows,
      csv_url: `/api/admin/shift-research?creator=${encodeURIComponent(creatorName)}&period_id=${periodId}&format=csv`,
    });
  } catch (e) {
    console.error("[shift-research] error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
