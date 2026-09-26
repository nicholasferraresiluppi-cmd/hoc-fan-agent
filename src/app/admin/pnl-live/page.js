"use client";

/**
 * /admin/pnl-live — P&L operativo per creator, anche sul mese in corso.
 * Venduto (CP) × fee% deal − costo operatori = margine.
 *
 * Redesign 25/09/2026 (struttura del pilota Calendario compensi): numero
 * principale col confronto sul mese prima → filtri (senza fee, costo alto) +
 * ricerca → tabella ordinabile. Finché mancano fee il numero principale è il
 * COSTO OPERATORI sul venduto (l'unico calcolabile) e l'impostazione fee sta
 * in cima; a fee complete diventa il margine e l'impostazione si richiude.
 */
import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Check, Percent } from "lucide-react";
import { parseFeePaste } from "@/lib/fee-paste";
import { CP, FONTS } from "@/lib/brand";
import CompNav from "@/components/CompNav";
import { fmt$, fmtPct, fmtDelta, fmtAgo, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Disclosure, DataTable, Notice } from "@/components/ds";

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
  const [feeOpen, setFeeOpen] = useState(null); // null = automatico (aperto se mancano fee)
  const [editing, setEditing] = useState({});
  const [saved, setSaved] = useState({});

  const url = `/api/admin/pnl-live?period_id=${periodId}`;
  const { data, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prev } = useSWR(`/api/admin/pnl-live?period_id=${prevOf(periodId)}`, fetcher, { revalidateOnFocus: false });

  async function saveFee(alias, raw) {
    const v = raw === "" ? null : Number(raw) / 100;
    if (v !== null && (isNaN(v) || v < 0 || v > 1)) return;
    const res = await fetch("/api/admin/pnl-live", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alias, fee_pct: v }) }).catch(() => null);
    if (res?.ok) {
      setSaved((s) => ({ ...s, [alias]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [alias]: false })), 1500);
      mutate();
    }
  }

  const ok = data && !data.error;
  const rows = ok ? data.rows : [];
  const t = ok ? data.totals : null;
  const costPct = t?.sales ? t.cost_ops / t.sales : null;
  const prevCostPct = prev?.totals?.sales ? prev.totals.cost_ops / prev.totals.sales : null;
  const missing = rows.filter((r) => r.fee_pct == null).length;
  const allFees = ok && rows.length > 0 && missing === 0;
  const median = useMemo(() => {
    const v = rows.map((r) => r.cost_pct).filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  }, [rows]);
  const isHigh = (r) => median != null && r.cost_pct != null && r.cost_pct >= median + HIGH_COST_PTS;
  const counts = { nofee: missing, high: rows.filter(isHigh).length };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!needle || r.alias.toLowerCase().includes(needle))
    && (view === "nofee" ? r.fee_pct == null : view === "high" ? isHigh(r) : true)).map((r) => ({ ...r, id: r.alias }));
  const feeIsOpen = feeOpen ?? !allFees;
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
    { key: "fee_pct", label: "Fee del deal", align: "right", sortable: false, render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <input type="number" step="0.5" min="0" max="100" aria-label={`Fee ${r.alias}`}
          placeholder={r.fee_source === "standard" ? String(Math.round(r.fee_pct * 1000) / 10) : "—"}
          title={r.fee_source === "standard" ? "Fee standard: scrivi un valore solo se questa creator ha un deal diverso" : "Fee di questa creator"}
          value={editing[r.alias] !== undefined ? editing[r.alias] : (r.fee_source === "creator" ? Math.round(r.fee_pct * 1000) / 10 : "")}
          onChange={(e) => setEditing((s) => ({ ...s, [r.alias]: e.target.value }))}
          onBlur={(e) => { if (editing[r.alias] !== undefined) { saveFee(r.alias, e.target.value); setEditing((s) => { const n = { ...s }; delete n[r.alias]; return n; }); } }}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          style={{ width: 64, padding: "4px 8px", textAlign: "right", background: CP.bg, border: `1px ${r.fee_pct == null ? "dashed" : "solid"} ${r.fee_pct == null ? CP.textMuted : CP.border}`, borderRadius: 6, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body }} />
        <span style={{ fontSize: 12, color: CP.textMuted }}>%</span>
        <span style={{ width: 14 }}>{saved[r.alias] && <Check size={13} color={CP.accentGreen} />}</span>
      </span>
    ) },
    { key: "margin", label: "Margine", align: "right", render: (r) => <span style={{ color: r.margin == null ? CP.textMuted : r.margin < 0 ? CP.accentRed : CP.textPrimary }}>{fmt$(r.margin)}</span> },
    { key: "margin_pct", label: "Margine %", align: "right", render: (r) => <span style={{ color: r.margin_pct == null ? CP.textMuted : r.margin_pct < 0 ? CP.accentRed : CP.textPrimary }}>{fmtPct(r.margin_pct, 1)}</span> },
    { key: "go", label: "", sortable: false, render: (r) => (
      <Link href={`/admin/comp-calendar?creator=${encodeURIComponent(r.alias)}&period_id=${periodId}`} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>Giorni →</Link>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Comp & Ben" }, { label: "P&L Live" }]}
        title="P&L Live"
        subtitle="Quanto resta a HOC su ogni creator: fee del deal meno costo degli operatori, anche sul mese in corso. Solo il costo della chat, in dollari: marketing, AM e struttura restano nel foglio Finance."
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
        {allFees ? (
          <HeroMetric label={`Margine operativo · ${monthName}${isCurrent ? " finora" : ""}`} value={fmt$(t.margin)}
            compare={prev?.totals?.margin != null && prev.totals.fee_coverage?.split("/")[0] === prev.totals.fee_coverage?.split("/")[1] ? `${prevName}: ${fmt$(prev.totals.margin)} (${fmtDelta(t.margin, prev.totals.margin)})` : null}
            hint={`${fmtPct(t.sales ? t.margin / t.sales : null, 1)} del venduto`}>
            <Metrics t={t} prev={prev} costPct={costPct} prevCostPct={prevCostPct} partial={isCurrent} prevName={prevName} />
          </HeroMetric>
        ) : (
          <HeroMetric label={`Costo operatori sul venduto · ${monthName}${isCurrent ? " finora" : ""}`} value={fmtPct(costPct, 1)}
            compare={prevCostPct != null ? `${prevName}: ${fmtPct(prevCostPct, 1)} (${pts(costPct - prevCostPct)})` : null}
            hint={`Il margine non si può ancora calcolare: mancano le fee di ${missing} creator su ${rows.length}.`}>
            <Metrics t={t} prev={prev} partial={isCurrent} prevName={prevName} />
          </HeroMetric>
        )}

        <Disclosure open={feeIsOpen} onToggle={() => setFeeOpen(!feeIsOpen)} icon={<Percent size={15} />}
          title={allFees ? "Fee delle creator" : `Imposta le fee (${missing} mancanti)`}
          summary={data.default_fee_pct != null ? `standard ${fmtPct(data.default_fee_pct, 1)} + eccezioni` : "nessuna fee standard"}>
          <FeeSetup data={data} onDone={() => mutate()} />
        </Disclosure>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "18px 0 8px" }}>
          <FilterChip label={`Tutte (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`Senza fee (${counts.nofee})`} danger={counts.nofee > 0} disabled={!counts.nofee} active={view === "nofee"} onClick={() => setView(view === "nofee" ? "all" : "nofee")} />
          <FilterChip label={`Costo alto (${counts.high})`} disabled={!counts.high} active={view === "high"} onClick={() => setView(view === "high" ? "all" : "high")} />
          <span style={{ flex: 1 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca creator" aria-label="Cerca creator"
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, width: 220, fontFamily: FONTS.body }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          “Costo alto” = costo operatori almeno {HIGH_COST_PTS * 100} punti sopra la mediana delle creator ({fmtPct(median, 1)}). La fee si scrive direttamente in tabella; il bordo tratteggiato indica che manca.
        </div>
        <DataTable columns={columns} rows={shown} defaultSort={{ key: "sales", dir: -1 }} minWidth={900} maxHeight="calc(100vh - 120px)"
          empty={needle ? `Nessuna creator corrisponde a “${q}”.` : "Nessuna creator in questa vista."} />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, padding: "10px 4px" }}>
          <span>Totale venduto <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.sales)}</b></span>
          <span>Costo operatori <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.cost_ops)}</b></span>
          <span>Fee HOC <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.fee_usd)}</b> ({t.fee_coverage} creator)</span>
          <span>Margine <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.margin)}</b></span>
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted }}>
          Venduto di tutte le creator, compresi i turni di operatori fuori dalla classifica Sales CP (per questo il totale è più alto di quello di Sales CP).
          {data.last_sync_at ? ` Dati CreatorsPro aggiornati ${fmtAgo(data.last_sync_at)}.` : ""}
        </div>
      </>)}
    </div>
  );
}

// Sul mese in corso il confronto in % col mese prima INTERO sarebbe ingannevole
// (settembre a metà "−24%"): si mostra il totale del mese prima come riferimento.
function Metrics({ t, prev, costPct, prevCostPct, partial, prevName }) {
  const ref = (v, pv) => partial ? { note: pv != null ? `${prevName} intero: ${fmt$(pv)}` : null } : { delta: fmtDelta(v, pv) };
  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
      <Metric label="Venduto" value={fmt$(t.sales)} {...ref(t.sales, prev?.totals?.sales)} />
      <Metric label="Costo operatori" value={fmt$(t.cost_ops)} {...ref(t.cost_ops, prev?.totals?.cost_ops)} />
      {costPct != null && <Metric label="Costo sul venduto" value={fmtPct(costPct, 1)} note={prevCostPct != null ? pts(costPct - prevCostPct) : null} />}
      <Metric label="Fee HOC" value={fmt$(t.fee_usd)} note={`${t.fee_coverage} creator con fee`} />
    </div>
  );
}

// Impostazione fee in blocco: standard + eccezioni incollate da un foglio.
function FeeSetup({ data, onDone }) {
  const [std, setStd] = useState(data.default_fee_pct != null ? String(Math.round(data.default_fee_pct * 1000) / 10) : "");
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const aliases = (data.rows || []).map((r) => r.alias);
  const preview = paste.trim() ? parseFeePaste(paste, aliases) : [];
  const valid = preview.filter((p) => !p.error);

  async function put(body, okText) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/pnl-live", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ err: true, text: j.error || "Errore" });
    setMsg({ text: okText }); onDone();
  }

  const missing = (data.rows || []).filter((r) => r.fee_pct == null).length;
  return (
    <div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 12 }}>
        {missing ? `${missing} creator senza fee: il margine non si può calcolare per loro. ` : "Tutte le creator hanno una fee. "}
        Il modo più veloce: imposta la fee standard, poi incolla solo le eccezioni.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>Fee standard</span>
        <input type="number" min="0" max="100" step="0.5" value={std} onChange={(e) => setStd(e.target.value)} placeholder="es. 50"
          style={{ width: 80, padding: "6px 8px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 6, color: CP.textPrimary, textAlign: "right" }} />
        <span style={{ fontSize: 12, color: CP.textMuted }}>%</span>
        <button disabled={busy} onClick={() => put({ default_fee_pct: std === "" ? null : Number(std) / 100 }, std === "" ? "Fee standard tolta" : `Fee standard ${std}% salvata`)}
          style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${CP.accent}`, background: CP.accent, color: CP.accentInk, fontSize: 12, cursor: "pointer" }}>Salva standard</button>
        <span style={{ fontSize: 12, color: CP.textMuted }}>vale per ogni creator senza una fee sua</span>
      </div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Eccezioni: incolla da un foglio (una riga per creator: nome e percentuale)</div>
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={"Gaja Bertolin\t40%\nElisa Esposito\t45"}
        style={{ width: "100%", boxSizing: "border-box", padding: 10, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: "inherit" }} />
      {preview.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          {preview.map((p, i) => (
            <div key={i} style={{ padding: "3px 0", color: p.error ? CP.accentRed : CP.textSecondary }}>
              {p.error ? `✗ «${p.line}»: ${p.error}` : `✓ ${p.aliases.join(", ")} → ${Math.round(p.fee_pct * 1000) / 10}%`}
            </div>
          ))}
          <button disabled={busy || !valid.length}
            onClick={() => put({ bulk: valid.flatMap((p) => p.aliases.map((a) => ({ alias: a, fee_pct: p.fee_pct }))) }, `Fee salvate per ${valid.reduce((n, p) => n + p.aliases.length, 0)} profili`).then(() => setPaste(""))}
            style={{ marginTop: 8, padding: "6px 12px", borderRadius: 7, border: `1px solid ${CP.accent}`, background: CP.accent, color: CP.accentInk, fontSize: 12, cursor: "pointer", opacity: valid.length ? 1 : 0.5 }}>
            Salva {valid.length} {valid.length === 1 ? "riga" : "righe"} valide
          </button>
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.err ? CP.accentRed : CP.accentGreen }}>{msg.text}</div>}
    </div>
  );
}
