"use client";

/**
 * La carta della Casa — il finale del modulo HR (03/10/2026).
 *
 * Il momento "carta appena trovata nel pacchetto" (stile FIFA Ultimate Team):
 * la carta appare di dorso, dopo ~0,6 s si gira con un bagliore oro e un
 * riflesso che la attraversa, poi compare il titolo di benvenuto. "Rivedi" la
 * fa rigirare. Con prefers-reduced-motion niente animazioni: la carta è già
 * girata e il titolo già visibile (lo garantisce il CSS, anche prima del JS).
 *
 * Solo CSS (nessuna libreria). Palette Casa fissa: è una pagina sempre scura.
 * Carta di BENVENUTO, non una valutazione: niente voti né punteggi sulla
 * persona, niente numero di membro. I dati sono solo quelli dichiarati
 * (logica in lib/hr-welcome-card.js).
 */
import { useEffect, useRef, useState } from "react";
import { welcomeTitle, cardInitials, roleAbbr, cardName, cardStats, memberSince } from "@/lib/hr-welcome-card";

const IVORY = "#f2eee6";
const GOLD = "#d9b46a";
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
// sagoma da carta FIFA: angoli smussati in alto, punta dolce in basso
const SHAPE = "polygon(9% 0, 91% 0, 100% 5%, 100% 89%, 62% 97%, 50% 100%, 38% 97%, 0 89%, 0 5%)";

const CSS = `
.hwc-scene{position:relative;width:280px;height:400px;max-width:100%;margin:0 auto;perspective:1400px}
.hwc-glow{position:absolute;inset:-46px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,180,106,.55),rgba(217,180,106,.14) 55%,transparent 75%);opacity:0;transform:scale(.7);transition:opacity .9s ease .35s,transform 1.1s ease .35s;pointer-events:none;filter:blur(6px)}
.hwc-scene.is-front .hwc-glow{opacity:1;transform:scale(1)}
.hwc-inner{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(180deg);transition:transform 1.05s cubic-bezier(.2,.75,.2,1)}
.hwc-scene.is-front .hwc-inner{transform:rotateY(0deg)}
.hwc-scene.is-reset .hwc-inner,.hwc-scene.is-reset .hwc-glow,.hwc-scene.is-reset+.hwc-title{transition:none}
.hwc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.hwc-back{transform:rotateY(180deg)}
.hwc-frame{position:absolute;inset:0;clip-path:${SHAPE};-webkit-clip-path:${SHAPE};background:linear-gradient(150deg,#f3dfa8 0%,#b08a45 22%,#f0d79a 45%,#8d6c33 70%,#e9cf8f 100%)}
.hwc-body{position:absolute;inset:3px;clip-path:${SHAPE};-webkit-clip-path:${SHAPE}}
.hwc-sheen{position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,244,214,.38) 47%,rgba(255,255,255,.08) 52%,transparent 66%);transform:translateX(-130%);pointer-events:none}
.hwc-scene.is-front .hwc-sheen{animation:hwcSheen 1.5s ease .95s 1 forwards}
@keyframes hwcSheen{to{transform:translateX(130%)}}
.hwc-title{opacity:0;transform:translateY(8px);transition:opacity .6s ease,transform .6s ease}
.hwc-title.is-on{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  .hwc-inner{transition:none;transform:rotateY(0deg)!important}
  .hwc-back{display:none}
  .hwc-glow{transition:none;opacity:1;transform:none}
  .hwc-scene .hwc-sheen{animation:none}
  .hwc-title{transition:none;opacity:1;transform:none}
}
`;

function Monogram({ size = 18, color = GOLD }) {
  return <span style={{ fontFamily: SERIF, fontSize: size, letterSpacing: "0.12em", color, lineHeight: 1 }}>HOC</span>;
}

