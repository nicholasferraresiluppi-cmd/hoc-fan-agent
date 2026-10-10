// Radar creator — segnala una creator dall'app (SEED). GET = ultime segnalazioni.
import { after } from "next/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getInbox } from "@/lib/scouting-store";
import { queueSignal } from "@/lib/scouting-signal";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ items: (await getInbox()).slice(0, 50) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  if (!String(body.text || "").trim()) return Response.json({ error: "Incolla il link del profilo o del reel." }, { status: 400 });
  const rl = await checkRateLimit("scouting_signal", az.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const { item, work } = await queueSignal({ text: body.text, why: body.why, by: String(body.by || "").slice(0, 80) || null, via: "app" });
  after(work);
  return Response.json({ ok: true, item });
}
