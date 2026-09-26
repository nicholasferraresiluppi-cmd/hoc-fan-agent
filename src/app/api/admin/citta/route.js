// La città — API (SEED). GET = città del mese (fotografia ClickUp + dati vivi di HOC Pro + prese in carico);
//   ?month=YYYY-MM per il mese precedente (solo i piani di HOC Pro hanno storico).
// POST = { action: "claim"|"release", tower, area } per prendere in carico un piano, oppure una fotografia nuova.
// GATE: SEED (admin) — nomi di persone, carichi di lavoro e ritardi di tutta l'azienda.
export const runtime = "nodejs";
export const maxDuration = 60;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getCitySnapshot, saveCitySnapshot, getClaims, setClaim } from "@/lib/citta";
import { getCityLive, mergeCityLive, currentMonthId, previousMonthId, monthLabel } from "@/lib/citta-live";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const snap = await getCitySnapshot();
  if (!snap) return Response.json({ projects: [], generated: null });
  const cur = currentMonthId(), prev = previousMonthId(cur);
  const asked = new URL(request.url).searchParams.get("month");
  const month = asked === prev ? prev : cur;
  const months = [{ id: cur, label: monthLabel(cur) }, { id: prev, label: monthLabel(prev) }];
  try {
    const [live, claims] = await Promise.all([getCityLive(month), getClaims()]);
    return Response.json({ ...mergeCityLive(snap, live, { past: month !== cur, claims: month === cur ? claims : {} }), months, month, canClaim: month === cur });
  } catch (e) {
    return Response.json({ ...snap, months, month, live_error: String(e?.message || e) });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 1_000_000) return Response.json({ error: "Fotografia troppo grande (max 1 MB)." }, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  if (body?.action === "claim" || body?.action === "release") {
    if (!body.tower || !body.area) return Response.json({ error: "tower e area richiesti" }, { status: 400 });
    const me = await currentUser().catch(() => null);
    const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.emailAddresses?.[0]?.emailAddress || "Admin";
    const claims = await setClaim(body.tower, body.area, body.action === "claim" ? { name, userId: me?.id } : null);
    return Response.json({ ok: true, claim: claims[`${body.tower}|${body.area}`] || null });
  }
  try {
    const snap = await saveCitySnapshot(body);
    return Response.json({ ok: true, generated: snap.generated, projects: snap.projects.length });
  } catch (e) {
    return Response.json({ error: e?.message || "Fotografia non valida." }, { status: 400 });
  }
}
