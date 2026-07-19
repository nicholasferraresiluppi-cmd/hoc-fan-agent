"use client";

import { useState } from "react";
import useSWR from "swr";
import { HelpCircle, CheckCircle2, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/coaching — "Il mio coaching" (scope own).
 * Le sessioni ricevute: si confermano (con replica opzionale) e restano come
 * traccia a due voci. Gli impegni presi sono scritti, non ricordi.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function MyCoachingPage() {
  const { data, mutate, isLoading } = useSWR("/api/me/coaching", fetcher, { revalidateOnFocus: false });
  const [ackId, setAckId] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function onAck(id) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/me/coaching", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "acknowledge", reply_note: reply || null }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Errore.");
      else { setAckId(null); setReply(""); await mutate(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Il mio coaching"
        subtitle="Le sessioni di coaching che ricevi: un comportamento per volta, con evidenze e impegni scritti. Confermale quando le hai lette — e se vuoi dire la tua, la tua replica resta agli atti insieme al resto."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && !data.linked && !data.error && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>Account non ancora collegato a un profilo operatore.</p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
          </div>
        </CpCard>
      )}

      {data?.linked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(data.sessions || []).length === 0 && (
            <CpCard><p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>Nessuna sessione di coaching ancora.</p></CpCard>
          )}
          {(data.sessions || []).map((s) => (
            <CpCard key={s.id} accent={s.status === "sent" ? CP.accent : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                {s.status === "sent"
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 650, color: CP.accent }}><Clock size={13} /> da confermare</span>
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 650, color: s.status === "closed" ? CP.accentGreen : CP.accentBlue }}><CheckCircle2 size={13} /> {s.status === "closed" ? "chiusa" : "confermata"}</span>}
                {s.follow_up_date && <span style={{ fontSize: 12, color: CP.textMuted }}>follow-up {s.follow_up_date}</span>}
                <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{new Date(s.created_at).toLocaleDateString("it-IT")}</span>
              </div>

              <p style={{ fontSize: 14.5, color: CP.textPrimary, margin: "0 0 8px", fontWeight: 550 }}>{s.topic}</p>

              {(s.evidence || []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <SectionLabel>Su cosa si basa</SectionLabel>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: CP.textSecondary, fontSize: 13 }}>
                    {s.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {(s.commitments || []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <SectionLabel>Impegni presi</SectionLabel>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: CP.textSecondary, fontSize: 13 }}>
                    {s.commitments.map((c, i) => <li key={i}>{c.label}{c.due_date ? ` (entro ${c.due_date})` : ""}</li>)}
                  </ul>
                </div>
              )}
              {s.notes && <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 8px" }}>{s.notes}</p>}
              {s.reply_note && <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 8px" }}><b>La tua replica:</b> {s.reply_note}</p>}
              {s.closing_note && <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0 }}><b>Esito follow-up:</b> {s.closing_note}</p>}

              {s.status === "sent" && ackId !== s.id && (
                <button onClick={() => { setAckId(s.id); setReply(""); }}
                  style={{ marginTop: 8, padding: "7px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer" }}>
                  Ho letto, confermo
                </button>
              )}
              {ackId === s.id && (
                <div style={{ marginTop: 10 }}>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2}
                    placeholder="Vuoi aggiungere il tuo punto di vista? (opzionale — resta agli atti insieme alla sessione)"
                    style={{ width: "100%", background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body }} />
                  {err && <p style={{ color: CP.accentRed, fontSize: 12.5, margin: "6px 0 0" }}>{err}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => onAck(s.id)} disabled={busy}
                      style={{ padding: "7px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer" }}>
                      Conferma{reply.trim() ? " con replica" : ""}
                    </button>
                    <button onClick={() => setAckId(null)} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textMuted, cursor: "pointer" }}>Annulla</button>
                  </div>
                </div>
              )}
            </CpCard>
          ))}
        </div>
      )}
    </div>
  );
}
