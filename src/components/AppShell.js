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
import PageTabs from "@/components/PageTabs";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { UserButton } from "@clerk/nextjs";
import { pathAllowed } from "@/lib/restricted-roles";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Menu, X } from "lucide-react";
import Sidebar, { NAV_ITEMS } from "./Sidebar";
import { groupMatch } from "@/lib/page-groups";
import SidebarCasa from "./SidebarCasa";
import ErrorBoundary from "./ErrorBoundary";
import WelcomeAttestato from "./WelcomeAttestato";
import { SecurityBanner, FeedbackButton, ViewAsBanner, CreatorsBanner } from "./AppHelpers";
import { CP } from "@/lib/brand";
import { uxPageChange } from "@/lib/ux-client";
import { useStyle } from "@/lib/theme-client";
import { V3TopBar, V3MobileHeader, V3TabBar } from "./ShellV3";
import VetroScope, { useVetro, isVetroPath } from "./VetroScope";

// Command bar (stile v3): scaricata solo alla prima apertura
const CommandBar = dynamic(() => import("./CommandBar"), { ssr: false });

function isAuthRoute(path) {
  return path.startsWith("/sign-in") || path.startsWith("/sign-up");
}

// Superfici full-screen SENZA chrome interno (sidebar/nav): l'assessment
// candidati è rivolto a persone ESTERNE (non dipendenti Clerk) → mai esporre
// la navigazione interna dell'app. Stesso motivo per il modulo HR da link
// (/hr/modulo/[token]): lo compila chi magari non ha ancora un account.
function isBareRoute(path) {
  return path.startsWith("/assessment") || path.startsWith("/hr/modulo") || path.startsWith("/t/") || path.startsWith("/l/") || path === "/hr/privacy" || path === "/privacy";
}

// Nome della pagina nell'intestazione del telefono (10/10/2026: con «HOC Pro» fisso
// non si capiva dove si era). Prima la scheda del gruppo, poi la voce di menu più lunga che combacia.
function mobileTitle(pathname) {
  const p = String(pathname || "").replace(/\/$/, "") || "/";
  const m = groupMatch(p);
  const tab = m?.group.tabs.find(([h]) => h.replace(":e", m.param || "") === p);
  if (tab) return tab[1];
  let best = null;
  for (const it of NAV_ITEMS) {
    if (p === it.href || (it.href !== "/" && p.startsWith(it.href + "/"))) if (!best || it.href.length > best.href.length) best = it;
  }
  return best?.label || (m?.group.label) || "HOC Pro";
}

const whoFetcher = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/**
 * Guscio di chi ha un ruolo ristretto (lib/restricted-roles, es. "Social"): niente menu, niente
 * hub, solo il nome dell'app, la pagina e l'account. Le altre pagine riportano alla sua.
 */
const RESTRICTED_PAGE_LABEL = { "/admin/scouting": "Radar creator", "/admin/studio-social": "Studio social", "/admin/supervisor": "Account social", "/admin/warmup": "Social", "/admin/hr": "Persone", "/admin/hr/contratti": "Contratti", "/admin/referral": "Porta un amico", "/me/porta-un-amico": "Porta un amico", "/contabilita": "Contabilità" };

