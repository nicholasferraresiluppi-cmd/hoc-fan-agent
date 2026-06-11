/**
 * GET /api/admin/shift-research?creator=NOME&period_id=YYYY-MM[&format=csv]
 *
 * RICERCA one-shot per il match turno ↔ payment profile.
 *
 * v2 — LEZIONE APPRESA: le wage CP appartengono all'OPERATORE e attraversano
 * più creator; NON si filtrano per groupId del creator (la v1 tornava 0).
 * Il legame creator↔turno sta nei takes/creator_aliases dentro ogni shift —
 * esattamente come fa il sync da mesi. Quindi:
 *
 *   Q2/Q3 → dai dati GIÀ SINCRONIZZATI in KV (cp:wages:{period}, normalizzati
 *           con takes esatti) — percorso provato, zero chiamate CP.
 *   Q1   → campione piccolo: 4 wage RAW da CP API (solo quelle con turni sul
 *           creator target) per scansionare i campi profile/payment.
 *
 * Diagnostica inclusa: se qualcosa è vuoto, il response dice PERCHÉ.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchWageDetail } from "@/lib/creatorspro-api";

export const maxDuration = 60;

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
    // 1. Wages normalizzate del mese da KV (percorso provato del sync)
    const wages = (await kv.get(`cp:wages:${periodId}`)) || [];
    if (!Array.isArray(wages) || wages.length === 0) {
      return Response.json({
        error: `Nessuna wage in KV per ${periodId}. Il mese è stato sincronizzato? Vai su /admin/creatorspro-sync-history.`,
        diagnostics: { kv_key: `cp:wages:${periodId}`, kv_value_type: typeof wages },
      }, { status: 404 });
    }

    // 2. Trova gli alias creator REALI nei dati che matchano il nome richiesto
    const q = norm(creatorName);
    const qTokens = creatorName.toLowerCase().split(/[\s_\-,]+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 3);
    const allAliases = new Set();
    for (const w of wages) {
      for (const s of w.shifts || []) {
        for (const a of s.creator_aliases || []) allAliases.add(a);
        for (const t of s.takes || []) if (t.creator_alias) allAliases.add(t.creator_alias);
      }
    }
    const matchedAliases = [...allAliases].filter((a) => {
      const an = norm(a);
      return an.includes(q) || q.includes(an) || qTokens.every((t) => an.includes(t));
    });
    if (matchedAliases.length === 0) {
      return Response.json({
        error: `Nessun alias creator nei dati di ${periodId} matcha "${creatorName}"`,
        diagnostics: {
          wages_in_kv: wages.length,
          total_distinct_aliases: allAliases.size,
          sample_aliases: [...allAliases].slice(0, 40).sort(),
        },
      }, { status: 404 });
    }
    const matchedNorm = matchedAliases.map(norm);

    // 3. Q3 — dataset: tutti gli shift che toccano il creator target
    const rows = [];
    const wageIdsWithTarget = new Set();
    for (const w of wages) {
      for (const s of w.shifts || []) {
        const aliases = s.creator_aliases || [];
        const takes = s.takes || [];
        const touches =
          aliases.some((a) => matchedNorm.includes(norm(a))) ||
          takes.some((t) => matchedNorm.includes(norm(t.creator_alias)));
        if (!touches) continue;
        wageIdsWithTarget.add(w.id);

        let salesOnCreator = 0;
        let takesTotal = 0;
        for (const t of takes) {
          const amt = Number(t.amount) || 0;
          takesTotal += amt;
          if (matchedNorm.includes(norm(t.creator_alias))) salesOnCreator += amt;
        }
        const salesTotal = Number(s.total_attributed) || takesTotal;
        const isMono = aliases.length <= 1;
        if (takes.length === 0 && isMono) salesOnCreator = salesTotal;

        const earnings = Number(s.total_earnings) || 0;
        const effPct = salesTotal > 0 ? earnings / salesTotal : null;
        rows.push({
          date: (s.started_at || "").slice(0, 10),
          start: (s.started_at || "").slice(11, 16),
          end: (s.ended_at || "").slice(11, 16),
          operator: w.member_name || "?",
          creators_in_shift: aliases.length || 1,
          mono: isMono,
          sales_on_creator: Math.round(salesOnCreator * 100) / 100,
          sales_total_shift: Math.round(salesTotal * 100) / 100,
          earnings: Math.round(earnings * 100) / 100,
          eff_pct: effPct != null ? Math.round(effPct * 10000) / 10000 : null,
          worked_hours: s.worked_hours || null,
          shift_id: s.id,
          wage_id: w.id,
        });
      }
    }
    rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    // 4. Q2 — formula scaglioni sui turni MONO con sales significative
    const mono = rows.filter((r) => r.mono && r.sales_total_shift > 50 && r.eff_pct != null);
    const buckets = {};
    for (const r of mono) {
      const b = (Math.round(r.eff_pct * 200) / 200).toFixed(3);
      buckets[b] = (buckets[b] || 0) + 1;
    }
    const bucketList = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    const top5coverage = bucketList.slice(0, 5).reduce((s, [, c]) => s + c, 0) / Math.max(mono.length, 1);
    const q2_verdict = mono.length === 0
      ? "Nessun turno mono-creator con sales > $50 — campione insufficiente"
      : top5coverage > 0.8
        ? `BRACKET su intero importo: ${(top5coverage * 100).toFixed(0)}% dei ${mono.length} turni mono cade su ≤5 percentuali discrete`
        : `Distribuzione continua (top5 bucket coprono ${(top5coverage * 100).toFixed(0)}% di ${mono.length} turni): possibile formula cumulativa o profili multipli`;

    // 5. Q1 — campione RAW: 4 wage con turni sul target, fetchate live da CP
    const sampleIds = [...wageIdsWithTarget].slice(0, 4);
    const profileRegex = /profil|payment|tier|scaglion|seller/i;
    const fieldHits = new Map();
    let sampleRawShift = null;
    let q1_errors = [];
    for (const wid of sampleIds) {
      try {
        const raw = await fetchWageDetail(wid);
        for (const s of raw?.shifts || []) {
          // preferisci come sample un raw shift che tocca il target
          const touches = (s.associatedCreators || []).some((c) => matchedNorm.includes(norm(c.alias || c.name)));
          if (!sampleRawShift || (touches && !sampleRawShift._touches)) {
            sampleRawShift = { ...JSON.parse(JSON.stringify(s)), _touches: touches };
          }
          for (const hit of scanFields(s, profileRegex)) {
            if (!fieldHits.has(hit.path)) fieldHits.set(hit.path, { count: 0, distinct: new Set() });
            const e = fieldHits.get(hit.path);
            e.count++;
            try { e.distinct.add(JSON.stringify(hit.value)); } catch {}
          }
        }
        for (const hit of scanFields(raw?.info || {}, profileRegex, "info")) {
          if (!fieldHits.has(hit.path)) fieldHits.set(hit.path, { count: 0, distinct: new Set() });
          const e = fieldHits.get(hit.path);
          e.count++;
          try { e.distinct.add(JSON.stringify(hit.value)); } catch {}
        }
      } catch (e) {
        q1_errors.push({ wage_id: wid, error: String(e?.message || e) });
      }
    }
    if (sampleRawShift) delete sampleRawShift._touches;
    const q1_profile_fields = [...fieldHits.entries()].map(([path, e]) => ({
      path, count: e.count, distinct_values: e.distinct.size,
      examples: [...e.distinct].slice(0, 5).map((s) => { try { return JSON.parse(s); } catch { return s; } }),
    })).sort((a, b) => b.count - a.count);

    // CSV
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
      creator: matchedAliases.join(" + "),
      matched_aliases: matchedAliases,
      period_id: periodId,
      wages_count: wageIdsWithTarget.size,
      shifts_count: rows.length,
      q1_sampled_wage_ids: sampleIds,
      q1_errors: q1_errors.length > 0 ? q1_errors : undefined,
      q1_profile_fields,
      q1_sample_raw_shift_keys: sampleRawShift ? Object.keys(sampleRawShift) : null,
      q1_sample_raw_shift: sampleRawShift,
      q2_mono_shifts_analyzed: mono.length,
      q2_eff_pct_distribution: bucketList.map(([pct, count]) => ({ eff_pct: parseFloat(pct), count })),
      q2_verdict,
      rows,
      csv_url: `/api/admin/shift-research?creator=${encodeURIComponent(creatorName)}&period_id=${periodId}&format=csv`,
      diagnostics: {
        wages_in_kv: wages.length,
        wages_touching_creator: wageIdsWithTarget.size,
        total_distinct_aliases: allAliases.size,
      },
    });
  } catch (e) {
    console.error("[shift-research] error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
