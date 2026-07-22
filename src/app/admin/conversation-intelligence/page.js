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
import { Loader2, AlertCircle, Activity } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel } from "@/components/cp-style";

const pct = (v) =>
  v == null ? "—" : (v * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const num = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const dec = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// Semaforo (segnale, non superficie): verde ok · neutro attenzione · rosso critico.
function colWithin5(v) {
  if (v == null) return CP.textMuted;
  if (v >= 0.85) return CP.accentGreen;
  if (v >= 0.7) return CP.textSecondary;
  return CP.accentRed;
}
function colP90(v) {
  if (v == null) return CP.textMuted;
  if (v <= 6) return CP.accentGreen;
  if (v <= 12) return CP.textSecondary;
  return CP.accentRed;
}

const th = {
  padding: "10px 12px",
  textAlign: "right",
  fontSize: 10,
  color: CP.textMuted,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td = { padding: "9px 12px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13, whiteSpace: "nowrap" };

export default function ConversationIntelligencePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/conversation-intelligence");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
        setData(json);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = data?.by_creator || [];
  // Sintesi: quanti sotto soglia + mediana copertura <5min.
  const stretched = rows.filter((r) => r.within_5min != null && r.within_5min < 0.7).length;
  const sorted5 = rows.map((r) => r.within_5min).filter((v) => v != null).sort((a, b) => a - b);
  const median5 = sorted5.length ? sorted5[Math.floor(sorted5.length / 2)] : null;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 28px 80px" }}>
      <PageHeader
        section="Performance"
        title="Presidio chat"
        subtitle="Latenza di prima risposta, copertura entro SLA e response rate per creator, dagli ultimi 7 giorni. Segnale leading: anticipa i cali prima che si vedano nel fatturato."
        toolbar={
          data?.generated_at ? (
            <SectionLabel color={CP.textMuted}>
              aggiornato {new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {data.cached ? " · cache" : ""}
            </SectionLabel>
          ) : null
        }
      />

      <CpCard padding="12px 16px" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Activity size={15} style={{ color: CP.accentSoftText, marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>
          Grana <strong style={{ color: CP.textPrimary }}>per creator</strong> (account), non per singolo operatore: l'attribuzione al chatter è la fase 2 (join sul turno). Calcolato da <strong style={{ color: CP.textPrimary }}>soli metadati</strong> — nessun contenuto dei messaggi lascia il warehouse.
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
          Nessun creator con volume conversazionale nel periodo.
        </CpCard>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 22 }}>
            <StatCard label="Creator monitorati" value={num(data.creators)} />
            <StatCard
              label="Mediana risposte entro 5 min"
              value={pct(median5)}
              color={colWithin5(median5)}
            />
            <StatCard
              label="Creator sotto soglia (<70% in 5 min)"
              value={num(stretched)}
              color={stretched > 0 ? CP.accentRed : CP.accentGreen}
              sub={stretched > 0 ? "presidio da rinforzare" : "tutti sopra soglia"}
            />
          </div>

          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={{ ...th, textAlign: "left" }}>Creator</th>
                    <th style={th}>Msg/gg</th>
                    <th style={th}>Ratio chatter/fan</th>
                    <th style={th}>Response rate</th>
                    <th style={th}>Entro 5 min</th>
                    <th style={th}>Entro 15 min</th>
                    <th style={th}>P90 (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.creator_id} style={{ borderBottom: `1px solid ${CP.borderSoft}` }}>
                      <td style={{ padding: "9px 12px", textAlign: "left", fontSize: 13, color: CP.textPrimary, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {r.creator}
                      </td>
                      <td style={{ ...td, color: CP.textSecondary }}>{num(r.msgs_day)}</td>
                      <td style={{ ...td, color: CP.textSecondary }}>{r.ratio == null ? "—" : dec(r.ratio)}</td>
                      <td style={{ ...td, color: CP.textSecondary }}>{pct(r.response_rate)}</td>
                      <td style={{ ...td, color: colWithin5(r.within_5min), fontWeight: 600 }}>{pct(r.within_5min)}</td>
                      <td style={{ ...td, color: CP.textSecondary }}>{pct(r.within_15min)}</td>
                      <td style={{ ...td, color: colP90(r.frt_p90_min), fontWeight: 600 }}>{dec(r.frt_p90_min)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CpCard>

          <div style={{ marginTop: 12, fontSize: 11.5, color: CP.textMuted, lineHeight: 1.5 }}>
            Ordinati dal presidio peggiore. Soglie: <span style={{ color: CP.accentGreen }}>ok</span> ≥ 85% entro 5 min / P90 ≤ 6 min · <span style={{ color: CP.accentRed }}>critico</span> &lt; 70% / P90 &gt; 12 min. Fonte: BigQuery <span style={{ fontFamily: FONTS.mono }}>hoc.ws_chat</span>, solo metadati.
          </div>
        </>
      )}
    </div>
  );
}
