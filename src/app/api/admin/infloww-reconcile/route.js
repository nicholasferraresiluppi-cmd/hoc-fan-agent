/**
 * GET /api/admin/infloww-reconcile?period_id=YYYY-MM
 *
 * Reconciliation Infloww ↔ CreatorsPro: usa la revenue reale di Infloww come
 * fonte INDIPENDENTE per capire se il "venduto" registrato in CP è completo.
 *
 *   - CP: somma dei takes (venduto attribuito agli operatori) per creator, dal
 *     KV wages del mese.
 *   - Infloww: lordo/netto per creator del mese, dagli aggregati KV (sync).
 *   - Match dei creator per nome+lingua, conservativo (mai fondere team
 *     diversi). Tie-break: nome Infloww SENZA sigla lingua = profilo ITA
 *     (pattern verificato sul roster: "Laura Sommaruga" vs "Laura ENG/ESP").
 *
 * CALIBRAZIONE (lug 2026, dati veri): il "venduto" CP = LORDO pagato dai fan
 * → si confronta col lordo Infloww. Baseline sano ratio ≈ 1.0 (Ottorini 0.98,
 * Iri 1.01, Fishball 0.95). Ratio ≪ 1 = buco CP (Elisa 0.63, Gaja 0.61).
 * Gli abbonamenti (~1-2% del lordo) non passano dagli operatori: tolleranza
 * fisiologica di qualche punto. Confronto DIREZIONALE, non contabile.
 *
 * COPERTURA (post-review adversariale): la finestra confrontabile è DERIVATA
 * DAI DATI Infloww presenti in KV (primo/ultimo giorno del mese, unione su
 * tutte le creator) e applicata a ENTRAMBE le fonti — gli shift CP fuori da
 * [day_min, day_max] sono esclusi. Se il mese non ha alcun giorno Infloww
 * (fuori finestra sync), la risposta è un esplicito needs_sync, MAI un
 * verdetto verde su dati inesistenti.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readMonthlyByCreator } from "@/lib/infloww-sync-job";

export const maxDuration = 30;
const r2 = (x) => Math.round(x * 100) / 100;

const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
function romeDay(x) {
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : romeDayFmt.format(d);
}

function normName(s) {
  // NFD scompone gli accenti (é → e + segno); il replace successivo toglie i segni.
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normLang(s) {
  const u = String(s || "").toUpperCase();
  if (/^(ESP|SPA|ES)$/.test(u)) return "ESP";
  if (/^(ENG|EN)$/.test(u)) return "EN";
  if (/^(ITA|IT)$/.test(u)) return "IT";
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
// CP: "Giulia Ottorini - IT" → {tokens, lang:"IT"}; "Eva Rizzoli - SILO_1" →
// {tokens:["eva","rizzoli"], lang:"", tag:"SILO_1"} — il suffisso "- XXX" è
// SEMPRE un tag di team, mai parte del nome (i token spuri creavano fusioni).
function parseCp(alias) {
  const m = String(alias || "").match(/^(.*?)\s*[-–]\s*([A-Za-z0-9_]{2,12})\s*$/);
  let base = alias, lang = "", tag = "";
  if (m) { base = m[1]; tag = m[2]; lang = normLang(m[2]); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang, tag };
}
/**
 * Punteggio match Infloww↔CP. 0 = incompatibile. Regole (post-review):
 *  - primo nome DEVE combaciare;
 *  - lingue esplicite diverse → MAI (0);
 *  - Infloww dichiara una lingua ma il CP no → 0 (niente fusioni alla cieca);
 *  - Infloww senza sigla → bonus al profilo IT (0.75) sopra le altre (0.5);
 *  - cognomi in conflitto ("Elisa Esposito" vs "Elisa Vimercati") → 0.
 */
