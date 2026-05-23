"use client";

import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};

function cellColor(score) {
  if (score == null || score === 0) return "transparent";
  if (score >= 130) return "#4F8CCB"; // elite
  if (score >= 110) return "#3FB97E"; // strong
  if (score >= 90) return "#B89158"; // average
  if (score >= 70) return "#E76F51"; // weak
  return "#D44545"; // critical
}

function fmtCurrency(v) { if (v == null) return "—"; return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function HeatmapPage({ searchParams }) {
  const resolved = typeof searchParams?.then === "function" ? use(searchParams) : searchParams;
  const periodId = resolved?.period_id || currentMonthId();
  const [minSales, setMinSales] = useState(500);

  // Fetch creators list (con matrix inclusa via buildCreatorMatrix lato server)
  // Per la heatmap usiamo un endpoint diretto che ritorna la matrice raw
  const url = `/api/leaderboard/creators?period_id=${periodId}`;
  const { data } = useSWR(url, fetcher, { revalidateOnFocus: false });

  // Fetch matrix separately: hack — chiamiamo direttamente l'endpoint che già esiste e ricostruiamo via drill-down per creator
  // In realtà ci serve un nuovo endpoint che ritorni la matrix completa. Per semplicità per ora derivata da N drilldown.

  const creators = data?.creators || [];
  const topCreators = creators.slice(0, 25); // top 25 creator per non rendere unwieldy

  const drillUrls = topCreators.map((c) => `/api/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`);
  const allDrills = useSWR(drillUrls.length > 0 ? ["heatmap-drills", periodId, drillUrls.length] : null,
    async () => Promise.all(drillUrls.map((u) => fetch(u).then((r) => r.json())))
  );

  // Costruisco matrix: operatorName → { creatorAlias → cell }
  const matrix = useMemo(() => {
    if (!allDrills.data) return {};
    const out = {};
    for (const drill of allDrills.data) {
      if (!drill?.creator?.alias) continue;
      const creator = drill.creator.alias;
      for (const op of drill.operators || []) {
        if (op.sales < minSales) continue;
        if (!out[op.employee]) out[op.employee] = { _total: 0 };
        out[op.employee][creator] = { sales: op.sales, score: op.score, shifts: op.shifts };
        out[op.employee]._total += op.sales;
      }
    }
    return out;
  }, [allDrills.data, minSales]);

  const operatorNames = useMemo(() => {
    return Object.keys(matrix).sort((a, b) => (matrix[b]._total || 0) - (matrix[a]._total || 0));
  }, [matrix]);

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: "100%", margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 13, marginBottom: 18, maxWidth: 900, lineHeight: 1.55 },
    table: { borderCollapse: "collapse", fontSize: 11 },
    th: { padding: "10px 6px", color: COLORS.fog, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${COLORS.steel}`, fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "bottom" },
    thRot: { padding: "10px 4px", color: COLORS.fog, fontSize: 9, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.steel}`, fontWeight: 600, height: 120, textAlign: "left" },
    td: { padding: "4px 6px", borderBottom: `1px solid ${COLORS.charcoal}88`, textAlign: "center" },
    tdName: { padding: "6px 12px", borderBottom: `1px solid ${COLORS.charcoal}88`, fontFamily: FONTS.display, fontSize: 12, fontWeight: 500, position: "sticky", left: 0, background: COLORS.obsidian, zIndex: 1 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href={`/leaderboard/creators?period_id=${periodId}`} style={styles.backLink}>← Leaderboard Creator</Link>
        <h1 style={styles.title}>🔥 Heat-map Operatore × Creator</h1>
        <p style={styles.sub}>
          Ogni cella mostra lo <b>score relativo</b> dell'operatore su quella creator (100 = media creator).
          Verde = sopra media, Rosso = sotto media. Vuoto = non hanno lavorato insieme nel periodo.
          Soglia min sales: <input type="number" value={minSales} onChange={(e) => setMinSales(parseInt(e.target.value) || 0)} style={{ width: 80, padding: "4px 8px", marginLeft: 6, background: COLORS.charcoal, color: COLORS.alabaster, border: `1px solid ${COLORS.steel}`, borderRadius: 6 }} /> $ (per nascondere relazioni marginali).
        </p>

        {!data && <p style={{ color: COLORS.fog }}>Caricamento creator…</p>}
        {data?.error && <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{data.error}</div>}
        {data && !data.error && (
          <>
            {allDrills.isLoading && <p style={{ color: COLORS.fog, marginTop: 14 }}>Caricamento matrice (top {topCreators.length} creator)…</p>}
            {allDrills.data && operatorNames.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: COLORS.fog, marginBottom: 14 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#4F8CCB", borderRadius: 2, marginRight: 4 }} />≥130 Elite</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3FB97E", borderRadius: 2, marginRight: 4 }} />110-130 Strong</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#B89158", borderRadius: 2, marginRight: 4 }} />90-110 Average</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#E76F51", borderRadius: 2, marginRight: 4 }} />70-90 Weak</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#D44545", borderRadius: 2, marginRight: 4 }} />&lt;70 Critical</span>
                </div>
                <div style={{ overflow: "auto", maxHeight: "75vh", border: `1px solid ${COLORS.charcoal}`, borderRadius: 12 }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.thRot, position: "sticky", left: 0, top: 0, background: COLORS.obsidian, zIndex: 3 }}>Operatore</th>
                        {topCreators.map((c) => (
                          <th key={c.alias} style={{ ...styles.thRot, position: "sticky", top: 0, background: COLORS.obsidian, zIndex: 2 }} title={`${c.alias}: $${c.total_sales}`}>
                            <div style={{ transform: "rotate(-60deg)", transformOrigin: "left bottom", width: 24, whiteSpace: "nowrap" }}>{c.alias}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {operatorNames.map((opName) => (
                        <tr key={opName}>
                          <td style={styles.tdName}>
                            <Link href={`/leaderboard/operational/${encodeURIComponent(opName)}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>{opName}</Link>
                          </td>
                          {topCreators.map((c) => {
                            const cell = matrix[opName][c.alias];
                            const color = cell ? cellColor(cell.score) : "transparent";
                            return (
                              <td key={c.alias} style={{ ...styles.td, width: 38, height: 28, background: color + (cell ? "AA" : ""), cursor: cell ? "help" : "default" }}
                                  title={cell ? `${opName} su ${c.alias}: score ${cell.score} · ${fmtCurrency(cell.sales)} su ${cell.shifts} shift` : "Non hanno lavorato insieme"}>
                                {cell && <span style={{ color: cell.score >= 130 ? "#fff" : COLORS.obsidian, fontWeight: 700, fontSize: 10 }}>{cell.score}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 10 }}>
                  {operatorNames.length} operatori × {topCreators.length} creator (top by sales). Hover su cella per dettagli.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