function Front({ data, at }) {
  const initials = cardInitials(data);
  const role = roleAbbr(data.currentJob);
  const name = cardName(data);
  const stats = cardStats(data);
  return (
    <div className="hwc-face" aria-hidden="true">
      <div className="hwc-frame" />
      <div className="hwc-body" style={{ background: "radial-gradient(120% 70% at 30% 0%, #2a2418 0%, #15141a 45%, #0b0c10 100%)" }}>
        {/* trama sottile, come la stampa di una carta */}
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg, rgba(217,180,106,.035) 0 2px, transparent 2px 9px)" }} />
        {/* iniziali e ruolo, al posto del punteggio */}
        <div style={{ position: "absolute", left: 26, top: 30, display: "grid", justifyItems: "center", gap: 4, minWidth: 64 }}>
          <span style={{ fontFamily: SERIF, fontSize: initials.length > 1 ? 54 : 60, lineHeight: 0.9, color: IVORY }}>{initials}</span>
          {role && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", color: GOLD }}>{role}</span>}
        </div>
        {/* chip metallico + monogramma */}
        <div style={{ position: "absolute", right: 26, top: 34, display: "grid", justifyItems: "center", gap: 8 }}>
          <span style={{ width: 38, height: 29, borderRadius: 6, background: "linear-gradient(135deg,#f0dcaa,#9a7c45 55%,#e3cd9c)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)" }} />
          <Monogram size={13} />
        </div>
        {/* banda del nome */}
        <div style={{ position: "absolute", left: 18, right: 18, top: 150, textAlign: "center" }}>
          <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(217,180,106,.7),transparent)" }} />
          <div style={{ fontFamily: SERIF, fontSize: name.length > 16 ? 26 : 32, lineHeight: 1.15, padding: "8px 0 6px", color: IVORY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || <Monogram size={26} />}</div>
          <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(217,180,106,.7),transparent)" }} />
        </div>
        {/* le "statistiche": solo ciò che la persona ha dichiarato */}
        {stats.length > 0 && (
          <div style={{ position: "absolute", left: 26, right: 26, top: 222, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14, rowGap: 9 }}>
            {stats.map((s, i) => (
              <div key={`${s.kind}-${s.label}-${i}`} style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0, fontFamily: SANS, fontSize: 12.5, letterSpacing: "0.06em" }}>
                <span style={{ color: IVORY, fontWeight: 600, whiteSpace: "nowrap" }}>{s.label}</span>
                {s.value && <span style={{ color: GOLD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</span>}
              </div>
            ))}
          </div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", fontFamily: SANS, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,238,230,.72)" }}>
          {memberSince(at)}
        </div>
        <div className="hwc-sheen" />
      </div>
    </div>
  );
}

function Back() {
  return (
    <div className="hwc-face hwc-back" aria-hidden="true">
      <div className="hwc-frame" />
      <div className="hwc-body" style={{ background: "radial-gradient(90% 60% at 50% 40%, #4a3a1c 0%, #2a2112 55%, #17130b 100%)", display: "grid", placeItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, rgba(217,180,106,.06) 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, rgba(217,180,106,.06) 0 1px, transparent 1px 12px)" }} />
        <div style={{ position: "relative", width: 128, height: 128, borderRadius: "50%", border: `1px solid rgba(217,180,106,.7)`, display: "grid", placeItems: "center", boxShadow: "0 0 0 6px rgba(217,180,106,.08)" }}>
          <Monogram size={30} />
        </div>
      </div>
    </div>
  );
}

/**
 * @param data dati dichiarati nel modulo (firstName, surname, gender, currentJob, skillLevels, spokenLanguages, residenceComune)
 * @param at   istante dell'invio (per "Membro della Casa · mese anno")
 */
export default function HrWelcomeCard({ data = {}, at, children }) {
  const [front, setFront] = useState(false);
  const [titleOn, setTitleOn] = useState(false);
  const [reset, setReset] = useState(false);
  const timers = useRef([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* vecchi browser */ }
    if (reduced) { setFront(true); setTitleOn(true); return; }
    // "Rivedi": torna di dorso SUBITO (senza animazione), poi la rivelazione riparte
    setReset(true);
    setFront(false);
    setTitleOn(false);
    timers.current = [
      setTimeout(() => setReset(false), 60),
      setTimeout(() => setFront(true), 600),
      setTimeout(() => setTitleOn(true), 1500),
    ];
  };

  useEffect(() => {
    play();
    return () => timers.current.forEach(clearTimeout);
  }, []); // solo al primo montaggio: "Rivedi" richiama play()

  const title = welcomeTitle(data);
  const stats = cardStats(data);
  const name = cardName(data);
  const label = ["La tua carta della Casa", name, roleAbbr(data.currentJob), ...stats.map((s) => `${s.label} ${s.value}`.trim()), memberSince(at)].filter(Boolean).join(", ");

  return (
    <div style={{ display: "grid", gap: 26, justifyItems: "center", textAlign: "center" }}>
      <style>{CSS}</style>
      <div className={`hwc-scene${front ? " is-front" : ""}${reset ? " is-reset" : ""}`} role="img" aria-label={label}>
        <div className="hwc-glow" />
        <div className="hwc-inner">
          <Front data={data} at={at} />
          <Back />
        </div>
      </div>
      <h1 className={`hwc-title${titleOn ? " is-on" : ""}`} style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.05, color: IVORY, maxWidth: 480 }}>
        {title}
      </h1>
      {children}
      <button type="button" onClick={play}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 22px", borderRadius: 999, fontFamily: SANS, fontSize: 14.5, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(242,238,230,.28)", background: "transparent", color: IVORY }}>
        Rivedi
      </button>
    </div>
  );
}
