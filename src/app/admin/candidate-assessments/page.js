"use client";

/**
 * /admin/candidate-assessments — assessment pre-assunzione (SEED).
 *
 * Il simulatore Academy come test per candidati. L'admin crea un link monouso,
 * lo manda al candidato, e qui legge il REPORT (score + compliance + signals)
 * come SEGNALE per la scorecard HR — non è un gate automatico: la decisione
 * resta umana e va registrata (bridge V2: aggancio all'employee una volta
 * assunto → un domani si valida se lo score predice la resa reale).
 *
 * Redesign 26/09/2026 sul design system: stato vuoto che spiega il giro in 4
 * passi; riepilogo con ciò che chiede un'azione (esiti da registrare, regole
 * violate); tabella ordinabile (la griglia a 6 colonne si rompeva a 390px); il
 * report si apre sotto la tabella per il candidato scelto. API invariate.
 */
import { useState } from "react";
import useSWR from "swr";
import { Plus, X, Copy, Check } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, DataTable, SectionTitle, card } from "@/components/ds";

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
  invited: { label: "Link inviato", order: 1 },
  in_progress: { label: "In corso", order: 2 },
  completed: { label: "Completato", order: 3 },
  expired: { label: "Scaduto", order: 0 },
};

function outcomeLabel(d) {
  return d === "hired" ? "Assunto" : d === "rejected" ? "Scartato" : d === "pending" ? "In valutazione" : null;
}

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

  const running = items.filter((it) => it.status === "invited" || it.status === "in_progress").length;
  const done = items.filter((it) => it.status === "completed");
  const toDecide = done.filter((it) => !it.outcome?.decision || it.outcome.decision === "pending").length;
  const violations = done.filter((it) => it.aggregate && !it.aggregate.compliance_pass).length;
  const sel = items.find((it) => it.token === expanded) || null;

  const columns = [
    { key: "label", label: "Candidato", render: (it) => <span style={{ fontWeight: 500 }}>{it.label}</span> },
    { key: "status", label: "Stato", sort: (it) => (STATUS_META[it.status] || STATUS_META.invited).order, render: (it) => <span style={{ color: it.status === "expired" ? CP.textMuted : CP.textPrimary }}>{(STATUS_META[it.status] || STATUS_META.invited).label}</span> },
    { key: "progress", label: "Situazioni fatte", align: "right", sort: (it) => it.progress?.index ?? 0, render: (it) => `${it.progress?.index ?? 0} di ${it.progress?.total ?? "—"}` },
    {
      key: "score", label: "Punteggio medio", align: "right", sort: (it) => it.aggregate?.overall_avg ?? null,
      render: (it) => !it.aggregate ? <span style={{ color: CP.textMuted }}>—</span> : (
        <span>
          {it.aggregate.overall_avg}/100
          {!it.aggregate.compliance_pass && <div style={{ fontSize: 12, color: CP.accentRed }}>regole violate</div>}
        </span>
      ),
    },
    {
      key: "outcome", label: "Esito", sort: (it) => outcomeLabel(it.outcome?.decision) || "",
      render: (it) => outcomeLabel(it.outcome?.decision) || <span style={{ color: CP.textMuted }}>{it.status === "completed" ? "da registrare" : "—"}</span>,
    },
    { key: "createdAt", label: "Creato", align: "right", render: (it) => <span style={{ color: CP.textSecondary }}>{fmtDate(it.createdAt)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Assessment candidati" }]}
        title="Assessment candidati"
        subtitle="Una prova di chat simulata per chi si candida come operatore. Crei un link, lo mandi, e qui leggi com’è andata. Il risultato è un elemento in più per chi decide, non una decisione: l’esito lo scegli tu e lo registri qui."
        actions={!error && (
          <button onClick={() => { setFormOpen(!formOpen); setCreated(null); }} style={formOpen ? btnGhost : btnPrimary}>
            {formOpen ? <X size={15} /> : <Plus size={15} />}
            {formOpen ? "Chiudi" : "Nuovo link"}
          </button>
        )}
      />

      {error && (
        <Notice danger={error.status !== 403}>
          {error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare gli assessment: ${error.message}`}
        </Notice>
      )}

      {!error && formOpen && (
        <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <SectionTitle>Nuovo link per un candidato</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, alignItems: "end" }}>
            <label style={{ minWidth: 0 }}>
              <span style={lbl}>Nome del candidato (lo vedete solo voi)</span>
              <input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Es. Marco Rossi" />
            </label>
            <label style={{ minWidth: 0 }}>
              <span style={lbl}>Prova</span>
              <select style={input} value={effectiveSuite} onChange={(e) => setSuiteId(e.target.value)}>
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.scenarioCount} situazioni · circa {s.estMinutes} min</option>
                ))}
              </select>
            </label>
            <div>
              <button onClick={create} disabled={creating || !label.trim()} style={{ ...btnPrimary, opacity: creating || !label.trim() ? 0.5 : 1 }}>
                {creating ? "Creo…" : "Crea il link"}
              </button>
            </div>
          </div>
          {feedback && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 10 }}>{feedback}</div>}
          {created && <CreatedLink created={created} />}
          <p style={{ color: CP.textMuted, fontSize: 13, margin: "12px 0 0", lineHeight: 1.5 }}>
            Il link vale 14 giorni e si usa una volta sola. Prima di iniziare il candidato legge come usiamo l’AI e le sue risposte e deve dare il consenso: è un obbligo di trasparenza già in vigore in Italia.
          </p>
        </section>
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!error && !isLoading && items.length === 0 && (
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessun assessment ancora. Come funziona:</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
            <li>“Nuovo link”: scrivi il nome del candidato e scegli la prova.</li>
            <li>Copia il link e mandalo al candidato (vale 14 giorni, una volta sola).</li>
            <li>Il candidato gestisce alcune chat con fan simulati, dal telefono o dal computer, senza account.</li>
            <li>Qui trovi il punteggio e se ha rispettato le regole di piattaforma; dopo il colloquio registri l’esito.</li>
          </ol>
        </section>
      )}

      {!error && items.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Link creati" value={fmtInt(items.length)} />
            <Metric label="In corso o da iniziare" value={fmtInt(running)} />
            <Metric label="Completati" value={fmtInt(done.length)} />
            <Metric label="Esito da registrare" value={fmtInt(toDecide)} note="tra i completati" />
            <Metric label="Con regole violate" value={fmtInt(violations)} danger={violations > 0} note="da leggere prima del colloquio" />
          </section>

          <DataTable columns={columns} rows={items.map((it) => ({ ...it, id: it.token }))} defaultSort={{ key: "createdAt", dir: -1 }}
            onRowClick={(it) => setExpanded(expanded === it.token ? null : it.token)} selected={(it) => it.token === expanded}
            minWidth={760} maxHeight={520} />
          <div style={{ fontSize: 12.5, color: CP.textMuted, margin: "8px 0 14px" }}>Clicca un candidato per aprire il suo report, copiare il link o registrare l’esito.</div>

          {sel && (
            <section style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{sel.label}</h2>
                <span style={{ fontSize: 13, color: CP.textMuted }}>{(STATUS_META[sel.status] || STATUS_META.invited).label} · creato il {fmtDate(sel.createdAt)}</span>
                <button onClick={() => setExpanded(null)} style={{ ...btnGhost, marginLeft: "auto", padding: "5px 10px" }}><X size={13} /> Chiudi</button>
              </div>
              <AssessmentDetail key={sel.token} token={sel.token} origin={origin} onOutcomeSaved={mutate} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CopyButton({ text, label = "Copia" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ ...btnGhost, whiteSpace: "nowrap" }}>
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiato" : label}
    </button>
  );
}

function LinkBox({ link }) {
  return (
    <code style={{ flex: "1 1 240px", minWidth: 0, fontSize: 13, color: CP.textPrimary, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", overflowX: "auto", whiteSpace: "nowrap", fontFamily: "inherit" }}>
      {link}
    </code>
  );
}

function CreatedLink({ created }) {
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: CP.surfaceAlt }}>
      <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 8 }}>Link pronto per {created.label}: copialo e mandalo al candidato.</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <LinkBox link={created.link} />
        <CopyButton text={created.link} />
      </div>
    </div>
  );
}

function AssessmentDetail({ token, origin, onOutcomeSaved }) {
  const { data, isLoading, mutate } = useSWR(`/api/admin/candidate-assessments/${token}`, fetcher, { revalidateOnFocus: false });
  const it = data?.item;
  const [decision, setDecision] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 13, paddingTop: 8 }}>Caricamento report…</div>;
  if (!it) return <Notice danger>Report non disponibile. Riprova tra poco.</Notice>;

  const results = it.progress?.results || [];
  const o = it.outcome || {};

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0 16px" }}>
        <LinkBox link={link} />
        <CopyButton text={link} label="Copia link" />
      </div>

      {it.aggregate ? (
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 16 }}>
          <Metric label="Punteggio medio" value={`${it.aggregate.overall_avg}/100`} />
          <Metric label="Stelle medie" value={`${it.aggregate.stars_avg} su 5`} />
          <Metric label="Situazioni completate" value={`${it.aggregate.scenarios_done} di ${it.scenarioIds.length}`} />
          <Metric label="Regole di piattaforma" value={it.aggregate.compliance_pass ? "Rispettate" : "Violate"} danger={!it.aggregate.compliance_pass} />
        </div>
      ) : (
        <div style={{ color: CP.textMuted, fontSize: 13.5, marginBottom: 16 }}>
          Il candidato non ha ancora finito: il report completo compare quando conclude l’ultima situazione.
        </div>
      )}

      {it.aggregate && !it.aggregate.compliance_pass && (
        <Notice danger>
          <div style={{ color: CP.textPrimary, marginBottom: 4 }}>Ha violato una regola di piattaforma che non si può violare (per esempio: portare il pagamento fuori piattaforma). Leggi dove, prima di decidere:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {it.aggregate.compliance_violations.map((v, i) => (
              <li key={i}><span style={{ color: CP.textMuted }}>{v.scenarioTitle}:</span> {v.violation}</li>
            ))}
          </ul>
        </Notice>
      )}

      {results.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle>Situazione per situazione</SectionTitle>
          <div style={{ border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none" }}>
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div style={{ color: CP.textPrimary, fontSize: 14 }}>{r.scenarioTitle}</div>
                  {r.score?.signals?.headline && <div style={{ color: CP.textMuted, fontSize: 12.5 }}>{r.score.signals.headline}</div>}
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {r.score?.compliance && !r.score.compliance.pass && <span style={{ color: CP.accentRed, fontSize: 12.5 }}>regola violata</span>}
                  <span style={{ color: CP.textSecondary, fontSize: 13 }}>{r.score?.stars || 0} stelle</span>
                  <span style={{ color: CP.textPrimary, fontSize: 14, fontWeight: 500, minWidth: 56, textAlign: "right" }}>{r.score?.overall ?? "—"}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: 14, borderRadius: 10, background: CP.surfaceAlt }}>
        <SectionTitle aside={o.recordedAt ? `ultimo aggiornamento ${fmtDate(o.recordedAt)}` : null}>Esito della candidatura</SectionTitle>
        <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
          La decisione la prende una persona. Se assumi, indica anche chi è diventato (id dell’account o nome come in anagrafica): servirà a verificare, più avanti, se questa prova prevede davvero come lavorerà.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10, marginBottom: 10 }}>
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
            <span style={lbl}>Chi è diventato (se assunto)</span>
            <input style={input} value={employeeId || o.employeeId || ""} onChange={(e) => setEmployeeId(e.target.value)} placeholder="user_… o nome in anagrafica" />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={lbl}>Nota (facoltativa)</span>
          <input style={input} value={note || o.note || ""} onChange={(e) => setNote(e.target.value)} placeholder="Perché questa decisione" />
        </label>
        <button onClick={saveOutcome} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Salvo…" : "Salva esito"}
        </button>
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none",
};
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
