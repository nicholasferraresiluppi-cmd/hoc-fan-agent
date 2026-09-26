/**
 * /api/admin/action-center
 *
 * Backend del pannello "Action Center" — gestisce i mark + swap mapping
 * per gli operatori da rivedere/cambiare/sostituire questo periodo.
 *
 * Capability richiesta: SEED (admin-only).
 *
 * Storage KV: chiave `action_center:swaps:{period_id}` → JSON
 *   {
 *     "Mario Rossi": {
 *       marked_at: 1716100000000,
 *       marked_by: "user_xxxx",
 *       status: "marked" | "ready_for_hr",
 *       swap_with: "Luca Bianchi" | null,
 *       note: ""
 *     }
 *   }
 *
 * GET    ?period_id=YYYY-MM             → ritorna swaps + lista underperformers
 * POST   body { period_id, employee, action, swap_with?, note?, status? }
 *         → upsert entry (action="mark", "set_swap", "set_ready", "set_pending")
 * DELETE ?period_id=YYYY-MM&employee=N → rimuove entry (unmark)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { buildCreatorMatrix, computeSwapSuggestions } from "@/lib/creator-aggregates";
import { buildOperatorsForCpLeaderboard, hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";
import { loadGroupLanguages } from "@/app/api/admin/group-languages/route";
import { detectLanguage } from "@/lib/leaderboard-calc";
import { getCachedCreatorDifficulty } from "@/lib/creator-difficulty";

const SWAP_KEY = (periodId) => `action_center:swaps:${periodId}`;
const IGNORED_KEY = "underperformers:ignored";

// SOGLIA UI default = 25 (Average e sotto). Il backend ritorna fino a SCORE_MAX_BACKEND
// (75 = include anche Good) così l'UI ha uno slider che alza la soglia senza rifetch.
const SCORE_THRESHOLD_DEFAULT_UI = 25;
const SCORE_MAX_BACKEND = 75;
const UNDERPERFORMER_MIN_SHIFTS = 5;   // Almeno 5 shift TOTALI nel periodo
const TOP_N = 200;                     // Max candidati ritornati (cap di sicurezza)

function isValidPeriod(p) { return typeof p === "string" && /^\d{4}-\d{2}$/.test(p); }

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });

  const cpAvail = await hasCpDataForPeriod(period_id);
  if (!cpAvail) {
    return Response.json({
      error: `Nessun dato CP sincronizzato per ${period_id}. Sync prima da /admin/creatorspro-sync.`,
      cp_available: false, candidates: [], swaps: {},
    }, { status: 404 });
  }

  const [swaps, ignored, operatorsRaw, matrixResult, categories, langOverrides] = await Promise.all([
    kv.get(SWAP_KEY(period_id)),
    kv.get(IGNORED_KEY),
    buildOperatorsForCpLeaderboard(period_id),
    buildCreatorMatrix(period_id),
    loadGroupCategories(),
    loadGroupLanguages(),
  ]);
  const swapsObj = swaps || {};
  const ignoredObj = ignored || {};

  // Decora ogni operator con language (override > regex) e category
  const operatorsDecorated = operatorsRaw.map((op) => {
    const lang = langOverrides?.[op.group] || detectLanguage(op.group);
    return { ...op, category: categories?.[op.group] || null, language: lang || null };
  });

  // Calcola score con buildCpLeaderboard (deriva da matrix v3)
  const { ranking } = await buildCpLeaderboard(operatorsDecorated, period_id);

  // Filtra underperformers (allargato a SCORE_MAX_BACKEND, UI poi filtra con slider)
  const rawCandidates = ranking
    .filter((r) => {
      if (r.score == null) return false;
      if (r.score > SCORE_MAX_BACKEND) return false;
      const totalShifts = r.cp_aggregates?.total_shifts || 0;
      if (totalShifts < UNDERPERFORMER_MIN_SHIFTS) return false;
      if (ignoredObj[r.employee]) return false;
      return true;
    })
    .sort((a, b) => a.score - b.score) // peggiore primo
    .slice(0, TOP_N);

  // Calcola suggerimenti SMART per ogni candidato (in parallelo)
  const suggestionsArr = await Promise.all(
    rawCandidates.map((r) => computeSwapSuggestions(r.employee, period_id, { limit: 5 }))
  );

  // Contesto prima del giudizio (26/09/2026): per la creator principale di ogni
  // candidato, (a) quanto rende rispetto ai COLLEGHI su di lei (leave-one-out:
  // la sua quota esclusa dalla media), (b) quanto è "freddo" il suo pubblico
  // (profilo difficoltà dal warehouse, solo cache — mai calcolo nel percorso UI).
  // Serve a non sostituire chi rende come gli altri su una creator difficile.
  const { matrix, creators: creatorAgg } = matrixResult || {};
  let diffByName = new Map();
  try {
    const d = await getCachedCreatorDifficulty();
    for (const p of d?.profiles || []) if (p.creator_name) diffByName.set(p.creator_name, p);
  } catch {}
  function contextFor(r) {
    const cr = r.cp_breakdown?.top_creator;
    if (!cr) return null;
    const cell = matrix?.[r.employee]?.[cr];
    const agg = creatorAgg?.[cr];
    let vsPeers = null;
    if (cell && agg && cell.shifts >= 3) {
      const peerShifts = (agg.total_shifts || 0) - cell.shifts;
      const peerSales = (agg.total_sales || 0) - cell.sales;
      if (peerShifts >= 5 && peerSales > 0) {
        const mine = cell.sales / cell.shifts, peers = peerSales / peerShifts;
        vsPeers = Math.round(((mine - peers) / peers) * 100);
      }
    }
    const prof = diffByName.get(cr);
    const idx = prof && !prof.free_page && typeof prof.difficulty_index === "number" ? prof.difficulty_index : null;
    return {
      creator: cr,
      vs_peers_pct: vsPeers,
      difficulty_index: idx,
      difficulty_band: idx == null ? null : idx >= 67 ? "fredda" : idx <= 33 ? "calda" : "nella media",
    };
  }

  const candidates = rawCandidates.map((r, i) => {
    const swapEntry = swapsObj[r.employee] || null;
    return {
      employee: r.employee,
      group: r.group || null,
      language: r.language || null,
      category: r.category || null,
      score: r.score,
      tier: r.tier,
      rank: r.rank,
      cp_total_sales: r.cp_aggregates?.total_sales || 0,
      cp_total_shifts: r.cp_aggregates?.total_shifts || 0,
      top_creator: r.cp_breakdown?.top_creator || null,
      top_creator_sales: r.cp_breakdown?.top_creator_sales || 0,
      specialization_pct: r.cp_breakdown?.specialization_pct || 0,
      reliable_creators_count: r.cp_breakdown?.reliable_creators || 0,
      swap_entry: swapEntry,
      suggested_swaps: suggestionsArr[i] || [],
      context: contextFor(r),
    };
  });

  // Lista candidati per swap (operatori "buoni" non in underperformer list)
  const swapTargets = ranking
    .filter((r) => r.score != null && r.score >= 50) // Good+
    .filter((r) => (r.cp_aggregates?.total_shifts || 0) >= 3)
    .sort((a, b) => b.score - a.score)
    .map((r) => ({
      employee: r.employee,
      score: r.score,
      tier: r.tier,
      group: r.group,
      language: r.language || null,
      category: r.category || null,
      total_shifts: r.cp_aggregates?.total_shifts || 0,
    }))
    .slice(0, 100); // top 100 sostituibili

  // Counts per filter pills (globali, pre-filtro UI)
  const langCounts = { ita: 0, eng: 0, none: 0 };
  const tierCounts = {};
  const groups = new Set();
  for (const c of candidates) {
    if (c.language === "ita") langCounts.ita++;
    else if (c.language === "eng") langCounts.eng++;
    else langCounts.none++;
    if (c.tier) tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1;
    if (c.group) groups.add(c.group);
  }

  // Lista finale per HR
  const readyForHr = Object.entries(swapsObj)
    .filter(([, e]) => e?.status === "ready_for_hr")
    .map(([emp, e]) => ({ employee: emp, ...e }));

  return Response.json({
    period_id,
    cp_available: true,
    candidates_count: candidates.length,
    candidates,
    swap_targets: swapTargets,
    ignored_count: Object.keys(ignoredObj).length,
    ready_for_hr: readyForHr,
    swaps: swapsObj,
    filter_counts: {
      languages: langCounts,
      tiers: tierCounts,
      groups: Array.from(groups).sort(),
    },
    config: {
      score_threshold_default_ui: SCORE_THRESHOLD_DEFAULT_UI,
      score_max_backend: SCORE_MAX_BACKEND,
      min_shifts: UNDERPERFORMER_MIN_SHIFTS,
    },
  });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { period_id, employee, action, swap_with, note, status } = body || {};
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee || typeof employee !== "string") return Response.json({ error: "employee (string) required" }, { status: 400 });

  const validActions = ["mark", "set_swap", "set_ready", "set_pending"];
  if (!validActions.includes(action)) return Response.json({ error: `action must be ${validActions.join("|")}` }, { status: 400 });

  const key = SWAP_KEY(period_id);
  const swaps = (await kv.get(key)) || {};
  const prev = swaps[employee] || null;
  const now = Date.now();

  const next = {
    marked_at: prev?.marked_at || now,
    marked_by: prev?.marked_by || az.userId,
    updated_at: now,
    updated_by: az.userId,
    status: prev?.status || "marked",
    swap_with: prev?.swap_with || null,
    note: prev?.note || "",
    hr: prev?.hr || null,
  };

  if (action === "mark") {
    // upsert "marked" (entry creata)
  } else if (action === "set_swap") {
    if (swap_with !== null && (typeof swap_with !== "string" || !swap_with.trim())) {
      return Response.json({ error: "swap_with must be string or null" }, { status: 400 });
    }
    next.swap_with = swap_with === null ? null : swap_with.trim();
  } else if (action === "set_ready") {
    // Decisione 26/09 (comitato esperti, delega di Nicholas): verso HR si va solo
    // con un intervento umano documentato — colloquio svolto, motivazione scritta,
    // voce dell'operatore. È anche la prova dell'intervento umano (GDPR art. 22).
    const hr = body?.hr || {};
    const date = String(hr.colloquio_date || "").trim();
    const why = String(hr.motivazione || "").trim();
    const voice = String(hr.voce_operatore || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Indica la data del colloquio" }, { status: 400 });
    if (why.length < 80) return Response.json({ error: "La motivazione deve essere di almeno 80 caratteri" }, { status: 400 });
    if (voice.length < 10) return Response.json({ error: "Scrivi cosa ha detto l'operatore nel colloquio" }, { status: 400 });
    next.status = "ready_for_hr";
    next.hr = { colloquio_date: date, motivazione: why.slice(0, 2000), voce_operatore: voice.slice(0, 2000), by: az.userId, at: now };
  } else if (action === "set_pending") {
    next.status = "marked";
    next.hr = null;
  }

  if (typeof note === "string") next.note = note.trim();

  swaps[employee] = next;
  await kv.set(key, swaps);

  await logAuditAction({
    action: `action_center.${action}`,
    target: employee,
    by: az.userId,
    meta: { period_id, swap_with: next.swap_with, status: next.status, previous: prev },
  });

  return Response.json({ ok: true, employee, entry: next, total: Object.keys(swaps).length });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  const employee = url.searchParams.get("employee");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee) return Response.json({ error: "?employee=NAME required" }, { status: 400 });

  const key = SWAP_KEY(period_id);
  const swaps = (await kv.get(key)) || {};
  if (!(employee in swaps)) return Response.json({ error: "employee not in mapping" }, { status: 404 });

  const removed = swaps[employee];
  delete swaps[employee];
  await kv.set(key, swaps);

  await logAuditAction({
    action: "action_center.unmark",
    target: employee,
    by: az.userId,
    meta: { period_id, removed_entry: removed },
  });

  return Response.json({ ok: true, removed: employee, total: Object.keys(swaps).length });
}
