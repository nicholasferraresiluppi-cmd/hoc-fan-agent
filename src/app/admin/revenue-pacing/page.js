"use client";

// Revenue Laura — dove chiude il mese, paese per paese (IT/EN/ES), contro
// l'obiettivo e contro la media storica. Ricostruzione di revenue.hoc.tools
// (spento a ottobre 2026): stessa logica delle sue viste BigQuery, stessi numeri. Vedi
// src/lib/revenue-pacing.js per il metodo.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$, fmtInt, fmtPct, fmtSigned$, fmtAgo, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, FilterChip, Disclosure, Notice, card, NUM } from "@/components/ds";

const errText = (status) =>
  status === 401 || status === 403 ? "Non hai il permesso per vedere questi dati." :
  status >= 500 ? "Calcolo fallito o troppo lungo — riprova." : "Errore.";
const fetcher = (url) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))
  );

const COUNTRY_LABEL = { ALL: "Tutti i paesi", IT: "Italia", EN: "Inglese", ES: "Spagnolo" };
const CONFIDENCE = { BASSA: "bassa", MEDIA: "media", ALTA: "alta", "MOLTO ALTA": "molto alta" };
const fmt$2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const monthKey = (iso) => String(iso || "").slice(0, 7);
const monthName = (key) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_IT[m - 1]} ${y}`;
};
const addMonths = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const div = (a, b) => (a == null || !b ? null : a / b);

// Somma dei tre paesi: i campi additivi si sommano, i rapporti si RICALCOLANO
// dalle somme (mai media di percentuali).
function totalRow(rows) {
  if (!rows.length) return null;
  const s = (f) => rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
  const t = {
    country: "ALL",
    as_of_date: rows[0].as_of_date, day_of_month: rows[0].day_of_month, days_in_month: rows[0].days_in_month, days_remaining: rows[0].days_remaining,
    projection_confidence: rows[0].projection_confidence,
    projection_method: rows.every((r) => r.projection_method === rows[0].projection_method) ? rows[0].projection_method : "misto",
  };
  for (const f of ["revenue_mtd", "revenue_proj_eom", "revenue_hist_avg", "revenue_delta_vs_hist", "new_subs_mtd", "new_subs_proj_eom", "new_subs_hist_avg",
    "new_sub_revenue_mtd", "retention_revenue_mtd", "current_month_converting_new_subs", "rolling_cohort_total_subs", "rolling_cohort_converting_users",
    "rolling_cohort_revenue_mtd", "new_sub_expected_eom_revenue"]) t[f] = s(f);
  t.new_sub_revenue_pct_mtd = div(t.new_sub_revenue_mtd, t.new_sub_revenue_mtd + t.retention_revenue_mtd);
  t.current_month_arppu = div(t.new_sub_revenue_mtd, t.current_month_converting_new_subs);
  t.current_month_ltv = div(t.new_sub_revenue_mtd, t.new_subs_mtd);
  t.rolling_cohort_revenue_pct = div(t.rolling_cohort_revenue_mtd, t.revenue_mtd);
  // Storici pesati sui nuovi abbonati di ciascun paese (la stessa media che si avrebbe sommando i paesi).
  const histSubs = rows.reduce((a, r) => a + (Number(r.new_subs_hist_avg) || 0), 0);
  const histConv = rows.reduce((a, r) => a + (Number(r.new_subs_hist_avg) || 0) * (Number(r.hist_conversion_rate) || 0), 0);
  t.hist_conversion_rate = div(histConv, histSubs);
  t.avg_revenue_per_new_sub = div(rows.reduce((a, r) => a + (Number(r.new_subs_hist_avg) || 0) * (Number(r.hist_conversion_rate) || 0) * (Number(r.avg_revenue_per_new_sub) || 0), 0), histConv);
  return t;
}

function goalFor(goals, country, month) {
  if (!goals) return null;
  if (country === "ALL") {
    const vals = ["IT", "EN", "ES"].map((c) => goals[c]?.[month]);
    return vals.every((v) => v == null) ? null : vals.reduce((a, v) => a + (v || 0), 0);
  }
  return goals[country]?.[month] ?? null;
}

// ≥100% verde, 90-100 neutro, sotto 90 attenzione (mai rosso: è un ritmo, non una colpa).
const paceColor = (r) => (r == null ? CP.textMuted : r >= 1 ? CP.accentGreen : r >= 0.9 ? CP.textPrimary : CP.attn);

export default function RevenuePacingPage() {
  const [country, setCountry] = useState("ALL");
  const [howOpen, setHowOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, isLoading, mutate } = useSWR("/api/admin/revenue-pacing", fetcher, { revalidateOnFocus: false });

  const rows = data?.data || [];
  const row = useMemo(() => (country === "ALL" ? totalRow(rows) : rows.find((r) => r.country === country)), [rows, country]);
  const month = monthKey(row?.as_of_date);
  const goal = row ? goalFor(data?.goals, country, month) : null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetcher("/api/admin/revenue-pacing?refresh=1");
      await mutate(fresh, { revalidate: false });
    } catch (e) {
      alert(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 60px", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ href: "/admin", label: "Hub" }, { label: "Revenue Laura" }]}
        title="Revenue Laura"
        subtitle="Dove chiude il mese, paese per paese: incassato finora, proiezione a fine mese, obiettivo e media degli ultimi 12 mesi."
        actions={
          <button onClick={refresh} disabled={refreshing} style={btn}>
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} /> {refreshing ? "Aggiorno…" : "Aggiorna ora"}
          </button>
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 16px" }}>
        {["ALL", "IT", "EN", "ES"].map((c) => (
          <FilterChip key={c} label={COUNTRY_LABEL[c]} active={country === c} onClick={() => setCountry(c)} />
        ))}
      </div>

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && !data && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso (pochi secondi la prima volta)…</div>}

      {row && (
        <>
          <Hero row={row} goal={goal} />
          <DailyChart trend={data.trend || []} country={country} month={month} goal={goal} row={row} />
          <Subscribers row={row} />
          <Mix row={row} />
          <CountryTable rows={rows} goals={data.goals} month={month} onPick={setCountry} />
          <Disclosure open={goalsOpen} onToggle={() => setGoalsOpen((o) => !o)} title="Obiettivi mensili" summary={`Imposta o correggi l'obiettivo di ${monthName(month)} e dei mesi vicini`}>
            <GoalsEditor goals={data.goals} history={data.goals_history} month={month} onSaved={(g) => mutate({ ...data, goals: g.goals, goals_history: g.goals_history }, { revalidate: false })} />
          </Disclosure>
          <Disclosure open={howOpen} onToggle={() => setHowOpen((o) => !o)} title="Come si calcola" summary="Pesi per giorno del mese, media storica, affidabilità">
            <HowItWorks row={row} />
          </Disclosure>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8, lineHeight: 1.6 }}>
            Dati del {row.as_of_date} (giorno {row.day_of_month} di {row.days_in_month}) · ricalcolati {fmtAgo(new Date(data.updated_at).getTime())}
            {data.freshness && <> · ultima transazione: {["IT", "EN", "ES"].map((c) => `${c} ${fmtTime(data.freshness[`tx_live_${c}`])}`).join(", ")}</>}
            {" "}· i giorni sono in ora UTC
          </div>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function Hero({ row, goal }) {
  const pace = div(row.revenue_proj_eom, goal);
  const missing = goal != null ? Math.max(0, goal - row.revenue_mtd) : null;
  const perDay = missing != null && row.days_remaining > 0 ? missing / row.days_remaining : null;
  const conf = CONFIDENCE[row.projection_confidence] || row.projection_confidence;
  return (
    <HeroMetric
      label={`Proiezione a fine ${MONTHS_IT[Number(monthKey(row.as_of_date).slice(5)) - 1] || "mese"}`}
      value={fmt$(row.revenue_proj_eom)}
      compare={
        goal != null ? (
          <span>
            obiettivo {fmt$(goal)} · al ritmo attuale{" "}
            <b style={{ color: paceColor(pace), fontWeight: 500 }}>{fmtPct(pace)} dell'obiettivo</b>
          </span>
        ) : "nessun obiettivo impostato per questo mese"
      }
      hint={`Affidabilità ${conf} (giorno ${row.day_of_month} di ${row.days_in_month})${row.projection_method === "linear" ? " · proiezione lineare: meno di 4 mesi di storico" : ""}`}
    >
      <Metric label="Incassato finora" value={fmt$(row.revenue_mtd)} note={`${row.days_remaining} giorni alla fine`} />
      {goal != null && (
        <Metric label="Per centrare l'obiettivo" value={missing === 0 ? "raggiunto" : `${fmt$(perDay)}/giorno`} note={missing === 0 ? null : `mancano ${fmt$(missing)}`} />
      )}
      <Metric label="Media ultimi 12 mesi" value={fmt$(row.revenue_hist_avg)} note={`la proiezione è ${fmtSigned$(row.revenue_delta_vs_hist)}`} />
    </HeroMetric>
  );
}

