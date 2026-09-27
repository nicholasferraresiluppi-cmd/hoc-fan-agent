"use client";

// Mappa operatore × creator (redesign 26/09/2026).
// Correzione di sostanza: la legenda/colore usavano una scala VECCHIA "100 = media,
// <70 Critical" mentre le celle mostrano lo score 0-100 di oggi → operatori al
// vertice (89-90) apparivano rossi "Weak/Critical". Ora il colore è la FASCIA dello
// score su quella creator (stessa di Sales CP), celle a pochi turni in grigio.
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$, MONTHS_IT } from "@/lib/format";
import { PageHead, Notice, card } from "@/components/ds";

import { tierLabel } from "@/lib/tier-label";
const fetcher = (url) => fetch(url).then((r) => r.json());
const currentMonthId = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const TIERS = ["Critical", "Weak", "Average", "Good", "Strong", "Elite"];
// rosso → neutro → verde, sempre dai token (funziona nei due temi)
const TIER_BG = {
  // fasce basse in grigio, mai rosso (26/09): il colore segnala chi rende bene
  Critical: alpha(CP.textMuted, "55"), Weak: alpha(CP.textMuted, "30"), Average: CP.surfaceAlt,
  Good: alpha(CP.accentGreen, "26"), Strong: alpha(CP.accentGreen, "4d"), Elite: alpha(CP.accentGreen, "80"),
};
const sc = (v) => (v == null ? "" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));

