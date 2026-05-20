"use client";

import { useState, use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545",
  Weak: "#E76F51",
  Average: "#B89158",
  Good: "#D4AF7A",
  Strong: "#3FB97E",
  Elite: "#4F8CCB",
};

const LANGUAGE_COLORS = { ita: "#3FB97E", eng: "#4F8CCB" };

function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtPct(v, dec = 2) {
  if (v == null) return "—";
  return (v * 100).toFixed(dec) + "%";
}
function fmtNum(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function fmtTenure(months) {
  if (months == null) return "—";
  if (months < 1) return "< 1 mese";
  if (months < 12) return `${Math.round(months)} mes${Math.round(months) === 1 ? "e" : "i"}`;
  const years = Math.floor(months / 12);
  const rem = Math.round(months - years * 12);
  if (rem === 0) return `${years} ann${years === 1 ? "o" : "i"}`;
  return `${years}a ${rem}m`;
}
function formatPeriodLabel(periodId, periodType) {
  if (periodType === "monthly") {
    const m = periodId.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const names = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
      return `${names[parseInt(m[2]) - 1]} ${m[1]}`;
    }
  }
  return periodId;
}

function Delta({ value, suffix = "", small = false }) {
  if (value == null || value === 0) {
    return <span style={{ color: COLORS.mist, fontSize: small ? 10 : 11 }}>—</span>;
  }
  const positive = value > 0;
  const color = positive ? "#3FB97E" : "#E76F51";
  return (
    <span style={{ color, fontWeight: 600, fontSize: small ? 10 : 11, fontFamily: FONTS.mono }}>
      {positive ? "↑ +" : "↓ "}{Math.abs(value).toFixed(suffix === "%" ? 2 : 1)}{suffix}
    </span>
  );
}

