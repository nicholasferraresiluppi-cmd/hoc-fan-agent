"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { fmtPct } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, BandBar, ScoreChart, card, NUM } from "@/components/ds";
import { tierLabel, tierColor } from "@/lib/tier-label";
import { useStyle } from "@/lib/theme-client";
import { normalizeKpi } from "@/lib/leaderboard-calc";

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

// colore fasce: lib/tier-label (basse mai rosse, 26/09)

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

// Unità di misura delle voci (come le calcola leaderboard-calc): rapporti 0-1
// mostrati in %, importi in $, lunghezze in caratteri per messaggio.
const KPI_UNIT = {
  fan_cvr: "pct", unlock_rate: "pct", golden_ratio: "pct",
  avg_earnings_per_paying_fan: "usd", avg_revenue_per_fan: "usd", sales_per_hour: "usd",
  avg_length_of_conversation: "chars", input_per_message: "chars",
  messages_sent_per_hour: "num",
};
// Formattazione del TRAGUARDO arrotondata PER ECCESSO alla precisione mostrata:
// raggiungere il numero scritto deve bastare a far scattare lo scalino (se lo
// arrotondassimo per difetto potremmo promettere un traguardo che non basta).
function fmtKpi(kpi, v, up = false) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const u = KPI_UNIT[kpi] || "num";
  const r = (x, d) => (up ? Math.ceil(x * 10 ** d - 1e-9) / 10 ** d : x);
  if (u === "pct") return `${r(v * 100, 1).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (u === "usd") return "$" + r(v, 2).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (u === "chars") return `${Math.round(r(v, 0)).toLocaleString("it-IT")} caratteri`;
  return r(v, 1).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/*
 * Azione per voce: "portare <voce> da X a Y = +Z punti".
 * Come si calcolano i punti (stessa regola del calcolo, normalizeKpi):
 *   punti voce = scalino in cui cade il rapporto tuo valore / media del gruppo
 *     (default: <0,75x → 0 · <0,90x → 20 · <1,00x → 40 · <1,10x → 60 · <1,25x → 80 · oltre → 100)
 *   score = Σ punti voce × peso  →  +Z sullo score = (punti al traguardo − punti oggi) × peso.
 * Traguardo Y: se sei sotto la media del gruppo, la MEDIA (il riferimento più
 * onesto: è quello che fa il tuo gruppo, non un +10 arbitrario); se sei già
 * sopra, lo scalino successivo (media × moltiplicatore). A parità del resto: la
 * media del gruppo si muove anche lei ogni mese, e lo diciamo a schermo.
 * Se mancano valore, media o scalini → null: niente numeri inventati.
 */
function actionFor(c, steps) {
  const v = Number(c.my_value), m = Number(c.group_mean), w = Number(c.weight);
  if (!Array.isArray(steps) || !steps.length || !Number.isFinite(m) || m <= 0 || !Number.isFinite(w) || w <= 0 || c.my_value == null) return null;
  const ratio = Number.isFinite(v) && v > 0 ? v / m : 0;
  const mults = steps.map((t) => Number(t.multiplier)).filter(Number.isFinite).sort((a, b) => a - b);
  const target = mults.find((x) => x > ratio && x >= 1);
  if (target == null) return { atMax: true };
  const targetValue = m * target;
  const now = normalizeKpi(v, m, steps);
  const then = normalizeKpi(targetValue * (1 + 1e-9), m, steps);
  const gain = (then - now) * w;
  if (!(gain > 0)) return null;
  return { from: v, to: targetValue, gain, toMean: target === 1 };
}
const fmtGain = (g) => `+${g.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} punti`;

const note = { fontSize: 13, color: CP.textMuted, margin: "0 0 8px", lineHeight: 1.6 };
const link = { color: CP.accentSoftText };
const btnTrain = { display: "inline-flex", alignItems: "center", padding: "6px 12px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" };

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
  // Stile v3 in anteprima: barra delle fasce + grafico ScoreChart. Nello stile
  // attuale la pagina resta com'era (barre verticali, nessuna barra fasce).
  const [st] = useStyle();
  const v3 = st === "v3";
  const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
  // Azioni per voce + voce con più margine = peso × distanza dalla media, cioè i
  // punti recuperabili (lo stesso numero dell'azione). Senza scalini nell'API si
  // sceglie per peso × (media − valore)/media e non si mostrano punti.
  const steps = Array.isArray(data?.normalization) && data.normalization.length ? data.normalization : null;
  const actions = Object.fromEntries(composition.map((c) => [c.kpi, actionFor(c, steps)]));
  const marginOf = (c) => {
    const a = actions[c.kpi];
    if (a && !a.atMax) return a.gain;
    const v = Number(c.my_value), m = Number(c.group_mean), w = Number(c.weight);
    return !steps && m > 0 && w > 0 && Number.isFinite(v) && v < m ? (w * (m - v)) / m : 0;
  };
  const topKpi = composition.reduce((best, c) => (marginOf(c) > (best ? marginOf(best) : 0) ? c : best), null)?.kpi || null;
  const meanPoints = steps ? normalizeKpi(1, 1, steps) : null;
  const chartThresholds = tiers.filter((t) => t.min > 0).map((t) => ({ label: tierLabel(t.label), min: t.min }));

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
              compare={cp.tier ? <span style={{ color: CP.textSecondary }}>{tierLabel(cp.tier)}</span> : null}
              hint={<>È quello delle revisioni mensili. 0-100: il tuo venduto per turno confrontato con chi lavora sulle tue stesse creator (70%) e con tutta l&apos;agenzia (30%). Il dettaglio per creator è nel <Link href="/profilo" style={link}>tuo profilo</Link>.</>}
            />
          )}
          {hasMestiere && (
            <HeroMetric
              label={`Mestiere · ${monthLabel(data.period_id)}`}
              value={fmtScore(data.score)}
              compare={data.tier ? <span style={{ color: tierColor(data.tier) }}>{tierLabel(data.tier)}</span> : null}
              hint="È quello del percorso di carriera: misura come chatti."
              footer={v3 && tiers.length > 1 ? <BandBar value={data.score} tiers={tiers} label="Fascia del Mestiere" /> : null}
            >
              {/* Posizione tra i colleghi, mai il percentile su tutta l'agenzia (decisione 26/09) */}
              {data.peer_rank && (data.peer_rank.top_half
                ? <Metric label="Tra i tuoi colleghi" value={`${data.peer_rank.position}° su ${data.peer_rank.size}`} note={data.peer_rank.label ? `su ${data.peer_rank.label}` : null} />
                : data.next_tier ? <Metric label="Il prossimo passo" value={`${fmtScore(data.next_tier.gap)} punti`} note={`per la fascia «${tierLabel(data.next_tier.tier)}»`} /> : null)}
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

          {/* Composizione: niente rosso sulle persone (regola del board). Il segnale è
              la voce con più margine, in accento, con l'azione concreta. */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle aside="0–100 per voce × peso">Mestiere: come si compone</SectionTitle>
            <div style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {composition.map((c) => {
                  const act = actions[c.kpi];
                  const isTop = topKpi === c.kpi;
                  const label = KPI_LABELS[c.kpi] || c.kpi.replace(/_/g, " ");
                  return (
                    <div key={c.kpi}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, marginBottom: 2 }}>
                        <span style={{ color: CP.textPrimary, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>{label}<span style={{ color: CP.textMuted }}> · peso {fmtPct(c.weight)}</span></span>
                          {isTop && <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 8px", borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText }}>più margine</span>}
                        </span>
                        <span style={{ ...NUM, fontWeight: 500, color: CP.textPrimary }}>
                          {Number(c.points).toLocaleString("it-IT")}
                        </span>
                      </div>
                      {KPI_HELP[c.kpi] && <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>{KPI_HELP[c.kpi]}</div>}
                      <div style={{ position: "relative", height: 6, background: CP.track, borderRadius: 999 }}>
                        <div style={{ width: `${Math.max(2, Math.min(100, c.points))}%`, height: "100%", background: isTop ? CP.accent : CP.neu, borderRadius: 999 }} />
                        {/* tacca = i punti che fa chi è esattamente sulla media del gruppo */}
                        {meanPoints != null && <span aria-hidden title="Media del gruppo" style={{ position: "absolute", left: `${meanPoints}%`, top: -3, width: 2, height: 12, background: CP.textPrimary, borderRadius: 1 }} />}
                      </div>
                      {act && !act.atMax && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${isTop ? CP.accentDim : CP.borderSoft}`, background: isTop ? CP.accentSoft : "transparent", fontSize: 13, color: CP.textSecondary, ...NUM }}>
                          <span>
                            Portare {label.charAt(0).toLowerCase() + label.slice(1)} da <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtKpi(c.kpi, act.from)}</span> a <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtKpi(c.kpi, act.to, true)}</span>
                            {act.toMean ? " (la media del tuo gruppo)" : ""} = <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtGain(act.gain)}</span>
                          </span>
                          {isTop && <Link href="/" style={btnTrain}>Allenati su questo</Link>}
                        </div>
                      )}
                      {act?.atMax && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Su questa voce hai già il massimo dei punti.</div>}
                      {!act && isTop && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.accentDim}`, background: CP.accentSoft, fontSize: 13, color: CP.textSecondary }}>
                          <span>È la voce con più margine: allenala.</span>
                          <Link href="/" style={btnTrain}>Allenati su questo</Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 13, color: CP.textMuted, margin: "16px 0 0", lineHeight: 1.55 }}>
                {data.comparison === "language"
                  ? `Il tuo gruppo è piccolo (${data.group_size ?? "meno di 5"} persone), quindi ogni barra confronta te con la media di tutti gli operatori della tua lingua: un confronto con 1-4 colleghi sarebbe troppo casuale. `
                  : "Ogni barra è la tua posizione rispetto alla media del tuo gruppo su quella voce. "}
                {meanPoints != null ? `La tacca è dove sta chi è esattamente sulla media (${meanPoints} punti). ` : ""}
                100 = molto sopra la media, 40 = appena sotto. I punti di ogni azione sono quelli che aggiungeresti allo score a parità del resto (anche la media del gruppo si muove ogni mese). Da dove partire: la voce con più margine, dove peso e distanza dalla media rendono di più.
              </p>
            </div>
          </section>

          {/* Storico */}
          {history.length > 1 && (
            <section style={{ marginBottom: 22 }}>
              <SectionTitle aside="il mese che stai guardando è evidenziato">Mestiere: il mio andamento</SectionTitle>
              {v3 ? (
                <div style={{ ...card, padding: "16px 18px" }}>
                  <ScoreChart
                    caption="Mestiere mese per mese"
                    points={history.map((h) => ({ label: monthShort(h.period_id), value: h.score }))}
                    thresholds={chartThresholds}
                  />
                </div>
              ) : (
              <div style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, overflowX: "auto", paddingBottom: 4 }}>
                  {history.map((h) => {
                    const cur = h.period_id === data.period_id;
                    return (
                      <div key={h.period_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 48 }}>
                        <span title={h.score == null ? "Mese senza turni lavorati: non conta" : undefined} style={{ fontSize: 12, color: cur ? CP.textPrimary : CP.textSecondary, ...NUM }}>{h.score != null ? Math.round(h.score) : "—"}</span>
                        {h.score != null
                          ? <div style={{ width: 24, height: `${Math.max(4, (h.score / maxHist) * 80)}px`, background: cur ? CP.accent : CP.accentDim, borderRadius: 4 }} />
                          : <div title="Mese senza turni lavorati: non conta" style={{ width: 24, height: 12, border: `1px dashed ${CP.textMuted}`, borderRadius: 4 }} />}
                        <span style={{ fontSize: 11, color: CP.textMuted }}>{monthShort(h.period_id)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </section>
          )}

          <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 14 }}>
            <p style={note}>
              Lo score mestiere viene dall&apos;export Infloww e si aggiorna quando il mese viene importato. Le fasce vanno da «Da costruire» a «Eccellente», tarate sui dati reali di quest&apos;anno. I mesi senza turni lavorati non contano (trattino nel grafico).{data.formula?.hash ? ` Formula del mese ${data.formula.hash}, congelata all'import: il tuo storico non cambia in silenzio.` : ""}
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
