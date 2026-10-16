// La scaletta — API di lettura (GET) e azioni (POST: ricalcolo, prove).
// GATE: authorizeScoped(SCORES_VIEW) = chi guida una squadra (team/all), poi il filtro per creator:
// ognuno vede SOLO le pagine assegnate (Antonio le sue). Espone nomi operatori → stessa classe di
// Coaching vendite. Il riferimento (i profili più forti di HOC) si mostra con i nomi solo a chi vede
// tutte le creator; agli altri come media "profili di riferimento HOC", senza incasso.
//
// GET ?creator=<id> → vista di quella pagina (default: la prima con più conversazioni).
export const runtime = "nodejs";
export const maxDuration = 120;

import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import {
  bigQueryConfigured, getScalettaData, computeScalettaOnce, isComputing, isStale, listProve, saveProva, endProva,
} from "@/lib/scaletta";
import {
  REFERENCE_IDS, REFERENCE_LABEL, MIN_SESSIONS, sumC, funnel, stopBreakdown, warmTable, massRecent,
  operatorTable, weeklySeries, provaView, cleanProva, suggestTargets, PROVA_MEASURES,
} from "@/lib/scaletta-core";

function visiblePages(data, scope) {
  const totals = new Map();
  for (const r of data.c) totals.set(r[1], (totals.get(r[1]) || 0) + (r[4] || 0));
  return [...totals.entries()]
    .map(([id, n]) => ({ id, name: data.meta.names?.[String(id)] || String(id), sessions: n }))
    .filter((p) => allowsCreator(scope, p.name))
    .sort((a, b) => b.sessions - a.sessions);
}

function buildView(data, pageId, prove, scope) {
  const { meta, c, o, m, p } = data;
  const weeks = meta.weeks || [];
  const recent = weeks.slice(-4);
  const ids = [pageId];
  const refIds = REFERENCE_IDS.filter((id) => id !== pageId);
  const pageT = sumC(c, { ids, weeks: recent });
  const refT = sumC(c, { ids: refIds, weeks: recent });
  const page = funnel(pageT);
  const ref = funnel(refT);
  const pageMass = massRecent(m, ids);
  const refMass = massRecent(m, refIds);
  const named = Boolean(scope.all);
  const refPages = named
    ? refIds.map((id) => ({ id, name: meta.names?.[String(id)] || String(id), ...funnel(sumC(c, { ids: [id], weeks: recent })), mass: massRecent(m, [id]) }))
    : [];
  const series = weeklySeries({ cRows: c, mRows: m, pRows: p, ids, weeks });
  const prova = prove[String(pageId)] || null;
  // agli utenti senza vista su tutte le creator il riferimento esce senza soldi
  const stripMoney = (f) => (named ? f : { ...f, rev_per_sold: null, ladder: null, p2_avg: null });
  return {
    page: { id: pageId, name: meta.names?.[String(pageId)] || String(pageId), ...page },
    reference: { label: named ? REFERENCE_LABEL : "Profili di riferimento HOC", named, ...stripMoney(ref), pages: refPages },
    stops: { page: stopBreakdown(pageT, { fallback: refT }), reference: { ...stopBreakdown(refT), lost: named ? stopBreakdown(refT).lost : null } },
    warm: { page: warmTable(c, { ids, weeks: recent }), reference: warmTable(c, { ids: refIds, weeks: recent }) },
    mass: { page: pageMass, reference: refMass },
    operators: operatorTable(o, { ids, weeks: recent }),
    series,
    prova: provaView(prova, series),
    suggested: suggestTargets(page, ref, pageMass, refMass),
    measures: PROVA_MEASURES,
  };
}

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false });
  try {
    let data = await getScalettaData();
    if (!data) {
      if (await isComputing()) return Response.json({ bigquery: true, computing: true });
      // primo accesso: calcola ora (~20-40s). Solo chi vede tutte le creator lo avvia (costo BigQuery).
      if (!az.creatorScope.all) return Response.json({ bigquery: true, empty: true });
      const done = await computeScalettaOnce();
      if (!done) return Response.json({ bigquery: true, computing: true });
      data = await getScalettaData();
      if (!data) return Response.json({ error: "Calcolo completato ma cache non leggibile" }, { status: 500 });
    }
    const pages = visiblePages(data, az.creatorScope);
    if (!pages.length) return Response.json({ bigquery: true, pages: [], noPages: true });
    const wanted = Number(new URL(request.url).searchParams.get("creator"));
    const prove = await listProve();
    const withProva = pages.find((pg) => prove[String(pg.id)]);
    const sel = pages.find((pg) => pg.id === wanted) || withProva || pages[0];
    return Response.json({
      bigquery: true,
      computing: await isComputing(),
      meta: { generated_at: data.meta.generated_at, weeks: data.meta.weeks, stale: isStale(data.meta), min_sessions: MIN_SESSIONS, bytes: data.meta.bytes_processed },
      pages: pages.map((pg) => ({ ...pg, prova: Boolean(prove[String(pg.id)]) })),
      canRecompute: Boolean(az.creatorScope.all),
      ...buildView(data, sel.id, prove, az.creatorScope),
    });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "recompute") {
      // il ricalcolo spende BigQuery: solo admin
      const adm = await authorize(CAPABILITIES.SEED);
      if (!adm.ok) return Response.json({ error: "Il ricalcolo lo avvia un amministratore" }, { status: 403 });
      if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
      const meta = await computeScalettaOnce();
      if (!meta) return Response.json({ computing: true });
      return Response.json({ ok: true, generated_at: meta.generated_at });
    }
    if (body.action === "prova" || body.action === "end_prova") {
      const data = await getScalettaData();
      if (!data) return Response.json({ error: "Dati non ancora calcolati" }, { status: 409 });
      const cid = Number(body.prova?.creator_id ?? body.creator_id);
      const page = visiblePages(data, az.creatorScope).find((pg) => pg.id === cid);
      if (!page) return Response.json({ error: "Questo profilo non è tra le creator assegnate a te" }, { status: 403 });
      if (body.action === "end_prova") {
        await endProva(cid);
        return Response.json({ ok: true });
      }
      const c = cleanProva(body.prova);
      if (!c.ok) return Response.json({ error: c.error }, { status: 400 });
      const saved = await saveProva(c.prova, az.userId);
      return Response.json({ ok: true, prova: saved });
    }
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Operazione fallita" }, { status: 500 });
  }
}
