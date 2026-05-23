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
import { Menu, X } from "lucide-react";
import Sidebar, { SIDEBAR_WIDTH } from "./Sidebar";
import ErrorBoundary from "./ErrorBoundary";
import { CP } from "@/lib/brand";

function isAuthRoute(path) {
  return path.startsWith("/sign-in") || path.startsWith("/sign-up");
}

export default function AppShell({ children }) {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div style={{ minHeight: "100vh", background: CP.bg }}>
      {/* Desktop: sidebar fissa — wrapped in silent ErrorBoundary so a sidebar
          crash never takes down the whole page */}
      {!isMobile && (
        <ErrorBoundary silent label="Sidebar">
          <Sidebar />
        </ErrorBoundary>
      )}

      {/* Mobile: drawer + backdrop */}
      {isMobile && (
        <>
          {/* Mobile header bar */}
          <div style={{
            position: "sticky", top: 0, zIndex: 40,
            background: "#0B0D13",
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

          {mobileOpen && (
            <>
              <div
                onClick={() => setMobileOpen(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 49 }}
              />
              <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50 }}>
                <Sidebar />
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
        </>
      )}

      <main style={{
        marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
        minHeight: "100vh",
        background: CP.bg,
      }}>
        {/* Visible ErrorBoundary around page content so we see the real
            error instead of Next's generic "client-side exception" panel */}
        <ErrorBoundary label="Pagina">
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
