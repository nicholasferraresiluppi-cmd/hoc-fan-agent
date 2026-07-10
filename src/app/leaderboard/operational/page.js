"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

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
  { value: "Uncategorized", label: "Senza cat" },
];

const LANGUAGE_FILTERS = [
  { value: "", label: "Tutte" },
  { value: "ita", label: "🇮🇹 ITA" },
  { value: "eng", label: "🇬🇧 ENG" },
  { value: "none", label: "Senza" },
];

// Mappa value pill → chiave nei counts del backend
const LANGUAGE_COUNT_KEY = { ita: "ita", eng: "eng", none: "unknown" };

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

const LANGUAGE_COLORS = {
  ita: "#3FB97E",
  eng: "#4F8CCB",
};

const EXCLUSION_ACTIONS = [
  { reason: "non_chatter",  label: "Escludi — Non-chatter", description: "SM, trainer, account servizio", color: CP.accentSoftText },
  { reason: "manual",       label: "Escludi — Manuale",     description: "Esclusione caso per caso",       color: CP.accent },
  { reason: "data_quality", label: "Escludi — Data quality",description: "Dati incompleti/sospetti",       color: CP.accentRed },
];

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
  // Formato italiano: 4,66% invece di 4.66%
  return (v * 100).toFixed(dec).replace(".", ",") + "%";
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
 * Admin actions menu (kebab ⋮) — visibile solo se canExclude.
 * Permette di escludere l'operatore direttamente dalla leaderboard
 * con un click, senza dover andare in /admin/leaderboard-exclusions.
 * ================================================= */