function matchScore(inf, cp) {
  if (!inf.tokens.length || !cp.tokens.length) return 0;
  if (inf.tokens[0] !== cp.tokens[0]) return 0;
  let score = 1;
  if (inf.lang && cp.lang) {
    if (inf.lang !== cp.lang) return 0;
    score += 1;
  } else if (inf.lang && !cp.lang) {
    return 0;
  } else if (!inf.lang && cp.lang === "IT") {
    score += 0.75;
  } else {
    score += 0.5;
  }
  const allInfInCp = inf.tokens.every((t) => cp.tokens.includes(t));
  const allCpInInf = cp.tokens.every((t) => inf.tokens.includes(t));
  if (!allInfInCp && !allCpInInf) return 0;
  if (allInfInCp) score += 1;
  return score;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });

  // ── Infloww: lordo/netto per creator del mese (da KV sync) ─────────
  const inf = await readMonthlyByCreator(periodId);
  if (inf.needs_sync) {
    return Response.json({ period_id: periodId, needs_sync: "infloww", reason: "never_synced" });
  }
  if (!inf.day_min) {
    // Mese senza alcun giorno Infloww in KV: fuori finestra di sync.
    return Response.json({
      period_id: periodId, needs_sync: "infloww", reason: "month_out_of_coverage",
      last_sync_at: inf.last_sync_at,
    });
  }

  // Finestra confrontabile = giorni Infloww realmente presenti per il mese.
  const coverageFrom = inf.day_min;
  const coverageTo = inf.day_max;
  const monthStart = `${periodId}-01`;
  const [y, m] = periodId.split("-").map(Number);
  const monthEnd = `${periodId}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const today = romeDay(Date.now());
  const expectedEnd = monthEnd < today ? monthEnd : today;
  const coveragePartial = coverageFrom > monthStart || coverageTo < expectedEnd;

  // ── CP: venduto per alias, SOLO shift dentro [coverageFrom, coverageTo] ──
  const wages = await kv.get(`cp:wages:${periodId}`);
  const cpAvailable = Array.isArray(wages) && wages.length > 0;
  if (!cpAvailable) {
    return Response.json({ period_id: periodId, needs_sync: "cp", coverage_from: coverageFrom, coverage_to: coverageTo, last_sync_at: inf.last_sync_at });
  }
  const cpByAlias = new Map();
  const aliasShifts = new Map(); // presenza nei turni (anche SENZA vendite attribuite)
  let cpUnattributed = 0; // venduto che non sappiamo attribuire a una creator
  for (const w of wages) {
    for (const s of w.shifts || []) {
      const day = s.started_at ? romeDay(s.started_at) : null;
      if (day && (day < coverageFrom || day > coverageTo)) continue; // stessi giorni su entrambe le fonti
      const aliases = s.creator_aliases || [];
      for (const a of aliases) aliasShifts.set(a, (aliasShifts.get(a) || 0) + 1);
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const isMono = aliases.length <= 1;
      const salesByAlias = new Map();
      for (const t of takes) {
        const amt = Number(t.amount) || 0;
        if (!t.creator_alias) { cpUnattributed += amt; continue; }
        salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + amt);
      }
      if (salesByAlias.size === 0) {
        if (isMono && aliases[0]) salesByAlias.set(aliases[0], salesTotal);
        else if (salesTotal > 0) cpUnattributed += salesTotal; // multi-creator senza takes: non inventiamo attribuzioni
      }
      for (const [alias, sales] of salesByAlias.entries()) {
        cpByAlias.set(alias, (cpByAlias.get(alias) || 0) + sales);
      }
    }
  }
  const cpList = [...cpByAlias.entries()].map(([alias, sales]) => ({ alias, sales: r2(sales), p: parseCp(alias) }));
  const cpTotal = cpList.reduce((s, c) => s + c.sales, 0);

  // Solo creator Infloww attivi nel mese
  const infList = inf.creators
    .filter((c) => c.tx > 0)
    .map((c) => ({ ...c, p: parseInfloww(c.name) }));
  const infGrossTotal = infList.reduce((s, c) => s + c.gross, 0);
  const infNetTotal = infList.reduce((s, c) => s + c.net, 0);

  // ── Assegnazione GLOBALE per score (poi per volume): il punteggio più
  // alto vince l'alias, non il fatturato più grosso. Tie per lo stesso
  // profilo Infloww → non abbinare (conservativo).
  const pairs = [];
  for (const ic of infList) {
    for (const cc of cpList) {
      const sc = matchScore(ic.p, cc.p);
      if (sc >= 1.5) pairs.push({ ic, cc, sc });
    }
  }
  pairs.sort((a, b) => b.sc - a.sc || b.ic.gross - a.ic.gross);
  const usedInf = new Set(), usedCp = new Set();
  const matched = [];
  for (const p of pairs) {
    if (usedInf.has(p.ic.id) || usedCp.has(p.cc.alias)) continue;
    const tie = pairs.some((q) => q !== p && q.ic.id === p.ic.id && q.sc === p.sc && !usedCp.has(q.cc.alias) && q.cc.alias !== p.cc.alias);
    usedInf.add(p.ic.id);
    if (tie) continue; // ambiguo: resta nei non abbinati
    usedCp.add(p.cc.alias);
    matched.push({
      infloww_id: p.ic.id,
      infloww_name: p.ic.name,
      cp_alias: p.cc.alias,
      cp_sales: p.cc.sales,
      infloww_gross: p.ic.gross,
      infloww_net: p.ic.net,
      ratio_cp_over_gross: p.ic.gross > 0 ? r2(p.cc.sales / p.ic.gross) : null,
      gap_gross: r2(p.ic.gross - p.cc.sales),
      truncated: p.ic.truncated || undefined,
      score: p.sc,
    });
  }
  matched.sort((a, b) => b.infloww_gross - a.infloww_gross);

  // Per i profili Infloww senza vendite CP abbinate, distinguiamo DUE casi
  // diversi (feedback Nicholas, lug 2026): (a) l'alias non esiste proprio nei
  // turni del mese → "assente in CP"; (b) l'alias ESISTE nei turni ma nessuna
  // vendita gli è attribuita (team multi-creator senza takes, es. Giulia
  // Amici: 37 turni, $0 attribuiti) → "vendite non attribuite". Azioni diverse:
  // configurare la creator vs far registrare i takes.
  const presenceList = [...aliasShifts.entries()]
    .filter(([alias]) => !usedCp.has(alias))
    .map(([alias, n]) => ({ alias, n, p: parseCp(alias) }));
  function findPresence(ic) {
    let best = null, bestScore = 0, tie = false;
    for (const pc of presenceList) {
      const sc = matchScore(ic.p, pc.p);
      if (sc > bestScore) { best = pc; bestScore = sc; tie = false; }
      else if (sc === bestScore && sc > 0 && best && pc.alias !== best.alias) tie = true;
    }
    return best && bestScore >= 1.5 && !tie ? { alias: best.alias, shifts: best.n } : null;
  }
  const unmatchedInf = infList.filter((c) => !matched.some((mm) => mm.infloww_id === c.id))
    .map((c) => ({ id: c.id, name: c.name, userName: c.userName, gross: c.gross, truncated: c.truncated || undefined, cp_presence: findPresence(c) }))
    .sort((a, b) => b.gross - a.gross);
  const unmatchedCp = cpList.filter((c) => !usedCp.has(c.alias))
    .map((c) => ({ alias: c.alias, sales: c.sales })).sort((a, b) => b.sales - a.sales);

  const matchedCpSales = matched.reduce((s, mm) => s + mm.cp_sales, 0);
  const matchedInfGross = matched.reduce((s, mm) => s + mm.infloww_gross, 0);

  return Response.json({
    period_id: periodId,
    last_sync_at: inf.last_sync_at,
    failed_creators: inf.failed_creators || [],
    coverage_from: coverageFrom,
    coverage_to: coverageTo,
    coverage_partial: coveragePartial,
    agency: {
      cp_sales_total: r2(cpTotal),
      cp_unattributed: r2(cpUnattributed),
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
