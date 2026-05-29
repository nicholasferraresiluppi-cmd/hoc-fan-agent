"use client";

import { useState } from "react";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { BarChart3, ExternalLink, ArrowLeft, Maximize2 } from "lucide-react";

/**
 * Analytics — portale Looker Studio dentro HOC Pro.
 *
 * Mostra una lista di report Looker. Click su una card → iframe full-screen.
 * Il browser dell'utente è già loggato Google (sessione persistente del Chrome),
 * quindi l'iframe carica direttamente il report. Fallback "Apri in nuova tab"
 * se Google blocca l'embed (X-Frame-Options).
 *
 * Per aggiungere un nuovo report: aggiungi un oggetto in REPORTS qui sotto.
 * URL view → URL embed: sostituisci `/reporting/` con `/embed/reporting/`.
 */
const REPORTS = [
  {
    id: "hoc-analytics-3",
    title: "HOC Analytics 3.0",
    description: "Dashboard principale — revenue per creator, subscribers, chargeback, KPI agency",
    viewUrl: "https://lookerstudio.google.com/reporting/0aa0b857-b441-4969-bc85-8cdc32acb6f5/page/p_ljomtrr8bd",
    embedUrl: "https://lookerstudio.google.com/embed/reporting/0aa0b857-b441-4969-bc85-8cdc32acb6f5/page/p_ljomtrr8bd",
    accent: "#3B82F6",
    icon: "📊",
  },
];

export default function AnalyticsReportsPage() {
  const [activeReport, setActiveReport] = useState(null);

  if (activeReport) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body }}>
        {/* Compact header in fullscreen mode */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${CP.border}`, background: CP.surface, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => setActiveReport(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body }}
            >
              <ArrowLeft size={13} /> Tutti i report
            </button>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: CP.textPrimary }}>{activeReport.title}</div>
              <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>{activeReport.description}</div>
            </div>
          </div>
          <a
            href={activeReport.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: FONTS.body }}
          >
            <ExternalLink size={13} /> Apri in Looker Studio
          </a>
        </div>
        {/* Iframe full available area */}
        <iframe
          src={activeReport.embedUrl}
          title={activeReport.title}
          style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          allowFullScreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        />
      </div>
    );
  }

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
          I report Looker Studio integrati nella webapp. Click su una card per aprire il report
          incastonato. Il tuo browser è già loggato Google: vedrai il report normalmente,
          come se fosse aperto in una tab Looker dedicata.
        </>}
      />

      {/* Info banner */}
      <div style={{ padding: "12px 16px", background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 10, fontSize: 12, color: CP.textSecondary, marginBottom: 22, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ color: "#3B82F6", fontSize: 14, marginTop: 1 }}>ⓘ</span>
        <div>
          Devi essere loggato al tuo account Google nello stesso browser. Se vedi una schermata di login Google dentro l'iframe,
          completa il login e il report si carica. Per accessi mancanti, chiedi al proprietario del report di aggiungerti come Viewer/Editor.
        </div>
      </div>

      {/* Reports grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {REPORTS.map((r) => (
          <div
            key={r.id}
            style={{
              background: CP.surface,
              border: `1px solid ${r.accent}33`,
              borderRadius: 14,
              padding: 24,
              transition: "border-color 0.15s, transform 0.15s",
              cursor: "pointer",
            }}
            onClick={() => setActiveReport(r)}
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
                <Maximize2 size={13} /> Apri full-screen
              </span>
              <a
                href={r.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, color: CP.textMuted, fontSize: 11, textDecoration: "none" }}
              >
                <ExternalLink size={11} /> tab esterna
              </a>
            </div>
          </div>
        ))}
        {/* Placeholder card per aggiungerne altri */}
        <div style={{ padding: 24, border: `1px dashed ${CP.border}`, borderRadius: 14, color: CP.textMuted, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 160 }}>
          <BarChart3 size={28} color={CP.textMuted} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div style={{ fontSize: 13, marginBottom: 4 }}>Aggiungi altri report</div>
          <div style={{ fontSize: 11, color: CP.textMuted }}>Mandami URL e titolo, lo metto qua sotto</div>
        </div>
      </div>
    </div>
  );
}
