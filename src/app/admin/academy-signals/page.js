"use client";

// Academy Signals — "quali comportamenti pagano da noi" (Tier 2).
// Vista read-only, admin: correlazioni comportamento→revenue dal warehouse,
// con consistenza e caveat espliciti. Informa il coaching, non lo score.
//
// Redesign 26/09/2026 (pannello tester SM/TL/UX): il numero "+0,36" non diceva
// niente senza sapere cos'è una correlazione → legenda in parole in testa e
// "legame" al posto di "corr"; la base (quanti turni) era nascosta in fondo →
// accanto al titolo; i comportamenti SENZA legame restano visibili ma in una
// sezione a parte (servono a non alimentare miti, non a decidere).

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Disclosure, Notice, card, NUM } from "@/components/ds";
import { fmtInt } from "@/lib/format";
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

const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };

function DirectionIcon({ s }) {
  if (isNoSignal(s)) return <Minus size={16} color={CP.textMuted} />;
  return s.direction === "up" ? <ArrowUp size={16} color={CP.accentGreen} /> : <ArrowDown size={16} color={CP.accentRed} />;
}

function SignalCard({ s }) {
  const noSignal = isNoSignal(s);
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DirectionIcon s={s} />
          <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{s.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 13, color: CP.textMuted }}>{noSignal ? "nessun legame" : `legame ${s.strength}`}</span>
          <span style={{ fontSize: 16, fontWeight: 500, color: valueColor(s), minWidth: 52, textAlign: "right", ...NUM }}>{fmtCorr(s.mean_corr)}</span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "8px 0 0" }}>{s.measure}</p>

      {!noSignal && s.coaching && (
        <p style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.5, margin: "8px 0 0" }}>
          <span style={{ color: CP.textMuted }}>Cosa allenare: </span>
          {s.coaching}
        </p>
      )}

      {!noSignal && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0 0", fontSize: 12, color: CP.textMuted, ...NUM }}>
          <span>
            <span style={{ color: s.consistency >= 0.75 ? CP.textPrimary : CP.textSecondary }}>
              {s.agree} creator su {s.creators}
            </span>{" "}
            vanno nella stessa direzione
          </span>
          <span>{s.direction === "up" ? "più è meglio" : "meno è meglio"}</span>
        </div>
      )}

      {s.caveat && (
        <p style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5, margin: "8px 0 0" }}>
          <span style={{ color: CP.textSecondary }}>Attenzione: </span>
          {s.caveat}
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
  const [showNone, setShowNone] = useState(false);

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
  const withSignal = signals.filter((s) => !isNoSignal(s));
  const noSignal = signals.filter(isNoSignal);
  const updated = data?.generated_at
    ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Training" }, { label: "Signals" }]}
        title="Cosa fa vendere da noi"
        subtitle="Quali abitudini degli operatori vanno insieme a più venduto all'ora, misurate sui nostri turni veri. Serve a scegliere su cosa allenare il team: non entra nello score."
        actions={
          <button onClick={refresh} disabled={busy || data?.bigquery === false} style={{ ...btn, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Ricalcolo…" : "Ricalcola"}
          </button>
        }
      />

      {refreshErr && <Notice danger>Ricalcolo fallito: {refreshErr}.</Notice>}

      {error ? (
        <Notice danger>Non riesco a calcolare i segnali: {error.message}.</Notice>
      ) : data?.bigquery === false ? (
        <Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente: i segnali non sono calcolabili.</Notice>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Calcolo dai turni reali…</div>
      ) : signals.length === 0 ? (
        <Notice>Nessun segnale calcolato: non ci sono abbastanza turni con un solo operatore in chat nel periodo. Prova &quot;Ricalcola&quot; più tardi.</Notice>
      ) : (
        <>
          <Notice>
            <strong style={{ fontWeight: 500, color: CP.textPrimary }}>Come leggere il numero.</strong> Va da −1 a +1 e dice quanto
            un&apos;abitudine va insieme al venduto all&apos;ora. Qui contano anche valori piccoli: sotto 0,07 nessun legame, da 0,07 debole, da 0,15 moderato, da 0,3 forte (con i turni reali, pieni di altre variabili, 0,3 è già tanto). Il
            segno dice la direzione: + vuol dire &quot;più ne fai, più vendi&quot;, − il contrario. È una correlazione: le due cose vanno
            insieme, non è detto che una causi l&apos;altra. Contano solo i turni con un solo operatore in chat (così si sa chi ha scritto),
            confrontati dentro la stessa creator (una creator ricca non gonfia il risultato).
          </Notice>

          <SectionTitle aside={data?.shifts_analyzed != null ? `${fmtInt(data.shifts_analyzed)} turni con un solo operatore · ${fmtInt(data.creators_analyzed)} creator · ultimi ${data?.params?.days} giorni` : null}>
            Abitudini legate al venduto ({withSignal.length})
          </SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {withSignal.map((s) => (
              <SignalCard key={s.key} s={s} />
            ))}
            {withSignal.length === 0 && <Notice>Nessuna abitudine mostra un legame col venduto in questo periodo.</Notice>}
          </div>

          {noSignal.length > 0 && (
            <Disclosure
              open={showNone}
              onToggle={() => setShowNone(!showNone)}
              title={`Senza legame con il venduto (${noSignal.length})`}
              summary={`${noSignal.map((s) => s.label).join(", ")} — da noi non fanno differenza: non serve allenarle`}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {noSignal.map((s) => (
                  <SignalCard key={s.key} s={s} />
                ))}
              </div>
            </Disclosure>
          )}

          <div style={{ marginTop: 8, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            Metodo {data?.version}: correlazione di Pearson calcolata dentro ogni creator e poi mediata tra le creator.
            {updated ? ` Aggiornato ${updated}.` : ""}
            {data?.cached ? " (dati in cache)" : ""}
          </div>
        </>
      )}
    </div>
  );
}
