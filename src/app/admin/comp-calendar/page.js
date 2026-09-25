"use client";

/**
 * /admin/comp-calendar — Calendario compensi (creator × mese).
 *
 * v3 (25/09/2026, pilota leggibilità v2) — ridisegnata dopo un test d'uso con 5
 * utenti simulati (sales manager, board, paghe, coordinatrice turni, esperto UX).
 * Cosa è cambiato e perché:
 *  - UNA domanda in cima ("quanto ci costano gli operatori su questa creator?")
 *    con il confronto col mese prima: un numero senza termine di paragone non dice
 *    se il mese è andato bene.
 *  - Anomalie come filtro ("8 da controllare" → la griglia mostra solo quelle).
 *  - Tabella per operatore SUBITO dopo, ordinabile, con venduto per turno: prima
 *    chi faceva più turni sembrava il più bravo.
 *  - Griglia a caselle colorate per scaglione (colore su un'AREA: su una barretta
 *    di 3px l'occhio non distingue le tinte), venduto una volta per coppia,
 *    fasce scoperte evidenti, clic su un operatore = evidenzia i suoi turni.
 *  - Scala dati SEPARATA dall'accento viola (il viola è per ciò che si clicca).
 *  - Profili e simulatore chiusi di default.
 *  - SIMULATORE CORRETTO: prima usava un profilo per classe (solo/coppia/tre)
 *    mentre i turni hanno profili diversi (es. "Mattino" 350/700) e confrontava
 *    col pagato reale, che include voci non a scaglione → con le soglie reali dava
 *    −$313. Ora: soglie PER PROFILO e confronto scaglioni-nuovi vs
 *    scaglioni-attuali sugli stessi turni → differenza 0 per costruzione.
 *  - Numeri in un solo formato it-IT (separatore migliaia sempre, virgola decimale).
 *  - Tema chiaro/scuro (preferenza salvata): per tabelle dense di numeri la
 *    letteratura favorisce il testo scuro su chiaro (Piepenbrock et al. 2013).
 */

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, AlertTriangle, Download, FlaskConical, RotateCcw, Plus, X, ChevronDown, ChevronRight, Sun, Moon, ArrowUp, ArrowDown } from "lucide-react";
import { CP, FONTS, DATA_SCALE } from "@/lib/brand";
import { useTheme, setTheme as setAppTheme } from "@/lib/theme-client";
import CompNav from "@/components/CompNav";
import HowToRead from "@/components/HowToRead";
import CreatorPicker from "@/components/CreatorPicker";
import { fmt$, fmtSigned$, fmtPct, fmtPts, fmtInt } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Palette e formati                                                   */
/* ------------------------------------------------------------------ */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS_IT = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const NUM = { fontVariantNumeric: "tabular-nums" };
const MIN_SHIFTS = 5; // sotto: resa per turno non affidabile

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (in corso)" : ""}` });
  }
  return out;
}
const prevMonth = (pid) => {
  const [y, m] = pid.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// % vincente: scaglione il cui minimo è ≤ venduto del turno (formula bracket su intero importo)
function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage != null && t.percentage !== "");
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let w = sorted[0];
  for (const t of sorted) if ((Number(t.threshold) || 0) <= total) w = t;
  return Number(w.percentage);
}

async function getResearch(creator, pid) {
  const res = await fetch(`/api/admin/shift-research?creator=${encodeURIComponent(creator)}&period_id=${pid}`);
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, j };
}

/* ------------------------------------------------------------------ */

