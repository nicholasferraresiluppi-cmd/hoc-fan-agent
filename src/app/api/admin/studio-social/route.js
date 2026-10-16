// Studio social — elenco profili (permesso social.manage: admin, ruoli "Social" e "Social Media Manager").
//
// GET  → { profiles: [{ ...profilo, counts, next }], today }
// POST → crea/modifica un profilo (body = campi del profilo; con id = modifica)
export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { listProfiles, saveProfile, listItems } from "@/lib/studio-social";
import { countsByStatus, nextUp, romeToday } from "@/lib/studio-social-core";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const today = romeToday();
  const profiles = await listProfiles();
  const withCounts = await Promise.all(
    profiles.map(async (p) => {
      const items = await listItems(p.id);
      return { ...p, counts: countsByStatus(items), next: nextUp(items, today) };
    })
  );
  withCounts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return Response.json({ profiles: withCounts, today }, noStore);
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  const res = await saveProfile(body, az.userId);
  if (!res.ok) return Response.json({ error: res.errors.join(". ") }, { status: 400 });
  await logAuditAction({ action: body?.id ? "studio.profile.update" : "studio.profile.add", target: res.profile.id, by: az.userId, meta: { handle: res.profile.handle } });
  return Response.json({ ok: true, profile: res.profile }, noStore);
}
