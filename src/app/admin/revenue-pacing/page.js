"use client";

// Revenue Laura — ricostruzione FEDELE di revenue.hoc.tools ("Revenue Analytics ·
// Laura"), spento con lo split a ottobre 2026. Struttura, riquadri ed etichette
// presi dal sito originale (letto e fotografato il 20/07/2026): selettore
// Totale/IT/EN/ES + due schede, "Mese & Proiezioni" e "Performance Recente".
// Numeri: stessa logica delle sue viste BigQuery (src/lib/revenue-pacing-sql.js).
// In più rispetto all'originale: obiettivi modificabili in pagina e "Come si calcola".

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLiveCreator, CreatorPills, liveFetcher } from "@/components/LiveCreatorPicker";
import useSWR from "swr";
import { RefreshCw, Info } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$, fmtInt, fmtAgo, MONTHS_IT } from "@/lib/format";
import { Disclosure, Notice, card, NUM } from "@/components/ds";
import RaceHero from "./RaceHero";
import { suggestedGoal } from "@/lib/live-priority";
import { waitingNow } from "../chat-monitor/ui";

const errText = (status) =>
  status === 401 || status === 403 ? "Non hai il permesso per vedere questi dati." :
  status >= 500 ? "Calcolo fallito o troppo lungo — riprova." : "Errore.";
// Paesi (account) della creator scelta: arrivano dall'API, li leggono i componenti sotto.
const CountriesCtx = createContext([]);
const useCountries = () => useContext(CountriesCtx);
const COUNTRY_LABEL = { ALL: "Totale", IT: "IT", EN: "EN", ES: "ES" };
const COUNTRY_LONG = { ALL: "Totale account", IT: "Italia", EN: "Inglese", ES: "Spagnolo" };
const CONFIDENCE = { BASSA: "BASSA", MEDIA: "MEDIA", ALTA: "ALTA", "MOLTO ALTA": "MOLTO ALTA" };

