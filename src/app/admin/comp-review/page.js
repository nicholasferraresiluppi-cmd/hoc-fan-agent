"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, AlertTriangle, XCircle, ArrowRight, TrendingUp, TrendingDown, Filter, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/comp-review — Hot list globale anomalie compensation.
 * 1 schermata, top N coppie (operatore × creator) ordinate per $ a rischio.
 * Click su una riga → drill-down a /admin/comp-exam?creator=...
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

const fmtCurrency = (n) => n == null ? "—" : `$${Math.round(n).toLocaleString("it-IT")}`;
const fmtPct = (v, d = 1) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function CompReviewPage() {
  const periods = useMemo(() => monthOpts(12), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [direction, setDirection] = useState("all");
  const [minSales, setMinSales] = useState(500);
  const [minShifts, setMinShifts] = useState(3);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");

  const url = periodId
    ? `/api/admin/comp-review?period_id=${periodId}&direction=${direction}&min_sales=${minSales}&min_shifts=${minShifts}&limit=200`
    : null;

  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });

  const filteredAnomalies = useMemo(() => {
    if (!data?.anomalies) return [];
    return data.anomalies.filter((a) => {
      if (creatorFilter && !a.creator_alias.toLowerCase().includes(creatorFilter.toLowerCase())) return false;
      if (operatorFilter && !a.operator.toLowerCase().includes(operatorFilter.toLowerCase())) return false;
      return true;
    });
  }, [data, creatorFilter, operatorFilter]);

  const allCreators = useMemo(() => {
    if (!data?.anomalies) return [];
    return [...new Set(data.anomalies.map((a) => a.creator_alias))].sort();
  }, [data]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1500, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Comp Review</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Comp Review — Hot list anomalie"
        subtitle="Tutti i creator esaminati insieme. Top N coppie (operatore × creator) dove la % effettiva si discosta dalla media del team. Ordinate per $ a rischio per HOC. Click su una riga per il drill-down con distribuzione shift-by-shift."
      />

      {/* Filtri */}
      <CpCard padding="16px 20px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Periodo</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 150, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Direzione</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ ...input, minWidth: 160, cursor: "pointer" }}>
              <option value="all" style={{ background: CP.surface }}>Tutte</option>
              <option value="overpaid" style={{ background: CP.surface }}>Sopra-pagati (HOC perde)</option>
              <option value="underpaid" style={{ background: CP.surface }}>Sotto-pagati (rischio churn)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Min sales $</label>
            <input type="number" value={minSales} onChange={(e) => setMinSales(parseInt(e.target.value) || 0)} style={{ ...input, width: 90 }} />
          </div>
          <div>
            <label style={lbl}>Min turni</label>
            <input type="number" value={minShifts} onChange={(e) => setMinShifts(parseInt(e.target.value) || 1)} style={{ ...input, width: 70 }} />
          </div>
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <label style={lbl}>Filtra per creator</label>
            <input
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              placeholder="nome creator…"
              style={{ ...input, paddingRight: creatorFilter ? 30 : 12, width: "100%" }}
              list="creators-list"
            />
            <datalist id="creators-list">{allCreators.map((c) => <option key={c} value={c} />)}</datalist>
            {creatorFilter && (
              <button onClick={() => setCreatorFilter("")} title="Rimuovi filtro" style={clearBtn}>
                <X size={12} />
              </button>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <label style={lbl}>Filtra per operatore</label>
            <input
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              placeholder="nome operatore…"
              style={{ ...input, paddingRight: operatorFilter ? 30 : 12, width: "100%" }}
            />
            {operatorFilter && (
              <button onClick={() => setOperatorFilter("")} title="Rimuovi filtro" style={clearBtn}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, fontSize: 13 }}>Errore: {String(error?.message || error)}</div>
        </CpCard>
      )}

      {isLoading && (
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: CP.textSecondary }}>
            <Loader2 size={16} className="animate-spin" /> Calcolo anomalie su tutti i creator…
          </div>
        </CpCard>
      )}

      {data?.summary && (
        <>
          {/* Stat header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Coppie analizzate" value={`${data.creators_analyzed} × ${data.operators_analyzed}`} sub="creator × operatori" />
            <StatCard label="Anomalie totali" value={data.summary.total_anomalies} color={data.summary.total_anomalies > 0 ? "#F59E0B" : null} />
            <StatCard label="RIVEDIBILI" value={data.summary.review_count} color="#F59E0B" />
            <StatCard label="FUORI SCALA" value={data.summary.out_of_scale_count} color={CP.accentRed} />
            <StatCard label="Sopra-pagati" value={data.summary.overpaid_count} sub={`+${fmtCurrency(data.summary.total_overpaid_impact_usd)} HOC perde`} color="#D44545" />
            <StatCard label="Sotto-pagati" value={data.summary.underpaid_count} sub={`${fmtCurrency(data.summary.total_underpaid_impact_usd)} ad operatori`} color="#4F8CCB" />
          </div>

          {/* Net impact */}
          <CpCard padding="14px 20px" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                <b>Impatto netto stimato</b> sul mese {periodId}:
                <span style={{ marginLeft: 8, color: data.summary.net_impact_usd > 0 ? "#D44545" : CP.accentGreen, fontWeight: 700, fontFamily: FONTS.mono }}>
                  {data.summary.net_impact_usd > 0 ? "+" : ""}{fmtCurrency(data.summary.net_impact_usd)}
                </span>
                <span style={{ marginLeft: 6, fontSize: 11, color: CP.textMuted }}>
                  ({data.summary.net_impact_usd > 0 ? "HOC sta pagando di più della media" : "HOC sta sotto la media — possibili risparmi a rischio churn"})
                </span>
              </div>
              <div style={{ fontSize: 11, color: CP.textMuted }}>
                Mostrate {filteredAnomalies.length} su {data.anomalies.length} anomalie
              </div>
            </div>
          </CpCard>

          {/* Top creator con più anomalie */}
          {data.summary.top_creators_with_anomalies?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <CpCard padding="14px 18px">
                <SectionLabel style={{ display: "block", marginBottom: 10 }}>Creator con più anomalie</SectionLabel>
                {data.summary.top_creators_with_anomalies.map((c) => (
                  <div key={c.creator} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                    <button onClick={() => setCreatorFilter(c.creator)} style={chipBtn}>{c.creator}</button>
                    <span style={{ fontFamily: FONTS.mono, color: CP.textMuted }}>{c.count}</span>
                  </div>
                ))}
              </CpCard>
              <CpCard padding="14px 18px">
                <SectionLabel style={{ display: "block", marginBottom: 10 }}>Operatori con più anomalie</SectionLabel>
                {data.summary.top_operators_with_anomalies.map((o) => (
                  <div key={o.operator} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                    <button onClick={() => setOperatorFilter(o.operator)} style={chipBtn}>{o.operator}</button>
                    <span style={{ fontFamily: FONTS.mono, color: CP.textMuted }}>{o.count}</span>
                  </div>
                ))}
              </CpCard>
            </div>
          )}

          {/* Tabella anomalie */}
          <SectionLabel style={{ display: "block", marginBottom: 10 }}>Anomalie ordinate per $ a rischio (impatto vs team avg)</SectionLabel>
          <CpCard padding="0" style={{ overflow: "hidden", marginBottom: 20 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <Th>#</Th>
                    <Th>Creator</Th>
                    <Th>Operatore</Th>
                    <Th align="right">Turni</Th>
                    <Th align="right">Sales $</Th>
                    <Th align="right">Guadagno</Th>
                    <Th align="right">% effettiva</Th>
                    <Th align="right">Team avg %</Th>
                    <Th align="right">Δ vs team</Th>
                    <Th align="right">Impact $</Th>
                    <Th>Direzione</Th>
                    <Th>Mix scaglioni</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.length === 0 && (
                    <tr><td colSpan={13} style={{ padding: "30px 16px", textAlign: "center", color: CP.textMuted, fontStyle: "italic" }}>
                      Nessuna anomalia trovata con questi filtri.
                    </td></tr>
                  )}
                  {filteredAnomalies.map((a, i) => <AnomalyRow key={`${a.creator_alias}-${a.operator}`} a={a} rank={i + 1} periodId={periodId} />)}
                </tbody>
              </table>
            </div>
          </CpCard>
        </>
      )}
    </div>
  );
}

