"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { fmtPct } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, card, NUM } from "@/components/ds";

/**
 * /me/score — "Il mio score, spiegato" (scope own, docs/VISIBILITY_POLICY.md).
 * Mostra SOLO i dati dell'operatore loggato + aggregati non nominativi.
 * 26/09/2026: portata sul design system (contenuti e linguaggio invariati).
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

// Una riga di spiegazione per voce (pannello tester: "Golden ratio" e "Cura dei
// messaggi" non si capivano al primo mese)
const KPI_HELP = {
  fan_cvr: "Quanti dei fan con cui chatti comprano qualcosa.",
  unlock_rate: "Quanti dei PPV che mandi vengono sbloccati.",
  avg_earnings_per_paying_fan: "Quanto spende in media chi compra da te.",
  golden_ratio: "Quanti PPV mandi rispetto ai messaggi: se proponi abbastanza, o chatti senza vendere.",
  sales_per_hour: "Quanto vendi per ogni ora di turno.",
  avg_revenue_per_fan: "Quanto rende in media ogni fan con cui chatti.",
  avg_length_of_conversation: "Quanto durano le conversazioni.",
  input_per_message: "Quanto scrivi in ogni messaggio (messaggi curati, non monosillabi).",
  messages_sent_per_hour: "Quanti messaggi mandi per ora.",
};

// Fascia come segnale sul dato, non come superficie: rosso solo per la fascia
// più bassa, verde per le tre alte, neutro in mezzo (un solo accento, DESIGN.md §1).
const tierColor = (tier) =>
  tier === "Critical" ? CP.accentRed : ["Good", "Strong", "Elite"].includes(tier) ? CP.accentGreen : CP.textSecondary;

// Due score, ognuno col suo nome (decisione Nicholas 25/09/2026, "strada 1"):
//  - VENDITE (CreatorsPro): venduto per turno vs chi lavora sulle stesse creator;
//    è quello guardato nelle revisioni mensili (Action/Coaching Center).
//  - MESTIERE (Infloww): come chatti; è quello del percorso di carriera.
// Prima l'operatore vedeva solo il secondo, etichettato "Critical" anche al 68°
// percentile (soglie fisse tarate a gen-mag): Andrea Terranova, 2º per vendite
// (89,1), leggeva "27,6 Critical". v0.6: fasce ricalibrate sui percentili reali
// (leaderboard-config v12), di nuovo mostrate.
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const monthLabel = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? `${MESI[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : pid);
const monthShort = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? MESI[Number(pid.slice(5)) - 1] : String(pid || "").slice(5));
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
const fmtScore = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

const note = { fontSize: 13, color: CP.textMuted, margin: "0 0 8px", lineHeight: 1.6 };
const link = { color: CP.accentSoftText };

export default function MyScorePage() {
  const [periodId, setPeriodId] = useState(null);
  const url = periodId ? `/api/me/score?period_id=${periodId}` : "/api/me/score";
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const { data: meEmp } = useSWR("/api/me/employee", fetcher, { revalidateOnFocus: false });
  const salesMonth = currentMonth();
  const { data: sales } = useSWR(meEmp?.employee ? `/api/leaderboard/operator-drilldown?employee=${encodeURIComponent(meEmp.employee)}&period_id=${salesMonth}` : null, fetcher, { revalidateOnFocus: false });
  const cp = sales?.cp;
  const hasMestiere = data?.linked && data.score !== undefined;
  const composition = [...(data?.composition || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const history = Array.isArray(data?.history) ? data.history : [];
  const maxHist = Math.max(100, ...history.map((h) => h.score || 0));

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "I miei score" }]}
        title="I miei score"
        subtitle="Hai due score che misurano cose diverse: Vendite (quanto vendi per turno) e Mestiere (come chatti). Vedi solo i tuoi dati: è un diritto, non una concessione."
      />

      {/* I due numeri, affiancati: ognuno dice a cosa serve */}
      {(cp || hasMestiere) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", columnGap: 14 }}>
          {cp && (
            <HeroMetric
              label={`Vendite · ${monthLabel(salesMonth)} (in corso)`}
              value={cp.score != null ? fmtScore(cp.score) : "—"}
              compare={cp.tier ? <span style={{ color: CP.textSecondary }}>{cp.tier}</span> : null}
              hint={<>È quello delle revisioni mensili. 0-100: il tuo venduto per turno confrontato con chi lavora sulle tue stesse creator (70%) e con tutta l&apos;agenzia (30%). Il dettaglio per creator è nel <Link href="/profilo" style={link}>tuo profilo</Link>.</>}
            />
          )}
          {hasMestiere && (
            <HeroMetric
              label={`Mestiere · ${monthLabel(data.period_id)}`}
              value={fmtScore(data.score)}
              compare={data.tier ? <span style={{ color: tierColor(data.tier) }}>{data.tier}</span> : null}
              hint="È quello del percorso di carriera: misura come chatti."
            >
              <Metric label="La tua posizione" value={`meglio del ${data.percentile}%`} note={`dei ${data.scored_count} operatori valutati`} />
            </HeroMetric>
          )}
        </div>
      )}

      {isLoading && <div style={{ ...card, padding: 16, color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Non riesco a caricare il tuo score. Ricarica la pagina tra qualche minuto.</Notice>}
      {data && !data.linked && !data.error && (
        <Notice>
          Il tuo account non è ancora collegato a un profilo operatore. Chiedi a un admin di collegare la tua email al tuo nome operatore
          {data.reason === "ambiguous" ? " (la tua email corrisponde a più profili)" : ""}.
        </Notice>
      )}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data?.linked && data.reason && (
        <Notice>
          {data.reason === "no_periods" && "Nessun periodo importato ancora."}
          {data.reason === "no_data_for_period" && `Nessun dato per il periodo ${monthLabel(data.period_id)}.`}
          {data.reason === "not_in_period" && `Non risulti tra gli operatori valutati nel periodo${data.period_id ? ` ${monthLabel(data.period_id)}` : ""} — normale se non hai lavorato turni chat quel mese.`}
          {data.reason === "ambiguous_in_period" && "Il tuo nome corrisponde a più profili nel periodo: serve l'intervento di un admin."}
          {data.reason === "no_history" && "Nessuno storico disponibile."}
        </Notice>
      )}

      {hasMestiere && (
        <>
          {/* Selettore mese: vale per lo score mestiere */}
          {Array.isArray(data.available_periods) && data.available_periods.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 18px" }}>
              <span style={{ fontSize: 13, color: CP.textMuted, marginRight: 4 }}>Mestiere del mese</span>
              {data.available_periods.map((p) => (
                <FilterChip key={p} label={monthLabel(p)} active={p === data.period_id} onClick={() => setPeriodId(p)} />
              ))}
            </div>
          )}

          {/* Composizione */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle aside="0–100 per voce × peso">Mestiere: come si compone</SectionTitle>
            <div style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {composition.map((c) => {
                  const low = c.points < 40;
                  return (
                    <div key={c.kpi}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, marginBottom: 2 }}>
                        <span style={{ color: CP.textPrimary }}>
                          {KPI_LABELS[c.kpi] || c.kpi.replace(/_/g, " ")}
                          <span style={{ color: CP.textMuted }}> · peso {fmtPct(c.weight)}</span>
                        </span>
                        <span style={{ ...NUM, fontWeight: 500, color: c.points >= 60 ? CP.accentGreen : low ? CP.accentRed : CP.textSecondary }}>
                          {Number(c.points).toLocaleString("it-IT")}
                        </span>
                      </div>
                      {KPI_HELP[c.kpi] && <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>{KPI_HELP[c.kpi]}</div>}
                      <div style={{ height: 6, background: CP.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(2, Math.min(100, c.points))}%`, height: "100%", background: low ? CP.accentRed : CP.accent, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 13, color: CP.textMuted, margin: "16px 0 0", lineHeight: 1.55 }}>
                {data.comparison === "language"
                  ? `Il tuo gruppo è piccolo (${data.group_size ?? "meno di 5"} persone), quindi ogni barra confronta te con la media di tutti gli operatori della tua lingua: un confronto con 1-4 colleghi sarebbe troppo casuale. `
                  : "Ogni barra è la tua posizione rispetto alla media del tuo gruppo su quella voce. "}
                100 = molto sopra la media, 40 = appena sotto. Le barre rosse sono dove recuperi più punti: parlane col tuo team lead.
              </p>
            </div>
          </section>

          {/* Storico */}
          {history.length > 1 && (
            <section style={{ marginBottom: 22 }}>
              <SectionTitle aside="il mese che stai guardando è evidenziato">Mestiere: il mio andamento</SectionTitle>
              <div style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, overflowX: "auto", paddingBottom: 4 }}>
                  {history.map((h) => {
                    const cur = h.period_id === data.period_id;
                    return (
                      <div key={h.period_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 48 }}>
                        <span style={{ fontSize: 12, color: cur ? CP.textPrimary : CP.textSecondary, ...NUM }}>{h.score != null ? Math.round(h.score) : "—"}</span>
                        <div style={{ width: 24, height: `${Math.max(4, ((h.score || 0) / maxHist) * 80)}px`, background: cur ? CP.accent : CP.accentDim, borderRadius: 4 }} />
                        <span style={{ fontSize: 11, color: CP.textMuted }}>{monthShort(h.period_id)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 14 }}>
            <p style={note}>
              Lo score mestiere viene dall&apos;export Infloww e si aggiorna quando il mese viene importato. Le fasce vanno da Critical (il 10% più basso) a Elite (il 10% più alto), tarate sui dati di quest&apos;anno.{data.formula?.hash ? ` Formula del mese ${data.formula.hash}, congelata all'import: il tuo storico non cambia in silenzio.` : ""}
            </p>
            <p style={note}>
              Pensi che un numero sia sbagliato? <Link href="/me/contestazioni" style={link}>Apri una contestazione</Link> — le correzioni vengono sempre tracciate, mai fatte in silenzio.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
