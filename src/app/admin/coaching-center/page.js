"use client";

// Coaching Center (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Domanda: "chi può crescere, con quale training, e a che punto siamo?".
// Numero principale → filtri per fase (da assegnare/assegnati/completati) e per
// motivo in parole semplici → lista con il training suggerito VISIBILE senza
// aprire la riga. Il link "Apri categoria in Academy" portava a una pagina
// inesistente (/academy): ora porta al simulatore. Le categorie vuote non si
// mostrano (es. "Converte poco": la regola non riceve oggi i dati Infloww).
import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmtInt, MONTHS_IT } from "@/lib/format";
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
// Motivi in parole semplici (prima: etichette tecniche senza spiegazione)
const PATTERN_LABELS = {
  low_conversion: "Chatta bene, vende poco",
  uniform_low: "Sotto media ovunque",
  polarized_creators: "Bene su alcune creator, male su altre",
  low_volume_specialist: "Poche creator, risultati bassi",
  general: "Motivo non chiaro",
};

export default function CoachingCenterPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [stage, setStage] = useState("todo");
  const [pattern, setPattern] = useState("");
  const [q, setQ] = useState("");
  const periodOptions = useMemo(() => monthOpts(), []);
  const url = periodId ? `/api/admin/coaching-center?period_id=${periodId}` : null;
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const candidates = data?.candidates || [];
  const stageOf = (c) => c.assignment?.status === "completed" ? "done" : c.assignment?.status === "assigned" ? "assigned" : c.assignment?.status === "rejected" ? "rejected" : "todo";
  const n = (st) => candidates.filter((c) => stageOf(c) === st).length;
  const patterns = Object.keys(PATTERN_LABELS).map((id) => ({ id, count: candidates.filter((c) => c.pattern === id).length })).filter((p) => p.count > 0);
  const needle = q.trim().toLowerCase();
  const rows = candidates.filter((c) => (stage === "all" || stageOf(c) === stage) && (!pattern || c.pattern === pattern)
    && (!needle || `${c.employee} ${c.top_creator || ""}`.toLowerCase().includes(needle)));

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
    if (!confirm(`Togliere l'assegnazione di ${employee}?`)) return;
    const res = await fetch(`/api/admin/coaching-center?period_id=${periodId}&employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
    if (res.ok) mutate(url);
    else alert("Errore: " + (await res.text()));
  }

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Coaching Center" }]}
        title="Coaching Center"
        subtitle="Operatori con score tra 25 e 50: non da sostituire, ma con margine di crescita. Per ognuno il motivo e il training suggerito; assegnalo e segna quando è fatto. Chi è sotto 25 sta nell'Action Center."
        actions={<>
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={ctl}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Link href={`/admin/action-center?period_id=${periodId}`} style={{ ...ctl, textDecoration: "none" }}>Action Center</Link>
        </>}
      />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.error && (<>
        <HeroMetric label="Da far crescere · score tra 25 e 50" value={fmtInt(candidates.length)}
          hint="Il training è un suggerimento in base al motivo: chi segue l'operatore decide.">
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Da assegnare" value={fmtInt(n("todo"))} />
            <Metric label="Assegnati" value={fmtInt(n("assigned"))} />
            <Metric label="Completati" value={fmtInt(n("done"))} />
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <FilterChip label={`Da assegnare (${n("todo")})`} active={stage === "todo"} onClick={() => setStage("todo")} />
          <FilterChip label={`Assegnati (${n("assigned")})`} active={stage === "assigned"} disabled={!n("assigned")} onClick={() => setStage("assigned")} />
          <FilterChip label={`Completati (${n("done")})`} active={stage === "done"} disabled={!n("done")} onClick={() => setStage("done")} />
          <FilterChip label={`Tutti (${candidates.length})`} active={stage === "all"} onClick={() => setStage("all")} />
          <span style={{ flex: 1 }} />
          <select value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Motivo" style={{ ...ctl, fontSize: 13 }}>
            <option value="">Tutti i motivi</option>
            {patterns.map((p) => <option key={p.id} value={p.id}>{PATTERN_LABELS[p.id]} ({p.count})</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore" aria-label="Cerca operatore" style={{ ...ctl, width: 200, fontSize: 13 }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>Clic su una riga per il dettaglio e per assegnare il training.</div>

        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.3fr) minmax(180px,1.2fr) 90px minmax(200px,1.4fr) 110px 20px", gap: 14, padding: "10px 16px", fontSize: 12, color: CP.textMuted }}>
            <span>Operatore</span><span>Motivo</span><span style={{ textAlign: "right" }}>Score</span><span>Training suggerito</span><span>Stato</span><span />
          </div>
          {rows.length === 0 && <div style={{ padding: 16, fontSize: 14, color: CP.textSecondary, borderTop: `1px solid ${CP.borderSoft}` }}>Nessun operatore in questa vista.</div>}
          {rows.map((c) => (
            <CandidateRow key={c.employee} c={c}
              onAssign={(trainingId, owner, deadline, note) => postAction(c.employee, "assign", { training_category_id: trainingId, owner, deadline, note })}
              onComplete={(note) => postAction(c.employee, "complete", { note })}
              onReject={(note) => postAction(c.employee, "reject", { note })}
              onDelete={() => deleteAssignment(c.employee)} />
          ))}
        </div>
      </>)}
    </div>
  );
}

function CandidateRow({ c, onAssign, onComplete, onReject, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [owner, setOwner] = useState(c.assignment?.owner || "");
  const [deadline, setDeadline] = useState(c.assignment?.deadline || "");
  const [note, setNote] = useState(c.assignment?.note || "");
  const st = c.assignment?.status;
  const isAssigned = st === "assigned", isCompleted = st === "completed", isRejected = st === "rejected";
  return (
    <div style={{ borderTop: `1px solid ${CP.borderSoft}`, opacity: isRejected ? 0.55 : 1 }}>
      <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
        style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(200px,1.3fr) minmax(180px,1.2fr) 90px minmax(200px,1.4fr) 110px 20px", gap: 14, alignItems: "center", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: CP.textPrimary, fontFamily: FONTS.body }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{c.employee}</span>
          <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>soprattutto su {c.top_creator || c.group || "—"}</span>
        </span>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>{PATTERN_LABELS[c.pattern] || c.pattern}</span>
        <span style={{ fontSize: 14, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.score.toFixed(1).replace(".", ",")}<span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>{tierLabel(c.tier)}</span></span>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>{c.training?.categoryName}</span>
        <span style={{ fontSize: 12, color: isCompleted ? CP.accentGreen : isAssigned ? CP.accentSoftText : CP.textMuted }}>{isCompleted ? "completato" : isAssigned ? "assegnato" : isRejected ? "rifiutato" : "da assegnare"}</span>
        <ChevronDown size={16} color={CP.textMuted} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
      </button>
      {expanded && (
        <div style={{ padding: "4px 16px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
            <DiagBlock label="Dove va peggio" value={c.weakest_creator || "—"} sub={c.weakest_creator_score != null ? `score su questa creator ${c.weakest_creator_score}` : null} />
            <DiagBlock label="Dove va meglio" value={c.strongest_creator || "—"} sub={c.strongest_creator_score != null ? `score su questa creator ${c.strongest_creator_score}` : null} />
            <DiagBlock label="Venduto del mese" value={fmtCurrency(c.total_sales)} sub={`${c.total_creators} creator, ${c.reliable_creators_count} con abbastanza turni`} />
          </div>
          <div style={{ padding: 12, border: `1px solid ${CP.border}`, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: CP.textMuted }}>Training suggerito</div>
            <div style={{ fontSize: 15, fontWeight: 500, margin: "2px 0 4px" }}>{c.training?.categoryName}</div>
            <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{c.training?.rationale}</div>
            <Link href="/" style={{ display: "inline-block", marginTop: 6, color: CP.accentSoftText, fontSize: 13, textDecoration: "none" }}>Apri l&apos;Academy (simulatore) →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 170px 2fr", gap: 8, marginBottom: 10 }}>
            <input type="text" placeholder="Chi lo segue (es. team lead)" value={owner} onChange={(e) => setOwner(e.target.value)} style={inputStyle} aria-label="Chi lo segue" />
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputStyle} aria-label="Entro il" />
            <input type="text" placeholder="Nota (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} aria-label="Nota" />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!isAssigned && !isCompleted && <button onClick={() => onAssign(c.training.categoryId, owner, deadline, note)} style={primaryBtn}>Assegna il training</button>}
            {isAssigned && (<>
              <button onClick={() => onComplete(note)} style={primaryBtn}>Segna completato</button>
              <button onClick={() => onReject(note)} style={secondaryBtn}>Non fatto</button>
            </>)}
            <Link href={`/leaderboard/operational/${encodeURIComponent(c.employee)}`} style={{ ...secondaryBtn, textDecoration: "none" }}>Scheda operatore</Link>
            {c.assignment && <button onClick={onDelete} style={{ ...linkBtn, marginLeft: "auto" }}>Togli assegnazione</button>}
          </div>
          {c.assignment && (
            <div style={{ marginTop: 10, fontSize: 12, color: CP.textMuted }}>
              {st === "assigned" && <>Assegnato il {new Date(c.assignment.assigned_at).toLocaleDateString("it-IT")}</>}
              {st === "completed" && <>Completato il {new Date(c.assignment.completed_at).toLocaleDateString("it-IT")}</>}
              {c.assignment.owner && <> · segue {c.assignment.owner}</>}
              {c.assignment.deadline && <> · entro il {new Date(c.assignment.deadline).toLocaleDateString("it-IT")}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagBlock({ label, value, sub }) {
  return (
    <div style={{ padding: 10, border: `1px solid ${CP.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: CP.textMuted }}>{sub}</div>}
    </div>
  );
}

function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
}
const inputStyle = { padding: "8px 10px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const primaryBtn = { padding: "7px 14px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const secondaryBtn = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.textMuted, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