const ok = (v) => v != null && Number.isFinite(Number(v));
const div = (a, b) => (!ok(a) || !ok(b) || Number(b) === 0 ? null : Number(a) / Number(b));
const fmt$2 = (v) => (!ok(v) ? "—" : `$${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v, d = 1) => (!ok(v) ? "—" : `${(Number(v) * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const signedPct = (v, d = 1) => (!ok(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const signed$ = (v) => (!ok(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("it-IT")}`);
const tone = (v) => (!ok(v) || v === 0 ? CP.textMuted : v > 0 ? CP.accentGreen : CP.attn);

const monthKey = (iso) => String(iso || "").slice(0, 7);
const monthName = (key) => { const [y, m] = key.split("-").map(Number); return `${MONTHS_IT[m - 1]} ${y}`; };
const addMonths = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Stesso giorno del mese precedente (null se non esiste, es. 31 marzo → 31 febbraio)
const sameDayPrevMonth = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 2, d));
  return t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const shortDate = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${String(d).padStart(2, "0")} ${MONTHS_IT[m - 1].slice(0, 3)}`; };

// Somma dei tre paesi: additivi sommati, rapporti RICALCOLATI dalle somme.
function totalRow(rows) {
  if (!rows.length) return null;
  const s = (f) => rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
  const t = {
    country: "ALL",
    as_of_date: rows[0].as_of_date, day_of_month: rows[0].day_of_month, days_in_month: rows[0].days_in_month, days_remaining: rows[0].days_remaining,
    projection_confidence: rows[0].projection_confidence,
    projection_method: rows.every((r) => r.projection_method === rows[0].projection_method) ? rows[0].projection_method : "misto",
    closed_months_count: Math.max(...rows.map((r) => Number(r.closed_months_count) || 0)),
  };
  for (const f of ["revenue_mtd", "revenue_proj_eom", "revenue_hist_avg", "revenue_delta_vs_hist", "new_subs_mtd", "new_subs_proj_eom", "new_subs_hist_avg",
    "new_sub_revenue_mtd", "retention_revenue_mtd", "current_month_converting_new_subs", "rolling_cohort_total_subs", "rolling_cohort_converting_users",
    "rolling_cohort_revenue_mtd", "new_sub_expected_eom_revenue"]) t[f] = s(f);
  t.new_sub_revenue_pct_mtd = div(t.new_sub_revenue_mtd, t.new_sub_revenue_mtd + t.retention_revenue_mtd);
  t.current_month_arppu = div(t.new_sub_revenue_mtd, t.current_month_converting_new_subs);
  t.current_month_ltv = div(t.new_sub_revenue_mtd, t.new_subs_mtd);
  t.rolling_cohort_revenue_pct = div(t.rolling_cohort_revenue_mtd, t.revenue_mtd);
  const histSubs = s("new_subs_hist_avg");
  const histConv = rows.reduce((a, r) => a + (Number(r.new_subs_hist_avg) || 0) * (Number(r.hist_conversion_rate) || 0), 0);
  t.hist_conversion_rate = div(histConv, histSubs);
  t.avg_revenue_per_new_sub = div(rows.reduce((a, r) => a + (Number(r.new_subs_hist_avg) || 0) * (Number(r.hist_conversion_rate) || 0) * (Number(r.avg_revenue_per_new_sub) || 0), 0), histConv);
  return t;
}

function goalFor(goals, country, month, countries) {
  if (!goals) return null;
  if (country === "ALL") {
    const vals = countries.map((c) => goals[c]?.[month]);
    return vals.every((v) => v == null) ? null : vals.reduce((a, v) => a + (v || 0), 0);
  }
  return goals[country]?.[month] ?? null;
}

// Serie giornaliera {date → {rev, subs, byCountry:{IT,EN,ES}}} per il paese scelto.
function useDaily(trend, country) {
  return useMemo(() => {
    const by = new Map();
    for (const t of trend || []) {
      const d = by.get(t.date) || { date: t.date, rev: 0, subs: 0, revBy: {}, subsBy: {} };
      d.revBy[t.country] = (d.revBy[t.country] || 0) + (t.daily_revenue || 0);
      d.subsBy[t.country] = (d.subsBy[t.country] || 0) + (t.daily_new_subs || 0);
      if (country === "ALL" || t.country === country) {
        d.rev += t.daily_revenue || 0;
        d.subs += t.daily_new_subs || 0;
      }
      by.set(t.date, d);
    }
    return by;
  }, [trend, country]);
}

export default function RevenuePacingPage() {
  const [slug, setSlug] = useLiveCreator();
  const [countryPick, setCountryState] = useState("ALL");
  // Paese condiviso con la scheda Chat
  useEffect(() => { try { const v = localStorage.getItem("hoc:live:paese"); if (v) setCountryState(v); } catch {} }, []);
  const setCountry = (c) => { setCountryState(c); try { localStorage.setItem("hoc:live:paese", c); } catch {} };
  const [tab, setTab] = useState("mese");
  const [refreshing, setRefreshing] = useState(false);
  const apiUrl = slug == null ? null : `/api/admin/revenue-pacing${slug ? `?creator=${encodeURIComponent(slug)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR(apiUrl, liveFetcher, { revalidateOnFocus: false });
  // Creator salvata che non è più tra le tue (403 con l'elenco): si passa alla prima visibile.
  useEffect(() => {
    if (error?.creators?.length && !error.creators.some((c) => c.slug === slug)) setSlug(error.creators[0].slug);
  }, [error, slug]);
  const COUNTRIES = data?.countries || [];
  const multi = COUNTRIES.length > 1;
  // "Totale" solo con più account; un paese che la creator non ha → il primo (o Totale)
  const country = countryPick === "ALL" ? (multi ? "ALL" : COUNTRIES[0]) : COUNTRIES.includes(countryPick) ? countryPick : multi ? "ALL" : COUNTRIES[0];
  const creatorName = (data?.creators || []).find((c) => c.slug === data?.creator)?.short || "";
  const creatorFull = (data?.creators || []).find((c) => c.slug === data?.creator)?.name || creatorName;
  const chatSwr = useSWR(data?.creator ? `/api/admin/chat-monitor?tab=live&creator=${encodeURIComponent(data.creator)}` : null, liveFetcher, { revalidateOnFocus: false });
  const chat = useMemo(() => {
    const live = chatSwr.data;
    if (!live) return null;
    const inScope = (r) => country === "ALL" || r.country === country;
    const today = (live.today || []).filter(inScope);
    const wrote = today.reduce((a, t) => a + (t.fans_wrote || 0), 0);
    const lat = wrote ? today.reduce((a, t) => a + (t.lat_med_s || 0) * (t.fans_wrote || 0), 0) / wrote / 60 : null;
    return { waiting: waitingNow((live.queue || []).filter(inScope)).length, latMin: lat, href: `/admin/chat-monitor?creator=${encodeURIComponent(data.creator)}` };
  }, [chatSwr.data, country, data?.creator]);

  const rows = data?.data || [];
  const row = useMemo(() => (country === "ALL" ? totalRow(rows) : rows.find((r) => r.country === country)), [rows, country]);
  const daily = useDaily(data?.trend, country);
  const month = monthKey(row?.as_of_date);
  const goalSet = row ? goalFor(data?.goals, country, month, COUNTRIES) : null;
  // senza traguardo impostato: proposta = mese precedente +10% (decisione di Nicholas, 09/10)
  const goalSugg = row && goalSet == null ? suggestedGoal(data?.trend, country === "ALL" ? COUNTRIES : [country], month) : null;
  const goal = goalSet ?? goalSugg;
  const goalSuggested = goalSet == null && goalSugg != null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await liveFetcher(`/api/admin/revenue-pacing?refresh=1&creator=${encodeURIComponent(data?.creator || slug || "")}`);
      await mutate(fresh, { revalidate: false });
    } catch (e) {
      alert(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const lastTx = data?.freshness
    ? (country === "ALL" ? COUNTRIES.map((c) => data.freshness[`tx_live_${c}`]) : [data.freshness[`tx_live_${country}`]]).filter(Boolean).sort().pop()
    : null;

  return (
    <CountriesCtx.Provider value={COUNTRIES}>
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 60px", fontFamily: FONTS.body }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: CP.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 14, height: 14, background: CP.accent, transform: "rotate(45deg)", borderRadius: 2, display: "inline-block" }} />
          Revenue Analytics{creatorName ? ` · ${creatorName}` : ""}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: CP.textMuted }}>
          {data?.updated_at && <span>{new Date(data.updated_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={refresh} disabled={refreshing} title="Aggiorna ora" aria-label="Aggiorna ora" style={iconBtn}>
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      <CreatorPills creators={data?.creators || error?.creators} current={data?.creator || slug} onChange={setSlug} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(multi ? ["ALL", ...COUNTRIES] : COUNTRIES).map((c) => (
          <button key={c} onClick={() => setCountry(c)} style={pill(country === c)}>{COUNTRY_LABEL[c]}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 14, marginBottom: 16, borderBottom: `1px solid ${CP.border}` }}>
        <button onClick={() => setTab("mese")} style={tabBtn(tab === "mese")}>Mese & Proiezioni</button>
        <button onClick={() => setTab("recente")} style={tabBtn(tab === "recente")}>Performance Recente</button>
      </div>

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && !data && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso (pochi secondi la prima volta)…</div>}

      {row && tab === "mese" && (
        <>
          <StatusChip>Aggiornato · {new Date(data.updated_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} <span style={{ color: CP.textMuted }}>({fmtAgo(new Date(data.updated_at).getTime())})</span></StatusChip>
          <MonthTab row={row} goal={goal} goalSuggested={goalSuggested} country={country} month={month} daily={daily} data={data} mutate={mutate} creatorName={creatorFull} chat={chat} />
        </>
      )}
      {row && tab === "recente" && (
        <>
          <StatusChip>Live <span style={{ color: CP.textMuted }}>· ultima transazione {lastTx ? `${new Date(lastTx).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} (${fmtAgo(new Date(lastTx).getTime())})` : "—"}</span></StatusChip>
          <RecentTab row={row} country={country} month={month} daily={daily} />
        </>
      )}
      {row && <div style={{ textAlign: "center", fontSize: 12, color: CP.textMuted, marginTop: 20 }}>Fonte: BigQuery HOC · {COUNTRY_LONG[country]} · i giorni sono in ora UTC</div>}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
    </CountriesCtx.Provider>
  );
}

// ─── Mattoni grafici ────────────────────────────────────────────────────────

const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, cursor: "pointer" };
const pill = (on) => ({ padding: "7px 16px", borderRadius: 999, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, fontWeight: on ? 500 : 400, border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : CP.surface, color: on ? CP.accentSoftText : CP.textPrimary });
const tabBtn = (on) => ({ padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: "none", background: on ? CP.surfaceAlt : "transparent", color: on ? CP.textPrimary : CP.textSecondary, fontWeight: on ? 500 : 400 });
const box = { ...card, padding: "14px 16px" };
const label = { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: CP.textSecondary, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 };
const big = { fontSize: 22, fontWeight: 500, color: CP.textPrimary, margin: "4px 0 2px", ...NUM };
const small = { fontSize: 12.5, color: CP.textSecondary, ...NUM };

function I({ tip }) {
  return <span title={tip} style={{ display: "inline-flex", color: CP.textMuted, cursor: "help" }}><Info size={12} /></span>;
}
function Label({ children, tip }) {
  return <div style={label}>{children}{tip && <I tip={tip} />}</div>;
}
function SectionLabel({ children, tip }) {
  return <div style={{ ...label, margin: "18px 0 8px" }}>{children}{tip && <I tip={tip} />}</div>;
}
function StatusChip({ children }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, fontSize: 12, color: CP.textPrimary, marginBottom: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: CP.accentGreen }} />{children}
    </div>
  );
}
function Bar({ parts }) {
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", background: CP.surfaceAlt, margin: "8px 0 4px" }}>
      {parts.map((p, i) => <div key={i} style={{ width: `${Math.max(0, Math.min(1, p.v || 0)) * 100}%`, background: p.c }} />)}
    </div>
  );
}
function Row({ k, v, strong, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "3px 0", color: strong ? CP.textPrimary : CP.textSecondary, fontWeight: strong ? 500 : 400 }}>
      <span>{k}</span><span style={{ color: color || CP.textPrimary, fontWeight: 500, ...NUM }}>{v}</span>
    </div>
  );
}
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 });