function RestrictedShell({ restriction, allowed, children, pathname }) {
  // badge sulle schede (27/10/2026): l'HR col menu ridotto vede qui i premi di «Porta un amico» da pagare
  const hasRef = restriction.paths.includes("/admin/referral");
  const { data: refInbox } = useSWR(hasRef ? "/api/admin/referral/inbox" : null, (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null), { revalidateOnFocus: false, refreshInterval: 10 * 60 * 1000 });
  const badge = { "/admin/referral": refInbox?.count || 0 };
  return (
    <div className="hoc-root" style={{ minHeight: "100vh", background: CP.bg }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", background: CP.bgSunken, borderBottom: `1px solid ${CP.border}` }}>
        <a href={restriction.home} style={{ color: CP.textPrimary, textDecoration: "none", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }}>House of Creators</a>
        {/* più pagine (es. SMM: Radar + Account social) → una scheda per pagina; una sola → solo il nome */}
        {restriction.paths.length > 1 ? (
          <nav data-restricted-tabs="" style={{ display: "flex", gap: 18, overflowX: "auto", minWidth: 0, alignSelf: "stretch", alignItems: "flex-end" }}>
            {restriction.paths.map((p, _i, all) => {
              // scheda accesa = la pagina più specifica che contiene l'indirizzo (/admin/hr/contratti non accende anche «Persone»)
              const hits = all.filter((x) => pathname === x || pathname.startsWith(x + "/"));
              const on = hits.length > 0 && hits.reduce((a, b) => (b.length > a.length ? b : a)) === p;
              return <a key={p} href={p} aria-current={on ? "page" : undefined} style={{ fontSize: 14, padding: "6px 0 8px", textDecoration: "none", whiteSpace: "nowrap", borderBottom: `2px solid ${on ? CP.accent : "transparent"}`, fontWeight: on ? 500 : 400, color: on ? CP.textPrimary : CP.textSecondary }}>{RESTRICTED_PAGE_LABEL[p] || p}{badge[p] > 0 && <span aria-label={`${badge[p]} cose da fare`} style={{ marginLeft: 6, minWidth: 18, padding: "0 6px", borderRadius: 9, background: CP.accent, color: CP.accentInk, fontSize: 11, fontWeight: 600, display: "inline-block", textAlign: "center", lineHeight: "18px" }}>{badge[p]}</span>}</a>;
            })}
          </nav>
        ) : <span style={{ color: CP.textMuted, fontSize: 15 }}>· {restriction.label}</span>}
        <span style={{ flex: 1 }} />
        <UserButton afterSignOutUrl="/sign-in" />
      </header>
      <main>
        <ErrorBoundary label="Pagina">{allowed ? children : null}</ErrorBoundary>
      </main>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  // Ruolo ristretto: la stessa risposta di /api/whoami che usano già menu e banner (SWR la condivide)
  const { data: me } = useSWR(isAuthRoute(pathname) || isBareRoute(pathname) ? null : "/api/whoami", whoFetcher, { revalidateOnFocus: false });
  const restriction = me?.restricted || null;
  const allowedHere = pathAllowed(restriction, pathname);
  useEffect(() => {
    if (restriction && !allowedHere) router.replace(restriction.home);
  }, [restriction, allowedHere, router]);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Stile v3 in anteprima: guscio nuovo (barra ⌘K + stato dati, barra da telefono).
  // Senza data-style="v3" nulla di questo viene reso.
  const [style] = useStyle();
  const v3 = style === "v3";
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdLoaded, setCmdLoaded] = useState(false);
  const openCmd = () => { setCmdLoaded(true); setCmdOpen(true); setMobileOpen(false); };
  // Stile vetro in prova (VetroScope): sulle sue pagine avvolge anche menu, avvisi e schede in alto
  const [vetro] = useVetro();
  const vetroShell = vetro && isVetroPath(pathname);

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

  if (restriction) {
    return <RestrictedShell restriction={restriction} allowed={allowedHere} pathname={pathname}>{children}</RestrictedShell>;
  }

  return (
    <VetroScope on={vetroShell} stable>
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
            <div style={{ color: CP.textPrimary, fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" }}>{mobileTitle(pathname)}</div>
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
        <ErrorBoundary silent label="CreatorsBanner">
          <CreatorsBanner />
        </ErrorBoundary>
        <ErrorBoundary silent label="SecurityBanner">
          <SecurityBanner />
        </ErrorBoundary>
        <ErrorBoundary silent label="PageTabs">
          <PageTabs pathname={pathname} />
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

      {/* Modale primo-accesso (OnboardingNudge) tolta il 10/10/2026: copriva la prima
          schermata e veniva chiusa senza leggerla. La guida per ruolo resta in /guida. */}

      {/* Attestato di benvenuto: primo accesso da invito operatore, sopra il resto */}
      <ErrorBoundary silent label="WelcomeAttestato">
        <WelcomeAttestato />
      </ErrorBoundary>
    </div>
    </VetroScope>
  );
}
