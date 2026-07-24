"use client";

// Academy Signals — "quali comportamenti pagano da noi" (Tier 2).
// Vista read-only, admin: correlazioni comportamento→revenue dal warehouse,
// con consistenza e caveat espliciti. Informa il coaching, non lo score.

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const isNoSignal = (s) => s.strength === "nessun segnale" || s.strength === "n/d";
// Colore coerente con la DIREZIONE (verde = più paga, rosso = meno paga), non con
// la forza: un segnale negativo forte non deve apparire verde con la freccia rossa.
const valueColor = (s) => (isNoSignal(s) ? CP.textMuted : s.direction === "up" ? CP.accentGreen : CP.accentRed);
const fmtCorr = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

function DirectionIcon({ s }) {
  if (isNoSignal(s)) return <Minus size={16} color={CP.textMuted} />;
  return s.direction === "up" ? (
    <ArrowUp size={16} color={CP.accentGreen} />
  ) : (
    <ArrowDown size={16} color={CP.accentRed} />
  );
}

function SignalCard({ s }) {
  const noSignal = isNoSignal(s);
  const color = valueColor(s);
  return (
    <div
      style={{
        background: CP.surface,
        border: `1px solid ${CP.border}`,
        borderLeft: `3px solid ${noSignal ? CP.borderSoft : color}`,
        borderRadius: 12,
        padding: "16px 18px",
        opacity: noSignal ? 0.72 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DirectionIcon s={s} />
          <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>
            {s.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 12, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.strength}</span>
          <span style={{ fontSize: 15, fontWeight: 500, color, minWidth: 52, textAlign: "right" }}>
            {fmtCorr(s.mean_corr)}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "10px 0 0" }}>{s.measure}</p>

      {!noSignal && s.coaching && (
        <p style={{ fontSize: 13.5, color: CP.textPrimary, lineHeight: 1.5, margin: "8px 0 0" }}>
          <span style={{ color: CP.accentSoftText }}>Coaching:</span> {s.coaching}
        </p>
      )}

      {!noSignal && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0 0", fontSize: 12, color: CP.textMuted }}>
          <span>
            Consistenza:{" "}
            <span style={{ color: s.consistency >= 0.75 ? CP.accentGreen : CP.textSecondary }}>
              {s.agree}/{s.creators} creator concordano
            </span>
          </span>
          <span>{s.direction === "up" ? "più è meglio" : "meno è meglio"}</span>
        </div>
      )}

      {s.caveat && (
        <p style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5, margin: "8px 0 0", fontStyle: "italic" }}>
          ⚠ {s.caveat}
        </p>
      )}
    </div>
  );
}

export default function AcademySignalsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/academy-signals", fetcher, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);

  async function refresh() {
    setBusy(true);
    setRefreshErr(null);
    try {
      const res = await fetch("/api/admin/academy-signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const fresh = await res.json();
      if (res.ok) mutate(fresh, { revalidate: false });
      else setRefreshErr(fresh.error || "Ricalcolo fallito");
    } catch (e) {
      setRefreshErr(e.message || "Ricalcolo fallito");
    } finally {
      setBusy(false);
    }
  }

  const signals = data?.signals || [];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Admin · Academy"
        title="Signals — cosa paga da noi"
        subtitle="Quali comportamenti degli operatori correlano col revenue/ora, calcolati sui turni a operatore singolo (attribuzione pulita) e DENTRO ogni creator (niente effetto creator ricco). Informa il coaching, non entra nello score."
        toolbar={
          <button
            onClick={refresh}
            disabled={busy || data?.bigquery === false}
            style={{
              background: CP.surfaceAlt,
              color: CP.textPrimary,
              border: `1px solid ${CP.border}`,
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Ricalcolo…" : "Ricalcola"}
          </button>
        }
      />

      {refreshErr && (
        <div style={{ padding: "12px 16px", marginBottom: 12, background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 10, color: CP.accentRed, fontSize: 13 }}>
          Ricalcolo fallito: {refreshErr}.
        </div>
      )}

      {error ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          Non riesco a calcolare i signals: {error.message}.
        </div>
      ) : data?.bigquery === false ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14 }}>
          BigQuery non configurato in questo ambiente: i signals non sono calcolabili.
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Calcolo dai turni reali…</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {signals.map((s) => (
              <SignalCard key={s.key} s={s} />
            ))}
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            Base: {data?.shifts_analyzed?.toLocaleString("it-IT")} turni a operatore singolo su{" "}
            {data?.creators_analyzed} creator, ultimi {data?.params?.days} giorni. Metodologia {data?.version}, correlazione
            di Pearson within-creator (media delle correlazioni per creator). Aggiornato{" "}
            {data?.generated_at ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}.
            {data?.cached ? " (cache)" : ""}
          </div>
        </>
      )}
    </div>
  );
}
