"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const PERIOD_OPTIONS = [
  { value: "monthly", label: "Mensile" },
  { value: "weekly", label: "Settimanale" },
  { value: "quarterly", label: "Trimestrale" },
];

const TIER_COLORS = {
  Critical: "#D44545",
  Weak: "#E76F51",
  Average: "#B89158",
  Good: "#D4AF7A",
  Strong: "#3FB97E",
  Elite: "#4F8CCB",
};

function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Math.round(v).toLocaleString("it-IT");
}
function fmtPct(v) {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}
function fmtNum(v, dec = 0) {
  if (v == null) return "—";
  return v.toFixed(dec);
}

export default function OperationalLeaderboardPage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [periodId, setPeriodId] = useState("");
  const [clockIn, setClockIn] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");

  // Default mese corrente
  useEffect(() => {
    if (!periodId) {
      const now = new Date();
      if (periodType === "monthly") {
        setPeriodId(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      } else if (periodType === "weekly") {
        const d = new Date(now);
        const dayNum = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const ft = d.valueOf();
        d.setUTCMonth(0, 1);
        if (d.getUTCDay() !== 4) d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
        const w = 1 + Math.ceil((ft - d) / 604800000);
        setPeriodId(`${now.getFullYear()}-W${String(w).padStart(2, "0")}`);
      } else {
        const q = Math.floor(now.getMonth() / 3) + 1;
        setPeriodId(`${now.getFullYear()}-Q${q}`);
      }
    }
  }, [periodType]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period_type", periodType);
    p.set("period_id", periodId);
    p.set("clock_in", clockIn ? "yes" : "no");
    if (groupFilter) p.set("group", groupFilter);
    return p.toString();
  }, [periodType, periodId, clockIn, groupFilter]);

  const { data, error, isLoading } = useSWR(
    periodId ? `/api/leaderboard/operational?${queryString}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1400, margin: "0 auto" },
    title: { fontFamily: FONTS.display, fontSize: 30, margin: "0 0 6px 0" },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 20 },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 12 },
    filterBar: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" },
    select: { padding: "10px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 14, fontFamily: FONTS.body, minWidth: 130 },
    input: { padding: "10px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 14, fontFamily: FONTS.body, minWidth: 140 },
    toggleLabel: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: COLORS.alabaster },
    statBar: { display: "flex", gap: 18, fontSize: 13, color: COLORS.fog, marginBottom: 14 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: COLORS.graphite, borderRadius: 12, overflow: "hidden" },
    th: { textAlign: "left", padding: "12px 14px", color: COLORS.fog, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}`, whiteSpace: "nowrap" },
    td: { padding: "10px 14px", borderBottom: `1px solid ${COLORS.charcoal}`, whiteSpace: "nowrap" },
    rankCell: { fontFamily: FONTS.mono, color: COLORS.fog, width: 40 },
    tierBadge: { display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 },
    scoreCell: { fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14 },
  };

  const ranking = data?.ranking || [];

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href="/leaderboard" style={styles.backLink}>← Leaderboard Training</Link>
        <h1 style={styles.title}>Leaderboard Operativa</h1>
        <p style={styles.sub}>
          Performance reale del team su Infloww. Score 0-100 calcolato sui KPI di efficienza
          (Fan CVR, Unlock rate, Avg earnings/fan paying, ecc.) confrontati con la media del
          proprio Group (team modella). I volumi totali (Sales, PPV count) sono informativi
          ma non entrano nello Score. Account "Mass" esclusi automaticamente.
        </p>

        <div style={styles.filterBar}>
          <select value={periodType} onChange={(e) => { setPeriodType(e.target.value); setPeriodId(""); }} style={styles.select}>
            {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={styles.input} placeholder={periodType === "monthly" ? "2026-02" : periodType === "weekly" ? "2026-W05" : "2026-Q1"} />
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={clockIn} onChange={(e) => setClockIn(e.target.checked)} />
            Includi KPI clock-in
          </label>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={styles.select}>
            <option value="">Tutti i Group</option>
            {data?.groups?.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {data && !data.error && (
          <div style={styles.statBar}>
            <span><b style={{ color: COLORS.alabaster }}>{data.total}</b> operatori</span>
            <span><b style={{ color: COLORS.alabaster }}>{data.mass_excluded}</b> account mass esclusi</span>
            <span>Periodo: <b style={{ color: COLORS.alabaster }}>{data.period_type} / {data.period_id}</b></span>
            <span>Modalità: <b style={{ color: COLORS.alabaster }}>{data.clock_in_mode ? "with clock-in" : "no clock-in"}</b></span>
          </div>
        )}

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore di rete: {String(error)}</p>}
        {data?.error && (
          <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12, marginBottom: 14 }}>
            {data.error}
            {" "}
            <Link href="/admin/leaderboard-import" style={{ color: COLORS.champagne, marginLeft: 6 }}>
              Importa CSV →
            </Link>
          </div>
        )}

        {ranking.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Operatore</th>
                  <th style={styles.th}>Group</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}>Tier</th>
                  <th style={styles.th}>Fan CVR</th>
                  <th style={styles.th}>Unlock</th>
                  <th style={styles.th}>$ / paying fan</th>
                  <th style={styles.th}>Golden</th>
                  <th style={styles.th}>Sales</th>
                  <th style={styles.th}>PPV venduti</th>
                  <th style={styles.th}>Fan</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const tierColor = TIER_COLORS[r.tier] || COLORS.mist;
                  const isMass = r.is_mass;
                  return (
                    <tr key={`${r.employee}-${r.group}-${i}`} style={{ opacity: isMass ? 0.5 : 1 }}>
                      <td style={{ ...styles.td, ...styles.rankCell }}>{r.rank ?? "—"}</td>
                      <td style={styles.td}>
                        <b>{r.employee}</b>
                        {isMass && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.mist, fontStyle: "italic" }}>(mass)</span>}
                      </td>
                      <td style={{ ...styles.td, color: COLORS.fog }}>{r.group}</td>
                      <td style={{ ...styles.td, ...styles.scoreCell, color: tierColor }}>
                        {r.score != null ? r.score.toFixed(1) : "—"}
                      </td>
                      <td style={styles.td}>
                        {r.tier && (
                          <span style={{ ...styles.tierBadge, background: tierColor + "30", color: tierColor }}>
                            {r.tier}
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>{fmtPct(r.fan_cvr)}</td>
                      <td style={styles.td}>{fmtPct(r.unlock_rate)}</td>
                      <td style={styles.td}>{fmtCurrency(r.avg_earnings_per_paying_fan)}</td>
                      <td style={styles.td}>{fmtPct(r.golden_ratio)}</td>
                      <td style={styles.td}>{fmtCurrency(r.sales)}</td>
                      <td style={styles.td}>{fmtNum(r.ppvs_unlocked)}</td>
                      <td style={styles.td}>{fmtNum(r.fans_chatted)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
