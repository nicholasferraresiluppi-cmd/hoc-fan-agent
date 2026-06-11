"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, CalendarDays, AlertTriangle, Download, FlaskConical, RotateCcw, Plus, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/comp-calendar — Griglia calendario compensation per creator × mese.
 * v2: autocomplete creator (alias reali dal mese), stat cards costo operatori,
 * simulatore scaglioni alternativi (real vs sim, per operatore e totale),
 * design compatto.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS_IT = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const fmt$ = (n) => n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
const fmtPct = (v, d = 0) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;

const TIER_COLORS = ["#D44545", "#F59E0B", "#3FB97E", "#4F8CCB", "#A35EE0"];

// % vincente con formula bracket su intero importo (confermata dalla ricerca)
function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage != null && t.percentage !== "");
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let winning = sorted[0];
  for (const t of sorted) if ((Number(t.threshold) || 0) <= total) winning = t;
  return Number(winning.percentage);
}

export default function CompCalendarPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [creator, setCreator] = useState("");
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [aliases, setAliases] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [simThs, setSimThs] = useState(null);

  // Autocomplete: alias reali del mese selezionato
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/creator-aliases?period_id=${periodId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.aliases) setAliases(j.aliases); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [periodId]);

  // Inizializza simulatore con gli scaglioni reali quando arrivano i dati
  useEffect(() => {
    if (data?.thresholds_common?.length) {
      setSimThs(data.thresholds_common.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 })));
    } else {
      setSimThs(null);
    }
  }, [data]);

  async function run() {
    if (!creator.trim() || !periodId) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/admin/shift-research?creator=${encodeURIComponent(creator.trim())}&period_id=${periodId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ===== Griglia + aggregati (con attribuzione earnings al creator) =====
  const grid = useMemo(() => {
    if (!data?.rows?.length) return null;
    const rows = data.rows.map((r) => {
      const share = r.sales_total_shift > 0 ? r.sales_on_creator / r.sales_total_shift : (r.mono ? 1 : 0);
      return { ...r, earnings_attr: Math.round(r.earnings * share * 100) / 100 };
    });

    const slotCounts = {};
    for (const r of rows) {
      const k = `${r.start}–${r.end}`;
      slotCounts[k] = (slotCounts[k] || 0) + 1;
    }
    const mainSlots = Object.entries(slotCounts).filter(([, c]) => c >= 3).map(([k]) => k).sort((a, b) => a.localeCompare(b));
    const hasAltri = Object.entries(slotCounts).some(([, c]) => c < 3);
    const columns = [...mainSlots, ...(hasAltri ? ["Altri"] : [])];

    const pcts = [...new Set(rows.map((r) => r.expected_pct).filter((p) => p != null))].sort((a, b) => a - b);
    const colorOf = (pct) => {
      if (pct == null) return CP.textMuted;
      const i = pcts.indexOf(pct);
      if (i >= 0) return TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)];
      // pct simulato non presente nella scala reale: scala per posizione relativa
      const below = pcts.filter((p) => p < pct).length;
      return TIER_COLORS[Math.min(below, TIER_COLORS.length - 1)];
    };

    const [y, m] = (data.period_id || "").split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date, dow: DAYS_IT[new Date(y, m - 1, d).getDay()], dayNum: d });
    }

    const cellMap = {};
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      (cellMap[`${r.date}|${slotKey}`] = cellMap[`${r.date}|${slotKey}`] || []).push(r);
    }

    const groupSize = {};
    for (const r of rows) {
      const gk = `${r.date}|${r.start}|${r.end}`;
      groupSize[gk] = (groupSize[gk] || 0) + 1;
    }
    const cosellerFlags = new Set();
    for (const r of rows) {
      if (r.profile_cosellers == null) continue;
      if (groupSize[`${r.date}|${r.start}|${r.end}`] !== r.profile_cosellers) cosellerFlags.add(r.shift_id);
    }

    const creatorTokens = (data.matched_aliases || []).flatMap((a) =>
      a.toLowerCase().split(/[\s\-_]+/).filter((t) => t.length >= 3)
    );
    const wrongCreatorFlags = new Set();
    for (const r of rows) {
      if (!r.profile_name) continue;
      if (!creatorTokens.some((t) => r.profile_name.toLowerCase().includes(t))) wrongCreatorFlags.add(r.shift_id);
    }

    const colTotals = {};
    for (const c of columns) colTotals[c] = { sales: 0, count: 0 };
    const dayTotals = {};
    let totSales = 0, totEarn = 0, emptyCells = 0;
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      colTotals[slotKey].sales += r.sales_on_creator;
      colTotals[slotKey].count += 1;
      dayTotals[r.date] = dayTotals[r.date] || { sales: 0, count: 0 };
      dayTotals[r.date].sales += r.sales_on_creator;
      dayTotals[r.date].count += 1;
      totSales += r.sales_on_creator;
      totEarn += r.earnings_attr;
    }
    for (const d of days) for (const c of mainSlots) if (!cellMap[`${d.date}|${c}`]) emptyCells++;

    const opAgg = {};
    for (const r of rows) {
      const o = (opAgg[r.operator] = opAgg[r.operator] || { turni: 0, sales: 0, earn: 0, byPct: {} });
      o.turni += 1;
      o.sales += r.sales_on_creator;
      o.earn += r.earnings_attr;
      if (r.expected_pct != null) {
        const k = r.expected_pct.toFixed(2);
        o.byPct[k] = (o.byPct[k] || 0) + 1;
      }
    }
    const operators = Object.entries(opAgg)
      .map(([name, o]) => ({ name, ...o }))
      .sort((a, b) => b.sales - a.sales);

    return { rows, columns, mainSlots, days, cellMap, colTotals, dayTotals, colorOf, pcts, cosellerFlags, wrongCreatorFlags, operators, totSales, totEarn, emptyCells };
  }, [data]);

  // ===== Simulazione scaglioni alternativi =====
  const sim = useMemo(() => {
    if (!grid || !simThs?.length) return null;
    const valid = simThs.filter((t) => t.percentage !== "" && t.percentage != null);
    if (valid.length === 0) return null;
    let simTot = 0;
    const opSim = {};
    const byPctSim = {};
    for (const r of grid.rows) {
      const pct = bracketPct(r.sales_total_shift, valid);
      if (pct == null) continue;
      const e = pct * r.sales_on_creator;
      simTot += e;
      opSim[r.operator] = (opSim[r.operator] || 0) + e;
      const k = pct.toFixed(3);
      byPctSim[k] = (byPctSim[k] || 0) + 1;
    }
    return {
      total: Math.round(simTot),
      delta: Math.round(simTot - grid.totEarn),
      opSim,
      byPctSim: Object.entries(byPctSim).map(([p, c]) => ({ pct: parseFloat(p), count: c })).sort((a, b) => a.pct - b.pct),
    };
  }, [grid, simThs]);

  const simChanged = useMemo(() => {
    if (!simThs || !data?.thresholds_common) return false;
    const orig = data.thresholds_common;
    if (simThs.length !== orig.length) return true;
    return simThs.some((t, i) => Number(t.threshold) !== Number(orig[i]?.threshold ?? 0) || Number(t.percentage) !== Number(orig[i]?.percentage ?? 0));
  }, [simThs, data]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1500, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Comp Calendar</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Comp Calendar — turni × scaglioni"
        subtitle="Giorni × fasce orarie con scaglioni applicati, costo operatori attribuito al creator, e simulatore di profili pagamento alternativi sui turni chiusi."
      />

      {/* Form con autocomplete */}
      <CpCard padding="16px 20px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={lbl}>Creator · {aliases.length} disponibili nel mese</label>
            <input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="inizia a scrivere…"
              list="creator-aliases-list"
              style={input}
            />
            <datalist id="creator-aliases-list">
              {aliases.map((a) => <option key={a.alias} value={a.alias}>{`${a.shifts} turni`}</option>)}
            </datalist>
          </div>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 150, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading || !creator.trim()} style={primaryBtn(loading || !creator.trim())}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> Carico…</> : <><CalendarDays size={14} /> Genera</>}
          </button>
          {data?.csv_url && (
            <a href={data.csv_url} style={{ ...primaryBtn(false), background: CP.surface, color: CP.accentGreen, border: `1px solid ${CP.border}`, textDecoration: "none" }}>
              <Download size={14} /> CSV
            </a>
          )}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {data && grid && (
        <>
          {/* Stat cards: venduto / pagato / % / coverage */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Venduto (creator)" value={fmt$(grid.totSales)} color={CP.accentGreen} sub={`${grid.rows.length} turni`} />
            <StatCard label="Pagato operatori (attr.)" value={fmt$(grid.totEarn)} color="#D4AF7A" sub="quota attribuita a questa creator" />
            <StatCard label="% costo su venduto" value={grid.totSales > 0 ? fmtPct(grid.totEarn / grid.totSales, 1) : "—"} />
            <StatCard label="Operatori attivi" value={grid.operators.length} />
            <StatCard label="Slot vuoti (coverage)" value={grid.emptyCells} color={grid.emptyCells > 0 ? "#F59E0B" : CP.accentGreen} sub={`su ${grid.days.length * grid.mainSlots.length} slot`} />
          </div>

          {/* Legenda + flags */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <SectionLabel>Scaglioni:</SectionLabel>
            {(data.thresholds_common || []).map((t, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", background: grid.colorOf(t.percentage) + "22", border: `1px solid ${grid.colorOf(t.percentage)}66`, borderRadius: 5, fontSize: 11, fontFamily: FONTS.mono }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: grid.colorOf(t.percentage) }} />
                {t.threshold > 0 ? `≥${fmt$(t.threshold)}` : "base"}→<b>{fmtPct(t.percentage)}</b>
              </span>
            ))}
            <span style={{ fontSize: 11, color: CP.textMuted }}>
              {data.phase_b?.mismatches === 0 ? `✓ 0 mismatch` : `⚠ ${data.phase_b?.mismatches} fuori scaglione`}
              {grid.cosellerFlags.size > 0 && ` · ⚠ ${grid.cosellerFlags.size} cosellers incoerenti`}
              {grid.wrongCreatorFlags.size > 0 && ` · ⚠ ${grid.wrongCreatorFlags.size} profili di altro creator`}
            </span>
          </div>

          {/* Griglia */}
          <CpCard padding="0" style={{ overflow: "hidden", marginBottom: 22 }}>
            <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 3 }}>
                    <th style={{ ...th, position: "sticky", left: 0, zIndex: 4, minWidth: 64 }}>Giorno</th>
                    {grid.columns.map((c) => <th key={c} style={{ ...th, minWidth: 138 }}>{c}</th>)}
                    <th style={{ ...th, textAlign: "right", minWidth: 78 }}>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.days.map((d) => {
                    const dt = grid.dayTotals[d.date];
                    const weekend = d.dow === "Sab" || d.dow === "Dom";
                    return (
                      <tr key={d.date} style={{ borderBottom: `1px solid ${CP.border}55`, background: weekend ? CP.surfaceAlt + "44" : "transparent" }}>
                        <td style={{ ...td, position: "sticky", left: 0, background: CP.surface, fontFamily: FONTS.mono, fontSize: 10, whiteSpace: "nowrap", color: weekend ? "#D4AF7A" : CP.textSecondary, zIndex: 1 }}>
                          {d.dow} {d.dayNum}
                        </td>
                        {grid.columns.map((c) => {
                          const cell = grid.cellMap[`${d.date}|${c}`] || [];
                          if (cell.length === 0) return <td key={c} style={{ ...td, color: CP.border, textAlign: "center", fontSize: 9 }}>·</td>;
                          return (
                            <td key={c} style={{ ...td, padding: "3px 5px" }}>
                              {cell.map((r) => {
                                const col = grid.colorOf(r.expected_pct);
                                const mismatch = r.delta_pct != null && Math.abs(r.delta_pct) > 0.005;
                                const flag = mismatch || grid.cosellerFlags.has(r.shift_id) || grid.wrongCreatorFlags.has(r.shift_id);
                                return (
                                  <div
                                    key={r.shift_id}
                                    title={`${r.operator} · ${r.start}–${r.end}\nVenduto ${fmt$(r.sales_on_creator)} · pagato ${fmt$(r.earnings_attr)} (${fmtPct(r.eff_pct, 1)})\nProfilo "${r.profile_name || "?"}" (${r.profile_cosellers ?? "?"} cos.)${mismatch ? "\n⚠ FUORI SCAGLIONE" : ""}${grid.cosellerFlags.has(r.shift_id) ? "\n⚠ cosellers incoerenti" : ""}${grid.wrongCreatorFlags.has(r.shift_id) ? "\n⚠ profilo di altro creator" : ""}`}
                                    style={{
                                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4,
                                      padding: "2px 6px", marginBottom: 2, borderRadius: 4,
                                      background: mismatch ? CP.accentRed + "30" : col + "16",
                                      border: `1px solid ${mismatch ? CP.accentRed : col}50`,
                                      fontSize: 10, cursor: "default",
                                    }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>
                                      {flag && <AlertTriangle size={8} style={{ display: "inline", marginRight: 2, color: CP.accentRed }} />}
                                      {r.operator.split(" ")[0]}
                                    </span>
                                    <span style={{ fontFamily: FONTS.mono, fontWeight: 700, color: col, whiteSpace: "nowrap", fontSize: 9.5 }}>
                                      {fmt$(r.sales_on_creator)}·{fmtPct(r.expected_pct)}
                                    </span>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 600, fontSize: 10, color: dt ? CP.accentGreen : CP.border }}>
                          {dt ? fmt$(dt.sales) : "·"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${CP.border}`, background: CP.surfaceAlt, position: "sticky", bottom: 0 }}>
                    <td style={{ ...td, fontFamily: FONTS.mono, fontWeight: 700, fontSize: 10, position: "sticky", left: 0, background: CP.surfaceAlt }}>TOT</td>
                    {grid.columns.map((c) => {
                      const t = grid.colTotals[c];
                      return (
                        <td key={c} style={{ ...td, fontFamily: FONTS.mono, fontSize: 10 }}>
                          <span style={{ color: CP.accentGreen, fontWeight: 700 }}>{fmt$(t.sales)}</span>
                          <span style={{ color: CP.textMuted }}> ·{t.count}t</span>
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, fontSize: 10, color: CP.accentGreen }}>
                      {fmt$(grid.totSales)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CpCard>

          {/* ===== Simulatore ===== */}
          <SectionLabel style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <FlaskConical size={13} /> Simulatore — profilo pagamento alternativo sui turni chiusi
          </SectionLabel>
          <CpCard accent={simChanged ? "#A35EE0" : undefined} padding="18px 22px" style={{ marginBottom: 22 }}>
            {simThs && (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
                  {simThs.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                      <div>
                        <label style={lbl}>{i === 0 ? "Base (da $)" : `Soglia ${i + 1} (da $)`}</label>
                        <input
                          type="number"
                          value={t.threshold}
                          disabled={i === 0}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, threshold: e.target.value === "" ? "" : Number(e.target.value) } : x))}
                          style={{ ...input, width: 100, opacity: i === 0 ? 0.5 : 1 }}
                        />
                      </div>
                      <div>
                        <label style={lbl}>%</label>
                        <input
                          type="number" step="0.5"
                          value={t.percentage === "" ? "" : Math.round(Number(t.percentage) * 1000) / 10}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, percentage: e.target.value === "" ? "" : Number(e.target.value) / 100 } : x))}
                          style={{ ...input, width: 72 }}
                        />
                      </div>
                      {i > 0 && (
                        <button onClick={() => setSimThs(simThs.filter((_, j) => j !== i))} title="Rimuovi scaglione" style={iconBtn}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setSimThs([...simThs, { threshold: (Number(simThs[simThs.length - 1]?.threshold) || 0) + 500, percentage: (Number(simThs[simThs.length - 1]?.percentage) || 0.1) + 0.02 }])}
                    title="Aggiungi scaglione" style={iconBtn}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => setSimThs(data.thresholds_common.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 })))}
                    title="Reset agli scaglioni reali" style={{ ...iconBtn, color: CP.textSecondary }}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>

                {sim && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <StatCard label="Pagato REALE" value={fmt$(grid.totEarn)} color="#D4AF7A" />
                    <StatCard label="Pagato SIMULATO" value={fmt$(sim.total)} color="#A35EE0" />
                    <StatCard
                      label="Δ per gli operatori"
                      value={`${sim.delta >= 0 ? "+" : ""}${fmt$(sim.delta)}`}
                      color={sim.delta > 0 ? CP.accentRed : CP.accentGreen}
                      sub={grid.totEarn > 0 ? `${sim.delta >= 0 ? "+" : ""}${(100 * sim.delta / grid.totEarn).toFixed(1)}% vs reale` : null}
                    />
                    <StatCard
                      label="Margine creator post-sim"
                      value={grid.totSales > 0 ? fmtPct((grid.totSales - sim.total) / grid.totSales, 1) : "—"}
                      sub={`reale: ${grid.totSales > 0 ? fmtPct((grid.totSales - grid.totEarn) / grid.totSales, 1) : "—"}`}
                    />
                  </div>
                )}
                {!simChanged && (
                  <div style={{ marginTop: 10, fontSize: 11, color: CP.textMuted, fontStyle: "italic" }}>
                    Scaglioni = quelli reali del creator. Modifica soglie o % qui sopra per simulare un profilo diverso — il confronto si aggiorna in tempo reale sui {grid.rows.length} turni chiusi del mese.
                  </div>
                )}
              </>
            )}
          </CpCard>

          {/* Per operatore: reale + simulato */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Per operatore · pagato reale {simChanged ? "vs simulato" : ""}</SectionLabel>
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                  <th style={th}>Operatore</th>
                  <th style={{ ...th, textAlign: "right" }}>Turni</th>
                  <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                  <th style={{ ...th, textAlign: "right" }}>Pagato (attr.)</th>
                  {simChanged && <th style={{ ...th, textAlign: "right" }}>Simulato</th>}
                  {simChanged && <th style={{ ...th, textAlign: "right" }}>Δ</th>}
                  <th style={th}>Mix scaglioni</th>
                </tr>
              </thead>
              <tbody>
                {grid.operators.map((o) => {
                  const simEarn = sim?.opSim?.[o.name];
                  const delta = simEarn != null ? simEarn - o.earn : null;
                  return (
                    <tr key={o.name} style={{ borderBottom: `1px solid ${CP.border}55` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{o.turni}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(o.sales)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A" }}>{fmt$(o.earn)}</td>
                      {simChanged && <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#A35EE0" }}>{simEarn != null ? fmt$(simEarn) : "—"}</td>}
                      {simChanged && (
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: delta == null ? CP.textMuted : delta > 0 ? CP.accentRed : CP.accentGreen }}>
                          {delta != null ? `${delta >= 0 ? "+" : ""}${fmt$(delta)}` : "—"}
                        </td>
                      )}
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {Object.entries(o.byPct).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([pct, count]) => (
                            <span key={pct} style={{ padding: "1px 6px", borderRadius: 4, background: grid.colorOf(parseFloat(pct)) + "22", color: grid.colorOf(parseFloat(pct)), fontSize: 10, fontWeight: 700, fontFamily: FONTS.mono }}>
                              {count}×{fmtPct(parseFloat(pct))}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CpCard>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "8px 9px", textAlign: "left", fontSize: 9.5, fontWeight: 700, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONTS.mono, whiteSpace: "nowrap", background: CP.surfaceAlt };
const td = { padding: "5px 8px", verticalAlign: "top" };
const iconBtn = { padding: "9px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, cursor: "pointer", display: "inline-flex", alignItems: "center" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "10px 16px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