function AdminActionsMenu({ employee, onExcluded, light = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleExclude(reason, label) {
    if (!confirm(`Escludere "${employee}" dalla leaderboard?\nReason: ${label}\n\nTornerà visibile rimuovendolo da /admin/leaderboard-exclusions.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/leaderboard-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee, reason, note: "Aggiunto dalla leaderboard" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Errore esclusione");
      } else {
        setOpen(false);
        if (onExcluded) onExcluded();
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        disabled={busy}
        title="Azioni admin"
        style={{
          width: 28, height: 28,
          background: open ? COLORS.charcoal : "transparent",
          border: `1px solid ${open ? COLORS.steel : "transparent"}`,
          color: light ? COLORS.obsidian : COLORS.fog,
          borderRadius: 6, cursor: busy ? "wait" : "pointer",
          fontSize: 18, lineHeight: 1, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          padding: 0, transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = COLORS.charcoal + "66"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        ⋮
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 240,
            background: COLORS.graphite,
            border: `1px solid ${COLORS.steel}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            padding: 4,
            zIndex: 50,
          }}
        >
          <div style={{
            padding: "8px 12px 6px",
            fontSize: 10, color: COLORS.mist,
            letterSpacing: "0.1em",
            borderBottom: `1px solid ${COLORS.charcoal}`,
            marginBottom: 4,
          }}>
            {employee}
          </div>
          {EXCLUSION_ACTIONS.map((a) => (
            <button
              key={a.reason}
              onClick={() => handleExclude(a.reason, a.label.replace("Escludi — ", ""))}
              disabled={busy}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", background: "transparent",
                border: "none", color: COLORS.alabaster,
                fontSize: 13, fontFamily: FONTS.body,
                cursor: busy ? "wait" : "pointer", borderRadius: 6,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = a.color + "20"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontWeight: 600, color: a.color }}>{a.label}</div>
              <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 2 }}>{a.description}</div>
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${COLORS.charcoal}`, marginTop: 4, padding: "6px 12px" }}>
            <Link
              href="/admin/leaderboard-exclusions"
              style={{ fontSize: 11, color: COLORS.fog, textDecoration: "none" }}
            >
              Gestione completa esclusioni →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
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
      fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", 
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
      fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", 
      background: color + "20", color: color, border: `1px solid ${color}55`,
      marginLeft: 6, verticalAlign: "middle",
    }}>{category}</span>
  );
}

function EstimatedTag({ small = false }) {
  return (
    <span
      title="Stima equa: l'operatore lavora su più creator, Infloww non fornisce il breakdown esatto"
      style={{
        display: "inline-block",
        marginLeft: 5,
        padding: small ? "1px 5px" : "2px 6px",
        fontSize: small ? 8 : 9,
        letterSpacing: "0.06em",
        color: COLORS.mist,
        background: COLORS.charcoal,
        border: `1px solid ${COLORS.steel}`,
        borderRadius: 3,
        fontFamily: FONTS.mono,
        fontWeight: 500,
        verticalAlign: "middle",
        
      }}
    >
      ~stima
    </span>
  );
}

function LanguageBadge({ language }) {
  if (!language) return null;
  const color = LANGUAGE_COLORS[language] || COLORS.mist;
  const label = language === "eng" ? "EN" : language === "ita" ? "IT" : "?";
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
      background: color + "20", color: color, border: `1px solid ${color}55`,
      marginLeft: 6, verticalAlign: "middle", fontFamily: FONTS.mono,
    }}>{label}</span>
  );
}

function Avatar({ name, size = 40, large = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: large ? COLORS.champagne : COLORS.charcoal,
      color: large ? COLORS.obsidian : COLORS.alabaster,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.display, fontWeight: 600, fontSize: size * 0.36,
      flexShrink: 0,
      border: large ? `3px solid ${COLORS.graphite}` : `1px solid ${COLORS.charcoal}`,
      boxShadow: large ? `0 0 0 2px ${COLORS.champagne}, 0 8px 24px rgba(139,124,246,0.25)` : "none",
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

function StatCard({ label, value, sub, color, tooltip }) {
  return (
    <div
      title={tooltip || ""}
      style={{
        background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
        borderRadius: 14, padding: "16px 18px",
        cursor: tooltip ? "help" : "default",
      }}
    >
      <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.12em", marginBottom: 6 }}>
        {label}{tooltip && <span style={{ marginLeft: 4, opacity: 0.4 }}>ⓘ</span>}
      </div>
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
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: isAbove ? CP.accentGreen : COLORS.alabaster }}>{formatter(value)}</div>
      {mean != null && mean > 0 && (
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.mist, marginTop: 1 }}>Ø {formatter(mean)}</div>
      )}
    </div>
  );
}

/* =================================================
 * Hero card (#1)
 * ================================================= */

function HeroCard({ op, groupMeans, canExclude, onExcluded }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.champagne;
  return (
    <div style={{
      background: CP.surface,
      border: `1px solid ${tierColor}55`,
      borderRadius: 20, padding: "28px 32px", marginBottom: 16,
      display: "grid", gridTemplateColumns: "auto 1fr auto auto",
      gap: 28, alignItems: "center", position: "relative", overflow: "hidden",
    }}>
      {canExclude && (
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}>
          <AdminActionsMenu employee={op.employee} onExcluded={onExcluded} />
        </div>
      )}
      <div style={{ textAlign: "center", position: "relative" }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>👑</div>
        <div style={{
          fontFamily: FONTS.display, fontWeight: 500, fontStyle: "italic",
          fontSize: 56, lineHeight: 1, color: COLORS.champagne,
        }}>1</div>
        <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.15em", marginTop: 4 }}>Top operator</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative" }}>
        <Avatar name={op.employee} size={84} large />
        <div>
          <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4, cursor: "pointer" }}>{op.employee} <span style={{ fontSize: 14, color: COLORS.champagne, opacity: 0.7 }}>→</span></div>
          </Link>
          <div style={{ color: COLORS.champagne, fontSize: 12, letterSpacing: "0.12em", marginBottom: 8 }}>
            {op.group}
            <CategoryBadge category={op.category} />
            <LanguageBadge language={op.language} />
          </div>
          <TierBadge tier={op.tier} />
        </div>
      </div>
      <div style={{ textAlign: "right", position: "relative" }}>
        <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.15em", marginBottom: 2 }}>Score</div>
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
      <span style={{ color: COLORS.fog, letterSpacing: "0.06em", fontSize: 10 }}>{l}</span>
      <span>
        <span style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.alabaster, fontSize: 14 }}>{v}</span>
        {mean && <span style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 10, marginLeft: 6 }}>Ø {mean}</span>}
      </span>
    </div>
  );
}

/* =================================================
 * Hero — Impact su creator (panel sotto la card del #1)
 * Mostra fino a 5 creator dell'operatore con barra % impatto.
 * Per multi-creator i numeri sono stime equa (marker "~").
 * ================================================= */

function HeroCreatorImpact({ op }) {
  if (!op?.creator_impact?.length) return null;
  const items = op.creator_impact.slice(0, 5);
  const maxPct = Math.max(...items.map((i) => i.share_pct || 0), 1);
  const isMulti = (op.creators?.length || 0) > 1;
  return (
    <div style={{
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14,
      padding: "18px 22px",
      marginBottom: 22,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: COLORS.fog, letterSpacing: "0.12em" }}>
          Impact su creator
        </div>
        <div style={{ fontSize: 12, color: COLORS.mist, marginTop: 4 }}>
          {op.employee} ha lavorato su {op.creators?.length || 0} creator
          {isMulti
            ? " — quote distribuite equamente (etichetta ~stima). Per il dato esatto servirebbe il breakdown operatore×creator che Infloww non fornisce."
            : " — quote esatte."}
        </div>
      </div>
      {items.map((it) => (
        <div
          key={it.creator}
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1.6fr 100px 1.4fr",
            gap: 16,
            alignItems: "center",
            padding: "10px 0",
            borderTop: `1px solid ${COLORS.charcoal}88`,
          }}
        >
          <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 500 }}>{it.creator}</div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.alabaster }}>
            {fmtCurrency(it.share_eur)}
            <span style={{ color: COLORS.mist }}> / {fmtCurrency(it.total_creator_sales)} tot</span>
            <span style={{ color: COLORS.mist, marginLeft: 8 }}>
              · {it.share_purch ?? 0}{it.estimated ? ` di ${it.total_creator_purch ?? 0}` : ""} purch
            </span>
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 14, color: COLORS.champagne, fontWeight: 700, textAlign: "right" }}>
            {it.share_pct}%
            {it.estimated && <EstimatedTag small />}
          </div>
          <div style={{ height: 6, background: COLORS.charcoal, borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              background: COLORS.champagne,
              width: `${Math.min(100, ((it.share_pct || 0) / maxPct) * 100)}%`,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================================================
 * Top4 cards (ranks 2-5)
 * ================================================= */

function Top4Card({ op, canExclude, onExcluded }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.alabaster;
  return (
    <div style={{
      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14, padding: 16, transition: "all 0.2s", position: "relative", overflow: "visible",
    }}>
      {canExclude && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
          <AdminActionsMenu employee={op.employee} onExcluded={onExcluded} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingRight: canExclude ? 28 : 0 }}>
        <div style={{
          fontFamily: FONTS.display, fontStyle: "italic",
          fontSize: 24, color: COLORS.champagne, lineHeight: 1, width: 28,
        }}>{op.rank}</div>
        <Avatar name={op.employee} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }} title="Apri scheda operatore">
            <div style={{
              fontFamily: FONTS.display, fontSize: 15, fontWeight: 500,
              lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              cursor: "pointer",
            }}>
              {op.employee}
              <span style={{ marginLeft: 5, color: COLORS.champagne, opacity: 0.55, fontSize: 12 }}>›</span>
            </div>
          </Link>
          <div style={{
            fontSize: 10, color: COLORS.fog, 
            letterSpacing: "0.08em", marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {op.group}
            <CategoryBadge category={op.category} />
            <LanguageBadge language={op.language} />
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
      {op.top_creator && (
        <div style={{
          marginTop: 10, paddingTop: 8,
          borderTop: `1px solid ${COLORS.charcoal}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 11,
        }}>
          <span style={{ color: COLORS.fog, letterSpacing: "0.06em", fontSize: 9 }}>Top creator</span>
          <span style={{ color: COLORS.alabaster, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "65%" }} title={`${op.top_creator.creator}${op.top_creator.estimated ? " (stima equa)" : " (esatto)"}`}>
            {op.top_creator.creator}
            <span style={{ color: COLORS.champagne, marginLeft: 6 }}>{op.top_creator.share_pct}%</span>
            {op.top_creator.estimated && <EstimatedTag small />}
          </span>
        </div>
      )}
      {op.creators?.length > 0 && !op.top_creator && (
        <div style={{ marginTop: 10, fontSize: 11, color: COLORS.mist }}>
          {op.creators.length} creator
        </div>
      )}
    </div>
  );
}

