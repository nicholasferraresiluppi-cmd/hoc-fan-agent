// Landing pubblica di un profilo social (Studio social, 16/10/2026): link in bio / storie in evidenza
// → questa pagina → canale Telegram della creator. Pubblica (middleware) e senza chrome (AppShell):
// mostra SOLO ciò che la redazione ha scritto per la landing; non legge né espone altri dati.
// Conta le visite (una per IP all'ora al massimo per indirizzo: chi ricarica non gonfia i numeri).
// Colori fissi di proposito: è la pagina della creator, non un pezzo dell'app.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { landingBySlug, countLanding } from "@/lib/studio-telegram";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Landing({ params }) {
  const { slug } = await params;
  const hit = await landingBySlug(slug);
  if (!hit) notFound();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const bot = /bot|crawler|spider|preview|facebookexternalhit/i.test(h.get("user-agent") || "");
  if (!bot && (await checkRateLimit("landing_visit", `${slug}:${ip}`)).ok) await countLanding(slug, "visit");
  const { landing } = hit;
  return (
    <main style={{ minHeight: "100dvh", background: "#0d0c0b", color: "#f5f1ea", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        {landing.photoId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/l/${landing.slug}/photo`} alt="" style={{ width: 132, height: 132, borderRadius: "50%", objectFit: "cover", display: "block", margin: "0 auto 20px", border: "2px solid #c9a96e" }} />
        )}
        {landing.title && <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px", letterSpacing: 0.2 }}>{landing.title}</h1>}
        {landing.subtitle && <p style={{ fontSize: 16, lineHeight: 1.5, color: "#cfc7ba", margin: "0 0 28px" }}>{landing.subtitle}</p>}
        <a href={`/api/l/${landing.slug}/go`} style={{ display: "block", padding: "16px 20px", background: "#c9a96e", color: "#14110d", borderRadius: 14, fontSize: 17, fontWeight: 600, textDecoration: "none" }}>
          {landing.buttonLabel}
        </a>
      </div>
    </main>
  );
}
