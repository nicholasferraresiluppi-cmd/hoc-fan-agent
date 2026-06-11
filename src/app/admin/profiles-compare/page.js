"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Scale, ArrowRight, ArrowUpDown } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

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

export default function ProfilesComparePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("sales"); // sales | cost_pct

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
                    <th style={{ ...th, textAlign: "right" }}>Turni</th>
                    <th style={{ ...th, textAlign: "right" }}>Operatori</th>
                    <th style={{ ...th, textAlign: "right" }}>Mismatch</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
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
                  ))}
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
