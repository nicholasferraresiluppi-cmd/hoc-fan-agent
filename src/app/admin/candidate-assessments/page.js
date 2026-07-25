"use client";

/**
 * /admin/candidate-assessments — assessment pre-assunzione (SEED).
 *
 * Il simulatore Academy come test per candidati. L'admin crea un link monouso,
 * lo manda al candidato, e qui legge il REPORT (score + compliance + signals)
 * come SEGNALE per la scorecard HR — non è un gate automatico: la decisione
 * resta umana e va registrata (bridge V2: aggancio all'employee una volta
 * assunto → un domani si valida se lo score predice la resa reale).
 */
import { useState } from "react";
import useSWR from "swr";
import {
  UserCheck, Plus, X, Copy, Check, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, ShieldAlert,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel } from "@/components/cp-style";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
};

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_META = {
  invited: { label: "Invitato", color: CP.textMuted, Icon: Clock },
  in_progress: { label: "In corso", color: CP.accentSoftText, Icon: Clock },
  completed: { label: "Completato", color: CP.accentGreen, Icon: CheckCircle2 },
  expired: { label: "Scaduto", color: CP.accentRed, Icon: XCircle },
};

const input = {
  width: "100%", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none",
};

export default function CandidateAssessmentsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/candidate-assessments", fetcher, { revalidateOnFocus: false });
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { link, label }
  const [feedback, setFeedback] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const items = data?.items || [];
  const suites = data?.suites || [];
  const effectiveSuite = suiteId || suites[0]?.id || "";

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const create = async () => {
    if (!label.trim() || !effectiveSuite) return;
    setCreating(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/admin/candidate-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), suiteId: effectiveSuite }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setCreated({ link: `${origin}${j.path}`, label: j.item.label });
      setLabel("");
      await mutate();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <SectionLabel>People</SectionLabel>
        <h1 style={h1}>Assessment candidati</h1>
        <div style={errBox}>
          {error.status === 403
            ? "Accesso riservato agli admin (capability SEED)."
            : `Errore: ${error.message}`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <SectionLabel>People</SectionLabel>
          <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 12 }}>
            <UserCheck size={26} color={CP.accent} aria-hidden="true" />
            Assessment candidati
          </h1>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            Il simulatore Academy come test pre-assunzione. Crei un link monouso, lo mandi al candidato,
            e leggi qui il report. È un <strong style={{ color: CP.textPrimary }}>segnale</strong> per la scorecard HR —
            la decisione di assunzione resta umana. Registrando l&apos;esito (e chi viene assunto) costruisci
            i dati che un domani diranno se lo score predice davvero la resa sul campo.
          </p>
        </div>
        <button onClick={() => { setFormOpen(!formOpen); setCreated(null); }} style={{ ...btnPrimary, background: formOpen ? CP.surfaceAlt : CP.accent, color: formOpen ? CP.textSecondary : CP.accentInk, border: formOpen ? `1px solid ${CP.border}` : "1px solid transparent" }}>
          {formOpen ? <X size={15} /> : <Plus size={15} />}
          {formOpen ? "Chiudi" : "Nuovo link"}
        </button>
      </div>

      {/* Create form */}
      {formOpen && (
        <div style={panel}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr auto", gap: 12, alignItems: "end" }}>
            <label style={{ minWidth: 0 }}>
              <span style={lbl}>Nome candidato (resta interno)</span>
              <input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Es. Marco Rossi" />
            </label>
            <label style={{ minWidth: 0 }}>
              <span style={lbl}>Suite</span>
              <select style={input} value={effectiveSuite} onChange={(e) => setSuiteId(e.target.value)}>
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.scenarioCount} scenari · ~{s.estMinutes}′</option>
                ))}
              </select>
            </label>
            <button onClick={create} disabled={creating || !label.trim()} style={{ ...btnPrimary, opacity: creating || !label.trim() ? 0.5 : 1 }}>
              {creating ? "Creo…" : "Genera link"}
            </button>
          </div>
          {feedback && <div style={{ color: CP.accentRed, fontSize: 12.5, marginTop: 10 }}>{feedback}</div>}
          {created && <CreatedLink created={created} />}
          <p style={{ color: CP.textMuted, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
            Il link vale 14 giorni ed è monouso. Il candidato vede un&apos;informativa (uso dell&apos;AI, finalità,
            revisione umana) prima di iniziare — obbligo di trasparenza già attivo in Italia.
          </p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ color: CP.textMuted, padding: 24 }}>Caricamento…</div>
      ) : items.length === 0 ? (
        <div style={{ ...panel, color: CP.textSecondary, textAlign: "center" }}>
          Nessun assessment ancora. Crea il primo link col pulsante &ldquo;Nuovo link&rdquo;.
        </div>
      ) : (
        <div style={{ border: `1px solid ${CP.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ ...rowGrid, background: CP.bgSunken, color: CP.textMuted, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", padding: "10px 14px" }}>
            <span></span>
            <span>Candidato</span>
            <span>Stato</span>
            <span>Progresso</span>
            <span>Esito</span>
            <span>Creato</span>
          </div>
          {items.map((it) => (
            <AssessmentRow
              key={it.token}
              it={it}
              origin={origin}
              expanded={expanded === it.token}
              onToggle={() => setExpanded(expanded === it.token ? null : it.token)}
              onOutcomeSaved={mutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreatedLink({ created }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginTop: 14, background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, color: CP.accentGreen, marginBottom: 6 }}>Link creato per {created.label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code style={{ flex: 1, fontFamily: FONTS.mono, fontSize: 12.5, color: CP.textPrimary, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", overflowX: "auto", whiteSpace: "nowrap" }}>
          {created.link}
        </code>
        <button
          onClick={() => { navigator.clipboard?.writeText(created.link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ ...btnGhost, whiteSpace: "nowrap" }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiato" : "Copia"}
        </button>
      </div>
    </div>
  );
}

function AssessmentRow({ it, origin, expanded, onToggle, onOutcomeSaved }) {
  const sm = STATUS_META[it.status] || STATUS_META.invited;
  const agg = it.aggregate;
  return (
    <div style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
      <div style={{ ...rowGrid, padding: "12px 14px", cursor: "pointer", alignItems: "center" }} onClick={onToggle}>
        <span style={{ color: CP.textMuted }}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span style={{ color: CP.textPrimary, fontSize: 13.5, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: sm.color, fontSize: 12.5 }}>
          <sm.Icon size={14} /> {sm.label}
        </span>
        <span style={{ color: CP.textSecondary, fontSize: 12.5 }}>
          {it.progress.index}/{it.progress.total}
          {agg && (
            <span style={{ marginLeft: 8, color: agg.compliance_pass ? CP.textMuted : CP.accentRed }}>
              · {agg.overall_avg}/100{!agg.compliance_pass && " · compliance!"}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12.5, color: it.outcome?.decision ? CP.textSecondary : CP.textMuted }}>
          {it.outcome?.decision ? outcomeLabel(it.outcome.decision) : "—"}
        </span>
        <span style={{ color: CP.textMuted, fontSize: 12.5 }}>{fmtDate(it.createdAt)}</span>
      </div>
      {expanded && <AssessmentDetail token={it.token} origin={origin} onOutcomeSaved={onOutcomeSaved} />}
    </div>
  );
}

function outcomeLabel(d) {
  return d === "hired" ? "Assunto" : d === "rejected" ? "Scartato" : d === "pending" ? "In valutazione" : "—";
}

function AssessmentDetail({ token, origin, onOutcomeSaved }) {
  const { data, isLoading, mutate } = useSWR(`/api/admin/candidate-assessments/${token}`, fetcher, { revalidateOnFocus: false });
  const it = data?.item;
  const [decision, setDecision] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = `${origin}/assessment/${token}`;

  const saveOutcome = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/candidate-assessments/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision || null, employeeId, note }),
      });
      if (r.ok) { await mutate(); await onOutcomeSaved?.(); }
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div style={{ padding: "0 44px 16px", color: CP.textMuted, fontSize: 12.5 }}>Caricamento report…</div>;
  if (!it) return <div style={{ padding: "0 44px 16px", color: CP.accentRed, fontSize: 12.5 }}>Report non disponibile.</div>;

  const results = it.progress?.results || [];
  const o = it.outcome || {};

  return (
    <div style={{ padding: "4px 44px 20px", background: CP.bgSunken, borderTop: `1px solid ${CP.borderSoft}` }}>
      {/* Link */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0 16px" }}>
        <code style={{ flex: 1, fontFamily: FONTS.mono, fontSize: 12, color: CP.textSecondary, overflowX: "auto", whiteSpace: "nowrap" }}>{link}</code>
        <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={btnGhost}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiato" : "Copia link"}
        </button>
      </div>

      {/* Aggregate */}
      {it.aggregate ? (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          <Stat label="Media overall" value={`${it.aggregate.overall_avg}/100`} />
          <Stat label="Stelle medie" value={`${it.aggregate.stars_avg}★`} />
          <Stat label="Scenari" value={`${it.aggregate.scenarios_done}/${it.scenarioIds.length}`} />
          <Stat
            label="Compliance"
            value={it.aggregate.compliance_pass ? "OK" : "Violata"}
            color={it.aggregate.compliance_pass ? CP.accentGreen : CP.accentRed}
          />
        </div>
      ) : (
        <div style={{ color: CP.textMuted, fontSize: 12.5, marginBottom: 16 }}>
          Assessment non ancora completato — nessun report finale.
        </div>
      )}

      {/* Compliance violations */}
      {it.aggregate && !it.aggregate.compliance_pass && (
        <div style={{ background: "rgba(240,140,140,0.08)", border: `1px solid ${CP.accentRed}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.accentRed, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            <ShieldAlert size={15} /> Riga rossa di compliance violata
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: CP.textSecondary, fontSize: 12.5, lineHeight: 1.5 }}>
            {it.aggregate.compliance_violations.map((v, i) => (
              <li key={i}><span style={{ color: CP.textMuted }}>{v.scenarioTitle}:</span> {v.violation}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-scenario */}
      {results.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Dettaglio per scenario</div>
          {results.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < results.length - 1 ? `1px solid ${CP.borderSoft}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: CP.textPrimary, fontSize: 13 }}>{r.scenarioTitle}</div>
                {r.score?.signals?.headline && <div style={{ color: CP.textMuted, fontSize: 11.5 }}>{r.score.signals.headline}</div>}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
                {r.score?.compliance && !r.score.compliance.pass && <span style={{ color: CP.accentRed, fontSize: 12 }}>compliance</span>}
                <span style={{ color: CP.textSecondary, fontSize: 12.5 }}>{r.score?.stars || 0}★</span>
                <span style={{ color: CP.textPrimary, fontSize: 13, fontWeight: 500, width: 52, textAlign: "right" }}>{r.score?.overall ?? "—"}/100</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outcome (bridge V2) */}
      <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12.5, color: CP.textPrimary, fontWeight: 600, marginBottom: 4 }}>Esito della candidatura</div>
        <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
          La decisione è umana. Se assumi, aggancia l&apos;employee id (Clerk userId o roster): serve a validare, un domani, se lo score predice la resa reale.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <label>
            <span style={lbl}>Decisione</span>
            <select style={input} value={decision || o.decision || ""} onChange={(e) => setDecision(e.target.value)}>
              <option value="">—</option>
              <option value="pending">In valutazione</option>
              <option value="hired">Assunto</option>
              <option value="rejected">Scartato</option>
            </select>
          </label>
          <label>
            <span style={lbl}>Employee id (se assunto)</span>
            <input style={input} value={employeeId || o.employeeId || ""} onChange={(e) => setEmployeeId(e.target.value)} placeholder="user_… o nome roster" />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={lbl}>Nota (opzionale)</span>
          <input style={input} value={note || o.note || ""} onChange={(e) => setNote(e.target.value)} placeholder="Contesto della decisione" />
        </label>
        <button onClick={saveOutcome} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Salvo…" : "Salva esito"}
        </button>
        {o.recordedAt && <span style={{ marginLeft: 12, color: CP.textMuted, fontSize: 11.5 }}>Ultimo aggiornamento {fmtDate(o.recordedAt)}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || CP.textPrimary, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const h1 = { fontFamily: FONTS.display, fontSize: 32, margin: "8px 0 6px", fontWeight: 500, letterSpacing: "-0.02em", color: CP.textPrimary };
const panel = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 18, marginBottom: 20 };
const rowGrid = { display: "grid", gridTemplateColumns: "24px 1.6fr 1fr 1.3fr 1fr 0.8fr", gap: 10 };
const lbl = { display: "block", fontSize: 11, color: CP.textMuted, marginBottom: 4 };
const errBox = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 16, color: CP.textSecondary, marginTop: 16 };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "transparent", color: CP.accentSoftText, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