/* =================================================
 * Stream row (ranks 6+)
 * ================================================= */

function StreamRow({ op, groupMeans, canExclude, onExcluded, cpAvailable = false }) {
  const tierColor = TIER_COLORS[op.tier] || COLORS.alabaster;
  // Cols: # avatar Operator Group Score Tier FanCVR Unlock Purch [CPSales] $/paying Progress [Kebab]
  const base = "50px 36px 1.7fr 1.4fr 0.8fr 1fr 1fr 1fr 0.7fr" + (cpAvailable ? " 0.9fr" : "") + " 1fr 1fr";
  const cols = canExclude ? base + " 44px" : base;
  const topCreatorTitle = op.top_creator
    ? `Top creator: ${op.top_creator.creator} (${op.top_creator.estimated ? "stima ~" : "esatto"} ${op.top_creator.share_pct}%)`
    : op.creators?.length > 0
    ? `Creator: ${op.creators.join(", ")}`
    : "Nessun creator associato";
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: cols,
      alignItems: "center",
      padding: "12px 22px",
      borderBottom: `1px solid ${COLORS.charcoal}88`,
      transition: "background 0.15s",
      fontSize: 13,
      overflow: "visible",
    }}>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: COLORS.fog, fontSize: 13 }}>
        {op.rank ? String(op.rank).padStart(2, "0") : "—"}
      </div>
      <Avatar name={op.employee} size={28} />
      <div style={{ minWidth: 0 }}>
        <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
          <div className="hoc-clickable" style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} title={topCreatorTitle || "Apri scheda operatore"}>
            {op.employee}
            <span style={{ marginLeft: 5, color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span>
          </div>
        </Link>
        {op.top_creator ? (
          <div style={{ fontSize: 10, color: COLORS.mist, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center" }}>
            <span style={{ color: COLORS.fog, overflow: "hidden", textOverflow: "ellipsis" }}>{op.top_creator.creator}</span>
            <span style={{ color: COLORS.champagne, marginLeft: 4, fontFamily: FONTS.mono, flexShrink: 0 }}>{op.top_creator.share_pct}%</span>
            {op.top_creator.estimated && <EstimatedTag small />}
          </div>
        ) : op.creators?.length > 0 ? (
          <div style={{ fontSize: 10, color: COLORS.mist, marginTop: 2 }}>{op.creators.length} creator</div>
        ) : null}
      </div>
      <div style={{ color: COLORS.fog, fontSize: 12 }}>
        {op.group}
        <CategoryBadge category={op.category} />
        <LanguageBadge language={op.language} />
      </div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: tierColor }}>
        {op.score?.toFixed(1) ?? "—"}
      </div>
      <div><TierBadge tier={op.tier} /></div>
      <KpiVsGroup value={op.fan_cvr} mean={groupMeans?.fan_cvr} formatter={(v) => fmtPct(v)} label="Fan CVR" />
      <KpiVsGroup value={op.unlock_rate} mean={groupMeans?.unlock_rate} formatter={(v) => fmtPct(v)} label="Unlock" />
      <div
        title={op.ppv_sales != null ? `${op.ppvs_unlocked ?? 0} purch · ${fmtCurrency(op.ppv_sales)} PPV sales` : "Purch sbloccati nel periodo"}
        style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.alabaster, fontWeight: 600 }}
      >
        {op.ppvs_unlocked != null ? Number(op.ppvs_unlocked).toLocaleString("it-IT") : "—"}
      </div>
      {cpAvailable && (
        <div
          title={op.cp_data ? `CP: ${op.cp_data.total_shifts} shift, ${fmtCurrency(op.cp_data.total_sales)} sales, top fascia: ${op.cp_data.top_interval || "—"}` : "Dato CP non disponibile per questo operatore (mapping mancante?)"}
          style={{ fontFamily: FONTS.mono, fontSize: 13, color: op.cp_data ? CP.accentGreen : COLORS.mist, fontWeight: 600 }}
        >
          {op.cp_data ? fmtCurrency(op.cp_data.sales_per_shift) : "—"}
          {op.cp_data && (
            <div style={{ fontSize: 9, color: COLORS.mist, marginTop: 1 }}>{op.cp_data.total_shifts}sh</div>
          )}
        </div>
      )}
      <KpiVsGroup value={op.avg_earnings_per_paying_fan} mean={groupMeans?.avg_earnings_per_paying_fan} formatter={(v) => fmtCurrency(v)} label="$/paying" />
      <MiniBar value={op.score} color={tierColor} />
      {canExclude && (
        <div style={{ textAlign: "right" }}>
          <AdminActionsMenu employee={op.employee} onExcluded={onExcluded} />
        </div>
      )}
    </div>
  );
}

