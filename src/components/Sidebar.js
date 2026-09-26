"use client";

/**
 * HOC Fan Agent — Sidebar globale CP-style.
 *
 * Sidebar fissa a sinistra (248px), dark, raggruppata per sezioni.
 * Replica il pattern visivo di CreatorsPro (logo top → org → nav grouped).
 *
 * FEATURES UX:
 *   - Toggle "Essential / Advanced" in alto: Essential mostra solo le voci
 *     core in ESSENTIAL_HREFS (primo accesso / demo / consulenti), Advanced
 *     mostra tutto.
 *   - Gruppi collapsible: Performance + Training aperti di default, gli altri
 *     4 collassati. Click sul GroupLabel per toggle.
 *   - Tutti gli stati persistiti in localStorage.
 *
 * Tutti gli URL identici a prima.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { canSee } from "@/lib/nav-access";
import { useTheme, useStyle } from "@/lib/theme-client";
import { UserButton, SignedIn } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords, Crown,
  GraduationCap, BookOpen, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles, Radar,
  UserCircle2, Contact, Medal, Key, Lock, Wrench, Gauge, MessageSquareWarning,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders, Sprout, ShieldCheck,
  Building2, ChevronDown, ChevronRight, Compass, Layers,
  Wallet, Scale, CalendarDays, FlaskConical, Activity, Search, Link2, Ruler, MessagesSquare,
  History, Signpost, Bell, ListTree, Inbox, Film, Clapperboard, TrendingUp, UserSearch, UserCheck, Rocket, HandCoins, MessageCircle, Sun, Moon, Snowflake,
Megaphone, Share2, Shield,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import BrandLockup from "@/components/BrandLockup";

// Voci "essential" (mostrate sempre): core per primo accesso / demo.
const ESSENTIAL_HREFS = new Set([
  "/welcome",
  "/welcome/score-friendly",
  "/profilo",
  "/me/score",
  "/me/compenso",
  "/me/percorso",
  "/me/contestazioni",
  "/me/qualita",
  "/me/turno",
  "/me/coaching",
  "/admin",
  "/admin/alerts",
  "/leaderboard/sales-cp",
  "/leaderboard/creators",
  "/",
  "/playbook",
  "/academy/tapes",
  "/academy/vendere",
  "/admin/sales-coaching",
  "/admin/team",
  "/admin/action-center",
  "/admin/coaching-center",
  "/admin/pnl-live",
  "/admin/conversation-intelligence",
  "/admin/profiles-compare",
  "/admin/comp-calendar",
  "/admin/roadmap",
]);

export const NAV_GROUPS = [
  {
    label: "Il mio quadro",
    defaultOpen: true,
    items: [
      { href: "/profilo",     label: "Il mio profilo",  icon: UserCircle2 },
      { href: "/me/score",    label: "I miei score",    icon: Gauge },
      { href: "/me/compenso", label: "Il mio compenso", icon: Wallet },
      { href: "/me/percorso", label: "Il mio percorso", icon: Compass },
      { href: "/me/qualita", label: "La mia qualità", icon: ClipboardCheck },
      { href: "/me/coaching", label: "Il mio coaching", icon: GraduationCap },
      { href: "/me/contestazioni", label: "Le mie contestazioni", icon: MessageSquareWarning },
      { href: "/me/turno", label: "Il mio turno", icon: Radar },
    ],
  },
  {
    label: "Performance",
    defaultOpen: true,
    items: [
      { href: "/leaderboard/sales-cp",           label: "Classifica vendite", icon: DollarSign },
      { href: "/leaderboard/creators",           label: "Creator",      icon: Users },
      { href: "/leaderboard/creators/heatmap",   label: "Mappa operatore×creator",     icon: Flame },
      { href: "/admin/conversation-intelligence", label: "Presidio chat", icon: Activity },
      { href: "/admin/shift-quality",            label: "Qualità turni", icon: MessagesSquare },
      { href: "/admin/sales-coaching",           label: "Coaching vendite", icon: HandCoins },
    ],
  },
  {
    label: "Comp & Ben",
    defaultOpen: true,
    items: [
      { href: "/admin/pnl-live",                 label: "P&L Live",              icon: Wallet },
      { href: "/admin/profiles-compare",         label: "Scaglioni a confronto", icon: Scale },
      { href: "/admin/comp-calendar",            label: "Calendario compensi",   icon: CalendarDays },
      { href: "/admin/threshold-study",          label: "Studio soglie",         icon: Ruler },
      { href: "/admin/comp-review",              label: "Review compensi",           icon: Activity },
      { href: "/admin/comp-exam",                label: "Esame creator",         icon: Search },
      { href: "/admin/payout-tree",              label: "Albero payout",         icon: ListTree },
      { href: "/admin/payment-profiles",         label: "Profili di pagamento",      icon: Layers },
      { href: "/admin/shift-research",           label: "Ricerca turni",        icon: FlaskConical },
    ],
  },
  {
    label: "Training",
    defaultOpen: true,
    items: [
      { href: "/welcome/score-friendly",         label: "Guida allo score", icon: GraduationCap },
      { href: "/",                               label: "Academy",      icon: GraduationCap, match: (p) => p === "/" },
      { href: "/academy/multi",                  label: "Chat in parallelo",   icon: Layers },
      { href: "/academy/tapes",                  label: "Game tape",    icon: Film },
      { href: "/academy/vendere",                label: "Vendere in chat", icon: MessageCircle },
      { href: "/playbook",                       label: "Playbook",     icon: BookOpen },
      { href: "/leaderboard",                    label: "Classifica allenamento", icon: Trophy },
      { href: "/leaderboard/leghe",              label: "Leghe",        icon: Swords },
      { href: "/leaderboard/storico",            label: "Hall of Fame", icon: Crown },
      { href: "/admin/review",                   label: "Revisione voti AI",       icon: ClipboardCheck },
      { href: "/admin/outcomes",                 label: "Risultati reali",     icon: Target },
      { href: "/admin/sessions",                 label: "Sessioni simulatore",     icon: Brain },
      { href: "/admin/qa-reviews",               label: "QA conversazioni", icon: ClipboardCheck },
      { href: "/admin/academy-tapes",            label: "Curatela tape", icon: Clapperboard },
      { href: "/admin/academy-signals",          label: "Cosa fa vendere",       icon: TrendingUp },
      { href: "/admin/creator-difficulty",       label: "Difficoltà creator", icon: Snowflake },
      { href: "/admin/operator-signals",         label: "Profilo operatore", icon: UserSearch },
      { href: "/admin/activation",               label: "Attivazione",   icon: Rocket },
      { href: "/admin/infloww-ingest",           label: "Carica export Infloww",  icon: Upload },
      { href: "/profilo/certificazioni",         label: "Certificazioni",   icon: Award },
    ],
  },
  {
    label: "Insights",
    defaultOpen: false,
    items: [
      { href: "/admin/utilizzo",                 label: "Utilizzo app",    icon: Activity },
      { href: "/admin/dashboard",                label: "Allenamento operatori",       icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",           label: "Tipi di fan",  icon: Sparkles },
      { href: "/admin/creators",                 label: "Voce delle creator", icon: UserCog },
      { href: "/admin/loop",                     label: "Loop azione→esito", icon: RefreshCw },
      { href: "/admin/citta",                    label: "La città",        icon: Building2 },
      { href: "/admin/roadmap",                  label: "Roadmap",         icon: Signpost },
    ],
  },
  {
    // Marketing (26/09/2026): moduli di luglio-agosto rimasti non pubblicati
    label: "Marketing",
    items: [
      { href: "/admin/ads",                      label: "Studio bio-funnel", icon: Megaphone },
      { href: "/admin/social-accounts",          label: "Account social",  icon: Share2 },
      { href: "/admin/social-proxies",           label: "Proxy account social", icon: Shield },
    ],
  },
  {
    label: "People",
    defaultOpen: false,
    items: [
      { href: "/cm-cockpit",                     label: "Cockpit CM",   icon: Gauge },
      { href: "/admin/candidate-assessments",    label: "Assessment candidati", icon: UserCheck },
      { href: "/admin/priority-queue",           label: "Fan da seguire ora", icon: Inbox },
      { href: "/admin/action-center",            label: "Action Center", icon: Target },
      { href: "/admin/coaching-center",          label: "Coaching Center", icon: GraduationCap },
      { href: "/admin/coaching-sessions",        label: "Sessioni coaching", icon: GraduationCap },
      { href: "/admin/disputes",                 label: "Contestazioni", icon: MessageSquareWarning },
      { href: "/admin/team",                     label: "Team",         icon: UserCircle2 },
      { href: "/admin/employee-profiles",        label: "Profili",      icon: Contact },
      { href: "/admin/seniority",                label: "Seniority",    icon: Medal },
      { href: "/admin/access",                   label: "Accessi",      icon: Key },
      { href: "/admin/ruoli",                    label: "Membri",       icon: Lock },
      { href: "/admin/ruoli-custom",             label: "Ruoli custom", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
    defaultOpen: false,
    items: [
      { href: "/admin/creatorspro-sync",         label: "Sync CP",         icon: RefreshCw },
      { href: "/admin/wage-audit",               label: "Sync & Audit CP", icon: ShieldCheck },
      { href: "/admin/creatorspro-sync-history", label: "Storico sync CP", icon: History },
      { href: "/admin/infloww-agency",           label: "Revenue agency",  icon: Gauge },
      { href: "/admin/infloww-revenue",          label: "Revenue live",    icon: BarChart3 },
      { href: "/admin/infloww-reconcile",        label: "Controllo dati CP", icon: Link2 },
      { href: "/admin/debug-mapping",            label: "Operatori senza dati CP",   icon: Link2 },
      { href: "/admin/user-mapping",             label: "Collega utenti",  icon: Link2 },
      { href: "/admin/reports",                  label: "Report Looker",       icon: BarChart3 },
      { href: "/admin/leaderboard-exclusions",   label: "Esclusioni",      icon: Ban },
      { href: "/admin/group-languages",          label: "Lingua dei gruppi",    icon: Languages },
      { href: "/admin/group-categories",         label: "Categorie dei gruppi", icon: Tags },
      { href: "/admin/leaderboard-import",       label: "Import Infloww",   icon: Upload },
      { href: "/admin/leaderboard-settings",     label: "Impostazioni mestiere", icon: Sliders },
      { href: "/admin/score-config-history",     label: "Storico formula", icon: History },
      { href: "/admin/score-config-drafts",      label: "Bozze formula",   icon: FlaskConical },
      { href: "/admin/seed",                     label: "Dati demo",            icon: Sprout },
    ],
  },
];

export const SIDEBAR_WIDTH = 248;

/** Voci di menu piatte { href, label, group } — per l'analytics d'uso. */
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label })));

