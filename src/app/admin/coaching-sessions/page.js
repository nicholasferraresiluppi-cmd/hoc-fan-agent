"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock, MessageCircle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, card } from "@/components/ds";

/**
 * /admin/coaching-sessions — sessioni di coaching strutturate (benchmark #3).
 * Una sessione = UN comportamento + evidenze + impegni + follow-up.
 * L'operatore conferma la lettura (e può replicare): paper trail a due voci.
 *
 * Redesign DS (26/09/2026): campi con etichetta (prima solo segnaposto, che
 * spariscono appena scrivi), data di follow-up con calendario (stesso formato
 * AAAA-MM-GG inviato all'API), riepilogo di cosa aspetta te o l'operatore,
 * filtro per stato. API e azioni invariate.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_META = {
  sent: { label: "in attesa che l'operatore la legga", short: "In attesa di conferma", color: CP.textPrimary, Icon: Clock },
  acknowledged: { label: "letta e confermata dall'operatore", short: "Confermate", color: CP.accentSoftText, Icon: CheckCircle2 },
  closed: { label: "chiusa con esito", short: "Chiuse", color: CP.textMuted, Icon: CheckCircle2 },
};

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 };
const inp = { width: "100%", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, color: CP.textPrimary, fontFamily: FONTS.body, boxSizing: "border-box" };
const btn = { padding: "7px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textPrimary, cursor: "pointer", fontFamily: FONTS.body };
const today = () => new Date().toISOString().slice(0, 10);

export default function CoachingSessionsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/coaching-sessions", fetcher, { revalidateOnFocus: false });
  const forbidden = data?.error;

  const [employee, setEmployee] = useState("");
  const [topic, setTopic] = useState("");
  const [evidence, setEvidence] = useState("");
  const [commitment, setCommitment] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(null);
  const [closingNote, setClosingNote] = useState("");
  const [filter, setFilter] = useState("all");

  const canSend = employee.trim() && topic.trim().length >= 5;

  async function onCreate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/coaching-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee,
          topic,
          evidence: evidence.split("\n").map((s) => s.trim()).filter(Boolean),
          commitments: commitment.split("\n").map((s) => s.trim()).filter(Boolean).map((label) => ({ label })),
          notes,
          follow_up_date: followUp || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Errore.");
      else {
        setEmployee(""); setTopic(""); setEvidence(""); setCommitment(""); setNotes(""); setFollowUp("");
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onClose(id) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/coaching-sessions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "close", closing_note: closingNote }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Errore.");
      else { setClosing(null); setClosingNote(""); await mutate(); }
    } finally {
      setBusy(false);
    }
  }

  const sessions = data?.sessions || [];
  const waiting = sessions.filter((s) => s.status === "sent").length;
  const openS = sessions.filter((s) => s.status !== "closed");
  const dueFollowUp = openS.filter((s) => s.follow_up_date && s.follow_up_date <= today()).length;
  const visible = filter === "all" ? sessions : sessions.filter((s) => s.status === filter);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Sessioni di coaching" }]}
        title="Sessioni di coaching"
        subtitle="Scrivi all'operatore su cosa lavorare: un solo comportamento, i fatti che lo mostrano e gli impegni presi. L'operatore la legge, la conferma e può rispondere; al follow-up la chiudi scrivendo com'è andata. Resta tutto scritto, da entrambe le parti."
      />

      {forbidden && (
        <Notice danger>Questa pagina è per team lead (vedono i loro operatori) e per chi vede i dati di tutti. {String(forbidden)}</Notice>
      )}

      {!forbidden && data && !isLoading && (
        <HeroMetric
          label="Sessioni aperte"
          value={fmtInt(openS.length)}
          compare={dueFollowUp > 0 ? `${fmtInt(dueFollowUp)} ${dueFollowUp === 1 ? "ha" : "hanno"} il follow-up oggi o già passato: vanno chiuse con l'esito.` : openS.length ? "Nessun follow-up scaduto." : "Nessuna sessione aperta."}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Non ancora lette dall'operatore" value={fmtInt(waiting)} />
            <Metric label="Follow-up scaduto" value={fmtInt(dueFollowUp)} />
          </div>
        </HeroMetric>
      )}

      {!forbidden && (
        <section style={{ ...card, padding: "18px 20px", marginBottom: 24 }}>
          <SectionTitle>Nuova sessione</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl} htmlFor="cs-emp">Operatore (nome esatto, come in classifica)</label>
              <input id="cs-emp" value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Nome Cognome" style={inp} />
            </div>
            <div>
              <label style={lbl} htmlFor="cs-fu">Data del follow-up</label>
              <input id="cs-fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl} htmlFor="cs-topic">Il comportamento su cui lavorare (uno solo, concreto)</label>
            <input id="cs-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Es. propone il PPV prima di aver creato un rapporto con i fan nuovi" style={inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl} htmlFor="cs-ev">I fatti che lo mostrano (uno per riga)</label>
              <textarea id="cs-ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3}
                placeholder={"Es. score di luglio: acquisti sbloccati 12% contro 22% di media\nchat Ella · fan Marco · 08/07"}
                style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
            </div>
            <div>
              <label style={lbl} htmlFor="cs-cm">Gli impegni presi (uno per riga)</label>
              <textarea id="cs-cm" value={commitment} onChange={(e) => setCommitment(e.target.value)} rows={3}
                placeholder={"Es. riaprire 3 fan freddi a turno\nrileggere il playbook, sezione PPV"}
                style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
            </div>
          </div>
          <label style={lbl} htmlFor="cs-notes">Note per l'operatore (le legge così come le scrivi)</label>
          <textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={onCreate} disabled={busy || !canSend}
              style={{ ...btn, background: canSend ? CP.accent : CP.surfaceAlt, border: `1px solid ${canSend ? CP.accent : CP.border}`, fontWeight: 500, color: canSend ? CP.accentInk : CP.textMuted, cursor: canSend ? "pointer" : "not-allowed" }}>
              Invia all'operatore
            </button>
            {!canSend && <span style={{ fontSize: 12, color: CP.textMuted }}>Servono almeno il nome dell'operatore e il comportamento.</span>}
          </div>
        </section>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (
        <>
          <SectionTitle aside={data?.scope === "team" ? "Solo quelle dei tuoi operatori." : null}>Sessioni</SectionTitle>
          {sessions.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <FilterChip label={`Tutte · ${sessions.length}`} active={filter === "all"} onClick={() => setFilter("all")} />
              {Object.entries(STATUS_META).map(([k, m]) => (
                <FilterChip key={k} label={`${m.short} · ${sessions.filter((s) => s.status === k).length}`} active={filter === k} onClick={() => setFilter(k)} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.length === 0 && (
              <div style={{ ...card, padding: "18px 20px", color: CP.textSecondary, fontSize: 14 }}>
                Nessuna sessione ancora. La prima la scrivi nel modulo qui sopra: l'operatore la trova nella sua pagina «Il mio coaching».
              </div>
            )}
            {sessions.length > 0 && visible.length === 0 && <div style={{ color: CP.textMuted, fontSize: 14 }}>Nessuna sessione in questo stato.</div>}
            {visible.map((s) => {
              const meta = STATUS_META[s.status] || STATUS_META.sent;
              const late = s.status !== "closed" && s.follow_up_date && s.follow_up_date <= today();
              return (
                <section key={s.id} style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{s.employee}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: meta.color }}>
                      <meta.Icon size={13} /> {meta.label}
                    </span>
                    {s.follow_up_date && (
                      <span style={{ fontSize: 13, color: late ? CP.accentRed : CP.textMuted }}>
                        follow-up {new Date(s.follow_up_date + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}{late ? " · scaduto" : ""}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>scritta il {new Date(s.created_at).toLocaleDateString("it-IT")}</span>
                  </div>
                  <p style={{ fontSize: 14, color: CP.textPrimary, margin: "0 0 6px", lineHeight: 1.5 }}>{s.topic}</p>
                  {(s.commitments || []).length > 0 && (
                    <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0 }}>Impegni: {s.commitments.map((c) => c.label).join(" · ")}</p>
                  )}
                  {s.reply_note && (
                    <p style={{ fontSize: 13, color: CP.textSecondary, margin: "8px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <MessageCircle size={13} color={CP.accentSoftText} style={{ flexShrink: 0, marginTop: 3 }} />
                      <span><span style={{ color: CP.textPrimary }}>Risposta dell'operatore:</span> {s.reply_note}</span>
                    </p>
                  )}
                  {s.closing_note && <p style={{ fontSize: 13, color: CP.textSecondary, margin: "8px 0 0" }}><span style={{ color: CP.textPrimary }}>Esito al follow-up:</span> {s.closing_note}</p>}

                  {s.status !== "closed" && closing !== s.id && (
                    <button onClick={() => { setClosing(s.id); setClosingNote(""); }} style={{ ...btn, marginTop: 10, fontSize: 12, padding: "5px 12px" }}>
                      Chiudi con l'esito
                    </button>
                  )}
                  {closing === s.id && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input value={closingNote} onChange={(e) => setClosingNote(e.target.value)} placeholder="Com'è andata? (obbligatorio)" aria-label="Esito del follow-up"
                        style={{ ...inp, flex: "1 1 240px", width: "auto" }} />
                      <button onClick={() => onClose(s.id)} disabled={busy || closingNote.trim().length < 5}
                        style={{ ...btn, background: closingNote.trim().length >= 5 ? CP.accent : CP.surfaceAlt, border: `1px solid ${closingNote.trim().length >= 5 ? CP.accent : CP.border}`, fontWeight: 500, color: closingNote.trim().length >= 5 ? CP.accentInk : CP.textMuted }}>
                        Chiudi
                      </button>
                      <button onClick={() => setClosing(null)} style={{ ...btn, background: "transparent", color: CP.textSecondary }}>Annulla</button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