/* =================================================
 * Health bar — trend agenzia ultimi N periodi.
 * Risponde a "stiamo alzando la media?" e "la qualità sale?".
 * ================================================= */

function HealthBar({ periodType }) {
  const { data } = useSWR(`/api/leaderboard/health?period_type=${periodType}&limit=12`, fetcher, { revalidateOnFocus: false });
  if (!data || data.error || !data.summary || !data.history?.length) return null;
  const { current, previous, delta_avg, delta_quality } = data.summary;
  const history = data.history;
  const maxAvg = Math.max(...history.map((h) => h.avg_score || 0), 1);

  return (
    <div style={{
      background: CP.surface,
      border: `1px solid ${COLORS.steel}`,
      borderRadius: 14, padding: "18px 22px", marginBottom: 22,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.fog, letterSpacing: "0.12em" }}>
            Health agenzia — ultimi {history.length} {periodType === "monthly" ? "mesi" : periodType === "weekly" ? "settimane" : "trimestri"}
          </div>
          <div style={{ fontSize: 12, color: COLORS.mist, marginTop: 4 }}>
            Score medio attuale {current.avg_score.toFixed(1)}/100 su {current.eligible} eligible{previous ? " · vs precedente:" : ""}{previous && (
              <span style={{
                marginLeft: 6,
                color: delta_avg > 0 ? CP.accentGreen : delta_avg < 0 ? CP.accentRed : COLORS.mist,
                fontWeight: 600, fontFamily: FONTS.mono,
              }}>
                {delta_avg > 0 ? "↑ +" : delta_avg < 0 ? "↓ " : ""}{Math.abs(delta_avg).toFixed(1)} pt
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 11 }}>
          <div>
            <div style={{ color: COLORS.fog, letterSpacing: "0.08em", fontSize: 9 }}>Qualità (Elite+Strong vs Critical+Weak)</div>
            <div style={{ marginTop: 4, fontFamily: FONTS.mono, fontSize: 14, fontWeight: 600, color: CP.accentGreen }}>
              +{current.elite_strong - current.critical_weak}
              {previous && (
                <span style={{ marginLeft: 8, fontSize: 11, color: delta_quality > 0 ? CP.accentGreen : delta_quality < 0 ? CP.accentRed : COLORS.mist }}>
                  {delta_quality > 0 ? "↑ +" : delta_quality < 0 ? "↓ " : ""}{Math.abs(delta_quality)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Sparkline barre con tooltip ricco */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50 }}>
        {history.map((h) => {
          const heightPct = ((h.avg_score || 0) / maxAvg) * 100;
          const tColor = h.avg_score >= 70 ? CP.accentGreen : h.avg_score >= 55 ? COLORS.champagne : CP.accentRed;
          const tc = h.tier_counts || {};
          const tooltip = [
            `Periodo: ${h.period_id}`,
            `Score medio: ${h.avg_score.toFixed(1).replace(".", ",")} / 100`,
            `Eligible: ${h.eligible}`,
            `Elite: ${tc.Elite || 0} · Strong: ${tc.Strong || 0} · Good: ${tc.Good || 0}`,
            `Average: ${tc.Average || 0} · Weak: ${tc.Weak || 0} · Critical: ${tc.Critical || 0}`,
            `Qualità: ${h.elite_strong - h.critical_weak >= 0 ? "+" : ""}${h.elite_strong - h.critical_weak}`,
          ].join("\n");
          return (
            <div key={h.period_id} title={tooltip}
                 style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "help" }}>
              <div style={{ width: "100%", height: `${heightPct}%`, background: tColor, borderRadius: "2px 2px 0 0", minHeight: 2, opacity: 0.85, transition: "opacity 0.15s" }}
                   onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                   onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: COLORS.mist, fontFamily: FONTS.mono }}>
        <span>{history[0]?.period_id}</span>
        <span>{history[history.length - 1]?.period_id}</span>
      </div>
    </div>
  );
}

/* =================================================
 * Action Center — Top N da cambiare separati per lingua (admin only).
 * Compatto, posizionato in alto sotto la Health bar per immediatezza.
 * - Rispetta il filtro lingua principale (1 colonna se ITA o ENG attivo)
 * - Selettore dimensione lista (3/5/7/10)
 * - Azione "Ignora dalla lista" + collapsible per ripristinare ignorati
 * ================================================= */

const SIZE_OPTIONS = [3, 5, 7, 10];

function UnderperformersKebab({ employee, onExcluded, onIgnored }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleIgnore() {
    if (!confirm(`Ignorare "${employee}" dalla lista "da cambiare"?\n\nResta nella leaderboard ma non viene più conteggiato qui. Puoi ripristinarlo dal pannello "ignorati" sotto.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/underperformers-ignored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee, note: "Ignorato dal pannello Action Center" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) alert(data.error || "Errore");
      else { setOpen(false); if (onIgnored) onIgnored(); }
    } catch (err) { alert(String(err)); }
    finally { setBusy(false); }
  }

  async function handleExclude(reason, label) {
    if (!confirm(`Escludere "${employee}" dalla leaderboard?\nReason: ${label}\n\nScompare da TUTTA la classifica, non solo dal pannello "da cambiare".`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/leaderboard-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee, reason, note: "Aggiunto dal pannello da-cambiare" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) alert(data.error || "Errore");
      else { setOpen(false); if (onExcluded) onExcluded(); }
    } catch (err) { alert(String(err)); }
    finally { setBusy(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} disabled={busy}
        style={{
          width: 28, height: 28, background: open ? COLORS.charcoal : "transparent",
          border: `1px solid ${open ? COLORS.steel : "transparent"}`, color: COLORS.fog,
          borderRadius: 6, cursor: busy ? "wait" : "pointer", fontSize: 18, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>⋮</button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 260,
          background: COLORS.graphite, border: `1px solid ${COLORS.steel}`, borderRadius: 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)", padding: 4, zIndex: 50,
        }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 10, color: COLORS.mist, letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.charcoal}`, marginBottom: 4 }}>
            {employee}
          </div>
          <button onClick={handleIgnore} disabled={busy}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
              background: "transparent", border: "none", color: COLORS.alabaster, fontSize: 13,
              fontFamily: FONTS.body, cursor: busy ? "wait" : "pointer", borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.champagne + "20"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <div style={{ fontWeight: 600, color: COLORS.champagne }}>Ignora dalla lista</div>
            <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 2 }}>Resta in leaderboard, sparisce solo da qui</div>
          </button>
          <div style={{ borderTop: `1px solid ${COLORS.charcoal}`, margin: "4px 8px" }} />
          {EXCLUSION_ACTIONS.map((a) => (
            <button key={a.reason} onClick={() => handleExclude(a.reason, a.label.replace("Escludi — ", ""))} disabled={busy}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                background: "transparent", border: "none", color: COLORS.alabaster, fontSize: 13,
                fontFamily: FONTS.body, cursor: busy ? "wait" : "pointer", borderRadius: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = a.color + "20"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ fontWeight: 600, color: a.color }}>{a.label}</div>
              <div style={{ fontSize: 11, color: COLORS.mist, marginTop: 2 }}>{a.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UnderperformersColumn({ language, label, flag, periodType, periodId, size, onExcluded, onIgnored, fullWidth = false }) {
  const url = `/api/leaderboard/underperformers?period_type=${periodType}&period_id=${periodId}&lookback=3&min_chronic=2&limit=${size}&language=${language}`;
  const { data } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const list = data?.underperformers || [];
  const isLoading = !data;
  const totalCandidates = data?.total_candidates ?? list.length;
  const chronicityAvailable = data?.chronicity_available !== false;

  return (
    <div style={{
      background: COLORS.graphite,
      border: `1px solid ${COLORS.signal}40`,
      borderRadius: 12, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: COLORS.signal, letterSpacing: "0.1em", fontWeight: 600 }}>
          Da cambiare {flag} {label}
        </div>
        <div
          title={totalCandidates > list.length ? `Mostro ${list.length} su ${totalCandidates} candidati totali. Alza il selettore size per vederne di più.` : `Tutti i ${list.length} candidati mostrati`}
          style={{ fontSize: 11, color: COLORS.mist, fontFamily: FONTS.mono }}
        >
          {list.length}/{size}{totalCandidates > list.length ? ` · su ${totalCandidates}` : ""}
        </div>
      </div>
      {!chronicityAvailable && data && (
        <div style={{ fontSize: 10, color: COLORS.champagne, opacity: 0.8, padding: "4px 0", borderTop: `1px solid ${COLORS.charcoal}88` }}>
          ⓘ Solo periodo corrente disponibile — cronicità non calcolabile, mostro tutti i bottom score.
        </div>
      )}
      {data?.error && <div style={{ color: COLORS.signal, fontSize: 12 }}>{data.error}</div>}
      {isLoading && <div style={{ color: COLORS.mist, fontSize: 12 }}>Caricamento…</div>}
      {data && !data.error && list.length === 0 && (
        <div style={{ color: COLORS.fog, fontSize: 12, padding: "8px 0" }}>
          ✓ Nessun cronico in {label}. Stato healthy.
        </div>
      )}
      {list.map((op) => {
        const tColor = TIER_COLORS[op.tier] || COLORS.mist;
        return (
          <div key={op.employee} style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto 28px",
            alignItems: "center", gap: 10,
            padding: "8px 0",
            borderTop: `1px solid ${COLORS.charcoal}88`,
            fontSize: 13,
          }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} title={op.employee}>
                  {op.employee}
                </div>
              </Link>
              <div style={{ fontSize: 10, color: COLORS.mist, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.group}</div>
            </div>
            <div title={`Score ${op.score?.toFixed(1)} · Tier ${op.tier}`} style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: tColor, minWidth: 36, textAlign: "right" }}>
              {op.score?.toFixed(1)}
            </div>
            <div
              title={op.lookback_total > 0
                ? `Cronicità: ${op.chronic_count}/${op.lookback_total} periodi sotto Average`
                : "Solo periodo corrente — cronicità non calcolabile"}
              style={{ display: "flex", gap: 2, minWidth: 30 }}
            >
              {op.history?.length > 0 ? op.history.map((h, i) => {
                const hColor = h.tier ? TIER_COLORS[h.tier] : COLORS.charcoal;
                return <div key={i} title={`${h.period_id}: ${h.tier || "—"}`} style={{ width: 10, height: 10, borderRadius: 2, background: hColor + "AA", border: `1px solid ${hColor}` }} />;
              }) : <span style={{ fontSize: 9, color: COLORS.mist, fontStyle: "italic" }}>nuovo</span>}
            </div>
            <UnderperformersKebab employee={op.employee} onExcluded={onExcluded} onIgnored={onIgnored} />
          </div>
        );
      })}
    </div>
  );
}