export default function HeatmapPage({ searchParams }) {
  const resolved = typeof searchParams?.then === "function" ? use(searchParams) : searchParams;
  const periodId = resolved?.period_id || currentMonthId();
  const [minSales, setMinSales] = useState(500);
  const [q, setQ] = useState("");
  const { data } = useSWR(`/api/leaderboard/creators?period_id=${periodId}`, fetcher, { revalidateOnFocus: false });

  const topCreators = (data?.creators || []).slice(0, 25);
  const drillUrls = topCreators.map((c) => `/api/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`);
  const allDrills = useSWR(drillUrls.length ? ["heatmap-drills", periodId, drillUrls.length] : null,
    async () => Promise.all(drillUrls.map((u) => fetch(u).then((r) => r.json()))));

  const matrix = useMemo(() => {
    const out = {};
    for (const drill of allDrills.data || []) {
      const creator = drill?.creator?.alias;
      if (!creator) continue;
      for (const op of drill.operators || []) {
        if (op.sales < minSales) continue;
        (out[op.employee] ||= { _total: 0 });
        out[op.employee][creator] = op;
        out[op.employee]._total += op.sales;
      }
    }
    return out;
  }, [allDrills.data, minSales]);
  const allNames = useMemo(() => Object.keys(matrix).sort((a, b) => matrix[b]._total - matrix[a]._total), [matrix]);
  const needle = q.trim().toLowerCase();
  const names = needle ? allNames.filter((n) => n.toLowerCase().includes(needle)) : allNames;
  // Riepilogo: celle affidabili per fascia (quante coppie operatore×creator rendono bene/male)
  const summary = useMemo(() => {
    const out = { cells: 0, strong: 0, weak: 0, thin: 0 };
    for (const n of allNames) for (const [k, cell] of Object.entries(matrix[n])) {
      if (k === "_total") continue;
      if (cell.low_confidence) { out.thin += 1; continue; }
      out.cells += 1;
      if (cell.tier === "Strong" || cell.tier === "Elite") out.strong += 1;
      if (cell.tier === "Critical" || cell.tier === "Weak") out.weak += 1;
    }
    return out;
  }, [allNames, matrix]);

  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const ctl = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Creator", href: `/leaderboard/creators?period_id=${periodId}` }, { label: "Mappa operatore × creator" }]}
        title="Mappa operatore × creator"
        subtitle="Chi rende bene su quale creator, a colpo d'occhio: ogni cella è lo score (0-100) dell'operatore su quella creator, colorata per fascia. Utile per decidere chi mettere dove."
        actions={<>
          <select value={periodId} aria-label="Mese" style={ctl} onChange={(e) => { window.location.href = `/leaderboard/creators/heatmap?period_id=${e.target.value}`; }}>
            {months.map((m) => <option key={m} value={m}>{MONTHS_IT[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
          </select>
          <label style={{ ...ctl, display: "inline-flex", alignItems: "center", gap: 6 }}>
            venduto minimo $<input type="number" value={minSales} onChange={(e) => setMinSales(parseInt(e.target.value, 10) || 0)} aria-label="Venduto minimo"
              style={{ width: 70, border: "none", background: "transparent", color: CP.textPrimary, fontSize: 14, outline: "none" }} />
          </label>
        </>}
      />

      {!data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error}</Notice>}
      {data && !data.error && allDrills.isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento della mappa (prime {topCreators.length} creator per venduto)…</div>}

      {allDrills.data && allNames.length > 0 && (<>
        <div style={{ ...card, padding: "14px 18px", marginBottom: 12, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          {[
            ["Operatori", allNames.length],
            ["Coppie con dati affidabili", summary.cells],
            ["Rendono bene (Strong/Elite)", summary.strong],
            ["Rendono poco (Critical/Weak)", summary.weak],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{v.toLocaleString("it-IT")}</div>
            </div>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un operatore…" aria-label="Cerca un operatore"
            style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, minWidth: 200, fontFamily: FONTS.body }} />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textSecondary, marginBottom: 10, alignItems: "center" }}>
          {TIERS.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: TIER_BG[t], border: `1px solid ${CP.border}` }} />{tierLabel(t)}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: "transparent", border: `1px dashed ${CP.textMuted}` }} />pochi turni (score non affidabile)
          </span>
          <span style={{ color: CP.textMuted }}>· vuoto = non hanno lavorato insieme · fasce come in Sales CP</span>
        </div>
        <div style={{ ...card, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: CP.surface, padding: "8px 12px", textAlign: "left", fontWeight: 500, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, verticalAlign: "bottom" }}>Operatore</th>
                {topCreators.map((c) => (
                  <th key={c.alias} title={`${c.alias}: ${fmt$(c.total_sales)}`}
                    style={{ position: "sticky", top: 0, zIndex: 2, background: CP.surface, padding: "8px 2px", borderBottom: `1px solid ${CP.border}`, verticalAlign: "bottom", height: 150 }}>
                    <Link href={`/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`}
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", color: CP.textSecondary, fontWeight: 500, textDecoration: "none", fontSize: 12 }}>
                      {c.alias}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((n) => (
                <tr key={n}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: CP.surface, padding: "4px 12px", borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap" }}>
                    <Link href={`/leaderboard/operational/${encodeURIComponent(n)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{n}</Link>
                  </td>
                  {topCreators.map((c) => {
                    const cell = matrix[n][c.alias];
                    const thin = cell?.low_confidence;
                    return (
                      <td key={c.alias}
                        title={cell ? `${n} su ${c.alias}: ${thin ? "pochi turni" : `score ${sc(cell.score)} (${tierLabel(cell.tier)})`} · ${fmt$(cell.sales)} in ${Math.round(cell.shifts)} turni` : "Non hanno lavorato insieme"}
                        style={{ width: 36, minWidth: 36, height: 28, padding: 0, textAlign: "center", borderBottom: `1px solid ${CP.borderSoft}`,
                          background: cell && !thin ? TIER_BG[cell.tier] || CP.surfaceAlt : "transparent",
                          outline: thin ? `1px dashed ${CP.textMuted}` : "none", outlineOffset: -4,
                          color: CP.textPrimary, fontVariantNumeric: "tabular-nums", cursor: cell ? "help" : "default" }}>
                        {cell ? (thin ? "·" : sc(cell.score)) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {names.length === 0 && <div style={{ color: CP.textMuted, fontSize: 13, padding: 12 }}>Nessun operatore con “{q}”.</div>}
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>{names.length} operatori × {topCreators.length} creator (le prime per venduto). Passa sopra una cella per il dettaglio; clic sul nome per la scheda.</div>
      </>)}
    </div>
  );
}
