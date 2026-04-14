"use client";

import { usePathname } from "next/navigation";
import BrandLockup from "@/components/BrandLockup";
import { COLORS, FONTS } from "@/lib/brand";

const SECTIONS = [
  { href: "/admin", label: "Hub", match: (p) => p === "/admin" },
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/outcomes", label: "Outcomes" },
  { href: "/admin/creators", label: "Creator" },
  { href: "/admin/fan-archetypes", label: "Archetypes" },
  { href: "/admin/seniority", label: "Seniority" },
  { href: "/admin/seed", label: "Seed" },
  { href: "/admin/access", label: "Accessi" },
  { href: "/admin/ruoli", label: "Ruoli" },
  { href: "/admin/ruoli-custom", label: "Ruoli custom" },
  { href: "/admin/team", label: "Team" },
];

const PUBLIC_SECTIONS = [
  { href: "/", label: "Academy" },
  { href: "/leaderboard", label: "Ladder" },
  { href: "/leaderboard/leghe", label: "Leghe" },
  { href: "/leaderboard/storico", label: "Hall of Fame" },
  { href: "/profilo/certificazioni", label: "Badge Wall" },
];

export default function AdminNav() {
  const pathname = usePathname() || "";

  const Link = ({ href, label, match }) => {
    const isActive = match ? match(pathname) : pathname === href || pathname.startsWith(href + "/");
    return (
      <a
        href={href}
        style={{
          padding: "6px 12px",
          background: isActive ? COLORS.champagne : "transparent",
          color: isActive ? COLORS.obsidian : COLORS.fog,
          border: `1px solid ${isActive ? COLORS.champagne : COLORS.steel}`,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: isActive ? 700 : 500,
          letterSpacing: "0.02em",
          textDecoration: "none",
          whiteSpace: "nowrap",
          fontFamily: FONTS.body,
        }}
      >
        {label}
      </a>
    );
  };

  const SectionLabel = ({ children }) => (
    <span
      style={{
        color: COLORS.mist,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        fontWeight: 700,
        fontFamily: FONTS.mono,
      }}
    >
      {children}
    </span>
  );

  return (
    <div
      style={{
        background: COLORS.graphite,
        border: `1px solid ${COLORS.charcoal}`,
        padding: "14px 18px",
        marginBottom: "24px",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${COLORS.steel}` }}>
        <BrandLockup size="sm" />
        <span style={{ color: COLORS.mist, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: "0.14em" }}>
          ADMIN CONSOLE
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <SectionLabel>Admin</SectionLabel>
        {SECTIONS.map((s) => <Link key={s.href} {...s} />)}
        <span style={{ width: 1, height: 20, background: COLORS.steel, margin: "0 8px" }} />
        <SectionLabel>App</SectionLabel>
        {PUBLIC_SECTIONS.map((s) => <Link key={s.href} {...s} />)}
      </div>
    </div>
  );
}
