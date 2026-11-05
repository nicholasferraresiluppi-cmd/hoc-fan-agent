"use client";

/**
 * /admin/pnl-live — P&L operativo per creator, anche sul mese in corso:
 * venduto (CP) e costo degli operatori, con la % sul venduto.
 *
 * Redesign 25/09/2026 (struttura del pilota Calendario compensi): numero
 * principale col confronto sul mese prima → filtri (costo alto) + ricerca →
 * tabella ordinabile.
 *
 * 15/10/2026: tolti fee del deal e margine. Gli accordi delle creator sono
 * riservati e stanno nel Conto dello split (/contabilita/split, solo titolare
 * e contabilità); questa pagina la vede ogni admin.
 */
import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import CompNav from "@/components/CompNav";
import { fmt$, fmtPct, fmtDelta, fmtAgo, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, FilterBar, DataTable, Notice, NUM } from "@/components/ds";
import VetroScope, { useVetro, VetroNum } from "@/components/VetroScope";
import { RankBars } from "@/components/VetroCharts";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { error: j.error || `Errore ${r.status}` };
};
const HIGH_COST_PTS = 0.04; // costo operatori ≥ 4 punti sopra la mediana = da guardare

function monthOpts(n = 13) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (in corso)" : ""}` };
  });
}
const prevOf = (pid) => { const [y, m] = pid.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const pts = (d) => d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`;

export default function PnlLivePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0].value);
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [vetro] = useVetro();

  const url = `/api/admin/pnl-live?period_id=${periodId}`;
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prev } = useSWR(`/api/admin/pnl-live?period_id=${prevOf(periodId)}`, fetcher, { revalidateOnFocus: false });

  const ok = data && !data.error;
  const rows = ok ? data.rows : [];
  const t = ok ? data.totals : null;
  const costPct = t?.sales ? t.cost_ops / t.sales : null;
  const prevCostPct = prev?.totals?.sales ? prev.totals.cost_ops / prev.totals.sales : null;
  const median = useMemo(() => {
    const v = rows.map((r) => r.cost_pct).filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  }, [rows]);
  const isHigh = (r) => median != null && r.cost_pct != null && r.cost_pct >= median + HIGH_COST_PTS;
  const counts = { high: rows.filter(isHigh).length };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!needle || r.alias.toLowerCase().includes(needle))
    && (view === "high" ? isHigh(r) : true)).map((r) => ({ ...r, id: r.alias }));
  const monthName = MONTHS_IT[Number(periodId.slice(5)) - 1];
  const prevName = MONTHS_IT[Number(prevOf(periodId).slice(5)) - 1];
  const isCurrent = periodId === periods[0].value;

  const columns = [
    { key: "alias", label: "Creator", render: (r) => <span style={{ fontWeight: 500 }}>{r.alias}</span> },
    { key: "sales", label: "Venduto", align: "right", render: (r) => fmt$(r.sales) },
    { key: "cost_ops", label: "Costo operatori", align: "right", render: (r) => fmt$(r.cost_ops) },
    { key: "cost_pct", label: "% sul venduto", align: "right", render: (r) => (
      <span style={{ color: isHigh(r) ? CP.accentRed : CP.textPrimary }} title={isHigh(r) ? `Almeno ${HIGH_COST_PTS * 100} punti sopra la mediana (${fmtPct(median, 1)})` : ""}>{fmtPct(r.cost_pct, 1)}</span>
    ) },
    { key: "go", label: "", sortable: false, render: (r) => (
      <Link href={`/admin/comp-calendar?creator=${encodeURIComponent(r.alias)}&period_id=${periodId}`} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>Giorni →</Link>
    ) },
  ];

  return (
    <VetroScope on={vetro}>
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Comp & Ben" }, { label: "P&L Live" }]}
        title="P&L Live"
        subtitle="Quanto vende ogni creator e quanto costano i suoi operatori, anche sul mese in corso. Solo il costo della chat, in dollari. Marketing, AM e struttura restano fuori."
        actions={
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese"
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body }}>
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
      />
      <CompNav />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error} <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync e verifica CP →</Link></Notice>}

      {ok && (<>
        {vetro ? (
          <VetroPnl rows={rows} t={t} prev={prev} costPct={costPct} prevCostPct={prevCostPct} median={median} isHigh={isHigh} high={counts.high}
            monthName={monthName} prevName={prevName} isCurrent={isCurrent} periodId={periodId} view={view} setView={setView} />
        ) : (
        <HeroMetric label={`Costo operatori sul venduto · ${monthName}${isCurrent ? " finora" : ""}`} value={fmtPct(costPct, 1)}
          compare={prevCostPct != null ? `${prevName}: ${fmtPct(prevCostPct, 1)} (${pts(costPct - prevCostPct)})` : null}>
          <Metrics t={t} prev={prev} partial={isCurrent} prevName={prevName} />
        </HeroMetric>
        )}

        <FilterBar style={{ marginTop: 18 }} onReset={view !== "all" || q ? () => { setView("all"); setQ(""); } : undefined}>
          <FilterChip label={`Tutte (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`Costo alto (${counts.high})`} disabled={!counts.high} active={view === "high"} onClick={() => setView(view === "high" ? "all" : "high")} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca creator" aria-label="Cerca creator"
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, width: 220, maxWidth: "100%", fontFamily: FONTS.body }} />
        </FilterBar>
        <DataTable columns={columns} rows={shown} defaultSort={{ key: "sales", dir: -1 }} minWidth={900} maxHeight="calc(100vh - 120px)"
          empty={needle ? `Nessuna creator corrisponde a “${q}”.` : "Nessuna creator in questa vista."} />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, padding: "10px 4px" }}>
          <span>Totale venduto <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.sales)}</b></span>
          <span>Costo operatori <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.cost_ops)}</b></span>
        </div>
        <details style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.6, marginTop: 6 }}>
          <summary style={{ cursor: "pointer", color: CP.textSecondary }}>Come si legge</summary>
          <p style={{ margin: "6px 0 0" }}>
            «Costo alto» = costo operatori almeno {HIGH_COST_PTS * 100} punti sopra la mediana delle creator ({fmtPct(median, 1)}).
            Il venduto è di tutte le creator, compresi i turni di operatori fuori dalla Classifica vendite (per questo il totale è più alto di quello di Classifica vendite).
            {data.last_sync_at ? ` Dati CreatorsPro aggiornati ${fmtAgo(data.last_sync_at)}.` : ""}
          </p>
        </details>
      </>)}
    </div>
    </VetroScope>
  );
}

