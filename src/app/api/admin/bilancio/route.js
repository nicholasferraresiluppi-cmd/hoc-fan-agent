// Bilancio del mese — API. GET ?date=AAAA-MM-GG → classifica a fine giornata di quel giorno
// (default oggi; &refresh=1 ricalcola). PUT { creator, country, month?, goal?, am?, sm? } → goal e/o
// AM/SM di un account; PUT { groups:[{id,name,slugs}] } → ecosistemi.
//
// GATE (scelta di Nicholas, 16/10/2026): la LETTURA è aperta a chi guida una squadra
// (SCORES_VIEW team|all: sales manager, team lead, admin) e mostra TUTTE le creator, anche a chi
// ne ha assegnata una sola: è la classifica aziendale, serve a creare competizione. Il dettaglio di
// una creator (Revenue e chat, Analisi vendite) resta filtrato per creator assegnate.
// La SCRITTURA (goal, AM/SM, ecosistemi) è solo admin (SEED): sono decisioni, non dati.

export const runtime = "nodejs"; // bigquery-api usa crypto nativo
export const maxDuration = 60;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getBilancio, setPerson, setGroups, bigQueryConfigured, todayUTC } from "@/lib/bilancio";
import { getLiveCreators } from "@/lib/live-creators-store";
import { seesCreator } from "@/lib/live-creators";
import { getCreatorScope } from "@/lib/creator-scope";
import { setGoal } from "@/lib/revenue-pacing";
import { calendarOf, clampDay } from "@/lib/bilancio-core";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (az.scope !== "all" && az.scope !== "team") return Response.json({ error: "Non hai il permesso per vedere il bilancio" }, { status: 403 });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const canEdit = (await authorize(CAPABILITIES.SEED)).ok;
  try {
    const url = new URL(request.url);
    const data = await getBilancio({ date: url.searchParams.get("date"), force: url.searchParams.get("refresh") === "1" });
    // "le tue creator": evidenziate per chi ne ha di assegnate (non per chi vede tutto)
    const scope = await getCreatorScope(az.userId).catch(() => null);
    const mine = scope && !scope.all ? data.creators.filter((c) => seesCreator(scope, c)).map((c) => c.slug) : [];
    return Response.json({ ...data, canEdit, mine });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: "Solo gli admin cambiano goal, AM/SM ed ecosistemi" }, { status: az.status === 401 ? 401 : 403 });
  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Body non valido" }, { status: 400 }); }
  const u = await currentUser().catch(() => null);
  const by = u?.fullName || u?.primaryEmailAddress?.emailAddress || az.userId;
  try {
    if (Array.isArray(body.groups)) {
      const groups = await setGroups(body.groups, by);
      return Response.json({ ok: true, groups });
    }
    const creator = (await getLiveCreators()).find((c) => c.slug === body.creator);
    if (!creator) return Response.json({ error: "Creator non valida" }, { status: 400 });
    if ("goal" in body) {
      // il goal del mese che si sta guardando (anche un mese passato), mai oltre il mese in corso
      const { month } = calendarOf(clampDay(body.date, todayUTC()));
      await setGoal(creator, { country: body.country, month, value: body.goal, by });
    }
    if ("am" in body || "sm" in body) await setPerson(creator, { country: body.country, am: body.am, sm: body.sm }, by);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
