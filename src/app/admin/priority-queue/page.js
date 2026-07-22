"use client";

/**
 * Priority Queue (Fase 0) — "quale fan seguire ora" per creator.
 *
 * Worklist degli spender per stato: IN ATTESA (ha scritto, non risposto oltre SLA) o
 * SI RAFFREDDA (whale silenzioso 3-21gg), ordinati per valore. Dati fan sensibili
 * (username + LTV) → pagina gated scope "all". Il deep-link a Infloww non esiste
 * (app desktop) → si copia lo @username e si incolla nella ricerca Infloww.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Copy, Check, Clock, Snowflake } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

const usd = (v) => (v == null ? "—" : "$ " + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const num = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
function ago(hours) {
  if (hours == null) return "—";
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}g`;
}

const th = { padding: "10px 12px", textAlign: "right", fontSize: 10, color: CP.textMuted, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13, whiteSpace: "nowrap" };

export default function PriorityQueuePage() {
  const [creators, setCreators] = useState([]);
  const [creatorId, setCreatorId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

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

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 28px 80px" }}>
      <PageHeader
        section="People"
        title="Priority queue"
        subtitle="Quale fan seguire ora, per creator: chi ha scritto e aspetta oltre lo SLA, e i whale che si stanno raffreddando. Ordinati per valore."
        toolbar={
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            style={{ background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONTS.body, minWidth: 190 }}
          >
            {creators.map((c) => (
              <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
            ))}
          </select>
        }
      />

      <CpCard padding="12px 16px" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertCircle size={15} style={{ color: CP.accentSoftText, marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>
          Dati fan riservati (accesso ristretto). Infloww non espone un link per conversazione: clicca <strong style={{ color: CP.textPrimary }}>copia</strong> sullo username e incollalo nella ricerca di Infloww. Advisory — decide sempre l'operatore.
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 13, padding: "24px 4px" }}>
          <Loader2 size={16} className="animate-spin" /> Interrogazione del warehouse…
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <CpCard padding="28px" style={{ textAlign: "center", color: CP.textMuted, fontSize: 13 }}>
          Nessun fan di valore in attesa o in raffreddamento per {data?.creator_name || "questo creator"}.
        </CpCard>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 18, marginBottom: 14, flexWrap: "wrap" }}>
            <SectionLabel color={CP.accentRed}>{waiting.length} in attesa</SectionLabel>
            <SectionLabel color={CP.textSecondary}>{cooling.length} si raffreddano</SectionLabel>
            {data?.generated_at && (
              <SectionLabel color={CP.textMuted}>
                agg. {new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{data.cached ? " · cache" : ""}
              </SectionLabel>
            )}
          </div>

          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={{ ...th, textAlign: "left" }}>Fan</th>
                    <th style={{ ...th, textAlign: "left" }}>Stato</th>
                    <th style={th}>LTV</th>
                    <th style={th}>Txn</th>
                    <th style={th}>Da quanto</th>
                    <th style={th}>Msg/30gg</th>
                    <th style={{ ...th, textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isWaiting = r.state === "waiting";
                    const since = isWaiting ? r.hrs_since_fan : r.hrs_since_active;
                    return (
                      <tr key={r.username} style={{ borderBottom: `1px solid ${CP.borderSoft}` }}>
                        <td style={{ padding: "9px 12px", textAlign: "left", fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary }}>
                          @{r.username}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "left" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                            background: (isWaiting ? CP.accentRed : CP.textMuted) + "1e",
                            color: isWaiting ? CP.accentRed : CP.textSecondary,
                          }}>
                            {isWaiting ? <Clock size={12} /> : <Snowflake size={12} />}
                            {isWaiting ? "In attesa" : "Si raffredda"}
                          </span>
                        </td>
                        <td style={{ ...td, color: CP.accentGreen, fontWeight: 600 }}>{usd(r.ltv_usd)}</td>
                        <td style={{ ...td, color: CP.textSecondary }}>{num(r.txns)}</td>
                        <td style={{ ...td, color: isWaiting ? CP.accentRed : CP.textSecondary }}>{ago(since)}</td>
                        <td style={{ ...td, color: CP.textMuted }}>{num(r.msgs_30d)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          <button
                            onClick={() => copyUser(r.username)}
                            title="Copia lo username per la ricerca Infloww"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                              background: copied === r.username ? CP.accentGreen + "22" : CP.surfaceAlt,
                              color: copied === r.username ? CP.accentGreen : CP.textSecondary,
                              border: `1px solid ${CP.border}`, fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                            }}
                          >
                            {copied === r.username ? <Check size={13} /> : <Copy size={13} />}
                            {copied === r.username ? "copiato" : "copia"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CpCard>

          <div style={{ marginTop: 12, fontSize: 11.5, color: CP.textMuted, lineHeight: 1.5 }}>
            <span style={{ color: CP.accentRed }}>In attesa</span>: ha scritto, non risposto da 20 min a 48 h · <span style={{ color: CP.textSecondary }}>Si raffredda</span>: whale silenzioso da 3 a 21 giorni. LTV = spesa netta (riconciliata con le transazioni). Fonte: BigQuery <span style={{ fontFamily: FONTS.mono }}>ws_chat</span> + <span style={{ fontFamily: FONTS.mono }}>users_research</span>.
          </div>
        </>
      )}
    </div>
  );
}
