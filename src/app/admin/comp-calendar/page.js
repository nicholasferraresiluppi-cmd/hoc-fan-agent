"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Loader2, AlertCircle, CalendarDays, AlertTriangle, Download } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/comp-calendar — Griglia calendario compensation per creator × mese.
 * La versione "viva" del foglio storico "Scheda Gaja": righe = giorni,
 * colonne = fasce orarie reali, celle = operatori con venduto + scaglione.
 *
 * Dati: /api/admin/shift-research (KV + Fase B payment_profile per turno).
 * Controlli integrati:
 *  1. Δ % attesa vs reale (riga/cella rossa)
 *  2. Coerenza cosellers: N operatori nella stessa fascia vs cosellersCount del profilo
 *  3. Profilo del creator sbagliato (es. "1 Camilla" su turno Ottorini)
 *  4. Distribuzione scaglioni per operatore (pannello sotto)
 *  5. Monetizzazione per fascia (riga totali)
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

// Palette scaglioni: dal più basso al più alto
const TIER_COLORS = ["#D44545", "#F59E0B", "#3FB97E", "#4F8CCB", "#A35EE0"];

export default function CompCalendarPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [creator, setCreator] = useState("Giulia Ottorini");
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // ===== Derivazioni griglia =====
  const grid = useMemo(() => {
    if (!data?.rows?.length) return null;
    const rows = data.rows;

    // Colonne = slot orari reali (start–end) con ≥3 occorrenze; il resto in "Altri"
    const slotCounts = {};
    for (const r of rows) {
      const k = `${r.start}–${r.end}`;
      slotCounts[k] = (slotCounts[k] || 0) + 1;
    }
    const mainSlots = Object.entries(slotCounts)
      .filter(([, c]) => c >= 3)
      .map(([k]) => k)
      .sort((a, b) => a.localeCompare(b));
    const hasAltri = Object.entries(slotCounts).some(([k, c]) => c < 3);
    const columns = [...mainSlots, ...(hasAltri ? ["Altri"] : [])];

    // Scala % → colore (dai pct attesi distinti, ordinati)
    const pcts = [...new Set(rows.map((r) => r.expected_pct).filter((p) => p != null))].sort((a, b) => a - b);
    const colorOf = (pct) => {
      if (pct == null) return CP.textMuted;
      const i = pcts.indexOf(pct);
      return TIER_COLORS[Math.max(0, i)] || TIER_COLORS[TIER_COLORS.length - 1];
    };

    // Giorni del mese
    const [y, m] = (data.period_id || "").split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date, dow: DAYS_IT[new Date(y, m - 1, d).getDay()], dayNum: d });
    }

    // Celle: date × slot → turni
    const cellMap = {};
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      const key = `${r.date}|${slotKey}`;
      (cellMap[key] = cellMap[key] || []).push(r);
    }

    // Check 2 — coerenza cosellers: gruppo stesso date+start+end
    const groupSize = {};
    for (const r of rows) {
      const gk = `${r.date}|${r.start}|${r.end}`;
      groupSize[gk] = (groupSize[gk] || 0) + 1;
    }
    const cosellerFlags = new Set();
    for (const r of rows) {
      if (r.profile_cosellers == null) continue;
      const gk = `${r.date}|${r.start}|${r.end}`;
      if (groupSize[gk] !== r.profile_cosellers) cosellerFlags.add(r.shift_id);
    }

    // Check 3 — profilo del creator sbagliato
    const creatorTokens = (data.matched_aliases || []).flatMap((a) =>
      a.toLowerCase().split(/[\s\-_]+/).filter((t) => t.length >= 3 && !["the"].includes(t))
    );
    const wrongCreatorFlags = new Set();
    for (const r of rows) {
      if (!r.profile_name) continue;
      const pn = r.profile_name.toLowerCase();
      if (!creatorTokens.some((t) => pn.includes(t))) wrongCreatorFlags.add(r.shift_id);
    }

    // Totali per colonna e per giorno
    const colTotals = {};
    for (const c of columns) colTotals[c] = { sales: 0, count: 0 };
    const dayTotals = {};
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      colTotals[slotKey].sales += r.sales_on_creator;
      colTotals[slotKey].count += 1;
      dayTotals[r.date] = dayTotals[r.date] || { sales: 0, count: 0 };
      dayTotals[r.date].sales += r.sales_on_creator;
      dayTotals[r.date].count += 1;
    }

    // Check 4 — aggregato per operatore
    const opAgg = {};
    for (const r of rows) {
      const o = (opAgg[r.operator] = opAgg[r.operator] || { turni: 0, sales: 0, earnings: 0, byPct: {} });
      o.turni += 1;
      o.sales += r.sales_on_creator;
      o.earnings += r.earnings;
      if (r.expected_pct != null) {
        const k = r.expected_pct.toFixed(2);
        o.byPct[k] = (o.byPct[k] || 0) + 1;
      }
    }
    const operators = Object.entries(opAgg)
      .map(([name, o]) => ({ name, ...o, salesPerTurno: o.turni > 0 ? o.sales / o.turni : 0 }))
      .sort((a, b) => b.sales - a.sales);

    return { columns, mainSlots, days, cellMap, colTotals, dayTotals, colorOf, pcts, cosellerFlags, wrongCreatorFlags, operators };
  }, [data]);

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
        title="Comp Calendar — griglia turni × scaglioni"
        subtitle="La versione viva del foglio di calcolo storico: giorni × fasce orarie, ogni cella mostra chi ha lavorato, quanto ha venduto e che scaglione è stato applicato. Con i controlli automatici: Δ attesa/reale, coerenza cosellers, profilo del creator giusto."
      />

      <CpCard padding="18px 22px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl}>Creator</label>
            <input value={creator} onChange={(e) => setCreator(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} style={input} />
          </div>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 160, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading || !creator.trim()} style={primaryBtn(loading || !creator.trim())}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> Carico…</> : <><CalendarDays size={14} /> Genera griglia</>}
          </button>
          {data?.csv_url && (
            <a href={data.csv_url} style={{ ...primaryBtn(false), background: CP.surface, color: CP.accentGreen, border: `1px solid ${CP.border}`, textDecoration: "none" }}>
              <Download size={14} /> CSV
            </a>
          )}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {data && grid && (
        <>
          {/* Legenda scaglioni */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <SectionLabel>Scaglioni {data.creator}:</SectionLabel>
            {(data.thresholds_common || []).map((t, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: grid.colorOf(t.percentage) + "22", border: `1px solid ${grid.colorOf(t.percentage)}66`, borderRadius: 6, fontSize: 12, fontFamily: FONTS.mono }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: grid.colorOf(t.percentage) }} />
                {t.threshold > 0 ? `≥ ${fmt$(t.threshold)}` : "base"} → <b>{fmtPct(t.percentage)}</b>
              </span>
            ))}
            <span style={{ fontSize: 11, color: CP.textMuted }}>
              {data.phase_b?.mismatches === 0
                ? `✓ 0 mismatch su ${data.phase_b.rows_total} turni`
                : `⚠ ${data.phase_b?.mismatches} turni fuori scaglione`}
              {grid.cosellerFlags.size > 0 && ` · ⚠ ${grid.cosellerFlags.size} incoerenze cosellers`}
              {grid.wrongCreatorFlags.size > 0 && ` · ⚠ ${grid.wrongCreatorFlags.size} profili di altro creator`}
            </span>
          </div>

          {/* Griglia calendario */}
          <CpCard padding="0" style={{ overflow: "hidden", marginBottom: 24 }}>
            <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ ...th, minWidth: 76 }}>Giorno</th>
                    {grid.columns.map((c) => <th key={c} style={{ ...th, minWidth: 150 }}>{c}</th>)}
                    <th style={{ ...th, textAlign: "right", minWidth: 90 }}>Tot giorno</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.days.map((d) => {
                    const dt = grid.dayTotals[d.date];
                    const weekend = d.dow === "Sab" || d.dow === "Dom";
                    return (
                      <tr key={d.date} style={{ borderBottom: `1px solid ${CP.border}66`, background: weekend ? CP.surfaceAlt + "55" : "transparent" }}>
                        <td style={{ ...td, fontFamily: FONTS.mono, whiteSpace: "nowrap", color: weekend ? "#D4AF7A" : CP.textSecondary }}>
                          {d.dow} {d.dayNum}
                        </td>
                        {grid.columns.map((c) => {
                          const cell = grid.cellMap[`${d.date}|${c}`] || [];
                          if (cell.length === 0) {
                            return <td key={c} style={{ ...td, color: CP.border, textAlign: "center" }}>·</td>;
                          }
                          return (
                            <td key={c} style={{ ...td, padding: "5px 8px" }}>
                              {cell.map((r) => {
                                const col = grid.colorOf(r.expected_pct);
                                const mismatch = r.delta_pct != null && Math.abs(r.delta_pct) > 0.005;
                                const cosFlag = grid.cosellerFlags.has(r.shift_id);
                                const wrongFlag = grid.wrongCreatorFlags.has(r.shift_id);
                                return (
                                  <div
                                    key={r.shift_id}
                                    title={`${r.operator} · ${r.start}–${r.end} · venduto ${fmt$(r.sales_on_creator)} · ${fmtPct(r.eff_pct, 1)} eff · profilo "${r.profile_name || "?"}" (${r.profile_cosellers ?? "?"} cosellers)${mismatch ? " · ⚠ FUORI SCAGLIONE" : ""}${cosFlag ? " · ⚠ cosellers incoerenti" : ""}${wrongFlag ? " · ⚠ profilo di altro creator" : ""}`}
                                    style={{
                                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                                      padding: "3px 7px", marginBottom: 2, borderRadius: 5,
                                      background: mismatch ? CP.accentRed + "33" : col + "1A",
                                      border: `1px solid ${mismatch ? CP.accentRed : col}55`,
                                      cursor: "default",
                                    }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 86 }}>
                                      {(cosFlag || wrongFlag || mismatch) && <AlertTriangle size={9} style={{ display: "inline", marginRight: 3, color: CP.accentRed }} />}
                                      {r.operator.split(" ")[0]}
                                    </span>
                                    <span style={{ fontFamily: FONTS.mono, fontWeight: 700, color: col, whiteSpace: "nowrap" }}>
                                      {fmt$(r.sales_on_creator)} · {fmtPct(r.expected_pct)}
                                    </span>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 600, color: dt ? CP.accentGreen : CP.border }}>
                          {dt ? fmt$(dt.sales) : "·"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${CP.border}`, background: CP.surfaceAlt }}>
                    <td style={{ ...td, fontFamily: FONTS.mono, fontWeight: 700 }}>TOTALI</td>
                    {grid.columns.map((c) => {
                      const t = grid.colTotals[c];
                      return (
                        <td key={c} style={{ ...td, fontFamily: FONTS.mono, fontWeight: 600 }}>
                          <span style={{ color: CP.accentGreen }}>{fmt$(t.sales)}</span>
                          <span style={{ color: CP.textMuted, fontSize: 10 }}> · {t.count}t</span>
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: CP.accentGreen }}>
                      {fmt$(Object.values(grid.dayTotals).reduce((s, d) => s + d.sales, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CpCard>

          {/* Pannello per operatore */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Per operatore · distribuzione scaglioni</SectionLabel>
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                  <th style={th}>Operatore</th>
                  <th style={{ ...th, textAlign: "right" }}>Turni</th>
                  <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                  <th style={{ ...th, textAlign: "right" }}>Venduto/turno</th>
                  <th style={{ ...th, textAlign: "right" }}>Guadagno</th>
                  <th style={th}>Mix scaglioni</th>
                </tr>
              </thead>
              <tbody>
                {grid.operators.map((o) => (
                  <tr key={o.name} style={{ borderBottom: `1px solid ${CP.border}66` }}>
                    <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{o.turni}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(o.sales)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(o.salesPerTurno)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A" }}>{fmt$(o.earnings)}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {Object.entries(o.byPct).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([pct, count]) => (
                          <span key={pct} style={{ padding: "2px 7px", borderRadius: 4, background: grid.colorOf(parseFloat(pct)) + "22", color: grid.colorOf(parseFloat(pct)), fontSize: 10, fontWeight: 700, fontFamily: FONTS.mono }}>
                            {count}×{fmtPct(parseFloat(pct))}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CpCard>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { width: "100%", padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap", background: CP.surfaceAlt };
const td = { padding: "7px 10px", verticalAlign: "top" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "11px 18px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
