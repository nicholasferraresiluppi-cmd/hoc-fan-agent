"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const PERIOD_TYPES = [
  { value: "monthly", label: "Mensile" },
  { value: "weekly", label: "Settimanale" },
  { value: "quarterly", label: "Trimestrale" },
];

const CATEGORY_FILTERS = [
  { value: "", label: "Tutte" },
  { value: "Big", label: "Big" },
  { value: "Medium", label: "Medium" },
  { value: "Small", label: "Small" },
];

const MONTH_NAMES_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const TIER_COLORS = {
  Critical: "#D44545",
  Weak: "#E76F51",
  Average: "#B89158",
  Good: "#D4AF7A",
  Strong: "#3FB97E",
  Elite: "#4F8CCB",
};

const CATEGORY_COLORS = {
  Big: "#4F8CCB",
  Medium: "#D4AF7A",
  Small: "#8F8A82",
};

/* =================================================
 * Period option generators
 * ================================================= */

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) {
    d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
  }
  return {
    year: new Date(firstThursday).getUTCFullYear(),
    week: 1 + Math.ceil((firstThursday - d) / 604800000),
  };
}

function generateMonthlyOptions(count = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES_IT[m]} ${y}`,
    });
  }
  return out;
}

function generateWeeklyOptions(count = 16) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const { year, week } = getISOWeek(d);
    const jan4 = new Date(year, 0, 4);
    const jan4DayNum = (jan4.getDay() + 6) % 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - jan4DayNum + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const fmt = (date) => `${date.getDate()} ${MONTH_NAMES_IT[date.getMonth()].slice(0, 3)}`;
    out.push({
      value: `${year}-W${String(week).padStart(2, "0")}`,
      label: `Settimana ${week} (${fmt(weekStart)}–${fmt(weekEnd)})`,
    });
  }
  const seen = new Set();
  return out.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

function generateQuarterlyOptions(count = 6) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}` });
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  return out;
}

/* =================================================
 * Format helpers
 * ================================================= */

function fmtCurrency(v, dec = 0) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("it-IT", { maximumFractionDigits: dec });
}
function fmtPct(v, dec = 2) {
  if (v == null) return "—";
  return (v * 100).toFixed(dec) + "%";
}
function fmtNum(v, dec = 0) {
  if (v == null) return "—";
  return Number(v).toLocaleString("it-IT", { maximumFractionDigits: dec });
}
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* =================================================
 * Sub-components
 * ================================================= */

function TierBadge({ tier }) {
  if (!tier) return null;
  const color = TIER_COLORS[tier] || COLORS.mist;
  return (
    <span style={{
      display: "inline-block", padding: "3px 11px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
      background: color + "26", color: color, border: `1px solid ${color}55`,
    }}>{tier}</span>
  );
}

function CategoryBadge({ category }) {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] || COLORS.mist;
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      background: color + "20", color: color, border: `1px solid ${color}55`,
      marginLeft: 6, verticalAlign: "middle",
    }}>{category}</span>
  );
}

function Avatar({ name, size = 40, large = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: large ? `linear-gradient(135deg, ${COLORS.champagne} 0%, ${COLORS.charcoal} 100%)` : COLORS.charcoal,
      color: large ? COLORS.obsidian : COLORS.alabaster,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.display, fontWeight: 600, fontSize: size * 0.36,
      flexShrink: 0,
      border: large ? `3px solid ${COLORS.graphite}` : `1px solid ${COLORS.charcoal}`,
      boxShadow: large ? `0 0 0 2px ${COLORS.champagne}, 0 8px 24px rgba(212,175,122,0.25)` : "none",
    }}>{getInitials(name)}</div>
  );
}

function MiniBar({ value, color }) {
  return (
    <div style={{ height: 4, width: "100%", maxWidth: 90, background: COLORS.charcoal, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ height: "100%", background: color, width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22, color: color || COLORS.alabaster }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function KpiVsGroup({ value, mean, formatter, label }) {
  if (value == null) return <span style={{ color: COLORS.mist }}>—</span>;
  const isAbove = mean && value > mean;
  return (
    <div title={`${label}: media Group ${formatter(mean)}`}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: isAbove ? "#3FB97E" : COLORS.alabaster }}>{formatter(value)}</div>
      {mean != null && mean > 0 && (
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.mist, marginTop: 1 }}>Ø {formatter(mean)}</div>
      )}
    </div>
  );
}

