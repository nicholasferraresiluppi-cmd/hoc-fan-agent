// Carriera (23/11/2026) — fasce A/B/C, revisioni, eccezioni del sales coach, roundtable.
// Logica in lib/carriera-core (pura, tests/carriera.mjs), archivio in lib/carriera.
//
// GATE: authorizeScoped(SCORES_VIEW) = scope team o all (gli operatori, scope own, restano
// fuori: la loro pagina è /me/percorso, spenta finché l'avvocato non dà l'ok). Poi il filtro
// per creator di lib/creator-scope: chi ha creator assegnate vede SOLO gli operatori il cui
// profilo principale è tra le sue. Le schede si accendono per ruolo:
//   quadro    → admin o chi vede tutte le creator
//   profili   → chi ha creator assegnate (il sales coach)
//   revisioni → admin o ruolo qa_reviewer (il revisore qualità)
// Le azioni ripetono il controllo lato server: il pulsante nascosto non basta.
//
// GET  → tutto ciò che l'utente può vedere.
// POST { action, ... } → review.open | review.step | exception.add | exception.end | roundtable.add
//
// Legge SOLO cache notturne piccole (squadra:data:*, fasce:data:*): mai le wage CP all'apertura
// (incidente banda Upstash del 04/10). Se la Squadra manca, avvia UN calcolo (lock) come la sua pagina.

export const runtime = "nodejs";
export const maxDuration = 120;

import { currentUser } from "@clerk/nextjs/server";
import { authorizeScoped, allowsCreator, personOf } from "@/lib/creator-scope";
import { CAPABILITIES, getUserRoles } from "@/lib/rbac";
import { isUserIdAdmin } from "@/lib/admin";
import { getSquadraData, computeSquadraOnce, isSquadraStale } from "@/lib/squadra";
import { getFasceData } from "@/lib/fasce";
import { nameKey } from "@/lib/squadra-core";
import {
  CARRIERA_VERSION, buildQuadro, primaryProfile, newReview, applyReviewStep,
  newException, isExceptionActive, newRoundtable,
} from "@/lib/carriera-core";
import {
  listReviews, getReview, saveReview, listExceptions, getException, saveException,
  listRoundtables, saveRoundtable,
} from "@/lib/carriera";

async function context() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return { az };
  const [admin, roles] = await Promise.all([isUserIdAdmin(az.userId).catch(() => false), getUserRoles(az.userId).catch(() => [])]);
  const scope = az.creatorScope;
  const allCreators = Boolean(scope?.all);
  const revisore = admin || roles.includes("qa_reviewer");
  const me = {
    admin,
    revisore,
    coach: !allCreators && (scope?.creators?.size || 0) > 0,
    allCreators,
    creators: allCreators ? [] : [...(scope?.creators || [])].sort(),
  };
  // il revisore lavora su tutti i profili per mestiere (deve poter aprire ogni revisione dovuta);
  // gli altri vedono le sole creator assegnate. Un profilo CP è "Gaja - IT": decide la persona (Gaja).
  const seeAll = allCreators || revisore;
  const allow = (profileName) => seeAll || Boolean(profileName && allowsCreator(scope, personOf(profileName)));
  return { az, me, allow };
}

async function actorName(fallback) {
  try {
    const u = await currentUser();
    const n = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
    return n || u?.primaryEmailAddress?.emailAddress?.split("@")[0] || fallback;
  } catch {
    return fallback;
  }
}

/** cid → nome della pagina, dalla cache delle Fasce (stessi turni CP della Squadra). */
async function pageNames() {
  const doc = await getFasceData().catch(() => null);
  const names = {};
  for (const p of doc?.pages || []) if (p?.cid) names[String(p.cid)] = p.name || String(p.cid);
  return { names, ok: Boolean(doc) };
}

