"use client";

// Andamento per ora (19/11/2026) — quando entra l'incasso su OnlyFans, ora per ora in ora italiana, di tutte le
// pagine dello split o di una creator; chi c'è a quell'ora (fan che scrivono, nuovi abbonati, operatori in
// turno) e oggi contro un giorno tipico. Nata dalla domanda del board «dove si vede l'andamento per orari
// complessivi su OF?». Numeri e lettura: /api/admin/andamento-orario (lib/andamento-orario*).

import { useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, DataTable, Notice, SectionTitle, EmptyState, FilterBar, Spiega, BTN } from "@/components/ds";
import { Panel, SERIES } from "@/components/VetroCharts";
import PeriodPicker from "@/components/PeriodPicker";
import { fmtInt, fmtPct } from "@/lib/format";

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const NUM = { fontVariantNumeric: "tabular-nums" };
const usd = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Math.round(Number(v)).toLocaleString("it-IT", { useGrouping: "always" })}`);
const usd2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dec1 = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 }));
const int = (v) => (v == null ? "—" : fmtInt(v));
const signed = (d) => (d == null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) * 100)}%`);
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
const muted = { fontSize: 12.5, color: CP.textMuted };
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

// Cosa si può guardare ora per ora. `prev` = c'è il confronto col periodo prima.
const METRICS = [
  { key: "net", label: "Incasso", fmt: usd, prev: "net_prev" },
  { key: "tx", label: "Acquisti", fmt: dec1 },
  { key: "payers", label: "Fan che pagano", fmt: dec1 },
  { key: "ticket", label: "Spesa media per acquisto", fmt: usd2 },
  { key: "new_subs", label: "Nuovi abbonati", fmt: dec1, prev: "new_subs_prev" },
  { key: "fan_writers", label: "Fan che scrivono", fmt: dec1, need: "chat" },
  { key: "fan_msgs", label: "Messaggi dei fan", fmt: int, need: "chat" },
  { key: "ppv_sent", label: "PPV mandati", fmt: int, need: "chat" },
  { key: "staff", label: "Operatori in turno", fmt: dec1, prev: "staff_prev", need: "staff" },
  { key: "net_per_staff", label: "Incasso per operatore in turno", fmt: usd, need: "staff" },
  { key: "fan_msgs_per_staff", label: "Messaggi dei fan per operatore", fmt: int, need: "staff" },
];

function useWidth() {
  const [w, setW] = useState(0);
  const ref = useMemo(() => {
    let ro;
    return (el) => {
      ro?.disconnect();
      if (!el) return;
      ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
      ro.observe(el);
    };
  }, []);
  return [ref, w];
}
const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= v) * p;
};
const inWindow = (h, w) => w && ((h - w.from + 24) % 24) < (w.len || 4);

/**
 * 24 colonne, una per ora. `stack` = [{key, color}] per colonne a strati; `prev` = trattino del periodo prima;
 * `outline` = contorno tratteggiato (giorno tipico); `hi` = finestra evidenziata; `partial` = ora in corso.
 */
