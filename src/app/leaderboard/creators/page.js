"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
function fmtCurrency(v, dec = 0) { if (v == null) return "—"; return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: dec }); }
function fmtNum(v) { if (v == null) return "—"; return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CreatorsLeaderboardPage() {
  const [periodId, setPeriodId] = useState("");
  const [search, setSearch] = useState("");
  const periodOptions = useMemo(() => monthOpts(), []);
  useEffect(() => { if (!periodId && periodOptions[0]) setPeriodId(periodOptions[0].value); }, [periodOptions, periodId]);

  const url = periodId ? `/api/leaderboard/creators?period_id=${periodId}&include_suggestions=1` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const creators = data?.creators || [];
  const filtered = useMemo(() => {
    if (!search.trim()) return creators;
    const q = search.toLowerCase();
    return creators.filter((c) =>
      c.alias.toLowerCase().includes(q) ||
      (c.top_operator?.name || "").toLowerCase().includes(q)
    );
  }, [creators, search]);

  const suggestions = data?.suggestions || [];

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: { fontFamily: FONTS.display, fontSize: 32, margin: "0 0 6px 0", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "16px 18px" },
    statLabel: { fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 },
    statValue: { fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, overflow: "hidden" },
    th: { textAlign: "left", padding: "12px 14px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "12px 14px", borderBottom: `1px solid ${COLORS.charcoal}88` },
    input: { padding: "9px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 10, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, width: 280, outline: "none", marginBottom: 16 },
    suggCard: { background: COLORS.graphite, border: `1px solid ${COLORS.champagne}44`, borderRadius: 10, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <Link href="/leaderboard" style={styles.backLink}>← Ladder</Link>
          <Link href="/leaderboard/operational" style={styles.backLink}>· Operativa</Link>
          <Link href="/leaderboard/sales-cp" style={styles.backLink}>· Sales CP</Link>
        </div>
        <h1 style={styles.title}>🎨 Leaderboard Creator</h1>
        <p style={styles.sub}>
          Vista <b>creator-first</b>: chi sono le creator più redditizie del mese, chi è il loro top chatter, quante persone ci lavorano. Click su una creator per vedere il suo team interno (drill-down).
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...styles.input, width: 200, marginBottom: 0 }}>
            {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: COLORS.charcoal }}>{p.label}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Cerca creator o operatore..." style={{ ...styles.input, marginBottom: 0 }} />
          <button onClick={() => url && mutate(url)} style={{ padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.fog, fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>🔄 Aggiorna</button>
          <Link href={`/leaderboard/creators/heatmap?period_id=${periodId}`} style={{ padding: "9px 14px", background: COLORS.champagne, color: COLORS.obsidian, borderRadius: 10, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>🔥 Heat-map →</Link>
        </div>

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{data.error}{" "}<Link href="/admin/creatorspro-sync" style={{ color: COLORS.champagne }}>Sync CP →</Link></div>}

        {data && !data.error && (
          <>
            <div style={styles.summary}>
              <div style={styles.card}>
                <div style={styles.statLabel}>Creator attive</div>
                <div style={styles.statValue}>{fmtNum(data.creators_count)}</div>
              </div>
              <div style={styles.card}>
                <div style={styles.statLabel}>Sales agency totale</div>
                <div style={{ ...styles.statValue, color: "#3FB97E" }}>{fmtCurrency(data.total_sales_agency)}</div>
              </div>
              <div style={styles.card}>
                <div style={styles.statLabel}>Avg sales/creator</div>
                <div style={styles.statValue}>{fmtCurrency(data.avg_sales_per_creator)}</div>
              </div>
              <div style={styles.card}>
                <div style={styles.statLabel}>Operatori coinvolti</div>
                <div style={styles.statValue}>{fmtNum(data.operators_count)}</div>
              </div>
            </div>

            {/* SUGGESTIONS */}
            {suggestions.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, marginBottom: 12 }}>💡 Match suggestions (top {suggestions.length})</h2>
                {suggestions.slice(0, 5).map((s, i) => (
                  <div key={i} style={styles.suggCard}>
                    <div style={{ fontSize: 13 }}>
                      <Link href={`/leaderboard/operational/${encodeURIComponent(s.employee)}`} style={{ color: COLORS.alabaster, fontWeight: 600, textDecoration: "none" }}>{s.employee}</Link>
                      {" "}rende{" "}
                      <span style={{ color: "#3FB97E", fontWeight: 700 }}>{s.top_score}</span>
                      {" "}su{" "}
                      <Link href={`/leaderboard/creators/${encodeURIComponent(s.top_creator)}?period_id=${periodId}`} style={{ color: COLORS.champagne, fontWeight: 600, textDecoration: "none" }}>{s.top_creator}</Link>
                      {" "}(media sua: {s.avg_score}, gap{" "}<span style={{ color: COLORS.champagne }}>+{s.gap}</span>)
                    </div>
                    <span style={{ color: COLORS.mist, fontFamily: FONTS.mono, fontSize: 12 }}>{fmtCurrency(s.top_sales)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* TABLE CREATORS */}
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Creator</th>
                  <th style={styles.th}>Sales totale</th>
                  <th style={styles.th}>Shift</th>
                  <th style={styles.th}>Operatori</th>
                  <th style={styles.th}>Avg $/shift</th>
                  <th style={styles.th}>Top operator</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.alias}>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog, fontWeight: 600 }}>{String(c.rank).padStart(2, "0")}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      <Link href={`/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>
                        {c.alias} <span style={{ color: COLORS.champagne, opacity: 0.6, fontSize: 12 }}>›</span>
                      </Link>
                    </td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono, color: "#3FB97E", fontWeight: 600 }}>{fmtCurrency(c.total_sales)}</td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog }}>{fmtNum(c.total_shifts)}</td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.fog }}>{c.operators_count}</td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{fmtCurrency(c.avg_sales_per_shift)}</td>
                    <td style={{ ...styles.td }}>
                      {c.top_operator ? (
                        <Link href={`/leaderboard/operational/${encodeURIComponent(c.top_operator.name)}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>
                          {c.top_operator.name} <span style={{ color: COLORS.mist, fontSize: 11, marginLeft: 4 }}>({fmtCurrency(c.top_operator.sales)})</span>
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {search && (
              <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 10 }}>{filtered.length} risultati su {creators.length}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
