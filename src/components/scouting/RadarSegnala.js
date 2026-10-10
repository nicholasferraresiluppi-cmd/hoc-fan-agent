"use client";
// Radar creator — finestra "Segnala una creator" + collegamento del Comando rapido dell'iPhone.
// La segnalazione parte subito; il radar legge profilo e prima storia in evidenza in ~1 minuto.
import { useState } from "react";
import { CP } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { btn, btnPrimary, input, SERIF } from "./radar-ui";

export default function RadarSegnala({ open, onClose, me, onSent }) {
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [token, setToken] = useState(null);
  const [copied, setCopied] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/segnala", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, why, by: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setText(""); setWhy("");
      setMsg("Ricevuta: il radar la sta leggendo. La trovi in «Ultime segnalazioni» tra un minuto.");
      onSent?.();
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  async function makeToken() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/scouting/shortcut-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setToken(d.token);
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Segnala una creator" maxWidth={560}>
      <form onSubmit={send} style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 20, color: CP.textSecondary }}>Incolla il link del profilo o di un reel. Al resto pensa il radar.</p>
        <label htmlFor="rs-link" style={{ fontSize: 13, color: CP.textSecondary }}>Link del profilo o del reel</label>
        <input id="rs-link" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://www.instagram.com/…" style={input} autoFocus />
        <label htmlFor="rs-why" style={{ fontSize: 13, color: CP.textSecondary }}>Perché ti ha colpito (facoltativo)</label>
        <input id="rs-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="es. personaggio fisso, reel virale" style={input} />
        <button type="submit" style={{ ...btnPrimary, justifyContent: "center" }} disabled={busy || !text.trim()}>{busy ? "Invio…" : "Segnala"}</button>
        {msg && <p role="status" style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>{msg}</p>}
        <p style={{ margin: 0, fontSize: 12.5, color: CP.textMuted }}>Il radar legge numeri e prima storia in evidenza (~3 centesimi). Se era già nel radar aggiunge solo la segnalazione.</p>
      </form>

      <div style={{ borderTop: `1px solid ${CP.border}`, marginTop: 20, paddingTop: 16, display: "grid", gap: 10 }}>
        <strong style={{ fontWeight: 600, fontSize: 15 }}>Dall&apos;iPhone, con un tocco</strong>
        <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>Installa il Comando rapido «Radar HOC»: da un reel o un profilo su Instagram, Condividi → Radar HOC, e la creator arriva qui.</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: CP.textSecondary, display: "grid", gap: 4 }}>
          <li>Crea la tua chiave personale (si mostra una volta sola).</li>
          <li>Sull&apos;iPhone apri <a href="/radar-hoc.shortcut" style={{ color: CP.textPrimary }}>il Comando rapido</a> e aggiungilo: ti chiede la chiave, incollala.</li>
        </ol>
        {token ? (
          <div style={{ display: "grid", gap: 8 }}>
            <code style={{ ...input, fontSize: 13, wordBreak: "break-all", userSelect: "all" }}>{token}</code>
            <button type="button" style={btn} onClick={copy}>{copied ? "Copiata" : "Copia la chiave"}</button>
            <span style={{ fontSize: 12.5, color: CP.textMuted }}>Non la rivedrai: se la perdi, creane una nuova.</span>
          </div>
        ) : (
          <button type="button" style={btn} disabled={busy} onClick={makeToken}>Crea la mia chiave</button>
        )}
      </div>
    </Modal>
  );
}
