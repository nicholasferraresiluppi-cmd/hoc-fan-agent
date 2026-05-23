"use client";

import { use, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { SectionLabel, StatCard, MiniInsight, CpCard, CreatorDot, TrendPill } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#EF4444", Weak: "#F59E0B", Average: "#9CA3AF",
  Good: "#10B981", Strong: "#3B82F6", Elite: "#A855F7",
};

function fmtCurrency(v) { if (v == null) return "—"; return "$ " + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function fmtCurrencyShort(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return "$ " + (n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "k";
  return "$ " + n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
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
  const reliableOps = operators.filter((o) => !o.low_confidence);
  const heroOp = reliableOps[0] || operators[0];
  const worstOp = reliableOps[reliableOps.length - 1];

  // Bar fasce orarie (aggregato creator)
  const intervalSales = creator?.interval_sales || {};
  const intervalMax = Math.max(...Object.values(intervalSales), 1);
  const totalIntervalSales = Object.values(intervalSales).reduce((a, b) => a + b, 0);
  const topInterval = useMemo(() => {
    let best = null, max = 0;
    for (const [b, v] of Object.entries(intervalSales)) if (v > max) { max = v; best = b; }
    return best;
  }, [intervalSales]);

  const dotColor = creator ? creatorDotColor(creator.alias) : CP.textMuted;

  const styles = {
    page: { minHeight: "100vh", background: CP.bg, color: CP.textPrimary, fontFamily: FONTS.body, padding: "32px 28px" },
    container: { maxWidth: 1400, margin: "0 auto" },
    backLink: { color: CP.textSecondary, fontSize: 13, textDecoration: "none" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 13 }}>
          <Link href="/leaderboard" style={styles.backLink}>Ladder</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <Link href={`/leaderboard/creators?period_id=${periodId}`} style={styles.backLink}>Creator</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <span style={{ color: CP.textPrimary }}>{alias}</span>
        </div>

        {isLoading && !data && <p style={{ color: CP.textSecondary }}>Caricamento…</p>}
        {error && <p style={{ color: CP.accentRed }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: CP.accentRed + "20", color: CP.accentRed, padding: 16, borderRadius: 12 }}>{data.error}</div>}

        {data && !data.error && creator && (
          <>
            {/* HERO HEADER */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: `linear-gradient(135deg, ${dotColor} 0%, ${dotColor}66 100%)`,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: FONTS.display, fontWeight: 700, fontSize: 28,
                border: `2px solid ${CP.bg}`, boxShadow: `0 0 0 3px ${dotColor}44`, flexShrink: 0,
              }}>{getInitials(creator.alias)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <CreatorDot alias={creator.alias} size={14} />
                  <SectionLabel size={10}>Creator · {periodId}</SectionLabel>
                </div>
                <h1 style={{ fontFamily: FONTS.display, fontSize: 40, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>{creator.alias}</h1>
                <p style={{ color: CP.textSecondary, fontSize: 13, margin: "6px 0 0 0" }}>
                  {creator.operators_count} operatori · {fmtNum(creator.total_shifts)} shift · {fmtNum(creator.total_hours)}h totali
                </p>
              </div>
            </div>

            {/* STAT CARDS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Sales totale" value={fmtCurrencyShort(creator.total_sales)} color={CP.accentGreen} />
              <StatCard label="Shift" value={fmtNum(creator.total_shifts)} />
              <StatCard label="Ore lavorate" value={`${fmtNum(creator.total_hours)}h`} />
              <StatCard label="Operatori" value={creator.operators_count} />
              <StatCard label="Avg $ / shift" value={fmtCurrency(creator.avg_sales_per_shift)} />
              <StatCard label="Avg $ / operatore" value={fmtCurrencyShort(creator.avg_sales_per_operator)} />
            </div>

            {/* INSIGHTS ROW */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 24 }}>
              {heroOp && (
                <MiniInsight label="🏆 Best Operator" value={fmtCurrencyShort(heroOp.sales)} accent={CP.accentGreen}>
                  <Link href={`/leaderboard/operational/${encodeURIComponent(heroOp.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>
                    {heroOp.employee}
                  </Link>
                  <span style={{ color: CP.textMuted, fontSize: 12, marginLeft: 6, fontWeight: 400 }}>· score {heroOp.score}</span>
                </MiniInsight>
              )}
              {worstOp && worstOp !== heroOp && reliableOps.length >= 3 && (
                <MiniInsight label="⚠️ Da rivedere" value={fmtCurrencyShort(worstOp.sales)} accent={CP.accentRed}>
                  <Link href={`/leaderboard/operational/${encodeURIComponent(worstOp.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>
                    {worstOp.employee}
                  </Link>
                  <span style={{ color: CP.textMuted, fontSize: 12, marginLeft: 6, fontWeight: 400 }}>· score {worstOp.score}</span>
                </MiniInsight>
              )}
              {topInterval && (
                <MiniInsight label="🕐 Fascia top" value={fmtCurrencyShort(intervalSales[topInterval])} accent={dotColor}>
                  {topInterval}
                  <span style={{ color: CP.textMuted, fontSize: 12, marginLeft: 6, fontWeight: 400 }}>· {((intervalSales[topInterval] / totalIntervalSales) * 100).toFixed(0)}% del totale</span>
                </MiniInsight>
              )}
            </div>

            {/* FASCE ORARIE */}
            {totalIntervalSales > 0 && (
              <CpCard padding="22px 26px" style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 18 }}>
                  <SectionLabel>🕐 Performance per fascia oraria</SectionLabel>
                  <p style={{ fontSize: 12, color: CP.textMuted, margin: "4px 0 0 0" }}>Sales totali distribuite nelle fasce della giornata (UTC)</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
                  {["Morning","Afternoon","Evening","Night","After"].map((b) => {
                    const sales = intervalSales[b] || 0;
                    const pct = totalIntervalSales > 0 ? (sales / totalIntervalSales) * 100 : 0;
                    const heightPct = (sales / intervalMax) * 100;
                    const isTop = b === topInterval;
                    return (
                      <div key={b} style={{ textAlign: "center" }}>
                        <div style={{ height: 96, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 }}>
                          <div style={{ width: 44, height: `${heightPct}%`, background: isTop ? dotColor : CP.accentGreen, borderRadius: "6px 6px 0 0", minHeight: 3, opacity: isTop ? 1 : 0.7, transition: "all 0.2s" }} />
                        </div>
                        <div style={{ fontSize: 11, color: isTop ? CP.textPrimary : CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: isTop ? 700 : 500 }}>{b}</div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 14, color: CP.textPrimary, marginTop: 4, fontWeight: 600 }}>{fmtCurrencyShort(sales)}</div>
                        <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>{pct.toFixed(1).replace(".", ",")}%</div>
                      </div>
                    );
                  })}
                </div>
              </CpCard>
            )}

            {/* OPERATORI CHE LAVORANO SU QUESTA CREATOR */}
            <CpCard padding="0">
              <div style={{ padding: "20px 26px 14px 26px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <SectionLabel>👥 Team su {creator.alias}</SectionLabel>
                  <p style={{ fontSize: 12, color: CP.textMuted, margin: "4px 0 0 0" }}>{operators.length} operatori · score 100 = media creator</p>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: CP.textMuted, alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: CP.accentGreen }} />ESATTO
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: CP.accentRed }} />STIMA 50/50
                  </span>
                </div>
              </div>

              {/* Header tabella */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "40px 1.4fr 1fr 0.7fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr",
                gap: 12, padding: "10px 26px", borderTop: `1px solid ${CP.borderStrong}`, borderBottom: `1px solid ${CP.border}`,
              }}>
                <SectionLabel>#</SectionLabel>
                <SectionLabel>Operatore</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Sales</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>%</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }} title="Mono = solo questa creator · Esatti = attribuzione precisa da takes · Stime = split 50/50">Shift</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>$ / Shift</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>$ / h</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Score</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Tier</SectionLabel>
              </div>

              {operators.map((op) => {
                const tColor = op.low_confidence ? CP.textMuted : (TIER_COLORS[op.tier] || CP.textMuted);
                const totalEvents = (op.shift_mono_count || 0) + (op.shift_split_count || 0) + (op.shift_exact_count || 0);
                const hasExact = (op.shift_exact_count || 0) > 0;
                const hasEstimate = (op.shift_split_count || 0) > 0;
                const dotShift = hasEstimate ? CP.accentRed : (hasExact ? CP.accentGreen : CP.accentGreen);
                return (
                  <div key={op.employee} style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1.4fr 1fr 0.7fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 26px",
                    borderBottom: `1px solid ${CP.border}`,
                    opacity: op.low_confidence ? 0.6 : 1,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = CP.surfaceAlt}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textMuted, fontWeight: 500 }}>{String(op.rank).padStart(2, "0")}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {op.employee}
                      </Link>
                      {hasExact && hasEstimate === false && (op.shift_exact_count > 0) && (
                        <span title={`${op.shift_exact_count} shift multi-creator con attribuzione esatta (takes)`}
                              style={{ padding: "1px 6px", fontSize: 9, fontFamily: FONTS.mono, fontWeight: 700, background: CP.accentGreen + "22", color: CP.accentGreen, borderRadius: 3, letterSpacing: "0.04em" }}>
                          ✓ ESATTO
                        </span>
                      )}
                      {hasEstimate && op.split_pct >= 30 && (
                        <span title={`${op.split_pct}% degli shift sono multi-creator senza takes (stima 50/50)`}
                              style={{ padding: "1px 6px", fontSize: 9, fontFamily: FONTS.mono, fontWeight: 700, background: CP.accentRed + "22", color: CP.accentRed, borderRadius: 3, letterSpacing: "0.04em" }}>
                          ≈ {op.split_pct}% STIMA
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: CP.accentGreen, textAlign: "right" }}>{fmtCurrencyShort(op.sales)}</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, textAlign: "right" }}>{fmtPct(op.sales_share_pct)}</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}
                         title={`${op.shift_mono_count} mono + ${op.shift_exact_count} esatti + ${op.shift_split_count} stime = ${totalEvents} eventi totali`}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: dotShift }} />
                      <span>{fmtNum(op.shifts)}</span>
                      <span style={{ fontSize: 10, color: CP.textMuted }}>({op.shift_mono_count}m+{op.shift_exact_count}e+{op.shift_split_count}s)</span>
                    </div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary, textAlign: "right" }}>{fmtCurrency(op.sales_per_shift)}</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary, textAlign: "right" }}>{fmtCurrency(op.sales_per_hour)}</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: tColor, textAlign: "right" }}
                         title={op.low_confidence ? `Pochi shift (${totalEvents}) — score non affidabile` : ""}>
                      {op.low_confidence ? "—" : op.score}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {op.low_confidence ? (
                        <span style={{ fontSize: 10, color: CP.textMuted, fontStyle: "italic" }}>n/a</span>
                      ) : (
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: tColor + "22", color: tColor, letterSpacing: "0.04em", textTransform: "uppercase" }}>{op.tier}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              <div style={{ padding: "14px 26px", fontSize: 11, color: CP.textMuted, lineHeight: 1.5 }}>
                💡 <b>Shift</b>: m=mono (creator unica), e=esatti (multi-creator con takes precisi), s=stime (split 50/50 multi-creator). Operatori con &lt;3 shift hanno score &quot;—&quot; (campione troppo piccolo).
              </div>
            </CpCard>
          </>
        )}
      </div>
    </div>
  );
}