// Grafico giornaliero: barre = revenue del giorno (mese in corso in evidenza),
// linea tratteggiata = ritmo giornaliero che serve per l'obiettivo del mese in corso.
function DailyChart({ trend, country, month, goal, row }) {
  const days = useMemo(() => {
    const by = new Map();
    for (const t of trend) {
      if (country !== "ALL" && t.country !== country) continue;
      const d = by.get(t.date) || { date: t.date, rev: 0, subs: 0 };
      d.rev += t.daily_revenue || 0;
      d.subs += t.daily_new_subs || 0;
      by.set(t.date, d);
    }
    return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [trend, country]);
  const [hover, setHover] = useState(null);
  if (!days.length) return null;

  const W = 1000, H = 220, padL = 52, padB = 26, padT = 10;
  const goalPerDay = goal != null && row.days_in_month ? goal / row.days_in_month : null;
  const max = Math.max(...days.map((d) => d.rev), goalPerDay || 0) * 1.08 || 1;
  const bw = (W - padL) / days.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => Math.round(v / 100) * 100);
  const h = hover != null ? days[hover] : null;

  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
      <SectionTitle aside={h ? `${new Date(h.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}: ${fmt$(h.rev)} · ${fmtInt(h.subs)} nuovi abbonati` : "ultimi 75 giorni · passa sopra una barra per il dettaglio"}>
        Revenue giorno per giorno
      </SectionTitle>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)} role="img" aria-label="Revenue giornaliero">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={CP.border} strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={CP.textMuted}>{t >= 1000 ? `$${Math.round(t / 1000)}k` : `$${t}`}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cur = monthKey(d.date) === month;
          const first = i === 0 || monthKey(days[i - 1].date) !== monthKey(d.date);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              <rect x={padL + i * bw + bw * 0.15} y={y(d.rev)} width={bw * 0.7} height={Math.max(0, y(0) - y(d.rev))} rx="1.5"
                fill={cur ? CP.accent : alpha(CP.textMuted, hover === i ? "99" : "55")} />
              {first && (
                <text x={padL + i * bw} y={H - 8} fontSize="11" fill={CP.textMuted}>{MONTHS_IT[Number(d.date.slice(5, 7)) - 1]}</text>
              )}
            </g>
          );
        })}
        {goalPerDay != null && (
          <g>
            <line x1={padL} x2={W} y1={y(goalPerDay)} y2={y(goalPerDay)} stroke={CP.accentGreen} strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={W - 4} y={y(goalPerDay) - 5} textAnchor="end" fontSize="11" fill={CP.accentGreen}>ritmo obiettivo {fmt$(goalPerDay)}/giorno</text>
          </g>
        )}
      </svg>
    </section>
  );
}

