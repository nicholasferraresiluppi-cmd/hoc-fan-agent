"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { parseFeePaste } from "@/lib/fee-paste";
import { Loader2, AlertCircle, TrendingUp, Check, ArrowRight } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";
import HowToRead from "@/components/HowToRead";

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

      <HowToRead items={[
        "Per ogni creator: quanto ha venduto, la fee che HOC trattiene (la % la imposti tu nella colonna editabile, una volta sola), quanto sono costati gli operatori, e il margine che resta.",
        "Margine = fee HOC − costo operatori. È il margine OPERATIVO della chat: marketing, AM e altri costi stanno nel foglio Finance.",
        "Il mese marcato LIVE è quello in corso: sincronizzi i dati e vedi dove sta atterrando il margine oggi, senza aspettare la chiusura contabile.",
        "IL numero da guardare: Margin % — sotto le aspettative su un creator grande = conversazione da fare.",
      ]} />

      <CpCard accent="#F59E0B" padding="12px 16px" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
          ⚠ <b>P&L operativo chat, in $</b>: include solo il costo operatori. Marketing, AM, struttura e gli altri costi restano nel foglio Finance (€). La fee% di ogni creator la imposti qui sotto: una standard per tutte più le eccezioni, anche incollandole da un foglio.
        </div>
      </CpCard>

      {data && <FeeSetup data={data} onDone={() => load()} />}

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
          <Link href="/admin/wage-audit" style={{ fontSize: 11, color: CP.accentGreen, paddingBottom: 10, textDecoration: "none" }}>
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
            <StatCard label="Costo operatori" value={fmt$(data.totals.cost_ops)} color={CP.accentSoftText} />
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
                    <tr key={r.alias} style={{ borderBottom: `1px solid ${alpha(CP.border, "55")}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.alias}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmt$(r.sales)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <input
                            type="number" step="0.5" min="0" max="100"
                            placeholder={r.fee_source === "standard" ? String(Math.round(r.fee_pct * 1000) / 10) : "—"}
                            title={r.fee_source === "standard" ? "Fee standard: scrivi un valore solo se questa creator ha un deal diverso" : undefined}
                            value={editing[r.alias] !== undefined ? editing[r.alias] : (r.fee_source === "creator" ? Math.round(r.fee_pct * 1000) / 10 : "")}
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
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentSoftText }}>{fmt$(r.cost_ops)}</td>
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
                    <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700, color: CP.accentSoftText }}>{fmt$(data.totals.cost_ops)}</td>
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

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" };
const td = { padding: "8px 12px", verticalAlign: "middle" };


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
    <CpCard padding="16px 18px" style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Fee delle creator</div>
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
    </CpCard>
  );
}
