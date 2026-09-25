"use client";

/**
 * CompNav — barra di navigazione orizzontale del toolkit Comp & Ben.
 * Montata sotto il PageHeader di ogni pagina comp: rende il funnel
 * navigabile lateralmente (confronto ↔ calendar ↔ P&L ↔ review) senza
 * dover risalire all'Hub. Active state sul path corrente.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Scale, CalendarDays, Activity, Search, FlaskConical, Ruler, ListTree } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

const TOOLS = [
  { href: "/admin/pnl-live",         label: "P&L Live",     icon: Wallet },
  { href: "/admin/profiles-compare", label: "Scaglioni",    icon: Scale },
  { href: "/admin/comp-calendar",    label: "Calendario",   icon: CalendarDays },
  { href: "/admin/threshold-study",  label: "Studio soglie", icon: Ruler },
  { href: "/admin/comp-review",      label: "Review",       icon: Activity },
  { href: "/admin/comp-exam",        label: "Esame creator", icon: Search },
  { href: "/admin/payout-tree",      label: "Albero payout", icon: ListTree },
  { href: "/admin/shift-research",   label: "Research",     icon: FlaskConical },
];

export default function CompNav({ palette } = {}) {
  const P = palette || CP; // palette alternativa (tema chiaro del pilota)
  const pathname = usePathname();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22, padding: 5, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, width: "fit-content" }}>
      {TOOLS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 13px", borderRadius: 7,
              background: active ? P.surfaceAlt : "transparent",
              border: `1px solid ${active ? P.accent + "66" : "transparent"}`,
              color: active ? P.textPrimary : P.textSecondary,
              fontSize: 12, fontWeight: active ? 500 : 400,
              fontFamily: FONTS.body, textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={13} color={active ? P.accent : P.mutedIcons} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
