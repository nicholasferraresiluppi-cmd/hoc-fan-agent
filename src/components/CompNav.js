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
import { tabStyle, TABS_BAR } from "@/components/ds";

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
    <nav aria-label="Comp & Ben" className="ds-tabs" style={{ ...TABS_BAR, borderBottom: `1px solid ${P.borderStrong}`, margin: "0 0 22px", fontFamily: FONTS.body }}>
      {TOOLS.map(({ href, label, also }) => {
        const active = pathname === href || (also || []).includes(pathname);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className="hoc-tab" style={tabStyle(active, { P })}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