function AnomalyRow({ a, rank, periodId }) {
  const [expanded, setExpanded] = useState(false);
  const verdictColor = a.verdict === "OUT_OF_SCALE" ? CP.accentRed : "#F59E0B";
  const dirColor = a.direction === "overpaid" ? "#D44545" : "#4F8CCB";
  const DirIcon = a.direction === "overpaid" ? TrendingUp : TrendingDown;
  return (
    <>
      <tr style={{ borderBottom: expanded ? "none" : `1px solid ${CP.border}`, cursor: "pointer", background: expanded ? CP.surfaceAlt : "transparent" }} onClick={() => setExpanded((v) => !v)}>
        <Td><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONTS.mono, color: CP.textMuted, fontSize: 11 }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {String(rank).padStart(2, "0")}
        </span></Td>
        <Td><div style={{ fontWeight: 500 }}>{a.creator_alias}</div></Td>
        <Td><div>{a.operator}</div></Td>
        <Td align="right" mono>{a.shifts.toFixed(1)}</Td>
        <Td align="right" mono><span style={{ color: CP.accentGreen, fontWeight: 600 }}>{fmtCurrency(a.sales)}</span></Td>
        <Td align="right" mono><span style={{ color: "#D4AF7A" }}>{fmtCurrency(a.earnings)}</span></Td>
        <Td align="right" mono><b>{fmtPct(a.effective_pct)}</b></Td>
        <Td align="right" mono style={{ color: CP.textMuted }}>{fmtPct(a.team_avg_pct)}</Td>
        <Td align="right" mono>
          <span style={{ color: dirColor, fontWeight: 700 }}>
            {a.delta_pct > 0 ? "+" : ""}{(a.delta_pct * 100).toFixed(0)}%
          </span>
        </Td>
        <Td align="right" mono>
          <span style={{ color: dirColor, fontWeight: 700 }}>
            {a.impact_usd > 0 ? "+" : ""}{fmtCurrency(a.impact_usd)}
          </span>
        </Td>
        <Td>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: dirColor + "22", color: dirColor, fontSize: 11, fontWeight: 700 }}>
            <DirIcon size={11} /> {a.direction === "overpaid" ? "Sopra" : "Sotto"}
          </span>
          <div style={{ marginTop: 3, fontSize: 9, color: verdictColor, fontWeight: 700 }}>{a.verdict === "OUT_OF_SCALE" ? "FUORI SCALA" : "RIVEDIBILE"}</div>
        </Td>
        <Td><InlinePctDist dist={a.pct_distribution} /></Td>
        <Td>
          <Link
            href={`/admin/comp-exam?creator=${encodeURIComponent(a.creator_alias)}&months=1`}
            onClick={(e) => e.stopPropagation()}
            title="Drill-down dettaglio creator completo"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 5, color: CP.accentGreen, fontSize: 11, fontWeight: 600, textDecoration: "none" }}
          >
            Drill <ArrowRight size={11} />
          </Link>
        </Td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: `1px solid ${CP.border}`, background: CP.surfaceAlt }}>
          <td colSpan={13} style={{ padding: "0 16px 16px 16px" }}>
            <ShiftBreakdown creator={a.creator_alias} operator={a.operator} periodId={periodId} expectedSales={a.sales} expectedEarnings={a.earnings} />
          </td>
        </tr>
      )}
    </>
  );
}