function Subscribers({ row }) {
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
      <SectionTitle aside="abbonati alla prima iscrizione del mese">Nuovi abbonati</SectionTitle>
      <div style={grid}>
        <Metric label="Nuovi finora" value={fmtInt(row.new_subs_mtd)} note={`proiezione ${fmtInt(row.new_subs_proj_eom)}`} />
        <Metric label="Media ultimi 12 mesi" value={fmtInt(row.new_subs_hist_avg)} note="nuovi al mese" />
        <Metric label="Hanno già comprato" value={fmtInt(row.current_month_converting_new_subs)} note={`${fmtPct(div(row.current_month_converting_new_subs, row.new_subs_mtd), 1)} dei nuovi · storico ${fmtPct(row.hist_conversion_rate, 1)}`} />
        <Metric label="Spesa media di chi compra" value={fmt$2(row.current_month_arppu)} note={`storico ${fmt$2(row.avg_revenue_per_new_sub)}`} />
        <Metric label="Resa per nuovo abbonato" value={fmt$2(row.current_month_ltv)} note="revenue dei nuovi ÷ tutti i nuovi" />
        <Metric label="Attesi dai nuovi a fine mese" value={fmt$(row.new_sub_expected_eom_revenue)} note="nuovi previsti × conversione × spesa storiche" />
      </div>
    </section>
  );
}

