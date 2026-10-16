// Landing pubblica → la SOLA foto scelta per la landing (le altre foto del profilo restano private).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { landingBySlug, readPhoto } from "@/lib/studio-telegram";

export async function GET(request, { params }) {
  const { slug } = await params;
  const hit = await landingBySlug(slug);
  if (!hit?.landing?.photoId) return new Response(null, { status: 404 });
  const ph = await readPhoto(hit.pid, hit.landing.photoId);
  if (!ph) return new Response(null, { status: 404 });
  return new Response(ph.stream, { headers: { "Content-Type": ph.type, "Cache-Control": "public, max-age=3600" } });
}
