"use client";

/**
 * HOC Fan Agent — Sidebar globale CP-style.
 *
 * Sidebar fissa a sinistra (248px), dark, raggruppata per sezioni.
 * Replica il pattern visivo di CreatorsPro (logo top → org → nav grouped).
 *
 * FEATURES UX:
 *   - Toggle "Essential / Advanced" in alto: Essential mostra 8 voci core
 *     (per primo accesso / demo / consulenti), Advanced mostra tutto.
 *   - Gruppi collapsible: Performance + Training aperti di default, gli altri
 *     4 collassati. Click sul GroupLabel per toggle.
 *   - Tutti gli stati persistiti in localStorage.
 *
 * Tutti gli URL identici a prima.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton, SignedIn } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords, Crown,
  GraduationCap, BookOpen, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles,
  Workflow, Image as ImageIcon, ListChecks, History, Settings,
  UserCircle2, Contact, Medal, Key, Lock, Wrench,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders, Sprout,
  Building2, ChevronDown, ChevronRight, Compass, Layers,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import BrandLockup from "@/components/BrandLockup";

// Voci "essential" (mostrate sempre): 8 core per primo accesso / demo.
const ESSENTIAL_HREFS = new Set([
  "/welcome",
  "/admin",
  "/leaderboard",
  "/leaderboard/operational",
  "/leaderboard/sales-cp",
  "/leaderboard/creators",
  "/",
  "/playbook",
  "/admin/team",
]);

const NAV_GROUPS = [
  {
    label: "Performance",
    defaultOpen: true,
    items: [
      { href: "/leaderboard",                    label: "Ladder",       icon: Trophy },
      { href: "/leaderboard/operational",        label: "Operativa",    icon: BarChart3 },
      { href: "/leaderboard/sales-cp",           label: "Sales CP",     icon: DollarSign },
      { href: "/leaderboard/creators",           label: "Creator",      icon: Users },
      { href: "/leaderboard/creators/heatmap",   label: "Heat-map",     icon: Flame },
      { href: "/leaderboard/leghe",              label: "Leghe",        icon: Swords },
      { href: "/leaderboard/storico",            label: "Hall of Fame", icon: Crown },
    ],
  },
  {
    label: "Training",
    defaultOpen: true,
    items: [
      { href: "/",                               label: "Academy",      icon: GraduationCap, match: (p) => p === "/" },
      { href: "/playbook",                       label: "Playbook",     icon: BookOpen },
      { href: "/admin/review",                   label: "Review",       icon: ClipboardCheck },
      { href: "/admin/outcomes",                 label: "Outcomes",     icon: Target },
      { href: "/admin/sessions",                 label: "Sessioni",     icon: Brain },
      { href: "/profilo/certificazioni",         label: "Badge Wall",   icon: Award },
    ],
  },
  {
    label: "Insights",
    defaultOpen: false,
    items: [
      { href: "/admin/dashboard",                label: "Dashboard",       icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",           label: "Fan Archetypes",  icon: Sparkles },
      { href: "/admin/creators",                 label: "Creator (anag.)", icon: UserCog },
    ],
  },
  {
    label: "Content Pipeline",
    defaultOpen: false,
    items: [
      { href: "/content-pipeline",               label: "Pipeline",       icon: Workflow, match: (p) => p === "/content-pipeline" },
      { href: "/content-pipeline/creators",      label: "Creator (CP)",   icon: ImageIcon },
      { href: "/content-pipeline/queue",         label: "Queue",          icon: ListChecks },
      { href: "/content-pipeline/history",       label: "History",        icon: History },
      { href: "/content-pipeline/settings",      label: "Settings",       icon: Settings },
    ],
  },
  {
    label: "People",
    defaultOpen: false,
    items: [
      { href: "/admin/team",                     label: "Team",         icon: UserCircle2 },
      { href: "/admin/employee-profiles",        label: "Profili",      icon: Contact },
      { href: "/admin/seniority",                label: "Seniority",    icon: Medal },
      { href: "/admin/access",                   label: "Accessi",      icon: Key },
      { href: "/admin/ruoli",                    label: "Ruoli",        icon: Lock },
      { href: "/admin/ruoli-custom",             label: "Ruoli custom", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
    defaultOpen: false,
    items: [
      { href: "/admin/creatorspro-sync",         label: "Sync CP",         icon: RefreshCw },
      { href: "/admin/leaderboard-exclusions",   label: "Esclusioni",      icon: Ban },
      { href: "/admin/group-languages",          label: "Lingue Group",    icon: Languages },
      { href: "/admin/group-categories",         label: "Categorie Group", icon: Tags },
      { href: "/admin/leaderboard-import",       label: "Import ladder",   icon: Upload },
      { href: "/admin/leaderboard-settings",     label: "Settings ladder", icon: Sliders },
      { href: "/admin/seed",                     label: "Seed",            icon: Sprout },
    ],
  },
];

export const SIDEBAR_WIDTH = 248;

function NavItem({ href, label, icon: Icon, isActive }) {
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
        fontWeight: isActive ? 600 : 500,
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
          width: 3, background: CP.accentGreen, borderRadius: "0 3px 3px 0",
        }} />
      )}
      <Icon size={16} strokeWidth={1.8} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </Link>
  );
}

function GroupHeader({ label, isOpen, onToggle, visibleCount }) {
  return (
    <button
      onClick={onToggle}
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
        textTransform: "uppercase",
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
        { v: "essential", label: "Essential", icon: Compass, tooltip: "8 voci core — primo accesso, demo" },
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

export default function Sidebar() {
  const pathname = usePathname() || "";

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
    <aside
      style={{
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        width: SIDEBAR_WIDTH,
        background: "#0B0D13",
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
            background: `linear-gradient(135deg, ${CP.accentGreen}, ${CP.accentGreen}88)`,
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONTS.display, fontWeight: 700, fontSize: 13,
          }}>H</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: FONTS.mono, fontWeight: 700 }}>Organization</div>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 600, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>House of Creators</div>
          </div>
          <Building2 size={14} color={CP.textMuted} />
        </div>
      </div>

      {/* View mode toggle */}
      <ViewToggle mode={viewMode} onChange={setViewMode} />

      {/* Welcome link (always visible, both modes) */}
      <div style={{ padding: "10px 0 4px 0", borderBottom: `1px solid ${CP.border}` }}>
        <NavItem href="/welcome" label="Welcome / Tour" icon={Compass} isActive={pathname === "/welcome"} />
        <NavItem href="/admin" label="Hub" icon={LayoutDashboard} isActive={pathname === "/admin"} />
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px 0", scrollbarWidth: "thin" }}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = isEssential
            ? group.items.filter((it) => ESSENTIAL_HREFS.has(it.href))
            : group.items;
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
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${CP.border}`, background: "#0B0D13" }}>
        <SignedIn>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserButton afterSignOutUrl="/sign-in" />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: CP.textMuted }}>
              <div style={{ color: CP.textSecondary, fontWeight: 600, fontSize: 12 }}>Account</div>
              <div style={{ fontSize: 10, marginTop: 1 }}>HOC Pro</div>
            </div>
          </div>
        </SignedIn>
      </div>
    </aside>
  );
}
