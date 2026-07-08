/**
 * GET /api/admin/infloww-reconcile?period_id=YYYY-MM
 *
 * Reconciliation Infloww ↔ CreatorsPro: usa la revenue reale di Infloww come
 * fonte INDIPENDENTE per capire se il "venduto" registrato in CP è completo.
 *
 *   - CP: somma dei takes (venduto attribuito agli operatori) per creator, dal
 *     KV wages del mese.
 *   - Infloww: lordo/netto per creator del mese, dagli aggregati KV (sync).
 *   - Match dei creator per nome+lingua (conservativo: nel dubbio, non abbina).
 *
 * Confronto direzionale (NON contabile): CP "venduto" ≈ lordo pagato dai fan →
 * si confronta col LORDO Infloww. Gli abbonamenti (non operator-driven) pesano
 * ~1% e sono trascurati. Serve a fare da ALLARME: se CP ≪ Infloww su una
 * creator, probabile buco nei dati CP.
 *
 * Output diagnostico ricco (agency + matched + non abbinati) per calibrare.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readMonthlyByCreator } from "@/lib/infloww-sync-job";

export const maxDuration = 30;
const r2 = (x) => Math.round(x * 100) / 100;

function normName(s) {
  // NFD scompone gli accenti (é → e + segno); il replace successivo toglie i segni.
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normLang(s) {
  const u = String(s || "").toUpperCase();
  if (/ESP|SPA/.test(u) || u === "ES") return "ESP";
  if (/ENG/.test(u) || u === "EN") return "EN";
  if (/ITA/.test(u) || u === "IT") return "IT";
  return "";
}
// Infloww: "Laura ESP" → {tokens:["laura"], lang:"ESP"}; "Giulia ottorini" → {tokens, lang:""}
function parseInfloww(name) {
  const raw = String(name || "");
  const m = raw.match(/\b(ESP|ENG|ITA|EN|IT|ES|SPA)\s*$/i);
  let lang = "", base = raw;
  if (m) { lang = normLang(m[1]); base = raw.slice(0, m.index); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang };
}
// CP: "Giulia Ottorini - IT" → {tokens, lang:"IT"}
function parseCp(alias) {
  const m = String(alias || "").match(/^(.*?)\s*[-–]\s*([A-Za-z]{2,4})\s*$/);
  let base = alias, lang = "";
  if (m) { base = m[1]; lang = normLang(m[2]); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang };
}
// Punteggio match tra un creator Infloww e un alias CP.
function matchScore(inf, cp) {
  if (!inf.tokens.length || !cp.tokens.length) return 0;
  const firstMatch = inf.tokens[0] === cp.tokens[0] ? 1 : 0;
  if (!firstMatch) return 0; // il primo nome DEVE combaciare
  const langOk = (!inf.lang || !cp.lang) ? 0.5 : (inf.lang === cp.lang ? 1 : -5);
  const allInfInCp = inf.tokens.every((t) => cp.tokens.includes(t)) ? 1 : 0;
  return firstMatch + langOk + allInfInCp;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });

  // CP: venduto per alias
  const wages = await kv.get(`cp:wages:${periodId}`);
  const cpByAlias = new Map();
  if (Array.isArray(wages)) {
    for (const w of wages) {
      for (const s of w.shifts || []) {
        const aliases = s.creator_aliases || [];
        const takes = s.takes || [];
        const salesTotal = Number(s.total_attributed) || 0;
        const isMono = aliases.length <= 1;
        const salesByAlias = new Map();
        for (const t of takes) {
          if (!t.creator_alias) continue;
          salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
        }
        if (salesByAlias.size === 0 && isMono && aliases[0]) salesByAlias.set(aliases[0], salesTotal);
        for (const [alias, sales] of salesByAlias.entries()) {
          cpByAlias.set(alias, (cpByAlias.get(alias) || 0) + sales);
        }
      }
    }
  }
  const cpList = [...cpByAlias.entries()].map(([alias, sales]) => ({ alias, sales: r2(sales), p: parseCp(alias) }));
  const cpTotal = cpList.reduce((s, c) => s + c.sales, 0);

  // Infloww: lordo/netto per creator del mese
  const inf = await readMonthlyByCreator(periodId);
  if (inf.needs_sync) {
    return Response.json({ needs_sync: true, period_id: periodId, note: "Nessun dato Infloww sincronizzato: sincronizza la vista Revenue agency." });
  }
  const infList = inf.creators.filter((c) => c.tx > 0).map((c) => ({ ...c, p: parseInfloww(c.name) }));
  const infGrossTotal = infList.reduce((s, c) => s + c.gross, 0);
  const infNetTotal = infList.reduce((s, c) => s + c.net, 0);

  // Match conservativo: per ogni Infloww, miglior alias CP con score >= 1.5 e unico.
  const usedCp = new Set();
  const matched = [];
  for (const ic of infList) {
    let best = null, bestScore = 0, tie = false;
    for (const cc of cpList) {
      if (usedCp.has(cc.alias)) continue;
      const sc = matchScore(ic.p, cc.p);
      if (sc > bestScore) { best = cc; bestScore = sc; tie = false; }
      else if (sc === bestScore && sc > 0) tie = true;
    }
    if (best && bestScore >= 1.5 && !tie) {
      usedCp.add(best.alias);
      matched.push({
        infloww_name: ic.name, cp_alias: best.alias,
        cp_sales: best.sales, infloww_gross: ic.gross, infloww_net: ic.net,
        ratio_cp_over_gross: ic.gross > 0 ? r2(best.sales / ic.gross) : null,
        gap_gross: r2(ic.gross - best.sales),
        score: bestScore, days_covered: ic.days_covered,
      });
    }
  }
  matched.sort((a, b) => b.infloww_gross - a.infloww_gross);

  const unmatchedInf = infList.filter((c) => !matched.some((m) => m.infloww_name === c.name))
    .map((c) => ({ name: c.name, userName: c.userName, gross: c.gross, net: c.net })).sort((a, b) => b.gross - a.gross);
  const unmatchedCp = cpList.filter((c) => !usedCp.has(c.alias))
    .map((c) => ({ alias: c.alias, sales: c.sales })).sort((a, b) => b.sales - a.sales);

  const matchedCpSales = matched.reduce((s, m) => s + m.cp_sales, 0);
  const matchedInfGross = matched.reduce((s, m) => s + m.infloww_gross, 0);

  return Response.json({
    period_id: periodId,
    last_sync_at: inf.last_sync_at,
    agency: {
      cp_sales_total: r2(cpTotal),
      infloww_gross_total: r2(infGrossTotal),
      infloww_net_total: r2(infNetTotal),
      // rapporti sui soli abbinati (confronto pulito)
      matched_cp_sales: r2(matchedCpSales),
      matched_infloww_gross: r2(matchedInfGross),
      ratio_cp_over_infgross_matched: matchedInfGross > 0 ? r2(matchedCpSales / matchedInfGross) : null,
    },
    counts: { infloww_active: infList.length, cp_aliases: cpList.length, matched: matched.length, unmatched_infloww: unmatchedInf.length, unmatched_cp: unmatchedCp.length },
    matched,
    unmatched_infloww: unmatchedInf,
    unmatched_cp: unmatchedCp,
  });
}
