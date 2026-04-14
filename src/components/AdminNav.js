"use client";

import { usePathname } from "next/navigation";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  white: "#F9FAFB",
  gray: "#9CA3AF",
};

const SECTIONS = [
  { href: "/admin", label: "🏠 Hub", match: (p) => p === "/admin" },
  { href: "/admin/dashboard", label: "📊 Dashboard SM" },
  { href: "/admin/review", label: "🔍 Review sessioni" },
  { href: "/admin/outcomes", label: "💰 Outcomes" },
  { href: "/admin/creators", label: "👤 Creator" },
  { href: "/admin/fan-archetypes", label: "👥 Fan Archetypes" },
  { href: "/admin/seniority", label: "🎖️ Seniority" },
  { href: "/admin/seed", label: "🌱 Seed demo" },
  { href: "/admin/access", label: "🔐 Accessi" },
];

const PUBLIC_SECTIONS = [
  { href: "/", label: "🏠 Home" },
  { href: "/leaderboard", label: "🏆 Classifica" },
  { href: "/leaderboard/storico", label: "🏛️ Hall of Fame" },
];

export default function AdminNav() {
  const pathname = usePathname() || "";

  const Link = ({ href, label, match }) => {
    const isActive = match ? match(pathname) : pathname === href || pathname.startsWith(href + "/");
    return (
      <a
        href={href}
        style={{
          padding: "0.4rem 0.75rem",
          background: isActive ? C.orange : `${C.white}08`,
          color: isActive ? C.bgDark : C.white,
          border: `1px solid ${isActive ? C.orange : C.purple + "40"}`,
          borderRadius: "0.45rem",
          fontSize: "0.8rem",
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </a>
    );
  };

  return (
    <div style={{ background: `${C.bgDark}`, borderBottom: `1px solid ${C.purple}30`, padding: "0.75rem 1.25rem", marginBottom: "1.5rem", borderRadius: "0.5rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
        <span style={{ color: C.gray, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginRight: "0.4rem" }}>Admin</span>
        {SECTIONS.map((s) => <Link key={s.href} {...s} />)}
        <span style={{ width: 1, height: 20, background: `${C.purple}40`, margin: "0 0.4rem" }} />
        <span style={{ color: C.gray, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginRight: "0.4rem" }}>App</span>
        {PUBLIC_SECTIONS.map((s) => <Link key={s.href} {...s} />)}
      </div>
    </div>
  );
}
