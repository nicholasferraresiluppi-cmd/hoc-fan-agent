"use client";

// Lezioni Academy — indice del nuovo formato "carta-lezione" evidence-based:
// curriculum estratto dalle conversazioni reali che hanno venduto, curato e
// etichettato per evidenza (decision log 26 lug 2026). Prima carta: PPV gradini.

import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore di caricamento")))));

const fmtInt = (n) => Number(n || 0).toLocaleString("it-IT");

export default function LezioniPage() {
  const { data, error, isLoading } = useSWR("/api/academy/lessons", fetcher);
  const cards = data?.cards || [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Academy"
        title="Lezioni"
        subtitle="Il nuovo formato: lezioni estratte dalle conversazioni reali che hanno venduto — non scritte a tavolino. Ogni affermazione porta un'etichetta di evidenza (dato, correlazione, osservato) e la linea rossa di ciò che, pur osservato, non si insegna."
      />

      {error ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          Non riesco a caricare le lezioni: {error.message}. Riprova tra poco.
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico le lezioni…</div>
      ) : cards.length === 0 ? (
        <div style={{ padding: "28px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14 }}>
          Nessuna lezione pubblicata per ora.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c) => (
            <Link
              key={c.id}
              href={`/academy/lezioni/${c.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                background: CP.surface,
                border: `1px solid ${CP.border}`,
                borderRadius: 12,
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>{c.title}</div>
                <span
                  style={{
                    fontSize: 11,
                    color: CP.accentSoftText,
                    background: CP.accentSoft,
                    borderRadius: 6,
                    padding: "3px 8px",
                    textTransform: "lowercase",
                  }}
                >
                  {c.status}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{c.subtitle}</div>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: CP.textMuted }}>
                <span>{c.creator}</span>
                <span>{fmtInt(c.provenance?.episodi)} episodi analizzati</span>
                <span>{fmtInt(c.provenance?.sequenze_etichettate)} sequenze etichettate</span>
                <span>{c.provenance?.finestra}</span>
              </div>
              {c.trains?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: CP.textMuted }}>Allena il gap:</span>
                  {c.trains.map((t) => (
                    <span
                      key={t.key}
                      style={{ fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 999, padding: "2px 9px" }}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}

          <div style={{ marginTop: 8, padding: "16px 20px", background: CP.surface, border: `1px dashed ${CP.border}`, borderRadius: 12, fontSize: 13, color: CP.textMuted, lineHeight: 1.6 }}>
            <span style={{ color: CP.textSecondary, fontWeight: 500 }}>In coda:</span> la replica del formato sugli altri
            creator (per separare il metodo generale dal sistema-creator, come già fatto per i gradini) e un batch di
            sequenze perse citabili per rafforzare gli anti-esempi. Le lezioni si aggiungono solo dopo estrazione dal reale e curatela.
          </div>
        </div>
      )}
    </div>
  );
}
