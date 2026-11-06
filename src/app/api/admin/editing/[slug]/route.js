// Editing — una scrivania (permesso social.manage): le sette tappe, la riga «Adesso», cosa rifare e i tempi.
// Qui il Banco si rilegge se vecchio e le misure si calcolano se mancano.
export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listDesks, loadDesk } from "@/lib/editing";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { slug } = await params;
  const desk = (await listDesks()).find((d) => d.slug === slug);
  if (!desk) return Response.json({ error: "Scrivania non trovata" }, { status: 404 });
  return Response.json(await loadDesk(desk, { live: true }), { headers: { "Cache-Control": "no-store" } });
}