function Mix({ row }) {
  const tot = (row.new_sub_revenue_mtd || 0) + (row.retention_revenue_mtd || 0);
  const pNew = div(row.new_sub_revenue_mtd, tot) || 0;
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
      <SectionTitle aside="revenue del mese in corso">Da dove arriva il revenue</SectionTitle>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: CP.surfaceAlt, margin: "4px 0 12px" }}>
        <div style={{ width: `${pNew * 100}%`, background: CP.accent }} />
        <div style={{ flex: 1, background: alpha(CP.textMuted, "66") }} />
      </div>
      <div style={grid}>
        <Metric label="Da nuovi abbonati del mese" value={fmt$(row.new_sub_revenue_mtd)} note={fmtPct(pNew, 1)} />
        <Metric label="Da abbonati dei mesi prima" value={fmt$(row.retention_revenue_mtd)} note={fmtPct(1 - pNew, 1)} />
        <Metric label="Da iscritti degli ultimi 30 giorni" value={fmt$(row.rolling_cohort_revenue_mtd)}
          note={`${fmtPct(row.rolling_cohort_revenue_pct, 1)} del mese · ${fmtInt(row.rolling_cohort_converting_users)} paganti su ${fmtInt(row.rolling_cohort_total_subs)}`} />
      </div>
    </section>
  );
}

