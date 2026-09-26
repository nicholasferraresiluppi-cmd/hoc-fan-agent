"use client";

import useSWR from "swr";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, SectionTitle, Notice, card, NUM } from "@/components/ds";
import { tierLabel, tierColor } from "@/lib/tier-label";

/**
 * /me/percorso — "Il mio percorso" (scope own, docs/VISIBILITY_POLICY.md).
 * La componente performance dei gate della career ladder, spiegata mese per mese.
 * Ladder pubblica per principio: i criteri sono visibili dal giorno uno.
 * v0.6 (25/09/2026): fasce ricalibrate sulla distribuzione reale e gate scritti
 * in numeri (stesse persone che passano di prima). Si mostra lo score mese per
 * mese e se conta per il passaggio.
 * 26/09/2026: portata sul design system (contenuti e linguaggio invariati).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

// Fascia come segnale sul dato (DESIGN.md §1): rosso solo per la più bassa,
// verde per le tre alte, neutro in mezzo.
// colore fasce: lib/tier-label (basse mai rosse, 26/09)

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const monthLabel = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? `${MESI[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : pid);
const monthShort = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? MESI[Number(pid.slice(5)) - 1] : String(pid || "").slice(5));
const fmtScore = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }));

export default function MyLadderPage() {
  const { data, error, isLoading } = useSWR("/api/me/ladder", fetcher, { revalidateOnFocus: false });

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Il mio percorso" }]}
        title="Il mio percorso"
        subtitle="La career ladder è pubblica: qui vedi i criteri di passaggio e a che punto sei sulla componente performance. Niente 'fai i numeri e vedremo' — i requisiti sono scritti."
      />

      {isLoading && <div style={{ ...card, padding: 16, color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Non riesco a caricare il tuo percorso. Ricarica la pagina tra qualche minuto.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.linked && !data.error && (
        <Notice>Account non ancora collegato a un profilo operatore. Chiedi a un admin di collegare la tua email al tuo nome operatore.</Notice>
      )}

      {data?.linked && data.reason === "no_history" && (
        <Notice>Nessuno storico score disponibile ancora — serve almeno un mese importato in cui hai lavorato.</Notice>
      )}

      {data?.linked && Array.isArray(data.gates) && data.gates.length > 0 && (
        <>
          {data.current && (
            <HeroMetric
              label={`Ultimo mese valutato · ${monthLabel(data.current.period_id)}`}
              value={fmtScore(data.current.score)}
              compare={data.current.tier ? <span style={{ color: tierColor(data.current.tier) }}>{tierLabel(data.current.tier)}</span> : null}
              hint="Score mestiere: come chatti, rispetto al tuo gruppo."
            />
          )}

          <p style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.6, margin: "4px 0 22px", maxWidth: 760 }}>
            I passaggi di livello si basano sullo <span style={{ color: CP.textPrimary, fontWeight: 500 }}>score mestiere</span> (come chatti, rispetto al tuo gruppo). Per salire non basta un mese buono: serve stare sopra la soglia in più mesi. Le fasce vanno da «Da costruire» a «Eccellente». I mesi in cui non hai lavorato non contano: non sono né sopra né sotto la soglia.
          </p>

          <SectionTitle aside="un riquadro per ogni passaggio di livello">I passaggi</SectionTitle>
          {data.gates.map((g) => {
            const perf = g.performance || {};
            return (
              <section key={g.id} style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>{g.label}</h3>
                  {perf.performance_met ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: CP.accentGreen, border: `1px solid ${alpha(CP.accentGreen, "55")}`, borderRadius: 999, padding: "2px 10px" }}>
                      <CheckCircle2 size={13} /> performance raggiunta
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{perf.evaluable ? `${perf.hits} mesi su ${perf.needed} necessari${perf.below_floor ? ` · ${perf.below_floor} sotto il minimo` : ""}` : "servono ancora mesi di lavoro per valutarlo: non è un problema, è solo presto"}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
                  Requisito performance: <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{perf.requirement}</span> · Anzianità minima: {g.time_floor}
                </p>

                {/* Mesi della finestra */}
                {(perf.months || []).length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {perf.months.map((m) => (
                      <div key={m.period_id} style={{ textAlign: "center" }}>
                        <div title={m.counts ? "Conta per il passaggio" : m.below_floor ? "Sotto il minimo richiesto" : "Sotto la soglia di questo passaggio"}
                          style={{ width: 58, padding: "6px 0", borderRadius: 6, background: m.counts ? alpha(CP.accentGreen, "1c") : CP.surfaceAlt, border: `1px solid ${m.counts ? CP.accentGreen : m.below_floor ? CP.accentRed : CP.border}` }}>
                          <span style={{ fontSize: 13, color: CP.textPrimary, ...NUM }}>{fmtScore(m.score)}</span>
                        </div>
                        <span style={{ fontSize: 11, color: CP.textMuted }}>{monthShort(m.period_id)}{m.tier ? ` · ${tierLabel(m.tier)}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(perf.months || []).length > 0 && (
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textMuted, marginBottom: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${CP.accentGreen}`, background: alpha(CP.accentGreen, "1c") }} />conta per il passaggio</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${CP.border}`, background: CP.surfaceAlt }} />sotto la soglia</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${CP.accentRed}`, background: CP.surfaceAlt }} />sotto il minimo</span>
                  </div>
                )}

                {/* Altri requisiti */}
                {(g.other_requirements || []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: `1px solid ${CP.borderSoft}` }}>
                    {g.other_requirements.map((r, i) => {
                      const met = r.status === "met";
                      const fail = r.status === "compliance_fail";
                      const notMet = r.status === "not_met";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: fail ? CP.accentRed : met ? CP.textSecondary : CP.textMuted, flexWrap: "wrap" }}>
                          {met ? <CheckCircle2 size={13} color={CP.accentGreen} />
                            : fail ? <Lock size={13} color={CP.accentRed} />
                            : r.status === "not_tracked" ? <Lock size={13} color={CP.mutedIcons} />
                            : <Circle size={13} color={notMet ? CP.textMuted : CP.mutedIcons} />}
                          {r.label}
                          <span style={{ fontSize: 12, color: fail ? CP.accentRed : CP.textMuted }}>
                            {r.status === "not_tracked" && "· tracciamento in arrivo"}
                            {(met || notMet || fail) && r.detail ? `· ${r.detail}` : ""}
                            {fail && " · congela le promozioni in corso (§8.1)"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {data.note && <p style={{ fontSize: 13, color: CP.textMuted, marginTop: 12, lineHeight: 1.6 }}>{data.note}</p>}
        </>
      )}
    </div>
  );
}
