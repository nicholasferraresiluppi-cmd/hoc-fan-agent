"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { Info, Target, ArrowRight, Search, Loader2, CheckCircle2, XCircle, Columns3, Check, Wrench, ShieldCheck, Languages, Tags, RefreshCw, Link2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

// Colonne KPI Infloww opzionali (aggiungibili via picker)
// id deve matchare il field sull'oggetto op restituito dall'API
const EXTRA_COLUMNS = [
  { id: "infloww_sales", label: "Sales Infw", tooltip: "Sales totali da Infloww (per-chatter, dato grezzo)", type: "currency", width: "0.9fr" },
  { id: "infloww_purch", label: "Purch", tooltip: "Numero di PPV unlockati da Infloww", type: "number", width: "0.7fr" },
  { id: "infloww_fan_cvr", label: "Fan CVR", tooltip: "% di fans paying / fans chattati", type: "percent", width: "0.8fr" },
  { id: "infloww_unlock_rate", label: "Unlock %", tooltip: "% di PPV unlockati / PPV inviati", type: "percent", width: "0.8fr" },
];
const EXTRA_COLS_STORAGE_KEY = "hoc:sales_cp:extra_cols";

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};
const CATEGORY_COLORS = { Big: "#b9aef9", Medium: "#8b7cf6", Small: "#8c95a8" };
const LANGUAGE_COLORS = { ita: "#4ade80", eng: "#b9aef9" };

const PERIOD_TYPES = [{ value: "monthly", label: "Mensile" }];
const CATEGORY_FILTERS = [
  { value: "", label: "Tutte" }, { value: "Big", label: "Big" },
  { value: "Medium", label: "Medium" }, { value: "Small", label: "Small" },
  { value: "Uncategorized", label: "Senza cat" },
];
const LANGUAGE_FILTERS = [
  { value: "", label: "Tutte" }, { value: "ita", label: "🇮🇹 ITA" },
  { value: "eng", label: "🇬🇧 ENG" }, { value: "none", label: "Senza" },
];
const LANGUAGE_COUNT_KEY = { ita: "ita", eng: "eng", none: "unknown" };

