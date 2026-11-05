"use client";

// Avvisi dell'app (28/10/2026) — al posto di confirm(), alert() e prompt() del browser.
// Nicholas: «non mi piacciono gli avvisi che si aprono così, sembrano fuori dall'app; centralizziamoli».
// Le finestre del browser escono in alto con «houseofcreators.app dice» e lo stile del sistema;
// queste sono centrate, nello stile dell'app (si vedono nel vetro e in tutti i temi), si chiudono
// con Esc o toccando fuori, e Invio conferma.
//
// Uso (una riga al posto della funzione del browser):
//   if (!(await confirmDialog("Smontare «X»?", { ok: "Smonta", danger: true }))) return;
//   alertDialog("Salvato");                       // non serve aspettarlo
//   const nome = await promptDialog("Nome della cartella", { defaultValue: "…" });  // null = annullato
// <AppDialogHost /> è montato una volta sola in app/layout.js. Se per qualche motivo non c'è
// (pagina fuori dal layout), si torna alla finestra del browser: niente azione resta senza conferma.
import { useEffect, useRef, useState } from "react";
import { CP, FONTS, alpha } from "@/lib/brand";

let push = null; // impostato dall'host montato
const queue = [];

function open(kind, message, opts = {}) {
  const o = typeof message === "object" && message !== null ? { ...message, ...opts } : { ...opts, message };
  if (!push) {
    // fallback: nessun host montato
    if (typeof window === "undefined") return Promise.resolve(kind === "confirm" ? false : null);
    if (kind === "confirm") return Promise.resolve(window.confirm(String(o.message || "")));
    if (kind === "prompt") return Promise.resolve(window.prompt(String(o.message || ""), o.defaultValue ?? ""));
    window.alert(String(o.message || ""));
    return Promise.resolve();
  }
  return new Promise((resolve) => push({ kind, ...o, resolve }));
}

/** Chiede conferma. Risolve true (conferma) o false (annulla). */
export const confirmDialog = (message, opts) => open("confirm", message, opts);
/** Avvisa. Risolve quando viene chiuso (di solito non serve aspettarlo). */
export const alertDialog = (message, opts) => open("alert", message, opts);
/** Chiede un testo. Risolve la stringa scritta o null se annullato. */
export const promptDialog = (message, opts) => open("prompt", message, opts);

export default function AppDialogHost() {
  const [cur, setCur] = useState(null);
  const [val, setVal] = useState("");
  const okRef = useRef(null);
  const inRef = useRef(null);

  useEffect(() => {
    push = (d) => {
      queue.push(d);
      setCur((c) => c || queue[0]);
    };
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!cur) return;
    setVal(cur.defaultValue ?? "");
    const t = setTimeout(() => (cur.kind === "prompt" ? inRef.current?.select() : okRef.current?.focus()), 30);
    return () => clearTimeout(t);
  }, [cur]);

  const close = (result) => {
    if (!cur) return;
    queue.shift();
    cur.resolve(result);
    setCur(queue[0] || null);
  };
  const cancelValue = () => (cur?.kind === "confirm" ? false : cur?.kind === "prompt" ? null : undefined);
  const okValue = () => (cur?.kind === "confirm" ? true : cur?.kind === "prompt" ? val : undefined);

  useEffect(() => {
    if (!cur) return;
    const k = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(cancelValue()); }
      else if (e.key === "Enter" && !(e.target?.tagName === "TEXTAREA")) { e.preventDefault(); close(okValue()); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });

  if (!cur) return null;
  const danger = Boolean(cur.danger);
  const okLabel = cur.ok || (cur.kind === "alert" ? "Ho capito" : "Conferma");
  const btn = { font: "inherit", fontSize: 14.5, minHeight: 42, padding: "0 18px", borderRadius: 12, cursor: "pointer", border: `1px solid ${CP.border}` };
  return (
    <div role="presentation" onClick={(e) => e.target === e.currentTarget && close(cancelValue())}
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "grid", placeItems: "center", padding: 16, background: alpha(CP.bgSunken, "99"), backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontFamily: FONTS.body }}>
      <div role={cur.kind === "alert" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="app-dialog-msg"
        style={{ width: "100%", maxWidth: 440, background: CP.panel, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 20, padding: "22px 22px 18px", boxShadow: `0 24px 60px ${alpha(CP.bgSunken, "66")}` }}>
        {cur.title && <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{cur.title}</div>}
        <div id="app-dialog-msg" style={{ fontSize: cur.title ? 14.5 : 16, lineHeight: 1.5, color: cur.title ? CP.textSecondary : CP.textPrimary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(cur.message ?? "")}</div>
        {cur.kind === "prompt" && (
          <input ref={inRef} value={val} onChange={(e) => setVal(e.target.value)} placeholder={cur.placeholder || ""}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 14, background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 12, padding: "11px 12px", fontSize: 15, fontFamily: FONTS.body }} />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          {cur.kind !== "alert" && (
            <button type="button" onClick={() => close(cancelValue())} style={{ ...btn, background: CP.surfaceAlt, color: CP.textPrimary }}>{cur.cancel || "Annulla"}</button>
          )}
          <button ref={okRef} type="button" onClick={() => close(okValue())}
            style={{ ...btn, fontWeight: 500, background: danger ? alpha(CP.accentRed, "1a") : CP.accent, color: danger ? CP.accentRed : CP.accentInk, border: `1px solid ${danger ? alpha(CP.accentRed, "66") : CP.accent}` }}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}