function ShiftBreakdown({ creator, operator, periodId, expectedSales, expectedEarnings }) {
  const { data, error, isLoading } = useSWR(
    `/api/admin/op-shifts?creator=${encodeURIComponent(creator)}&operator=${encodeURIComponent(operator)}&period_id=${periodId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <div style={{ padding: 12, color: CP.textMuted, fontSize: 12 }}><Loader2 size={12} className="animate-spin" style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Carico shift…</div>;
  if (error || data?.error) return <div style={{ padding: 12, color: CP.accentRed, fontSize: 12 }}>Errore: {data?.error || String(error)}</div>;
  if (!data?.shifts || data.shifts.length === 0) return <div style={{ padding: 12, color: CP.textMuted, fontSize: 12, fontStyle: "italic" }}>Nessun shift trovato per questa coppia (mapping operatore?).</div>;

  const totals = data.totals;
  // Verifica integrità: i totali del breakdown devono matchare i totali dell'anomaly
  const salesMatch = Math.abs(totals.sales - expectedSales) / Math.max(expectedSales, 1) < 0.05;
  const earnMatch = Math.abs(totals.earnings - expectedEarnings) / Math.max(expectedEarnings, 1) < 0.05;

  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, padding: 14, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: CP.textSecondary }}>
          <b>Breakdown shift-by-shift</b> · {data.shifts.length} turni · totale sales <b style={{ color: CP.accentGreen }}>{fmtCurrency(totals.sales)}</b> · totale guadagno <b style={{ color: "#D4AF7A" }}>{fmtCurrency(totals.earnings)}</b> · % media <b>{fmtPct(totals.overall_pct)}</b>
        </div>
        <div style={{ fontSize: 10, fontFamily: FONTS.mono, color: salesMatch && earnMatch ? CP.accentGreen : "#F59E0B" }}>
          {salesMatch && earnMatch
            ? "✓ Totali allineati con la tabella"
            : `⚠ Disallineamento — atteso: $${expectedSales} sales / $${expectedEarnings} guadagno`}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${CP.border}`, color: CP.textMuted }}>
              <th style={{ padding: "6px 8px", textAlign: "left", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Data</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Orario</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Fascia</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Sales tot turno</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Sales su creator</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Guadagno</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>%</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontFamily: FONTS.mono, fontSize: 9, textTransform: "uppercase" }}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data.shifts.map((s, i) => {
              const dt = new Date(s.started_at);
              const dtEnd = new Date(s.ended_at);
              const fmtTime = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
              const fmtDate = (d) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", weekday: "short" });
              return (
                <tr key={s.shift_id || i} style={{ borderBottom: `1px solid ${CP.border}88`, color: CP.textPrimary }}>
                  <td style={{ padding: "6px 8px", fontFamily: FONTS.mono }}>{fmtDate(dt)}</td>
                  <td style={{ padding: "6px 8px", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtTime(dt)}–{fmtTime(dtEnd)}</td>
                  <td style={{ padding: "6px 8px", color: CP.textSecondary }}>{s.interval || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, color: CP.textMuted }}>{fmtCurrency(s.total_shift_sales)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmtCurrency(s.sales_on_creator)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, color: "#D4AF7A", fontWeight: 600 }}>{fmtCurrency(s.earnings_on_creator)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: FONTS.mono, fontWeight: 700 }}>{fmtPct(s.pct_on_creator)}</td>
                  <td style={{ padding: "6px 8px", fontSize: 9 }}>
                    {s.multi_creator ? (
                      <span title={`Multi creator: ${s.all_creators_in_shift.join(", ")}`} style={{ color: s.exact_attribution ? "#D4AF7A" : "#F59E0B" }}>
                        {s.exact_attribution ? `SPLIT esatto (takes)` : `SPLIT 50/50`}
                      </span>
                    ) : (
                      <span style={{ color: CP.accentGreen }}>MONO</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, padding: "8px 10px", background: CP.bg, borderRadius: 6, fontSize: 11, color: CP.textMuted, lineHeight: 1.6 }}>
        🔍 <b>Verifica manuale</b>: apri CP → Timeline → <b>{creator}</b> a {periodId} → cerca gli shift di <b>{operator}</b> e confronta date/orari/sales. Per turni MONO il sales/% sono diretti. Per turni SPLIT il sales è proporzionale ai takes per creator (se "SPLIT esatto") o 50/50 (fallback).
      </div>
    </div>
  );
}

