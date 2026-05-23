"use client";

/**
 * HOC Fan Agent — Sidebar globale CP-style.
 *
 * Sidebar fissa a sinistra (240px), dark, raggruppata per sezioni.
 * Replica il pattern visivo di CreatorsPro (logo top → org → nav grouped).
 *
 * Le voci sono raggruppate per workflow:
 *   PERFORMANCE         — Ladder, Operativa, Sales CP, Creator, Heat-map, Leghe, Hall of Fame
 *   TRAINING            — Academy, Playbook, Review, Outcomes, Sessioni, Badge Wall
 *   INSIGHTS            — Dashboard, Fan Archetypes, Creator anagrafica
 *   CONTENT PIPELINE    — Pipeline, Creator (CP), Queue, History, Settings
 *   PEOPLE              — Team, Profili, Seniority, Accessi, Ruoli, Ruoli custom
 *   DATA & INTEGRATIONS — Sync CP, Esclusioni, Lingue, Categorie, Import, Settings, Seed
 *
 * Tutti gli URL sono identici a prima.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserButton, SignedIn } from "@clerk/nextjs";
import {
  Home, Trophy, BarChart3, DollarSign, Users, Flame, Swords, Crown,
  GraduationCap, BookOpen, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles,
  Workflow, Image as ImageIcon, ListChecks, History, Settings,
  UserCircle2, IdCard, Medal, Key, Lock, Wrench,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders, Sprout,
  Building2,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import BrandLockup from "@/components/BrandLockup";

const NAV_GROUPS = [
  {
    label: "Performance",
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
    items: [
      { href: "/admin/dashboard",                label: "Dashboard",       icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",           label: "Fan Archetypes",  icon: Sparkles },
      { href: "/admin/creators",                 label: "Creator (anag.)", icon: UserCog },
    ],
  },
  {
    label: "Content Pipeline",
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
    items: [
      { href: "/admin/team",                     label: "Team",         icon: UserCircle2 },
      { href: "/admin/employee-profiles",        label: "Profili",      icon: IdCard },
      { href: "/admin/seniority",                label: "Seniority",    icon: Medal },
      { href: "/admin/access",                   label: "Accessi",      icon: Key },
      { href: "/admin/ruoli",                    label: "Ruoli",        icon: Lock },
      { href: "/admin/ruoli-custom",             label: "Ruoli custom", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
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

function GroupLabel({ children }) {
  return (
    <div style={{
      padding: "16px 20px 6px 20px",
      color: CP.textMuted,
      fontFamily: FONTS.mono,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
    }}>
      {children}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  const isItemActive = (item) => {
    if (item.match) return item.match(pathname);
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

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
        <Link href="/admin" style={{ textDecoration: "none", display: "block" }}>
          <BrandLockup size="sm" />
        </Link>
      </div>

      {/* Organization picker */}
      <div style={{ padding: "12px 16px 12px 16px", borderBottom: `1px solid ${CP.border}` }}>
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

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px 0", scrollbarWidth: "thin" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <GroupLabel>{group.label}</GroupLabel>
            <div>
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={isItemActive(item)}
                />
              ))}
            </div>
          </div>
        ))}
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
