// Revenue Laura — API. GET = proiezione + trend + obiettivi (cache 15 min),
// GET ?refresh=1 = ricalcolo, PUT = imposta l'obiettivo di un mese per un paese.
// GATE: come le pagine di squadra (Classifica vendite, Creator): capability
// SCORES_VIEW con scope team o all, POI il filtro per creator — vede chi ha
// Laura tra le creator assegnate (admin: tutto). Operatori → 403.

export const runtime = "nodejs"; // bigquery-api usa crypto nativo
export const maxDuration = 60;

import { auth, currentUser } from "@clerk/nextjs/server";
import { authorizeLaura } from "@/lib/laura-access";
import { getRevenuePacing, getGoals, setGoal, bigQueryConfigured } from "@/lib/revenue-pacing";

const gate = authorizeLaura;

export async function GET(request) {
  const az = await gate();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const [data, goals] = await Promise.all([getRevenuePacing({ force }), getGoals()]);
    return Response.json({ ...data, goals: goals.goals, goals_history: (goals.history || []).slice(0, 10) });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}

export async function PUT(request) {
  const az = await gate();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body non valido" }, { status: 400 });
  }
  const { userId } = await auth();
  const u = await currentUser().catch(() => null);
  const by = u?.fullName || u?.primaryEmailAddress?.emailAddress || userId;
  try {
    const out = await setGoal({ country: body.country, month: body.month, value: body.value, by });
    return Response.json({ goals: out.goals, goals_history: out.history.slice(0, 10) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
