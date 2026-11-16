// Radar salary — API (16/11/2026). GET = le nostre (magazzino) + quelle aggiunte a mano (Apify).
// POST = modifiche: { action: "add" | "model" | "deleteModel" | "remove" | "move" | "talents" | "refresh" }.
// Vedi src/lib/salary-radar.js.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { authorizeSalaryRadar, fail } from "./auth";
import { getRadar, addAccounts, updateModel, deleteModel, removeAccount, moveAccount, setTalents, loadTalentList, salaryRadarTick, getStore, loadOurRows } from "@/lib/salary-radar";
import { parseHandles, normHandle } from "@/lib/salary-radar-core";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const az = await authorizeSalaryRadar();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const p = new URL(request.url).searchParams;
    const admin = await authorize(CAPABILITIES.SEED);
    const data = await getRadar({ force: p.get("rileggi") === "1" && admin.ok });
    const talentList = admin.ok && p.get("modelle") === "1" ? await loadTalentList().catch(() => []) : undefined;
    return Response.json({ ...data, canAdmin: admin.ok, ...(talentList ? { talentList } : {}) });
  } catch (e) { return fail(e); }
}

/** Gli account che il magazzino segue già come nostri: non si aggiungono a mano (sarebbero doppi). */
async function ourHandles() {
  const store = await getStore();
  const wh = await loadOurRows(store.talents).catch(() => null);
  return new Set((wh?.rows || []).map((r) => normHandle(r.u)));
}

export async function POST(request) {
  const az = await authorizeSalaryRadar();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const by = String(body.by || "").slice(0, 80) || null;
  try {
    switch (body.action) {
      case "add": {
        const rl = await checkRateLimit("scouting_signal", az.userId);
        if (!rl.ok) return tooMany(rl.retryAfter);
        const handles = Array.isArray(body.handles) ? body.handles : parseHandles(body.text);
        const res = await addAccounts({ handles, modelId: body.modelId, newModel: body.newModel, by, ourHandles: await ourHandles() });
        return Response.json({ ok: true, ...res });
      }
      case "model":
        return Response.json({ ok: true, model: await updateModel(body.id, body.patch || {}) });
      case "deleteModel":
        await deleteModel(body.id);
        return Response.json({ ok: true });
      case "remove":
        await removeAccount(body.h);
        return Response.json({ ok: true });
      case "move":
        await moveAccount(body.h, body.modelId);
        return Response.json({ ok: true });
      case "talents": {
        const admin = await authorize(CAPABILITIES.SEED);
        if (!admin.ok) return Response.json({ error: "Solo gli admin scelgono le salary del magazzino." }, { status: 403 });
        return Response.json({ ok: true, talents: await setTalents(body.talents) });
      }
      case "refresh": {
        const admin = await authorize(CAPABILITIES.SEED);
        if (!admin.ok) return Response.json({ error: "Solo gli admin lanciano il giro dei numeri." }, { status: 403 });
        return Response.json({ ok: true, result: await salaryRadarTick({ force: true }) });
      }
      default:
        return Response.json({ error: "Azione non valida." }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}
