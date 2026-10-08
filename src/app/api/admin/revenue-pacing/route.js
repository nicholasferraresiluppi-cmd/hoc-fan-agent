// Revenue per creator — API. GET ?creator=slug → proiezione + trend + obiettivi (cache 15 min),
// &refresh=1 ricalcolo; PUT { creator, country, month, value } imposta un obiettivo mensile.
// GATE: authorizeLiveCreator (SCORES_VIEW team/all + creator tra le assegnate; admin: tutte).
// Senza permesso sulla creator chiesta risponde 403 con l'elenco di quelle visibili.

export const runtime = "nodejs"; // bigquery-api usa crypto nativo
export const maxDuration = 60;

import { auth, currentUser } from "@clerk/nextjs/server";
import { authorizeLiveCreator } from "@/lib/laura-access";
import { getRevenuePacing, getGoals, setGoal, bigQueryConfigured } from "@/lib/revenue-pacing";

export async function GET(request) {
  const url = new URL(request.url);
  const az = await authorizeLiveCreator(url.searchParams.get("creator"));
  if (!az.ok) return Response.json({ error: az.message, creators: az.visible || [] }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  try {
    const [data, goals] = await Promise.all([getRevenuePacing(az.creator, { force: url.searchParams.get("refresh") === "1" }), getGoals(az.creator)]);
    return Response.json({ ...data, creator: az.creator.slug, creators: az.visible, goals: goals.goals, goals_history: (goals.history || []).slice(0, 10) });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}

export async function PUT(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body non valido" }, { status: 400 });
  }
  const az = await authorizeLiveCreator(body.creator);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { userId } = await auth();
  const u = await currentUser().catch(() => null);
  const by = u?.fullName || u?.primaryEmailAddress?.emailAddress || userId;
  try {
    const out = await setGoal(az.creator, { country: body.country, month: body.month, value: body.value, by });
    return Response.json({ goals: out.goals, goals_history: out.history.slice(0, 10) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