function InlinePctDist({ dist }) {
  if (!dist || Object.keys(dist).length === 0) return <span style={{ color: CP.textMuted, fontSize: 10 }}>—</span>;
  const entries = Object.entries(dist).sort(([a], [b]) => parseFloat(a) - parseFloat(b));
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const colorFor = (b) => {
    const v = parseFloat(b);
    if (v < 0.09) return "#D44545";
    if (v < 0.11) return "#F59E0B";
    if (v < 0.13) return "#D4AF7A";
    return "#3FB97E";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 90 }}>
      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: CP.surfaceAlt }}>
        {entries.map(([b, c]) => (
          <div key={b} title={`${c}× al ${(parseFloat(b) * 100).toFixed(1)}%`} style={{ width: `${(c / total) * 100}%`, background: colorFor(b) }} />
        ))}
      </div>
      <div style={{ fontSize: 9, fontFamily: FONTS.mono, color: CP.textSecondary, lineHeight: 1.3 }}>
        {entries.map(([b, c]) => (
          <span key={b} style={{ color: colorFor(b), marginRight: 4 }}>{c}×{(parseFloat(b) * 100).toFixed(0)}%</span>
        ))}
      </div>
    </div>
  );
}

function Th({ children, align }) {
  return <th style={{ padding: "11px 12px", textAlign: align || "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children, align, mono, style }) {
  return <td style={{ padding: "10px 12px", textAlign: align || "left", fontFamily: mono ? FONTS.mono : FONTS.body, verticalAlign: "middle", ...style }}>{children}</td>;
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const chipBtn = { background: "transparent", border: "none", color: CP.textPrimary, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left", fontFamily: FONTS.body, textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: CP.border };
const clearBtn = { position: "absolute", right: 8, top: 28, padding: 3, background: CP.surfaceAlt, border: "none", borderRadius: 3, color: CP.textMuted, cursor: "pointer", display: "flex", alignItems: "center" };
