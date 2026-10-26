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
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice } from "@/components/ds";

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
        <HeroMetric label={`Costo operatori sul venduto · ${monthName}${isCurrent ? " finora" : ""}`} value={fmtPct(costPct, 1)}
          compare={prevCostPct != null ? `${prevName}: ${fmtPct(prevCostPct, 1)} (${pts(costPct - prevCostPct)})` : null}>
          <Metrics t={t} prev={prev} partial={isCurrent} prevName={prevName} />
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "18px 0 8px" }}>
          <FilterChip label={`Tutte (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`Costo alto (${counts.high})`} disabled={!counts.high} active={view === "high"} onClick={() => setView(view === "high" ? "all" : "high")} />
          <span style={{ flex: 1 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca creator" aria-label="Cerca creator"
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, width: 220, fontFamily: FONTS.body }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          “Costo alto” = costo operatori almeno {HIGH_COST_PTS * 100} punti sopra la mediana delle creator ({fmtPct(median, 1)}).
        </div>
        <DataTable columns={columns} rows={shown} defaultSort={{ key: "sales", dir: -1 }} minWidth={900} maxHeight="calc(100vh - 120px)"
          empty={needle ? `Nessuna creator corrisponde a “${q}”.` : "Nessuna creator in questa vista."} />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, padding: "10px 4px" }}>
          <span>Totale venduto <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.sales)}</b></span>
          <span>Costo operatori <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.cost_ops)}</b></span>
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted }}>
          Venduto di tutte le creator, compresi i turni di operatori fuori dalla Classifica vendite (per questo il totale è più alto di quello di Classifica vendite).
          {data.last_sync_at ? ` Dati CreatorsPro aggiornati ${fmtAgo(data.last_sync_at)}.` : ""}
        </div>
      </>)}
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
