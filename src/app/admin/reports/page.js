"use client";

import { ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, card } from "@/components/ds";

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
 *
 * Ridisegno 26/09/2026 (design system): elenco semplice (niente emoji/colori
 * per report), cosa trovi in ogni report e cosa serve per aprirlo.
 */
const REPORTS = [
  {
    id: "hoc-analytics-3",
    title: "HOC Analytics 3.0",
    description: "Il cruscotto principale dell'agenzia: incasso per creator, abbonati, chargeback (rimborsi contestati) e KPI dell'agenzia.",
    url: "https://lookerstudio.google.com/reporting/0aa0b857-b441-4969-bc85-8cdc32acb6f5/page/p_ljomtrr8bd",
  },
];

export default function AnalyticsReportsPage() {
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Analytics" }]}
        title="Report Looker Studio"
        subtitle="I report dell'agenzia costruiti su Looker Studio (Google). Si aprono in una nuova scheda: serve essere entrati in Google con l'account aziendale che ha accesso al report."
      />

      <div style={card}>
        {REPORTS.map((r, i) => (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 18px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 4 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{r.description}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, whiteSpace: "nowrap" }}>
              <ExternalLink size={13} /> Apri in una nuova scheda
            </span>
          </a>
        ))}
      </div>

      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10, lineHeight: 1.55 }}>
        Se il report non si apre o chiede l&apos;accesso, chiedilo al proprietario del report in Looker Studio. Per aggiungere un report a questo elenco servono il link e il titolo: vanno inseriti da chi gestisce l&apos;app.
      </div>
    </div>
  );
}
