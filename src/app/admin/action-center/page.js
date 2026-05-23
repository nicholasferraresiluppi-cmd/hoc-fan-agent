"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  Target, Info, Download, X, CheckCircle2, Clock, AlertTriangle,
  ArrowRightLeft, Trash2, FileText, Sparkles, ChevronDown,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, SectionLabel, CpCard, StatCard } from "@/components/cp-style";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";

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
function fmtCurrencyShort(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return "$ " + (n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "k";
  return "$ " + n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

const TIER_COLORS = {
  Critical: "#EF4444", Weak: "#F59E0B", Average: "#9CA3AF",
  Good: "#10B981", Strong: "#3B82F6", Elite: "#A855F7",
};

export default function ActionCenterPage() {
  const [periodId, setPeriodId] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [languageFilter, setLanguageFilter] = useState(""); // "", "ita", "eng", "none"
  const [tierFilter, setTierFilter] = useState(""); // "", "Critical", "Weak", "Average"
  const [groupFilter, setGroupFilter] = useState(""); // "" o nome group
  const periodOptions = useMemo(() => monthOpts(), []);
  useEffect(() => { if (!periodId && periodOptions[0]) setPeriodId(periodOptions[0].value); }, [periodOptions, periodId]);

  const url = periodId ? `/api/admin/action-center?period_id=${periodId}` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const allCandidates = data?.candidates || [];
  const swapTargets = data?.swap_targets || [];
  const readyForHr = data?.ready_for_hr || [];
  const filterCounts = data?.filter_counts || { languages: {}, tiers: {}, groups: [] };

  // Filtri client-side
  const candidates = useMemo(() => {
    return allCandidates.filter((c) => {
      if (languageFilter === "ita" && c.language !== "ita") return false;
      if (languageFilter === "eng" && c.language !== "eng") return false;
      if (languageFilter === "none" && c.language) return false;
      if (tierFilter && c.tier !== tierFilter) return false;
      if (groupFilter && c.group !== groupFilter) return false;
      return true;
    });
  }, [allCandidates, languageFilter, tierFilter, groupFilter]);

  async function callAction(employee, action, swap_with = undefined, note = undefined) {
    if (!periodId) return;
    try {
      const res = await fetch("/api/admin/action-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee, action, swap_with, note }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore"); return; }
      mutate(url);
    } catch (e) { alert(e.message); }
  }
  async function unmark(employee) {
    if (!periodId) return;
    if (!confirm(`Rimuovere "${employee}" dal pannello (resterà nella leaderboard)?`)) return;
    try {
      const res = await fetch(`/api/admin/action-center?period_id=${periodId}&employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore"); return; }
      mutate(url);
    } catch (e) { alert(e.message); }
  }
  async function ignorePermanent(employee) {
    if (!confirm(`Ignorare "${employee}" permanentemente dal pannello "da cambiare"?\n\nResterà nella leaderboard ma non comparirà più qui anche nei mesi futuri. Puoi ripristinarlo da admin/leaderboard-exclusions.`)) return;
    try {
      const res = await fetch("/api/admin/underperformers-ignored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee, note: "Ignorato da Action Center" }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore"); return; }
      mutate(url);
    } catch (e) { alert(e.message); }
  }

  function exportCsv() {
    if (readyForHr.length === 0) { alert("Nessun operatore pronto per HR."); return; }
    const rows = [
      ["Employee", "Group", "Score", "Tier", "CP Sales", "CP Shifts", "Top Creator", "Swap with", "Marked at", "Note"],
      ...readyForHr.map((e) => {
        const cand = candidates.find((c) => c.employee === e.employee);
        return [
          e.employee, cand?.group || "", cand?.score ?? "", cand?.tier ?? "",
          cand?.cp_total_sales ?? "", cand?.cp_total_shifts ?? "",
          cand?.top_creator ?? "", e.swap_with || "",
          new Date(e.marked_at).toISOString().slice(0, 10), e.note || "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HR_list_${periodId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1500, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}

      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Action Center</span>
          </div>
        }
        section="People · HR"
        title="🎯 Action Center"
        subtitle="Operatori sotto soglia da rivedere questo mese. Decidi cosa fare di ognuno: ignora, sostituisci con un altro operatore, oppure marca come pronto per HR. Esporta la lista finale in CSV per il processo HR."
        toolbar={
          <>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={selectStyle}>
              {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
            <button onClick={() => setTutorialOpen(true)} style={infoBtn}><Info size={14} /> Come funziona</button>
          </>
        }
      />

      {isLoading && !data && <p style={{ color: CP.textSecondary }}>Caricamento…</p>}
      {error && <p style={{ color: CP.accentRed }}>Errore: {String(error)}</p>}
      {data?.error && (
        <div style={{ background: CP.accentRed + "20", color: CP.accentRed, padding: 16, borderRadius: 12 }}>
          {data.error}
          {" "}<Link href="/admin/creatorspro-sync" style={{ color: CP.accentGreen }}>Sync CP →</Link>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
            <StatCard
              label="Candidati da rivedere"
              value={candidates.length}
              sub="Score ≤25 (Average e sotto) · ≥5 shift"
              color={candidates.length > 0 ? CP.accentRed : CP.textPrimary}
            />
            <StatCard
              label="Pronti per HR"
              value={readyForHr.length}
              sub={`${candidates.filter((c) => c.swap_entry?.status === "marked").length} pending`}
              color={CP.accentGreen}
            />
            <StatCard
              label="Sostituti disponibili"
              value={swapTargets.length}
              sub="Operatori Good+ (score ≥50)"
            />
            <StatCard
              label="Ignorati permanenti"
              value={data.ignored_count}
              sub="Esclusi dal pannello"
            />
          </div>

          {/* HR Export bar */}
          {readyForHr.length > 0 && (
            <CpCard accent={CP.accentGreen} padding="18px 22px" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FileText size={20} color={CP.accentGreen} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Lista per HR pronta — {readyForHr.length} operatori</div>
                    <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>
                      Esporta in CSV per consegnarla a HR per il processo di sostituzione.
                    </div>
                  </div>
                </div>
                <button onClick={exportCsv} style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 18px",
                  background: CP.accentGreen, color: "#0a0a0a", border: "none",
                  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                  <Download size={14} /> Esporta CSV HR
                </button>
              </div>
            </CpCard>
          )}

          {/* FILTRI */}
          <CpCard padding="14px 18px" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              {/* Lingua */}
              <FilterGroup label="Lingua">
                <FilterPill active={languageFilter === ""}      onClick={() => setLanguageFilter("")}      color="#9CA3AF">Tutte ({allCandidates.length})</FilterPill>
                <FilterPill active={languageFilter === "ita"}   onClick={() => setLanguageFilter("ita")}   color="#10B981">🇮🇹 ITA ({filterCounts.languages?.ita || 0})</FilterPill>
                <FilterPill active={languageFilter === "eng"}   onClick={() => setLanguageFilter("eng")}   color="#3B82F6">🇬🇧 ENG ({filterCounts.languages?.eng || 0})</FilterPill>
                {(filterCounts.languages?.none || 0) > 0 && (
                  <FilterPill active={languageFilter === "none"} onClick={() => setLanguageFilter("none")} color="#9CA3AF">Senza ({filterCounts.languages.none})</FilterPill>
                )}
              </FilterGroup>

              {/* Tier */}
              <FilterGroup label="Tier">
                <FilterPill active={tierFilter === ""}          onClick={() => setTierFilter("")}          color="#9CA3AF">Tutti</FilterPill>
                {(filterCounts.tiers?.Critical || 0) > 0 && (
                  <FilterPill active={tierFilter === "Critical"} onClick={() => setTierFilter("Critical")} color="#EF4444">Critical ({filterCounts.tiers.Critical})</FilterPill>
                )}
                {(filterCounts.tiers?.Weak || 0) > 0 && (
                  <FilterPill active={tierFilter === "Weak"}    onClick={() => setTierFilter("Weak")}    color="#F59E0B">Weak ({filterCounts.tiers.Weak})</FilterPill>
                )}
                {(filterCounts.tiers?.Average || 0) > 0 && (
                  <FilterPill active={tierFilter === "Average"} onClick={() => setTierFilter("Average")} color="#9CA3AF">Average ({filterCounts.tiers.Average})</FilterPill>
                )}
              </FilterGroup>

              {/* Group */}
              {(filterCounts.groups || []).length > 0 && (
                <FilterGroup label="Group">
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      background: CP.surface,
                      border: `1px solid ${groupFilter ? CP.accentGreen + "55" : CP.border}`,
                      borderRadius: 6,
                      color: CP.textPrimary,
                      fontSize: 11,
                      fontFamily: FONTS.body,
                      cursor: "pointer",
                      minWidth: 180,
                      maxWidth: 240,
                    }}
                  >
                    <option value="" style={{ background: CP.surface }}>Tutti i Group</option>
                    {filterCounts.groups.map((g) => (
                      <option key={g} value={g} style={{ background: CP.surface }}>{g}</option>
                    ))}
                  </select>
                </FilterGroup>
              )}

              {(languageFilter || tierFilter || groupFilter) && (
                <button
                  onClick={() => { setLanguageFilter(""); setTierFilter(""); setGroupFilter(""); }}
                  style={{
                    padding: "5px 12px",
                    background: "transparent",
                    border: `1px solid ${CP.border}`,
                    borderRadius: 6,
                    color: CP.textSecondary,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                  }}
                >
                  ✕ Reset filtri
                </button>
              )}
            </div>
          </CpCard>

          {/* CANDIDATES LIST */}
          <SectionLabel style={{ display: "block", marginBottom: 12 }}>
            Candidati da rivedere ({candidates.length}{candidates.length !== allCandidates.length ? ` su ${allCandidates.length}` : ""})
          </SectionLabel>

          {candidates.length === 0 && (
            <CpCard padding="28px" style={{ textAlign: "center", color: CP.textSecondary }}>
              ✨ Nessun operatore sotto soglia questo mese. Il team gira bene!
            </CpCard>
          )}

          {candidates.length > 0 && (
            <CpCard padding="0">
              {/* Header */}
              <div style={{ ...headerRow, display: "grid", gridTemplateColumns: "auto 1.4fr 0.8fr 0.6fr 0.8fr 1fr 1.4fr 1fr" }}>
                <span style={th}>#</span>
                <span style={th}>Operatore</span>
                <span style={th}>Group</span>
                <span style={th} title="Score CP v3">Score</span>
                <span style={th}>Tier</span>
                <span style={th}>Sales / Shifts</span>
                <span style={th}>Sostituisci con</span>
                <span style={th}>Azioni</span>
              </div>

              {candidates.map((c) => {
                const tColor = TIER_COLORS[c.tier] || CP.textMuted;
                const status = c.swap_entry?.status;
                const isReady = status === "ready_for_hr";
                return (
                  <div key={c.employee} style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1.4fr 0.8fr 0.6fr 0.8fr 1fr 1.4fr 1fr",
                    alignItems: "center",
                    padding: "14px 22px",
                    borderTop: `1px solid ${CP.border}`,
                    background: isReady ? CP.accentGreen + "08" : "transparent",
                    fontSize: 13,
                  }}>
                    <span style={{ fontFamily: FONTS.mono, color: CP.textMuted, fontSize: 12 }}>{c.rank ? String(c.rank).padStart(2, "0") : "—"}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.employee}</div>
                      {c.top_creator && (
                        <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>
                          Top: {c.top_creator} ({fmtCurrencyShort(c.top_creator_sales)})
                        </div>
                      )}
                    </div>
                    <span style={{ color: CP.textSecondary, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.group || "—"}</span>
                    <span style={{ fontFamily: FONTS.mono, color: tColor, fontWeight: 700, fontSize: 15 }}>{c.score.toFixed(1)}</span>
                    <span>
                      <span style={{ padding: "3px 9px", background: tColor + "22", color: tColor, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>
                        {c.tier?.toUpperCase()}
                      </span>
                    </span>
                    <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary, fontSize: 12 }}>
                      {fmtCurrencyShort(c.cp_total_sales)}<br/>
                      <span style={{ fontSize: 10, color: CP.textMuted }}>{c.cp_total_shifts} shift</span>
                    </span>

                    {/* Swap: suggeriti + dropdown completo */}
                    <SwapPicker
                      candidate={c}
                      swapTargets={swapTargets}
                      onChange={(v) => callAction(c.employee, "set_swap", v || null)}
                    />

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {!isReady ? (
                        <button
                          onClick={() => callAction(c.employee, "set_ready")}
                          disabled={!c.swap_entry?.swap_with}
                          title={c.swap_entry?.swap_with ? "Pronto per HR" : "Scegli prima un sostituto"}
                          style={{ ...miniBtn, background: c.swap_entry?.swap_with ? CP.accentGreen : CP.surfaceAlt, color: c.swap_entry?.swap_with ? "#0a0a0a" : CP.textMuted, cursor: c.swap_entry?.swap_with ? "pointer" : "not-allowed" }}
                        >
                          <CheckCircle2 size={11} /> HR
                        </button>
                      ) : (
                        <button
                          onClick={() => callAction(c.employee, "set_pending")}
                          title="Rimetti in pending"
                          style={{ ...miniBtn, background: CP.surfaceAlt, color: CP.textPrimary }}
                        >
                          <Clock size={11} /> Pend
                        </button>
                      )}
                      <button onClick={() => unmark(c.employee)} title="Rimuovi dal pannello (resta in leaderboard)" style={miniBtn}>
                        <X size={11} />
                      </button>
                      <button onClick={() => ignorePermanent(c.employee)} title="Ignora permanentemente (anche mesi futuri)" style={{ ...miniBtn, color: CP.accentRed, borderColor: CP.accentRed + "55" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </CpCard>
          )}

          {/* Legenda */}
          <CpCard padding="14px 20px" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: CP.textMuted, alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: CP.textSecondary }}>Azioni:</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={12} color={CP.accentGreen} /> <b style={{ color: CP.textPrimary }}>HR</b> = pronto per la lista HR (richiede swap impostato)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Clock size={12} color={CP.textPrimary} /> <b style={{ color: CP.textPrimary }}>Pend</b> = rimetti in pending
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <X size={12} /> <b style={{ color: CP.textPrimary }}>Rimuovi</b> = solo dal pannello, ricompare mese prossimo
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Trash2 size={12} color={CP.accentRed} /> <b style={{ color: CP.textPrimary }}>Ignora</b> = esclude permanentemente (anche mesi futuri)
              </span>
            </div>
          </CpCard>

          {/* Filtri attuali info */}
          <p style={{ fontSize: 11, color: CP.textMuted, marginTop: 16, fontStyle: "italic" }}>
            ⚠ Criteri di inclusione: score CP v3 ≤ 25 (Average e sotto) · almeno 5 shift CP nel periodo. Operatori ignorati permanenti ({data.ignored_count}) esclusi a monte.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * SwapPicker — UI per scegliere un sostituto.
 * Mostra i top 3 suggeriti smart in cards in cima + dropdown completo sotto.
 *
 * Le "card suggerite" sono cliccabili e fanno set immediato. La dropdown
 * resta come fallback "altri operatori".
 */
function SwapPicker({ candidate, swapTargets, onChange }) {
  const current = candidate.swap_entry?.swap_with || "";
  const top3 = (candidate.suggested_swaps || []).slice(0, 3);
  const suggestedNames = new Set(top3.map((s) => s.employee));
  const others = swapTargets.filter((t) => !suggestedNames.has(t.employee));

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Suggeriti smart */}
      {top3.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {top3.map((s, i) => {
            const isSelected = current === s.employee;
            const breakdownTxt = s.breakdown
              .map((b) => `${b.creator}: score ${b.score} (peso ${b.weight_pct}%)`)
              .join("\n");
            return (
              <button
                key={s.employee}
                onClick={() => onChange(isSelected ? "" : s.employee)}
                title={`Fit ${s.fit_score} su ${s.coverage_pct}% delle creator di ${candidate.employee}\n\nBreakdown:\n${breakdownTxt}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 8px",
                  background: isSelected ? CP.accentGreen : (i === 0 ? CP.accentGreen + "22" : CP.surfaceAlt),
                  border: `1px solid ${isSelected ? CP.accentGreen : (i === 0 ? CP.accentGreen + "55" : CP.border)}`,
                  borderRadius: 6,
                  color: isSelected ? "#0a0a0a" : CP.textPrimary,
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: isSelected ? 700 : 500,
                  fontFamily: FONTS.body,
                  maxWidth: "100%",
                }}
              >
                {i === 0 && !isSelected && <Sparkles size={10} color={CP.accentGreen} />}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
                  {s.employee.split(" ")[0]} {s.employee.split(" ").slice(-1)[0]?.[0] || ""}.
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, opacity: 0.85 }}>{s.fit_score}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Dropdown completo (fallback) */}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "5px 8px",
          background: CP.surface,
          border: `1px solid ${current ? CP.accentGreen + "66" : CP.border}`,
          borderRadius: 6,
          color: CP.textPrimary,
          fontSize: 11,
          fontFamily: FONTS.body,
          width: "100%",
        }}
      >
        <option value="" style={{ background: CP.surface }}>
          {top3.length > 0 ? "— o scegli altro —" : "— scegli sostituto —"}
        </option>
        {top3.length > 0 && (
          <optgroup label="🎯 Suggeriti">
            {top3.map((s) => (
              <option key={s.employee} value={s.employee} style={{ background: CP.surface }}>
                {s.employee} · fit {s.fit_score} · cov {s.coverage_pct}%
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={`Altri ${others.length}`}>
          {others.map((t) => (
            <option key={t.employee} value={t.employee} style={{ background: CP.surface }}>
              {t.employee} ({t.tier}, {t.total_shifts} shift)
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONTS.mono, fontWeight: 700, marginRight: 4 }}>{label}:</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function FilterPill({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 11px",
        background: active ? color : "transparent",
        border: `1px solid ${active ? color : CP.border}`,
        borderRadius: 999,
        color: active ? "#0a0a0a" : CP.textSecondary,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: FONTS.body,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

const headerRow = { padding: "12px 22px", borderBottom: `1px solid ${CP.borderStrong}`, alignItems: "center" };
const th = { color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
const miniBtn = {
  display: "inline-flex", alignItems: "center", gap: 3,
  padding: "5px 8px",
  background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 6,
  color: CP.textPrimary, fontSize: 11, fontFamily: FONTS.body, cursor: "pointer",
};
const selectStyle = {
  padding: "8px 12px",
  background: CP.surface,
  border: `1px solid ${CP.border}`,
  borderRadius: 8,
  color: CP.textPrimary,
  fontSize: 12,
  fontFamily: FONTS.body,
  minWidth: 160,
  cursor: "pointer",
};
const infoBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px",
  background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.accentGreen, fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: FONTS.body,
};
