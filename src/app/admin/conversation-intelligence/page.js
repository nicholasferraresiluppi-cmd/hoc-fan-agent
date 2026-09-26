"use client";

/**
 * Presidio chat (Conversation Intelligence · Tier-1).
 *
 * Qualità del presidio conversazionale per creator: latenza di prima risposta,
 * copertura entro SLA, response rate — ricavata dai transcript in BigQuery usando
 * SOLO metadati (chi-invia-a-chi, timestamp), mai il contenuto dei messaggi.
 *
 * Grana: CREATOR (account). Il per-operatore è la fase 2 (join sul turno).
 * Vedi docs/CONVERSATION_INTELLIGENCE.md.
 */
import { useEffect, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice } from "@/components/ds";

// Redesign 26/09/2026 (pannello tester): numero principale → filtro "sotto soglia"
// collegato alla sintesi → tabella ordinabile con intestazione ferma; spiegato cosa
// vuol dire P90 e segnalata la "coda lunga" (quasi tutti rispondono presto ma
// qualche fan aspetta molto: prima era un rosso isolato senza spiegazione).
const pct = (v) =>
  v == null ? "—" : (v * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const num = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const dec = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

const OK5 = 0.85, LOW5 = 0.7, OKP90 = 6, BADP90 = 12;
const col5 = (v) => (v == null ? CP.textMuted : v >= OK5 ? CP.accentGreen : v >= LOW5 ? CP.textPrimary : CP.accentRed);
const colP90 = (v) => (v == null ? CP.textMuted : v <= OKP90 ? CP.accentGreen : v <= BADP90 ? CP.textPrimary : CP.accentRed);
const isLow = (r) => r.within_5min != null && r.within_5min < LOW5;
// Coda lunga: la maggior parte risponde entro 5 min ma 1 fan su 10 aspetta oltre la soglia critica
const longTail = (r) => !isLow(r) && r.frt_p90_min != null && r.frt_p90_min > BADP90;

export default function ConversationIntelligencePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/conversation-intelligence");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
        setData(json);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = (data?.by_creator || []).map((r) => ({ ...r, id: r.creator_id }));
  const low = rows.filter(isLow);
  const tail = rows.filter(longTail);
  const sorted5 = rows.map((r) => r.within_5min).filter((v) => v != null).sort((a, b) => a - b);
  const median5 = sorted5.length ? sorted5[Math.floor(sorted5.length / 2)] : null;
  const shown = filter === "low" ? low : filter === "tail" ? tail : rows;

  const columns = [
    { key: "creator", label: "Creator", render: (r) => (
      <span>
        <span style={{ fontWeight: 500 }}>{r.creator}</span>
        {longTail(r) && <span title={`Il ${pct(r.within_5min)} riceve risposta entro 5 minuti, ma 1 fan su 10 aspetta più di ${dec(r.frt_p90_min)} minuti: di solito un buco in certe fasce orarie.`} style={{ marginLeft: 8, fontSize: 12, color: CP.textMuted }}>coda lunga</span>}
      </span>
    ) },
    { key: "within_5min", label: "Entro 5 min", align: "right", render: (r) => <span style={{ color: col5(r.within_5min), fontWeight: 500 }}>{pct(r.within_5min)}</span> },
    { key: "frt_p90_min", label: "1 fan su 10 aspetta oltre", align: "right", render: (r) => <span style={{ color: colP90(r.frt_p90_min), fontWeight: 500 }}>{r.frt_p90_min == null ? "—" : `${dec(r.frt_p90_min)} min`}</span> },
    { key: "within_15min", label: "Entro 15 min", align: "right", muted: true, render: (r) => pct(r.within_15min) },
    { key: "response_rate", label: "Fan che ricevono risposta", align: "right", muted: true, render: (r) => pct(r.response_rate) },
    { key: "msgs_day", label: "Messaggi al giorno", align: "right", muted: true, render: (r) => num(r.msgs_day) },
    { key: "ratio", label: "Messaggi nostri per 1 del fan", align: "right", muted: true, render: (r) => (r.ratio == null ? "—" : dec(r.ratio)) },
  ];

  const updated = data?.generated_at
    ? `aggiornato ${new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Presidio chat" }]}
        title="Presidio chat"
        subtitle="Quanto velocemente rispondiamo ai fan, creator per creator, negli ultimi 7 giorni. Anticipa i cali: una chat lenta oggi è meno venduto fra qualche settimana."
      />

      {error && <Notice danger>{error}</Notice>}
      {loading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento dal warehouse…</div>}
      {!loading && !error && rows.length === 0 && <Notice>Nessuna creator con conversazioni nel periodo.</Notice>}

      {!loading && !error && rows.length > 0 && (<>
        <HeroMetric
          label="Risposte entro 5 minuti · creator a metà classifica"
          value={pct(median5)}
          compare={`obiettivo ≥ ${Math.round(OK5 * 100)}% · sotto ${Math.round(LOW5 * 100)}% il presidio va rinforzato`}
          hint={updated}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Creator monitorate" value={num(rows.length)} />
            <Metric label="Sotto soglia" value={num(low.length)} danger={low.length > 0} note={low.length ? "meno del 70% entro 5 min" : "tutte sopra soglia"} />
            <Metric label="Con coda lunga" value={num(tail.length)} note="veloci in media, ma qualche fan aspetta molto" />
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <FilterChip label={`Tutte (${rows.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label={`Sotto soglia (${low.length})`} danger={low.length > 0} active={filter === "low"} onClick={() => setFilter("low")} disabled={!low.length} />
          <FilterChip label={`Coda lunga (${tail.length})`} active={filter === "tail"} onClick={() => setFilter("tail")} disabled={!tail.length} />
        </div>

        <DataTable columns={columns} rows={shown} defaultSort={{ key: "within_5min", dir: 1 }} minWidth={900} maxHeight="calc(100vh - 260px)" empty="Nessuna creator in questo filtro." />

        <div style={{ marginTop: 10, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
          Verde = ok (≥ 85% entro 5 min, 1 fan su 10 aspetta al massimo 6 min) · rosso = da rinforzare (&lt; 70%, oltre 12 min).
          Misurato per creator, non per operatore: in un turno a più persone non si sa chi doveva rispondere.
          Calcolato solo da orari e mittenti dei messaggi, mai dal testo.
        </div>
      </>)}
    </div>
  );
}