// ─── Scheda "Mese & Proiezioni" ─────────────────────────────────────────────

function MonthTab({ row, goal, goalSuggested, country, month, daily, data, mutate, creatorName, chat }) {
  const [goalsOpen, setGoalsOpen] = useState(false);
  const openGoals = () => { setGoalsOpen(true); setTimeout(() => document.getElementById("obiettivi-mensili")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  const [howOpen, setHowOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tot = (row.new_sub_revenue_mtd || 0) + (row.retention_revenue_mtd || 0);
  const pNew = div(row.new_sub_revenue_mtd, tot) || 0;
  const deltaHistPct = div(row.revenue_delta_vs_hist, row.revenue_hist_avg);
  const subsVsHist = div((row.new_subs_proj_eom || 0) - (row.new_subs_hist_avg || 0), row.new_subs_hist_avg);
  const spenders = row.current_month_converting_new_subs || 0;
  const pSpend = div(spenders, row.new_subs_mtd) || 0;
  const unspent = Math.max(0, (row.new_sub_expected_eom_revenue || 0) - (row.new_sub_revenue_mtd || 0));

  // Mese scorso completo (dalla serie giornaliera)
  const prevMonth = addMonths(month, -1);
  let prevRev = 0, prevDays = 0;
  for (const d of daily.values()) if (monthKey(d.date) === prevMonth) { prevRev += d.rev; prevDays++; }
  const prevComplete = prevDays > 0;

  const goalPct = div(row.revenue_mtd, goal);
  const expectedPace = div(row.day_of_month, row.days_in_month); // ritmo atteso lineare, come l'originale
  const gapPp = goalPct != null && expectedPace != null ? (goalPct - expectedPace) * 100 : null;
  const projVsGoal = goal != null ? row.revenue_proj_eom - goal : null;

  return (
    <>
      <RaceHero row={row} goal={goal} goalSuggested={goalSuggested} month={month} daily={daily} creatorName={creatorName} onSetGoal={openGoals} chat={chat} />
      <Disclosure open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} title="Tutti i numeri del mese"
        summary="Composizione del revenue, proiezioni, monetizzazione dei nuovi, obiettivo e mese scorso">
      <div style={grid(240)}>
        <div style={box}>
          <Label tip="Revenue netto incassato dal primo del mese a oggi, diviso tra nuovi abbonati del mese e abbonati dei mesi prima.">Revenue del mese</Label>
          <div style={big}>{fmt$(row.revenue_mtd)}</div>
          <div style={small}>Giorno {row.day_of_month}/{row.days_in_month} · {row.days_remaining}gg rimasti</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: CP.textSecondary, marginTop: 10 }}><span>New sub</span><span>Retention</span></div>
          <Bar parts={[{ v: pNew, c: CP.accent }, { v: 1 - pNew, c: CP.accentGreen }]} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, ...NUM }}>
            <span style={{ color: CP.accent }}>{fmt$(row.new_sub_revenue_mtd)} ({pct(pNew, 0)})</span>
            <span style={{ color: CP.accentGreen }}>{fmt$(row.retention_revenue_mtd)} ({pct(1 - pNew, 0)})</span>
          </div>
        </div>

        <div style={box}>
          <Label tip="Dove chiude il mese: ogni giorno pesa quanto ha pesato negli ultimi 12 mesi chiusi (gli ultimi 3 mesi contano il triplo). Il confronto è con la media degli ultimi 12 mesi.">Proiezione fine mese</Label>
          <div style={big}>{fmt$(row.revenue_proj_eom)}</div>
          <div style={{ ...small, color: tone(row.revenue_delta_vs_hist) }}>{signed$(row.revenue_delta_vs_hist)} vs storico ({signedPct(deltaHistPct, 0)})</div>
          {unspent > 0 && (
            <div style={{ display: "inline-block", marginTop: 8, fontSize: 12, padding: "2px 8px", borderRadius: 6, background: alpha(CP.accentGreen, "1a"), color: CP.accentGreen, border: `1px solid ${alpha(CP.accentGreen, "44")}` }}>
              ▲ {fmt$(unspent)} da new sub non ancora spesi
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary }}>Affidabilità: {CONFIDENCE[row.projection_confidence] || row.projection_confidence}</span>
          </div>
          <div style={{ ...small, marginTop: 6 }}>{country === "ALL" ? "Somma degli account" : COUNTRY_LONG[country]}</div>
        </div>

        <div style={box}>
          <Label tip="Fan che si sono iscritti per la prima volta questo mese. Spendenti = hanno già fatto almeno un acquisto.">Nuovi sub del mese</Label>
          <div style={big}>{fmtInt(row.new_subs_mtd)}</div>
          <div style={{ ...small, color: tone(subsVsHist) }}>Proiezione: {fmtInt(row.new_subs_proj_eom)} ({signedPct(subsVsHist, 0)} vs storico)</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: CP.textSecondary, marginTop: 10 }}><span>Spendenti</span><span>Non conv.</span></div>
          <Bar parts={[{ v: pSpend, c: CP.accentGreen }]} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, ...NUM }}>
            <span style={{ color: CP.accentGreen }}>{fmtInt(spenders)} ({pct(pSpend, 0)})</span>
            <span style={{ color: CP.textSecondary }}>{fmtInt((row.new_subs_mtd || 0) - spenders)} non conv.</span>
          </div>
        </div>
      </div>

      <div style={{ ...box, marginTop: 10 }}>
        <Label tip="Incassato del mese contro l'obiettivo. Ritmo atteso = quota di mese trascorsa (giorni passati ÷ giorni del mese).">
          Obiettivo mensile · {COUNTRY_LONG[country]} — {monthName(month)}{goalSuggested ? " · suggerito (mese prima +10%)" : ""}
        </Label>
        {goal == null ? (
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 8 }}>
            Nessun obiettivo impostato per {monthName(month)}.{" "}
            <button onClick={() => setGoalsOpen(true)} style={{ background: "none", border: "none", color: CP.accent, cursor: "pointer", padding: 0, fontSize: 13, fontFamily: FONTS.body }}>Imposta l'obiettivo</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
              <div style={{ ...NUM }}><span style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary }}>{fmt$(row.revenue_mtd)}</span> <span style={{ color: CP.textSecondary, fontSize: 16 }}>/ {fmt$(goal)}</span></div>
              <div style={{ fontWeight: 500, color: goalPct >= expectedPace ? CP.accentGreen : CP.attn, ...NUM }}>{pct(goalPct)}</div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: CP.surfaceAlt, overflow: "hidden", margin: "8px 0" }}>
              <div style={{ width: `${Math.min(1, goalPct || 0) * 100}%`, height: "100%", background: CP.accent }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 13, color: CP.textSecondary, ...NUM }}>
              <span>Proiezione EOM: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(row.revenue_proj_eom)}</b> <span style={{ color: tone(projVsGoal) }}>({signed$(projVsGoal)} / {signedPct(div(projVsGoal, goal))})</span></span>
              <span>Ritmo atteso: {pct(expectedPace, 0)} · Sei <span style={{ color: tone(gapPp) }}>{gapPp == null ? "—" : `${gapPp > 0 ? "+" : gapPp < 0 ? "−" : ""}${Math.abs(gapPp).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}pp`}</span></span>
            </div>
          </>
        )}
        {prevComplete && (
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 13, color: CP.textSecondary, borderTop: `1px solid ${CP.border}`, marginTop: 10, paddingTop: 8, ...NUM }}>
            <span>{monthName(prevMonth)} (completo): <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(prevRev)}</b></span>
            <span>Proiezione vs mese scorso: <span style={{ color: tone(div(row.revenue_proj_eom - prevRev, prevRev)) }}>{signedPct(div(row.revenue_proj_eom - prevRev, prevRev))}</span></span>
          </div>
        )}
      </div>

      <div style={{ ...box, marginTop: 10 }}>
        <Label tip="Quanto rendono i nuovi abbonati del mese, contro la media degli ultimi 12 mesi.">Monetizzazione acquisizioni — mese corrente</Label>
        <div style={{ ...grid(160), marginTop: 8 }}>
          <Mini k="LTV mese" v={fmt$2(row.current_month_ltv)} s="Rev new sub / tot sub" />
          <Mini k="ARPPU mese" v={fmt$2(row.current_month_arppu)} s={`New sub spendenti: ${fmtInt(spenders)}`} />
          <Mini k="ARPPU storico 12M" v={fmt$2(row.avg_revenue_per_new_sub)} s="Media per new sub convertito" />
          <Mini k="Conv. rate storico" v={pct(row.hist_conversion_rate)} s="Sub → almeno 1 transaction" />
        </div>
      </div>

      <SectionLabel tip="Revenue del mese diviso tra i nuovi abbonati (prima iscrizione questo mese) e tutti gli altri.">Composizione revenue generato</SectionLabel>
      <div style={{ ...box, borderColor: alpha(CP.accent, "55") }}>
        <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: CP.accent }}>New sub (mese corrente)</div>
        <div style={big}>{fmt$(row.new_sub_revenue_mtd)}</div>
        <Row k="% del totale generato" v={pct(pNew)} />
        <Row k="Utenti spendenti" v={fmtInt(spenders)} />
        <Row k="Revenue retention" v={fmt$(row.retention_revenue_mtd)} />
        <Bar parts={[{ v: pNew, c: CP.accent }]} />
        <div style={{ borderTop: `1px solid ${CP.border}`, marginTop: 10, paddingTop: 8 }}>
          <Row k={`Da iscritti degli ultimi 30 giorni (${fmtInt(row.rolling_cohort_converting_users)} paganti su ${fmtInt(row.rolling_cohort_total_subs)})`} v={`${fmt$(row.rolling_cohort_revenue_mtd)} · ${pct(row.rolling_cohort_revenue_pct)}`} />
        </div>
      </div>

      <div style={{ ...box, marginTop: 10 }}>
        <Label tip="Quanto dovrebbero spendere entro fine mese i nuovi abbonati previsti: nuovi a fine mese × quota storica che compra × spesa media storica di chi compra.">Revenue atteso da nuovi sub</Label>
        <div style={{ marginTop: 8 }}>
          <Row k="New sub proiettati a fine mese" v={fmtInt(row.new_subs_proj_eom)} />
          <Row k="Conv. storico × ARPPU storico" v={`${pct(row.hist_conversion_rate)} × ${fmt$2(row.avg_revenue_per_new_sub)}`} />
          <div style={{ borderTop: `1px solid ${CP.border}`, marginTop: 6, paddingTop: 6 }}>
            <Row k="Totale atteso da new sub EOM" v={fmt$(row.new_sub_expected_eom_revenue)} strong color={CP.accent} />
          </div>
        </div>
      </div>

      </Disclosure>
      <div style={{ marginTop: 14 }}>
