"use client";

// Pulsante «Scarica per pubblicare» dell'Editoriale (anche nel Warm-up). Sul computer scarica i
// file numerati; sul telefono due tocchi: «Prepara» scarica, «Salva sul telefono» apre il menu di
// condivisione (con «Salva immagini» le foto vanno nel rullino in ordine). Copia la didascalia.
import { useState } from "react";
import { Download, Share } from "lucide-react";
import { prepareFiles, deliverFiles, canShareFiles } from "@/lib/editoriale-download";
import { alertDialog } from "@/components/AppDialogs";

export default function PublishDownload({ creator, files, kind, title, caption, style, label }) {
  const [state, setState] = useState({ step: "idle", pct: 0, files: null });
  const n = files?.length || 0;
  if (!n) return null;
  const what = kind === "reel" ? "il video" : n === 1 ? "la foto" : `le ${n} foto`;
  const copyCaption = async () => { if (caption) { try { await navigator.clipboard.writeText(caption); } catch {} } };

  async function prepare() {
    copyCaption(); // subito, finché il tocco è «fresco» (il telefono lo richiede)
    setState({ step: "busy", pct: 0, files: null });
    try {
      const out = await prepareFiles({ creator, files, kind, title, onProgress: (p) => setState((s) => ({ ...s, pct: p })) });
      if (canShareFiles(out)) { setState({ step: "ready", pct: 1, files: out }); return; }
      await deliverFiles(out);
      setState({ step: "idle", pct: 0, files: null });
      alertDialog({ title: "Scaricato", message: `${kind === "reel" ? "Il video è" : n === 1 ? "La foto è" : `Le ${n} foto sono`} nella cartella Download${n > 1 ? ", numerate nell'ordine del carosello" : ""}.${caption ? " La didascalia è già copiata: incollala su Instagram." : ""}` });
    } catch (e) {
      setState({ step: "idle", pct: 0, files: null });
      alertDialog({ title: "Non scaricato", message: e.message || "Riprova tra poco." });
    }
  }
  async function share() {
    const r = await deliverFiles(state.files, { share: true });
    if (!r.aborted) setState({ step: "idle", pct: 0, files: null });
  }

  const base = { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", ...style };
  if (state.step === "ready") {
    return <button type="button" style={base} onClick={share}><Share size={14} />Salva sul telefono</button>;
  }
  return (
    <button type="button" style={base} disabled={state.step === "busy"} onClick={prepare}>
      <Download size={14} />{state.step === "busy" ? `Preparo ${what}… ${Math.round(state.pct * 100)}%` : label || `Scarica ${what}`}
    </button>
  );
}
