"use client";

import { useState } from "react";
import useSWR from "swr";
import { GraduationCap, AlertTriangle, CheckCircle2, Clock, MessageCircle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /admin/coaching-sessions — sessioni di coaching strutturate (benchmark #3).
 * Una sessione = UN comportamento + evidenze + impegni + follow-up.
 * L'operatore conferma la lettura (e può replicare): paper trail a due voci.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_META = {
  sent: { label: "in attesa di conferma", color: "#d9a44a", Icon: Clock },
  acknowledged: { label: "confermata dall'operatore", color: CP.accentBlue, Icon: CheckCircle2 },
  closed: { label: "chiusa", color: CP.accentGreen, Icon: CheckCircle2 },
};

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

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1080, margin: "0 auto" }}>
      <PageHeader
        section="People"
        title="Sessioni di coaching"
        subtitle="Una sessione lavora su UN comportamento, con evidenze e impegni scritti. L'operatore la conferma (e può rispondere): il coaching diventa una paper trail a due voci, non note in un cassetto. Al follow-up si chiude con esito."
      />

      {forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} /> Serve scope team (TL) o all. {String(forbidden)}
          </div>
        </CpCard>
      )}

      {!forbidden && (
        <CpCard style={{ marginBottom: 20 }}>
          <SectionLabel>Nuova sessione</SectionLabel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
            <input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Operatore (nome esatto)"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, width: 220, fontFamily: FONTS.body }} />
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="UN comportamento concreto (es. 'PPV proposto prima del rapport nei nuovi fan')"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, flex: 1, minWidth: 280, fontFamily: FONTS.body }} />
            <input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Follow-up (YYYY-MM-DD)"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, width: 170, fontFamily: FONTS.mono }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3}
              placeholder={"Evidenze (una per riga):\nscore 2026-07 · unlock rate 12% vs media 22%\nchat Ella · fan Marco · 08/07"}
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", fontFamily: FONTS.body }} />
            <textarea value={commitment} onChange={(e) => setCommitment(e.target.value)} rows={3}
              placeholder={"Impegni (uno per riga):\n3 riaperture di fan freddi a turno\nrileggere playbook sezione PPV"}
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", fontFamily: FONTS.body }} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Note per l'operatore (le leggerà così come sono)."
            style={{ width: "100%", background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body }} />
          {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
          <button onClick={onCreate} disabled={busy || !canSend}
            style={{ marginTop: 10, padding: "8px 16px", background: canSend ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: canSend ? CP.accentInk : CP.textMuted, cursor: canSend ? "pointer" : "not-allowed" }}>
            Invia all'operatore
          </button>
        </CpCard>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (
        <>
          <SectionLabel>Sessioni {data?.scope === "team" ? "(le tue)" : ""}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(data?.sessions || []).length === 0 && <p style={{ color: CP.textMuted, fontSize: 13.5 }}>Nessuna sessione ancora.</p>}
            {(data?.sessions || []).map((s) => {
              const meta = STATUS_META[s.status] || STATUS_META.sent;
              return (
                <CpCard key={s.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 600, color: CP.textPrimary }}>{s.employee}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 650, color: meta.color }}>
                      <meta.Icon size={13} /> {meta.label}
                    </span>
                    {s.follow_up_date && <span style={{ fontSize: 12, color: CP.textMuted }}>follow-up {s.follow_up_date}</span>}
                    <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{new Date(s.created_at).toLocaleDateString("it-IT")}</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: CP.textPrimary, margin: "0 0 6px", fontWeight: 550 }}>{s.topic}</p>
                  {(s.commitments || []).length > 0 && (
                    <p style={{ fontSize: 12.5, color: CP.textSecondary, margin: 0 }}>Impegni: {s.commitments.map((c) => c.label).join(" · ")}</p>
                  )}
                  {s.reply_note && (
                    <p style={{ fontSize: 12.5, color: CP.textSecondary, margin: "6px 0 0", display: "flex", gap: 6, alignItems: "center" }}>
                      <MessageCircle size={13} color={CP.accentBlue} /> <b>Replica:</b> {s.reply_note}
                    </p>
                  )}
                  {s.closing_note && <p style={{ fontSize: 12.5, color: CP.textSecondary, margin: "6px 0 0" }}><b>Esito follow-up:</b> {s.closing_note}</p>}

                  {s.status !== "closed" && closing !== s.id && (
                    <button onClick={() => { setClosing(s.id); setClosingNote(""); }}
                      style={{ marginTop: 8, padding: "5px 12px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12, color: CP.textPrimary, cursor: "pointer" }}>
                      Chiudi al follow-up
                    </button>
                  )}
                  {closing === s.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input value={closingNote} onChange={(e) => setClosingNote(e.target.value)} placeholder="Com'è andata? (obbligatorio)"
                        style={{ flex: 1, minWidth: 240, background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body }} />
                      <button onClick={() => onClose(s.id)} disabled={busy || closingNote.trim().length < 5}
                        style={{ padding: "6px 14px", background: closingNote.trim().length >= 5 ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: closingNote.trim().length >= 5 ? CP.accentInk : CP.textMuted, cursor: "pointer" }}>
                        Chiudi
                      </button>
                    </div>
                  )}
                </CpCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