// Stile vetro (30/10/2026): la domanda della pagina è «quanto mi costano gli operatori sul venduto, e
// su quali creator costano troppo?». A sinistra le creator in fila per % di costo con la tacca della
// mediana (in rosso quelle «costo alto», stessa regola del filtro; clic = i giorni della creator); a
// destra il numero dell'agenzia col mese prima a barre, e la scheda «Costo alto» che apre il filtro.
const BTN_RESET = { boxSizing: "border-box", cursor: "pointer", border: 0, margin: 0, font: "inherit", color: "inherit" };
const RANK_MAX = 12;
function VetroPnl({ rows, t, prev, costPct, prevCostPct, median, isHigh, high, monthName, prevName, isCurrent, periodId, view, setView }) {
  const ranked = rows.filter((r) => r.cost_pct != null && r.sales > 0).sort((a, b) => b.cost_pct - a.cost_pct);
  const items = ranked.slice(0, RANK_MAX).map((r) => ({
    label: r.alias, value: r.cost_pct, bad: isHigh(r),
    href: `/admin/comp-calendar?creator=${encodeURIComponent(r.alias)}&period_id=${periodId}`,
  }));
  const pct1 = (v) => fmtPct(v, 1);
  const bars = [
    { label: `${monthName}${isCurrent ? " finora" : ""}`, v: costPct, c: "var(--vt-c0)" },
    { label: prevName, v: prevCostPct, c: "var(--vt-cx)" },
  ].filter((b) => b.v != null);
  const maxBar = Math.max(...bars.map((b) => b.v), 0.0001) * 1.15;
  const H2 = { margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary };
  return (
    <div className="vt-row21" style={{ gap: 12, marginBottom: 6 }}>
      <section className="vt-glass" style={{ "--vt-i": 0, borderRadius: 20, padding: "16px 18px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={H2}>Quanto costano gli operatori, creator per creator</h2>
          <span style={{ fontSize: 12.5, color: CP.textMuted }}>
            % sul venduto{ranked.length > RANK_MAX ? ` · le ${RANK_MAX} che costano di più su ${ranked.length}` : ""} · in rosso il costo alto · tocca per i giorni
          </span>
        </div>
        {items.length ? <RankBars items={items} format={pct1} limit={RANK_MAX} mark={median ?? undefined} markLabel={median != null ? `Mediana delle creator: ${pct1(median)}` : undefined} />
          : <div style={{ fontSize: 13.5, color: CP.textSecondary }}>Nessun venduto in questo mese.</div>}
      </section>
      <div className="vt-side" style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <section className="vt-glass" style={{ "--vt-i": 1, borderRadius: 20, padding: "16px 18px", display: "grid", gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>Costo operatori sul venduto · {monthName}{isCurrent ? " finora" : ""}</div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", color: CP.textPrimary, ...NUM }}><VetroNum value={pct1(costPct)} /></div>
          {bars.length > 1 && bars.map((b) => (
            <div key={b.label} style={{ display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: CP.textSecondary, ...NUM }}>
                <span>{b.label}</span><b style={{ color: CP.textPrimary, fontWeight: 600 }}>{pct1(b.v)}</b>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: CP.track, overflow: "hidden" }}>
                <div style={{ width: `${(b.v / maxBar) * 100}%`, height: "100%", borderRadius: 6, background: b.c }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.5, ...NUM }}>
            Venduto {fmt$(t.sales)} · operatori {fmt$(t.cost_ops)}
            {isCurrent && prev?.totals?.sales ? ` · ${prevName} intero: ${fmt$(prev.totals.sales)} venduto` : ""}
          </div>
        </section>
        <button type="button" onClick={() => setView(view === "high" ? "all" : "high")} disabled={!high}
          className={high ? "vt-hot" : "vt-hot vt-glass"} data-lvl={high ? "2" : "0"}
          style={{ ...BTN_RESET, cursor: high ? "pointer" : "default", textAlign: "left", "--vt-i": 2, outline: view === "high" ? `2px solid ${CP.textPrimary}` : "none", outlineOffset: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>Costo alto</span>
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: CP.textPrimary, ...NUM }}><VetroNum value={String(high)} /></span>
          <span style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.4 }}>
            {high ? `creator ad almeno ${HIGH_COST_PTS * 100} punti sopra la mediana · ${view === "high" ? "tocca per vederle tutte" : "tocca per vederle"}` : "nessuna creator sopra la mediana di 4 punti"}
          </span>
        </button>
      </div>
    </div>
  );
}

// Sul mese in corso il confronto in % col mese prima INTERO sarebbe ingannevole
// (settembre a metà "−24%"): si mostra il totale del mese prima come riferimento.
function Metrics({ t, prev, partial, prevName }) {
  const ref = (v, pv) => partial ? { note: pv != null ? `${prevName} intero: ${fmt$(pv)}` : null } : { delta: fmtDelta(v, pv) };
  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
      <Metric label="Venduto" value={fmt$(t.sales)} {...ref(t.sales, prev?.totals?.sales)} />
      <Metric label="Costo operatori" value={fmt$(t.cost_ops)} {...ref(t.cost_ops, prev?.totals?.cost_ops)} />
    </div>
  );
}
