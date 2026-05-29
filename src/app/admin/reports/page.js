"use client";

import { useState } from "react";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { BarChart3, ExternalLink, ArrowLeft, Maximize2, AlertTriangle, LogIn } from "lucide-react";

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

      {/* Info banner — perché apriamo in nuova tab di default */}
      <div style={{ padding: "12px 16px", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10, fontSize: 12, color: CP.textSecondary, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <AlertTriangle size={14} color="#F59E0B" style={{ marginTop: 1, flexShrink: 0 }} />
        <div>
          I report si aprono di default in <strong>nuova tab</strong>. Motivo: i proprietari hanno disabilitato la visualizzazione embedded
          ("La visualizzazione in altri siti è stata disattivata"). Per integrare un report dentro la webapp tramite iframe, il proprietario deve
          aprire il report → File → Embed report → spuntare "Enable embedding". Da quel momento il bottone <em>"Prova embed"</em> qui sotto funzionerà.
        </div>
      </div>

      {/* Login Google button — apre Google login in popup, poi ricarica la pagina */}
      <div style={{ padding: "12px 16px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: CP.textSecondary, flex: 1, minWidth: 220 }}>
          Se l'embed non si carica e non sei loggato Google, prova prima a effettuare il login con questo bottone (apre la pagina ufficiale Google in popup):
        </div>
        <button
          onClick={() => {
            const w = 500, h = 650;
            const left = (window.screen.width / 2) - (w / 2);
            const top = (window.screen.height / 2) - (h / 2);
            const popup = window.open(
              "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Flookerstudio.google.com%2F",
              "google-login",
              `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,location=yes,status=no,scrollbars=yes`
            );
            // Quando il popup viene chiuso, ricarica la pagina così iframe re-tenta con cookie freschi
            if (popup) {
              const timer = setInterval(() => {
                if (popup.closed) {
                  clearInterval(timer);
                  window.location.reload();
                }
              }, 800);
            }
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px",
            background: "#fff",
            color: "#3c4043",
            border: "1px solid #dadce0",
            borderRadius: 8,
            fontSize: 13, fontWeight: 500,
            cursor: "pointer",
            fontFamily: "Roboto, sans-serif",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Accedi con Google
        </button>
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
            <div style={{ display: "flex", gap: 8, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${CP.border}`, flexWrap: "wrap" }}>
              <a
                href={r.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  background: r.accent,
                  color: "#0a0a0a",
                  borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={13} /> Apri in nuova tab
              </a>
              <button
                onClick={() => setActiveReport(r)}
                title="Tenta l'embed dentro la webapp — funziona solo se il proprietario del report ha abilitato 'Enable embedding'"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  background: "transparent",
                  border: `1px solid ${CP.border}`,
                  borderRadius: 8,
                  color: CP.textSecondary,
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                <Maximize2 size={13} /> Prova embed
              </button>
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
