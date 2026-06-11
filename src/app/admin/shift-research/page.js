"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Download, Loader2, AlertCircle, FlaskConical, CheckCircle2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/shift-research — Ricerca one-shot per il match turno ↔ profilo pagamento.
 * Risponde a 3 domande su un creator × mese, direttamente dal RAW CP API:
 *  Q1: il raw shift contiene il payment profile applicato? campo?
 *  Q2: formula scaglioni: bracket su intero importo o cumulativa?
 *  Q3: dataset completo turni (per ricostruire il foglio stile Scheda Gaja)
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
const fmtPct = (v) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;

export default function ShiftResearchPage() {
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

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Shift Research</span>
          </div>
        }
        section="Data · Ricerca"
        title="Shift Research — match turno ↔ profilo"
        subtitle="Ricerca one-shot dal RAW CP API: il profilo pagamento è nel dato turno? Che formula usano gli scaglioni? Dataset completo scaricabile in CSV per ricostruire il foglio di calcolo."
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
            {loading ? <><Loader2 size={14} className="animate-spin" /> Ricerca…</> : <><FlaskConical size={14} /> Avvia ricerca</>}
          </button>
          {data?.csv_url && (
            <a href={data.csv_url} style={{ ...primaryBtn(false), background: CP.surface, color: CP.accentGreen, border: `1px solid ${CP.border}`, textDecoration: "none" }}>
              <Download size={14} /> Scarica CSV
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

      {loading && (
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: CP.textSecondary, fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Scarico wage detail RAW da CP API (~20-40s)…
          </div>
        </CpCard>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 }}>
            <StatCard label="Creator (group CP)" value={data.creator} />
            <StatCard label="Wages analizzate" value={data.wages_count} />
            <StatCard label="Turni totali" value={data.shifts_count} />
            <StatCard label="Turni mono analizzati (Q2)" value={data.q2_mono_shifts_analyzed} />
          </div>

          {/* Q1 */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Q1 — Campi profile/payment nel RAW shift</SectionLabel>
          <CpCard accent={data.q1_profile_fields?.length > 0 ? CP.accentGreen : CP.accentRed} padding="16px 20px" style={{ marginBottom: 22 }}>
            {(!data.q1_profile_fields || data.q1_profile_fields.length === 0) ? (
              <div style={{ color: CP.accentRed, fontSize: 13 }}>
                Nessun campo profile/payment/tier trovato nel raw → il profilo applicato NON è esposto nel wage detail. Servirà un endpoint CP diverso.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CP.border}`, color: CP.textMuted }}>
                      <th style={th}>Path campo</th>
                      <th style={th}>Occorrenze</th>
                      <th style={th}>Valori distinti</th>
                      <th style={th}>Esempi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.q1_profile_fields.map((f) => (
                      <tr key={f.path} style={{ borderBottom: `1px solid ${CP.border}66` }}>
                        <td style={{ ...td, fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{f.path}</td>
                        <td style={{ ...td, fontFamily: FONTS.mono }}>{f.count}</td>
                        <td style={{ ...td, fontFamily: FONTS.mono }}>{f.distinct_values}</td>
                        <td style={{ ...td, fontFamily: FONTS.mono, fontSize: 10, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.examples.map((e) => typeof e === "object" ? JSON.stringify(e) : String(e)).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: CP.textSecondary, fontSize: 11, fontFamily: FONTS.mono }}>
                Raw completo del primo shift (tutte le keys: {(data.q1_sample_raw_shift_keys || []).join(", ")})
              </summary>
              <pre style={{ marginTop: 8, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto" }}>
                {JSON.stringify(data.q1_sample_raw_shift, null, 2)}
              </pre>
            </details>
          </CpCard>

          {/* Q2 */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Q2 — Formula scaglioni (bracket intero vs cumulativa)</SectionLabel>
          <CpCard accent="#D4AF7A" padding="16px 20px" style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={15} color="#D4AF7A" /> {data.q2_verdict}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(data.q2_eff_pct_distribution || []).slice(0, 12).map((b) => (
                <div key={b.eff_pct} style={{ padding: "5px 10px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, fontFamily: FONTS.mono }}>
                  <b style={{ color: CP.accentGreen }}>{fmtPct(b.eff_pct)}</b> × {b.count} turni
                </div>
              ))}
            </div>
          </CpCard>

          {/* Q3 */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Q3 — Dataset turni ({data.rows?.length || 0}) · ordinato per data</SectionLabel>
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}`, position: "sticky", top: 0 }}>
                    <th style={th}>Data</th>
                    <th style={th}>Orario</th>
                    <th style={th}>Operatore</th>
                    <th style={{ ...th, textAlign: "right" }}>Venduto (creator)</th>
                    <th style={{ ...th, textAlign: "right" }}>Venduto (turno tot)</th>
                    <th style={{ ...th, textAlign: "right" }}>Guadagno</th>
                    <th style={{ ...th, textAlign: "right" }}>Eff %</th>
                    <th style={th}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rows || []).map((r, i) => (
                    <tr key={r.shift_id || i} style={{ borderBottom: `1px solid ${CP.border}66` }}>
                      <td style={{ ...td, fontFamily: FONTS.mono }}>{r.date}</td>
                      <td style={{ ...td, fontFamily: FONTS.mono, color: CP.textSecondary }}>{r.start}–{r.end}</td>
                      <td style={td}>{r.operator}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(r.sales_on_creator)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textMuted }}>{fmt$(r.sales_total_shift)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A" }}>{fmt$(r.earnings)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700 }}>{fmtPct(r.eff_pct)}</td>
                      <td style={{ ...td, fontSize: 10, color: r.mono ? CP.accentGreen : "#F59E0B" }}>{r.mono ? "MONO" : `${r.creators_in_shift} creator`}</td>
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
const input = { width: "100%", padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap", background: CP.surfaceAlt };
const td = { padding: "8px 12px", verticalAlign: "middle" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "11px 18px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