function NavItem({ href, label, icon: Icon, isActive, badge }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "8px 12px",
        margin: "1px 8px",
        borderRadius: 8,
        textDecoration: "none",
        color: isActive ? CP.textPrimary : CP.textSecondary,
        background: isActive ? CP.surfaceAlt : "transparent",
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        fontFamily: FONTS.body,
        transition: "background 0.12s, color 0.12s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = CP.surface;
          e.currentTarget.style.color = CP.textPrimary;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = CP.textSecondary;
        }
      }}
    >
      {isActive && (
        <span style={{
          position: "absolute", left: -8, top: "20%", bottom: "20%",
          width: 3, background: CP.accent, borderRadius: "0 3px 3px 0",
        }} />
      )}
      <Icon size={16} strokeWidth={1.8} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {badge > 0 && (
        <span style={{
          marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px",
          borderRadius: 9, background: CP.accentRed, color: "#2b0f0f",
          fontFamily: FONTS.mono, fontSize: 10.5, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{badge}</span>
      )}
    </Link>
  );
}

function GroupHeader({ label, isOpen, onToggle, visibleCount }) {
  return (
    <button
      onClick={onToggle}
      className="hoc-grp"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "calc(100% - 16px)",
        margin: "10px 8px 4px 8px",
        padding: "6px 12px",
        background: "transparent",
        border: "none",
        color: CP.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: 700,
        
        letterSpacing: "0.14em",
        cursor: "pointer",
        borderRadius: 6,
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = CP.textSecondary}
      onMouseLeave={(e) => e.currentTarget.style.color = CP.textMuted}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isOpen ? <ChevronDown size={11} strokeWidth={2.4} /> : <ChevronRight size={11} strokeWidth={2.4} />}
        {label}
      </span>
      {!isOpen && visibleCount > 0 && (
        <span style={{ fontSize: 9, opacity: 0.7 }}>{visibleCount}</span>
      )}
    </button>
  );
}

