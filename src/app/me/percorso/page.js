"use client";

import useSWR from "swr";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, SectionTitle, Notice, card, NUM } from "@/components/ds";
import { tierLabel, tierColor } from "@/lib/tier-label";
import { useStyle } from "@/lib/theme-client";

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

// colore fasce: lib/tier-label (basse mai rosse, 26/09)

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const monthLabel = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? `${MESI[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : pid);
const monthShort = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? MESI[Number(pid.slice(5)) - 1] : String(pid || "").slice(5));
/*
 * Mesi della finestra di un passaggio IN ORDINE DI CALENDARIO, con i mesi non
 * lavorati dentro come trattino. Solo lettura: il gate (api/me/ladder, evalGate)
 * conta i soli mesi valutabili e resta com'è; qui si ricuciono i buchi dallo
 * storico completo (`data.history`, che ha score null per i mesi senza turni)
 * perché "non lavorato" si veda come vuoto e non sparisca.
 */
function windowMonths(perf, history) {
  const used = perf.months || [];
  if (!used.length) return [];
  const byId = Object.fromEntries(used.map((m) => [m.period_id, m]));
  const oldest = used.map((m) => m.period_id).sort()[0];
  const all = (Array.isArray(history) ? history : []).filter((h) => String(h.period_id) >= oldest);
  const rows = all.length ? all.map((h) => byId[h.period_id] || { period_id: h.period_id, score: null, gap: true }) : used;
  return [...rows].sort((a, b) => String(a.period_id).localeCompare(String(b.period_id)));
}
const monthStatus = (m) => (m.gap || m.score == null ? "non lavorato" : m.counts ? "conta" : m.below_floor ? "sotto il minimo" : "sotto soglia");

const fmtScore = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }));

export default function MyLadderPage() {
  const { data, error, isLoading } = useSWR("/api/me/ladder", fetcher, { revalidateOnFocus: false });
  const [st] = useStyle();
  const v3 = st === "v3";

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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: CP.tierTop, border: `1px solid ${alpha(CP.tierTop, "55")}`, borderRadius: 999, padding: "2px 10px" }}>
                      <CheckCircle2 size={13} /> performance raggiunta
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{perf.evaluable && v3 ? <><span style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, letterSpacing: "-0.02em" }}>{perf.hits}</span><span style={{ fontSize: 18 }}>/{perf.needed}</span> mesi che contano{perf.below_floor ? ` · ${perf.below_floor} sotto il minimo` : ""}</> : perf.evaluable ? `${perf.hits} mesi su ${perf.needed} necessari${perf.below_floor ? ` · ${perf.below_floor} sotto il minimo` : ""}` : "servono ancora mesi di lavoro per valutarlo: non è un problema, è solo presto"}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
                  Requisito performance: <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{perf.requirement}</span> · Anzianità minima: {g.time_floor}
                </p>

                {/* Requisiti in numeri: quanti mesi mancano e quanto manca all'ultimo mese */}
                {perf.evaluable && !perf.performance_met && perf.min_score != null && (
                  <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55, ...NUM }}>
                    {perf.hits < perf.needed && <>Ti {perf.needed - perf.hits === 1 ? "manca" : "mancano"} <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{perf.needed - perf.hits} {perf.needed - perf.hits === 1 ? "mese che conta" : "mesi che contano"}</span> (score ≥ {perf.min_score}). </>}
                    {data.current?.score != null && data.current.score < perf.min_score && <>Nell&apos;ultimo mese valutato sei a {fmtScore(data.current.score)}: per contare servono {perf.min_score}, cioè <span style={{ color: CP.textPrimary, fontWeight: 500 }}>+{fmtScore(Math.max(0.1, perf.min_score - data.current.score))} punti</span>. </>}
                    {perf.below_floor > 0 && perf.floor != null && <>{perf.below_floor === 1 ? "Un mese è" : `${perf.below_floor} mesi sono`} sotto il minimo di {perf.floor}: finché {perf.below_floor === 1 ? "resta" : "restano"} nella finestra il passaggio non scatta.</>}
                  </p>
                )}

                {/* Mesi della finestra, in ordine di calendario; non lavorato = trattino */}
                {(perf.months || []).length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${v3 ? 104 : 64}px, 1fr))`, gap: 8, marginBottom: 12 }}>
                    {windowMonths(perf, data.history).map((m) => {
                      const gap = m.gap || m.score == null;
                      return (
                        <div key={m.period_id}
                          title={gap ? "Mese senza turni lavorati: non conta né a favore né contro" : m.counts ? "Conta per il passaggio" : m.below_floor ? "Sotto il minimo richiesto" : "Sotto la soglia di questo passaggio"}
                          style={{ padding: v3 ? "10px 12px" : "6px 8px", borderRadius: 8, textAlign: v3 ? "left" : "center",
                            background: m.counts ? alpha(CP.tierTop, "1c") : gap ? "transparent" : CP.surfaceAlt,
                            border: `1px ${gap ? "dashed" : "solid"} ${m.counts ? CP.tierTop : m.below_floor ? CP.textSecondary : CP.border}` }}>
                          <div style={{ fontSize: 12, color: CP.textMuted }}>{monthShort(m.period_id)}</div>
                          <div style={{ fontSize: v3 ? 22 : 14, fontWeight: 500, color: gap ? CP.textMuted : CP.textPrimary, lineHeight: 1.2, ...NUM }}>{gap ? "—" : fmtScore(m.score)}</div>
                          <div style={{ fontSize: 11, color: m.counts ? CP.tierTop : CP.textMuted }}>{monthStatus(m)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(perf.months || []).length > 0 && (
                  <p style={{ fontSize: 12, color: CP.textMuted, margin: "0 0 12px" }}>
                    Un mese senza turni è un trattino, non uno zero: non conta né a favore né contro.
                  </p>
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
                          {met ? <CheckCircle2 size={13} color={CP.tierTop} />
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
