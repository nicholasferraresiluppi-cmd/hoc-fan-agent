"use client";

// Action Center (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Da qui partono decisioni sulle PERSONE: chiarezza prima di tutto.
// Numero principale (da rivedere) col confronto → filtri per fase del lavoro
// (da decidere / sostituto scelto / pronti per HR) e fascia → tabella con lo
// score del MESE PRIMA accanto (un mese storto ≠ problema che si ripete) →
// azioni con parole, non icone. API e azioni invariate.
import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { Info, Download } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Notice, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
function monthOpts(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` };
  });
}
const prevOf = (pid) => { if (!pid) return null; const [y, m] = pid.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const sc = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const tierColor = (t) => (t === "Critical" || t === "Weak" ? CP.accentRed : CP.textSecondary);
const THRESHOLDS = [25, 35, 50];

export default function ActionCenterPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [stage, setStage] = useState("all");
  const [tier, setTier] = useState("");
  const [threshold, setThreshold] = useState(25);
  const [q, setQ] = useState("");
  const periodOptions = useMemo(() => monthOpts(), []);
  const prevId = prevOf(periodId);

  const url = periodId ? `/api/admin/action-center?period_id=${periodId}` : null;
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prevRank } = useSWR(prevId ? `/api/leaderboard/sales-cp?period_id=${prevId}&include_no_cp=0` : null, fetcher, { revalidateOnFocus: false });
  const { data: prevAc } = useSWR(prevId ? `/api/admin/action-center?period_id=${prevId}` : null, fetcher, { revalidateOnFocus: false });

  const ok = data && !data.error;
  const all = ok ? data.candidates || [] : [];
  const swapTargets = data?.swap_targets || [];
  const readyForHr = data?.ready_for_hr || [];
  const prevScore = useMemo(() => new Map((prevRank?.ranking || []).filter((r) => r.score > 0).map((r) => [r.employee, r.score])), [prevRank]);

  const stageOf = (c) => c.swap_entry?.status === "ready_for_hr" ? "ready" : c.swap_entry?.swap_with ? "swap" : "todo";
  const inThreshold = all.filter((c) => c.score <= threshold);
  const needle = q.trim().toLowerCase();
  const rows = inThreshold.filter((c) => (!needle || `${c.employee} ${c.top_creator || ""}`.toLowerCase().includes(needle))
    && (stage === "all" || stageOf(c) === stage) && (!tier || c.tier === tier));
  const n = (st) => inThreshold.filter((c) => stageOf(c) === st).length;
  const repeat = inThreshold.filter((c) => (prevScore.get(c.employee) ?? 99) <= threshold).length;
  const tiers = ["Critical", "Weak", "Average"].filter((t) => inThreshold.some((c) => c.tier === t));
  const prevCount = prevAc && !prevAc.error ? (prevAc.candidates || []).filter((c) => c.score <= threshold).length : null;
  const prevName = prevId ? MONTHS_IT[Number(prevId.slice(5)) - 1] : "";

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
    if (!confirm(`Togliere "${employee}" dal pannello di questo mese? Resta in classifica e ricompare il mese prossimo se è ancora sotto soglia.`)) return;
    try {
      const res = await fetch(`/api/admin/action-center?period_id=${periodId}&employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore"); return; }
      mutate(url);
    } catch (e) { alert(e.message); }
  }
  async function ignorePermanent(employee) {
    if (!confirm(`Escludere "${employee}" da questo pannello per sempre?\n\nResta in classifica ma non comparirà più qui, anche nei mesi futuri. Si ripristina da Esclusioni.`)) return;
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
    const rowsCsv = [
      ["Employee", "Group", "Score", "Score mese prima", "Tier", "CP Sales", "CP Shifts", "Top Creator", "Swap with", "Marked at", "Note"],
      ...readyForHr.map((e) => {
        const cand = all.find((c) => c.employee === e.employee);
        return [
          e.employee, cand?.group || "", cand?.score ?? "", prevScore.get(e.employee) ?? "", cand?.tier ?? "",
          cand?.cp_total_sales ?? "", cand?.cp_total_shifts ?? "",
          cand?.top_creator ?? "", e.swap_with || "",
          new Date(e.marked_at).toISOString().slice(0, 10), e.note || "",
        ];
      }),
    ];
    const csv = rowsCsv.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HR_list_${periodId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}
      <PageHead
        crumbs={[{ label: "People" }, { label: "Action Center" }]}
        title="Action Center"
        subtitle="Gli operatori sotto soglia del mese. Per ognuno: scegli un sostituto e segnalo pronto per HR, oppure toglilo se non va cambiato. Alla fine esporti la lista per HR."
        actions={<>
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={ctl}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => setTutorialOpen(true)} style={{ ...ctl, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Info size={14} /> Lo score</button>
        </>}
      />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error} <Link href="/admin/creatorspro-sync" style={{ color: CP.accentSoftText }}>Sync CP →</Link></Notice>}

      {ok && (<>
        <HeroMetric
          label={`Da rivedere · score ≤ ${threshold}, almeno 5 turni`}
          value={fmtInt(inThreshold.length)}
          compare={prevCount != null ? `${prevName}: ${prevCount}` : null}
          hint={`${repeat} ${repeat === 1 ? "era" : "erano"} sotto soglia anche a ${prevName}: un solo mese storto può essere contesto (creator, turni), due di fila no.`}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Metric label="Da decidere" value={fmtInt(n("todo"))} />
            <Metric label="Sostituto scelto" value={fmtInt(n("swap"))} />
            <div>
              <Metric label="Pronti per HR" value={fmtInt(readyForHr.length)} />
              {readyForHr.length > 0 && (
                <button onClick={exportCsv} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
                  <Download size={13} /> Esporta per HR
                </button>
              )}
            </div>
            <Metric label="Sostituti disponibili" value={fmtInt(swapTargets.length)} note="score ≥ 50" />
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <FilterChip label={`Tutti (${inThreshold.length})`} active={stage === "all"} onClick={() => setStage("all")} />
          <FilterChip label={`Da decidere (${n("todo")})`} active={stage === "todo"} disabled={!n("todo")} onClick={() => setStage(stage === "todo" ? "all" : "todo")} />
          <FilterChip label={`Sostituto scelto (${n("swap")})`} active={stage === "swap"} disabled={!n("swap")} onClick={() => setStage(stage === "swap" ? "all" : "swap")} />
          <FilterChip label={`Pronti per HR (${n("ready")})`} active={stage === "ready"} disabled={!n("ready")} onClick={() => setStage(stage === "ready" ? "all" : "ready")} />
          <span style={{ width: 12 }} />
          {tiers.map((t) => (
            <FilterChip key={t} label={`${t} (${inThreshold.filter((c) => c.tier === t).length})`} active={tier === t} onClick={() => setTier(tier === t ? "" : t)} />
          ))}
          <span style={{ flex: 1 }} />
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Soglia score" style={{ ...ctl, fontSize: 13 }}>
            {THRESHOLDS.map((t) => <option key={t} value={t}>{t === 25 ? "Soglia score ≤ 25 (standard)" : `Soglia score ≤ ${t} (più ampia)`}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore" aria-label="Cerca operatore" style={{ ...ctl, width: 200, fontSize: 13 }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          “Pronto per HR” si attiva dopo aver scelto un sostituto. “Togli” vale solo per questo mese; “Escludi sempre” lo toglie anche dai mesi futuri (resta in classifica).
        </div>

        {rows.length === 0 ? (
          <div style={{ ...card, padding: 20, fontSize: 14, color: CP.textSecondary }}>
            {inThreshold.length === 0 ? "Nessun operatore sotto soglia questo mese." : "Nessun operatore in questa vista."}
          </div>
        ) : (
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 980 }}>
              <thead><tr>
                {["Operatore", "Score", "Mese prima", "Venduto", "Turni", "Sostituto (compatibilità)", ""].map((h, k) => (
                  <th key={k} style={{ ...thS, textAlign: k >= 1 && k <= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((c) => {
                  const st = stageOf(c);
                  const ps = prevScore.get(c.employee);
                  const again = ps != null && ps <= threshold;
                  return (
                    <tr key={c.employee} style={{ borderTop: `1px solid ${CP.borderSoft}`, background: st === "ready" ? CP.accentSoft : "transparent" }}>
                      <td style={tdS}>
                        <Link href={`/leaderboard/operational/${encodeURIComponent(c.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{c.employee}</Link>
                        {c.top_creator && <div style={{ fontSize: 12, color: CP.textMuted }}>soprattutto su {c.top_creator}</div>}
                        {c.context && (c.context.vs_peers_pct != null || c.context.difficulty_band) && (
                          <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 2 }}>
                            {c.context.vs_peers_pct != null && <>{c.context.vs_peers_pct > 0 ? "+" : c.context.vs_peers_pct < 0 ? "−" : ""}{Math.abs(c.context.vs_peers_pct)}% per turno rispetto ai colleghi su di lei</>}
                            {c.context.vs_peers_pct != null && c.context.difficulty_band ? " · " : ""}
                            {c.context.difficulty_band && <>pubblico {c.context.difficulty_band}</>}
                          </div>
                        )}
                        {c.context?.difficulty_band === "fredda" && c.context.vs_peers_pct != null && c.context.vs_peers_pct >= -10 && (
                          <div style={{ fontSize: 12, color: CP.accentSoftText, marginTop: 2 }}>Rende come i colleghi su una creator fredda: valutare la creator prima della persona</div>
                        )}
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>
                        <span style={{ color: tierColor(c.tier), fontWeight: 500 }}>{sc(c.score)}</span>
                        <div style={{ fontSize: 12, color: CP.textMuted }}>{c.tier}</div>
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>
                        <span style={{ color: again ? CP.accentRed : CP.textSecondary }}>{ps == null ? "—" : sc(ps)}</span>
                        <div style={{ fontSize: 12, color: CP.textMuted }}>{ps == null ? "non in classifica" : again ? "anche sotto soglia" : "sopra soglia"}</div>
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmt$(c.cp_total_sales)}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{c.cp_total_shifts}</td>
                      <td style={{ ...tdS, width: 300 }}>
                        <SwapPicker candidate={c} swapTargets={swapTargets} onChange={(v) => callAction(c.employee, "set_swap", v || null)} />
                      </td>
                      <td style={{ ...tdS, whiteSpace: "nowrap", textAlign: "right" }}>
                        {st !== "ready" ? (
                          <button onClick={() => callAction(c.employee, "set_ready")} disabled={!c.swap_entry?.swap_with}
                            title={c.swap_entry?.swap_with ? "Aggiungi alla lista per HR" : "Scegli prima un sostituto"}
                            style={{ ...btn, background: c.swap_entry?.swap_with ? CP.accent : CP.surfaceAlt, color: c.swap_entry?.swap_with ? CP.accentInk : CP.textMuted, borderColor: "transparent", cursor: c.swap_entry?.swap_with ? "pointer" : "not-allowed" }}>
                            Pronto per HR
                          </button>
                        ) : (
                          <button onClick={() => callAction(c.employee, "set_pending")} style={btn}>Rimetti in attesa</button>
                        )}
                        <div style={{ marginTop: 6, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                          <button onClick={() => unmark(c.employee)} style={linkBtn}>Togli</button>
                          <button onClick={() => ignorePermanent(c.employee)} style={{ ...linkBtn, color: CP.accentRed }}>Escludi sempre</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
          Sotto il nome: quanto rende per turno rispetto ai colleghi sulla stessa creator (lui escluso) e quanto è “fredda” la creator (profilo dal warehouse, <Link href="/admin/creator-difficulty" style={{ color: CP.accentSoftText }}>Difficoltà creator</Link>). Criteri: score CP ≤ soglia con almeno 5 turni nel mese. {data.ignored_count ? `${data.ignored_count} operatori esclusi per sempre non compaiono. ` : ""}I sostituti suggeriti sono chi rende meglio sulle stesse creator (numero = compatibilità).
        </div>
      </>)}
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
                  background: isSelected ? CP.accent : CP.surfaceAlt,
                  border: `1px solid ${isSelected ? CP.accent : CP.border}`,
                  borderRadius: 6,
                  color: isSelected ? CP.accentInk : CP.textPrimary,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: isSelected ? 500 : 400,
                  fontFamily: FONTS.body,
                  maxWidth: "100%",
                }}
              >
                
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
                  {s.employee.split(" ")[0]} {s.employee.split(" ").slice(-1)[0]?.[0] || ""}.
                </span>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{s.fit_score}</span>
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
          border: `1px solid ${current ? CP.accent : CP.border}`,
          borderRadius: 6,
          color: CP.textPrimary,
          fontSize: 13,
          fontFamily: FONTS.body,
          width: "100%",
        }}
      >
        <option value="" style={{ background: CP.surface }}>
          {top3.length > 0 ? "Altro sostituto…" : "Scegli sostituto…"}
        </option>
        {top3.length > 0 && (
          <optgroup label="Suggeriti">
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


const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const thS = { position: "sticky", top: 0, padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted, background: CP.surface, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
const tdS = { padding: "10px 12px", verticalAlign: "top" };
const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 12, cursor: "pointer", fontFamily: FONTS.body };