<div id="obiettivi-mensili">
        <Disclosure open={goalsOpen} onToggle={() => setGoalsOpen((o) => !o)} title="Obiettivi mensili" summary={`Imposta o correggi l'obiettivo di ${monthName(month)} e dei mesi vicini`}>
          <GoalsEditor creator={data.creator} goals={data.goals} history={data.goals_history} month={month} onSaved={(g) => mutate({ ...data, goals: g.goals, goals_history: g.goals_history }, { revalidate: false })} />
        </Disclosure>
        </div>
        <Disclosure open={howOpen} onToggle={() => setHowOpen((o) => !o)} title="Come si calcola" summary="Pesi per giorno del mese, media storica, affidabilità">
          <HowItWorks row={row} />
        </Disclosure>
      </div>
    </>
  );
}

function Mini({ k, v, s }) {
  return (
    <div>
      <div style={{ ...label, fontSize: 10.5 }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 500, color: CP.textPrimary, margin: "3px 0 1px", ...NUM }}>{v}</div>
      <div style={{ fontSize: 12, color: CP.textSecondary }}>{s}</div>
    </div>
  );
}

// ─── Scheda "Performance Recente" ───────────────────────────────────────────

function RecentTab({ row, country, month, daily }) {
  const today = row.as_of_date;
  const prevMonth = addMonths(month, -1);
  const sumRange = (from, to) => {
    let rev = 0, subs = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { const x = daily.get(d); if (x) { rev += x.rev; subs += x.subs; } }
    return { rev, subs };
  };
  const monthTotals = (key) => {
    let rev = 0, subs = 0;
    for (const d of daily.values()) if (monthKey(d.date) === key) { rev += d.rev; subs += d.subs; }
    return { rev, subs };
  };
  const prev = monthTotals(prevMonth);
  const cur = monthTotals(month);
  const yesterday = addDays(today, -1);
  const periods = [7, 14, 30].map((n) => {
    const a = sumRange(addDays(yesterday, -(n - 1)), yesterday);
    const b = sumRange(addDays(yesterday, -(2 * n - 1)), addDays(yesterday, -n));
    return { n, a, b };
  });
  const last30 = [];
  for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); const x = daily.get(d); last30.push({ date: d, rev: x?.rev || 0, subs: x?.subs || 0 }); }

  return (
    <>
      <SectionLabel tip="Il mese scorso intero contro il mese in corso fino a oggi.">Mese precedente vs in corso</SectionLabel>
      <div style={grid(260)}>
        <div style={box}>
          <Label>{monthName(prevMonth)} (completo)</Label>
          <div style={big}>{fmt$(prev.rev)}</div>
          <div style={small}>{fmtInt(prev.subs)} nuovi sub</div>
        </div>
        <div style={{ ...box, borderColor: CP.accent, background: alpha(CP.accent, "0d") }}>
          <Label>{monthName(month)} (in corso)</Label>
          <div style={big}>{fmt$(cur.rev)}</div>
          <div style={small}>{fmtInt(cur.subs)} nuovi sub</div>
        </div>
      </div>

      <SectionLabel tip="Ultimi N giorni chiusi (oggi escluso) contro gli N giorni prima.">Confronto periodi · {COUNTRY_LONG[country]}</SectionLabel>
      <div style={grid(220)}>
        {periods.map(({ n, a, b }) => {
          const dr = div(a.rev - b.rev, b.rev);
          const ds = div(a.subs - b.subs, b.subs);
          return (
            <div key={n} style={box}>
              <Label>Ultimi {n} giorni (oggi escl.)</Label>
              <div style={{ ...label, fontSize: 10.5, marginTop: 8 }}>Revenue</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{fmt$(a.rev)}</div>
              <div style={{ fontSize: 12, color: tone(dr), ...NUM }}>{signedPct(dr)} vs periodo prec.</div>
              <div style={{ ...label, fontSize: 10.5, marginTop: 8 }}>Nuovi sub</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{fmtInt(a.subs)}</div>
              <div style={{ fontSize: 12, color: tone(ds), ...NUM }}>{signedPct(ds)} vs periodo prec.</div>
            </div>
          );
        })}
      </div>

      <SectionLabel tip="Revenue netto giorno per giorno. Oggi è un giorno ancora in corso.">Andamento revenue — ultimi 30gg</SectionLabel>
      <LineChart points={last30} k="rev" fmt={(v) => fmt$(v)} />
      <SectionLabel tip="Nuove iscrizioni giorno per giorno (prima iscrizione del fan a quella pagina).">Andamento nuovi sub — ultimi 30gg</SectionLabel>
      <LineChart points={last30} k="subs" fmt={(v) => fmtInt(v)} />

      <DailyTable country={country} today={today} daily={daily} />
    </>
  );
}

