"use client";

import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { BarChart3, ExternalLink } from "lucide-react";

/**
 * Analytics — portale Looker Studio dentro HOC Pro.
 *
 * Lista di report Looker che si aprono in nuova tab del browser.
 * Il browser dell'utente è già loggato a Google (sessione persistente Chrome),
 * quindi la nuova tab carica il report normalmente.
 *
 * Scelta architetturale: NON usiamo iframe embed perché molti report hanno
 * "Visualizzazione in altri siti web" disabilitata dal proprietario (è una
 * setting Looker), e Google blocca l'iframe a monte indipendentemente da
 * login/permessi. La nuova tab funziona invece sempre.
 *
 * Per aggiungere un nuovo report: aggiungi un oggetto in REPORTS.
 */
const REPORTS = [
  {
    id: "hoc-analytics-3",
    title: "HOC Analytics 3.0",
    description: "Dashboard principale — revenue per creator, subscribers, chargeback, KPI agency",
    url: "https://lookerstudio.google.com/reporting/0aa0b857-b441-4969-bc85-8cdc32acb6f5/page/p_ljomtrr8bd",
    accent: "#3B82F6",
    icon: "📊",
  },
];

export default function AnalyticsReportsPage() {
  return (
    <div style={{ padding: "32px 28px 80px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Analytics</span>
          </div>
        }
        section="Data &amp; Integrations · Analytics"
        title="Analytics — Looker Studio"
        subtitle={<>
          Lista dei report Looker Studio integrati nella webapp. Click su una card per
          aprire il report in una nuova tab del browser. Sei già loggato Google nel tuo
          Chrome: il report si carica normalmente.
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {REPORTS.map((r) => (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              background: CP.surface,
              border: `1px solid ${r.accent}33`,
              borderRadius: 14,
              padding: 24,
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = r.accent + "88"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = r.accent + "33"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: r.accent + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {r.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: CP.textPrimary, marginBottom: 4 }}>{r.title}</div>
                <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{r.description}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${CP.border}` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: r.accent, fontSize: 12, fontWeight: 700 }}>
                <ExternalLink size={13} /> Apri in nuova tab
              </span>
            </div>
          </a>
        ))}
        <div style={{ padding: 24, border: `1px dashed ${CP.border}`, borderRadius: 14, color: CP.textMuted, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 160 }}>
          <BarChart3 size={28} color={CP.textMuted} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div style={{ fontSize: 13, marginBottom: 4 }}>Aggiungi altri report</div>
          <div style={{ fontSize: 11, color: CP.textMuted }}>Mandami URL e titolo, lo metto qua sotto</div>
        </div>
      </div>
    </div>
  );
}
