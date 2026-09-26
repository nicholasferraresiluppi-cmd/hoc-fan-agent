"use client";

import { useState } from "react";
import useSWR from "swr";
import { HelpCircle, CheckCircle2, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, card } from "@/components/ds";

/**
 * /me/coaching — "Il mio coaching" (scope own).
 * Le sessioni ricevute: si confermano (con replica opzionale) e restano come
 * traccia a due voci. Gli impegni presi sono scritti, non ricordi.
 * Ridisegno sul design system 26/09/2026: API e comportamento invariati.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const btnPrimary = { padding: "8px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer", fontFamily: FONTS.body };
const btnGhost = { padding: "8px 14px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, cursor: "pointer", fontFamily: FONTS.body };
const label = { fontSize: 13, fontWeight: 500, color: CP.textSecondary, margin: "0 0 4px" };
const list = { margin: 0, paddingLeft: 18, color: CP.textSecondary, fontSize: 13, lineHeight: 1.55 };

function StatusChip({ status }) {
  if (status === "sent") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 999, padding: "3px 10px" }}>
        <Clock size={12} /> Da confermare
      </span>
    );
  }
  const closed = status === "closed";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 999, padding: "2px 10px" }}>
      <CheckCircle2 size={12} color={closed ? CP.accentGreen : CP.textMuted} /> {closed ? "Chiusa" : "Confermata"}
    </span>
  );
}

export default function MyCoachingPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/me/coaching", fetcher, { revalidateOnFocus: false });
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

  const sessions = data?.sessions || [];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 880, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Il mio coaching" }]}
        title="Il mio coaching"
        subtitle="Le sessioni di coaching che ricevi: un comportamento alla volta, con i fatti su cui si basa e gli impegni presi per iscritto. Confermale quando le hai lette; se vuoi dire la tua, la tua replica resta agli atti insieme alla sessione."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {error && !data && <Notice danger>Errore di rete: la pagina non si è caricata. Riprova tra poco.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.linked && !data.error && (
        <div style={{ ...card, padding: "28px 18px", textAlign: "center" }}>
          <HelpCircle size={28} color={CP.mutedIcons} />
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: "10px 0 4px" }}>Il tuo account non è ancora collegato a un profilo operatore.</p>
          <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
        </div>
      )}

      {data?.linked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.length === 0 && (
            <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary }}>Nessuna sessione di coaching per ora. Quando ne riceverai una, la troverai qui.</div>
          )}
          {sessions.map((s) => (
            <article key={s.id} style={{ ...card, padding: "16px 18px", ...(s.status === "sent" ? { borderLeft: `3px solid ${CP.accent}` } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <StatusChip status={s.status} />
                {s.follow_up_date && <span style={{ fontSize: 12, color: CP.textMuted }}>Verifica prevista il {s.follow_up_date}</span>}
                <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{new Date(s.created_at).toLocaleDateString("it-IT")}</span>
              </div>

              <h2 style={{ fontSize: 15, color: CP.textPrimary, margin: "0 0 10px", fontWeight: 500, lineHeight: 1.4 }}>{s.topic}</h2>

              {(s.evidence || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={label}>Su cosa si basa</p>
                  <ul style={list}>
                    {s.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {(s.commitments || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={label}>Impegni presi</p>
                  <ul style={list}>
                    {s.commitments.map((c, i) => <li key={i}>{c.label}{c.due_date ? ` (entro ${c.due_date})` : ""}</li>)}
                  </ul>
                </div>
              )}
              {s.notes && <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.55 }}>{s.notes}</p>}
              {s.reply_note && (
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 500, color: CP.textPrimary }}>La tua replica:</span> {s.reply_note}
                </p>
              )}
              {s.closing_note && (
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0, paddingTop: 10, borderTop: `1px solid ${CP.borderSoft}`, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 500, color: CP.textPrimary }}>Esito della verifica:</span> {s.closing_note}
                </p>
              )}

              {s.status === "sent" && ackId !== s.id && (
                <button onClick={() => { setAckId(s.id); setReply(""); }} style={{ ...btnPrimary, marginTop: 6 }}>
                  Ho letto, confermo
                </button>
              )}
              {ackId === s.id && (
                <div style={{ marginTop: 10 }}>
                  <label htmlFor={`reply-${s.id}`} style={{ ...label, display: "block" }}>Il tuo punto di vista (facoltativo)</label>
                  <textarea id={`reply-${s.id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={3}
                    placeholder="Se vuoi, aggiungi qui cosa ne pensi: resta agli atti insieme alla sessione."
                    style={{ width: "100%", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body }} />
                  {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "6px 0 0" }}>{err}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => onAck(s.id)} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                      Conferma{reply.trim() ? " con replica" : ""}
                    </button>
                    <button onClick={() => setAckId(null)} style={btnGhost}>Annulla</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
