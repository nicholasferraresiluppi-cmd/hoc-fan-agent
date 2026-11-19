// GET /api/admin/schede-numeri/[token]/file?p=… — uno screenshot della scheda (SCOUTING_USE).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readOwnFile } from "@/lib/creator-numeri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SCOUTING_USE);
  if (!az.ok) return new Response("Non autorizzato", { status: az.status });
  const { token } = await props.params;
  const f = await readOwnFile(token, new URL(request.url).searchParams.get("p"));
  if (!f) return new Response("Non trovato", { status: 404 });
  return new Response(f.bytes, { headers: { "Content-Type": f.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