function ScoreSpark({ history }) {
  if (!history?.length) return null;
  const max = 100;
  const w = 100 / Math.max(1, history.length - 1);
  const points = history.map((h, i) => {
    const y = h.score != null ? 100 - h.score : 50;
    return `${(i * w).toFixed(2)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 60, display: "block" }}>
      <polyline
        fill="none"
        stroke={COLORS.champagne}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        points={points.join(" ")}
      />
      {history.map((h, i) => {
        if (h.score == null) return null;
        const cx = i * w;
        const cy = 100 - h.score;
        const color = TIER_COLORS[h.tier] || COLORS.champagne;
        return <circle key={i} cx={cx} cy={cy} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export default function EmployeeDrilldownPage({ params }) {
  // Next 15 unwrap params via use(); funziona anche in Next 14 perché use() è polyfilled
  const resolved = typeof params?.then === "function" ? use(params) : params;
  const employee = decodeURIComponent(resolved.employee || "");
  const [periodType, setPeriodType] = useState("monthly");

  const { data, error, isLoading } = useSWR(
    employee ? `/api/leaderboard/employee-history?employee=${encodeURIComponent(employee)}&period_type=${periodType}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const history = data?.history || [];
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  const tierColor = current?.tier ? TIER_COLORS[current.tier] : COLORS.champagne;
  const langColor = current?.language ? LANGUAGE_COLORS[current.language] : COLORS.mist;

  const deltaScore = current?.score != null && previous?.score != null ? Math.round((current.score - previous.score) * 10) / 10 : null;
  const deltaSales = current?.sales != null && previous?.sales != null ? current.sales - previous.sales : null;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <Link href="/leaderboard/operational" style={{ color: COLORS.fog, fontSize: 13, textDecoration: "none" }}>← Leaderboard Operativa</Link>
          <Link href="/admin/employee-profiles" style={{ color: COLORS.champagne, fontSize: 12, textDecoration: "none", marginLeft: "auto", padding: "4px 10px", border: `1px solid ${COLORS.champagne}44`, borderRadius: 6 }}>⚙️ Gestione anagrafica</Link>
        </div>

        {isLoading && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore di rete: {String(error)}</p>}
        {data?.error && (
          <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>
            {data.error}
          </div>
        )}

        {data && !data.error && (
          <>
            {/* PLAYER CARD */}
            <div style={{
              background: `linear-gradient(135deg, ${tierColor}1F 0%, ${COLORS.graphite}99 60%)`,
              border: `1px solid ${tierColor}55`,
              borderRadius: 20, padding: "28px 32px", marginBottom: 22,
              display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 28, alignItems: "center",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(circle 360px at 100% 50%, ${tierColor}30, transparent 70%)`,
                pointerEvents: "none",
              }} />
              <div style={{
                width: 110, height: 110, borderRadius: "50%",
                background: `linear-gradient(135deg, ${COLORS.champagne} 0%, ${COLORS.charcoal} 100%)`,
                color: COLORS.obsidian,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: FONTS.display, fontWeight: 600, fontSize: 40,
                border: `3px solid ${COLORS.graphite}`,
                boxShadow: `0 0 0 3px ${COLORS.champagne}, 0 8px 24px rgba(212,175,122,0.3)`,
                position: "relative",
              }}>{getInitials(employee)}</div>

              <div style={{ position: "relative" }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 6 }}>{employee}</div>
                {current && (
                  <div style={{ color: COLORS.champagne, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
                    {current.group}
                    {current.language && (
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: 4,
                        fontSize: 9, fontWeight: 700, marginLeft: 8,
                        background: langColor + "20", color: langColor, border: `1px solid ${langColor}55`,
                        fontFamily: FONTS.mono,
                      }}>{current.language === "eng" ? "EN" : "IT"}</span>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tempo in agency</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, marginTop: 2 }}>
                      {fmtTenure(data.tenure_months)}
                      {data.tenure_inferred && <span style={{ color: COLORS.mist, marginLeft: 6, fontSize: 11, fontFamily: FONTS.body }}>(stima)</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" }}>LTV {periodType === "monthly" ? "mensile" : periodType}</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, marginTop: 2, color: "#3FB97E" }}>{fmtCurrency(data.ltv?.ltv_eur)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" }}>Purch totali</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, marginTop: 2 }}>{fmtNum(data.ltv?.total_purch)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" }}>Periodi attivi</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, marginTop: 2 }}>{data.ltv?.periods_count ?? 0}</div>
                  </div>
                </div>
                {data.profile?.note && (
                  <div style={{ marginTop: 12, padding: "8px 12px", background: COLORS.charcoal, borderRadius: 8, fontSize: 12, color: COLORS.fog, fontStyle: "italic" }}>
                    "{data.profile.note}"
                  </div>
                )}
              </div>

              <div style={{ textAlign: "right", position: "relative" }}>
                <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 2 }}>Score corrente</div>
                <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 64, lineHeight: 1, color: tierColor }}>
                  {current?.score != null ? current.score.toFixed(1) : "—"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Delta value={deltaScore} suffix=" pt" />
                  {current?.rank && <span style={{ marginLeft: 12, fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 12 }}>#{current.rank}</span>}
                </div>
              </div>
            </div>

            {/* PERIOD TYPE TOGGLE */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {["monthly", "weekly", "quarterly"].map((pt) => (
                <button
                  key={pt}
                  onClick={() => setPeriodType(pt)}
                  style={{
                    padding: "7px 14px",
                    background: periodType === pt ? COLORS.champagne : COLORS.graphite,
                    color: periodType === pt ? COLORS.obsidian : COLORS.alabaster,
                    border: `1px solid ${periodType === pt ? COLORS.champagne : COLORS.charcoal}`,
                    borderRadius: 999,
                    fontSize: 12, cursor: "pointer", fontWeight: periodType === pt ? 600 : 500,
                    fontFamily: FONTS.body,
                  }}
                >
                  {pt === "monthly" ? "Mensile" : pt === "weekly" ? "Settimanale" : "Trimestrale"}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 11, color: COLORS.mist, alignSelf: "center" }}>
                {history.length} periodi disponibili
              </span>
            </div>

            {/* TREND CARD */}
            {history.length >= 2 && (
              <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
                <div style={{ fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
                  📈 Trend score (0-100)
                </div>
                <ScoreSpark history={history} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: COLORS.mist, fontFamily: FONTS.mono }}>
                  <span>{formatPeriodLabel(history[0]?.period_id, periodType)}</span>
                  <span>{formatPeriodLabel(history[history.length - 1]?.period_id, periodType)}</span>
                </div>
              </div>
            )}

            {/* HISTORY TABLE */}
            <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
              <div style={{
                padding: "14px 20px",
                background: COLORS.obsidian + "80",
                fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em",
                borderBottom: `1px solid ${COLORS.charcoal}`,
              }}>
                📅 Storico completo
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Periodo", "Score", "Δ", "Tier", "Rank", "Sales", "Purch", "Fan CVR", "Group"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.charcoal}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((row, i, arr) => {
                    const prev = arr[i + 1];
                    const dScore = prev?.score != null && row.score != null ? Math.round((row.score - prev.score) * 10) / 10 : null;
                    const tColor = TIER_COLORS[row.tier] || COLORS.mist;
                    return (
                      <tr key={row.period_id}>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{formatPeriodLabel(row.period_id, periodType)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, fontWeight: 700, color: tColor, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{row.score != null ? row.score.toFixed(1) : "—"}</td>
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.charcoal}88` }}><Delta value={dScore} suffix=" pt" small /></td>
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.charcoal}88` }}>
                          {row.tier && (
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: tColor + "26", color: tColor, border: `1px solid ${tColor}55` }}>{row.tier}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, color: COLORS.fog, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{row.rank ? `#${row.rank}` : "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{fmtCurrency(row.sales)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{fmtNum(row.ppvs_unlocked)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, color: COLORS.fog, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{fmtPct(row.fan_cvr)}</td>
                        <td style={{ padding: "10px 14px", color: COLORS.mist, fontSize: 11, borderBottom: `1px solid ${COLORS.charcoal}88` }}>{row.group}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {history.length === 0 && (
              <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 32, textAlign: "center", color: COLORS.fog }}>
                Nessuno storico {periodType} disponibile per {employee}.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