function HourChart({ values = [], stack, prev, outline, hi, partial, format = usd, height = 200, prevLabel = "periodo prima", outlineLabel = "tipico" }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const tot = (h) => (stack ? stack.reduce((a, s) => a + (Number(values[h]?.[s.key]) || 0), 0) : Number(values[h]) || 0);
  const max = niceMax(Math.max(1, ...Array.from({ length: 24 }, (_, h) => Math.max(tot(h), Number(prev?.[h]) || 0, Number(outline?.[h]) || 0))));
  const padB = 22, padT = 10, ih = height - padB - padT;
  const gap = w < 480 ? 2 : 4;
  const bw = w ? (w - gap * 23) / 24 : 0;
  const y = (v) => padT + ih - (v / max) * ih;
  const read = `24 ore; massimo ${format(Math.max(...Array.from({ length: 24 }, (_, h) => tot(h))))}`;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={read} style={{ display: "block" }} onPointerLeave={() => setHover(null)}>
          {[0.5, 1].map((f) => <line key={f} x1={0} x2={w} y1={y(max * f)} y2={y(max * f)} stroke={CP.borderSoft} />)}
          {Array.from({ length: 24 }, (_, h) => {
            const x = h * (bw + gap);
            const on = inWindow(h, hi);
            const isPartial = partial != null && h >= partial; // ore non ancora complete
            let acc = 0;
            const segs = stack
              ? stack.map((s) => { const v = Number(values[h]?.[s.key]) || 0; const y0 = y(acc); acc += v; return { k: s.key, color: s.color, y: y(acc), hh: y0 - y(acc) }; })
              : [{ k: "v", color: on ? "var(--vt-c0)" : CP.textPrimary, y: y(tot(h)), hh: ih + padT - y(tot(h)) }];
            return (
              <g key={h} onPointerEnter={() => setHover(h)}>
                <rect x={x} y={padT} width={bw} height={ih} fill="transparent" />
                {outline && outline[h] != null && <rect x={x + 0.5} y={y(outline[h])} width={Math.max(1, bw - 1)} height={Math.max(0, ih + padT - y(outline[h]))} rx={Math.min(4, bw / 2)} fill="none" stroke={CP.textMuted} strokeDasharray="3 3" />}
                {segs.map((s) => s.hh > 0 && (
                  <rect key={s.k} x={x} y={s.y} width={bw} height={Math.max(1, s.hh)} rx={stack ? 0 : Math.min(4, bw / 2)} fill={s.color}
                    opacity={stack ? (hover == null || hover === h ? 1 : 0.6) : on || hover === h ? 1 : 0.5} fillOpacity={isPartial ? 0.45 : 1} />
                ))}
                {prev && prev[h] != null && prev[h] > 0 && <line x1={x - 1} x2={x + bw + 1} y1={y(prev[h])} y2={y(prev[h])} stroke={CP.textPrimary} strokeWidth={2} />}
                {(w > 700 ? h % 2 === 0 : h % 3 === 0) && <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="10.5" fill={on ? CP.textPrimary : CP.textMuted} style={NUM}>{h}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div style={{ position: "absolute", top: -6, left: Math.min(Math.max(hover * (bw + gap) - 80, 0), Math.max(0, w - 200)), width: 200, pointerEvents: "none", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "7px 10px", fontSize: 12, color: CP.textSecondary, boxShadow: "0 8px 24px rgba(20,30,60,.14)", zIndex: 2, ...NUM }}>
          <div style={{ color: CP.textPrimary, fontWeight: 600 }}>{hourLabel(hover)}–{hourLabel((hover + 1) % 24)}{partial != null && hover >= partial && values[hover] != null ? " · non ancora completa" : ""}</div>
          {stack
            ? stack.map((s) => <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 5 }} />{s.label}</span><span>{format(values[hover]?.[s.key])}</span></div>)
            : <div>{format(values[hover])}</div>}
          {prev && prev[hover] != null && <div>{prevLabel}: {format(prev[hover])}</div>}
          {outline && outline[hover] != null && <div>{outlineLabel}: {format(outline[hover])}</div>}
        </div>
      )}
    </div>
  );
}

const Legend = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10, fontSize: 12.5, color: CP.textSecondary }}>
    {items.map((it) => (
      <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {it.line ? <span style={{ width: 14, height: 2, background: CP.textPrimary }} />
          : it.dashed ? <span style={{ width: 11, height: 11, borderRadius: 3, border: `1px dashed ${CP.textMuted}` }} />
          : <span style={{ width: 11, height: 11, borderRadius: 3, background: it.color }} />}
        {it.label}{it.value != null && <span style={{ color: CP.textMuted, ...NUM }}>{it.value}</span>}
      </span>
    ))}
  </div>
);

const select = { background: CP.surface, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 10, padding: "7px 10px", fontSize: 13.5, fontFamily: FONTS.body, minHeight: 38, maxWidth: "100%" };

