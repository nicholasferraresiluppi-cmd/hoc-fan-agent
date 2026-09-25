"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, CalendarDays, AlertTriangle, Download, FlaskConical, RotateCcw, Plus, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";
import HowToRead from "@/components/HowToRead";
import CreatorPicker from "@/components/CreatorPicker";

/**
 * /admin/comp-calendar — Griglia calendario compensation per creator × mese.
 * v2: autocomplete creator (alias reali dal mese), stat cards costo operatori,
 * simulatore scaglioni alternativi (real vs sim, per operatore e totale),
 * design compatto.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS_IT = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const fmt$ = (n) => n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
const fmtPct = (v, d = 0) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;

// Design (25/09/2026, pilota leggibilità): lo scaglione è un dato ORDINATO →
// scala SEQUENZIALE di una sola tinta (scuro = scaglione basso, chiaro = alto),
// come vuole la letteratura sui colori nei dati (Brewer). Il rosso resta SOLO
// per le anomalie: se tutto è colorato, niente spicca.
const TIER_SCALE = ["#5b52a8", "#7a6ee0", "#9d91f7", "#c3bafa", "#e4e0fd"];
const tierColor = (i, n) => TIER_SCALE[n <= 1 ? 2 : Math.round((i / (n - 1)) * (TIER_SCALE.length - 1))];
const NUM = { fontVariantNumeric: "tabular-nums" };

// % vincente con formula bracket su intero importo (confermata dalla ricerca)
function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage != null && t.percentage !== "");
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let winning = sorted[0];
  for (const t of sorted) if ((Number(t.threshold) || 0) <= total) winning = t;
  return Number(winning.percentage);
}

export default function CompCalendarPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [creator, setCreator] = useState("");
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [aliases, setAliases] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Alias candidati quando la ricerca è ambigua (es. "Laura" → IT + ESP):
  // mai fondere team diversi, l'utente sceglie quello esatto
  const [candidates, setCandidates] = useState(null);
  // Simulatore PER CLASSE cosellers: un creator non ha un solo profilo —
  // Solo/Coppia/Triplo hanno profili propri con scaglioni potenzialmente
  // diversi. simByClass = { 1: tiers[], 2: tiers[], 3: tiers[] }.
  const [simByClass, setSimByClass] = useState(null);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);

  async function fetchResearch(c, p) {
    setLoading(true); setError(null); setData(null); setCandidates(null);
    try {
      const res = await fetch(`/api/admin/shift-research?creator=${encodeURIComponent(c)}&period_id=${p}`);
      const j = await res.json();
      if (!res.ok) {
        if (j?.ambiguous && j?.candidates?.length) {
          setCandidates(j.candidates);
          setError(j.error);
          return;
        }
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Deep-link: ?creator=X&period_id=YYYY-MM precompila e genera da solo
  // (es. arrivo da /admin/profiles-compare)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("creator");
    const p = sp.get("period_id");
    if (p && /^\d{4}-\d{2}$/.test(p)) setPeriodId(p);
    if (c) {
      setCreator(c);
      setTimeout(() => fetchResearch(c, p && /^\d{4}-\d{2}$/.test(p) ? p : periodId), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autocomplete: alias reali del mese selezionato
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/creator-aliases?period_id=${periodId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.aliases) setAliases(j.aliases); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [periodId]);

  // Scaglioni REALI per classe cosellers (dall'inventario profili):
  // per ogni classe presente nei turni, il profilo più usato di quella classe
  const origByClass = useMemo(() => {
    if (!data?.rows?.length) return null;
    const classes = [...new Set(data.rows.map((r) => r.profile_cosellers ?? 1))].sort((a, b) => a - b);
    const inv = data.profiles_inventory || [];
    const byClass = {};
    for (const cls of classes) {
      const prof = inv
        .filter((p) => (p.cosellers_count ?? 1) === cls && p.thresholds?.length)
        .sort((a, b) => b.shifts - a.shifts)[0];
      const ths = prof?.thresholds?.length ? prof.thresholds : (data.thresholds_common || []);
      if (ths.length) byClass[cls] = ths.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 }));
    }
    return Object.keys(byClass).length ? byClass : null;
  }, [data]);

  // Inizializza il simulatore dagli scaglioni reali per classe
  useEffect(() => {
    setSimByClass(origByClass ? JSON.parse(JSON.stringify(origByClass)) : null);
  }, [origByClass]);

  async function run(overrideCreator) {
    const c = (typeof overrideCreator === "string" ? overrideCreator : creator).trim();
    if (!c || !periodId) return;
    if (typeof overrideCreator === "string") setCreator(overrideCreator);
    await fetchResearch(c, periodId);
  }

  // ===== Griglia + aggregati (con attribuzione earnings al creator) =====
  const grid = useMemo(() => {
    if (!data?.rows?.length) return null;
    const rows = data.rows.map((r) => {
      const share = r.sales_total_shift > 0 ? r.sales_on_creator / r.sales_total_shift : (r.mono ? 1 : 0);
      return { ...r, earnings_attr: Math.round(r.earnings * share * 100) / 100 };
    });

    const slotCounts = {};
    for (const r of rows) {
      const k = `${r.start}–${r.end}`;
      slotCounts[k] = (slotCounts[k] || 0) + 1;
    }
    const mainSlots = Object.entries(slotCounts).filter(([, c]) => c >= 3).map(([k]) => k).sort((a, b) => a.localeCompare(b));
    const hasAltri = Object.entries(slotCounts).some(([, c]) => c < 3);
    const columns = [...mainSlots, ...(hasAltri ? ["Altri"] : [])];

    const pcts = [...new Set(rows.map((r) => r.expected_pct).filter((p) => p != null))].sort((a, b) => a - b);
    const colorOf = (pct) => {
      if (pct == null) return CP.textMuted;
      const i = pcts.indexOf(pct);
      if (i >= 0) return tierColor(i, pcts.length);
      // pct simulato non presente nella scala reale: posizione relativa
      const below = pcts.filter((p) => p < pct).length;
      return tierColor(Math.min(below, pcts.length - 1), pcts.length);
    };

    const [y, m] = (data.period_id || "").split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date, dow: DAYS_IT[new Date(y, m - 1, d).getDay()], dayNum: d });
    }
    // Turni che col fuso italiano scivolano fuori dal mese (es. 31/5 23:30 ITA
    // sincronizzato nel wage di maggio ma datato 1/6): aggiungi i giorni extra
    // in coda invece di perderli.
    const monthDates = new Set(days.map((d) => d.date));
    const extraDates = [...new Set(rows.map((r) => r.date))].filter((dt) => dt && !monthDates.has(dt)).sort();
    for (const date of extraDates) {
      const [ey, em, ed] = date.split("-").map(Number);
      days.push({ date, dow: DAYS_IT[new Date(ey, em - 1, ed).getDay()], dayNum: ed, overflow: true });
    }

    const cellMap = {};
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      (cellMap[`${r.date}|${slotKey}`] = cellMap[`${r.date}|${slotKey}`] || []).push(r);
    }

    const groupSize = {};
    for (const r of rows) {
      const gk = `${r.date}|${r.start}|${r.end}`;
      groupSize[gk] = (groupSize[gk] || 0) + 1;
    }
    const cosellerFlags = new Set();
    for (const r of rows) {
      if (r.profile_cosellers == null) continue;
      if (groupSize[`${r.date}|${r.start}|${r.end}`] !== r.profile_cosellers) cosellerFlags.add(r.shift_id);
    }

    const creatorTokens = (data.matched_aliases || []).flatMap((a) =>
      a.toLowerCase().split(/[\s\-_]+/).filter((t) => t.length >= 3)
    );
    const wrongCreatorFlags = new Set();
    for (const r of rows) {
      if (!r.profile_name) continue;
      if (!creatorTokens.some((t) => r.profile_name.toLowerCase().includes(t))) wrongCreatorFlags.add(r.shift_id);
    }

    const colTotals = {};
    for (const c of columns) colTotals[c] = { sales: 0, count: 0 };
    const dayTotals = {};
    let totSales = 0, totEarn = 0, emptyCells = 0;
    for (const r of rows) {
      const slotKey = mainSlots.includes(`${r.start}–${r.end}`) ? `${r.start}–${r.end}` : "Altri";
      colTotals[slotKey].sales += r.sales_on_creator;
      colTotals[slotKey].count += 1;
      dayTotals[r.date] = dayTotals[r.date] || { sales: 0, count: 0 };
      dayTotals[r.date].sales += r.sales_on_creator;
      dayTotals[r.date].count += 1;
      totSales += r.sales_on_creator;
      totEarn += r.earnings_attr;
    }
    for (const d of days) for (const c of mainSlots) if (!cellMap[`${d.date}|${c}`]) emptyCells++;

    const opAgg = {};
    for (const r of rows) {
      const o = (opAgg[r.operator] = opAgg[r.operator] || { turni: 0, sales: 0, earn: 0, byPct: {} });
      o.turni += 1;
      o.sales += r.sales_on_creator;
      o.earn += r.earnings_attr;
      if (r.expected_pct != null) {
        const k = r.expected_pct.toFixed(2);
        o.byPct[k] = (o.byPct[k] || 0) + 1;
      }
    }
    const operators = Object.entries(opAgg)
      .map(([name, o]) => ({ name, ...o }))
      .sort((a, b) => b.sales - a.sales);

    return { rows, columns, mainSlots, days, cellMap, colTotals, dayTotals, colorOf, pcts, cosellerFlags, wrongCreatorFlags, operators, totSales, totEarn, emptyCells };
  }, [data]);

  // ===== Simulazione scaglioni alternativi (PER CLASSE cosellers) =====
  const sim = useMemo(() => {
    if (!grid || !simByClass) return null;
    const classKeys = Object.keys(simByClass).map(Number).sort((a, b) => a - b);
    if (classKeys.length === 0) return null;
    let simTot = 0;
    const opSim = {};
    const byPctSim = {};
    const simRows = [];
    for (const r of grid.rows) {
      const cls = r.profile_cosellers ?? 1;
      const tiers = simByClass[cls] || simByClass[classKeys[0]];
      const valid = (tiers || []).filter((t) => t.percentage !== "" && t.percentage != null);
      const pct = bracketPct(r.sales_total_shift, valid);
      if (pct == null) continue;
      const e = pct * r.sales_on_creator;
      simTot += e;
      opSim[r.operator] = (opSim[r.operator] || 0) + e;
      const k = pct.toFixed(3);
      byPctSim[k] = (byPctSim[k] || 0) + 1;
      const realPct = r.expected_pct ?? r.eff_pct;
      simRows.push({
        ...r,
        sim_class: cls,
        sim_pct: pct,
        sim_earn: Math.round(e * 100) / 100,
        row_delta: Math.round((e - r.earnings_attr) * 100) / 100,
        bracket_changed: realPct != null && Math.abs(pct - realPct) > 0.0001,
      });
    }
    return {
      total: Math.round(simTot),
      delta: Math.round(simTot - grid.totEarn),
      opSim,
      byPctSim: Object.entries(byPctSim).map(([p, c]) => ({ pct: parseFloat(p), count: c })).sort((a, b) => a.pct - b.pct),
      simRows,
      changedCount: simRows.filter((r) => r.bracket_changed).length,
    };
  }, [grid, simByClass]);

  const simChanged = useMemo(() => {
    if (!simByClass || !origByClass) return false;
    return JSON.stringify(simByClass) !== JSON.stringify(origByClass);
  }, [simByClass, origByClass]);

  // Vista griglia simulata: quando modifichi gli scaglioni, la TIMELINE si
  // ricolora coi tier simulati → vedi a colpo d'occhio se le soglie sono
  // calibrate (mix di colori) o troppo alte (tutto rosso = nessuno le supera)
  const [gridSim, setGridSim] = useState(false);
  useEffect(() => { setGridSim(simChanged); }, [simChanged]);

  const simPctById = useMemo(() => {
    if (!sim?.simRows) return null;
    const m = new Map();
    for (const r of sim.simRows) m.set(r.shift_id, r.sim_pct);
    return m;
  }, [sim]);

  // Distribuzione turni per scaglione: reale → simulato (il check calibrazione)
  const tierDist = useMemo(() => {
    if (!grid) return null;
    const real = {};
    for (const r of grid.rows) if (r.expected_pct != null) {
      const k = r.expected_pct.toFixed(3);
      real[k] = (real[k] || 0) + 1;
    }
    const simD = {};
    if (sim) for (const sr of sim.simRows) {
      const k = sr.sim_pct.toFixed(3);
      simD[k] = (simD[k] || 0) + 1;
    }
    const keys = [...new Set([...Object.keys(real), ...Object.keys(simD)])].sort((a, b) => parseFloat(a) - parseFloat(b));
    return keys.map((k) => ({ pct: parseFloat(k), real: real[k] || 0, sim: simD[k] || 0 }));
  }, [grid, sim]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1500, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Calendario compensi</span>
          </div>
        }
        section="Comp & Ben"
        title="Calendario compensi"
        subtitle="Per una creator e un mese: chi ha lavorato in ogni fascia, quanto ha venduto, quale scaglione è stato pagato. Sotto, il simulatore per provare scaglioni diversi sui turni già chiusi."
      />

      <CompNav />

      <HowToRead items={[
        "Ogni riga è un giorno, ogni colonna una fascia oraria. In ogni casella: chi ha lavorato, quanto ha venduto e la percentuale pagata.",
        "La barretta a sinistra del nome indica lo scaglione: più chiara = scaglione più alto. Il colore è uno solo apposta: salta all'occhio solo ciò che è anomalo, in rosso.",
        "Il triangolo rosso segnala qualcosa da controllare: pagamento fuori scaglione, numero di persone diverso dal profilo, o profilo di un'altra creator. Passa il mouse per i dettagli.",
        "Nel simulatore cambi le soglie e vedi subito quanto sarebbe costato il mese e chi ci guadagnava o perdeva, turno per turno.",
      ]} />

      {/* Scelta creator e mese */}
      <CpCard padding="16px 20px" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={lbl}>Creator <span style={{ color: CP.textMuted, fontWeight: 400 }}>· {aliases.length} attive nel mese</span></label>
            <CreatorPicker aliases={aliases} value={creator} onSelect={(alias) => run(alias)} />
          </div>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 150, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading || !creator.trim()} style={primaryBtn(loading || !creator.trim())}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> Carico…</> : <><CalendarDays size={14} /> Mostra</>}
          </button>
          {data?.csv_url && (
            <a href={data.csv_url} style={ghostBtn}>
              <Download size={14} /> Scarica CSV
            </a>
          )}
        </div>
      </CpCard>

      {error && (
        <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: candidates ? CP.textPrimary : CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
            <AlertCircle size={16} color={candidates ? CP.textMuted : CP.accentRed} /> {error}
          </div>
          {candidates && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {candidates.map((a) => (
                <button key={a} onClick={() => run(a)} style={ghostBtn}>{a}</button>
              ))}
            </div>
          )}
        </CpCard>
      )}

      {data && grid && (
        <>
          {/* Numeri chiave: valori nel colore del testo, il colore solo dove c'è un segnale */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Venduto sulla creator" value={fmt$(grid.totSales)} sub={`${grid.rows.length} turni`} />
            <StatCard label="Pagato agli operatori" value={fmt$(grid.totEarn)} sub="quota attribuita a questa creator" />
            <StatCard label="Costo sul venduto" value={grid.totSales > 0 ? fmtPct(grid.totEarn / grid.totSales, 1) : "—"} sub="quanto pagato su ogni $ venduto" />
            <StatCard label="Operatori" value={grid.operators.length} sub="con almeno un turno" />
            <StatCard label="Fasce scoperte" value={grid.emptyCells} color={grid.emptyCells > 0 ? CP.accentRed : undefined} sub={`su ${grid.days.length * grid.mainSlots.length} fasce del mese`} />
          </div>

          {/* Qualità del dato: venduto non attribuito */}
          {data.takes_quality && data.takes_quality.rows_no_sales > data.takes_quality.rows_total * 0.3 && (
            <Notice>
              <b>{data.takes_quality.rows_no_sales} turni su {data.takes_quality.rows_total} senza venduto attribuito</b>{" "}
              ({data.takes_quality.rows_no_takes} senza alcuna vendita registrata in CreatorsPro). Pagato e scaglioni restano corretti:
              manca il venduto per turno alla fonte, tipico dei team condivisi. Va sistemato in CreatorsPro, non è un errore dell&apos;app.
            </Notice>
          )}

          {/* Controlli: prima le anomalie, poi il riepilogo */}
          {(() => {
            const mism = data.phase_b?.mismatches || 0;
            const issues = [
              mism ? `${mism} turni pagati fuori scaglione` : null,
              grid.cosellerFlags.size ? `${grid.cosellerFlags.size} turni con numero di persone diverso dal profilo` : null,
              grid.wrongCreatorFlags.size ? `${grid.wrongCreatorFlags.size} turni con il profilo di un'altra creator` : null,
            ].filter(Boolean);
            return issues.length ? (
              <Notice danger>
                <b>Da controllare:</b> {issues.join(" · ")}. Nella griglia li trovi col triangolo rosso.
              </Notice>
            ) : (
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 16 }}>Nessuna anomalia: tutti i turni sono pagati secondo il loro scaglione.</div>
            );
          })()}

          {/* Profili di pagamento usati: testo semplice, niente etichette colorate */}
          <section style={{ marginBottom: 20 }}>
            <h2 style={h2}>Profili di pagamento usati nel mese</h2>
            <div style={{ border: `1px solid ${CP.border}`, borderRadius: 10, overflow: "hidden" }}>
              {(data.profiles_inventory || []).map((p, i) => (
                <div key={p.name} style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap", padding: "10px 14px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 13 }}>
                  <span style={{ flex: "1 1 220px", color: CP.textPrimary }}>{p.name}</span>
                  <span style={{ color: CP.textMuted, ...NUM, minWidth: 190 }}>{p.cosellers_count ?? "?"} {p.cosellers_count === 1 ? "persona" : "persone"} · {p.shifts} turni · {fmt$(p.sales)}</span>
                  <span style={{ color: CP.textSecondary, ...NUM }}>
                    {(p.thresholds || []).map((t) => `${t.threshold > 0 ? `da ${fmt$(t.threshold)}` : "base"} ${fmtPct(t.percentage)}`).join("  ·  ")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Distribuzione per scaglione: una barra proporzionale (si confronta a colpo d'occhio) */}
          {tierDist && (
            <section style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <h2 style={{ ...h2, margin: 0 }}>Turni per scaglione</h2>
                {sim && simChanged && (
                  <div style={{ display: "flex", gap: 4, padding: 3, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8 }}>
                    {[["real", "Reali"], ["sim", "Simulati"]].map(([v, lab]) => (
                      <button key={v} onClick={() => setGridSim(v === "sim")}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontFamily: FONTS.body,
                          background: (gridSim ? "sim" : "real") === v ? CP.surfaceAlt : "transparent",
                          color: (gridSim ? "sim" : "real") === v ? CP.textPrimary : CP.textMuted }}>
                        {lab}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(() => {
                const tot = tierDist.reduce((a, t) => a + (gridSim ? t.sim : t.real), 0) || 1;
                return (
                  <>
                    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: CP.surface, maxWidth: 720 }}>
                      {tierDist.map((t) => {
                        const v = gridSim ? t.sim : t.real;
                        return v ? <div key={t.pct} title={`${fmtPct(t.pct)}: ${v} turni`} style={{ width: `${(v / tot) * 100}%`, background: grid.colorOf(t.pct) }} /> : null;
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, fontSize: 13, color: CP.textSecondary, ...NUM }}>
                      {tierDist.map((t) => {
                        const delta = t.sim - t.real;
                        return (
                          <span key={t.pct} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: grid.colorOf(t.pct) }} />
                            <span style={{ color: CP.textPrimary }}>{fmtPct(t.pct)}</span> {t.real} turni
                            {simChanged && delta !== 0 && <span style={{ color: CP.textMuted }}>→ {t.sim} ({delta > 0 ? "+" : ""}{delta})</span>}
                          </span>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {gridSim && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>La griglia mostra gli scaglioni simulati. Se quasi tutto finisce nello stesso scaglione, le soglie vanno ricalibrate.</div>}
            </section>
          )}

          {/* Griglia: righe sottili, niente scatole; il colore solo nella barretta dello scaglione */}
          <div style={{ border: `1px solid ${gridSim ? CP.accent + "66" : CP.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 3 }}>
                    <th style={{ ...th, position: "sticky", left: 0, zIndex: 4, minWidth: 72 }}>Giorno</th>
                    {grid.columns.map((c) => <th key={c} style={{ ...th, minWidth: 170 }}>{c.replace("–", " – ")}</th>)}
                    <th style={{ ...th, textAlign: "right", minWidth: 90 }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.days.map((d) => {
                    const dt = grid.dayTotals[d.date];
                    const weekend = d.dow === "Sab" || d.dow === "Dom";
                    return (
                      <tr key={d.date} style={{ borderTop: `1px solid ${CP.borderSoft}`, background: weekend ? "rgba(255,255,255,0.018)" : "transparent" }}>
                        <td style={{ ...td, position: "sticky", left: 0, background: CP.bg, whiteSpace: "nowrap", color: CP.textSecondary, zIndex: 1 }}>
                          <span style={{ color: weekend ? CP.textPrimary : CP.textSecondary }}>{d.dow}</span> <span style={NUM}>{d.dayNum}</span>
                        </td>
                        {grid.columns.map((c) => {
                          const cell = grid.cellMap[`${d.date}|${c}`] || [];
                          if (cell.length === 0) return <td key={c} style={{ ...td, color: CP.textMuted }}>—</td>;
                          return (
                            <td key={c} style={td}>
                              {cell.map((r) => {
                                const simPct = gridSim && simPctById ? simPctById.get(r.shift_id) : null;
                                const dispPct = simPct ?? r.expected_pct;
                                const tierChanged = simPct != null && r.expected_pct != null && Math.abs(simPct - r.expected_pct) > 0.0001;
                                const mismatch = !gridSim && r.delta_pct != null && Math.abs(r.delta_pct) > 0.005;
                                const flag = mismatch || (!gridSim && (grid.cosellerFlags.has(r.shift_id) || grid.wrongCreatorFlags.has(r.shift_id)));
                                return (
                                  <div key={r.shift_id}
                                    title={`${r.operator} · ${r.start}–${r.end}\nVenduto ${fmt$(r.sales_on_creator)} · pagato ${fmt$(r.earnings_attr)} (${fmtPct(r.eff_pct, 1)})\nProfilo "${r.profile_name || "?"}" (${r.profile_cosellers ?? "?"} persone)${simPct != null ? `\nSimulato: ${fmtPct(simPct)} (reale ${fmtPct(r.expected_pct)})${tierChanged ? " — cambia scaglione" : ""}` : ""}${mismatch ? "\nPagato fuori scaglione" : ""}${grid.cosellerFlags.has(r.shift_id) ? "\nNumero di persone diverso dal profilo" : ""}${grid.wrongCreatorFlags.has(r.shift_id) ? "\nProfilo di un'altra creator" : ""}`}
                                    style={{ display: "grid", gridTemplateColumns: "3px 1fr auto auto", alignItems: "center", columnGap: 8, padding: "3px 0", cursor: "default" }}>
                                    <span style={{ width: 3, height: 14, borderRadius: 2, background: grid.colorOf(dispPct), outline: tierChanged ? `1px solid ${CP.textPrimary}` : "none" }} />
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: flag ? CP.accentRed : CP.textSecondary }}>
                                      {flag && <AlertTriangle size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />}
                                      {r.operator.split(" ")[0]}
                                    </span>
                                    <span style={{ ...NUM, color: CP.textPrimary, textAlign: "right" }}>{fmt$(r.sales_on_creator)}</span>
                                    <span style={{ ...NUM, color: CP.textMuted, fontSize: 12, minWidth: 30, textAlign: "right" }}>{fmtPct(dispPct)}</span>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                        <td style={{ ...td, textAlign: "right", ...NUM, color: dt ? CP.textPrimary : CP.textMuted, fontWeight: 500 }}>
                          {dt ? fmt$(dt.sales) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${CP.border}`, background: CP.surface, position: "sticky", bottom: 0 }}>
                    <td style={{ ...td, fontWeight: 500, position: "sticky", left: 0, background: CP.surface }}>Totale</td>
                    {grid.columns.map((c) => {
                      const t = grid.colTotals[c];
                      return (
                        <td key={c} style={{ ...td, ...NUM }}>
                          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmt$(t.sales)}</span>
                          <span style={{ color: CP.textMuted }}> · {t.count} turni</span>
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "right", ...NUM, fontWeight: 500 }}>{fmt$(grid.totSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ===== Simulatore ===== */}
          <h2 style={{ ...h2, display: "flex", alignItems: "center", gap: 8 }}>
            <FlaskConical size={15} color={CP.textMuted} /> Simulatore: e se gli scaglioni fossero diversi?
          </h2>
          <CpCard accent={simChanged ? CP.accent : undefined} padding="18px 22px" style={{ marginBottom: 28 }}>
            {simByClass && (
              <>
                {Object.keys(simByClass).map(Number).sort((a, b) => a - b).map((cls) => {
                  const tiers = simByClass[cls];
                  const setTiers = (next) => setSimByClass({ ...simByClass, [cls]: next });
                  const clsLabel = cls === 1 ? "Da solo" : cls === 2 ? "In coppia" : cls === 3 ? "In tre" : `In ${cls}`;
                  return (
                    <div key={cls} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${CP.borderSoft}` }}>
                      <div style={{ minWidth: 92, fontSize: 13, color: CP.textPrimary, paddingBottom: 10 }}>{clsLabel}</div>
                      {tiers.map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                          <div>
                            <label style={lbl}>{i === 0 ? "Base, da $" : `Soglia ${i + 1}, da $`}</label>
                            <input type="number" value={t.threshold} disabled={i === 0}
                              onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, threshold: e.target.value === "" ? "" : Number(e.target.value) } : x))}
                              style={{ ...input, width: 96, opacity: i === 0 ? 0.5 : 1, ...NUM }} />
                          </div>
                          <div>
                            <label style={lbl}>%</label>
                            <input type="number" step="0.5" value={t.percentage === "" ? "" : Math.round(Number(t.percentage) * 1000) / 10}
                              onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, percentage: e.target.value === "" ? "" : Number(e.target.value) / 100 } : x))}
                              style={{ ...input, width: 68, ...NUM }} />
                          </div>
                          {i > 0 && <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))} title="Rimuovi scaglione" aria-label="Rimuovi scaglione" style={iconBtn}><X size={13} /></button>}
                        </div>
                      ))}
                      <button onClick={() => setTiers([...tiers, { threshold: (Number(tiers[tiers.length - 1]?.threshold) || 0) + 500, percentage: (Number(tiers[tiers.length - 1]?.percentage) || 0.1) + 0.02 }])}
                        title="Aggiungi scaglione" aria-label="Aggiungi scaglione" style={iconBtn}><Plus size={13} /></button>
                    </div>
                  );
                })}
                <div style={{ marginBottom: 16 }}>
                  <button onClick={() => setSimByClass(origByClass ? JSON.parse(JSON.stringify(origByClass)) : null)} style={ghostBtn}>
                    <RotateCcw size={13} /> Torna agli scaglioni reali
                  </button>
                </div>

                {sim && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <StatCard label="Pagato davvero" value={fmt$(grid.totEarn)} />
                    <StatCard label="Pagato con la simulazione" value={fmt$(sim.total)} />
                    <StatCard label="Differenza per gli operatori" value={`${sim.delta >= 0 ? "+" : ""}${fmt$(sim.delta)}`}
                      color={sim.delta === 0 ? undefined : sim.delta > 0 ? CP.accentRed : CP.accentGreen}
                      sub={grid.totEarn > 0 ? `${sim.delta >= 0 ? "+" : ""}${(100 * sim.delta / grid.totEarn).toFixed(1)}% rispetto al reale` : null} />
                    <StatCard label="Margine sul venduto" value={grid.totSales > 0 ? fmtPct((grid.totSales - sim.total) / grid.totSales, 1) : "—"}
                      sub={`oggi: ${grid.totSales > 0 ? fmtPct((grid.totSales - grid.totEarn) / grid.totSales, 1) : "—"}`} />
                  </div>
                )}
                {!simChanged && (
                  <div style={{ marginTop: 12, fontSize: 13, color: CP.textMuted }}>
                    Qui sopra ci sono gli scaglioni reali. Cambia una soglia o una percentuale: il confronto si aggiorna subito sui {grid.rows.length} turni del mese.
                  </div>
                )}

                {sim && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Turno per turno: reale e simulato ({sim.simRows.length})</h3>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: CP.textSecondary, cursor: "pointer" }}>
                        <input type="checkbox" checked={showOnlyChanged} onChange={(e) => setShowOnlyChanged(e.target.checked)} style={{ accentColor: CP.accent }} />
                        Solo i turni che cambiano scaglione ({sim.changedCount})
                      </label>
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", border: `1px solid ${CP.border}`, borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
                            <th style={th}>Data</th>
                            <th style={th}>Orario</th>
                            <th style={th}>Operatore</th>
                            <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                            <th style={{ ...th, textAlign: "right" }}>% reale</th>
                            <th style={{ ...th, textAlign: "right" }}>Pagato reale</th>
                            <th style={{ ...th, textAlign: "right" }}>% simulata</th>
                            <th style={{ ...th, textAlign: "right" }}>Pagato simulato</th>
                            <th style={{ ...th, textAlign: "right" }}>Differenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sim.simRows.filter((r) => !showOnlyChanged || r.bracket_changed).map((r) => (
                            <tr key={r.shift_id} style={{ borderTop: `1px solid ${CP.borderSoft}`, background: r.bracket_changed ? CP.accentSoft + "55" : "transparent" }}>
                              <td style={{ ...td, ...NUM, color: CP.textSecondary }}>{r.date.slice(8)}/{r.date.slice(5, 7)}</td>
                              <td style={{ ...td, ...NUM, color: CP.textSecondary }}>{r.start}–{r.end}</td>
                              <td style={td}>{r.operator}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right" }}>{fmt$(r.sales_on_creator)}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right", color: CP.textSecondary }}>{fmtPct(r.expected_pct ?? r.eff_pct)}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right", color: CP.textSecondary }}>{fmt$(r.earnings_attr)}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right", color: r.bracket_changed ? CP.textPrimary : CP.textSecondary, fontWeight: r.bracket_changed ? 500 : 400 }}>{fmtPct(r.sim_pct)}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right" }}>{fmt$(r.sim_earn)}</td>
                              <td style={{ ...td, ...NUM, textAlign: "right", color: Math.abs(r.row_delta) < 0.5 ? CP.textMuted : r.row_delta > 0 ? CP.accentRed : CP.accentGreen }}>
                                {Math.abs(r.row_delta) < 0.5 ? "—" : `${r.row_delta > 0 ? "+" : ""}${fmt$(r.row_delta)}`}
                              </td>
                            </tr>
                          ))}
                          {showOnlyChanged && sim.changedCount === 0 && (
                            <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: CP.textMuted, padding: 18 }}>Nessun turno cambia scaglione con queste soglie.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CpCard>

          {/* Per operatore */}
          <h2 style={h2}>Per operatore{simChanged ? ": reale e simulato" : ""}</h2>
          <div style={{ border: `1px solid ${CP.border}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Operatore</th>
                  <th style={{ ...th, textAlign: "right" }}>Turni</th>
                  <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                  <th style={{ ...th, textAlign: "right" }}>Pagato</th>
                  {simChanged && <th style={{ ...th, textAlign: "right" }}>Simulato</th>}
                  {simChanged && <th style={{ ...th, textAlign: "right" }}>Differenza</th>}
                  <th style={th}>Turni per scaglione</th>
                </tr>
              </thead>
              <tbody>
                {grid.operators.map((o) => {
                  const simEarn = sim?.opSim?.[o.name];
                  const delta = simEarn != null ? simEarn - o.earn : null;
                  return (
                    <tr key={o.name} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                      <td style={{ ...td, color: CP.textPrimary }}>{o.name}</td>
                      <td style={{ ...td, ...NUM, textAlign: "right", color: CP.textSecondary }}>{o.turni}</td>
                      <td style={{ ...td, ...NUM, textAlign: "right" }}>{fmt$(o.sales)}</td>
                      <td style={{ ...td, ...NUM, textAlign: "right" }}>{fmt$(o.earn)}</td>
                      {simChanged && <td style={{ ...td, ...NUM, textAlign: "right" }}>{simEarn != null ? fmt$(simEarn) : "—"}</td>}
                      {simChanged && (
                        <td style={{ ...td, ...NUM, textAlign: "right", color: delta == null || Math.abs(delta) < 0.5 ? CP.textMuted : delta > 0 ? CP.accentRed : CP.accentGreen }}>
                          {delta != null ? `${delta >= 0 ? "+" : ""}${fmt$(delta)}` : "—"}
                        </td>
                      )}
                      <td style={{ ...td, ...NUM, color: CP.textSecondary }}>
                        {Object.entries(o.byPct).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([pct, count]) => (
                          <span key={pct} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 14 }}>
                            <span style={{ width: 3, height: 12, borderRadius: 2, background: grid.colorOf(parseFloat(pct)) }} />
                            {count} a {fmtPct(parseFloat(pct))}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Avviso: testo leggibile su superficie neutra; rosso solo nel bordo se è un problema.
function Notice({ children, danger }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 16, borderRadius: 10, background: CP.surface, border: `1px solid ${CP.border}`, borderLeft: `3px solid ${danger ? CP.accentRed : CP.textMuted}`, fontSize: 13, lineHeight: 1.55, color: CP.textSecondary }}>
      <AlertTriangle size={15} color={danger ? CP.accentRed : CP.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

const h2 = { fontSize: 15, fontWeight: 500, color: CP.textPrimary, margin: "0 0 10px" };
const lbl = { display: "block", fontSize: 12, color: CP.textSecondary, fontWeight: 500, marginBottom: 6, fontFamily: FONTS.body };
const input = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 500, color: CP.textMuted, fontFamily: FONTS.body, whiteSpace: "nowrap", background: CP.surface, borderBottom: `1px solid ${CP.border}` };
const td = { padding: "6px 12px", verticalAlign: "top" };
const iconBtn = { padding: "9px 10px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, cursor: "pointer", display: "inline-flex", alignItems: "center" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", textDecoration: "none" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "10px 16px",
  background: disabled ? CP.surfaceAlt : CP.accent,
  color: disabled ? CP.textMuted : CP.accentInk,
  border: "none", borderRadius: 8,
  fontSize: 14, fontWeight: 500, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