export async function GET() {
  const ctx = await context();
  if (!ctx.me) return Response.json({ error: ctx.az.message }, { status: ctx.az.status });
  const { me, allow } = ctx;
  try {
    let squadra = await getSquadraData();
    if (!squadra) {
      const done = await computeSquadraOnce();
      if (!done) return Response.json({ computing: true, me, version: CARRIERA_VERSION });
      squadra = done;
    }
    const [{ names, ok: namesOk }, reviews, exceptions, roundtables] = await Promise.all([pageNames(), listReviews(), listExceptions(), listRoundtables()]);
    const now = Date.now();
    const quadro = buildQuadro({ rows: squadra.rows || [], names, reviews, exceptions, roundtables, allow, now, months: squadra.months });
    const visibleKeys = new Set(quadro.operators.map((o) => o.key));
    // revisioni: il revisore le vede tutte; il sales coach solo quelle dei suoi operatori (per sapere a che punto sono)
    const seeReview = (r) => me.revisore || allow(r.profile) || visibleKeys.has(r.key);
    return Response.json({
      version: CARRIERA_VERSION,
      me,
      tabs: { quadro: me.admin || me.allCreators, profili: me.coach, revisioni: me.revisore },
      generated_at: squadra.generated_at,
      stale: isSquadraStale(squadra, now),
      months: squadra.months,
      names_missing: !namesOk,
      quadro,
      reviews: reviews.filter(seeReview),
      exceptions: exceptions.filter((e) => allow(e.profile) || visibleKeys.has(e.key)).map((e) => ({ ...e, active: isExceptionActive(e, now) })),
      roundtables: roundtables.filter((r) => allow(r.profile)).slice(0, 200),
    });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: 500 });
  }
}

export async function POST(request) {
  const ctx = await context();
  if (!ctx.me) return Response.json({ error: ctx.az.message }, { status: ctx.az.status });
  const { az, me, allow } = ctx;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  const by = await actorName(az.userId);
  const now = Date.now();
  const fail = (error, status = 400) => Response.json({ error }, { status });

  try {
    if (body?.action === "review.open") {
      if (!me.revisore) return fail("Le revisioni le apre il revisore qualità.", 403);
      const squadra = await getSquadraData();
      const row = (squadra?.rows || []).find((r) => nameKey(r.name) === nameKey(body.operator));
      if (!row) return fail("Operatore non trovato nei dati della Squadra.");
      const open = (await listReviews()).find((r) => r.key === nameKey(row.name) && r.fase !== "chiusa");
      if (open) return fail("C'è già una revisione aperta per questa persona.", 409);
      const { names } = await pageNames();
      const prof = primaryProfile(row.crs, names);
      const res = newReview({ operator: row.name, profile: prof?.name, trigger: { idx: row.idx, m2: row.m2, m1: row.m1, months: squadra.months ? [squadra.months.m2, squadra.months.m1] : null }, by, now });
      if (!res.ok) return fail(res.error);
      await saveReview({ ...res.review, opened_by_id: az.userId });
      return Response.json({ ok: true, review: res.review });
    }

    if (body?.action === "review.step") {
      if (!me.revisore) return fail("Le revisioni le porta avanti il revisore qualità.", 403);
      const cur = await getReview(body.id);
      const res = applyReviewStep(cur, String(body.step || ""), body.payload || {}, { by, now });
      if (!res.ok) return fail(res.error);
      await saveReview(res.review);
      return Response.json({ ok: true, review: res.review });
    }

    if (body?.action === "exception.add") {
      const res = newException({ operator: body.operator, profile: body.profile, motivo: body.motivo, giorni: body.giorni, by, now });
      if (!res.ok) return fail(res.error);
      if (!(me.admin || (me.coach && allow(res.exception.profile)))) return fail("Puoi scrivere eccezioni solo sui tuoi profili.", 403);
      const dup = (await listExceptions()).find((e) => e.key === res.exception.key && isExceptionActive(e, now));
      if (dup) return fail("Per questa persona c'è già un'eccezione attiva.", 409);
      await saveException({ ...res.exception, by_id: az.userId });
      return Response.json({ ok: true, exception: res.exception });
    }

    if (body?.action === "exception.end") {
      const cur = await getException(body.id);
      if (!cur) return fail("Eccezione non trovata.", 404);
      if (!(me.admin || (me.coach && allow(cur.profile)))) return fail("Puoi chiudere solo le eccezioni dei tuoi profili.", 403);
      if (cur.ended_at) return Response.json({ ok: true, exception: cur });
      const next = { ...cur, ended_at: new Date(now).toISOString(), ended_by: by };
      await saveException(next);
      return Response.json({ ok: true, exception: next });
    }

    if (body?.action === "roundtable.add") {
      const res = newRoundtable({ profile: body.profile, presenti: body.presenti, visto: body.visto, prova: body.prova, by, now });
      if (!res.ok) return fail(res.error);
      if (!(me.admin || (me.coach && allow(res.roundtable.profile)))) return fail("Puoi scrivere la roundtable solo dei tuoi profili.", 403);
      await saveRoundtable({ ...res.roundtable, by_id: az.userId });
      return Response.json({ ok: true, roundtable: res.roundtable });
    }
  } catch (e) {
    return fail(e.message || "Salvataggio fallito", 500);
  }
  return fail("Azione non prevista.");
}
