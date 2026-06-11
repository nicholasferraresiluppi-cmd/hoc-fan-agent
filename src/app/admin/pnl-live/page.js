"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, TrendingUp, Check, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";

/**
 * /admin/pnl-live — P&L operativo per creator, anche sul mese in corso.
 * Venduto (CP) × fee% deal (config editabile) − costo operatori = margine.
 * Il "live": sincronizzi il mese corrente → vedi dove atterra il margine
 * a oggi, senza aspettare la chiusura del foglio Finance.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 13) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) { // i=0 → mese CORRENTE (live)
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " · LIVE" : ""}`,
    });
  }
  return out;
}
const fmt$ = (n) => n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
const fmtPct = (v, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;

export default function PnlLivePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState({}); // alias → valore input in corso
  const [saved, setSaved] = useState({});     // alias → true flash

  async function load(pid = periodId) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/pnl-live?period_id=${pid}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message); setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(periodId); /* eslint-disable-next-line */ }, [periodId]);

  async function saveFee(alias, raw) {
    const v = raw === "" ? null : Number(raw) / 100;
    if (v !== null && (isNaN(v) || v < 0 || v > 1)) return;
    try {
      const res = await fetch("/api/admin/pnl-live", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, fee_pct: v }),
      });
      if (res.ok) {
        setSaved((s) => ({ ...s, [alias]: true }));
        setTimeout(() => setSaved((s) => ({ ...s, [alias]: false })), 1500);
        load(); // ricalcola margini
      }
    } catch {}
  }

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>P&L Live</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="P&L Live per creator"
        subtitle="Venduto CP × fee% del deal − costo operatori = margine operativo, anche sul mese in corso. La fee% la imposti tu una volta per creator (colonna editabile) e resta salvata."
      />

      <CompNav />

      <CpCard accent="#F59E0B" padding="12px 16px" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
          ⚠ <b>P&L operativo chat, in $</b>: include solo il costo operatori. Marketing, AM, struttura e gli altri costi restano nel foglio Finance (€). Le fee% puoi prenderle dal doc{" "}
          <a href="https://app.clickup.com/9012548730/docs/8ck153u-707752/8ck153u-243912" target="_blank" rel="noopener noreferrer" style={{ color: "#F59E0B" }}>Deal Economics</a> — ma verifica i contratti reali prima di fidarti.
        </div>
      </CpCard>

      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 180, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          {data?.last_sync_at && data?.last_sync_period === periodId && (
            <span style={{ fontSize: 11, color: CP.textMuted, paddingBottom: 10 }}>
              Ultimo sync: {new Date(data.last_sync_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Link href="/admin/creatorspro-sync-history" style={{ fontSize: 11, color: CP.accentGreen, paddingBottom: 10, textDecoration: "none" }}>
            Aggiorna dati (sync) →
          </Link>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginBottom: 10 }} />}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Venduto totale" value={fmt$(data.totals.sales)} color={CP.accentGreen} />
            <StatCard label="Fee HOC (dove impostata)" value={fmt$(data.totals.fee_usd)} sub={`fee config: ${data.totals.fee_coverage} creator`} />
            <StatCard label="Costo operatori" value={fmt$(data.totals.cost_ops)} color="#D4AF7A" />
            <StatCard label="Margine operativo" value={fmt$(data.totals.margin)} color={data.totals.margin >= 0 ? CP.accentGreen : CP.accentRed} sub="solo creator con fee impostata" />
          </div>

          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={th}>Creator</th>
                    <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                    <th style={{ ...th, textAlign: "right" }}>Fee % deal</th>
                    <th style={{ ...th, textAlign: "right" }}>Fee $</th>
                    <th style={{ ...th, textAlign: "right" }}>Costo ops</th>
                    <th style={{ ...th, textAlign: "right" }}>% costo</th>
                    <th style={{ ...th, textAlign: "right" }}>Margine</th>
                    <th style={{ ...th, textAlign: "right" }}>Margin %</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.alias} style={{ borderBottom: `1px solid ${CP.border}55` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.alias}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(r.sales)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <input
                            type="number" step="0.5" min="0" max="100"
                            placeholder="—"
                            value={editing[r.alias] !== undefined ? editing[r.alias] : (r.fee_pct != null ? Math.round(r.fee_pct * 1000) / 10 : "")}
                            onChange={(e) => setEditing((s) => ({ ...s, [r.alias]: e.target.value }))}
                            onBlur={(e) => { if (editing[r.alias] !== undefined) { saveFee(r.alias, e.target.value); setEditing((s) => { const n = { ...s }; delete n[r.alias]; return n; }); } }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            style={{ ...input, width: 68, textAlign: "right", fontFamily: FONTS.mono, padding: "5px 8px" }}
                          />
                          <span style={{ fontSize: 11, color: CP.textMuted }}>%</span>
                          {saved[r.alias] && <Check size={13} color={CP.accentGreen} />}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(r.fee_usd)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A" }}>{fmt$(r.cost_ops)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtPct(r.cost_pct)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: r.margin == null ? CP.textMuted : r.margin >= 0 ? CP.accentGreen : CP.accentRed }}>{fmt$(r.margin)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: r.margin_pct == null ? CP.textMuted : r.margin_pct >= 0 ? CP.accentGreen : CP.accentRed }}>{fmtPct(r.margin_pct)}</td>
                      <td style={td}>
                        <Link
                          href={`/admin/comp-calendar?creator=${encodeURIComponent(r.alias)}&period_id=${data.period_id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 5, color: CP.accentGreen, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          Griglia <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${CP.border}`, background: CP.surfaceAlt }}>
                    <td style={{ ...td, fontFamily: FONTS.mono, fontWeight: 700 }}>TOTALI</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: CP.accentGreen }}>{fmt$(data.totals.sales)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700 }}>{fmt$(data.totals.fee_usd)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: "#D4AF7A" }}>{fmt$(data.totals.cost_ops)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: data.totals.margin >= 0 ? CP.accentGreen : CP.accentRed }}>{fmt$(data.totals.margin)}</td>
                    <td style={td}></td>
                    <td style={td}></td>
                  </tr>
                </tfoot>
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
const td = { padding: "8px 12px", verticalAlign: "middle" };