function CountryTable({ rows, goals, month, onPick }) {
  const th = { textAlign: "right", padding: "8px 10px", fontSize: 12, fontWeight: 500, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
  const td = { textAlign: "right", padding: "10px", fontSize: 14, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap", ...NUM };
  const all = totalRow(rows);
  const list = [...rows, all].filter(Boolean);
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
      <SectionTitle aside="clic su una riga per aprire il paese">Paesi a confronto</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Paese</th>
              <th style={th}>Incassato</th><th style={th}>Proiezione</th><th style={th}>Obiettivo</th><th style={th}>% obiettivo</th>
              <th style={th}>Media 12 mesi</th><th style={th}>Nuovi (proiez.)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const g = goalFor(goals, r.country, month);
              const p = div(r.revenue_proj_eom, g);
              const isAll = r.country === "ALL";
              return (
                <tr key={r.country} onClick={() => onPick(r.country)} style={{ cursor: "pointer", fontWeight: isAll ? 500 : 400 }}>
                  <td style={{ ...td, textAlign: "left" }}>{COUNTRY_LABEL[r.country]}</td>
                  <td style={td}>{fmt$(r.revenue_mtd)}</td>
                  <td style={td}>{fmt$(r.revenue_proj_eom)}</td>
                  <td style={td}>{g == null ? "—" : fmt$(g)}</td>
                  <td style={{ ...td, color: paceColor(p) }}>{fmtPct(p)}</td>
                  <td style={td}>{fmt$(r.revenue_hist_avg)}</td>
                  <td style={td}>{fmtInt(r.new_subs_mtd)} ({fmtInt(r.new_subs_proj_eom)})</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GoalsEditor({ goals, history, month, onSaved }) {
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
      const r = await fetch("/api/admin/revenue-pacing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, month: m, value: raw === "" ? null : Number(raw) }) });
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
              {months.map((m) => <th key={m} style={{ padding: "6px 10px", textAlign: "right", fontSize: 12, fontWeight: m === month ? 600 : 500, color: m === month ? CP.textPrimary : CP.textMuted }}>{monthName(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {["IT", "EN", "ES"].map((c) => (
              <tr key={c}>
                <td style={{ padding: "6px 10px", fontSize: 14 }}>{COUNTRY_LABEL[c]}</td>
                {months.map((m) => {
                  const k = `${c}|${m}`;
                  const v = k in draft ? draft[k] : goals?.[c]?.[m] ?? "";
                  return (
                    <td key={m} style={{ padding: "6px 10px", textAlign: "right" }}>
                      <span style={{ color: CP.textMuted, marginRight: 4 }}>$</span>
                      <input value={v === "" ? "" : String(v).replace(/[^\d]/g, "")} inputMode="numeric" placeholder="—" disabled={busy === k} aria-label={`Obiettivo ${COUNTRY_LABEL[c]} ${monthName(m)}`}
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
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Si salva da solo quando esci dalla casella. Lascia vuoto per togliere l'obiettivo.</p>
      {history?.length > 0 && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10, lineHeight: 1.7 }}>
          {history.slice(0, 5).map((h, i) => (
            <div key={i}>{fmtAgo(new Date(h.at).getTime())} · {h.by} · {COUNTRY_LABEL[h.country]} {monthName(h.month)}: {h.from == null ? "—" : fmt$(h.from)} → {h.to == null ? "—" : fmt$(h.to)}</div>
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
      <li style={li}><b>Proiezione.</b> Non è un semplice "incassato ÷ giorni × 30": ogni giorno del mese pesa quanto ha pesato davvero negli ultimi 12 mesi chiusi (i primi giorni del mese di solito incassano di più). I 3 mesi più recenti contano il triplo, quelli fino a 6 mesi il doppio. Con meno di 4 mesi di storico si usa la proiezione lineare.</li>
      <li style={li}><b>Media ultimi 12 mesi.</b> È solo un termine di paragone, non entra nella proiezione: dopo il ban Instagram di maggio-giugno 2025 i mesi vecchi non sono più confrontabili uno a uno.</li>
      <li style={li}><b>Affidabilità.</b> Bassa fino al giorno 7, media fino al 15, alta fino al 25, poi molto alta. Nella prima settimana una sola giornata forte o debole sposta molto la proiezione.</li>
      <li style={li}><b>Nuovi abbonati.</b> Chi si iscrive per la prima volta nel mese. "Attesi dai nuovi" = nuovi previsti a fine mese × quota storica che compra almeno una volta × spesa media storica di chi compra.</li>
      <li style={li}><b>Revenue.</b> Netto delle transazioni attribuite ai tre account di Laura, per giorno in ora UTC. Metodo attuale: {row.projection_method === "day_weight" ? "pesi per giorno" : row.projection_method === "linear" ? "lineare" : "misto"}, {row.closed_months_count ?? "—"} mesi chiusi di storico.</li>
    </ul>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "16px 20px" };