function WeekTable({ week, field, fmt }) {
  return (
    // il vetro viene da .ds-tbl-wrap; lo scorrimento laterale sta nel div dentro (su telefono .ds-tbl-wrap non taglia)
    <div className="ds-tbl-wrap" style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 }}>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 1180, width: "100%", ...NUM }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, background: CP.surface, textAlign: "left", padding: "8px 10px", color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.border}` }}>Giorno</th>
            {Array.from({ length: 24 }, (_, h) => <th key={h} style={{ padding: "8px 6px", color: CP.textMuted, fontWeight: 500, textAlign: "right", borderBottom: `1px solid ${CP.border}` }}>{h}</th>)}
            {field === "net" && <th style={{ padding: "8px 10px", color: CP.textMuted, fontWeight: 500, textAlign: "right", borderBottom: `1px solid ${CP.border}` }}>Giorno intero</th>}
          </tr>
        </thead>
        <tbody>
          {week.map((r) => {
            const vals = r[field] || [];
            const top = new Set([...vals.map((v, h) => [Number(v) || 0, h])].sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]));
            return (
              <tr key={r.dow} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                <td style={{ position: "sticky", left: 0, background: CP.surface, padding: "7px 10px", color: CP.textPrimary, whiteSpace: "nowrap" }}>{r.label} <span style={muted}>×{r.occurrences}</span></td>
                {vals.map((v, h) => <td key={h} style={{ padding: "7px 6px", textAlign: "right", color: top.has(h) ? CP.textPrimary : CP.textSecondary, fontWeight: top.has(h) ? 600 : 400 }}>{fmt(v)}</td>)}
                {field === "net" && <td style={{ padding: "7px 10px", textAlign: "right", color: CP.textPrimary, fontWeight: 500 }}>{usd(r.total)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function AndamentoOrarioPage() {
  const yesterday = iso(Date.now() - DAY);
  const [range, setRange] = useState(() => ({ from: iso(Date.now() - 28 * DAY), to: yesterday }));
  const [who, setWho] = useState(""); // "" = tutte; altrimenti nome della persona
  const [metric, setMetric] = useState("net");
  const [weekField, setWeekField] = useState("net");
  const [personsCache, setPersonsCache] = useState([]);
  const ids = who ? (personsCache.find((p) => p.person === who)?.ids || []) : [];
  const url = `/api/admin/andamento-orario?from=${range.from}&to=${range.to}${ids.length ? `&creators=${ids.join(",")}` : ""}`;
  const { data: d, error, isValidating, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true, onSuccess: (x) => x?.persons && setPersonsCache(x.persons) });
  const persons = d?.persons || personsCache;

  const m = METRICS.find((x) => x.key === metric) || METRICS[0];
  const available = METRICS.filter((x) => !x.need || d?.has?.[x.need]);
  const kindStack = (d?.kinds || []).map((k, i) => ({ key: k.key, label: k.label, color: SERIES[i] || "var(--vt-cx)" }));
  const prevLabel = d ? `${d.range.prevDays} giorni prima` : "periodo prima";

  const hourColumns = [
    { key: "h", label: "Ora", render: (r) => <span style={{ whiteSpace: "nowrap", fontWeight: d?.gold && inWindow(r.h, { from: d.gold.from, len: 4 }) ? 600 : 400 }}>{hourLabel(r.h)}</span> },
    { key: "net", label: "Incasso", align: "right", render: (r) => usd(r.net) },
    { key: "delta", label: "vs prima", align: "right", render: (r) => <span style={{ color: r.delta == null || Math.abs(r.delta) < 0.1 ? CP.textSecondary : r.delta > 0 ? CP.accentGreen : CP.accentRed }}>{signed(r.delta)}</span> },
    { key: "share", label: "Quota", align: "right", render: (r) => fmtPct(r.share, 1) },
    { key: "tx", label: "Acquisti", align: "right", render: (r) => dec1(r.tx) },
    { key: "payers", label: "Fan che pagano", align: "right", render: (r) => dec1(r.payers) },
    { key: "ticket", label: "Spesa media", align: "right", render: (r) => usd2(r.ticket) },
    { key: "new_subs", label: "Nuovi abbonati", align: "right", render: (r) => dec1(r.new_subs) },
    ...(d?.has?.chat ? [
      { key: "fan_writers", label: "Fan che scrivono", align: "right", render: (r) => dec1(r.fan_writers) },
      { key: "ppv_sent", label: "PPV mandati", align: "right", render: (r) => int(r.ppv_sent) },
    ] : []),
    ...(d?.has?.staff ? [
      { key: "staff", label: "Operatori", align: "right", render: (r) => dec1(r.staff) },
      { key: "net_per_staff", label: "$ per operatore", align: "right", render: (r) => (r.uncovered ? <span style={muted} title="Meno di mezzo operatore in turno in media: il rapporto non ha senso">scoperta</span> : usd(r.net_per_staff)) },
      ...(d?.has?.chat ? [{ key: "fan_msgs_per_staff", label: "Msg fan per operatore", align: "right", render: (r) => (r.uncovered ? <span style={muted}>scoperta</span> : int(r.fan_msgs_per_staff)) }] : []),
    ] : []),
  ];
  const bandColumns = [
    { key: "label", label: "Fascia", sortable: false, render: (r) => <span style={{ textTransform: "capitalize" }}>{r.label} <span style={muted}>{r.from}–{r.to}</span></span> },
    { key: "net", label: "Incasso al giorno", align: "right", render: (r) => usd(r.net) },
    { key: "share", label: "Quota", align: "right", render: (r) => fmtPct(r.share, 0) },
    { key: "net_prev", label: prevLabel, align: "right", muted: true, render: (r) => usd(r.net_prev) },
    { key: "delta", label: "Variazione", align: "right", render: (r) => <span style={{ color: r.delta == null || Math.abs(r.delta) < 0.1 ? CP.textSecondary : r.delta > 0 ? CP.accentGreen : CP.accentRed }}>{signed(r.delta)}</span> },
  ];
  const creatorColumns = [
    { key: "person", label: "Creator" },
    { key: "net", label: "Incasso al giorno", align: "right", render: (r) => usd(r.net) },
    { key: "best", label: "Ore d'oro", align: "right", sort: (r) => r.best?.share ?? -1, render: (r) => (r.best ? <span>{r.best.label} <span style={muted}>{fmtPct(r.best.share, 0)}</span></span> : "—") },
    { key: "peak_hour", label: "Ora migliore", align: "right", render: (r) => (r.peak_hour == null ? "—" : hourLabel(r.peak_hour)) },
    { key: "notte", label: "Notte 0–6", align: "right", sort: (r) => r.shares.notte, render: (r) => fmtPct(r.shares.notte, 0) },
    { key: "mattina", label: "Mattina 6–12", align: "right", sort: (r) => r.shares.mattina, render: (r) => fmtPct(r.shares.mattina, 0) },
    { key: "pomeriggio", label: "Pomeriggio 12–18", align: "right", sort: (r) => r.shares.pomeriggio, render: (r) => fmtPct(r.shares.pomeriggio, 0) },
    { key: "sera", label: "Sera 18–24", align: "right", sort: (r) => r.shares.sera, render: (r) => fmtPct(r.shares.sera, 0) },
  ];

  const t = d?.today;
  const values = d ? d.hours.map((h) => h[m.key]) : [];
  const prevVals = d && m.prev ? d.hours.map((h) => h[m.prev]) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20, maxWidth: 1400, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }, { label: "Analisi vendite", href: "/admin/analisi-vendite" }]} title="Andamento per ora"
        subtitle="Quando entra l'incasso su OnlyFans, ora per ora in ora italiana: tutte le creator o una sola, chi c'è a quell'ora e com'è andata oggi."
        actions={<button type="button" style={BTN} onClick={() => mutate(fetcher(`${url}&refresh=1`), { revalidate: false })} disabled={isValidating}><RefreshCw size={15} />{isValidating ? "Aggiorno…" : "Aggiorna"}</button>} />

      <FilterBar style={{ margin: 0 }}>
        <PeriodPicker value={range} onChange={setRange} max={yesterday} maxDays={d?.max_days || 120} loading={isValidating && Boolean(d)} />
        <select aria-label="Creator" value={who} onChange={(e) => setWho(e.target.value)} style={select}>
          <option value="">Tutte le creator{persons.length ? ` (${persons.length})` : ""}</option>
          {persons.map((p) => <option key={p.person} value={p.person}>{p.person}{p.pages.length > 1 ? ` · ${p.pages.length} pagine` : ""}</option>)}
        </select>
        {d?.computed_at && <span style={{ ...muted, marginLeft: "auto" }}>calcolato alle {new Date(d.computed_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}{d.source === "backup" ? " · dalla copia di sicurezza" : ""}</span>}
      </FilterBar>

      {error && <Notice danger>{error.message}</Notice>}
      {d?.empty && <EmptyState title="Nessuna creator">{d.message}</EmptyState>}
      {!d && !error && <div style={muted}>Calcolo in corso: la prima volta ci vogliono una decina di secondi.</div>}

      {d && !d.empty && d.hours && (
        <>
          {d.reading?.length > 0 && (
            <Panel title="In breve">
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14, color: CP.textPrimary, lineHeight: 1.5 }}>
                {d.reading.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </Panel>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Metric label="Incasso medio al giorno" value={usd(d.totals.net_day)} delta={d.totals.delta == null ? null : signed(d.totals.delta)} deltaLabel={`sui ${d.range.prevDays} giorni prima`} />
            <Metric label="Ore d'oro" value={d.gold ? d.gold.label : "—"} note={d.gold ? `${fmtPct(d.gold.share, 0)} dell'incasso in 4 ore` : null} />
            <Metric label="Nuovi abbonati al giorno" value={dec1(d.totals.new_subs_day)} />
            {d.has.staff && <Metric label="Ore di turno al giorno" value={fmtInt(d.totals.staff_hours_day)} note={`${dec1(d.totals.staff_hours_day / 24)} operatori in media per ora`} />}
            <Metric label="Incasso nel periodo" value={usd(d.totals.net)} note={`${fmtInt(d.totals.tx)} acquisti`} />
          </div>

          <Panel title="Ora per ora" aside={`media al giorno, ${d.range.days} giorni`}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <select aria-label="Cosa mostrare" value={metric} onChange={(e) => setMetric(e.target.value)} style={select}>
                {available.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {m.need === "chat" && d.range.chatTo && <span style={muted}>messaggi fino al {new Date(`${d.range.chatTo}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
            </div>
            <HourChart values={values} prev={prevVals} hi={metric === "net" && d.gold ? { from: d.gold.from, len: 4 } : null} format={m.fmt} prevLabel={prevLabel} />
            <Legend items={[
              { label: m.label, color: CP.textMuted },
              ...(prevVals ? [{ label: prevLabel, line: true }] : []),
              ...(metric === "net" && d.gold ? [{ label: `in colore le ore d'oro ${d.gold.label}`, color: "var(--vt-c0)" }] : []),
            ]} />
          </Panel>

          {t && (
            <Panel title="Oggi" aside={t.weeks ? `contro un ${t.weekday} tipico (media delle ultime ${t.weeks} settimane)` : "nessun giorno di confronto"}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12, ...NUM }}>
                <div><div style={muted}>Fino alle {hourLabel(t.done_hours)}</div><div style={{ fontSize: 22, color: CP.textPrimary }}>{usd(t.cum_today)}</div></div>
                <div><div style={muted}>{t.weekday} tipico alla stessa ora</div><div style={{ fontSize: 22, color: CP.textSecondary }}>{usd(t.cum_typical)}</div></div>
                <div><div style={muted}>Differenza</div><div style={{ fontSize: 22, color: t.delta == null || Math.abs(t.delta) < 0.05 ? CP.textPrimary : t.delta > 0 ? CP.accentGreen : CP.accentRed }}>{signed(t.delta)}</div></div>
                <div><div style={muted}>Ora in corso ({hourLabel(t.now_hour)})</div><div style={{ fontSize: 22, color: CP.textSecondary }}>{usd(t.in_progress)}</div></div>
                {t.typical_day != null && <div><div style={muted}>Un {t.weekday} tipico chiude a</div><div style={{ fontSize: 22, color: CP.textSecondary }}>{usd(t.typical_day)}</div></div>}
              </div>
              {t.stale && <div style={{ marginBottom: 10 }}><Notice>Le transazioni dal vivo del warehouse sono ferme da {t.stale_minutes} minuti (ultima registrata alle {new Date(t.last_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}): il confronto si ferma alle {hourLabel(t.done_hours)}, l'ultima ora arrivata per intero.</Notice></div>}
              <HourChart values={t.hours.map((x) => x.today)} outline={t.hours.map((x) => x.typical)} partial={t.done_hours} hi={{ from: 0, len: t.now_hour + 1 }} prevLabel="tipico" outlineLabel={`${t.weekday} tipico`} />
              <Legend items={[{ label: "oggi", color: "var(--vt-c0)" }, { label: `${t.weekday} tipico`, dashed: true }, { label: "più chiare le ore non ancora complete", color: "var(--vt-c0)" }]} />
            </Panel>
          )}

          {kindStack.length > 0 && (
            <Panel title="Da dove arriva, ora per ora" aside="media al giorno">
              <HourChart values={d.hours.map((h) => h.kinds)} stack={kindStack} />
              <Legend items={kindStack.map((k) => ({ label: k.label, color: k.color, value: `${usd((d.kinds.find((x) => x.key === k.key)?.net) || 0)} al giorno` }))} />
            </Panel>
          )}

          <section>
            <SectionTitle aside="media al giorno; in grassetto le ore d'oro">Ora per ora, in numeri</SectionTitle>
            <DataTable columns={hourColumns} rows={d.hours.map((h) => ({ ...h, key: h.h }))} minWidth={1100} density="compact" />
          </section>

          <section>
            <SectionTitle aside={`confronto con i ${prevLabel}`}>Per fascia</SectionTitle>
            <DataTable columns={bandColumns} rows={d.bands.map((b) => ({ ...b, key: b.key }))} minWidth={560} />
          </section>

          <section>
            <SectionTitle aside="media al giorno; in grassetto le 3 ore più alte di ogni riga">Settimana × ora</SectionTitle>
            {d.has.staff && (
              <div style={{ marginBottom: 10 }}>
                <select aria-label="Cosa mostrare nella settimana" value={weekField} onChange={(e) => setWeekField(e.target.value)} style={select}>
                  <option value="net">Incasso</option>
                  <option value="staff">Operatori in turno</option>
                </select>
              </div>
            )}
            <WeekTable week={d.week} field={weekField} fmt={weekField === "net" ? usd : dec1} />
          </section>

          {d.creators.length > 1 && (
            <section>
              <SectionTitle aside="clic su una creator per vedere solo lei">Creator per creator</SectionTitle>
              <DataTable columns={creatorColumns} rows={d.creators.map((c) => ({ ...c, key: c.person }))} minWidth={860}
                onRowClick={(r) => { setWho(r.person); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </section>
          )}

          <Spiega label="Come si calcola">
            <div><b>Ora italiana.</b> Ogni acquisto, messaggio e turno cade nell'ora in cui è avvenuto in Italia, ora legale compresa. «22» vuol dire dalle 22:00 alle 22:59. Le ore d'oro sono le 4 ore di fila (anche a cavallo della mezzanotte) in cui entra più incasso.</div>
            <div><b>Media al giorno.</b> Ogni numero orario è il totale del periodo diviso per i giorni del periodo, così periodi lunghi e corti si confrontano. Nella tabella della settimana si divide per quante volte quel giorno cade nel periodo (×4 = quattro lunedì). Il periodo di confronto ha la stessa lunghezza e finisce il giorno prima. Il periodo arriva al massimo a ieri: oggi è a metà e abbasserebbe le medie.</div>
            <div><b>Incasso.</b> Netto di tutte le transazioni OnlyFans delle pagine scelte (registro transazioni del warehouse, aggiornato in 1-2 minuti): chat 1:1, massivi, mance, post e abbonamenti. I massivi sono i messaggi comprati da un invio di massa; il resto dei messaggi è chat 1:1. L'ora è quella dell'acquisto, non dell'invio: un massivo mandato alle 21 può vendere fino a notte.</div>
            <div><b>Fan che pagano, acquisti, spesa media.</b> Fan diversi che comprano in quell'ora (lo stesso fan su due pagine conta due volte), numero di acquisti e incasso diviso per gli acquisti.</div>
            <div><b>Messaggi.</b> Dalla copia giornaliera delle chat: arrivano fino a ieri (prima delle 7 di mattina fino all'altro ieri). Fan che scrivono = fan diversi che mandano almeno un messaggio in quell'ora; PPV mandati = messaggi a pagamento mandati dalla pagina, massivi compresi.</div>
            <div><b>Operatori in turno.</b> Dai turni CreatorsPro dei chatter sulle pagine scelte: quante persone sono in turno in quell'ora, in media. Chi copre due pagine nella stessa ora conta una volta. Incasso per operatore = incasso dell'ora diviso per gli operatori in turno; messaggi dei fan per operatore = quanta domanda ha ognuno. Sotto mezzo operatore in media l'ora è «scoperta» e i rapporti non si calcolano (con un turno ogni tanto darebbero numeri enormi e falsi). Un turno che non è in CreatorsPro non si vede.</div>
            <div><b>Oggi.</b> Incasso di oggi fino all'ultima ora conclusa, contro la media dello stesso giorno della settimana nelle 4 settimane prima (le settimane senza incasso non entrano). L'ora in corso è mostrata a parte.</div>
            <div><b>Quali pagine.</b> Solo le pagine degli split che puoi vedere, solo l'organizzazione HOC (il warehouse contiene anche altre agenzie). Le pagine della stessa creator (IT, EN…) sono unite.</div>
          </Spiega>
        </>
      )}
    </div>
  );
}
