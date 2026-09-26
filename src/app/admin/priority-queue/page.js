"use client";

/**
 * Priority Queue (Fase 0) — "quale fan seguire ora" per creator.
 *
 * Worklist degli spender per stato: IN ATTESA (ha scritto, non risposto oltre SLA) o
 * SI RAFFREDDA (whale silenzioso 3-21gg), ordinati per valore. Dati fan sensibili
 * (username + LTV) → pagina gated scope "all". Il deep-link a Infloww non esiste
 * (app desktop) → si copia lo @username e si incolla nella ricerca Infloww.
 *
 * Redesign DS (26/09/2026): numero principale = fan che aspettano una risposta,
 * filtro per stato, tabella ordinabile con intestazione ferma, gergo tradotto
 * (LTV → speso in tutto, txn → acquisti, SLA/whale spiegati). API invariata.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, Copy, Check, Clock, Snowflake } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$, fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Notice, DataTable, card } from "@/components/ds";

function ago(hours) {
  if (hours == null) return "—";
  if (hours < 48) return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  const g = Math.round(hours / 24);
  return `${g} ${g === 1 ? "giorno" : "giorni"}`;
}

export default function PriorityQueuePage() {
  const [creators, setCreators] = useState([]);
  const [creatorId, setCreatorId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [filter, setFilter] = useState("all");

  // carica la lista creator una volta
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/priority-queue");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
        setCreators(json.creators || []);
        if (json.creators?.length) setCreatorId(json.creators[0].creator_id);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, []);

  // carica la coda quando cambia creator
  useEffect(() => {
    if (!creatorId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/priority-queue?creator_id=${encodeURIComponent(creatorId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
        setData(json);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [creatorId]);

  const copyUser = useCallback((username) => {
    try {
      navigator.clipboard.writeText(username);
      setCopied(username);
      setTimeout(() => setCopied((c) => (c === username ? null : c)), 1400);
    } catch {}
  }, []);

  const rows = data?.rows || [];
  const waiting = rows.filter((r) => r.state === "waiting");
  const cooling = rows.filter((r) => r.state === "cooling");
  const visible = filter === "waiting" ? waiting : filter === "cooling" ? cooling : rows;
  const waitingValue = waiting.reduce((s, r) => s + (Number(r.ltv_usd) || 0), 0);

  const columns = [
    { key: "username", label: "Fan", render: (r) => <span style={{ color: CP.textPrimary }}>@{r.username}</span> },
    {
      key: "state", label: "Stato", sort: (r) => (r.state === "waiting" ? 0 : 1),
      render: (r) => {
        const w = r.state === "waiting";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: w ? CP.accentRed : CP.textSecondary, whiteSpace: "nowrap" }}>
            {w ? <Clock size={13} /> : <Snowflake size={13} />}
            {w ? "Aspetta risposta" : "Si raffredda"}
          </span>
        );
      },
    },
    { key: "ltv_usd", label: "Speso in tutto", align: "right", sort: (r) => Number(r.ltv_usd), render: (r) => fmt$(r.ltv_usd) },
    { key: "txns", label: "Acquisti", align: "right", sort: (r) => Number(r.txns), render: (r) => fmtInt(r.txns) },
    {
      key: "since", label: "Da quanto", align: "right",
      sort: (r) => (r.state === "waiting" ? r.hrs_since_fan : r.hrs_since_active),
      render: (r) => {
        const w = r.state === "waiting";
        return <span style={{ color: w ? CP.accentRed : CP.textSecondary, whiteSpace: "nowrap" }}>{ago(w ? r.hrs_since_fan : r.hrs_since_active)}</span>;
      },
    },
    { key: "msgs_30d", label: "Messaggi in 30 giorni", align: "right", sort: (r) => Number(r.msgs_30d), render: (r) => <span style={{ color: CP.textSecondary }}>{fmtInt(r.msgs_30d)}</span> },
    {
      key: "copy", label: "", sortable: false,
      render: (r) => {
        const done = copied === r.username;
        return (
          <button
            onClick={() => copyUser(r.username)}
            title="Copia lo username per cercarlo in Infloww"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
              background: done ? alpha(CP.accentGreen, "22") : CP.surface,
              color: done ? CP.accentGreen : CP.textSecondary,
              border: `1px solid ${CP.border}`, fontSize: 12, fontFamily: FONTS.body, whiteSpace: "nowrap",
            }}
          >
            {done ? <Check size={13} /> : <Copy size={13} />}
            {done ? "Copiato" : "Copia"}
          </button>
        );
      },
    },
  ];

  const creatorName = data?.creator_name || creators.find((c) => c.creator_id === creatorId)?.creator_name || "questa creator";

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Priority queue" }]}
        title="Priority queue"
        subtitle="Quale fan seguire adesso, creator per creator: chi ha scritto e aspetta ancora una risposta, e i fan che spendono tanto ma sono spariti da qualche giorno. In cima quelli che valgono di più."
        actions={
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            aria-label="Creator"
            style={{ background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, fontFamily: FONTS.body, minWidth: 200 }}
          >
            {creators.map((c) => (
              <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
            ))}
          </select>
        }
      />

      <Notice>
        Dati dei fan riservati. Infloww non ha un link diretto alla conversazione: premi <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Copia</b> accanto al fan e incolla il nome nella ricerca di Infloww.
        È un suggerimento: chi sta al turno decide sempre.
      </Notice>

      {error && <Notice danger>{error}</Notice>}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 14, padding: "16px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Carico la coda…
        </div>
      )}

      {!loading && !error && data && rows.length === 0 && (
        <div style={{ ...card, padding: "22px 20px", color: CP.textSecondary, fontSize: 14 }}>
          Per {creatorName} non c'è nessun fan di valore che aspetta una risposta o che si sta raffreddando. Niente da recuperare adesso.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <HeroMetric
            label="Fan che aspettano una risposta"
            value={fmtInt(waiting.length)}
            compare={waiting.length ? `Insieme hanno speso ${fmt$(waitingValue)}: sono i primi da riprendere.` : "Nessuno aspetta una risposta in questo momento."}
            hint={data?.generated_at
              ? `Aggiornato ${new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${data.cached ? " (dati salvati, non ricalcolati ora)" : ""}.`
              : null}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Si stanno raffreddando" value={fmtInt(cooling.length)} />
            </div>
          </HeroMetric>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <FilterChip label={`Tutti · ${rows.length}`} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label={`Aspettano risposta · ${waiting.length}`} active={filter === "waiting"} onClick={() => setFilter("waiting")} />
            <FilterChip label={`Si raffreddano · ${cooling.length}`} active={filter === "cooling"} onClick={() => setFilter("cooling")} />
          </div>

          <DataTable columns={columns} rows={visible.map((r) => ({ ...r, id: r.username }))} minWidth={780} maxHeight={640} />

          <div style={{ marginTop: 12, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            <span style={{ color: CP.textSecondary }}>Aspetta risposta</span>: ha scritto e non ha avuto risposta da più di 20 minuti (fino a 48 ore).
            {" "}<span style={{ color: CP.textSecondary }}>Si raffredda</span>: un fan che spende molto e non si fa sentire da 3 a 21 giorni.
            {" "}Speso in tutto = spesa netta del fan, verificata sulle transazioni. Fonte: warehouse BigQuery (chat e anagrafica fan).
          </div>
        </>
      )}
    </div>
  );
}
