// Editing — la sala (permesso social.manage): una scrivania per creator con le sette tappe.
// Solo dati già in KV (niente Drive, niente magazzino): la sala si apre subito.
export const runtime = "nodejs";
export const maxDuration = 30;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listDesks, loadDesk } from "@/lib/editing";

export async function GET() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const desks = await listDesks();
  const out = await Promise.all(desks.map((d) => loadDesk(d, { live: false }).catch((e) => ({ slug: d.slug, creator: d.creator, profiles: d.profiles, error: e.message }))));
  return Response.json({ desks: out }, { headers: { "Cache-Control": "no-store" } });
}
