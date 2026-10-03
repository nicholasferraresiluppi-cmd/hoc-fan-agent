"use client";

/**
 * Pagine di accesso nello stile "Casa" (03/10/2026, richiesta Nicholas: "più
 * premium, valore percepito"). Sempre scure, a prescindere dal tema scelto in
 * app: è la porta d'ingresso. Palette CP_NOTTE applicata solo qui via --cp-*
 * (stesso metodo del modulo HR), caratteri Instrument Serif + Manrope.
 */
import BrandLockup from "@/components/BrandLockup";
import { CP_NOTTE } from "@/lib/brand";

const VARS = Object.fromEntries(Object.entries(CP_NOTTE).map(([k, v]) => [`--cp-${k}`, v]));
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
const IVORY = "#f2eee6";
const GOLD = "#d9b46a";

const CSS = `
.auth-wrap{min-height:100vh;display:grid;grid-template-columns:1fr;align-items:center;gap:40px;padding:48px 20px;box-sizing:border-box;max-width:1080px;margin:0 auto}
@media (min-width:900px){.auth-wrap{grid-template-columns:1.1fr 1fr;gap:72px;padding:48px 40px}}
.auth-copy{display:grid;gap:22px}
@media (max-width:899px){.auth-copy{text-align:center;justify-items:center}.auth-lead{display:none}}
.auth-fade{animation:authFade .6s ease both}
@keyframes authFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.auth-fade{animation:none}}
.auth-copy span,.auth-copy p,.auth-copy h1{font-family:inherit}
`;

// Aspetto del componente Clerk dentro questa pagina (sovrascrive quello globale del layout)
export const AUTH_APPEARANCE = {
  variables: {
    colorPrimary: IVORY,
    colorTextOnPrimaryBackground: "#0b0c10",
    colorBackground: "#111116",
    colorText: IVORY,
    colorTextSecondary: "rgba(242,238,230,.62)",
    colorInputBackground: "rgba(242,238,230,.04)",
    colorInputText: IVORY,
    colorNeutral: IVORY,
    colorDanger: "#f08a8a",
    borderRadius: "12px",
    fontFamily: SANS,
    fontSize: "15px",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: { boxShadow: "0 40px 80px rgba(0,0,0,.45)", border: "1px solid rgba(217,180,106,.22)", borderRadius: 20, width: "100%", maxWidth: 420 },
    card: { background: "linear-gradient(160deg,#16151b 0%,#101014 60%,#17140f 100%)", boxShadow: "none", padding: "36px 32px" },
    headerTitle: { fontFamily: SERIF, fontWeight: 400, fontSize: 32, letterSpacing: "-0.01em", color: IVORY },
    headerSubtitle: { color: "rgba(242,238,230,.55)", fontSize: 14 },
    socialButtonsBlockButton: { background: "transparent", border: "1px solid rgba(242,238,230,.18)", height: 46, borderRadius: 999, color: IVORY },
    socialButtonsBlockButtonText: { color: IVORY, fontWeight: 500 },
    dividerLine: { background: "rgba(242,238,230,.12)" },
    dividerText: { color: "rgba(242,238,230,.45)" },
    formFieldLabel: { color: "rgba(242,238,230,.7)", fontWeight: 400 },
    formFieldInput: { background: "rgba(242,238,230,.04)", border: "1px solid rgba(242,238,230,.16)", height: 46, color: IVORY },
    formButtonPrimary: { background: IVORY, color: "#0b0c10", height: 48, borderRadius: 999, fontSize: 15, fontWeight: 600, textTransform: "none", boxShadow: "none" },
    footer: { background: "transparent" },
    footerAction: { display: "none" },
    alert: { background: "rgba(240,138,138,.08)", border: "1px solid rgba(240,138,138,.3)" },
    alertText: { color: "#f3b4b4" },
    identityPreview: { background: "rgba(242,238,230,.04)", border: "1px solid rgba(242,238,230,.14)" },
    formResendCodeLink: { color: GOLD },
    otpCodeFieldInput: { border: "1px solid rgba(242,238,230,.2)", color: IVORY },
  },
};

export default function AuthShell({ children }) {
  return (
    <main style={{ ...VARS, colorScheme: "dark", minHeight: "100vh", color: IVORY, fontFamily: SANS,
      background: "radial-gradient(80% 60% at 15% 10%, #1b1910 0%, transparent 60%), radial-gradient(90% 70% at 90% 100%, #15141c 0%, #0b0c10 60%)" }}>
      <style>{CSS}</style>
      <div className="auth-wrap">
        <div className="auth-copy auth-fade">
          <BrandLockup size="lg" />
          <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 1, letterSpacing: "-0.01em" }}>
            La console<br /><span style={{ fontStyle: "italic", color: "rgba(242,238,230,.62)", fontFamily: SERIF }}>della Casa.</span>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD }}>
            <span style={{ width: 28, height: 1, background: GOLD, display: "inline-block" }} />
            <span>Accesso riservato</span>
          </div>
        </div>
        <div className="auth-fade" style={{ animationDelay: ".12s" }}>{children}</div>
      </div>
    </main>
  );
}
