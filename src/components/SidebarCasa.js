"use client";

/**
 * Menu dello stile "Casa" (v3, anteprima admin — 26/09/2026 notte).
 *
 * Una decina di voci per ruolo, poi "Tutti gli strumenti" che apre l'elenco
 * completo (stessi gruppi e stessi permessi del menu classico: NAV_GROUPS +
 * nav-access). Niente icone, niente riquadri: testo, linea oro sulla voce attiva.
 * Nello stile attuale non viene mai reso (vedi AppShell).
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { UserButton, SignedIn } from "@clerk/nextjs";
import { canSee } from "@/lib/nav-access";
import { useStyle } from "@/lib/theme-client";
import { NAV_GROUPS, SIDEBAR_WIDTH } from "./Sidebar";

const silentFetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

// Chi vede i dati di tutta l'agenzia (Hub) ha il menu "agenzia"; gli altri quello personale.
const MANAGER = [
  { title: null, items: [
    { href: "/admin", label: "Oggi", exact: true },
    { href: "/admin/alerts", label: "Alert", badge: true },
  ] },
  { title: "Agenzia", items: [
    { href: "/leaderboard/sales-cp", label: "Classifica vendite" },
    { href: "/leaderboard/creators", label: "Creator" },
    { href: "/admin/action-center", label: "Action Center" },
    { href: "/admin/sales-coaching", label: "Coaching vendite" },
    { href: "/admin/pnl-live", label: "P&L" },
  ] },
  { title: "Il mio quadro", items: [
    { href: "/me/score", label: "I miei score" },
    { href: "/me/compenso", label: "Il mio compenso" },
    { href: "/me/percorso", label: "Il mio percorso" },
  ] },
];
const OPERATOR = [
  { title: null, items: [
    { href: "/me/turno", label: "Oggi" },
  ] },
  { title: "Il mio quadro", items: [
    { href: "/me/score", label: "I miei score" },
    { href: "/me/compenso", label: "Il mio compenso" },
    { href: "/me/percorso", label: "Il mio percorso" },
    { href: "/me/coaching", label: "Il mio coaching" },
    { href: "/profilo", label: "Il mio profilo" },
  ] },
  { title: "Allenamento", items: [
    { href: "/", label: "Simulatore", exact: true },
    { href: "/academy/vendere", label: "Come si vende" },
  ] },
];

const TOOLS_KEY = "hoc:casa:tools";

function dateLabel() {
  try {
    return new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

export default function SidebarCasa() {
  const pathname = usePathname() || "";
  const { data: me } = useSWR("/api/whoami", silentFetcher, { revalidateOnFocus: false });
  const { data: alerts } = useSWR("/api/admin/ops-alerts", silentFetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60 * 1000 });
  const [style, setStyle] = useStyle();
  const [tools, setTools] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(dateLabel());
    try { setTools(localStorage.getItem(TOOLS_KEY) === "1"); } catch {}
  }, []);
  const toggleTools = () => setTools((t) => {
    try { localStorage.setItem(TOOLS_KEY, t ? "0" : "1"); } catch {}
    return !t;
  });

  const allowed = (href) => !me?.authenticated || canSee(href, me.capabilities, me.admin);
  const manager = me?.authenticated && canSee("/admin", me.capabilities, me.admin);
  const sections = (manager ? MANAGER : OPERATOR)
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(i.href)) }))
    .filter((s) => s.items.length);
  const openAlerts = (alerts?.alerts || []).filter((a) => a.status !== "resolved").length;
  const isActive = (i) => (i.exact || i.href === "/" ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  // Pagina corrente fuori dal menu corto → si apre l'elenco completo, così si vede dove si è
  const inShort = sections.some((s) => s.items.some(isActive));

  return (
    <aside className="hoc-side casa-side" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: SIDEBAR_WIDTH, zIndex: 50 }}>
      <Link href={manager ? "/admin" : "/me/turno"} className="casa-brand">
        House of Creators <em>Pro</em>
        <small>{today}</small>
      </Link>

      <nav className="casa-nav" aria-label="Menu">
        {sections.map((s, si) => (
          <div key={si}>
            {s.title && <h4>{s.title}</h4>}
            {s.items.map((i) => (
              <Link key={i.href} href={i.href} className={isActive(i) ? "on" : undefined} aria-current={isActive(i) ? "page" : undefined}>
                {i.label}
                {i.badge && openAlerts > 0 && <span className="b">{openAlerts}</span>}
              </Link>
            ))}
          </div>
        ))}

        <button type="button" className="casa-tools" onClick={toggleTools} aria-expanded={tools || !inShort}>
          Tutti gli strumenti <span aria-hidden="true">{tools || !inShort ? "−" : "+"}</span>
        </button>
        {(tools || !inShort) && NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => allowed(i.href));
          if (!items.length) return null;
          return (
            <div key={g.label} className="casa-all">
              <h4>{g.label}</h4>
              {items.map((i) => {
                const on = i.match ? i.match(pathname) : i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
                return <Link key={i.href} href={i.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>{i.label}</Link>;
              })}
            </div>
          );
        })}
      </nav>

      <SignedIn>
        <div className="casa-me">
          <span className="hoc-avatar"><UserButton afterSignOutUrl="/sign-in" /></span>
          <span className="n">{me?.name || "Account"}</span>
        </div>
        {me?.admin && (
          <button type="button" className="casa-style" onClick={() => setStyle(style === "v3" ? "v2" : "v3")}>
            Stile nuovo (anteprima) · torna al vecchio
          </button>
        )}
      </SignedIn>
    </aside>
  );
}
