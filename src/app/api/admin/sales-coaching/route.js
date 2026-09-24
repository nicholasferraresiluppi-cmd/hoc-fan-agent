// Coaching vendite — API di lettura (GET) e ricalcolo (POST).
// GATE: authorizeAll(SCORES_VIEW) = admin / sales manager / QA (scope "all"):
// espone nomi operatori + incasso per operatore, stessa classe delle route
// leaderboard denaro. Team lead e operatori → 403.
//
// GET ?split=<id> → viste già calcolate per quello split (o tutta HOC).
// Le viste si calcolano a READ-TIME dalla cache compatta (core puro): così
// uno split nuovo o modificato funziona subito, senza ricalcolare BigQuery.

export const runtime = "nodejs";
export const maxDuration = 120;

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import {
  bigQueryConfigured, getSalesCoachingData, computeSalesCoachingOnce, isComputing, isStale,
  listSplits, listExperiments, listApproved, listHidden,
} from "@/lib/sales-coaching";
import {
  splitWeeks, summarizePages, summarizeOperators, referenceBenchmark, behaviorLifts,
  weeklySeries, experimentView, FEATURES, MIN_OP_PPV, RECENT_WEEKS,
} from "@/lib/sales-coaching-core";

function buildView(data, split, experiments, approved, hidden) {
  const { meta, agg, lift, examples } = data;
  const { recent } = splitWeeks(meta.weeks);
  const ids = split ? split.creator_ids : null;
  const operators = summarizeOperators(agg, { creatorIds: ids, weeks: recent }).map((o) => ({
    ...o,
    series: weeklySeries(agg, { creatorIds: ids, op: o.op }).map((s) => [s.wk, s.ppv, s.conv]),
  }));
  const approvedIds = new Set(approved.map((e) => e.id));
  const hiddenIds = new Set(hidden);
  return {
    meta: { generated_at: meta.generated_at, weeks: meta.weeks, recent_weeks: recent, bytes_processed: meta.bytes_processed, stale: isStale(meta), min_op_ppv: MIN_OP_PPV, recent_n: RECENT_WEEKS },
    names: meta.names,
    split: split || null,
    pages: summarizePages(agg, { creatorIds: ids }),
    series: weeklySeries(agg, { creatorIds: ids }),
    operators,
    reference: referenceBenchmark(agg, { weeks: recent }),
    lifts: { split: behaviorLifts(lift, { creatorIds: ids }), org: behaviorLifts(lift, {}), labels: FEATURES },
    experiments: experiments.map((e) => ({ ...e, view: experimentView(agg, e) })),
    examples: examples
      .filter((e) => !hiddenIds.has(e.id))
      .map((e) => ({ ...e, approved: approvedIds.has(e.id) })),
    approved,
  };
}

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false });
  const splitId = new URL(request.url).searchParams.get("split");
  try {
    const [splits, experiments, approved, hidden] = await Promise.all([listSplits(), listExperiments(), listApproved(), listHidden()]);
    let data = await getSalesCoachingData();
    if (!data) {
      // primo accesso / cache scaduta: calcola ora (≈20s) se nessuno lo sta già facendo
      const done = await computeSalesCoachingOnce();
      if (!done) return Response.json({ bigquery: true, computing: true, splits });
      data = await getSalesCoachingData();
      if (!data) return Response.json({ error: "Calcolo completato ma cache non leggibile" }, { status: 500 });
    }
    const split = splitId ? splits.find((s) => s.id === splitId) || null : null;
    return Response.json({ bigquery: true, computing: await isComputing(), splits, ...buildView(data, split, experiments, approved, hidden) });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: 500 });
  }
}

export async function POST() {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  try {
    const meta = await computeSalesCoachingOnce();
    if (!meta) return Response.json({ computing: true });
    return Response.json({ ok: true, meta: { generated_at: meta.generated_at, counts: meta.counts } });
  } catch (e) {
    return Response.json({ error: e.message || "Ricalcolo fallito" }, { status: 500 });
  }
}
