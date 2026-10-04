"use client";

/**
 * La rivelazione della tessera — il finale del modulo HR (03/10/2026).
 *
 * Forma "D1 · Tessera da club" (components/HrTessera, scelta da Nicholas al posto
 * della carta in stile FIFA). Regia invariata: la tessera appare coperta (dorso con
 * la palma), dopo ~0,6 s si gira con un bagliore oro e un riflesso che la attraversa,
 * poi compare il titolo di benvenuto (genere solo se dichiarato). Toccandola si vede
 * il retro con le righe dichiarate.
 * 05/10/2026 (Nicholas): tolto "Rivedi" (non serviva e non funzionava); la rivelazione
 * mostra la tessera DA TUTTI E DUE I LATI — fronte, retro con le righe, di nuovo fronte —
 * e solo alla fine la illumina col riflesso. "Salva la tua
 * tessera" ne fa un PNG (lib/hr-tessera-png.js) da condividere o scaricare.
 * Con prefers-reduced-motion: niente animazioni, tessera già girata e titolo visibile.
 *
 * Tessera di BENVENUTO, non una valutazione: niente voti, niente numero di membro.
 */
import { useEffect, useRef, useState } from "react";
import HrTessera from "@/components/HrTessera";
import { welcomeTitle } from "@/lib/hr-welcome-card";

const IVORY = "#f2eee6";
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";

const CSS = `
.hwc-title{opacity:0;transform:translateY(8px);transition:opacity .6s ease,transform .6s ease}
.hwc-title.is-on{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.hwc-title{transition:none;opacity:1;transform:none}}
`;

const btn = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 22px", borderRadius: 999,
  fontFamily: SANS, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
  border: primary ? "1px solid transparent" : "1px solid rgba(242,238,230,.28)",
  background: primary ? IVORY : "transparent", color: primary ? "#0b0c10" : IVORY,
});

/**
 * @param data dati dichiarati nel modulo (firstName, surname, gender, currentJob, skillLevels, spokenLanguages, residenceComune)
 * @param at   istante dell'invio (per "dal anno" e "House of Creators · mese anno")
 */
export default function HrWelcomeCard({ data = {}, at, children, title = null, extra = null }) {
  const [flipped, setFlipped] = useState(true); // true = si vede il dorso (coperta)
  const [covered, setCovered] = useState(true);
  const [glow, setGlow] = useState(false);
  const [glint, setGlint] = useState(0);
  const [titleOn, setTitleOn] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [saving, setSaving] = useState(null); // null | "busy" | "shared" | "downloaded" | messaggio d'errore
  const timers = useRef([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* vecchi browser */ }
    if (reduced) { setFlipped(false); setCovered(false); setGlow(true); setTitleOn(true); setPlaying(false); return; }
    timers.current = [
      // coperta (palma) → fronte col nome
      setTimeout(() => setFlipped(false), 600),
      // mentre si vede il fronte, il dorso diventa il retro con le righe dichiarate
      setTimeout(() => setCovered(false), 1500),
      // giro sul retro…
      setTimeout(() => setFlipped(true), 2300),
      // …e di nuovo sul fronte
      setTimeout(() => setFlipped(false), 4100),
      // solo ora la luce: alone d'oro e riflesso che la attraversa, poi il titolo
      setTimeout(() => setGlow(true), 4900),
      setTimeout(() => setGlint((g) => g + 1), 5200),
      setTimeout(() => setTitleOn(true), 5600),
      setTimeout(() => setPlaying(false), 5600),
    ];
  };

  useEffect(() => {
    play();
    return () => timers.current.forEach(clearTimeout);
  }, []); // solo al primo montaggio

  const save = async () => {
    setSaving("busy");
    try {
      const { saveTesseraPng } = await import("@/lib/hr-tessera-png");
      const r = await saveTesseraPng(data, at);
      setSaving(r === "cancelled" ? null : r);
    } catch {
      setSaving("Non siamo riusciti a creare l'immagine. Riprova, o fai uno screenshot.");
    }
  };

  const onFlip = (next) => {
    if (covered || playing) return; // durante la rivelazione non si gira
    setFlipped(next);
  };

  return (
    <div style={{ display: "grid", gap: 24, justifyItems: "center", textAlign: "center" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", paddingTop: 18 }}>
        <HrTessera data={data} at={at} flipped={flipped} onFlip={onFlip} covered={covered} glow={glow} glintKey={glint} />
      </div>
      <h1 className={`hwc-title${titleOn ? " is-on" : ""}`} style={{ margin: "8px 0 0", fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.05, color: IVORY, maxWidth: 480 }}>
        {title || welcomeTitle(data)}
      </h1>
      {children}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" onClick={save} disabled={saving === "busy"} style={{ ...btn(true), opacity: saving === "busy" ? 0.6 : 1 }}>
          {saving === "busy" ? "Preparo l'immagine…" : "Salva la tua tessera"}
        </button>
      </div>
      {extra}
      {(saving === "shared" || saving === "downloaded") && <div role="status" style={{ fontSize: 13, color: "rgba(242,238,230,.6)" }}>{saving === "downloaded" ? "Fatto: trovi l'immagine tra i download." : "Fatto."}</div>}
      {saving && !["shared", "downloaded", "busy"].includes(saving) && <div role="alert" style={{ fontSize: 13, color: "#e9a99f" }}>{saving}</div>}
      <div style={{ fontSize: 12, color: "rgba(242,238,230,.45)", marginTop: -8 }}>Tocca la tessera per vedere il retro.</div>
    </div>
  );
}
