// Studio social — una foto del profilo, dallo spazio privato (permesso social.manage). ?p=<idFoto>
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readPhoto } from "@/lib/studio-telegram";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return new Response(null, { status: az.status });
  const { id } = await params;
  const ph = await readPhoto(id, new URL(request.url).searchParams.get("p"));
  if (!ph) return new Response(null, { status: 404 });
  return new Response(ph.stream, { headers: { "Content-Type": ph.type, "Cache-Control": "private, max-age=600" } });
}
