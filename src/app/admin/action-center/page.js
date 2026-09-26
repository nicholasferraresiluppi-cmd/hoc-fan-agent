"use client";

// Action Center (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Da qui partono decisioni sulle PERSONE: chiarezza prima di tutto.
// Numero principale (da rivedere) col confronto → filtri per fase del lavoro
// (da decidere / sostituto scelto / pronti per HR) e fascia → tabella con lo
// score del MESE PRIMA accanto (un mese storto ≠ problema che si ripete) →
// azioni con parole, non icone. API e azioni invariate.
import { useState, useMemo, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { Info, Download, X, User } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { Modal } from "@/components/cp-style";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Notice, card } from "@/components/ds";

import { tierLabel } from "@/lib/tier-label";
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
// persone sotto soglia mai in rosso (26/09): "una conversazione, non un giudizio"
const tierColor = () => CP.textPrimary;
const THRESHOLDS = [25, 35, 50];

export default function ActionCenterPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [stage, setStage] = useState("all");
  const [tier, setTier] = useState("");
  const [threshold, setThreshold] = useState(25);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("decide"); // decide | watch
  const [hrFor, setHrFor] = useState(null);
  const [hrForm, setHrForm] = useState({ colloquio_date: "", motivazione: "", voce_operatore: "" });
  const [hrErr, setHrErr] = useState(null);
  const [sel, setSel] = useState(null);     // riga selezionata (mostra "Vista colloquio")
  const [cvFor, setCvFor] = useState(null); // vista colloquio aperta su UNA persona
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
  const inThresholdAll = all.filter((c) => c.score <= threshold);
  // Tre condizioni per "Da decidere" (26/09, comitato esperti): la soglia è
  // RELATIVA (una parte del gruppo ci finisce sempre), quindi da sola non basta.
  // Serve anche: (2) rendere sotto il 75% dei colleghi sulla stessa creator e
  // (3) una tendenza — sotto soglia anche il mese prima, o in calo di 5+ punti.
  // Chi non le ha tutte è "Da osservare", con il motivo.
  const evaluate = (c) => {
    const ps = prevScore.get(c.employee);
    const vp = c.context?.vs_peers_pct;
    const peers = vp != null && vp <= -25;
    const trend = ps != null && (ps <= threshold || c.score <= ps - 5);
    const missing = [];
    if (vp == null) missing.push("confronto coi colleghi non disponibile");
    else if (!peers) missing.push(vp >= -10 ? "rende come i colleghi sulla stessa creator" : "sotto i colleghi, ma meno del 25%");
    if (ps == null) missing.push("primo mese in classifica");
    else if (!trend) missing.push("primo mese sotto soglia, senza calo");
    return { decide: peers && trend, missing };
  };
  const inThreshold = inThresholdAll.filter((c) => (bucket === "decide") === evaluate(c).decide || c.swap_entry?.status === "ready_for_hr");
  const nDecide = inThresholdAll.filter((c) => evaluate(c).decide).length;
  const nWatch = inThresholdAll.length - nDecide;
  const needle = q.trim().toLowerCase();
  const rows = inThreshold.filter((c) => (!needle || `${c.employee} ${c.top_creator || ""}`.toLowerCase().includes(needle))
    && (stage === "all" || stageOf(c) === stage) && (!tier || c.tier === tier));
  const n = (st) => inThreshold.filter((c) => stageOf(c) === st).length;
  const repeat = inThreshold.filter((c) => (prevScore.get(c.employee) ?? 99) <= threshold).length;
  const tiers = ["Critical", "Weak", "Average"].filter((t) => inThreshold.some((c) => c.tier === t));
  const prevCount = prevAc && !prevAc.error ? (prevAc.candidates || []).filter((c) => c.score <= threshold).length : null;
  const prevName = prevId ? MONTHS_IT[Number(prevId.slice(5)) - 1] : "";
  const minShifts = data?.config?.min_shifts || 5;
  const monthName = periodId ? MONTHS_IT[Number(periodId.slice(5)) - 1] : "";
  // Contesto in una frase leggibile (max 2 righe nella colonna larga): creator,
  // confronto coi colleghi, temperatura del pubblico.
  const contextLine = (c) => {
    const parts = [];
    if (c.top_creator) parts.push(`soprattutto su ${c.top_creator}`);
    const vp = c.context?.vs_peers_pct;
    if (vp != null) parts.push(vp === 0 ? "per turno come i colleghi su di lei" : `per turno ${vp > 0 ? "+" : "−"}${Math.abs(vp)}% rispetto ai colleghi su di lei`);
    if (c.context?.difficulty_band) parts.push(`pubblico ${c.context.difficulty_band}`);
    return parts.join(" · ");
  };
  const cvCand = cvFor ? all.find((c) => c.employee === cvFor) : null;
  const hrCand = hrFor ? all.find((c) => c.employee === hrFor) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const hrVerify = hrCand?.swap_entry?.agreement?.verify_date;

  async function callAction(employee, action, swap_with = undefined, note = undefined, hr = undefined) {
    if (!periodId) return false;
    try {
      const res = await fetch("/api/admin/action-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee, action, swap_with, note, hr }),
      });
      const j = await res.json();
      if (!res.ok) { if (hr) setHrErr(j.error || "Errore"); else alert(j.error || "Errore"); return false; }
      mutate(url);
      return true;
    } catch (e) { alert(e.message); return false; }
  }
  async function saveAgreement(employee, agreement) {
    if (!periodId) return { ok: false, error: "Mese non scelto" };
    try {
      const res = await fetch("/api/admin/action-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee, action: "set_agreement", agreement }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error || `Errore ${res.status}` };
      mutate(url);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function submitHr() {
    setHrErr(null);
    const okk = await callAction(hrFor, "set_ready", undefined, undefined, hrForm);
    if (okk) { setHrFor(null); setHrForm({ colloquio_date: "", motivazione: "", voce_operatore: "" }); }
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
      ["Operatore", "Gruppo", "Score", "Score mese prima", "Fascia", "Venduto CP", "Turni CP", "Creator principale", "Per turno vs colleghi %", "Creator (pubblico)", "Sostituto", "Colloquio del", "Motivazione", "Cosa ha detto l'operatore", "Segnato il", "Nota"],
      ...readyForHr.map((e) => {
        const cand = all.find((c) => c.employee === e.employee);
        return [
          e.employee, cand?.group || "", cand?.score ?? "", prevScore.get(e.employee) ?? "", tierLabel(cand?.tier) ?? "",
          cand?.cp_total_sales ?? "", cand?.cp_total_shifts ?? "",
          cand?.top_creator ?? "", cand?.context?.vs_peers_pct ?? "", cand?.context?.difficulty_band ?? "", e.swap_with || "",
          e.hr?.colloquio_date || "", e.hr?.motivazione || "", e.hr?.voce_operatore || "",
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
          label={`Da decidere · score ≤ ${threshold}, sotto i colleghi e in calo`}
          value={fmtInt(nDecide)}
          compare={prevCount != null ? `${prevName}: ${prevCount}` : null}
          hint={`${repeat} ${repeat === 1 ? "era" : "erano"} sotto soglia anche a ${prevName}: un solo mese storto può essere contesto (creator, turni), due di fila no.`}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Metric label="Da osservare" value={fmtInt(nWatch)} note="sotto soglia, ma non tutte le condizioni" />
            <Metric label="Sostituto scelto" value={fmtInt(n("swap"))} />
            <div>
              <Metric label="Pronti per HR" value={fmtInt(readyForHr.length)} />
              {readyForHr.length > 0 && (
                <button onClick={exportCsv} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
                  <Download size={13} /> Esporta i casi documentati
                </button>
              )}
            </div>
            <Metric label="Sostituti disponibili" value={fmtInt(swapTargets.length)} note="score ≥ 50" />
          </div>
        </HeroMetric>

        <Notice>La soglia è relativa: una parte del gruppo sarà sempre qui, anche se tutti migliorano. Per questo “Da decidere” richiede anche di rendere sotto i colleghi sulla stessa creator e una tendenza (due mesi o un calo). Conta la tendenza, non il singolo mese.</Notice>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <FilterChip label={`Da decidere (${nDecide})`} active={bucket === "decide"} onClick={() => setBucket("decide")} />
          <FilterChip label={`Da osservare (${nWatch})`} active={bucket === "watch"} onClick={() => setBucket("watch")} />
          <span style={{ width: 12 }} />
          <FilterChip label={`Tutti (${inThreshold.length})`} active={stage === "all"} onClick={() => setStage("all")} />
          <FilterChip label={`Senza sostituto (${n("todo")})`} active={stage === "todo"} disabled={!n("todo")} onClick={() => setStage(stage === "todo" ? "all" : "todo")} />
          <FilterChip label={`Sostituto scelto (${n("swap")})`} active={stage === "swap"} disabled={!n("swap")} onClick={() => setStage(stage === "swap" ? "all" : "swap")} />
          <FilterChip label={`Pronti per HR (${n("ready")})`} active={stage === "ready"} disabled={!n("ready")} onClick={() => setStage(stage === "ready" ? "all" : "ready")} />
          <span style={{ width: 12 }} />
          {tiers.map((t) => (
            <FilterChip key={t} label={`${tierLabel(t)} (${inThreshold.filter((c) => c.tier === t).length})`} active={tier === t} onClick={() => setTier(tier === t ? "" : t)} />
          ))}
          <span style={{ flex: 1 }} />
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Soglia score" style={{ ...ctl, fontSize: 13 }}>
            {THRESHOLDS.map((t) => <option key={t} value={t}>{t === 25 ? "Soglia score ≤ 25 (standard)" : `Soglia score ≤ ${t} (più ampia)`}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore" aria-label="Cerca operatore" style={{ ...ctl, width: 200, fontSize: 13 }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          “Pronto per HR” si attiva dopo aver scelto un sostituto e chiede il colloquio documentato (data, motivazione, cosa ha detto l'operatore). “Togli” vale solo per questo mese; “Escludi sempre” lo toglie anche dai mesi futuri (resta in classifica).
        </div>

        {rows.length === 0 ? (
          <div style={{ ...card, padding: 20, fontSize: 14, color: CP.textSecondary }}>
            {inThreshold.length === 0 ? "Nessun operatore sotto soglia questo mese." : "Nessun operatore in questa vista."}
          </div>
        ) : (
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1100, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 176 }} />
                <col style={{ width: 64 }} />
                <col />
                <col style={{ width: 104 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead><tr>
                {[["Operatore", "left"], ["Turni", "right"], ["Contesto", "left"], ["Score", "right"], [prevName ? `A ${prevName}` : "Mese prima", "right"], ["Venduto", "right"], ["Sostituto (compatibilità)", "left"], ["", "right"]].map(([h, al], k) => (
                  <th key={k} style={{ ...thS, textAlign: al }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((c) => {
                  const st = stageOf(c);
                  const ps = prevScore.get(c.employee);
                  const few = (c.cp_total_shifts || 0) < minShifts;
                  const ev = evaluate(c);
                  const ctx = contextLine(c);
                  const coldOk = c.context?.difficulty_band === "fredda" && c.context.vs_peers_pct != null && c.context.vs_peers_pct >= -10;
                  const second = bucket === "watch" && ev.missing.length > 0
                    ? `Manca: ${ev.missing.join("; ")}`
                    : coldOk ? "Rende come i colleghi su una creator fredda: valutare la creator prima della persona" : "";
                  const isSel = sel === c.employee;
                  return (
                    <tr key={c.employee} className="ac-row" data-selected={isSel ? "true" : undefined}
                      onClick={() => setSel(c.employee)}
                      style={{ borderTop: `1px solid ${CP.borderSoft}`, background: st === "ready" ? CP.accentSoft : isSel ? CP.surfaceAlt : "transparent" }}>
                      <td style={tdS}>
                        <Link href={`/leaderboard/operational/${encodeURIComponent(c.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500, overflowWrap: "anywhere" }}>{c.employee}</Link>
                        <div>
                          <button type="button" className="ac-cv-btn" onClick={(e) => { e.stopPropagation(); setSel(c.employee); setCvFor(c.employee); }}
                            style={{ ...linkBtn, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <User size={12} /> Vista colloquio
                          </button>
                        </div>
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtInt(c.cp_total_shifts)}</td>
                      <td style={tdS}>
                        <div style={{ color: CP.textSecondary, lineHeight: 1.45 }}>{ctx || "—"}</div>
                        {second && <div style={{ fontSize: 13, color: bucket === "watch" ? CP.textPrimary : CP.accentSoftText, lineHeight: 1.45, marginTop: 2 }}>{second}</div>}
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>
                        {few ? (
                          <span style={{ fontSize: 12, color: CP.textMuted }}>pochi turni: aspetta fine mese</span>
                        ) : (<>
                          <span style={{ color: tierColor(c.tier), fontWeight: 500 }}>{sc(c.score)}</span>
                          <div style={{ fontSize: 12, color: CP.textMuted }}>{tierLabel(c.tier)}</div>
                        </>)}
                      </td>
                      <td style={{ ...tdS, textAlign: "right", color: CP.textSecondary }} title={ps == null ? "non in classifica" : undefined}>{ps == null ? "—" : sc(ps)}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmt$(c.cp_total_sales)}</td>
                      <td style={tdS} onClick={(e) => e.stopPropagation()}>
                        <SwapPicker candidate={c} swapTargets={swapTargets} onChange={(v) => callAction(c.employee, "set_swap", v || null)} />
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        {st !== "ready" ? (
                          <button onClick={() => { setHrErr(null); setHrFor(c.employee); }} disabled={!c.swap_entry?.swap_with}
                            title={c.swap_entry?.swap_with ? "Aggiungi alla lista per HR" : "Scegli prima un sostituto"}
                            style={{ ...btn, background: c.swap_entry?.swap_with ? CP.accent : CP.surfaceAlt, color: c.swap_entry?.swap_with ? CP.accentInk : CP.textMuted, borderColor: "transparent", cursor: c.swap_entry?.swap_with ? "pointer" : "not-allowed" }}>
                            Pronto per HR
                          </button>
                        ) : (
                          <button onClick={() => callAction(c.employee, "set_pending")} style={btn}>Rimetti in attesa</button>
                        )}
                        <div style={{ marginTop: 6, display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button onClick={() => unmark(c.employee)} style={linkBtn}>Togli</button>
                          <button onClick={() => ignorePermanent(c.employee)} style={linkBtn}>Escludi sempre</button>
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
          Contesto: quanto rende per turno rispetto ai colleghi sulla stessa creator (lui escluso) e quanto è “fredda” la creator (profilo dal warehouse, <Link href="/admin/creator-difficulty" style={{ color: CP.accentSoftText }}>Difficoltà creator</Link>). Criteri: score CP ≤ soglia con almeno 5 turni nel mese; “Da decidere” anche per turno sotto il 75% dei colleghi sulla stessa creator e sotto soglia il mese prima o in calo di almeno 5 punti. {data.ignored_count ? `${data.ignored_count} operatori esclusi per sempre non compaiono. ` : ""}I sostituti suggeriti sono chi rende meglio sulle stesse creator (numero = compatibilità).
        </div>
        <Modal open={!!hrFor} onClose={() => setHrFor(null)} title={`Pronto per HR · ${hrFor || ""}`} maxWidth={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
            <div style={{ color: CP.textSecondary, lineHeight: 1.5 }}>Verso HR si va solo dopo aver parlato con la persona. Quello che scrivi finisce nell&apos;export insieme al contesto (colleghi, creator, turni).</div>
            {hrVerify && hrVerify > todayIso && (
              <Notice>C&apos;è una verifica concordata il {fmtDateIt(hrVerify)}: di solito si aspetta quella prima di passare a HR.</Notice>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: CP.textMuted, fontSize: 12 }}>Colloquio svolto il
              <input type="date" value={hrForm.colloquio_date} onChange={(e) => setHrForm({ ...hrForm, colloquio_date: e.target.value })} style={{ ...ctl, fontSize: 14 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: CP.textMuted, fontSize: 12 }}>Motivazione (almeno 80 caratteri: {hrForm.motivazione.trim().length}/80)
              <textarea rows={4} value={hrForm.motivazione} onChange={(e) => setHrForm({ ...hrForm, motivazione: e.target.value })} style={{ ...ctl, fontSize: 14, resize: "vertical" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: CP.textMuted, fontSize: 12 }}>Cosa ha detto l&apos;operatore
              <textarea rows={3} value={hrForm.voce_operatore} onChange={(e) => setHrForm({ ...hrForm, voce_operatore: e.target.value })} style={{ ...ctl, fontSize: 14, resize: "vertical" }} />
            </label>
            {hrErr && <div style={{ color: CP.accentRed, fontSize: 13 }}>{hrErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setHrFor(null)} style={btn}>Annulla</button>
              <button onClick={submitHr} disabled={!hrForm.colloquio_date || hrForm.motivazione.trim().length < 80 || hrForm.voce_operatore.trim().length < 10}
                style={{ ...btn, background: CP.accent, color: CP.accentInk, borderColor: "transparent" }}>Conferma: pronto per HR</button>
            </div>
          </div>
        </Modal>
        {cvCand && (
          <ColloquioView key={cvCand.employee} c={cvCand} monthName={monthName} prevName={prevName} prevScore={prevScore.get(cvCand.employee)}
            threshold={threshold} minShifts={minShifts} evaluation={evaluate(cvCand)}
            onClose={() => setCvFor(null)} onSave={(ag) => saveAgreement(cvCand.employee, ag)} />
        )}
      </>)}
    </div>
  );
}

/**
 * Vista colloquio (26/09, revisione esperti): UNA sola persona a schermo intero,
 * da mostrare in presenza — nessun altro nome visibile. Ordine: contesto →
 * domande per aprire → cosa allenare → il numero (piccolo) → cosa concordiamo.
 * <dialog> nativo con showModal(): focus trap ed Esc; alla chiusura il focus
 * torna a chi l'aveva aperta.
 */
function ColloquioView({ c, monthName, prevName, prevScore, threshold, minShifts, evaluation, onClose, onSave }) {
  const ref = useRef(null);
  const ag0 = c.swap_entry?.agreement || null;
  const [form, setForm] = useState({ next_step: ag0?.next_step || "", verify_date: ag0?.verify_date || "", operator_words: ag0?.operator_words || "" });
  const [state, setState] = useState({ saving: false, msg: ag0?.at ? `Salvato il ${new Date(ag0.at).toLocaleDateString("it-IT")}` : "", err: null });

  useEffect(() => {
    const opener = document.activeElement;
    const d = ref.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    d?.querySelector("#cv-title")?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function") setTimeout(() => opener.focus(), 0);
    };
  }, []);

  const creator = c.top_creator || c.context?.creator || null;
  const vp = c.context?.vs_peers_pct;
  const band = c.context?.difficulty_band;
  const few = (c.cp_total_shifts || 0) < minShifts;
  const bandTxt = band === "fredda" ? "creator fredda: pubblico che spende poco, il numero assoluto sarà basso per chiunque ci lavori"
    : band === "calda" ? "creator calda: pubblico che spende, il margine è nel metodo"
    : band === "nella media" ? "creator nella media" : null;
  const trendTxt = prevScore == null ? "primo mese in classifica, non c'è ancora una tendenza"
    : prevScore <= threshold ? `sotto soglia anche a ${prevName} (${sc(prevScore)})`
    : c.score <= prevScore - 5 ? `in calo rispetto a ${prevName} (${sc(prevScore)})`
    : `a ${prevName} era ${sc(prevScore)}: un mese solo, non ancora una tendenza`;
  const co = c.coaching;
  const tooLong = form.next_step.length > 2000 || form.operator_words.length > 2000;
  const empty = !form.next_step.trim() && !form.verify_date && !form.operator_words.trim();
  const strong = { color: CP.textPrimary, fontWeight: 500 };

  async function save() {
    setState({ saving: true, msg: "", err: null });
    const r = await onSave({ next_step: form.next_step.trim(), verify_date: form.verify_date, operator_words: form.operator_words.trim() });
    setState(r.ok ? { saving: false, msg: "Salvato", err: null } : { saving: false, msg: "", err: r.error });
  }

  return (
    <dialog ref={ref} aria-modal="true" aria-labelledby="cv-title" className="ac-cv"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      style={{ position: "fixed", inset: 0, width: "100vw", maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh", margin: 0, padding: 0, border: 0, background: CP.bg, color: CP.textPrimary, overflowY: "auto", overscrollBehavior: "contain", fontFamily: FONTS.body }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px 56px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 24, fontSize: 13, color: CP.textMuted }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><User size={14} /> Vista colloquio · {monthName} · solo questa persona</span>
          <button type="button" onClick={onClose} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6 }}><X size={14} /> Chiudi</button>
        </div>
        <h2 id="cv-title" tabIndex={-1} style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 500, margin: 0, outline: "none" }}>{c.employee}</h2>
        <p style={{ margin: "4px 0 24px", color: CP.textSecondary, fontSize: 14 }}>{[c.group, `${fmtInt(c.cp_total_shifts)} turni a ${monthName}`].filter(Boolean).join(" · ")}</p>

        <div className="ac-cv-grid">
          <section style={cvCard}>
            <h3 style={cvH}>Il contesto</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 15, lineHeight: 1.5, color: CP.textSecondary }}>
              {creator && <li style={cvLi}>Lavora soprattutto su <b style={strong}>{creator}</b>{bandTxt ? ` — ${bandTxt}` : ""}.</li>}
              <li style={cvLi}>{vp == null ? "Confronto coi colleghi sulla stessa creator non disponibile (pochi turni in comune)." : vp === 0 ? "Per turno rende come i colleghi sulla stessa creator." : <>Per turno rende <b style={strong}>{vp > 0 ? "+" : "−"}{Math.abs(vp)}%</b> rispetto ai colleghi sulla stessa creator.</>}</li>
              <li style={cvLi}>Campione: <b style={strong}>{fmtInt(c.cp_total_shifts)} turni</b>{few ? ", troppo pochi per decidere." : ", abbastanza per parlarne."}</li>
              <li style={{ ...cvLi, borderBottom: "none" }}>Tendenza: {trendTxt}.</li>
            </ul>
          </section>
          <section style={cvCard}>
            <h3 style={cvH}>Domande per aprire</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.55, color: CP.textPrimary, display: "flex", flexDirection: "column", gap: 10 }}>
              <li>Com&apos;è andato il mese{creator ? ` su ${creator}` : ""}, dal tuo punto di vista?</li>
              <li>Qual è stato il turno migliore? Cosa è andato diversamente?</li>
              <li>In quale momento dei turni hai trovato più difficoltà?</li>
            </ol>
          </section>
          {co && (
            <section style={{ ...cvCard, gridColumn: "1 / -1" }}>
              <h3 style={cvH}>Cosa allenare</h3>
              <div style={{ fontSize: 15, ...strong }}>{co.label}{co.display ? `: ${co.display}` : ""}</div>
              {co.advice && <div style={{ fontSize: 14, color: CP.textSecondary, marginTop: 4, lineHeight: 1.5 }}>{co.advice}</div>}
              {co.scenarios?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: CP.textMuted, alignSelf: "center" }}>Scenari consigliati:</span>
                  {co.scenarios.map((t) => <span key={t} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, border: `1px solid ${CP.border}`, color: CP.textSecondary }}>{t}</span>)}
                </div>
              )}
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
                Dal profilo comportamentale sui turni in cui lavora da solo{co.window_days ? `, ultimi ${co.window_days} giorni` : ""}: finestra diversa dal mese dello score.
              </div>
            </section>
          )}
          <section style={{ ...cvCard, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Il numero del mese</div>
            {few ? (
              <div style={{ fontSize: 14, color: CP.textSecondary }}>Pochi turni: aspetta fine mese.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 24, ...strong }}>{sc(c.score)}</span>
                <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, border: `1px solid ${CP.border}`, color: CP.textSecondary }}>{tierLabel(c.tier)}</span>
                {prevScore != null && <span style={{ fontSize: 13, color: CP.textMuted }}>{prevName}: {sc(prevScore)}</span>}
              </div>
            )}
          </section>
          <section style={{ ...cvCard, gridColumn: "1 / -1" }}>
            <h3 style={cvH}>Cosa concordiamo <small style={{ fontSize: 12, color: CP.textMuted, fontWeight: 400 }}>lo scrivete insieme, resta nel caso di questo mese</small></h3>
            <div className="ac-cv-fields">
              <label style={cvLbl}>Prossimo passo
                <input value={form.next_step} maxLength={2000} onChange={(e) => setForm({ ...form, next_step: e.target.value })} placeholder="Es. tre sessioni sullo sblocco PPV entro venerdì" style={{ ...ctl, fontSize: 14 }} />
              </label>
              <label style={cvLbl}>Data di verifica
                <input type="date" value={form.verify_date} onChange={(e) => setForm({ ...form, verify_date: e.target.value })} style={{ ...ctl, fontSize: 14 }} />
              </label>
              <label style={cvLbl}>Cosa ha detto l&apos;operatore
                <input value={form.operator_words} maxLength={2000} onChange={(e) => setForm({ ...form, operator_words: e.target.value })} placeholder="Con le sue parole" style={{ ...ctl, fontSize: 14 }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              {state.err && <span role="alert" style={{ fontSize: 13, color: CP.textPrimary }}>{state.err}</span>}
              {state.msg && <span role="status" style={{ fontSize: 13, color: CP.textMuted }}>{state.msg}</span>}
              <button type="button" onClick={save} disabled={state.saving || empty || tooLong}
                style={{ ...btn, background: CP.accent, color: CP.accentInk, borderColor: "transparent", opacity: state.saving || empty || tooLong ? 0.6 : 1, cursor: state.saving || empty || tooLong ? "not-allowed" : "pointer" }}>
                {state.saving ? "Salvataggio…" : "Salva l'accordo"}
              </button>
            </div>
          </section>
        </div>
        {!evaluation.decide && evaluation.missing.length > 0 && (
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 16 }}>Da osservare, non da decidere: {evaluation.missing.join("; ")}.</div>
        )}
      </div>
    </dialog>
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
              {t.employee} ({tierLabel(t.tier)}, {t.total_shifts} turni)
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
const fmtDateIt = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS_IT[m - 1]} ${y}`; };
const cvCard = { ...card, padding: 20 };
const cvH = { fontFamily: FONTS.display, fontSize: 17, fontWeight: 500, color: CP.textPrimary, margin: "0 0 12px" };
const cvLi = { padding: "8px 0", borderBottom: `1px solid ${CP.borderSoft}` };
const cvLbl = { display: "flex", flexDirection: "column", gap: 4, color: CP.textMuted, fontSize: 12 };
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 12, cursor: "pointer", fontFamily: FONTS.body };
