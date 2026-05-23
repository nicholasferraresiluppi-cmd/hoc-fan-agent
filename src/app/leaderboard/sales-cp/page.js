"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { Info, Target, ArrowRight, Search, Loader2, CheckCircle2, XCircle } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};
const CATEGORY_COLORS = { Big: "#4F8CCB", Medium: "#D4AF7A", Small: "#8F8A82" };
const LANGUAGE_COLORS = { ita: "#3FB97E", eng: "#4F8CCB" };

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
  return <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", background: color + "26", color, border: `1px solid ${color}55` }}>{tier}</span>;
}
function CategoryBadge({ category }) {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] || COLORS.mist;
  return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", background: color + "20", color, border: `1px solid ${color}55`, marginLeft: 6, verticalAlign: "middle" }}>{category}</span>;
}
function LanguageBadge({ language }) {
  if (!language) return null;
  const color = LANGUAGE_COLORS[language] || COLORS.mist;
  const label = language === "eng" ? "EN" : "IT";
  return <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: color + "20", color, border: `1px solid ${color}55`, marginLeft: 6, verticalAlign: "middle", fontFamily: FONTS.mono }}>{label}</span>;
}
function Avatar({ name, size = 28, large = false }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: large ? `linear-gradient(135deg, ${COLORS.champagne} 0%, ${COLORS.charcoal} 100%)` : COLORS.charcoal, color: large ? COLORS.obsidian : COLORS.alabaster, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontWeight: 600, fontSize: size * 0.36, flexShrink: 0, border: large ? `3px solid ${COLORS.graphite}` : `1px solid ${COLORS.charcoal}`, boxShadow: large ? `0 0 0 2px ${COLORS.champagne}, 0 8px 24px rgba(212,175,122,0.25)` : "none" }}>{getInitials(name)}</div>;
}
function StatCard({ label, value, sub, color, tooltip }) {
  return (
    <div title={tooltip || ""} style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "16px 18px", cursor: tooltip ? "help" : "default" }}>
      <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>{label}{tooltip && <span style={{ marginLeft: 4, opacity: 0.4 }}>ⓘ</span>}</div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22, color: color || COLORS.alabaster }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SalesCpLeaderboardPage() {
  const [periodId, setPeriodId] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [showNoCp, setShowNoCp] = useState(true);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Map employee → { state: 'idle'|'loading'|'success'|'error', message }
  const [recheckState, setRecheckState] = useState({});

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
        return;
      }
      setRecheckState((s) => ({ ...s, [employee]: { state: "success", message: j.message, added: j.added_to_kv } }));
      // Se ha aggiunto wages → invalida cache SWR per ricaricare la pagina
      if (j.added_to_kv > 0) {
        setTimeout(() => mutate(url), 600);
      }
    } catch (e) {
      setRecheckState((s) => ({ ...s, [employee]: { state: "error", message: e.message } }));
    }
  }

  const periodOptions = useMemo(() => generateMonthlyOptions(), []);
  useEffect(() => { if (!periodId && periodOptions[0]) setPeriodId(periodOptions[0].value); }, [periodOptions, periodId]);

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
  const heroOp = rankingWithScore[0];
  const top4 = rankingWithScore.slice(1, 5);
  const stream = rankingWithScore.slice(5);
  const noCpOps = ranking.filter((r) => !r.has_cp_data);
  // Underperformers candidati per Action Center (allineato ai criteri del backend)
  const underperformers = rankingWithScore.filter(
    (r) => r.score <= 25 && (r.cp_aggregates?.total_shifts || 0) >= 5
  );

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: { fontFamily: FONTS.display, fontSize: 32, margin: "0 0 6px 0", letterSpacing: "-0.01em", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    filterBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterLabel: { fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 4 },
    select: { padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", minWidth: 180, outline: "none" },
    catPill: (active, color) => ({ padding: "8px 14px", background: active ? color : COLORS.graphite, border: `1px solid ${active ? color : COLORS.charcoal}`, borderRadius: 999, color: active ? COLORS.obsidian : COLORS.alabaster, fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 500, fontFamily: FONTS.body }),
    summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 },
    top4Grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
    streamWrap: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 16, overflow: "visible" },
    streamHead: { display: "grid", gridTemplateColumns: "50px 36px 1.6fr 1.3fr 0.7fr 0.7fr 0.9fr 0.9fr 0.8fr 0.8fr 0.9fr 1fr", padding: "14px 22px", background: COLORS.obsidian + "80", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}` },
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
          <button onClick={() => url && mutate(url)} title="Ricarica" style={{ padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.fog, fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>🔄 Aggiorna</button>
        </div>

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

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{data.error}{" "}<Link href="/admin/creatorspro-sync" style={{ color: COLORS.champagne }}>Vai a Sync CP →</Link></div>}

        {data && !data.error && (
          <>
            <div style={styles.summary}>
              <StatCard label="Operatori CP in classifica" value={fmtNum(data.eligible_total)} sub={data.no_cp_count > 0 ? `+${data.no_cp_count} senza CP data` : null} />
              <StatCard label="Score medio" value={`${data.avg_score?.toFixed(1).replace(".",",")} / 100`} tooltip="Media degli operatori in classifica" />
              <StatCard label="Tier Elite" value={fmtNum(data.elite_count)} sub={`${data.strong_count} Strong`} color={TIER_COLORS.Elite} />
              <StatCard label="Sales agency (CP)" value={fmtCurrency(data.agency?.total_sales)} sub={`${data.agency?.total_shifts} shift · avg ${fmtCurrency(data.agency?.avg_sales_per_shift)}/shift`} color="#3FB97E" />
            </div>

            {/* Banner Action Center: visibile solo se ci sono underperformer */}
            {underperformers.length > 0 && (
              <Link
                href={`/admin/action-center?period_id=${periodId}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  marginBottom: 20,
                  background: "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.04) 100%)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  borderRadius: 12,
                  color: COLORS.alabaster,
                  textDecoration: "none",
                  gap: 14,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(239,68,68,0.20)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Target size={20} color="#EF4444" strokeWidth={2} />
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
                  color: "#EF4444", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                }}>
                  Apri Action Center <ArrowRight size={14} />
                </div>
              </Link>
            )}

            {/* HERO #1 */}
            {heroOp && (
              <div style={{ background: `linear-gradient(135deg, ${TIER_COLORS[heroOp.tier]}1F 0%, ${COLORS.graphite}99 60%)`, border: `1px solid ${TIER_COLORS[heroOp.tier]}55`, borderRadius: 20, padding: "28px 32px", marginBottom: 16, display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 28, alignItems: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ textAlign: "center", position: "relative" }}>
                  <div style={{ fontSize: 32, marginBottom: 4 }}>💰</div>
                  <div style={{ fontFamily: FONTS.display, fontWeight: 500, fontStyle: "italic", fontSize: 56, lineHeight: 1, color: COLORS.champagne }}>1</div>
                  <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 4 }}>Top Sales CP</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative" }}>
                  <Avatar name={heroOp.employee} size={84} large />
                  <div>
                    <Link href={`/leaderboard/operational/${encodeURIComponent(heroOp.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4, cursor: "pointer" }}>{heroOp.employee} <span style={{ fontSize: 14, color: COLORS.champagne, opacity: 0.7 }}>›</span></div>
                    </Link>
                    <div style={{ color: COLORS.champagne, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                      {heroOp.group || "—"}<CategoryBadge category={heroOp.category} /><LanguageBadge language={heroOp.language} />
                    </div>
                    <TierBadge tier={heroOp.tier} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.15em" }}>Score CP</div>
                  <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 56, lineHeight: 1, color: TIER_COLORS[heroOp.tier] }}>{heroOp.score?.toFixed(1)}</div>
                  <div style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 13, marginTop: 2 }}>/ 100</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderLeft: `1px solid ${COLORS.champagne}33`, paddingLeft: 24 }}>
                  <HeroStat l="Sales/shift" v={fmtCurrency(heroOp._kpis_cp?.sales_per_shift)} />
                  <HeroStat l="Sales/h" v={fmtCurrency(heroOp._kpis_cp?.sales_per_hour)} />
                  <HeroStat l="Volume" v={`${heroOp.cp_aggregates?.total_shifts || 0} shift`} />
                  <HeroStat l="Sales totale CP" v={fmtCurrency(heroOp.cp_aggregates?.total_sales)} />
                </div>
              </div>
            )}

            {/* TOP 4 */}
            {top4.length > 0 && (
              <div style={styles.top4Grid}>
                {top4.map((op) => {
                  const tColor = TIER_COLORS[op.tier] || COLORS.alabaster;
                  return (
                    <div key={`${op.employee}-${op.group}`} style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 16, position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ fontFamily: FONTS.display, fontStyle: "italic", fontSize: 24, color: COLORS.champagne, lineHeight: 1, width: 28 }}>{op.rank}</div>
                        <Avatar name={op.employee} size={38} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
                            <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{op.employee} <span style={{ color: COLORS.champagne, opacity: 0.55, fontSize: 12 }}>›</span></div>
                          </Link>
                          <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {op.group || "—"}<CategoryBadge category={op.category} /><LanguageBadge language={op.language} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 24, color: tColor }}>{op.score?.toFixed(1)}</div>
                        <TierBadge tier={op.tier} />
                      </div>
                      <div style={{ height: 4, background: COLORS.charcoal, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: tColor, width: `${op.score || 0}%` }} />
                      </div>
                      <div style={{ marginTop: 10, fontSize: 11, color: COLORS.fog, display: "flex", justifyContent: "space-between" }}>
                        <span>{fmtCurrency(op._kpis_cp?.sales_per_shift)}/shift</span>
                        <span>{op.cp_aggregates?.total_shifts || 0} shift</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* STREAM */}
            {(stream.length > 0 || (showNoCp && noCpOps.length > 0)) && (
              <div style={styles.streamWrap}>
                <div style={styles.streamHead}>
                  <div>#</div><div></div>
                  <div>Operatore</div><div>Group</div>
                  <div title="Score CP v3 (sales reali da CreatorsPro)">Score CP</div>
                  <div title="Score Infloww v1 (KPI efficienza chat) — per confronto">Score Infw</div>
                  <div title="Tier dello score CP">Tier</div>
                  <div title="Sales totali attribuite da CP">CP Sales</div>
                  <div title="Sales medio per shift">$/Shift</div>
                  <div title="Numero shift completati">Shift</div>
                  <div title="Sales medio orario">$/h</div>
                  <div title="Affianco informativo: $/paying fan da Infloww">Infloww $/pay</div>
                </div>
                {stream.map((op, i) => {
                  const tColor = TIER_COLORS[op.tier] || COLORS.alabaster;
                  const inflowwScore = inflowwScoreByEmployee.get(op.employee);
                  const diff = inflowwScore && op.score != null ? op.score - inflowwScore.score : null;
                  return (
                    <div key={`${op.employee}-${i}`} style={{ display: "grid", gridTemplateColumns: "50px 36px 1.6fr 1.3fr 0.7fr 0.7fr 0.9fr 0.9fr 0.8fr 0.8fr 0.9fr 1fr", alignItems: "center", padding: "12px 22px", borderBottom: `1px solid ${COLORS.charcoal}88`, fontSize: 13 }}>
                      <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.fog }}>{op.rank ? String(op.rank).padStart(2, "0") : "—"}</div>
                      <Avatar name={op.employee} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
                          <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{op.employee} <span style={{ marginLeft: 5, color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span></div>
                        </Link>
                      </div>
                      <div style={{ color: COLORS.fog, fontSize: 12 }}>
                        {op.group || "—"}<CategoryBadge category={op.category} /><LanguageBadge language={op.language} />
                      </div>
                      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: tColor }}>{op.score?.toFixed(1) ?? "—"}</div>
                      <div
                        style={{ fontFamily: FONTS.mono, fontSize: 13, color: inflowwScore ? COLORS.mist : COLORS.charcoal }}
                        title={inflowwScore ? `Infloww v1: ${inflowwScore.score.toFixed(1)} (${inflowwScore.tier})${diff !== null ? `\nDelta CP - Infloww: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}` : ""}` : "Score Infloww non disponibile per questo periodo"}
                      >
                        {inflowwScore ? (
                          <span>
                            {inflowwScore.score.toFixed(1)}
                            {diff !== null && Math.abs(diff) >= 10 && (
                              <span style={{ marginLeft: 4, fontSize: 10, color: diff > 0 ? "#3FB97E" : "#EF4444" }}>
                                {diff > 0 ? "↑" : "↓"}
                              </span>
                            )}
                          </span>
                        ) : "—"}
                      </div>
                      <div><TierBadge tier={op.tier} /></div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: "#3FB97E", fontWeight: 600 }}>{fmtCurrency(op.cp_aggregates?.total_sales)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13 }}>{fmtCurrency(op._kpis_cp?.sales_per_shift)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.fog }}>{op.cp_aggregates?.total_shifts || 0}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 13 }}>{fmtCurrency(op._kpis_cp?.sales_per_hour)}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.mist }} title={`Infloww: ${fmtCurrency(op.infloww_sales)} sales, ${fmtPct(op.infloww_fan_cvr)} Fan CVR`}>{fmtCurrency(op.infloww_avg_earnings_per_paying_fan)}</div>
                    </div>
                  );
                })}

                {showNoCp && noCpOps.length > 0 && (
                  <>
                    <div style={{ padding: "12px 22px", background: COLORS.obsidian + "60", fontSize: 11, color: COLORS.mist, borderTop: `1px solid ${COLORS.charcoal}`, borderBottom: `1px solid ${COLORS.charcoal}` }}>
                      ⚠️ <b>{noCpOps.length} operatori SENZA dati CP</b> (non mappati o periodo senza shift) — appaiono senza score. Vai a <Link href="/admin/creatorspro-sync" style={{ color: COLORS.champagne }}>Sync CP</Link> per mappare.
                    </div>
                    {noCpOps.slice(0, 30).map((op, i) => (
                      <div key={`nocp-${op.employee}-${i}`} style={{ display: "grid", gridTemplateColumns: "50px 36px 1.6fr 1.3fr 0.7fr 0.7fr 0.9fr 0.9fr 0.8fr 0.8fr 0.9fr 1fr", alignItems: "center", padding: "10px 22px", borderBottom: `1px solid ${COLORS.charcoal}88`, fontSize: 12, opacity: recheckState[op.employee]?.state === "success" && recheckState[op.employee]?.added > 0 ? 0.9 : 0.6 }}>
                        <div style={{ color: COLORS.mist }}>—</div>
                        <Avatar name={op.employee} size={28} />
                        <div style={{ fontFamily: FONTS.display, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{op.employee}</span>
                          <RecheckButton
                            state={recheckState[op.employee]}
                            onClick={() => recheckEmployee(op.employee)}
                          />
                        </div>
                        <div style={{ color: COLORS.fog, fontSize: 11 }}>{op.group || "—"}<CategoryBadge category={op.category} /><LanguageBadge language={op.language} /></div>
                        <div style={{ gridColumn: "span 6", fontSize: 10, fontStyle: "italic" }}>
                          {recheckState[op.employee]?.message ? (
                            <span style={{ color: recheckState[op.employee].state === "success" ? "#3FB97E" : recheckState[op.employee].state === "error" ? "#EF4444" : COLORS.mist }}>
                              {recheckState[op.employee].message}
                            </span>
                          ) : (
                            <span style={{ color: COLORS.mist }}>no CP data</span>
                          )}
                        </div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.mist }}>{fmtCurrency(op.infloww_sales)} (Infw)</div>
                      </div>
                    ))}
                    {noCpOps.length > 30 && <div style={{ padding: "10px 22px", fontSize: 11, color: COLORS.mist, textAlign: "center" }}>+ altri {noCpOps.length - 30} no-CP</div>}
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
      <span style={{ color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>{l}</span>
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
    return <span title={state.message} style={iconBtnStyle("#3FB97E")}>
      <CheckCircle2 size={11} />
    </span>;
  }
  if (s === "error") {
    return <button onClick={onClick} title={`Errore: ${state.message}. Click per riprovare`} style={iconBtnStyle("#EF4444", true)}>
      <XCircle size={11} />
    </button>;
  }
  return (
    <button onClick={onClick} title="🔍 Cerca live in CP e auto-importa se trovato" style={iconBtnStyle(COLORS.champagne, true)}>
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
