"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  GraduationCap, Info, CheckCircle2, X, BookOpen, ArrowRight,
  Trash2, FileText, Sparkles, ChevronDown, AlertTriangle,
} from "lucide-react";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader, SectionLabel, StatCard } from "@/components/cp-style";
import { useSmartPeriod } from "@/lib/use-smart-period";

const fetcher = (url) => fetch(url).then((r) => r.json());

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

const TIER_COLORS = {
  Critical: "#EF4444", Weak: "#F59E0B", Average: "#9CA3AF",
  Good: "#10B981", Strong: "#3B82F6", Elite: "#A855F7",
};

const PATTERN_COLORS = {
  low_conversion: "#F59E0B",
  uniform_low: "#9CA3AF",
  polarized_creators: "#A855F7",
  low_volume_specialist: "#3B82F6",
  general: "#6B7280",
};
const PATTERN_LABELS = {
  low_conversion: "Gap conversione",
  uniform_low: "Uniformemente basso",
  polarized_creators: "Polarizzato tra creator",
  low_volume_specialist: "Volume basso, specialista",
  general: "Generico",
};

export default function CoachingCenterPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [languageFilter, setLanguageFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [patternFilter, setPatternFilter] = useState("");
  const [hideAssigned, setHideAssigned] = useState(true);

  const periodOptions = useMemo(() => monthOpts(), []);

  const url = periodId ? `/api/admin/coaching-center?period_id=${periodId}` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const candidates = data?.candidates || [];
  const assignments = data?.assignments || {};
  const counts = data?.counts || {};

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (hideAssigned && c.assignment?.status && c.assignment.status !== "suggested") return false;
      if (languageFilter && (c.language || "unknown") !== languageFilter) return false;
      if (tierFilter && c.tier !== tierFilter) return false;
      if (groupFilter && c.group !== groupFilter) return false;
      if (patternFilter && c.pattern !== patternFilter) return false;
      return true;
    });
  }, [candidates, languageFilter, tierFilter, groupFilter, patternFilter, hideAssigned]);

  const allGroups = useMemo(() => {
    const set = new Set();
    candidates.forEach((c) => c.group && set.add(c.group));
    return Array.from(set).sort();
  }, [candidates]);

  async function postAction(employee, action, extra = {}) {
    const res = await fetch("/api/admin/coaching-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_id: periodId, employee, action, ...extra }),
    });
    if (res.ok) mutate(url);
    else alert("Errore: " + (await res.text()));
  }

  async function deleteAssignment(employee) {
    if (!confirm(`Rimuovere ${employee} dalle assegnazioni?`)) return;
    const res = await fetch(`/api/admin/coaching-center?period_id=${periodId}&employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
    if (res.ok) mutate(url);
    else alert("Errore: " + (await res.text()));
  }

  const assignedCount = Object.values(assignments).filter((a) => a.status === "assigned").length;
  const completedCount = Object.values(assignments).filter((a) => a.status === "completed").length;

  return (
    <div style={{ padding: "32px 28px 80px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Coaching Center</span>
          </div>
        }
        section="People · Coaching"
        title="Coaching Center"
        subtitle={<>
          Operatori <b>Weak/Average</b> con margini di crescita. Per ciascuno: punto debole identificato,
          pattern detection, training scenario suggerito dall'Academy. Parallelo all'Action Center
          (che invece gestisce le sostituzioni Critical).
        </>}
        toolbar={
          <Link
            href="/admin/action-center"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px",
              background: `${CP.accentRed}1a`,
              border: `1px solid ${CP.accentRed}66`,
              borderRadius: 8,
              color: CP.accentRed,
              fontSize: 12, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <AlertTriangle size={13} /> Action Center →
          </Link>
        }
      />

      {/* SUMMARY */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Candidati coaching" value={candidates.length} sub={`Score 25-50, ${periodId}`} />
        <StatCard label="Già assegnati" value={assignedCount} color={CP.accentRed} />
        <StatCard label="Completati questo mese" value={completedCount} color={CP.accentGreen} />
        <StatCard label="In lista da rivedere" value={filtered.length} sub={hideAssigned ? "nascondi assegnati: ON" : "tutti visibili"} />
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={selectStyle}>
          {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: COLORS.charcoal }}>{p.label}</option>)}
        </select>
        <input list="coach-groups" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} placeholder="Tutti i Group" style={{ ...selectStyle, minWidth: 200 }} />
        <datalist id="coach-groups">{allGroups.map((g) => <option key={g} value={g} />)}</datalist>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.fog, cursor: "pointer", padding: "8px 12px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 999 }}>
          <input type="checkbox" checked={hideAssigned} onChange={(e) => setHideAssigned(e.target.checked)} style={{ accentColor: COLORS.champagne }} />
          Nascondi già assegnati
        </label>
      </div>

      {/* PATTERN PILLS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={filterLabel}>Pattern:</span>
        <button onClick={() => setPatternFilter("")} style={pillStyle(!patternFilter, COLORS.champagne)}>Tutti</button>
        {Object.entries(PATTERN_LABELS).map(([id, label]) => (
          <button key={id} onClick={() => setPatternFilter(id)} style={pillStyle(patternFilter === id, PATTERN_COLORS[id])}>
            {label} {counts.pattern?.[id] != null && <span style={{ opacity: 0.7, marginLeft: 4 }}>({counts.pattern[id]})</span>}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={filterLabel}>Lingua:</span>
        {[["", "Tutte"], ["ita", "🇮🇹 ITA"], ["eng", "🇬🇧 ENG"], ["unknown", "—"]].map(([v, l]) => (
          <button key={v || "all"} onClick={() => setLanguageFilter(v)} style={pillStyle(languageFilter === v, COLORS.champagne)}>
            {l} {counts.lang?.[v || "unknown"] != null && v && <span style={{ opacity: 0.7, marginLeft: 4 }}>({counts.lang[v] || 0})</span>}
          </button>
        ))}
        <span style={{ ...filterLabel, marginLeft: 18 }}>Tier:</span>
        {[["", "Tutti"], ["Weak", "Weak"], ["Average", "Average"]].map(([v, l]) => (
          <button key={v || "all"} onClick={() => setTierFilter(v)} style={pillStyle(tierFilter === v, TIER_COLORS[v] || COLORS.champagne)}>
            {l} {counts.tier?.[v] != null && v && <span style={{ opacity: 0.7, marginLeft: 4 }}>({counts.tier[v] || 0})</span>}
          </button>
        ))}
      </div>

      {/* STATES */}
      {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento candidati…</p>}
      {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
      {data?.error && (
        <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>
          {data.error}
        </div>
      )}

      {/* CANDIDATES LIST */}
      {data && !data.error && (
        <>
          {filtered.length === 0 ? (
            <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "44px 22px", textAlign: "center", color: COLORS.mist }}>
              <Sparkles size={32} color={COLORS.champagne} style={{ marginBottom: 10, opacity: 0.6 }} /><br/>
              Nessun candidato coaching con i filtri attuali. Prova a togliere il filtro "nascondi assegnati" o cambia mese.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map((c) => (
                <CandidateRow
                  key={c.employee}
                  c={c}
                  onAssign={(trainingId, owner, deadline, note) => postAction(c.employee, "assign", { training_category_id: trainingId, owner, deadline, note })}
                  onComplete={(note) => postAction(c.employee, "complete", { note })}
                  onReject={(note) => postAction(c.employee, "reject", { note })}
                  onDelete={() => deleteAssignment(c.employee)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CandidateRow({ c, onAssign, onComplete, onReject, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [owner, setOwner] = useState(c.assignment?.owner || "");
  const [deadline, setDeadline] = useState(c.assignment?.deadline || "");
  const [note, setNote] = useState(c.assignment?.note || "");
  const tierColor = TIER_COLORS[c.tier] || COLORS.mist;
  const patternColor = PATTERN_COLORS[c.pattern] || COLORS.mist;
  const isAssigned = c.assignment?.status === "assigned";
  const isCompleted = c.assignment?.status === "completed";
  const isRejected = c.assignment?.status === "rejected";

  return (
    <div style={{
      background: COLORS.graphite,
      border: `1px solid ${isAssigned ? CP.accentRed + "55" : isCompleted ? CP.accentGreen + "55" : COLORS.charcoal}`,
      borderRadius: 14,
      padding: "16px 20px",
      opacity: isRejected ? 0.5 : 1,
    }}>
      {/* HEADER ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1.6fr 1fr 0.8fr auto", gap: 16, alignItems: "center" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: CP.accentSoft,
          color: CP.accentSoftText,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.display, fontWeight: 700, fontSize: 14,
        }}>{getInitials(c.employee)}</div>

        <div style={{ minWidth: 0 }}>
          <Link href={`/leaderboard/operational/${encodeURIComponent(c.employee)}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500 }}>
              {c.employee} <span style={{ color: COLORS.champagne, fontSize: 11, opacity: 0.6 }}>›</span>
            </div>
          </Link>
          <div style={{ fontSize: 11, color: COLORS.fog, marginTop: 2 }}>
            {c.group}{c.language && <span style={{ marginLeft: 6, color: COLORS.mist }}>· {c.language === "ita" ? "🇮🇹" : c.language === "eng" ? "🇬🇧" : "—"}</span>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em", marginBottom: 4 }}>
            Pattern
          </div>
          <span style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 999,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            background: patternColor + "20", color: patternColor, border: `1px solid ${patternColor}55`,
          }}>{PATTERN_LABELS[c.pattern] || c.pattern}</span>
        </div>

        <div>
          <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em" }}>Score CP</div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 22, fontWeight: 700, color: tierColor }}>{c.score.toFixed(1)}</div>
          <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, background: tierColor + "26", color: tierColor, border: `1px solid ${tierColor}55`, marginTop: 2 }}>
            {c.tier}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {isAssigned && <span style={{ padding: "4px 10px", background: CP.accentRed + "22", color: CP.accentRed, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>ASSEGNATO</span>}
          {isCompleted && <span style={{ padding: "4px 10px", background: CP.accentGreen + "22", color: CP.accentGreen, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>COMPLETATO</span>}
          {isRejected && <span style={{ padding: "4px 10px", background: COLORS.charcoal, color: COLORS.mist, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>RIFIUTATO</span>}
          <button onClick={() => setExpanded((v) => !v)} style={chevronBtn}>
            <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </div>
      </div>

      {/* EXPANDED BODY */}
      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.charcoal}` }}>
          {/* Diagnosi */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <DiagBlock label="Punto debole" value={c.weakest_creator || "—"} sub={c.weakest_creator_score != null ? `score loc. ${c.weakest_creator_score}` : null} color={CP.accentRed} />
            <DiagBlock label="Punto di forza" value={c.strongest_creator || "—"} sub={c.strongest_creator_score != null ? `score loc. ${c.strongest_creator_score}` : null} color={CP.accentGreen} />
            <DiagBlock label="Sales mese" value={fmtCurrency(c.total_sales)} sub={`${c.total_creators} creator, ${c.reliable_creators_count} affidabili`} color={CP.accentGreen} />
          </div>

          {/* Training scenario suggerito */}
          <div style={{ padding: 14, background: COLORS.obsidian + "80", border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <BookOpen size={16} color={COLORS.champagne} />
              <span style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.12em", fontWeight: 600 }}>Training suggerito</span>
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.alabaster, marginBottom: 4 }}>
              {c.training.categoryName}
            </div>
            <div style={{ fontSize: 12, color: COLORS.fog, lineHeight: 1.55 }}>
              {c.training.rationale}
            </div>
            <Link href={`/academy?category=${c.training.categoryId}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, color: COLORS.champagne, fontSize: 12, textDecoration: "none", fontWeight: 600 }}>
              Apri categoria in Academy <ArrowRight size={12} />
            </Link>
          </div>

          {/* Form assegnazione */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 12 }}>
            <input type="text" placeholder="Owner (es. Team Lead)" value={owner} onChange={(e) => setOwner(e.target.value)} style={inputStyle} />
            <input type="date" placeholder="Deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputStyle} />
            <input type="text" placeholder="Nota (opzionale)" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          </div>

          {/* Azioni */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!isAssigned && !isCompleted && (
              <button onClick={() => onAssign(c.training.categoryId, owner, deadline, note)} style={actionBtn(CP.accentRed)}>
                <GraduationCap size={14} /> Assegna training
              </button>
            )}
            {isAssigned && (
              <>
                <button onClick={() => onComplete(note)} style={actionBtn(CP.accentGreen)}>
                  <CheckCircle2 size={14} /> Marca completato
                </button>
                <button onClick={() => onReject(note)} style={actionBtn(CP.textMuted)}>
                  <X size={14} /> Rifiuta
                </button>
              </>
            )}
            <Link href={`/leaderboard/operational/${encodeURIComponent(c.employee)}`} style={{ ...actionBtn(CP.accentSoftText), textDecoration: "none" }}>
              <FileText size={14} /> Apri drill-down
            </Link>
            {c.assignment && (
              <button onClick={onDelete} style={{ ...actionBtn(COLORS.mist), marginLeft: "auto" }}>
                <Trash2 size={14} /> Rimuovi
              </button>
            )}
          </div>

          {/* Metadata se assegnato */}
          {c.assignment && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: COLORS.obsidian, borderRadius: 8, fontSize: 11, color: COLORS.mist }}>
              {c.assignment.status === "assigned" && <>Assegnato il <strong>{new Date(c.assignment.assigned_at).toLocaleDateString("it-IT")}</strong></>}
              {c.assignment.status === "completed" && <>Completato il <strong>{new Date(c.assignment.completed_at).toLocaleDateString("it-IT")}</strong></>}
              {c.assignment.owner && <> · owner <strong>{c.assignment.owner}</strong></>}
              {c.assignment.deadline && <> · deadline <strong>{c.assignment.deadline}</strong></>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagBlock({ label, value, sub, color }) {
  return (
    <div style={{ padding: 12, background: COLORS.obsidian + "60", border: `1px solid ${COLORS.charcoal}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || COLORS.alabaster, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.mist }}>{sub}</div>}
    </div>
  );
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const selectStyle = { padding: "9px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", outline: "none" };
const inputStyle = { padding: "9px 12px", background: COLORS.obsidian, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const filterLabel = { fontSize: 11, color: COLORS.fog, letterSpacing: "0.1em", marginRight: 4, alignSelf: "center" };
const chevronBtn = { background: "transparent", border: "none", color: COLORS.fog, cursor: "pointer", padding: 6, display: "inline-flex", alignItems: "center" };
const pillStyle = (active, color) => ({ padding: "7px 12px", background: active ? color : COLORS.graphite, border: `1px solid ${active ? color : COLORS.charcoal}`, borderRadius: 999, color: active ? COLORS.obsidian : COLORS.alabaster, fontSize: 12, cursor: "pointer", fontWeight: active ? 700 : 500, fontFamily: FONTS.body });
const actionBtn = (color) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: color + "18", border: `1px solid ${color}55`, borderRadius: 8, color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body });