export default function CompCalendarPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [theme] = useTheme(); // tema dell'app (menu laterale → sole/luna)
  const [creator, setCreator] = useState("");
  const [periodId, setPeriodId] = useState(periods[1]?.value || periods[0]?.value || "");
  const [aliases, setAliases] = useState([]);
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [focus, setFocus] = useState(null); // null | "issues" | "gaps" | { operator }
  const [sort, setSort] = useState({ key: "per_shift", dir: -1 });
  const [showProfiles, setShowProfiles] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [showShifts, setShowShifts] = useState(false);
  const [simByProfile, setSimByProfile] = useState(null);
  const [onlyChanged, setOnlyChanged] = useState(true);

  const P = CP; // i token seguono il tema (CSS variables)
  const S = DATA_SCALE[theme];

  // ?theme=light|dark (foto e test automatici) imposta il tema dell'app
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("theme");
      if (q === "light" || q === "dark") setAppTheme(q);
    } catch {}
  }, []);
  const toggleTheme = () => setAppTheme(theme === "light" ? "dark" : "light");

  async function load(c, p) {
    setLoading(true); setError(null); setData(null); setPrev(null); setCandidates(null); setFocus(null);
    try {
      const [cur, before] = await Promise.all([getResearch(c, p), getResearch(c, prevMonth(p))]);
      if (!cur.ok) {
        if (cur.j?.ambiguous && cur.j?.candidates?.length) { setCandidates(cur.j.candidates); setError(cur.j.error); return; }
        throw new Error(cur.j?.error || "Errore di caricamento");
      }
      setData(cur.j);
      setPrev(before.ok ? before.j : null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // deep-link ?creator=&period_id= (es. da Scaglioni a confronto)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("creator"), p = sp.get("period_id");
    const pid = p && /^\d{4}-\d{2}$/.test(p) ? p : periodId;
    if (p) setPeriodId(pid);
    if (c) { setCreator(c); load(c, pid); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let off = false;
    fetch(`/api/admin/creator-aliases?period_id=${periodId}`).then((r) => r.json()).then((j) => { if (!off && j.aliases) setAliases(j.aliases); }).catch(() => {});
    return () => { off = true; };
  }, [periodId]);

  const pick = (alias) => { setCreator(alias); load(alias, periodId); };
  const changeMonth = (pid) => { setPeriodId(pid); if (creator) load(creator, pid); };

  /* ---------------- aggregati ---------------- */
  const agg = useMemo(() => (data?.rows?.length ? aggregate(data) : null), [data]);
  const aggPrev = useMemo(() => (prev?.rows?.length ? aggregate(prev) : null), [prev]);

  // soglie reali per profilo (dall'inventario) → punto di partenza del simulatore
  const realByProfile = useMemo(() => {
    if (!data) return null;
    const out = {};
    for (const p of data.profiles_inventory || []) if (p.thresholds?.length) out[p.name] = p.thresholds.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 }));
    return Object.keys(out).length ? out : null;
  }, [data]);
  useEffect(() => { setSimByProfile(realByProfile ? JSON.parse(JSON.stringify(realByProfile)) : null); }, [realByProfile]);
  const simChanged = useMemo(() => !!simByProfile && JSON.stringify(simByProfile) !== JSON.stringify(realByProfile), [simByProfile, realByProfile]);

  // Simulatore: stessi turni, scaglioni attuali vs scaglioni nuovi (delta 0 se invariati)
  const sim = useMemo(() => {
    if (!agg || !simByProfile || !realByProfile) return null;
    let base = 0, next = 0;
    const byOp = {};
    const rows = [];
    for (const r of agg.rows) {
      const real = realByProfile[r.profile_name];
      const neu = simByProfile[r.profile_name];
      if (!real || !neu) continue;
      const pBase = bracketPct(r.sales_total_shift, real);
      const pNew = bracketPct(r.sales_total_shift, neu);
      if (pBase == null || pNew == null) continue;
      const eBase = pBase * r.sales_on_creator, eNew = pNew * r.sales_on_creator;
      base += eBase; next += eNew;
      const o = (byOp[r.operator] ||= { base: 0, next: 0 });
      o.base += eBase; o.next += eNew;
      rows.push({ ...r, pBase, pNew, eBase, eNew, delta: eNew - eBase, changed: Math.abs(pNew - pBase) > 1e-6 });
    }
    return { base, next, delta: next - base, byOp, rows, changedCount: rows.filter((x) => x.changed).length };
  }, [agg, simByProfile, realByProfile]);

  const operatorsSorted = useMemo(() => {
    if (!agg) return [];
    const arr = agg.operators.map((o) => ({ ...o, per_shift: o.turni ? o.sales / o.turni : 0, cost_pct: o.sales ? o.earn / o.sales : null }));
    const k = sort.key;
    // Chi ha pochi turni in fondo quando si ordina per resa: un turno solo non dice
    // chi è bravo (con 1 turno da $8.000 si finiva in cima).
    const few = (o) => (["per_shift", "cost_pct"].includes(k) && o.turni < MIN_SHIFTS ? 1 : 0);
    return arr.sort((a, b) => few(a) - few(b) || (typeof a[k] === "string" ? a[k].localeCompare(b[k]) * sort.dir : ((a[k] ?? 0) - (b[k] ?? 0)) * sort.dir));
  }, [agg, sort]);

  /* ---------------- stili (dipendono dal tema) ---------------- */
  const st = styles(P);
  const tier = (pct) => {
    if (pct == null || !agg) return { fill: "transparent", text: P.textSecondary };
    const i = agg.pcts.indexOf(pct);
    const n = agg.pcts.length;
    const idx = i < 0 ? agg.pcts.filter((x) => x < pct).length : i;
    const pos = n <= 1 ? 2 : Math.round((Math.min(idx, n - 1) / (n - 1)) * 4);
    return { fill: S.fill[pos], text: S.text[pos] };
  };

  const costPct = agg && agg.totSales > 0 ? agg.totEarn / agg.totSales : null;
  const costPrev = aggPrev && aggPrev.totSales > 0 ? aggPrev.totEarn / aggPrev.totSales : null;
  const issuesCount = agg ? agg.issueIds.size : 0;

  return (
    <div style={{ background: P.bg, minHeight: "100vh", color: P.textPrimary, fontFamily: FONTS.body }}>
      <div style={{ padding: "28px 28px 80px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Testata compatta: titolo + scelte + tema */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: P.textSecondary, marginBottom: 6 }}>
          <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link><span style={{ color: P.textMuted }}>›</span><span>Comp &amp; Ben</span>
          <button onClick={toggleTheme} style={{ ...st.ghostBtn, marginLeft: "auto", padding: "6px 10px" }} title="Cambia tema">
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />} {theme === "light" ? "Tema scuro" : "Tema chiaro"}
          </button>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Calendario compensi</h1>
        <p style={{ fontSize: 14, color: P.textSecondary, margin: "0 0 18px", maxWidth: 760 }}>Quanto ci costano gli operatori su una creator, chi rende e dove, e cosa succederebbe cambiando gli scaglioni.</p>

        <CompNav palette={P} />

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: "1 1 320px", maxWidth: 520 }}>
            <label style={st.lbl}>Creator</label>
            <CreatorPicker aliases={aliases} value={creator} onSelect={pick} palette={P} />
          </div>
          <div>
            <label style={st.lbl}>Mese</label>
            <select value={periodId} onChange={(e) => changeMonth(e.target.value)} style={{ ...st.input, minWidth: 190, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {data?.csv_url && <a href={data.csv_url} style={st.ghostBtn}><Download size={14} /> Scarica CSV</a>}
          {loading && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: P.textMuted, fontSize: 13, paddingBottom: 10 }}><Loader2 size={14} className="animate-spin" /> Carico…</span>}
        </div>
        <HowToRead palette={P} items={[
          "In cima: quanto costano gli operatori su questa creator, confrontato col mese prima.",
          "“Da controllare” e “Fasce scoperte” sono filtri: cliccali e la griglia mostra solo quei turni. Clicca un operatore nella tabella per vedere solo i suoi turni.",
          "Nella griglia il colore della casella è lo scaglione pagato: più scuro = scaglione più alto. Il rosso è solo per ciò che va controllato.",
          "Il simulatore (in fondo, da aprire) confronta gli scaglioni attuali con quelli che provi tu, sugli stessi turni.",
        ]} />

        {error && (
          <div style={{ ...st.card, padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", fontSize: 14 }}>
            <AlertCircle size={16} color={candidates ? P.textMuted : P.accentRed} style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{error}</span>
            {candidates && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>{candidates.map((a) => <button key={a} onClick={() => pick(a)} style={st.ghostBtn}>{a}</button>)}</div>}
          </div>
        )}
        {!data && !loading && !error && <div style={{ ...st.card, padding: 24, color: P.textMuted, fontSize: 14 }}>Scegli una creator per vedere il mese.</div>}

        {agg && (
          <>
            {/* 1. La risposta: un numero principale, col confronto */}
            <section style={{ ...st.card, padding: "20px 22px", marginBottom: 14, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 13, color: P.textSecondary }}>Costo operatori sul venduto</div>
                <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, ...NUM }}>{fmtPct(costPct, 1)}</div>
                <div style={{ fontSize: 13, color: P.textMuted, marginTop: 4 }}>
                  {costPrev != null ? <>era {fmtPct(costPrev, 1)} a {MONTH_IT[Number(prevMonth(periodId).slice(5)) - 1].toLowerCase()} ({fmtPts(costPct - costPrev)})</> : "nessun dato del mese prima"}
                </div>
              </div>
              <Metric P={P} label="Venduto" value={fmt$(agg.totSales)} prev={aggPrev?.totSales} cur={agg.totSales} />
              <Metric P={P} label="Pagato agli operatori" value={fmt$(agg.totEarn)} prev={aggPrev?.totEarn} cur={agg.totEarn} />
              <Metric P={P} label="Turni" value={fmtInt(agg.rows.length)} prev={aggPrev?.rows.length} cur={agg.rows.length} />
              <Metric P={P} label="Operatori" value={String(agg.operators.length)} prev={aggPrev?.operators.length} cur={agg.operators.length} />
            </section>

            {/* 2. Cosa guardare: filtri */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
              <FilterChip P={P} active={focus === "issues"} danger={issuesCount > 0} onClick={() => setFocus(focus === "issues" ? null : "issues")}
                label={issuesCount ? `${issuesCount} turni da controllare` : "Nessun turno da controllare"} disabled={!issuesCount} />
              <FilterChip P={P} active={focus === "gaps"} onClick={() => setFocus(focus === "gaps" ? null : "gaps")}
                label={`${agg.emptyCells} fasce scoperte su ${agg.days.length * agg.mainSlots.length}`} disabled={!agg.emptyCells} />
              {focus && typeof focus === "object" && (
                <FilterChip P={P} active onClick={() => setFocus(null)} label={`Solo ${focus.operator}`} closable />
              )}
              {focus === "issues" && <span style={{ fontSize: 13, color: P.textSecondary }}>{agg.issueSummary}</span>}
            </div>

            {/* 3. Chi rende: per operatore, ordinabile */}
            <h2 style={st.h2}>Operatori su questa creator</h2>
            <div style={{ ...st.card, overflowX: "auto", marginBottom: 26 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 680 }}>
                <thead><tr>
                  {[["name", "Operatore", "left"], ["turni", "Turni"], ["sales", "Venduto"], ["per_shift", "Venduto per turno"], ["earn", "Pagato"], ["cost_pct", "Costo sul venduto"]].map(([k, l, al]) => (
                    <th key={k} style={{ ...st.th, textAlign: al || "right", cursor: "pointer", userSelect: "none" }} onClick={() => setSort({ key: k, dir: sort.key === k ? -sort.dir : (k === "name" ? 1 : -1) })}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{l}{sort.key === k && (sort.dir < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
                    </th>
                  ))}
                  <th style={st.th}>Scaglioni pagati</th>
                </tr></thead>
                <tbody>
                  {operatorsSorted.map((o) => {
                    const sel = focus && typeof focus === "object" && focus.operator === o.name;
                    return (
                      <tr key={o.name} onClick={() => setFocus(sel ? null : { operator: o.name })} style={{ borderTop: `1px solid ${P.borderSoft}`, cursor: "pointer", background: sel ? P.accentSoft : "transparent" }} title="Clicca per vedere solo i suoi turni nella griglia">
                        <td style={{ ...st.td, color: P.textPrimary }}>{o.name}{o.turni < MIN_SHIFTS && <span style={{ fontSize: 12, color: P.textMuted, marginLeft: 8 }}>pochi turni</span>}</td>
                        <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{o.turni}</td>
                        <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(o.sales)}</td>
                        <td style={{ ...st.td, ...NUM, textAlign: "right", fontWeight: 500, color: o.turni < MIN_SHIFTS ? P.textMuted : P.textPrimary }}>{fmt$(o.per_shift)}</td>
                        <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(o.earn)}</td>
                        <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{fmtPct(o.cost_pct, 1)}</td>
                        <td style={st.td}><TierBar byPct={o.byPct} tier={tier} P={P} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 4. Dove: la griglia */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
              <h2 style={{ ...st.h2, margin: 0 }}>Giorno per giorno</h2>
              <span style={{ display: "inline-flex", gap: 12, fontSize: 13, color: P.textSecondary, flexWrap: "wrap" }}>
                {agg.pcts.map((p) => (
                  <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: tier(p).fill, border: `1px solid ${P.border}` }} />
                    scaglione {fmtPct(p)} · {agg.tierCounts[p] || 0} turni
                  </span>
                ))}
              </span>
            </div>
            <div style={{ ...st.card, marginBottom: 26, overflow: "hidden" }}>
              <div style={{ overflowX: "auto", maxHeight: 680, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
                  <thead><tr style={{ position: "sticky", top: 0, zIndex: 3 }}>
                    <th style={{ ...st.th, position: "sticky", left: 0, zIndex: 4, minWidth: 74 }}>Giorno</th>
                    {agg.columns.map((c) => <th key={c} style={{ ...st.th, minWidth: 148 }}>{c.replace("–", " – ")}</th>)}
                    <th style={{ ...st.th, textAlign: "right", minWidth: 92, position: "sticky", right: 0, zIndex: 4, boxShadow: `-1px 0 0 ${P.border}` }}>Totale giorno</th>
                  </tr></thead>
                  <tbody>
                    {agg.days.map((d) => {
                      const weekend = d.dow === "Sab" || d.dow === "Dom";
                      const dt = agg.dayTotals[d.date];
                      return (
                        <tr key={d.date}>
                          <td style={{ ...st.gridTd, position: "sticky", left: 0, zIndex: 1, background: weekend ? P.surfaceAlt : P.surface, color: weekend ? P.textPrimary : P.textSecondary, whiteSpace: "nowrap" }}>
                            {d.dow} <span style={NUM}>{d.dayNum}</span>
                          </td>
                          {agg.columns.map((c) => {
                            const cell = agg.cellMap[`${d.date}|${c}`] || [];
                            const isMain = c !== "Altri";
                            if (!cell.length) {
                              const hl = focus === "gaps" && isMain;
                              return (
                                <td key={c} style={{ ...st.gridTd, background: weekend ? P.surfaceAlt : P.surface }}>
                                  {isMain && <div style={{ border: `1px dashed ${hl ? P.textPrimary : P.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, color: hl ? P.textPrimary : P.textMuted, textAlign: "center" }}>scoperta</div>}
                                </td>
                              );
                            }
                            return (
                              <td key={c} style={{ ...st.gridTd, background: weekend ? P.surfaceAlt : P.surface }}>
                                {groupCell(cell).map((g) => {
                                  const t = tier(g.pct);
                                  const hasIssue = g.rows.some((r) => agg.issueIds.has(r.shift_id));
                                  const opSel = focus && typeof focus === "object";
                                  const matches = opSel ? g.rows.some((r) => r.operator === focus.operator) : focus === "issues" ? hasIssue : focus === "gaps" ? false : true;
                                  return (
                                    <div key={g.key}
                                      title={g.rows.map((r) => `${r.operator} · ${r.start}–${r.end} · venduto ${fmt$(r.sales_on_creator)} · pagato ${fmt$(r.earnings_attr)} (${fmtPct(r.eff_pct, 1)}) · profilo "${r.profile_name || "?"}"${agg.issueText[r.shift_id] ? ` · ${agg.issueText[r.shift_id]}` : ""}`).join("\n")}
                                      style={{ background: t.fill, color: t.text, borderRadius: 6, padding: "5px 8px", marginBottom: 4, boxShadow: theme === "dark" ? `inset 0 0 0 1px ${P.borderStrong}` : "none", opacity: matches ? 1 : 0.22, outline: hasIssue ? `2px solid ${P.accentRed}` : "none", outlineOffset: -2, transition: "opacity .15s" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {hasIssue && <AlertTriangle size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px", color: P.accentRed }} />}
                                          {g.rows.map((r) => r.operator.split(" ")[0]).join(" + ")}
                                        </span>
                                        <span style={{ ...NUM, fontWeight: 500, whiteSpace: "nowrap" }}>{fmt$(g.sales)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          })}
                          <td style={{ ...st.gridTd, ...NUM, textAlign: "right", position: "sticky", right: 0, zIndex: 1, boxShadow: `-1px 0 0 ${P.border}`, background: weekend ? P.surfaceAlt : P.surface, color: dt ? P.textPrimary : P.textMuted, fontWeight: 500 }}>{dt ? fmt$(dt.sales) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr style={{ position: "sticky", bottom: 0, zIndex: 3 }}>
                    <td style={{ ...st.footTd, position: "sticky", left: 0, zIndex: 4 }}>Totale mese</td>
                    {agg.columns.map((c) => (
                      <td key={c} style={{ ...st.footTd, ...NUM }}>{fmt$(agg.colTotals[c].sales)}<div style={{ color: P.textMuted, fontWeight: 400, fontSize: 12 }}>{agg.colTotals[c].count} turni · {fmt$(agg.colTotals[c].count ? agg.colTotals[c].sales / agg.colTotals[c].count : 0)} a turno</div></td>
                    ))}
                    <td style={{ ...st.footTd, ...NUM, textAlign: "right", position: "sticky", right: 0, zIndex: 4, boxShadow: `-1px 0 0 ${P.border}` }}>{fmt$(agg.totSales)}</td>
                  </tr></tfoot>
                </table>
              </div>
            </div>

            {/* 5. Turni uno per uno: per rispondere alle contestazioni senza passare il mouse */}
            <Disclosure P={P} open={showShifts || (focus && typeof focus === "object") || focus === "issues"} onToggle={() => setShowShifts(!showShifts)}
              title={`Turni uno per uno${focus && typeof focus === "object" ? ` · ${focus.operator}` : focus === "issues" ? " · da controllare" : ""}`}
              summary="Data, orario, profilo, percentuale pagata e dovuta, motivo delle anomalie">
              <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto", border: `1px solid ${P.border}`, borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Data", "Orario", "Operatore", "Profilo", "Venduto nel turno", "Venduto sulla creator", "% pagata", "% dovuta", "Pagato", "Nota"].map((h, i) => <th key={h} style={{ ...st.th, textAlign: i >= 4 && i <= 8 ? "right" : "left", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {agg.rows.filter((r) => (focus && typeof focus === "object" ? r.operator === focus.operator : focus === "issues" ? agg.issueIds.has(r.shift_id) : true)).map((r) => {
                      const issue = agg.issueText[r.shift_id];
                      return (
                        <tr key={r.shift_id} style={{ borderTop: `1px solid ${P.borderSoft}` }}>
                          <td style={{ ...st.td, ...NUM, color: P.textSecondary, whiteSpace: "nowrap" }}>{r.date.slice(8)}/{r.date.slice(5, 7)}</td>
                          <td style={{ ...st.td, ...NUM, color: P.textSecondary, whiteSpace: "nowrap" }}>{r.start}–{r.end}</td>
                          <td style={{ ...st.td, whiteSpace: "nowrap" }}>{r.operator}</td>
                          <td style={{ ...st.td, color: P.textSecondary, whiteSpace: "nowrap" }}>{profileLabel((data.profiles_inventory || []).find((x) => x.name === r.profile_name) || { name: r.profile_name, cosellers_count: r.profile_cosellers })}</td>
                          <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(r.sales_total_shift)}</td>
                          <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(r.sales_on_creator)}</td>
                          <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmtPct(r.eff_pct, 1)}</td>
                          <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{fmtPct(r.expected_pct)}</td>
                          <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(r.earnings_attr)}</td>
                          <td style={{ ...st.td, color: issue ? P.accentRed : P.textMuted, fontSize: 12 }}>{issue || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Disclosure>

            {/* 6. Su richiesta: profili */}
            <Disclosure P={P} open={showProfiles} onToggle={() => setShowProfiles(!showProfiles)}
              title="Profili di pagamento del mese" summary={profilesSummary(data.profiles_inventory || [])}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr><th style={st.th}>Profilo</th><th style={{ ...st.th, textAlign: "right" }}>Persone nel turno</th><th style={{ ...st.th, textAlign: "right" }}>Turni</th><th style={{ ...st.th, textAlign: "right" }}>Venduto</th><th style={st.th}>Scaglioni</th></tr></thead>
                <tbody>{(data.profiles_inventory || []).map((p) => (
                  <tr key={p.name} style={{ borderTop: `1px solid ${P.borderSoft}` }}>
                    <td style={st.td}>{profileLabel(p)}<div style={{ fontSize: 12, color: P.textMuted }}>{p.name}</div></td>
                    <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{p.cosellers_count ?? "?"}</td>
                    <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{p.shifts}</td>
                    <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(p.sales)}</td>
                    <td style={{ ...st.td, ...NUM, color: P.textSecondary }}>{thresholdsText(p.thresholds)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Disclosure>

            {/* 6. Su richiesta: simulatore */}
            <Disclosure P={P} open={showSim} onToggle={() => setShowSim(!showSim)} icon={<FlaskConical size={15} />}
              title="Simulatore: e se gli scaglioni fossero diversi?"
              summary={sim && simChanged ? `Con le soglie provate: ${fmtSigned$(sim.delta)} agli operatori in un mese (${sim.changedCount} turni cambiano scaglione)` : "Prova soglie diverse sui turni di questo mese"}>
              {simByProfile && (
                <>
                  <div style={{ fontSize: 13, color: P.textSecondary, marginBottom: 12 }}>Una riga per profilo di pagamento. Il confronto è tra gli scaglioni di oggi e quelli che scrivi qui, sugli stessi turni: se non cambi niente, la differenza è zero.</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
                      <thead><tr><th style={st.th}>Profilo</th><th style={st.th}>Scaglioni (da $ → %)</th><th style={st.th}></th></tr></thead>
                      <tbody>
                        {Object.keys(simByProfile).map((name) => {
                          const tiers = simByProfile[name];
                          const setTiers = (next) => setSimByProfile({ ...simByProfile, [name]: next });
                          return (
                            <tr key={name} style={{ borderTop: `1px solid ${P.borderSoft}` }}>
                              <td style={{ ...st.td, whiteSpace: "nowrap" }}>{profileLabel((data.profiles_inventory || []).find((x) => x.name === name) || { name })}<div style={{ fontSize: 12, color: P.textMuted }}>{name}</div></td>
                              <td style={st.td}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  {tiers.map((t, i) => (
                                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ color: P.textMuted, fontSize: 12 }}>{i === 0 ? "base" : "da $"}</span>
                                      {i > 0 && <SimInput P={P} st={st} value={t.threshold} was={realByProfile?.[name]?.[i]?.threshold} label={`Soglia ${i + 1} ${name}`} width={76}
                                        onChange={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, threshold: v === "" ? "" : Number(v) } : x)))} />}
                                      <span style={{ color: P.textMuted }}>→</span>
                                      <SimInput P={P} st={st} step="0.5" value={t.percentage === "" ? "" : Math.round(Number(t.percentage) * 1000) / 10}
                                        was={realByProfile?.[name]?.[i]?.percentage != null ? Math.round(realByProfile[name][i].percentage * 1000) / 10 : undefined} label={`Percentuale ${i + 1} ${name}`} width={60}
                                        onChange={(v) => setTiers(tiers.map((x, j) => (j === i ? { ...x, percentage: v === "" ? "" : Number(v) / 100 } : x)))} />
                                      <span style={{ color: P.textMuted, fontSize: 12 }}>%</span>
                                      {i > 0 && <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label="Togli scaglione" style={{ ...st.iconBtn, padding: 5 }}><X size={12} /></button>}
                                      {i < tiers.length - 1 && <span style={{ color: P.border, margin: "0 2px" }}>|</span>}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={st.td}><button onClick={() => setTiers([...tiers, { threshold: (Number(tiers[tiers.length - 1]?.threshold) || 0) + 500, percentage: (Number(tiers[tiers.length - 1]?.percentage) || 0.1) + 0.02 }])} aria-label="Aggiungi scaglione" style={{ ...st.iconBtn, padding: 5 }}><Plus size={12} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 10, margin: "12px 0 16px", flexWrap: "wrap" }}>
                    <button onClick={() => setSimByProfile(JSON.parse(JSON.stringify(realByProfile)))} style={st.ghostBtn} disabled={!simChanged}><RotateCcw size={13} /> Torna agli scaglioni di oggi</button>
                  </div>
                  {sim && (
                    <>
                      {/* Risultato ancorato al pagato REALE: si applica solo la differenza dovuta agli
                          scaglioni (prima c'erano due totali quasi uguali, $18.615 e $18.616: confondeva) */}
                      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, color: P.textSecondary }}>Costo operatori sul venduto</div>
                          <div style={{ fontSize: 22, fontWeight: 500, ...NUM }}>{fmtPct(costPct, 1)} → {fmtPct(agg.totSales ? (agg.totEarn + sim.delta) / agg.totSales : null, 1)}</div>
                          <div style={{ fontSize: 12, color: P.textMuted }}>{fmtPts(agg.totSales ? sim.delta / agg.totSales : 0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: P.textSecondary }}>Pagato agli operatori nel mese</div>
                          <div style={{ fontSize: 22, fontWeight: 500, ...NUM }}>{fmt$(agg.totEarn)} → {fmt$(agg.totEarn + sim.delta)}</div>
                          <div style={{ fontSize: 12, color: P.textMuted }}>{fmtSigned$(sim.delta)} · {sim.delta > 0 ? "gli operatori guadagnerebbero di più" : sim.delta < 0 ? "gli operatori guadagnerebbero di meno" : "nessun cambiamento"}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 14 }}>Cambia solo la parte che dipende dallo scaglione; il resto del pagato resta com'è.</div>
                      {simChanged && (
                        <>
                          <h3 style={{ fontSize: 14, fontWeight: 500, margin: "4px 0 8px" }}>Chi ci guadagna e chi ci perde</h3>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 14 }}>
                            <thead><tr><th style={st.th}>Operatore</th><th style={{ ...st.th, textAlign: "right" }}>Oggi</th><th style={{ ...st.th, textAlign: "right" }}>Provato</th><th style={{ ...st.th, textAlign: "right" }}>Differenza</th></tr></thead>
                            <tbody>{Object.entries(sim.byOp).sort((a, b) => (a[1].next - a[1].base) - (b[1].next - b[1].base)).map(([name, o]) => (
                              <tr key={name} style={{ borderTop: `1px solid ${P.borderSoft}` }}>
                                <td style={st.td}>{name}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{fmt$(o.base)}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(o.next)}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right", fontWeight: 500 }}>{fmtSigned$(o.next - o.base)}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </>
                      )}
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: P.textSecondary, cursor: "pointer", marginBottom: 8 }}>
                        <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} style={{ accentColor: P.accent }} />
                        Mostra solo i turni che cambiano scaglione ({sim.changedCount})
                      </label>
                      <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto", border: `1px solid ${P.border}`, borderRadius: 8 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead><tr>{["Data", "Orario", "Operatore", "Venduto nel turno", "Oggi", "Provato", "Differenza"].map((h, i) => <th key={h} style={{ ...st.th, textAlign: i >= 3 ? "right" : "left", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {sim.rows.filter((r) => !onlyChanged || r.changed).map((r) => (
                              <tr key={r.shift_id} style={{ borderTop: `1px solid ${P.borderSoft}` }}>
                                <td style={{ ...st.td, ...NUM, color: P.textSecondary }}>{r.date.slice(8)}/{r.date.slice(5, 7)}</td>
                                <td style={{ ...st.td, ...NUM, color: P.textSecondary }}>{r.start}–{r.end}</td>
                                <td style={st.td}>{r.operator}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmt$(r.sales_total_shift)}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right", color: P.textSecondary }}>{fmtPct(r.pBase)} · {fmt$(r.eBase)}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right" }}>{fmtPct(r.pNew)} · {fmt$(r.eNew)}</td>
                                <td style={{ ...st.td, ...NUM, textAlign: "right", fontWeight: 500 }}>{Math.abs(r.delta) < 0.5 ? "—" : fmtSigned$(r.delta)}</td>
                              </tr>
                            ))}
                            {onlyChanged && sim.changedCount === 0 && <tr><td colSpan={7} style={{ ...st.td, textAlign: "center", color: P.textMuted, padding: 16 }}>Nessun turno cambia scaglione: modifica una soglia qui sopra.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </Disclosure>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aggregazione (logica invariata rispetto alla v2, + anomalie leggibili) */
/* ------------------------------------------------------------------ */
function aggregate(data) {
  const rows = data.rows.map((r) => {
    const share = r.sales_total_shift > 0 ? r.sales_on_creator / r.sales_total_shift : (r.mono ? 1 : 0);
    return { ...r, earnings_attr: Math.round(r.earnings * share * 100) / 100 };
  });
  const slotCounts = {};
  for (const r of rows) slotCounts[`${r.start}–${r.end}`] = (slotCounts[`${r.start}–${r.end}`] || 0) + 1;
  const mainSlots = Object.entries(slotCounts).filter(([, c]) => c >= 3).map(([k]) => k).sort((a, b) => a.localeCompare(b));
  const columns = [...mainSlots, ...(Object.values(slotCounts).some((c) => c < 3) ? ["Altri"] : [])];
  const pcts = [...new Set(rows.map((r) => r.expected_pct).filter((p) => p != null))].sort((a, b) => a - b);

  const [y, m] = (data.period_id || "").split("-").map(Number);
  const days = [];
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ date, dow: DAYS_IT[new Date(y, m - 1, d).getDay()], dayNum: d });
  }
  const monthDates = new Set(days.map((d) => d.date));
  for (const date of [...new Set(rows.map((r) => r.date))].filter((dt) => dt && !monthDates.has(dt)).sort()) {
    const [ey, em, ed] = date.split("-").map(Number);
    days.push({ date, dow: DAYS_IT[new Date(ey, em - 1, ed).getDay()], dayNum: ed, overflow: true });
  }
  const cellMap = {};
  const slotOf = (r) => (mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri");
  for (const r of rows) (cellMap[`${r.date}|${slotOf(r)}`] ||= []).push(r);

  // anomalie (stesse regole di prima) con spiegazione leggibile
  const groupSize = {};
  for (const r of rows) groupSize[`${r.date}|${r.start}|${r.end}`] = (groupSize[`${r.date}|${r.start}|${r.end}`] || 0) + 1;
  const tokens = (data.matched_aliases || []).flatMap((a) => a.toLowerCase().split(/[\s\-_]+/).filter((t) => t.length >= 3));
  const issueIds = new Set();
  const issueText = {};
  const counts = { out: 0, cos: 0, wrong: 0 };
  for (const r of rows) {
    const why = [];
    if (r.delta_pct != null && Math.abs(r.delta_pct) > 0.005) { why.push("pagato fuori scaglione"); counts.out++; }
    if (r.profile_cosellers != null && groupSize[`${r.date}|${r.start}|${r.end}`] !== r.profile_cosellers) { why.push(`profilo per ${r.profile_cosellers} persone, nel turno erano ${groupSize[`${r.date}|${r.start}|${r.end}`]}`); counts.cos++; }
    if (r.profile_name && !tokens.some((t) => r.profile_name.toLowerCase().includes(t))) { why.push("profilo di un'altra creator"); counts.wrong++; }
    if (why.length) { issueIds.add(r.shift_id); issueText[r.shift_id] = why.join("; "); }
  }
  const issueSummary = [
    counts.out ? `${counts.out} pagati fuori scaglione` : null,
    counts.cos ? `${counts.cos} con un profilo per un numero di persone diverso da chi ha lavorato` : null,
    counts.wrong ? `${counts.wrong} con il profilo di un'altra creator` : null,
  ].filter(Boolean).join(" · ");

  const colTotals = Object.fromEntries(columns.map((c) => [c, { sales: 0, count: 0 }]));
  const dayTotals = {};
  let totSales = 0, totEarn = 0, emptyCells = 0;
  const tierCounts = {};
  for (const r of rows) {
    const k = slotOf(r);
    colTotals[k].sales += r.sales_on_creator; colTotals[k].count += 1;
    (dayTotals[r.date] ||= { sales: 0, count: 0 }).sales += r.sales_on_creator;
    dayTotals[r.date].count += 1;
    totSales += r.sales_on_creator; totEarn += r.earnings_attr;
    if (r.expected_pct != null) tierCounts[r.expected_pct] = (tierCounts[r.expected_pct] || 0) + 1;
  }
  for (const d of days) for (const c of mainSlots) if (!cellMap[`${d.date}|${c}`]) emptyCells++;

  const opAgg = {};
  for (const r of rows) {
    const o = (opAgg[r.operator] ||= { turni: 0, sales: 0, earn: 0, byPct: {} });
    o.turni += 1; o.sales += r.sales_on_creator; o.earn += r.earnings_attr;
    if (r.expected_pct != null) o.byPct[r.expected_pct] = (o.byPct[r.expected_pct] || 0) + 1;
  }
  const operators = Object.entries(opAgg).map(([name, o]) => ({ name, ...o })).sort((a, b) => b.sales - a.sales);
  return { rows, columns, mainSlots, days, cellMap, colTotals, dayTotals, pcts, tierCounts, issueIds, issueText, issueSummary, operators, totSales, totEarn, emptyCells };
}

// In un turno condiviso il venduto è lo stesso per tutti: lo si mostra UNA volta.
function groupCell(cell) {
  const groups = new Map();
  for (const r of cell) {
    const key = `${r.start}|${r.end}|${Math.round(r.sales_on_creator)}|${r.expected_pct}`;
    const g = groups.get(key) || { key, rows: [], sales: r.sales_on_creator, pct: r.expected_pct };
    g.rows.push(r); groups.set(key, g);
  }
  return [...groups.values()];
}

// "2 Giulia Ottorini Mattino" → "In coppia · mattino": il nome interno di CreatorsPro
// non dice niente a chi legge; persone nel turno + variante sì.
function profileLabel(p) {
  const n = p?.cosellers_count;
  const who = n === 1 ? "Da solo" : n === 2 ? "In coppia" : n === 3 ? "In tre" : n ? `In ${n}` : "Profilo";
  const variant = (String(p?.name || "").match(/mattin\w*|notturn\w*|serale|serata|weekend|condivis\w*/gi) || []).map((x) => x.toLowerCase());
  return variant.length ? `${who} · ${variant.join(" · ")}` : who;
}
function thresholdsText(ths) {
  return (ths || []).map((t) => `${t.threshold > 0 ? `da ${fmt$(t.threshold)}` : "base"} ${fmtPct(t.percentage)}`).join(" · ");
}
function profilesSummary(inv) {
  if (!inv.length) return "Nessun profilo";
  const byTh = {};
  for (const p of inv) (byTh[thresholdsText(p.thresholds)] ||= []).push(profileLabel(p));
  const groups = Object.entries(byTh).sort((a, b) => b[1].length - a[1].length);
  if (groups.length === 1) return `${inv.length} profili, tutti con ${groups[0][0]}`;
  return groups.map(([th, labels]) => `${[...new Set(labels)].join(", ")}: ${th}`).join("  —  ");
}

/* ------------------------------------------------------------------ */
/* Componenti locali                                                   */
/* ------------------------------------------------------------------ */
function Metric({ P, label, value, prev, cur }) {
  const d = prev != null && prev !== 0 && cur != null ? (cur - prev) / prev : null;
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 13, color: P.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {d != null && <div style={{ fontSize: 12, color: P.textMuted, fontVariantNumeric: "tabular-nums" }}>{d >= 0 ? "+" : "−"}{Math.abs(d * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })}% sul mese prima</div>}
    </div>
  );
}

// Campo del simulatore: se il valore è diverso da quello reale si vede (bordo + "era X")
function SimInput({ P, st, value, was, onChange, label, width, step }) {
  const changed = was !== undefined && String(value) !== String(was);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
      <input type="number" step={step} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}
        style={{ ...st.input, width, padding: "6px 8px", fontVariantNumeric: "tabular-nums", borderColor: changed ? P.accent : P.border, boxShadow: changed ? `0 0 0 1px ${P.accent}` : "none" }} />
      <span style={{ fontSize: 11, color: P.accentSoftText, height: 14 }}>{changed ? `era ${was}` : ""}</span>
    </span>
  );
}

function FilterChip({ P, label, active, danger, onClick, disabled, closable }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 13, cursor: disabled ? "default" : "pointer", fontFamily: FONTS.body,
        border: `1px solid ${active ? P.accent : danger ? P.accentRed : P.border}`,
        background: active ? P.accentSoft : P.surface,
        color: active ? P.accentSoftText : danger ? P.accentRed : disabled ? P.textMuted : P.textPrimary }}>
      {danger && !active && <AlertTriangle size={13} />}{label}{closable && <X size={12} />}
    </button>
  );
}

function TierBar({ byPct, tier, P }) {
  const entries = Object.entries(byPct).map(([p, c]) => [Number(p), c]).sort((a, b) => a[0] - b[0]);
  const tot = entries.reduce((a, [, c]) => a + c, 0) || 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", width: 120, height: 10, borderRadius: 3, overflow: "hidden", border: `1px solid ${P.border}` }}>
        {entries.map(([p, c]) => <div key={p} style={{ width: `${(c / tot) * 100}%`, background: tier(p).fill }} title={`${c} turni a ${fmtPct(p)}`} />)}
      </div>
      <span style={{ fontSize: 12, color: P.textMuted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{entries.map(([p, c]) => `${c}×${fmtPct(p)}`).join(" ")}</span>
    </div>
  );
}

function Disclosure({ P, open, onToggle, title, summary, icon, children }) {
  return (
    <section style={{ border: `1px solid ${P.border}`, borderRadius: 10, background: P.surface, marginBottom: 14 }}>
      <button onClick={onToggle} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: P.textPrimary, fontFamily: FONTS.body }}>
        {open ? <ChevronDown size={16} color={P.textMuted} /> : <ChevronRight size={16} color={P.textMuted} />}
        {icon && <span style={{ color: P.textMuted, display: "inline-flex" }}>{icon}</span>}
        <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
        {!open && <span style={{ fontSize: 13, color: P.textMuted, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{summary}</span>}
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </section>
  );
}

function styles(P) {
  return {
    card: { background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10 },
    h2: { fontSize: 16, fontWeight: 500, margin: "0 0 10px", color: P.textPrimary },
    lbl: { display: "block", fontSize: 12, color: P.textSecondary, fontWeight: 500, marginBottom: 6 },
    input: { width: "100%", padding: "9px 12px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, color: P.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" },
    th: { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 500, color: P.textMuted, whiteSpace: "nowrap", background: P.surface, borderBottom: `1px solid ${P.border}` },
    td: { padding: "9px 12px", verticalAlign: "middle" },
    gridTd: { padding: "5px 6px", verticalAlign: "top", borderTop: `1px solid ${P.borderSoft}` },
    footTd: { padding: "10px 12px", fontWeight: 500, background: P.surfaceAlt, borderTop: `1px solid ${P.border}`, whiteSpace: "nowrap" },
    iconBtn: { padding: "8px 9px", background: "transparent", border: `1px solid ${P.border}`, borderRadius: 7, color: P.textSecondary, cursor: "pointer", display: "inline-flex", alignItems: "center" },
    ghostBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, color: P.textSecondary, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", textDecoration: "none" },
  };
}