function LineChart({ points, k, fmt }) {
  const [hover, setHover] = useState(null);
  const W = 1000, H = 230, padL = 70, padR = 20, padT = 16, padB = 30;
  const vals = points.map((p) => p[k]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / span);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const ticks = [max, (max + min) / 2, min];
  const labelEvery = Math.ceil(points.length / 7);
  const h = hover != null ? points[hover] : null;
  return (
    <div style={{ ...box, padding: "10px 12px", position: "relative" }}>
      {h && (
        <div style={{ position: "absolute", top: 8, right: 12, fontSize: 12, color: CP.textSecondary, ...NUM }}>
          {shortDate(h.date)}: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt(h[k])}</b>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)} role="img">
        <defs>
          <linearGradient id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CP.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={CP.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={CP.border} strokeDasharray="4 4" />
            <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="13" fill={CP.textSecondary}>{fmt(t)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#g-${k})`} />
        <path d={line} fill="none" stroke={CP.accent} strokeWidth="2.2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - (W / points.length) / 2} y={padT} width={W / points.length} height={H - padT - padB} fill="transparent" />
            {(i % labelEvery === 0 || i === points.length - 1) && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="13" fill={CP.textSecondary}>{shortDate(p.date)}</text>}
            {(hover === i || i === points.length - 1) && <circle cx={x(i)} cy={y(p[k])} r="4" fill={CP.accent} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

function DailyTable({ country, today, daily }) {
  const COUNTRIES = useCountries();
  const [mode, setMode] = useState("rev");
  const isRev = mode === "rev";
  const fmtV = isRev ? fmt$ : fmtInt;
  const days = [];
  for (let i = 0; i < 14; i++) days.push(addDays(today, -i));
  // cumulativo del mese fino a ciascun giorno
  const cum = (d) => {
    let s = 0;
    for (let x = `${monthKey(d)}-01`; x <= d; x = addDays(x, 1)) s += (daily.get(x)?.[mode] || 0);
    return s;
  };
  const th = { textAlign: "right", padding: "8px 10px", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500, color: CP.textSecondary, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
  const td = { textAlign: "right", padding: "8px 10px", fontSize: 13, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap", color: CP.textPrimary, ...NUM };
  return (
    <>
      <SectionLabel tip="Ogni giorno confrontato con lo stesso giorno del mese precedente; cumulativo = totale del mese fino a quel giorno.">Dettaglio giornaliero — ultimi 14gg</SectionLabel>
      <div style={box}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => setMode("rev")} style={tabBtn(isRev)}>Revenue</button>
          <button onClick={() => setMode("subs")} style={tabBtn(!isRev)}>Nuovi Sub</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: country === "ALL" ? 620 : 480 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Data</th>
                <th style={th}>{isRev ? "Revenue" : "Nuovi sub"}</th>
                <th style={th}>Δ vs mese prec.</th>
                <th style={th}>{isRev ? "Rev. cumulativo" : "Cumulativo"}</th>
                {country === "ALL" && <th style={th}>{COUNTRIES.join(" / ")}</th>}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const x = daily.get(d);
                const v = x?.[mode] || 0;
                const pd = sameDayPrevMonth(d);
                const pv = pd ? daily.get(pd)?.[mode] : null;
                const delta = pv ? (v - pv) / pv : null;
                const by = x ? (isRev ? x.revBy : x.subsBy) : null;
                const byTot = by ? COUNTRIES.reduce((a, c) => a + (by[c] || 0), 0) : 0;
                return (
                  <tr key={d}>
                    <td style={{ ...td, textAlign: "left" }}>{shortDate(d)}{d === today && <span style={{ color: CP.textMuted, fontSize: 11 }}> · in corso</span>}</td>
                    <td style={td}>{fmtV(v)}</td>
                    <td style={td}>
                      <span style={{ color: tone(delta) }}>{signedPct(delta, 0)}</span>
                      <div style={{ fontSize: 11.5, color: CP.textMuted }}>{pv == null ? "" : fmtV(pv)}</div>
                    </td>
                    <td style={td}>{fmtV(cum(d))}</td>
                    {country === "ALL" && (
                      <td style={td}>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", fontSize: 12 }}>
                          {COUNTRIES.map((c) => <span key={c} title={c} style={{ color: CP.textSecondary }}>{byTot ? pct(by[c] / byTot, 0) : "—"}</span>)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Obiettivi e metodo ─────────────────────────────────────────────────────

function GoalsEditor({ creator, goals, history, month, onSaved }) {
  const COUNTRIES = useCountries();
  const months = [-2, -1, 0, 1].map((n) => addMonths(month, n));
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const save = async (country, m) => {
    const k = `${country}|${m}`;
    if (!(k in draft)) return;
    const raw = String(draft[k]).replace(/[^\d]/g, "");
    setBusy(k);
    setErr(null);
    try {
      const r = await fetch("/api/admin/revenue-pacing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creator, country, month: m, value: raw === "" ? null : Number(raw) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      onSaved(d);
      setDraft((x) => { const n = { ...x }; delete n[k]; return n; });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const input = { width: 110, padding: "6px 8px", borderRadius: 6, border: `1px solid ${CP.border}`, background: CP.bg, color: CP.textPrimary, fontSize: 14, textAlign: "right", fontFamily: FONTS.body, ...NUM };
  return (
    <div>
      {err && <Notice danger>{err}</Notice>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 12, fontWeight: 500, color: CP.textMuted }}>Paese</th>
              {months.map((m) => <th key={m} style={{ padding: "6px 10px", textAlign: "right", fontSize: 12, fontWeight: 500, color: m === month ? CP.textPrimary : CP.textMuted }}>{monthName(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {COUNTRIES.map((c) => (
              <tr key={c}>
                <td style={{ padding: "6px 10px", fontSize: 14 }}>{COUNTRY_LONG[c]}</td>
                {months.map((m) => {
                  const k = `${c}|${m}`;
                  const v = k in draft ? draft[k] : goals?.[c]?.[m] ?? "";
                  return (
                    <td key={m} style={{ padding: "6px 10px", textAlign: "right" }}>
                      <span style={{ color: CP.textMuted, marginRight: 4 }}>$</span>
                      <input value={v === "" ? "" : String(v).replace(/[^\d]/g, "")} inputMode="numeric" placeholder="—" disabled={busy === k} aria-label={`Obiettivo ${COUNTRY_LONG[c]} ${monthName(m)}`}
                        onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))}
                        onBlur={() => save(c, m)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} style={input} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Si salva da solo quando esci dalla casella. Lascia vuoto per togliere l'obiettivo. Il totale è la somma dei tre paesi.</p>
      {history?.length > 0 && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10, lineHeight: 1.7 }}>
          {history.slice(0, 5).map((h, i) => (
            <div key={i}>{fmtAgo(new Date(h.at).getTime())} · {h.by} · {COUNTRY_LONG[h.country]} {monthName(h.month)}: {h.from == null ? "—" : fmt$(h.from)} → {h.to == null ? "—" : fmt$(h.to)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function HowItWorks({ row }) {
  const li = { margin: "0 0 8px" };
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: CP.textSecondary }}>
      <li style={li}><b>Proiezione.</b> Non è un semplice "incassato ÷ giorni × 30": ogni giorno del mese pesa quanto ha pesato davvero negli ultimi 12 mesi chiusi. I 3 mesi più recenti contano il triplo, quelli fino a 6 mesi il doppio. Con meno di 4 mesi di storico si usa la proiezione lineare.</li>
      <li style={li}><b>Media storica.</b> È solo un termine di paragone, non entra nella proiezione: dopo il ban Instagram di maggio-giugno 2025 i mesi vecchi non sono più confrontabili uno a uno.</li>
      <li style={li}><b>Affidabilità.</b> Bassa fino al giorno 7, media fino al 15, alta fino al 25, poi molto alta.</li>
      <li style={li}><b>New sub non ancora spesi.</b> Revenue atteso dai nuovi abbonati a fine mese meno quello che hanno già speso.</li>
      <li style={li}><b>Ritmo atteso.</b> Quota di mese trascorsa (giorni passati ÷ giorni del mese), come nel sito originale.</li>
      <li style={li}><b>Revenue.</b> Netto delle transazioni attribuite agli account della creator, per giorno in ora UTC. Metodo attuale: {row.projection_method === "day_weight" ? "pesi per giorno" : row.projection_method === "linear" ? "lineare" : "misto"}, {row.closed_months_count ?? "—"} mesi chiusi di storico.</li>
    </ul>
  );
}