const MONTH_NAMES_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function generateMonthlyOptions(count = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MONTH_NAMES_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

function fmtCurrency(v, dec = 0) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: dec });
}
function fmtPct(v, dec = 2) {
  if (v == null) return "—";
  return (v * 100).toFixed(dec).replace(".", ",") + "%";
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

function TierBadge({ tier }) {
  if (!tier) return null;
  const color = TIER_COLORS[tier] || COLORS.mist;
  return <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", background: color + "26", color, border: `1px solid ${color}55` }}>{tier}</span>;
}
function CategoryBadge({ category }) {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] || COLORS.mist;
  return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", background: color + "20", color, border: `1px solid ${color}55`, marginLeft: 6, verticalAlign: "middle" }}>{category}</span>;
}
function LanguageBadge({ language }) {
  if (!language) return null;
  const color = LANGUAGE_COLORS[language] || COLORS.mist;
  const label = language === "eng" ? "EN" : "IT";
  return <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: color + "20", color, border: `1px solid ${color}55`, marginLeft: 6, verticalAlign: "middle", fontFamily: FONTS.mono }}>{label}</span>;
}
function Avatar({ name, size = 28, large = false }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: large ? COLORS.champagne : COLORS.charcoal, color: large ? COLORS.obsidian : COLORS.alabaster, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontWeight: 600, fontSize: size * 0.36, flexShrink: 0, border: large ? `3px solid ${COLORS.graphite}` : `1px solid ${COLORS.charcoal}`, boxShadow: large ? `0 0 0 2px ${COLORS.champagne}, 0 8px 24px rgba(139,124,246,0.25)` : "none" }}>{getInitials(name)}</div>;
}
function StatCard({ label, value, sub, color, tooltip }) {
  return (
    <div title={tooltip || ""} style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "16px 18px", cursor: tooltip ? "help" : "default" }}>
      <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.12em", marginBottom: 6 }}>{label}{tooltip && <span style={{ marginLeft: 4, opacity: 0.4 }}>ⓘ</span>}</div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22, color: color || COLORS.alabaster }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SalesCpLeaderboardPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [showNoCp, setShowNoCp] = useState(true);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showAllNoCp, setShowAllNoCp] = useState(false);
  // Extra columns picker (Infloww KPIs aggiuntive)
  const [extraCols, setExtraCols] = useState([]);
  const [colsPickerOpen, setColsPickerOpen] = useState(false);
  const [segFiltersOpen, setSegFiltersOpen] = useState(false);
  // Troubleshoot dropdown (shortcuts a pagine admin per risolvere problemi)
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(EXTRA_COLS_STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) setExtraCols(stored.filter((id) => EXTRA_COLUMNS.some((c) => c.id === id)));
    } catch {}
  }, []);
  const toggleExtraCol = (id) => {
    setExtraCols((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(EXTRA_COLS_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const activeExtras = EXTRA_COLUMNS.filter((c) => extraCols.includes(c.id));
  // Map employee → { state: 'idle'|'loading'|'success'|'error', message }
  const [recheckState, setRecheckState] = useState({});
  // Bulk recheck progress: { running, done, total, recovered, errors }
  const [bulkRecheck, setBulkRecheck] = useState({ running: false, done: 0, total: 0, recovered: 0, errors: 0 });

  async function recheckEmployee(employee) {
    setRecheckState((s) => ({ ...s, [employee]: { state: "loading" } }));
    try {
      const res = await fetch("/api/admin/wage-recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee }),
      });
      const j = await res.json();
      if (!res.ok || j.ok === false) {
        setRecheckState((s) => ({ ...s, [employee]: { state: "error", message: j.error || j.message || "Errore" } }));
        return { error: true };
      }
      setRecheckState((s) => ({ ...s, [employee]: { state: "success", message: j.message, added: j.added_to_kv } }));
      return { error: false, added: j.added_to_kv || 0 };
    } catch (e) {
      setRecheckState((s) => ({ ...s, [employee]: { state: "error", message: e.message } }));
      return { error: true };
    }
  }

  async function recheckAllNoCp() {
    if (bulkRecheck.running) return;
    const employees = noCpOps
      .filter((op) => op.employee)
      .filter((op) => recheckState[op.employee]?.state !== "success") // skip già completati
      .map((op) => op.employee);
    if (employees.length === 0) {
      alert("Nessun operatore da ricercare (tutti già completati o lista vuota).");
      return;
    }
    if (!confirm(`Lanciare il recheck su ${employees.length} operatori? La pagina si ricaricherà alla fine.`)) return;

    setBulkRecheck({ running: true, done: 0, total: employees.length, recovered: 0, errors: 0 });
    const CONCURRENCY = 5;
    let done = 0, recovered = 0, errors = 0;
    for (let i = 0; i < employees.length; i += CONCURRENCY) {
      const slice = employees.slice(i, i + CONCURRENCY);
      const results = await Promise.all(slice.map((emp) => recheckEmployee(emp)));
      for (const r of results) {
        done++;
        if (r?.error) errors++;
        else if (r?.added > 0) recovered++;
      }
      setBulkRecheck({ running: true, done, total: employees.length, recovered, errors });
    }
    setBulkRecheck({ running: false, done, total: employees.length, recovered, errors });
    // Refresh leaderboard data
    if (recovered > 0) setTimeout(() => mutate(url), 800);
  }

  const periodOptions = useMemo(() => generateMonthlyOptions(), []);
  // periodId è gestito da useSmartPeriod (URL → localStorage → last_sync → mese corrente)

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period_id", periodId);
    if (groupFilter) p.set("group", groupFilter);
    if (categoryFilter) p.set("category", categoryFilter);
    if (languageFilter) p.set("language", languageFilter);
    if (!showNoCp) p.set("include_no_cp", "0");
    return p.toString();
  }, [periodId, groupFilter, categoryFilter, languageFilter, showNoCp]);

  const url = periodId ? `/api/leaderboard/sales-cp?${queryString}` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  // Fetch parallelo: leaderboard Infloww per comparativo (mappa employee → score Infloww)
  const inflowwUrl = periodId ? `/api/leaderboard/operational?period_type=monthly&period_id=${periodId}` : null;
  const { data: inflowwData } = useSWR(inflowwUrl, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const inflowwScoreByEmployee = useMemo(() => {
    const m = new Map();
    for (const r of inflowwData?.ranking || []) {
      if (r.employee && r.score != null) m.set(r.employee, { score: r.score, tier: r.tier });
    }
    return m;
  }, [inflowwData]);

  const ranking = data?.ranking || [];
  const rankingWithScore = ranking.filter((r) => r.score !== null && r.score > 0);
  // Tutti in tabella, top 5 inclusi: le card podio nascondevano le KPI
  // (Score Infw, $/h, Purch, Fan CVR, Unlock%) proprio per i migliori.
  const stream = rankingWithScore;
  const noCpOps = ranking.filter((r) => !r.has_cp_data);
  // Underperformers candidati per Action Center (allineato ai criteri del backend)
  const underperformers = rankingWithScore.filter(
    (r) => r.score <= 25 && (r.cp_aggregates?.total_shifts || 0) >= 5
  );

  const BASE_GRID = "50px 36px 1.6fr 1.3fr 0.7fr 0.7fr 0.9fr 0.9fr 0.8fr 0.8fr 0.9fr 1fr";
  const streamGridTemplate = activeExtras.length
    ? `${BASE_GRID} ${activeExtras.map((c) => c.width).join(" ")}`
    : BASE_GRID;
  function renderExtraCell(op, col) {
    const v = op[col.id];
    if (col.type === "currency") return fmtCurrency(v);
    if (col.type === "percent") return fmtPct(v);
    if (col.type === "number") return fmtNum(v);
    return v ?? "—";
  }

  // Coloring relativo per KPI Infloww: top tercile = verde, bottom tercile = rosso,
  // mezzo = grigio default. Calcolato sui valori validi (>0) di TUTTO lo stream.
  // Per Score Infw usiamo la mappa già pronta inflowwScoreByEmployee.
  const infwTercileCutoffs = useMemo(() => {
    const fields = [
      "infloww_avg_earnings_per_paying_fan",
      "infloww_sales",
      "infloww_purch",
      "infloww_fan_cvr",
      "infloww_unlock_rate",
    ];
    const cutoffs = {};
    for (const f of fields) {
      const vals = stream.map((op) => op[f]).filter((v) => v != null && v > 0).sort((a, b) => a - b);
      if (vals.length < 6) { cutoffs[f] = null; continue; }
      cutoffs[f] = {
        low: vals[Math.floor(vals.length / 3)],
        high: vals[Math.floor((vals.length * 2) / 3)],
      };
    }
    // Score Infw cutoffs
    const scoreVals = Array.from(inflowwScoreByEmployee.values()).map((x) => x.score).filter((v) => v != null && v > 0).sort((a, b) => a - b);
    if (scoreVals.length >= 6) {
      cutoffs.infloww_score = {
        low: scoreVals[Math.floor(scoreVals.length / 3)],
        high: scoreVals[Math.floor((scoreVals.length * 2) / 3)],
      };
    } else {
      cutoffs.infloww_score = null;
    }
    return cutoffs;
  }, [stream, inflowwScoreByEmployee]);

  function infwColor(field, value) {
    if (value == null) return COLORS.mist;
    const c = infwTercileCutoffs[field];
    if (!c) return COLORS.mist;
    if (value >= c.high) return "#4ade80"; // green — top tercile
    if (value <= c.low) return "#f08c8c";  // red — bottom tercile
    return COLORS.mist;
  }

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: { fontFamily: FONTS.display, fontSize: 32, margin: "0 0 6px 0", letterSpacing: "-0.01em", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    filterBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterLabel: { fontSize: 11, color: COLORS.fog, letterSpacing: "0.1em", marginRight: 4 },
    select: { padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", minWidth: 180, outline: "none" },
    catPill: (active, color) => ({ padding: "8px 14px", background: active ? color : COLORS.graphite, border: `1px solid ${active ? color : COLORS.charcoal}`, borderRadius: 999, color: active ? COLORS.obsidian : COLORS.alabaster, fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 500, fontFamily: FONTS.body }),
    summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 },
    top4Grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
    streamWrap: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 16, overflow: "visible" },
    streamHead: { display: "grid", gridTemplateColumns: streamGridTemplate, padding: "14px 22px", background: COLORS.obsidian + "80", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}` },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Ladder</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <Link href="/leaderboard/operational" style={{ color: "inherit", textDecoration: "none" }}>Operativa</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Sales CP</span>
            </div>
          }
          section="Performance · CreatorsPro"
          title="Leaderboard Sales CP"
          subtitle={<>
            Ranking basato sui <b>sales reali</b> da CreatorsPro. Score 0-100 percentile-based (vs creator cohort + vs agency). Infloww KPI affiancati come informativi.
          </>}
          toolbar={
            <>
              <button
                onClick={() => setTutorialOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  background: CP.surface,
                  border: `1px solid ${CP.border}`,
                  borderRadius: 8,
                  color: CP.accentGreen,
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                <Info size={14} /> Come funziona lo score?
              </button>
              <Link
                href={`/admin/action-center?period_id=${periodId}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  background: CP.accentRed + "18",
                  border: `1px solid ${CP.accentRed}55`,
                  borderRadius: 8,
                  color: CP.accentRed,
                  fontSize: 12, fontWeight: 700,
                  textDecoration: "none",
                  fontFamily: FONTS.body,
                }}
              >
                <Target size={14} /> Operatori da cambiare <ArrowRight size={12} />
              </Link>
            </>
          }
        />
        {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}


        <div style={styles.filterBar}>
          {PERIOD_TYPES.map((pt) => (
            <button key={pt.value} style={{ ...styles.catPill(true, COLORS.champagne), cursor: "default" }}>{pt.label}</button>
          ))}
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={styles.select}>
            {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: COLORS.charcoal }}>{p.label}</option>)}
          </select>
          <div style={{ position: "relative", minWidth: 200 }}>
            <input list="groups-cp" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} placeholder="Tutti i Group" style={{ ...styles.select, paddingRight: groupFilter ? 28 : 14 }} />
            <datalist id="groups-cp">{data?.groups?.map((g) => <option key={g} value={g} />)}</datalist>
            {groupFilter && <button onClick={() => setGroupFilter("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: COLORS.fog, cursor: "pointer", fontSize: 16 }}>×</button>}
          </div>
          <label style={{ ...styles.catPill(showNoCp, COLORS.mist), display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={showNoCp} onChange={(e) => setShowNoCp(e.target.checked)} style={{ accentColor: COLORS.champagne }} />
            Mostra no-CP in fondo
          </label>
          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, position: "relative" }}>
            <button
              onClick={() => setTroubleshootOpen((v) => !v)}
              title="Shortcut alle pagine admin per risolvere problemi visti in classifica"
              style={{ padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.fog, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Wrench size={14} /> Risolvi <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
            </button>
            <button onClick={() => url && mutate(url)} title="Ricarica" style={{ padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.fog, fontSize: 13, cursor: "pointer" }}>Aggiorna</button>
            {troubleshootOpen && (
              <>
                {/* overlay click-out */}
                <div onClick={() => setTroubleshootOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 280, background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, boxShadow: "0 18px 40px rgba(0,0,0,0.6)", padding: 6, zIndex: 60 }}>
                  <div style={{ fontSize: 10, letterSpacing: 0.8, color: COLORS.fog, opacity: 0.6, padding: "8px 10px 4px" }}>Risolvi problemi</div>
                  {[
                    { href: "/admin/wage-audit", icon: ShieldCheck, label: "Wage Audit", hint: "wage / shift mancanti per mese" },
                    { href: "/admin/debug-mapping", icon: Link2, label: "Debug Mapping", hint: "operatori senza match in CP" },
                    { href: "/admin/group-categories", icon: Tags, label: "Group Categories", hint: "categorizza i group creator" },
                    { href: "/admin/group-languages", icon: Languages, label: "Group Languages", hint: "assegna lingua ai group" },
                    { href: "/admin/creatorspro-sync", icon: RefreshCw, label: "Sync CP", hint: "rifai sync sales da CreatorsPro" },
                    { href: "/admin/wage-audit", icon: RefreshCw, label: "Sync & Audit CP", hint: "storico mesi: verifica e ripara" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setTroubleshootOpen(false)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 10px", borderRadius: 8, textDecoration: "none", color: COLORS.fog, transition: "background 0.12s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.charcoal)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <Icon size={14} style={{ marginTop: 2, color: COLORS.champagne, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: COLORS.fog, opacity: 0.6, marginTop: 1 }}>{item.hint}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filtri segmento (categoria + lingua) collassati di default: troppo
            ingombranti "in evidenza". Riga compatta con riassunto attivo. */}
        <div style={{ ...styles.filterRow, marginBottom: segFiltersOpen ? 10 : 14 }}>
          <button
            onClick={() => setSegFiltersOpen((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", background: (categoryFilter || languageFilter) ? COLORS.champagne + "22" : COLORS.graphite, border: `1px solid ${(categoryFilter || languageFilter) ? COLORS.champagne + "55" : COLORS.charcoal}`, borderRadius: 8, color: (categoryFilter || languageFilter) ? COLORS.champagne : COLORS.fog, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body }}
          >
            <SlidersHorizontal size={13} /> Filtri segmento
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              {`· ${CATEGORY_FILTERS.find((c) => c.value === categoryFilter)?.label || "Tutte"} · ${LANGUAGE_FILTERS.find((l) => l.value === languageFilter)?.label || "Tutte"}`}
            </span>
            {segFiltersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {(categoryFilter || languageFilter) && (
            <button onClick={() => { setCategoryFilter(""); setLanguageFilter(""); }} style={{ fontSize: 11, color: COLORS.mist, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>azzera</button>
          )}
        </div>

        {segFiltersOpen && (
          <>
            <div style={styles.filterRow}>
              <span style={styles.filterLabel}>Categoria:</span>
              {CATEGORY_FILTERS.map((c) => {
                const count = data?.category_counts ? (c.value ? (data.category_counts[c.value] ?? 0) : Object.values(data.category_counts).reduce((a,b)=>a+(b||0),0)) : null;
                return <button key={c.value || "all"} style={styles.catPill(categoryFilter === c.value, CATEGORY_COLORS[c.value] || COLORS.champagne)} onClick={() => setCategoryFilter(c.value)}>{c.label}{count != null && <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>({count})</span>}</button>;
              })}
            </div>
            <div style={styles.filterRow}>
              <span style={styles.filterLabel}>Lingua:</span>
              {LANGUAGE_FILTERS.map((l) => {
                const count = data?.language_counts ? (l.value ? (data.language_counts[LANGUAGE_COUNT_KEY[l.value] || l.value] ?? 0) : Object.values(data.language_counts).reduce((a,b)=>a+(b||0),0)) : null;
                return <button key={l.value || "all"} style={styles.catPill(languageFilter === l.value, LANGUAGE_COLORS[l.value] || COLORS.champagne)} onClick={() => setLanguageFilter(l.value)}>{l.label}{count != null && <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>({count})</span>}</button>;
              })}
            </div>
          </>
        )}

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{data.error}{" "}<Link href="/admin/creatorspro-sync" style={{ color: COLORS.champagne }}>Vai a Sync CP →</Link></div>}

        {data && !data.error && (
          <>
            <div style={styles.summary}>
              <StatCard label="Operatori CP in classifica" value={fmtNum(data.eligible_total)} sub={data.no_cp_count > 0 ? `+${data.no_cp_count} senza CP data` : null} />
              <StatCard label="Score medio" value={`${data.avg_score?.toFixed(1).replace(".",",")} / 100`} tooltip="Media degli operatori in classifica" />
              <StatCard label="Tier Elite" value={fmtNum(data.elite_count)} sub={`${data.strong_count} Strong`} color={TIER_COLORS.Elite} />
              <StatCard label="Sales agency (CP)" value={fmtCurrency(data.agency?.total_sales)} sub={`${data.agency?.total_shifts} shift · avg ${fmtCurrency(data.agency?.avg_sales_per_shift)}/shift`} color={CP.accentGreen} />
            </div>

            {/* Banner Action Center: visibile solo se ci sono underperformer */}
            {underperformers.length > 0 && (
              <Link
                href={`/admin/action-center?period_id=${periodId}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  marginBottom: 20,
                  background: CP.surface,
                  border: `1px solid ${CP.accentRed}59`,
                  borderRadius: 12,
                  color: COLORS.alabaster,
                  textDecoration: "none",
                  gap: 14,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = CP.accentRed + "b3"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = CP.accentRed + "59"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: CP.accentRed + "33",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Target size={20} color={CP.accentRed} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.alabaster, marginBottom: 2 }}>
                      {underperformers.length} operatori sotto soglia da rivedere questo mese
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.fog }}>
                      Score CP v3 ≤ 25 con ≥5 shift. Vai all&apos;Action Center per swap + export HR.
                    </div>
                  </div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  color: CP.accentRed, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                }}>
                  Apri Action Center <ArrowRight size={14} />
                </div>
              </Link>
            )}

            {/* COLUMN PICKER (sopra la stream table) */}
            {(stream.length > 0 || (showNoCp && noCpOps.length > 0)) && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, position: "relative" }}>
                <button
                  onClick={() => setColsPickerOpen((v) => !v)}
                  title="Aggiungi o togli colonne KPI Infloww"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 13px",
                    background: extraCols.length ? COLORS.champagne + "22" : COLORS.graphite,
                    border: `1px solid ${extraCols.length ? COLORS.champagne + "55" : COLORS.charcoal}`,
                    borderRadius: 8,
                    color: extraCols.length ? COLORS.champagne : COLORS.fog,
                    fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                  }}
                >
                  <Columns3 size={13} /> Colonne {extraCols.length > 0 && <span style={{ fontFamily: FONTS.mono, opacity: 0.8 }}>+{extraCols.length}</span>}
                </button>
                {colsPickerOpen && (
                  <>
                    <div onClick={() => setColsPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{
                      position: "absolute", top: "100%", right: 0, marginTop: 6,
                      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
                      borderRadius: 10, padding: 8, zIndex: 50,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      minWidth: 260,
                    }}>
                      <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em", padding: "6px 10px 8px", borderBottom: `1px solid ${COLORS.charcoal}` }}>
                        KPI Infloww aggiuntive
                      </div>
                      {EXTRA_COLUMNS.map((c) => {
                        const checked = extraCols.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleExtraCol(c.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 10px", cursor: "pointer",
                              borderRadius: 6,
                              background: checked ? COLORS.champagne + "12" : "transparent",
                            }}
                            onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = COLORS.charcoal + "60"; }}
                            onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = "transparent"; }}
                          >
                            <div style={{
                              width: 16, height: 16, borderRadius: 4,
                              border: `1.5px solid ${checked ? COLORS.champagne : COLORS.fog}`,
                              background: checked ? COLORS.champagne : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                            }}>
                              {checked && <Check size={12} color={COLORS.obsidian} strokeWidth={3} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: COLORS.alabaster, fontWeight: 500 }}>{c.label}</div>
                              <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 1 }}>{c.tooltip}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STREAM */}
            {(stream.length > 0 || (showNoCp && noCpOps.length > 0)) && (
              <div style={styles.streamWrap}>
                <div style={styles.streamHead}>
                  <div>#</div><div></div>
                  <ColHead label="Operatore" tooltip="Nome operatore. Click per drill-down diagnostico." />
                  <ColHead label="Group" tooltip="Group amministrativo arrivato da CreatorsPro. Può essere generico (es. 'House of Creators International'). Per la distribuzione reale sui creator vedi il drill-down." />
                  <ColHead label="Score CP" tooltip="Score 0-100 sui sales reali. Fonte: CreatorsPro API. Calcolo: per ogni cella operatore×creator combina percentile vs operatori sulla stessa creator (70%) + percentile vs agency (30%) su base sales/shift. Le celle vengono poi mediate pesando sui SHIFTS lavorati (v3.1)." />
                  <ColHead label="Score Infw v1" tooltip={"Score di efficienza chat 0-100. Fonte: Infloww (CSV mensile esportato a mano). Sistema legacy, mantenuto come secondo segnale di confronto. Media pesata di 9 KPI: Fan CVR (20%), Unlock rate (18%), $/paying fan (15%), Golden ratio (12%), Sales/h (10%), $/fan totale (8%), Lunghezza conversazione (7%), Caratteri per messaggio (5%), Messaggi/h (5%). Ogni KPI normalizzato vs media gruppo."} />
                  <ColHead label="Tier" tooltip="Fascia derivata dallo Score CP. Percentile-based: Elite ≥top10%, Strong ≥top25%, Good ≥top50%, Average ≥top75%, Weak ≥top90%, Critical bottom10%." />
                  <ColHead label="CP Sales" tooltip="Sales totali attribuiti all'operatore nel mese. Fonte: CreatorsPro API — somma dei 'take' sui wage del periodo." />
                  <ColHead label="$/Shift" tooltip="Sales medi per turno lavorato. Fonte: CreatorsPro — CP Sales ÷ numero di turni del periodo. È la metrica base con cui calcoliamo il percentile dello Score CP." />
                  <ColHead label="Shift" tooltip="Numero di shift attribuiti all'operatore nel periodo. Fonte: CreatorsPro." />
                  <ColHead label="$/h" tooltip="Sales medi orari. Fonte: CreatorsPro — CP Sales ÷ ore lavorate (somma dei minuti di tutti i turni del periodo)." />
                  <ColHead label="Infloww $/pay" tooltip="Sales medi per fan pagante. Fonte: Infloww — Sales Infloww totali ÷ numero di fan che hanno speso almeno 1$ nel periodo. Indica quanto spende mediamente un fan attivo nelle chat di questo operatore." />
                  {activeExtras.map((c) => (
                    <ColHead key={c.id} label={c.label} tooltip={c.tooltip} />
                  ))}
                </div>
                {stream.map((op, i) => {
                  const tColor = TIER_COLORS[op.tier] || COLORS.alabaster;
                  const inflowwScore = inflowwScoreByEmployee.get(op.employee);
                  const diff = inflowwScore && op.score != null ? op.score - inflowwScore.score : null;
                  return (
                    <div key={`${op.employee}-${i}`} style={{ display: "grid", gridTemplateColumns: streamGridTemplate, alignItems: "center", padding: "12px 22px", borderBottom: `1px solid ${COLORS.charcoal}88`, fontSize: 13 }}>
                      <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.fog }}>{op.rank ? String(op.rank).padStart(2, "0") : "—"}</div>
                      <Avatar name={op.employee} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
                          <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{op.employee} <span style={{ marginLeft: 5, color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span></div>
                        </Link>
                      </div>
                      <div style={{ color: COLORS.fog, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <Link href="/admin/group-categories" title="Categorizza i group creator (Big / Medium / Small)" style={{ color: "inherit", textDecoration: "none", borderBottom: `1px dotted ${COLORS.charcoal}` }}>
                          {op.group || "—"}
                        </Link>
                        <Link href="/admin/group-categories" title="Cambia categoria" style={{ textDecoration: "none" }}>
                          <CategoryBadge category={op.category} />
                        </Link>
                        <Link href="/admin/group-languages" title="Cambia lingua del group" style={{ textDecoration: "none" }}>
                          <LanguageBadge language={op.language} />
                        </Link>
                      </div>
                      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: tColor }}>{op.score?.toFixed(1) ?? "—"}</div>
                      <div
                        style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: inflowwScore ? infwColor("infloww_score", inflowwScore.score) : COLORS.charcoal }}
                        title={inflowwScore ? `Infloww v1: ${inflowwScore.score.toFixed(1)} (${inflowwScore.tier})${diff !== null ? `\nDelta CP - Infloww: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}` : ""}\nColore: verde = top 33%, rosso = bottom 33% della tabella` : "Score Infloww non disponibile per questo periodo"}
                      >
                        {inflowwScore ? (
                          <span>
                            {inflowwScore.score.toFixed(1)}
                            {diff !== null && Math.abs(diff) >= 10 && (
                              <span style={{ marginLeft: 4, fontSize: 10, color: diff > 0 ? CP.accentGreen : CP.accentRed }}>
                                {diff > 0 ? "↑" : "↓"}
                              </span>
                            )}
                          </span>
                        ) : "—"}
                      </div>
                      <div><TierBadge tier={op.tier} /></div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.accentGreen, fontWeight: 600 }}>{fmtCurrency(op.cp_aggregates?.total_sales)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13 }}>{fmtCurrency(op._kpis_cp?.sales_per_shift)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.fog }}>{op.cp_aggregates?.total_shifts || 0}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13 }}>{fmtCurrency(op._kpis_cp?.sales_per_hour)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: infwColor("infloww_avg_earnings_per_paying_fan", op.infloww_avg_earnings_per_paying_fan) }} title={`Infloww: ${fmtCurrency(op.infloww_sales)} sales, ${fmtPct(op.infloww_fan_cvr)} Fan CVR\nColore: verde = top 33%, rosso = bottom 33%`}>{fmtCurrency(op.infloww_avg_earnings_per_paying_fan)}</div>
                      {activeExtras.map((c) => (
                        <div key={c.id} style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: infwColor(c.id, op[c.id]) }} title={`Colore: verde = top 33%, rosso = bottom 33% della tabella`}>{renderExtraCell(op, c)}</div>
                      ))}
                    </div>
                  );
                })}

                {showNoCp && noCpOps.length > 0 && (
                  <>
                    <div style={{ padding: "14px 22px", background: COLORS.obsidian + "80", borderTop: `1px solid ${COLORS.charcoal}`, borderBottom: `1px solid ${COLORS.charcoal}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, color: COLORS.mist, flex: 1, minWidth: 280 }}>
                        <b style={{ color: COLORS.alabaster }}>{noCpOps.length} operatori SENZA dati CP</b> (non mappati o periodo senza shift). Prova il recheck batch per recuperare le wage da CP API.
                      </div>
                      <button
                        onClick={recheckAllNoCp}
                        disabled={bulkRecheck.running}
                        title="Chiama CP API per ogni operatore non matchato e auto-importa le wage trovate"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 14px",
                          background: bulkRecheck.running ? COLORS.charcoal : COLORS.champagne,
                          color: bulkRecheck.running ? COLORS.fog : COLORS.obsidian,
                          border: "none",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: bulkRecheck.running ? "wait" : "pointer",
                          fontFamily: FONTS.body,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {bulkRecheck.running ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            {bulkRecheck.done}/{bulkRecheck.total} · {bulkRecheck.recovered} recuperati
                          </>
                        ) : (
                          <>
                            <Search size={12} /> Recheck batch ({noCpOps.length})
                          </>
                        )}
                      </button>
                    </div>
                    {!bulkRecheck.running && bulkRecheck.done > 0 && (
                      <div style={{ padding: "10px 22px", background: bulkRecheck.recovered > 0 ? CP.accentGreen + "18" : COLORS.obsidian + "40", fontSize: 11, borderBottom: `1px solid ${COLORS.charcoal}`, color: bulkRecheck.recovered > 0 ? CP.accentGreen : COLORS.fog }}>
                        ✓ Batch completato: {bulkRecheck.done} controllati · <b>{bulkRecheck.recovered} recuperati con nuove wage</b> · {bulkRecheck.errors} errori · {bulkRecheck.done - bulkRecheck.recovered - bulkRecheck.errors} senza wage CP nel periodo
                      </div>
                    )}
                    {(showAllNoCp ? noCpOps : noCpOps.slice(0, 30)).map((op, i) => (
                      <div key={`nocp-${op.employee}-${i}`} style={{ display: "grid", gridTemplateColumns: streamGridTemplate, alignItems: "center", padding: "10px 22px", borderBottom: `1px solid ${COLORS.charcoal}88`, fontSize: 12, opacity: recheckState[op.employee]?.state === "success" && recheckState[op.employee]?.added > 0 ? 0.9 : 0.6 }}>
                        <div style={{ color: COLORS.mist }}>—</div>
                        <Avatar name={op.employee} size={28} />
                        <div style={{ fontFamily: FONTS.display, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{op.employee}</span>
                          <RecheckButton
                            state={recheckState[op.employee]}
                            onClick={() => recheckEmployee(op.employee)}
                          />
                        </div>
                        <div style={{ color: COLORS.fog, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <Link href={`/admin/debug-mapping?employee=${encodeURIComponent(op.employee)}`} title="Debug perché questo operatore non ha match in CP" style={{ color: "inherit", textDecoration: "none", borderBottom: `1px dotted ${COLORS.charcoal}` }}>
                            {op.group || "—"}
                          </Link>
                          <Link href="/admin/group-categories" title="Cambia categoria" style={{ textDecoration: "none" }}>
                            <CategoryBadge category={op.category} />
                          </Link>
                          <Link href="/admin/group-languages" title="Cambia lingua del group" style={{ textDecoration: "none" }}>
                            <LanguageBadge language={op.language} />
                          </Link>
                        </div>
                        <div style={{ gridColumn: "span 6", fontSize: 10, fontStyle: "italic" }}>
                          {recheckState[op.employee]?.message ? (
                            <span style={{ color: recheckState[op.employee].state === "success" ? CP.accentGreen : recheckState[op.employee].state === "error" ? CP.accentRed : COLORS.mist }}>
                              {recheckState[op.employee].message}
                            </span>
                          ) : (
                            <span style={{ color: COLORS.mist }}>no CP data</span>
                          )}
                        </div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.mist }}>{fmtCurrency(op.infloww_sales)} (Infw)</div>
                      </div>
                    ))}
                    {noCpOps.length > 30 && (
                      <button
                        onClick={() => setShowAllNoCp((v) => !v)}
                        style={{
                          width: "100%",
                          padding: "12px 22px",
                          background: COLORS.obsidian + "80",
                          border: "none",
                          borderTop: `1px solid ${COLORS.charcoal}`,
                          color: COLORS.champagne,
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: "center",
                          cursor: "pointer",
                          fontFamily: FONTS.body,
                        }}
                      >
                        {showAllNoCp ? `↑ Mostra solo primi 30` : `↓ Mostra anche gli altri ${noCpOps.length - 30} no-CP`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HeroStat({ l, v }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
      <span style={{ color: COLORS.fog, letterSpacing: "0.06em", fontSize: 10 }}>{l}</span>
      <span style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.alabaster, fontSize: 14 }}>{v}</span>
    </div>
  );
}

function RecheckButton({ state, onClick }) {
  const s = state?.state || "idle";
  if (s === "loading") {
    return <span title="Cerco in CP API..." style={iconBtnStyle(COLORS.fog)}>
      <Loader2 size={11} className="animate-spin" />
    </span>;
  }
  if (s === "success") {
    return <span title={state.message} style={iconBtnStyle(CP.accentGreen)}>
      <CheckCircle2 size={11} />
    </span>;
  }
  if (s === "error") {
    return <button onClick={onClick} title={`Errore: ${state.message}. Click per riprovare`} style={iconBtnStyle(CP.accentRed, true)}>
      <XCircle size={11} />
    </button>;
  }
  return (
    <button onClick={onClick} title="Cerca live in CP e auto-importa se trovato" style={iconBtnStyle(COLORS.champagne, true)}>
      <Search size={11} />
    </button>
  );
}

function iconBtnStyle(color, isButton = false) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 22, height: 22,
    background: `${color}18`,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 5,
    cursor: isButton ? "pointer" : "default",
    flexShrink: 0,
  };
}

// Intestazione colonna leaderboard con icona ⓘ visibile + tooltip dettagliato
// (fonte / definizione / come si calcola). Risponde al feedback Riccardo mag 2026.
// Tooltip CUSTOM (no title="" HTML) per apparire istantaneamente, no delay browser.
function ColHead({ label, tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <div
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", position: "relative" }}
    >
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      <span aria-hidden="true" style={{ opacity: 0.45, fontSize: 11, lineHeight: 1, marginLeft: 1 }}>ⓘ</span>
      {show && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 100,
            maxWidth: 360,
            minWidth: 240,
            padding: "10px 12px",
            background: COLORS.charcoal,
            border: `1px solid ${COLORS.fog}55`,
            borderRadius: 8,
            color: COLORS.alabaster,
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: "normal",
            textTransform: "none",
            fontFamily: FONTS.body,
            whiteSpace: "normal",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            pointerEvents: "none",
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
