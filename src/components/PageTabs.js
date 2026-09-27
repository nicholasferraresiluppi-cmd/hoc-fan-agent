"use client";
// Schede in cima alle pagine unite in un gruppo (lib/page-groups).
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { groupOf } from "@/lib/page-groups";

export default function PageTabs({ pathname }) {
  const g = groupOf(pathname);
  if (!g) return null;
  const cur = String(pathname).replace(/\/$/, "");
  return (
    <nav aria-label={g.label} style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", padding: "18px 24px 0", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <span style={{ fontSize: 12.5, color: CP.textMuted, marginRight: 10 }}>{g.label}</span>
      {g.tabs.map(([href, label]) => {
        const on = href === cur;
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            style={{ fontSize: 13.5, padding: "6px 12px", borderRadius: 999, textDecoration: "none", border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : "transparent", color: on ? CP.accentSoftText : CP.textSecondary }}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
