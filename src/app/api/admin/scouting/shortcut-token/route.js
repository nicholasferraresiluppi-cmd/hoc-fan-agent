// Radar creator — chiave personale per il Comando rapido "Radar HOC" (SEED).
// La chiave si mostra UNA volta; in KV resta solo il suo hash.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { newShortcutToken } from "@/lib/scouting-signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const token = await newShortcutToken({ userId: az.userId, name: String(body.name || "").slice(0, 80) || null });
  return Response.json({ ok: true, token });
}
