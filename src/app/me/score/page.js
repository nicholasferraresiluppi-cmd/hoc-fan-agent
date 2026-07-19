"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Gauge, HelpCircle, TrendingUp } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/score — "Il mio score, spiegato" (scope own, docs/VISIBILITY_POLICY.md).
 * Mostra SOLO i dati dell'operatore loggato + aggregati non nominativi.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const KPI_LABELS = {
  fan_cvr: "Conversione fan",
  unlock_rate: "Sblocco PPV",
  avg_earnings_per_paying_fan: "Ricavo per fan pagante",
  golden_ratio: "Golden ratio (PPV/messaggi)",
  sales_per_hour: "Vendite per ora",
  avg_revenue_per_fan: "Ricavo medio per fan",
  avg_length_of_conversation: "Lunghezza conversazioni",
  input_per_message: "Cura dei messaggi",
  messages_sent_per_hour: "Messaggi per ora",
};

const TIER_COLORS = {
  Critical: CP.accentRed, Weak: "#d9a44a", Average: "#cba55f",
  Good: CP.accentGreen, Strong: CP.accentBlue, Elite: CP.accent,
};

function NotLinked({ reason }) {
  return (
    <CpCard>
      <div style={{ textAlign: "center", padding: "30px 16px" }}>
        <HelpCircle size={30} color={CP.mutedIcons} />
        <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>
          Il tuo account non è ancora collegato a un profilo operatore.
        </p>
        <p style={{ color: CP.textMuted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          Chiedi a un admin di collegare la tua email al tuo nome operatore
          {reason === "ambiguous" ? " (la tua email corrisponde a più profili)" : ""}.
        </p>
      </div>
    </CpCard>
  );
}

export default function MyScorePage() {
  const [periodId, setPeriodId] = useState(null);
  const url = periodId ? `/api/me/score?period_id=${periodId}` : "/api/me/score";
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Il mio score"
        subtitle="Come si compone il tuo score operativo: quali comportamenti lo alzano, quali lo tengono giù, e come sta andando nel tempo. Vedi solo i tuoi dati — è un diritto, non una concessione."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data && !data.linked && !data.error && <NotLinked reason={data.reason} />}
      {data?.error && <CpCard><p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>{data.error}</p></CpCard>}

      {data?.linked && data.reason && (
        <CpCard>
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>
            {data.reason === "no_periods" && "Nessun periodo importato ancora."}
            {data.reason === "no_data_for_period" && `Nessun dato per il periodo ${data.period_id}.`}
            {data.reason === "not_in_period" && `Non risulti tra gli operatori valutati nel periodo${data.period_id ? ` ${data.period_id}` : ""} — normale se non hai lavorato turni chat quel mese.`}
            {data.reason === "ambiguous_in_period" && "Il tuo nome corrisponde a più profili nel periodo: serve l'intervento di un admin."}
            {data.reason === "no_history" && "Nessuno storico disponibile."}
          </p>
        </CpCard>
      )}

      {data?.linked && data.score !== undefined && (
        <>
          {/* Selettore periodo */}
          {Array.isArray(data.available_periods) && data.available_periods.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
              {data.available_periods.map((p) => (
                <button key={p} onClick={() => setPeriodId(p)}
                  style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${p === data.period_id ? CP.accent : CP.border}`, background: p === data.period_id ? CP.accentSoft : "transparent", color: p === data.period_id ? CP.accent : CP.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: FONTS.body }}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Headline: score, tier, percentile */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px", minWidth: 150 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Score · {data.period_id}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 34, fontWeight: 600, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{data.score}</span>
                <span style={{ fontSize: 13, fontWeight: 650, color: TIER_COLORS[data.tier] || CP.textSecondary }}>{data.tier}</span>
              </div>
            </div>
            <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px", minWidth: 150 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>La tua posizione</div>
              <div style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 600, color: CP.textPrimary }}>
                meglio del {data.percentile}%
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>dei {data.scored_count} operatori valutati</div>
            </div>
            {data.formula && (
              <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px", minWidth: 150 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Formula del periodo</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 15, color: CP.textSecondary }}>{data.formula.hash}</div>
                <div style={{ fontSize: 11.5, color: CP.textMuted }}>congelata all'import — il tuo storico non cambia in silenzio</div>
              </div>
            )}
          </div>

          {/* Composizione */}
          <CpCard style={{ marginBottom: 16 }}>
            <SectionLabel>Come si compone (0–100 per dimensione × peso)</SectionLabel>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.composition || []).sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((c) => (
                <div key={c.kpi}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: CP.textPrimary }}>{KPI_LABELS[c.kpi] || c.kpi.replace(/_/g, " ")}
                      <span style={{ color: CP.textMuted }}> · peso {(c.weight * 100).toFixed(0)}%</span>
                    </span>
                    <span style={{ fontFamily: FONTS.mono, color: c.points >= 60 ? CP.accentGreen : c.points >= 40 ? CP.textSecondary : CP.accentRed }}>{c.points}</span>
                  </div>
                  <div style={{ height: 7, background: CP.surfaceAlt, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(2, Math.min(100, c.points))}%`, height: "100%", background: c.points >= 60 ? CP.accentGreen : c.points >= 40 ? CP.accent : CP.accentRed, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: CP.textMuted, margin: "14px 0 0", lineHeight: 1.5 }}>
              Ogni barra è la tua posizione rispetto alla media del tuo team su quella dimensione (100 = molto sopra la media). Le barre rosse sono dove recuperi più punti: parlane col tuo team lead.
            </p>
          </CpCard>

          {/* Storico */}
          {Array.isArray(data.history) && data.history.length > 1 && (
            <CpCard>
              <SectionLabel>Il mio andamento</SectionLabel>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 14, height: 120, overflowX: "auto", paddingBottom: 4 }}>
                {data.history.map((h) => (
                  <div key={h.period_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 52 }}>
                    <span style={{ fontSize: 11.5, fontFamily: FONTS.mono, color: CP.textSecondary }}>{h.score != null ? Math.round(h.score) : "—"}</span>
                    <div style={{ width: 26, height: `${Math.max(4, (h.score || 0) * 0.8)}px`, background: TIER_COLORS[h.tier] || CP.surfaceAlt, borderRadius: 5, opacity: 0.9 }} />
                    <span style={{ fontSize: 10, color: CP.textMuted }}>{String(h.period_id).slice(5)}</span>
                  </div>
                ))}
              </div>
            </CpCard>
          )}

          <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 18, lineHeight: 1.6 }}>
            Pensi che un numero sia sbagliato? Presto potrai aprire una contestazione formale da qui; intanto segnalalo al tuo team lead — le correzioni vengono sempre tracciate, mai fatte in silenzio.
          </p>
        </>
      )}
    </div>
  );
}
