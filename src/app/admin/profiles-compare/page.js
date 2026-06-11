"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Scale, ArrowRight, ArrowUpDown, FlaskConical, Plus, X, RotateCcw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";

/**
 * /admin/profiles-compare — Scaglioni a confronto cross-creator.
 * Una riga per creator: scaglioni applicati, venduto, costo operatori
 * attribuito, % costo, mismatch. Per la conversazione di standardizzazione
 * dei profili pagamento. Click → griglia calendario del creator.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
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
const fmtPct = (v, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const TIER_COLORS = ["#D44545", "#F59E0B", "#3FB97E", "#4F8CCB", "#A35EE0"];

// Formula BRACKET su intero importo (confermata dalla ricerca shift-research)
function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage !== "" && t.percentage != null);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let winning = sorted[0];
  for (const t of sorted) if ((Number(t.threshold) || 0) <= total) winning = t;
  return Number(winning.percentage);
}

export default function ProfilesComparePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("sales"); // sales | cost_pct
  const [simThs, setSimThs] = useState(null); // null = simulatore spento

  async function run(pid = periodId) {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/admin/profiles-compare?period_id=${pid}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // auto-load al mount e al cambio mese
  useEffect(() => { run(periodId); /* eslint-disable-next-line */ }, [periodId]);

  const sorted = useMemo(() => {
    if (!data?.creators) return [];
    const arr = [...data.creators];
    if (sortBy === "cost_pct") arr.sort((a, b) => (b.cost_pct ?? -1) - (a.cost_pct ?? -1));
    else arr.sort((a, b) => b.sales - a.sales);
    return arr;
  }, [data, sortBy]);

  // Scala colori comune: tutte le % di scaglione distinte del mese
  const pctScale = useMemo(() => {
    if (!data?.creators) return [];
    const s = new Set();
    for (const c of data.creators) for (const t of c.thresholds || []) if (t.percentage != null) s.add(t.percentage);
    return [...s].sort((a, b) => a - b);
  }, [data]);
  const colorOf = (pct) => {
    const i = pctScale.indexOf(pct);
    return i >= 0 ? TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] : CP.textMuted;
  };

  const missingPhaseB = data ? data.creators_count - data.phase_b_coverage : 0;

  // Simulazione: profilo standard applicato a TUTTI i creator
  const sim = useMemo(() => {
    if (!data?.creators || !simThs?.length) return null;
    const valid = simThs.filter((t) => t.percentage !== "" && t.percentage != null);
    if (valid.length === 0) return null;
    const perCreator = {};
    let totSim = 0;
    for (const c of data.creators) {
      let s = 0;
      for (const [total, onCreator] of c.shift_pairs || []) {
        const pct = bracketPct(total, valid);
        if (pct != null) s += pct * onCreator;
      }
      perCreator[c.alias] = Math.round(s);
      totSim += s;
    }
    return {
      perCreator,
      total: Math.round(totSim),
      delta: Math.round(totSim - data.totals.earn_attr),
    };
  }, [data, simThs]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Scaglioni a confronto</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Scaglioni a confronto"
        subtitle="Tutti i creator affiancati: scaglioni applicati, costo operatori, % costo su venduto. Per la conversazione di standardizzazione dei profili. Click su un creator per aprire la sua griglia calendario."
      />

      <CompNav />

      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 150, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ordina per</label>
            <button onClick={() => setSortBy(sortBy === "sales" ? "cost_pct" : "sales")} style={{ ...input, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, width: "auto" }}>
              <ArrowUpDown size={13} /> {sortBy === "sales" ? "Venduto" : "% costo"}
            </button>
          </div>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginTop: 18 }} />}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatCard label="Creator nel mese" value={data.creators_count} />
            <StatCard label="Venduto totale" value={fmt$(data.totals.sales)} color={CP.accentGreen} />
            <StatCard label="Pagato operatori" value={fmt$(data.totals.earn_attr)} color="#D4AF7A" />
            <StatCard label="% costo media" value={data.totals.sales > 0 ? fmtPct(data.totals.earn_attr / data.totals.sales) : "—"} />
          </div>

          {missingPhaseB > 0 && (
            <CpCard accent="#F59E0B" padding="12px 16px" style={{ marginBottom: 16 }}>
              <div style={{ color: "#F59E0B", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={14} />
                {missingPhaseB} creator senza scaglioni visibili — il mese va ri-sincronizzato post-Fase B da <Link href="/admin/creatorspro-sync-history" style={{ color: "#F59E0B" }}>Sync CP storico</Link> per popolare tutti.
              </div>
            </CpCard>
          )}

          {/* Simulatore profilo STANDARD su tutti i creator */}
          <SectionLabel style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <FlaskConical size={13} /> Simulatore — un profilo standard per tutti i creator
          </SectionLabel>
          <CpCard accent={simThs ? "#A35EE0" : undefined} padding="16px 20px" style={{ marginBottom: 18 }}>
            {!simThs ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: CP.textSecondary }}>
                  Parti dagli scaglioni di un creator esistente e applicali a tutti:
                </span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const c = data.creators.find((x) => x.alias === e.target.value);
                    if (c?.thresholds?.length) setSimThs(c.thresholds.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 })));
                  }}
                  style={{ ...input, minWidth: 240, cursor: "pointer" }}
                >
                  <option value="" style={{ background: CP.surface }}>— scegli il profilo di partenza —</option>
                  {data.creators.filter((c) => c.thresholds.length > 0).map((c) => (
                    <option key={c.alias} value={c.alias} style={{ background: CP.surface }}>
                      {c.alias} ({c.thresholds.map((t) => fmtPct(t.percentage, 0)).join("/")})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                  {simThs.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                      <div>
                        <label style={lbl}>{i === 0 ? "Base (da $)" : `Soglia ${i + 1} (da $)`}</label>
                        <input
                          type="number" value={t.threshold} disabled={i === 0}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, threshold: e.target.value === "" ? "" : Number(e.target.value) } : x))}
                          style={{ ...input, width: 96, opacity: i === 0 ? 0.5 : 1 }}
                        />
                      </div>
                      <div>
                        <label style={lbl}>%</label>
                        <input
                          type="number" step="0.5"
                          value={t.percentage === "" ? "" : Math.round(Number(t.percentage) * 1000) / 10}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, percentage: e.target.value === "" ? "" : Number(e.target.value) / 100 } : x))}
                          style={{ ...input, width: 68 }}
                        />
                      </div>
                      {i > 0 && (
                        <button onClick={() => setSimThs(simThs.filter((_, j) => j !== i))} style={iconBtn}><X size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setSimThs([...simThs, { threshold: (Number(simThs[simThs.length - 1]?.threshold) || 0) + 500, percentage: (Number(simThs[simThs.length - 1]?.percentage) || 0.1) + 0.02 }])}
                    style={iconBtn}
                  ><Plus size={13} /></button>
                  <button onClick={() => setSimThs(null)} title="Spegni simulatore" style={{ ...iconBtn, color: CP.textSecondary }}><RotateCcw size={13} /></button>
                </div>
                {sim && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <StatCard label="Pagato REALE (tutti)" value={fmt$(data.totals.earn_attr)} color="#D4AF7A" />
                    <StatCard label="Pagato SIMULATO" value={fmt$(sim.total)} color="#A35EE0" />
                    <StatCard
                      label="Δ totale"
                      value={`${sim.delta >= 0 ? "+" : ""}${fmt$(sim.delta)}`}
                      color={sim.delta > 0 ? CP.accentRed : CP.accentGreen}
                      sub={data.totals.earn_attr > 0 ? `${sim.delta >= 0 ? "+" : ""}${(100 * sim.delta / data.totals.earn_attr).toFixed(1)}% · ~${fmt$(sim.delta * 12)}/anno` : null}
                    />
                    <StatCard
                      label="% costo simulata"
                      value={data.totals.sales > 0 ? fmtPct(sim.total / data.totals.sales) : "—"}
                      sub={`reale: ${data.totals.sales > 0 ? fmtPct(data.totals.earn_attr / data.totals.sales) : "—"}`}
                    />
                  </div>
                )}
              </>
            )}
          </CpCard>

          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={th}>Creator</th>
                    <th style={th}>Scaglioni</th>
                    <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                    <th style={{ ...th, textAlign: "right" }}>Pagato (attr.)</th>
                    <th style={{ ...th, textAlign: "right" }}>% costo</th>
                    {sim && <th style={{ ...th, textAlign: "right" }}>Sim</th>}
                    {sim && <th style={{ ...th, textAlign: "right" }}>Δ</th>}
                    <th style={{ ...th, textAlign: "right" }}>Turni</th>
                    <th style={{ ...th, textAlign: "right" }}>Operatori</th>
                    <th style={{ ...th, textAlign: "right" }}>Mismatch</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const simPaid = sim?.perCreator?.[c.alias];
                    const delta = simPaid != null ? simPaid - c.earn_attr : null;
                    return (
                    <tr key={c.alias} style={{ borderBottom: `1px solid ${CP.border}55` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{c.alias}</td>
                      <td style={td}>
                        {c.thresholds.length === 0 ? (
                          <span style={{ color: CP.textMuted, fontStyle: "italic", fontSize: 11 }}>re-sync necessario</span>
                        ) : (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {c.thresholds.map((t, i) => (
                              <span key={i} style={{ padding: "2px 7px", borderRadius: 4, background: colorOf(t.percentage) + "22", border: `1px solid ${colorOf(t.percentage)}55`, color: colorOf(t.percentage), fontSize: 10, fontWeight: 700, fontFamily: FONTS.mono, whiteSpace: "nowrap" }}>
                                {t.threshold > 0 ? `≥${fmt$(t.threshold)}` : "base"}→{fmtPct(t.percentage, 0)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(c.sales)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A" }}>{fmt$(c.earn_attr)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700 }}>{fmtPct(c.cost_pct)}</td>
                      {sim && <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#A35EE0" }}>{simPaid != null ? fmt$(simPaid) : "—"}</td>}
                      {sim && (
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: delta == null ? CP.textMuted : Math.abs(delta) < 1 ? CP.textMuted : delta > 0 ? CP.accentRed : CP.accentGreen }}>
                          {delta == null ? "—" : Math.abs(delta) < 1 ? "=" : `${delta > 0 ? "+" : ""}${fmt$(delta)}`}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{c.shifts}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{c.operators_count}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: c.mismatches > 0 ? CP.accentRed : CP.accentGreen }}>
                        {c.checked > 0 ? (c.mismatches > 0 ? c.mismatches : "✓") : "—"}
                      </td>
                      <td style={td}>
                        <Link
                          href={`/admin/comp-calendar?creator=${encodeURIComponent(c.alias)}&period_id=${data.period_id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 5, color: CP.accentGreen, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          Griglia <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CpCard>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" };
const td = { padding: "9px 12px", verticalAlign: "middle" };
const iconBtn = { padding: "9px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, cursor: "pointer", display: "inline-flex", alignItems: "center" };