/* =================================================
 * Hero card (#1)
 * ================================================= */

function HeroCard({ op, groupMeans }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.champagne;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${tierColor}1F 0%, ${COLORS.graphite}99 60%)`,
      border: `1px solid ${tierColor}55`,
      borderRadius: 20, padding: "28px 32px", marginBottom: 16,
      display: "grid", gridTemplateColumns: "auto 1fr auto auto",
      gap: 28, alignItems: "center", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle 300px at 100% 50%, ${tierColor}30, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ textAlign: "center", position: "relative" }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>👑</div>
        <div style={{
          fontFamily: FONTS.display, fontWeight: 500, fontStyle: "italic",
          fontSize: 56, lineHeight: 1, color: COLORS.champagne,
        }}>1</div>
        <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 4 }}>Top operator</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative" }}>
        <Avatar name={op.employee} size={84} large />
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{op.employee}</div>
          <div style={{ color: COLORS.champagne, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
            {op.group}
            <CategoryBadge category={op.category} />
          </div>
          <TierBadge tier={op.tier} />
        </div>
      </div>
      <div style={{ textAlign: "right", position: "relative" }}>
        <div style={{ fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 2 }}>Score</div>
        <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 56, lineHeight: 1, color: tierColor }}>{op.score?.toFixed(1)}</div>
        <div style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 13, marginTop: 2 }}>/ 100</div>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        borderLeft: `1px solid ${COLORS.champagne}33`,
        paddingLeft: 24, position: "relative",
      }}>
        <HeroStat l="Fan CVR" v={fmtPct(op.fan_cvr)} mean={fmtPct(groupMeans?.fan_cvr)} />
        <HeroStat l="Unlock rate" v={fmtPct(op.unlock_rate)} mean={fmtPct(groupMeans?.unlock_rate)} />
        <HeroStat l="$/paying fan" v={fmtCurrency(op.avg_earnings_per_paying_fan)} mean={fmtCurrency(groupMeans?.avg_earnings_per_paying_fan)} />
        <HeroStat l="Sales totali" v={fmtCurrency(op.sales)} mean={null} />
      </div>
    </div>
  );
}

function HeroStat({ l, v, mean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
      <span style={{ color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>{l}</span>
      <span>
        <span style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.alabaster, fontSize: 14 }}>{v}</span>
        {mean && <span style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 10, marginLeft: 6 }}>Ø {mean}</span>}
      </span>
    </div>
  );
}

/* =================================================
 * Top4 cards (ranks 2-5)
 * ================================================= */

function Top4Card({ op }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.alabaster;
  return (
    <div style={{
      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14, padding: 16, transition: "all 0.2s", position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          fontFamily: FONTS.display, fontStyle: "italic",
          fontSize: 24, color: COLORS.champagne, lineHeight: 1, width: 28,
        }}>{op.rank}</div>
        <Avatar name={op.employee} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONTS.display, fontSize: 15, fontWeight: 500,
            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{op.employee}</div>
          <div style={{
            fontSize: 10, color: COLORS.fog, textTransform: "uppercase",
            letterSpacing: "0.08em", marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {op.group}
            <CategoryBadge category={op.category} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 24, color: tierColor }}>{op.score?.toFixed(1)}</div>
        <TierBadge tier={op.tier} />
      </div>
      <div style={{ height: 4, background: COLORS.charcoal, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", background: tierColor, width: `${op.score || 0}%` }} />
      </div>
    </div>
  );
}

/* =================================================
 * Stream row (ranks 6+)
 * ================================================= */

function StreamRow({ op, groupMeans }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.alabaster;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "50px 36px 1.7fr 1.4fr 0.8fr 1fr 1fr 1fr 1fr 1fr",
      alignItems: "center",
      padding: "12px 22px",
      borderBottom: `1px solid ${COLORS.charcoal}88`,
      transition: "background 0.15s",
      fontSize: 13,
    }}>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.fog, fontSize: 13 }}>
        {op.rank ? String(op.rank).padStart(2, "0") : "—"}
      </div>
      <Avatar name={op.employee} size={28} />
      <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 500 }}>{op.employee}</div>
      <div style={{ color: COLORS.fog, fontSize: 12 }}>
        {op.group}
        <CategoryBadge category={op.category} />
      </div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: tierColor }}>
        {op.score?.toFixed(1) ?? "—"}
      </div>
      <div><TierBadge tier={op.tier} /></div>
      <KpiVsGroup value={op.fan_cvr} mean={groupMeans?.fan_cvr} formatter={(v) => fmtPct(v)} label="Fan CVR" />
      <KpiVsGroup value={op.unlock_rate} mean={groupMeans?.unlock_rate} formatter={(v) => fmtPct(v)} label="Unlock" />
      <KpiVsGroup value={op.avg_earnings_per_paying_fan} mean={groupMeans?.avg_earnings_per_paying_fan} formatter={(v) => fmtCurrency(v)} label="$/paying" />
      <MiniBar value={op.score} color={tierColor} />
    </div>
  );
}

/* =================================================
 * Main page
 * ================================================= */

export default function OperationalLeaderboardPage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [periodId, setPeriodId] = useState("");
  const [clockIn, setClockIn] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const periodOptions = useMemo(() => {
    if (periodType === "monthly") return generateMonthlyOptions();
    if (periodType === "weekly") return generateWeeklyOptions();
    return generateQuarterlyOptions();
  }, [periodType]);

  useEffect(() => {
    if (periodOptions.length > 0) {
      if (!periodId || !periodOptions.find((p) => p.value === periodId)) {
        setPeriodId(periodOptions[0].value);
      }
    }
  }, [periodType, periodOptions]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period_type", periodType);
    p.set("period_id", periodId);
    p.set("clock_in", clockIn ? "yes" : "no");
    if (groupFilter) p.set("group", groupFilter);
    if (categoryFilter) p.set("category", categoryFilter);
    return p.toString();
  }, [periodType, periodId, clockIn, groupFilter, categoryFilter]);

  const { data, error, isLoading } = useSWR(
    periodId ? `/api/leaderboard/operational?${queryString}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const ranking = (data?.ranking || []).filter((r) => r.score !== null);
  const groupAverages = data?.groupAverages || {};

  const heroOp = ranking[0];
  const top4 = ranking.slice(1, 5);
  const stream = ranking.slice(5);

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: { fontFamily: FONTS.display, fontSize: 32, margin: "0 0 6px 0", letterSpacing: "-0.01em", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    filterBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterRow2: { display: "flex", gap: 10, alignItems: "center", marginBottom: 22, flexWrap: "wrap" },
    filterLabel: { fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 4 },
    pill: (active) => ({
      padding: "9px 16px",
      background: active ? COLORS.champagne : COLORS.graphite,
      border: `1px solid ${active ? COLORS.champagne : COLORS.charcoal}`,
      borderRadius: 999,
      color: active ? COLORS.obsidian : COLORS.alabaster,
      fontSize: 13, cursor: "pointer", fontWeight: active ? 600 : 500,
      fontFamily: FONTS.body, transition: "all 0.2s",
    }),
    catPill: (active, color) => ({
      padding: "8px 14px",
      background: active ? color : COLORS.graphite,
      border: `1px solid ${active ? color : COLORS.charcoal}`,
      borderRadius: 999,
      color: active ? COLORS.obsidian : COLORS.alabaster,
      fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 500,
      fontFamily: FONTS.body, transition: "all 0.2s",
    }),
    select: {
      padding: "9px 14px",
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 10,
      color: COLORS.alabaster,
      fontSize: 13, fontFamily: FONTS.body,
      cursor: "pointer", minWidth: 180, outline: "none",
    },
    checkbox: {
      padding: "9px 16px",
      background: clockIn ? COLORS.champagne : COLORS.graphite,
      border: `1px solid ${clockIn ? COLORS.champagne : COLORS.charcoal}`,
      borderRadius: 999,
      color: clockIn ? COLORS.obsidian : COLORS.alabaster,
      fontSize: 13, cursor: "pointer", display: "inline-flex",
      alignItems: "center", gap: 7,
      fontFamily: FONTS.body, fontWeight: clockIn ? 600 : 500,
    },
    summary: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
    top4Grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
    streamWrap: {
      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 16, overflow: "hidden",
    },
    streamHead: {
      display: "grid",
      gridTemplateColumns: "50px 36px 1.7fr 1.4fr 0.8fr 1fr 1fr 1fr 1fr 1fr",
      padding: "14px 22px",
      background: COLORS.obsidian + "80",
      color: COLORS.fog,
      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
      fontWeight: 500,
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href="/leaderboard" style={styles.backLink}>← Leaderboard Training</Link>
        <h1 style={styles.title}>Leaderboard Operativa</h1>
        <p style={styles.sub}>
          Performance reale del team su Infloww. Score 0-100 calcolato sui KPI di efficienza
          confrontati con la media del proprio Group (team modella). I volumi totali (Sales, PPV)
          sono informativi ma non entrano nello Score. Account "Mass" esclusi automaticamente.
        </p>

        {/* Filter bar — periodo */}
        <div style={styles.filterBar}>
          {PERIOD_TYPES.map((pt) => (
            <button
              key={pt.value}
              style={styles.pill(periodType === pt.value)}
              onClick={() => setPeriodType(pt.value)}
            >{pt.label}</button>
          ))}
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={styles.select}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={styles.select}>
            <option value="">Tutti i Group</option>
            {data?.groups?.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={clockIn}
              onChange={(e) => setClockIn(e.target.checked)}
              style={{ accentColor: COLORS.champagne }}
            />
            Includi KPI clock-in
          </label>
        </div>

        {/* Filter bar — categoria */}
        <div style={styles.filterRow2}>
          <span style={styles.filterLabel}>Categoria:</span>
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.value}
              style={styles.catPill(categoryFilter === c.value, CATEGORY_COLORS[c.value] || COLORS.champagne)}
              onClick={() => setCategoryFilter(c.value)}
            >
              {c.label}
              {data?.category_counts && c.value && (
                <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>
                  ({data.category_counts[c.value] ?? 0})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* States */}
        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore di rete: {String(error)}</p>}
        {data?.error && (
          <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12, marginBottom: 14 }}>
            {data.error}{" "}
            <Link href="/admin/leaderboard-import" style={{ color: COLORS.champagne, marginLeft: 6 }}>
              Importa CSV →
            </Link>
          </div>
        )}

        {/* Summary cards */}
        {data && !data.error && (
          <div style={styles.summary}>
            <StatCard
              label="Operatori in classifica"
              value={fmtNum(data.eligible_total)}
              sub={data.total > data.eligible_total ? `+${data.total - data.eligible_total} senza score` : null}
            />
            <StatCard label="Score medio" value={`${data.avg_score?.toFixed(1)} / 100`} />
            <StatCard
              label="Tier Elite"
              value={fmtNum(data.elite_count)}
              sub={`${data.strong_count} Strong`}
              color={TIER_COLORS.Elite}
            />
            <StatCard
              label="Account mass esclusi"
              value={fmtNum(data.mass_excluded)}
              sub={data.mass_excluded > 0 ? "broadcast filtrati" : null}
            />
          </div>
        )}

        {/* Hero #1 */}
        {heroOp && <HeroCard op={heroOp} groupMeans={groupAverages[heroOp.group]} />}

        {/* Top 2-5 */}
        {top4.length > 0 && (
          <div style={styles.top4Grid}>
            {top4.map((op) => (
              <Top4Card key={`${op.employee}-${op.group}`} op={op} />
            ))}
          </div>
        )}

        {/* Stream 6+ */}
        {stream.length > 0 && (
          <div style={styles.streamWrap}>
            <div style={styles.streamHead}>
              <div>#</div>
              <div></div>
              <div>Operatore</div>
              <div>Group</div>
              <div>Score</div>
              <div>Tier</div>
              <div>Fan CVR</div>
              <div>Unlock</div>
              <div>$/paying</div>
              <div>Progress</div>
            </div>
            {stream.map((op, i) => (
              <StreamRow
                key={`${op.employee}-${op.group}-${i}`}
                op={op}
                groupMeans={groupAverages[op.group]}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {data && !data.error && ranking.length === 0 && (
          <div style={{
            background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
            borderRadius: 14, padding: 32, textAlign: "center", color: COLORS.fog,
          }}>
            Nessun operatore in classifica per questo filtro.
            {categoryFilter && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Suggerimento: alcuni Group potrebbero non essere ancora classificati.{" "}
                <Link href="/admin/group-categories" style={{ color: COLORS.champagne }}>Vai a Categorie Group →</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