function ViewToggle({ mode, onChange }) {
  return (
    <div style={{
      display: "flex",
      padding: 3,
      background: CP.surface,
      border: `1px solid ${CP.border}`,
      borderRadius: 8,
      margin: "8px 16px 0 16px",
    }}>
      {[
        { v: "essential", label: "Essential", icon: Compass, tooltip: "Voci core — primo accesso, demo" },
        { v: "advanced",  label: "Advanced",  icon: Layers,   tooltip: "Tutti gli strumenti" },
      ].map((opt) => {
        const active = mode === opt.v;
        const Icon = opt.icon;
        return (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            title={opt.tooltip}
            style={{
              flex: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "5px 8px",
              background: active ? CP.surfaceAlt : "transparent",
              border: active ? `1px solid ${CP.borderStrong}` : "1px solid transparent",
              borderRadius: 6,
              color: active ? CP.textPrimary : CP.textMuted,
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              fontFamily: FONTS.body,
              cursor: "pointer",
              transition: "color 0.12s, background 0.12s",
            }}
          >
            <Icon size={12} strokeWidth={1.8} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Fetcher silenzioso: la sidebar è renderizzata per TUTTI gli utenti loggati,
// ma /api/admin/ops-alerts risponde 403 sotto SCORES_VIEW "all" — in quel caso
// niente badge, nessun errore.
const silentFetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

export default function Sidebar() {
  const pathname = usePathname() || "";

  // Badge alert operativi: SOLO i critici aperti (un segnale sempre acceso è spento).
  const { data: opsAlertsData } = useSWR("/api/admin/ops-alerts", silentFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 5 * 60 * 1000,
  });
  const criticalCount = (opsAlertsData?.alerts || []).filter(
    (a) => a.severity === "critical" && a.status !== "resolved"
  ).length;

  // Menu per ruolo: si nascondono le voci che per questi permessi risponderebbero
  // "non hai il permesso" (lib/nav-access). Finché i permessi non arrivano si
  // mostra tutto, come prima (niente menu che "salta" vuoto).
  const { data: me } = useSWR("/api/whoami", silentFetcher, { revalidateOnFocus: false });
  const allowed = (href) => !me?.authenticated || canSee(href, me.capabilities, me.admin);
  const [theme, setTheme] = useTheme();
  const [style, setStyle] = useStyle();

  // Toggle Essential / Advanced
  const [viewMode, setViewMode] = useState("essential");
  // Map { label: isOpen } per i gruppi collassabili
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {};
    for (const g of NAV_GROUPS) init[g.label] = g.defaultOpen;
    return init;
  });

  // Hydrate da localStorage (post-mount, evita hydration mismatch)
  useEffect(() => {
    try {
      const v = localStorage.getItem("hoc:sidebar:viewMode");
      if (v === "essential" || v === "advanced") setViewMode(v);
      const og = localStorage.getItem("hoc:sidebar:openGroups");
      if (og) {
        const parsed = JSON.parse(og);
        if (parsed && typeof parsed === "object") setOpenGroups((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  // Persist on change
  useEffect(() => {
    try { localStorage.setItem("hoc:sidebar:viewMode", viewMode); } catch {}
  }, [viewMode]);
  useEffect(() => {
    try { localStorage.setItem("hoc:sidebar:openGroups", JSON.stringify(openGroups)); } catch {}
  }, [openGroups]);

  const isItemActive = (item) => {
    if (item.match) return item.match(pathname);
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const isEssential = viewMode === "essential";
  const toggleGroup = (label) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <aside className="hoc-side"
      style={{
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        width: SIDEBAR_WIDTH,
        background: CP.bgSunken,
        borderRight: `1px solid ${CP.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      {/* Top: brand */}
      <div style={{ padding: "18px 20px 14px 20px", borderBottom: `1px solid ${CP.border}` }}>
        <Link href="/welcome" style={{ textDecoration: "none", display: "block" }}>
          <BrandLockup size="sm" />
        </Link>
      </div>

      {/* Organization picker */}
      <div style={{ padding: "12px 16px 0 16px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px",
          background: CP.surface,
          border: `1px solid ${CP.border}`,
          borderRadius: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: CP.accent,
            color: CP.accentInk,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONTS.body, fontWeight: 500, fontSize: 13,
          }}>H</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: CP.textMuted, letterSpacing: "0.02em", fontFamily: FONTS.body, fontWeight: 500 }}>Organizzazione</div>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>House of Creators</div>
          </div>
          <Building2 size={14} color={CP.textMuted} />
        </div>
      </div>

      {/* View mode toggle */}
      <ViewToggle mode={viewMode} onChange={setViewMode} />

      {/* Welcome link (always visible, both modes) */}
      <div style={{ padding: "10px 0 4px 0", borderBottom: `1px solid ${CP.border}` }}>
        <NavItem href="/welcome" label="Benvenuto" icon={Compass} isActive={pathname === "/welcome"} />
        <NavItem href="/guida" label="Guida strumenti" icon={Signpost} isActive={pathname === "/guida"} />
        {allowed("/admin") && <NavItem href="/admin" label="Hub" icon={LayoutDashboard} isActive={pathname === "/admin"} />}
        {allowed("/admin/alerts") && <NavItem href="/admin/alerts" label="Alert operativi" icon={Bell} isActive={pathname.startsWith("/admin/alerts")} badge={criticalCount} />}
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px 0", scrollbarWidth: "thin" }}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = (isEssential
            ? group.items.filter((it) => ESSENTIAL_HREFS.has(it.href))
            : group.items).filter((it) => allowed(it.href));
          if (visibleItems.length === 0) return null;
          const isOpen = openGroups[group.label];
          return (
            <div key={group.label}>
              <GroupHeader
                label={group.label}
                isOpen={isOpen}
                onToggle={() => toggleGroup(group.label)}
                visibleCount={visibleItems.length}
              />
              {isOpen && (
                <div>
                  {visibleItems.map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isItemActive(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom: UserButton */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${CP.border}`, background: CP.bgSunken }}>
        <SignedIn>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hoc-avatar"><UserButton afterSignOutUrl="/sign-in" /></span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: CP.textMuted }}>
              <div style={{ color: CP.textSecondary, fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || "Account"}</div>
              <div style={{ fontSize: 10, marginTop: 1 }}>HOC Pro</div>
            </div>
            <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={theme === "light" ? "Passa al tema scuro" : "Passa al tema chiaro"} aria-label="Cambia tema"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, cursor: "pointer" }}>
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
          {/* Stile v3 "Notte / Carta" in ANTEPRIMA: solo admin, finché non è verificato su tutte le pagine */}
          {me?.admin && (
            <button onClick={() => setStyle(style === "v3" ? "v2" : "v3")} aria-pressed={style === "v3"}
              style={{ marginTop: 10, width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${style === "v3" ? CP.accent : CP.border}`, background: style === "v3" ? CP.accentSoft : "transparent", color: style === "v3" ? CP.accentSoftText : CP.textSecondary, fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: FONTS.body }}>
              {style === "v3" ? "Stile nuovo attivo (anteprima) · torna al vecchio" : "Prova lo stile nuovo (anteprima)"}
            </button>
          )}
        </SignedIn>
      </div>
    </aside>
  );
}
