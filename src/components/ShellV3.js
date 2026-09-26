"use client";

/**
 * Guscio dello stile v3 (anteprima, 26/09/2026) — reso SOLO se useStyle()==="v3"
 * (vedi AppShell). Nello stile attuale non esiste: zero pixel cambiati.
 *
 *   V3TopBar      — desktop: barra sottile sopra il contenuto (Cerca ⌘K + Stato dati)
 *   V3MobileHeader — telefono: simbolo + ricerca + stato (icona) + menu
 *   V3TabBar      — telefono: barra in basso con 4 voci per ruolo + "Altro" (drawer)
 *
 * Visibilità desktop/telefono decisa dal CSS (globals.css, classi hoc-v3-*),
 * come il resto del guscio: niente salto dopo l'idratazione.
 */
import Link from "next/link";
import useSWR from "swr";
import { Search, Menu, Home, Gauge, Wallet, Compass, MoreHorizontal, LayoutDashboard, Trophy, Target } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { canSee } from "@/lib/nav-access";
import DataStatus from "./DataStatus";

const silentFetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

function isMac() {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
}

export function V3TopBar({ onSearch }) {
  const mod = isMac() ? "⌘" : "Ctrl";
  const kbd = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 4, boxShadow: `0 0 0 1px ${CP.border} inset`, fontSize: 10.5, color: CP.textMuted };
  return (
    <div className="hoc-v3-top" style={{ alignItems: "center", justifyContent: "flex-end", gap: 8, height: 52, padding: "0 24px", fontFamily: FONTS.body }}>
      <button type="button" className="hoc-v3-btn" onClick={onSearch} aria-label="Cerca una pagina" aria-keyshortcuts="Meta+K Control+K"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 8px 0 10px", borderRadius: 9, border: "none", boxShadow: `0 0 0 1px ${CP.border} inset`, background: CP.surface, color: CP.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: FONTS.body }}>
        <Search size={14} aria-hidden="true" />
        <span>Cerca</span>
        <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }} aria-hidden="true"><span style={kbd}>{mod}</span><span style={kbd}>K</span></span>
      </button>
      <DataStatus />
    </div>
  );
}

export function V3MobileHeader({ onSearch, onMenu }) {
  const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 12, border: "none", background: "transparent", color: CP.textPrimary, cursor: "pointer" };
  return (
    <div className="hoc-v3-mhead" style={{
      position: "sticky", top: 0, zIndex: 40, alignItems: "center", gap: 4,
      paddingTop: "env(safe-area-inset-top)", paddingLeft: 12, paddingRight: 8, minHeight: 56,
      background: CP.bg, borderBottom: `1px solid ${CP.border}`,
    }}>
      <Link href="/welcome" aria-label="HOC Pro, pagina iniziale" className="hoc-v3-btn" style={{ ...iconBtn, marginRight: "auto" }}>
        <img src="/hoc-logo.svg" alt="" style={{ height: 26, width: "auto", filter: CP.logoFilter, display: "block" }} />
      </Link>
      <button type="button" className="hoc-v3-btn" onClick={onSearch} aria-label="Cerca una pagina" style={iconBtn}><Search size={20} /></button>
      <DataStatus compact />
      <button type="button" className="hoc-v3-btn" onClick={onMenu} aria-label="Apri menu" style={iconBtn}><Menu size={22} /></button>
    </div>
  );
}

const OPERATOR_TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/me/score", label: "I miei score", icon: Gauge },
  { href: "/me/compenso", label: "Compenso", icon: Wallet },
  { href: "/me/percorso", label: "Percorso", icon: Compass },
];
const ADMIN_TABS = [
  { href: "/admin", label: "Hub", icon: LayoutDashboard },
  { href: "/leaderboard/sales-cp", label: "Classifica", icon: Trophy },
  { href: "/admin/action-center", label: "Action Center", icon: Target },
  { href: "/admin/pnl-live", label: "P&L", icon: Wallet },
];

/** Voce attiva = il prefisso più lungo tra le voci della barra ("/" solo esatto). */
function activeHref(pathname, tabs) {
  let best = null;
  for (const t of tabs) {
    const hit = t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(t.href + "/");
    if (hit && (!best || t.href.length > best.length)) best = t.href;
  }
  return best;
}

export function V3TabBar({ pathname, onMore, moreOpen }) {
  const { data: me } = useSWR("/api/whoami", silentFetcher, { revalidateOnFocus: false });
  const caps = me?.capabilities;
  const isAdmin = !!me?.admin;
  // Chi guarda i dati di tutta l'org (Hub) ha la barra "manager", gli altri quella personale
  const manager = me?.authenticated && canSee("/admin", caps, isAdmin);
  const tabs = manager ? ADMIN_TABS.filter((t) => canSee(t.href, caps, isAdmin)) : OPERATOR_TABS;
  const cur = activeHref(pathname, tabs);

  const item = (active) => ({
    minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
    fontSize: 11.5, fontWeight: 500, color: active ? CP.textPrimary : CP.textMuted, textDecoration: "none",
    border: "none", background: "none", borderRadius: 12, padding: 0, cursor: "pointer", fontFamily: FONTS.body, minWidth: 0,
  });
  const pill = (active) => ({
    width: 56, height: 30, borderRadius: 15, display: "grid", placeItems: "center",
    background: active ? CP.accentSoft : "transparent", color: active ? CP.accentSoftText : "inherit",
  });
  const labelStyle = { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" };

  return (
    <nav aria-label="Navigazione principale" className="hoc-v3-tabbar" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45,
      gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
      padding: "6px 6px calc(6px + env(safe-area-inset-bottom))",
      background: CP.bg, borderTop: `1px solid ${CP.border}`,
    }}>
      {tabs.map((t) => {
        const active = cur === t.href;
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href} className="hoc-v3-tab" aria-current={active ? "page" : undefined} style={item(active)}>
            <span style={pill(active)}><Icon size={20} strokeWidth={1.9} aria-hidden="true" /></span>
            <span style={labelStyle}>{t.label}</span>
          </Link>
        );
      })}
      <button type="button" className="hoc-v3-tab" onClick={onMore} aria-expanded={!!moreOpen} aria-label="Altro: apri il menu completo" style={item(false)}>
        <span style={pill(false)}><MoreHorizontal size={20} strokeWidth={1.9} aria-hidden="true" /></span>
        <span style={labelStyle}>Altro</span>
      </button>
    </nav>
  );
}
