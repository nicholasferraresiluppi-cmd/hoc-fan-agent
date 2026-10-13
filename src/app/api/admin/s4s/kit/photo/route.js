// S4S — una foto del kit, dallo spazio privato. Solo per chi ha accesso al calendario S4S.
// ?c=<creatorId>&p=<idFoto>[&dl=1 per scaricarla]
import { authorizeScoped } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { readPhoto } from "@/lib/s4s-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return new Response(null, { status: az.status });
  const u = new URL(request.url);
  const ph = await readPhoto(u.searchParams.get("c"), u.searchParams.get("p"));
  if (!ph) return new Response(null, { status: 404 });
  const headers = { "Content-Type": ph.type, "Cache-Control": "private, max-age=86400" };
  if (u.searchParams.get("dl")) headers["Content-Disposition"] = `attachment; filename="${ph.name}"`;
  return new Response(ph.stream, { headers });
}
