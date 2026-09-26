"use client";

/**
 * AppShell — Wrapper layout globale stile CP.
 *
 * Renderizza:
 *   - Sidebar fissa a sx (240px) su tutte le pagine app
 *   - Main content scrollabile a dx con `marginLeft` per non sovrapporsi
 *
 * Si auto-nasconde su:
 *   - /sign-in, /sign-up (Clerk full-screen)
 *
 * Su mobile (<900px) la sidebar diventa drawer toggleable da hamburger button.
 */
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import SidebarCasa from "./SidebarCasa";
import ErrorBoundary from "./ErrorBoundary";
import OnboardingNudge from "./OnboardingNudge";
import WelcomeAttestato from "./WelcomeAttestato";
import { SecurityBanner, FeedbackButton, ViewAsBanner } from "./AppHelpers";
import { CP } from "@/lib/brand";
import { uxPageChange } from "@/lib/ux-client";
import { useStyle } from "@/lib/theme-client";
import { V3TopBar, V3MobileHeader, V3TabBar } from "./ShellV3";

// Command bar (stile v3): scaricata solo alla prima apertura
const CommandBar = dynamic(() => import("./CommandBar"), { ssr: false });

function isAuthRoute(path) {
  return path.startsWith("/sign-in") || path.startsWith("/sign-up");
}

// Superfici full-screen SENZA chrome interno (sidebar/nav): l'assessment
// candidati è rivolto a persone ESTERNE (non dipendenti Clerk) → mai esporre
// la navigazione interna dell'app.
function isBareRoute(path) {
  return path.startsWith("/assessment") || path === "/privacy";
}

export default function AppShell({ children }) {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Stile v3 in anteprima: guscio nuovo (barra ⌘K + stato dati, barra da telefono).
  // Senza data-style="v3" nulla di questo viene reso.
  const [style] = useStyle();
  const v3 = style === "v3";
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdLoaded, setCmdLoaded] = useState(false);
  const openCmd = () => { setCmdLoaded(true); setCmdOpen(true); setMobileOpen(false); };

  // ⌘K / Ctrl+K globale, solo nello stile v3
  useEffect(() => {
    if (!v3) { setCmdOpen(false); return; }
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        setCmdLoaded(true);
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v3]);

  // Esc chiude il drawer da telefono (solo v3: lo stile attuale resta com'è)
  useEffect(() => {
    if (!mobileOpen || !v3) return;
    const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, v3]);
  // Desktop/telefono deciso dal CSS (classi hoc-desk / hoc-mob / hoc-main in
  // globals.css), non da JS dopo l'idratazione: prima il telefono disegnava il
  // layout desktop (sidebar + margine 248px) e poi saltava (revisione 26/09).

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Analytics d'uso (/admin/utilizzo): una riga per pagina aperta — solo
  // persona+pagina+giorno. sendBeacon non blocca la navigazione.
  useEffect(() => {
    if (!pathname || isAuthRoute(pathname) || isBareRoute(pathname)) return;
    try {
      const body = JSON.stringify({ path: pathname });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      else fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {}
    try { uxPageChange(pathname); } catch {}
  }, [pathname]);

  if (isAuthRoute(pathname) || isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="hoc-root" style={{ minHeight: "100vh", background: CP.bg }}>
      {/* Desktop: sidebar fissa — wrapped in silent ErrorBoundary */}
      <div className="hoc-desk">
        <ErrorBoundary silent label="Sidebar">
          {v3 ? <SidebarCasa /> : <Sidebar />}
        </ErrorBoundary>
      </div>

      {/* Mobile: drawer + backdrop */}
      <div className="hoc-mob">
          {/* Mobile header bar (stile attuale; nascosta dal CSS sotto v3) */}
          <div className="hoc-mhead-v2" style={{
            position: "sticky", top: 0, zIndex: 40,
            background: CP.bgSunken,
            borderBottom: `1px solid ${CP.border}`,
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Apri menu"
              style={{ background: "transparent", border: "none", color: CP.textPrimary, cursor: "pointer", padding: 6 }}
            >
              <Menu size={22} />
            </button>
            <div style={{ color: CP.textPrimary, fontWeight: 700, fontSize: 14 }}>HOC Pro</div>
            <div style={{ width: 22 }} />
          </div>

          {v3 && <ErrorBoundary silent label="V3MobileHeader"><V3MobileHeader onSearch={openCmd} onMenu={() => setMobileOpen(true)} /></ErrorBoundary>}

          {mobileOpen && (
            <>
              <div
                onClick={() => setMobileOpen(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 49 }}
              />
              <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50 }}>
                {v3 ? <SidebarCasa /> : <Sidebar />}
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Chiudi menu"
                  style={{ position: "absolute", top: 14, right: -36, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, cursor: "pointer", padding: 6 }}
                >
                  <X size={18} />
                </button>
              </div>
            </>
          )}
          {v3 && <ErrorBoundary silent label="V3TabBar"><V3TabBar pathname={pathname} onMore={() => setMobileOpen(true)} moreOpen={mobileOpen} /></ErrorBoundary>}
      </div>

      <main className="hoc-main" style={{
        minHeight: "100vh",
        background: CP.bg,
      }}>
        {v3 && (
          <ErrorBoundary silent label="V3TopBar">
            <V3TopBar onSearch={openCmd} />
          </ErrorBoundary>
        )}
        <ErrorBoundary silent label="ViewAsBanner">
          <ViewAsBanner />
        </ErrorBoundary>
        <ErrorBoundary silent label="SecurityBanner">
          <SecurityBanner />
        </ErrorBoundary>
        <ErrorBoundary label="Pagina">
          {/* Stile Casa: la chiave per pagina fa ripartire l'entrata in scena a ogni navigazione */}
          {v3 ? <div className="casa-page" key={pathname}>{children}</div> : children}
        </ErrorBoundary>
      </main>

      {v3 && cmdLoaded && (
        <ErrorBoundary silent label="CommandBar">
          <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} />
        </ErrorBoundary>
      )}

      <ErrorBoundary silent label="FeedbackButton">
        <FeedbackButton />
      </ErrorBoundary>

      {/* Onboarding: modale primo-accesso col funnel di strumenti per ruolo */}
      <ErrorBoundary silent label="OnboardingNudge">
        <OnboardingNudge />
      </ErrorBoundary>

      {/* Attestato di benvenuto: primo accesso da invito operatore, sopra il resto */}
      <ErrorBoundary silent label="WelcomeAttestato">
        <WelcomeAttestato />
      </ErrorBoundary>
    </div>
  );
}
