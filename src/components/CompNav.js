"use client";

/**
 * CompNav — schede del toolkit Comp & Ben, sotto la testata di ogni pagina comp: si passa da uno
 * strumento all'altro (P&L ↔ scaglioni ↔ calendario ↔ review) senza risalire all'Hub.
 *
 * 30/10/2026 (regole d'uso, docs/DESIGN.md §1b): schede = testo sottolineato, non riquadri a
 * pillole (che nell'app sono i filtri). «Scaglioni» resta accesa su tutte e tre le pagine del suo
 * gruppo (Confronto, Profili di pagamento, Studio soglie), che hanno le loro schede in cima.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";

const TOOLS = [
  { href: "/admin/pnl-live",         label: "P&L Live" },
  { href: "/admin/profiles-compare", label: "Scaglioni", also: ["/admin/payment-profiles", "/admin/threshold-study"] },
  { href: "/admin/comp-calendar",    label: "Calendario" },
  { href: "/admin/comp-review",      label: "Review" },
  { href: "/admin/comp-exam",        label: "Esame creator" },
  { href: "/admin/payout-tree",      label: "Albero payout" },
  { href: "/admin/shift-research",   label: "Research" },
];

export default function CompNav({ palette } = {}) {
  const P = palette || CP; // palette alternativa (tema chiaro del pilota)
  const pathname = String(usePathname() || "").replace(/\/$/, "");
  return (
    <nav aria-label="Comp & Ben" className="ds-tabs" style={{ display: "flex", alignItems: "flex-end", gap: 22, borderBottom: `1px solid ${P.border}`, margin: "0 0 22px", overflowX: "auto", scrollbarWidth: "none", fontFamily: FONTS.body }}>
      {TOOLS.map(({ href, label, also }) => {
        const active = pathname === href || (also || []).includes(pathname);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            style={{ display: "inline-block", padding: "8px 0 10px", marginBottom: -1, borderBottom: `2px solid ${active ? P.accent : "transparent"}`, color: active ? P.textPrimary : P.textSecondary, fontSize: 14.5, fontWeight: active ? 500 : 400, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
