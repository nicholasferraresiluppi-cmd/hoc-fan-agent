"use client";

import { use, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};

function fmtCurrency(v) { if (v == null) return "—"; return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function fmtNum(v) { if (v == null) return "—"; return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }); }
function fmtPct(v) { if (v == null) return "—"; return v.toFixed(1).replace(".", ",") + "%"; }
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CreatorDrilldownPage({ params, searchParams }) {
  const resolvedParams = typeof params?.then === "function" ? use(params) : params;
  const resolvedSearch = typeof searchParams?.then === "function" ? use(searchParams) : searchParams;
  let alias = "";
  try { alias = decodeURIComponent(resolvedParams.alias || ""); } catch { alias = resolvedParams.alias || ""; }
  const periodId = resolvedSearch?.period_id || currentMonthId();

  const url = `/api/leaderboard/creators/${encodeURIComponent(alias)}?period_id=${periodId}`;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });

  const creator = data?.creator;
  const operators = data?.operators || [];
  const heroOp = operators[0];

  // Bar fasce orarie (aggregato creator)
  const intervalSales = creator?.interval_sales || {};
  const intervalMax = Math.max(...Object.values(intervalSales), 1);
  const totalIntervalSales = Object.values(intervalSales).reduce((a, b) => a + b, 0);

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1400, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "20px 24px", marginBottom: 18 },
    statRow: { display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.charcoal}88` },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <Link href={`/leaderboard/creators?period_id=${periodId}`} style={styles.backLink}>← Leaderboard Creator</Link>
        </div>

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{data.error}</div>}

        {data && !data.error && creator && (
          <>
            {/* HERO CREATOR */}
            <div style={{ ...styles.card, background: `linear-gradient(135deg, ${COLORS.champagne}1F 0%, ${COLORS.graphite}99 60%)`, borderColor: `${COLORS.champagne}55` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <div style={{
                  width: 90, height: 90, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${COLORS.champagne} 0%, ${COLORS.charcoal} 100%)`,
                  color: COLORS.obsidian, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: FONTS.display, fontWeight: 600, fontSize: 32,
                  border: `3px solid ${COLORS.graphite}`, boxShadow: `0 0 0 2px ${COLORS.champagne}`,
                }}>{getInitials(creator.alias)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 32, fontWeight: 500, marginBottom: 6 }}>{creator.alias}</div>
                  <div style={{ color: COLORS.champagne, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Creator · {periodId}</div>
                  <div style={styles.statRow}>
                    <Stat l="Sales totale" v={fmtCurrency(creator.total_sales)} color="#3FB97E" />
                    <Stat l="Shift" v={fmtNum(creator.total_shifts)} />
                    <Stat l="Ore lavorate" v={`${fmtNum(creator.total_hours)}h`} />
                    <Stat l="Operatori" v={creator.operators_count} />
                    <Stat l="Avg $/shift" v={fmtCurrency(creator.avg_sales_per_shift)} />
                    <Stat l="Avg $/operatore" v={fmtCurrency(creator.avg_sales_per_operator)} />
                  </div>
                </div>
              </div>
            </div>

            {/* FASCE ORARIE */}
            {totalIntervalSales > 0 && (
              <div style={styles.card}>
                <div style={{ fontSize: 11, color: "#3FB97E", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>🕐 Sales per fascia oraria (aggregato creator)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                  {["Morning","Afternoon","Evening","Night","After"].map((b) => {
                    const sales = intervalSales[b] || 0;
                    const pct = totalIntervalSales > 0 ? (sales / totalIntervalSales) * 100 : 0;
                    const heightPct = (sales / intervalMax) * 100;
                    return (
                      <div key={b} style={{ textAlign: "center" }}>
                        <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 6 }}>
                          <div style={{ width: 36, height: `${heightPct}%`, background: "#3FB97E", borderRadius: "3px 3px 0 0", minHeight: 3, opacity: 0.85 }} />
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.08em" }}>{b}</div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.alabaster, marginTop: 2 }}>{fmtCurrency(sales)}</div>
                        <div style={{ fontSize: 10, color: COLORS.mist, marginTop: 1 }}>{pct.toFixed(1).replace(".", ",")}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OPERATORI CHE LAVORANO SU QUESTA CREATOR */}
            <div style={styles.card}>
              <div style={{ fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>👥 Team su {creator.alias} ({operators.length} operatori)</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Operatore</th>
                    <th style={styles.th}>Sales</th>
                    <th style={styles.th}>% sul totale</th>
                    <th style={styles.th} title="Shift attribuiti: mono = solo questa creator, split = lavoro contemporaneo su più creator (stima 50/50)">Shift</th>
                    <th style={styles.th}>$/Shift</th>
                    <th style={styles.th}>$/h</th>
                    <th style={styles.th} title="Score relativo: 100 = media creator. >130 Elite, <70 Critical. '—' se <3 shift (poco affidabile)">Score rel</th>
                    <th style={styles.th}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op) => {
                    const tColor = op.low_confidence ? COLORS.mist : (TIER_COLORS[op.tier] || COLORS.mist);
                    const splitMostly = op.split_pct >= 50;
                    return (
                      <tr key={op.employee} style={{ opacity: op.low_confidence ? 0.7 : 1 }}>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog }}>{String(op.rank).padStart(2, "0")}</td>
                        <td style={{ ...styles.td, fontWeight: 600 }}>
                          <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>
                            {op.employee} <span style={{ color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span>
                          </Link>
                          {splitMostly && (
                            <span title={`${op.split_pct}% dei suoi shift sono multi-creator (split equo con altre). Dato CP stimato, non esatto.`}
                                  style={{ marginLeft: 6, padding: "1px 5px", fontSize: 9, fontFamily: FONTS.mono, fontWeight: 600, background: "#E76F5126", color: "#E76F51", border: "1px solid #E76F5155", borderRadius: 3 }}>
                              ⚖️ {op.split_pct}% SPLIT
                            </span>
                          )}
                        </td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono, color: "#3FB97E", fontWeight: 600 }}>{fmtCurrency(op.sales)}</td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog }}>{fmtPct(op.sales_share_pct)}</td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog }} title={`${op.shift_mono_count} mono + ${op.shift_split_count} split = ${op.shift_mono_count + op.shift_split_count} eventi shift totali`}>
                          {fmtNum(op.shifts)}
                          <span style={{ fontSize: 10, color: COLORS.mist, marginLeft: 4 }}>
                            ({op.shift_mono_count}m+{op.shift_split_count}s)
                          </span>
                        </td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{fmtCurrency(op.sales_per_shift)}</td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{fmtCurrency(op.sales_per_hour)}</td>
                        <td style={{ ...styles.td, fontFamily: FONTS.mono, fontWeight: 700, color: tColor }} title={op.low_confidence ? `Pochi shift totali (${op.shift_mono_count + op.shift_split_count}) — score non affidabile` : ""}>
                          {op.low_confidence ? "—" : op.score}
                        </td>
                        <td style={styles.td}>
                          {op.low_confidence ? (
                            <span style={{ fontSize: 10, color: COLORS.mist, fontStyle: "italic" }}>pochi shift</span>
                          ) : (
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: tColor + "26", color: tColor, border: `1px solid ${tColor}55` }}>{op.tier}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 12 }}>
                💡 <b>Mono</b>=shift su questa creator soltanto, <b>Split</b>=shift contemporaneo su più creator (dato stimato 50/50). Operatori con &lt;3 shift hanno score &quot;—&quot; perché statisticamente poco affidabili.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ l, v, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" }}>{l}</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 18, fontWeight: 600, marginTop: 2, color: color || COLORS.alabaster }}>{v}</div>
    </div>
  );
}
