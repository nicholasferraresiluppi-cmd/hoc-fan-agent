"use client";

// Due aiuti globali montati da AppShell (25/09/2026):
//  - SecurityBanner: avvisa gli admin che non hanno la verifica in due passaggi
//  - FeedbackButton: "Segnala o suggerisci" da qualsiasi pagina (la pagina è allegata)

import { useState } from "react";
import useSWR from "swr";
import { useClerk } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, ShieldAlert, X } from "lucide-react";
import { CP } from "@/lib/brand";

const fetcher = (u) => fetch(u).then((r) => (r.ok ? r.json() : null));

export function SecurityBanner() {
  const { data } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: true });
  const { openUserProfile } = useClerk();
  const sec = data?.security;
  if (!sec?.admin_raw || sec.mfa_enabled) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#2a1d1d", borderBottom: `1px solid ${CP.border}`, fontSize: 13, color: CP.textPrimary, flexWrap: "wrap" }}>
      <ShieldAlert size={16} color={CP.accentRed} />
      <span style={{ flex: "1 1 300px" }}>
        {sec.mfa_required
          ? "I poteri da admin sono sospesi: il tuo account non ha la verifica in due passaggi, che ora è obbligatoria per gli admin."
          : "Sei admin e vedi i dati di tutti: proteggi l'account con la verifica in due passaggi (un codice dal telefono oltre alla password)."}
      </span>
      <button onClick={() => openUserProfile()} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 12, cursor: "pointer" }}>
        Attivala ora
      </button>
    </div>
  );
}

export function FeedbackButton() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("problem");
  const [text, setText] = useState("");
  const [state, setState] = useState(null); // null | sending | sent | error msg

  const send = async () => {
    setState("sending");
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text, page: pathname }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setState(j.error || "Invio non riuscito");
    setState("sent"); setText("");
    setTimeout(() => { setOpen(false); setState(null); }, 1800);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} data-track="Segnala o suggerisci" aria-label="Segnala o suggerisci"
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 60, display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 999, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}>
        <MessageSquarePlus size={15} /> Segnala o suggerisci
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(5,7,10,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Segnala o suggerisci"
            style={{ width: "100%", maxWidth: 380, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>Segnala o suggerisci</div>
              <button onClick={() => setOpen(false)} aria-label="Chiudi" style={{ background: "transparent", border: "none", color: CP.textMuted, cursor: "pointer" }}><X size={16} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[["problem", "Qualcosa non va"], ["idea", "Un'idea"], ["question", "Non capisco"]].map(([k, l]) => (
                <button key={k} onClick={() => setKind(k)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", border: `1px solid ${kind === k ? CP.accent : CP.border}`, background: kind === k ? CP.accentSoft : "transparent", color: kind === k ? CP.accentSoftText : CP.textMuted }}>{l}</button>
              ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} autoFocus
              placeholder={kind === "problem" ? "Cosa è successo? Cosa ti aspettavi?" : kind === "idea" ? "Cosa ti renderebbe il lavoro più facile?" : "Cosa non è chiaro in questa pagina?"}
              style={{ width: "100%", boxSizing: "border-box", padding: 10, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: "inherit" }} />
            <div style={{ fontSize: 11, color: CP.textMuted, margin: "6px 0 12px" }}>Alleghiamo in automatico la pagina: {pathname}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 12, color: state === "sent" ? CP.accentGreen : CP.accentRed }}>{state === "sent" ? "Grazie, ricevuto." : state && state !== "sending" ? state : ""}</span>
              <button onClick={send} disabled={state === "sending" || text.trim().length < 3}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 13, cursor: "pointer", opacity: text.trim().length < 3 ? 0.5 : 1 }}>
                {state === "sending" ? "Invio…" : "Invia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
