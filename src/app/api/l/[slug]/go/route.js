// Landing pubblica → conta il clic e porta al link d'invito Telegram scelto dalla redazione.
// Pubblica: la destinazione è solo quella salvata (un t.me/…), mai un parametro della richiesta.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { landingBySlug, countLanding } from "@/lib/studio-telegram";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request, { params }) {
  const { slug } = await params;
  const hit = await landingBySlug(slug);
  if (!hit?.landing?.target) return new Response("Pagina non trovata", { status: 404 });
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if ((await checkRateLimit("landing_click", `${slug}:${ip}`)).ok) await countLanding(slug, "click");
  return Response.redirect(hit.landing.target, 302);
}
