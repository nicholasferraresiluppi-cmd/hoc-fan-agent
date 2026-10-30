"use client";
// Schede in cima alle pagine unite in un gruppo (lib/page-groups). Mostra solo le schede che chi
// guarda può aprire (stessa regola del menu: lib/nav-access).
import Link from "next/link";
import useSWR from "swr";
import { useEffect, useRef } from "react";
import { CP, FONTS } from "@/lib/brand";
import { groupMatch } from "@/lib/page-groups";
import { canSee } from "@/lib/nav-access";

const fetcher = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export default function PageTabs({ pathname }) {
  const m = groupMatch(pathname);
  const ref = useRef(null);
  // telefono: la striscia scorre di lato → la scheda aperta resta visibile
  useEffect(() => { const a = ref.current?.querySelector("[aria-current]"); if (a && ref.current.scrollWidth > ref.current.clientWidth) ref.current.scrollLeft = a.offsetLeft - 16; }, [pathname]);
  const { data: who } = useSWR(m ? "/api/whoami" : null, fetcher, { revalidateOnFocus: false });
  if (!m) return null;
  const cur = String(pathname).replace(/\/$/, "");
  const tabs = m.group.tabs
    .map(([href, label]) => [href.replace(":e", m.param || ""), label, href.replace("/:e", "")])
    .filter(([, , base]) => !who || canSee(base, who.capabilities, who.admin));
  if (tabs.length < 2) return null;
  return (
    // schede = testo sottolineato (regole d'uso 29/10): non pillole, che nell'app sono i filtri
    <nav ref={ref} className="pg-tabs" aria-label={m.group.label} style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-end", padding: "18px 24px 0", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <span className="pg-tabs-l" style={{ fontSize: 12.5, color: CP.textMuted, marginRight: -6, paddingBottom: 9 }}>{m.group.label}</span>
      {tabs.map(([href, label]) => {
        const on = href === cur;
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            style={{ fontSize: 14, padding: "6px 0 8px", whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none", borderBottom: `2px solid ${on ? CP.accent : "transparent"}`, color: on ? CP.textPrimary : CP.textSecondary, fontWeight: on ? 500 : 400 }}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