function IgnoredPanel({ onChange }) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR("/api/admin/underperformers-ignored", fetcher, { revalidateOnFocus: false });
  const ignored = data?.ignored || {};
  const entries = Object.entries(ignored).sort((a, b) => (b[1].ignored_at || 0) - (a[1].ignored_at || 0));
  const isEmpty = entries.length === 0;

  async function restore(name) {
    if (!confirm(`Rimettere "${name}" nel computo da-cambiare?`)) return;
    const res = await fetch(`/api/admin/underperformers-ignored?employee=${encodeURIComponent(name)}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok || d.error) { alert(d.error || "Errore"); return; }
    await mutate("/api/admin/underperformers-ignored");
    if (onChange) onChange();
  }

  // v11: sempre visibile (anche con 0 ignorati) per scoperta della feature.
  return (
    <div style={{
      marginTop: 10,
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 10,
      opacity: isEmpty ? 0.6 : 1,
    }}>
      <button
        onClick={() => !isEmpty && setOpen(!open)}
        disabled={isEmpty}
        style={{
          width: "100%", padding: "10px 14px", background: "transparent", border: "none",
          color: COLORS.fog, fontSize: 12, fontFamily: FONTS.body,
          cursor: isEmpty ? "default" : "pointer",
          textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
        title={isEmpty ? "Nessun operatore ignorato finora. Usa il menu ⋮ sui candidati 'da cambiare' per ignorarli senza escluderli." : ""}
      >
        <span>
          <b style={{ color: COLORS.alabaster }}>{entries.length}</b> ignorati
          {isEmpty
            ? <span style={{ marginLeft: 6, opacity: 0.7 }}>— usa il menu ⋮ per aggiungere</span>
            : <span style={{ marginLeft: 6, opacity: 0.7 }}>— non conteggiati nel pannello "da cambiare"</span>}
        </span>
        {!isEmpty && <span style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{open ? "▾" : "▸"}</span>}
      </button>
      {open && !isEmpty && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.charcoal}` }}>
          {entries.map(([name, entry]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${COLORS.charcoal}88`, fontSize: 13 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link href={`/leaderboard/operational/${encodeURIComponent(name)}`} style={{ color: COLORS.alabaster, textDecoration: "none", fontWeight: 500 }}>{name} <span style={{ color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span></Link>
                {entry.note && <span style={{ color: COLORS.mist, fontSize: 11, marginLeft: 8, fontStyle: "italic" }}>"{entry.note}"</span>}
              </div>
              <span style={{ color: COLORS.mist, fontSize: 11, fontFamily: FONTS.mono }}>
                {entry.ignored_at ? new Date(entry.ignored_at).toLocaleDateString("it-IT") : "—"}
              </span>
              <button onClick={() => restore(name)}
                style={{ padding: "4px 10px", background: "transparent", color: COLORS.champagne,
                  border: `1px solid ${COLORS.champagne}66`, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                ↺ Ripristina
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnderperformersActionCenter({ periodType, periodId, canExclude, languageFilter, onExcluded }) {
  const [size, setSize] = useState(5);
  if (!canExclude || !periodId) return null;

  const onIgnored = () => {
    // Force refresh degli SWR delle due colonne. SWR usa URL come key; passiamo per mutate globale.
    mutate((key) => typeof key === "string" && key.startsWith("/api/leaderboard/underperformers"));
    mutate("/api/admin/underperformers-ignored");
  };

  const showIta = !languageFilter || languageFilter === "ita";
  const showEng = !languageFilter || languageFilter === "eng";
  const cols = showIta && showEng ? "1fr 1fr" : "1fr";

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.fog, letterSpacing: "0.12em" }}>
          Action center — operatori da cambiare (admin only)
          {languageFilter && <span style={{ marginLeft: 8, color: COLORS.champagne }}>· filtrato {languageFilter.toUpperCase()}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: COLORS.mist, letterSpacing: "0.08em" }}>Lista di:</span>
          {SIZE_OPTIONS.map((n) => (
            <button key={n} onClick={() => setSize(n)}
              style={{
                padding: "4px 10px",
                background: size === n ? COLORS.champagne : "transparent",
                color: size === n ? COLORS.obsidian : COLORS.fog,
                border: `1px solid ${size === n ? COLORS.champagne : COLORS.steel}`,
                borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: size === n ? 700 : 500,
                fontFamily: FONTS.mono,
              }}>{n}</button>
          ))}
          <input
            type="number"
            min={1}
            max={50}
            value={size}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setSize(Math.max(1, Math.min(50, v)));
            }}
            title="Numero personalizzato (1-50)"
            style={{
              width: 56, padding: "4px 8px",
              background: SIZE_OPTIONS.includes(size) ? "transparent" : COLORS.champagne,
              color: SIZE_OPTIONS.includes(size) ? COLORS.alabaster : COLORS.obsidian,
              border: `1px solid ${SIZE_OPTIONS.includes(size) ? COLORS.steel : COLORS.champagne}`,
              borderRadius: 6, fontSize: 11, fontFamily: FONTS.mono,
              fontWeight: SIZE_OPTIONS.includes(size) ? 500 : 700,
              outline: "none", textAlign: "center",
            }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>
        {showIta && <UnderperformersColumn language="ita" label="ITA" flag="🇮🇹" periodType={periodType} periodId={periodId} size={size} onExcluded={onExcluded} onIgnored={onIgnored} />}
        {showEng && <UnderperformersColumn language="eng" label="ENG" flag="🇬🇧" periodType={periodType} periodId={periodId} size={size} onExcluded={onExcluded} onIgnored={onIgnored} />}
      </div>
      <div style={{ fontSize: 10, color: COLORS.mist, marginTop: 8 }}>
        Criterio: score corrente più basso E almeno 2 dei 3 periodi precedenti sotto tier "Average". I quadratini mostrano gli ultimi 3 tier (colore = tier).
      </div>
      <IgnoredPanel onChange={onIgnored} />
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
  const [languageFilter, setLanguageFilter] = useState("");

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
    if (languageFilter) p.set("language", languageFilter);
    return p.toString();
  }, [periodType, periodId, clockIn, groupFilter, categoryFilter, languageFilter]);

  const leaderboardKey = periodId ? `/api/leaderboard/operational?${queryString}` : null;
  const { data, error, isLoading } = useSWR(leaderboardKey, fetcher, {
    revalidateOnFocus: false, keepPreviousData: true,
  });

  // Check capability admin (SEED) per mostrare i kebab menu inline
  const { data: me } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: false });
  const canExclude = me?.capabilities?.seed === "all";

  const onExcluded = () => { if (leaderboardKey) mutate(leaderboardKey); };

  const ranking = (data?.ranking || []).filter((r) => r.score !== null);
  const groupAverages = data?.groupAverages || {};

  const heroOp = ranking[0];
  const top4 = ranking.slice(1, 5);
  const stream = ranking.slice(5);

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    adminLink: { color: COLORS.champagne, fontSize: 12, textDecoration: "none", marginLeft: 14, padding: "4px 10px", border: `1px solid ${COLORS.champagne}44`, borderRadius: 6 },
    title: { fontFamily: FONTS.display, fontSize: 32, margin: "0 0 6px 0", letterSpacing: "-0.01em", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    filterBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterRow2: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
    filterRow3: { display: "flex", gap: 10, alignItems: "center", marginBottom: 22, flexWrap: "wrap" },
    filterLabel: { fontSize: 11, color: COLORS.fog, letterSpacing: "0.1em", marginRight: 4 },
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
    summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 22 },
    top4Grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
    streamWrap: {
      background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 16, overflow: "visible",
    },
    streamHead: {
      display: "grid",
      gridTemplateColumns: (() => {
        const cpAvail = !!data?.cp_available;
        const base = "50px 36px 1.7fr 1.4fr 0.8fr 1fr 1fr 1fr 0.7fr" + (cpAvail ? " 0.9fr" : "") + " 1fr 1fr";
        return canExclude ? base + " 44px" : base;
      })(),
      padding: "14px 22px",
      background: COLORS.obsidian + "80",
      color: COLORS.fog,
      fontSize: 10, letterSpacing: "0.1em",
      fontWeight: 500,
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
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
              <span style={{ color: CP.textPrimary }}>Operativa</span>
            </div>
          }
          section="Performance · Infloww"
          title="Leaderboard Operativa"
          subtitle={<>
            Performance reale del team su Infloww. Score 0-100 calcolato sui KPI di efficienza confrontati con la media del proprio Group. I volumi totali (Sales, PPV) sono informativi ma non entrano nello Score. Account &quot;Mass&quot;, esclusi e score zero nascosti.
            {canExclude && <> <span style={{ color: CP.accentGreen }}>Click sul menu ⋮ per escludere al volo.</span></>}
          </>}
          toolbar={canExclude && (
            <Link href="/admin/leaderboard-exclusions" style={styles.adminLink}>Esclusioni</Link>
          )}
        />


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
          <div style={{ position: "relative", minWidth: 200 }}>
            <input
              list="group-options"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              placeholder="Tutti i Group (digita per cercare)"
              style={{ ...styles.select, paddingRight: groupFilter ? 28 : 14 }}
            />
            <datalist id="group-options">
              {data?.groups?.map((g) => <option key={g} value={g} />)}
            </datalist>
            {groupFilter && (
              <button
                onClick={() => setGroupFilter("")}
                title="Pulisci filtro Group"
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", color: COLORS.fog,
                  cursor: "pointer", fontSize: 16, padding: "0 6px",
                }}
              >×</button>
            )}
          </div>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={clockIn}
              onChange={(e) => setClockIn(e.target.checked)}
              style={{ accentColor: COLORS.champagne }}
            />
            Includi KPI clock-in
          </label>
          <button
            onClick={() => leaderboardKey && mutate(leaderboardKey)}
            title="Ricarica dati"
            style={{
              padding: "9px 14px", background: COLORS.graphite,
              border: `1px solid ${COLORS.charcoal}`, borderRadius: 10,
              color: COLORS.fog, fontSize: 13, cursor: "pointer",
              fontFamily: FONTS.body, marginLeft: "auto",
            }}
          >Aggiorna</button>
        </div>

        {/* Filter bar — categoria */}
        <div style={styles.filterRow2}>
          <span style={styles.filterLabel}>Categoria:</span>
          {CATEGORY_FILTERS.map((c) => {
            const count = data?.category_counts
              ? (c.value
                  ? (data.category_counts[c.value] ?? 0)
                  : Object.values(data.category_counts).reduce((a, b) => a + (b || 0), 0))
              : null;
            return (
              <button
                key={c.value || "all"}
                style={styles.catPill(categoryFilter === c.value, CATEGORY_COLORS[c.value] || COLORS.champagne)}
                onClick={() => setCategoryFilter(c.value)}
              >
                {c.label}
                {count != null && (
                  <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter bar — lingua */}
        <div style={styles.filterRow3}>
          <span style={styles.filterLabel}>Lingua:</span>
          {LANGUAGE_FILTERS.map((l) => {
            const count = data?.language_counts
              ? (l.value
                  ? (data.language_counts[LANGUAGE_COUNT_KEY[l.value] || l.value] ?? 0)
                  : Object.values(data.language_counts).reduce((a, b) => a + (b || 0), 0))
              : null;
            return (
              <button
                key={l.value || "all"}
                style={styles.catPill(languageFilter === l.value, LANGUAGE_COLORS[l.value] || COLORS.champagne)}
                onClick={() => setLanguageFilter(l.value)}
              >
                {l.label}
                {count != null && (
                  <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
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

        {/* Health bar — trend agenzia */}
        <HealthBar periodType={periodType} />

        {/* Action center — top da cambiare (admin only) */}
        <UnderperformersActionCenter
          periodType={periodType}
          periodId={periodId}
          canExclude={canExclude}
          languageFilter={languageFilter}
          onExcluded={onExcluded}
        />

        {/* Summary cards */}
        {data && !data.error && (
          <div style={styles.summary}>
            <StatCard
              label="Operatori in classifica"
              value={fmtNum(data.eligible_total)}
              sub={data.total > data.eligible_total ? `+${data.total - data.eligible_total} senza score` : null}
              tooltip="Operatori con score > 0 nel periodo selezionato. Score = 0 (inattivi) e operatori esclusi sono contati separatamente."
            />
            <StatCard
              label="Score medio"
              value={`${data.avg_score?.toFixed(1).replace(".", ",")} / 100`}
              tooltip="Media aritmetica dello score degli operatori in classifica (esclusi gli inattivi)."
            />
            <StatCard
              label="Tier Elite"
              value={fmtNum(data.elite_count)}
              sub={`${data.strong_count} Strong`}
              color={TIER_COLORS.Elite}
              tooltip="Operatori in tier Elite (score 91-100). Strong = 81-90.99."
            />
            <StatCard
              label="Inattivi"
              value={fmtNum(data.inactive_count || 0)}
              sub={data.inactive_count > 0 ? "score 0 — nessuna attività" : null}
              color={data.inactive_count > 0 ? COLORS.mist : COLORS.alabaster}
              tooltip="Operatori senza KPI di volume nel periodo (sales=0, fans=0, messaggi=0). Non compaiono in classifica ma esistono nei dati."
            />
            <Link href="/admin/leaderboard-exclusions" style={{ color: "inherit", textDecoration: "none" }}>
              <StatCard
                label="Esclusi"
                value={fmtNum((data.mass_excluded || 0) + (data.manual_excluded || 0))}
                sub={`${data.mass_excluded ?? 0} mass · ${data.manual_excluded ?? 0} manuali · click per gestire →`}
                tooltip="Click per andare al pannello esclusioni. Mass = account broadcast automatici. Manuali = aggiunti da admin."
              />
            </Link>
            {data.cp_available && data.cp_agency && (
              <Link href="/admin/creatorspro-sync" style={{ color: "inherit", textDecoration: "none" }}>
                <StatCard
                  label="Sales agency (CP)"
                  value={fmtCurrency(data.cp_agency.total_sales)}
                  sub={`${data.cp_agency.total_shifts} shift · avg ${fmtCurrency(data.cp_agency.avg_sales_per_shift)}/shift`}
                  color={CP.accentGreen}
                  tooltip={`Dati da CreatorsPro. Top fascia: ${Object.entries(data.cp_agency.interval_sales || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—"}. Click per sync.`}
                />
              </Link>
            )}
          </div>
        )}

        {/* Hero #1 */}
        {heroOp && <HeroCard op={heroOp} groupMeans={groupAverages[heroOp.group]} canExclude={canExclude} onExcluded={onExcluded} />}

        {/* Hero — Impact su creator (sotto la card) */}
        {heroOp && <HeroCreatorImpact op={heroOp} />}

        {/* Top 2-5 */}
        {top4.length > 0 && (
          <div style={styles.top4Grid}>
            {top4.map((op) => (
              <Top4Card key={`${op.employee}-${op.group}`} op={op} canExclude={canExclude} onExcluded={onExcluded} />
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
              <div title="Score 0-100, somma pesata KPI di efficienza vs media Group">Score</div>
              <div title="Tier dello score: Critical < Weak < Average < Good < Strong < Elite">Tier</div>
              <div title="Fan CVR = fan_paganti / fan_chattati. Più alto = più conversione">Fan CVR</div>
              <div title="Unlock rate = ppv_sbloccati / ppv_inviati. Misura conversione PPV">Unlock</div>
              <div title="Purch = PPV unlocked (count). Volume di acquisti del periodo">Purch</div>
              {data?.cp_available && <div title="Sales medi per shift (da CreatorsPro). Verde = mappato, grigio = mapping mancante.">$/Shift</div>}
              <div title="$/paying fan = sales totali / fan_paganti. Valore medio per cliente">$/paying</div>
              <div title="Barra visiva proporzionale allo score">Progress</div>
              {canExclude && <div></div>}
            </div>
            {stream.map((op, i) => (
              <StreamRow
                key={`${op.employee}-${op.group}-${i}`}
                op={op}
                groupMeans={groupAverages[op.group]}
                canExclude={canExclude}
                onExcluded={onExcluded}
                cpAvailable={!!data?.cp_available}
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
            {(categoryFilter || languageFilter) && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Suggerimento: prova a rimuovere uno dei filtri.{" "}
                <Link href="/admin/group-categories" style={{ color: COLORS.champagne }}>Vai a Categorie Group →</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
