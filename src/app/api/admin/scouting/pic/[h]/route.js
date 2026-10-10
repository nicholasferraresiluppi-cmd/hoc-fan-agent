// Radar creator — foto profilo salvata di un account (SEED). Privata: solo chi usa il radar.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readPic } from "@/lib/scouting-pics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return new Response(null, { status: az.status });
  const { h } = await params;
  const pic = await readPic(h);
  if (!pic) return new Response(null, { status: 404 });
  // ?v= cambia quando la foto cambia: la cache del browser può tenerla a lungo
  return new Response(pic.stream, { headers: { "Content-Type": pic.type, "Cache-Control": "private, max-age=2592000, immutable" } });
}
