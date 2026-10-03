"use client";

/**
 * La tessera della Casa, forma "D1 · Tessera da club" (scelta da Nicholas, 03/10/2026).
 *
 * Orizzontale, proporzioni da carta di credito (340×214 a misura piena), angoli 16px.
 * Fronte: palma oro in alto a sinistra, "Membro" in alto a destra, nome completo in
 * Instrument Serif e "Ruolo · Membro da mese anno" in basso, chip metallico in basso a destra.
 * Retro: le righe dichiarate (aree più forti col livello, lingue, disponibilità) sotto
 * "House of Creators · mese anno". Niente voti né numero di membro.
 *
 * Si gira toccandola (e con Invio/Spazio). Opzioni:
 *  - small: versione piccola in cima ai capitoli (si riempie dal vivo);
 *  - live: riflesso dorato quando compare un dato per la prima volta (nome, ruolo…);
 *  - sample + autoFlip: tessera d'esempio dell'intro, che ogni tanto si gira da sola;
 *  - flipped/onFlip/covered/glow/glintKey: controllo dall'esterno (la rivelazione finale
 *    di HrWelcomeCard: parte coperta, si gira, poi il retro diventa quello delle righe).
 * Con prefers-reduced-motion nessuna animazione automatica; il giro al tocco è istantaneo.
 * Disegnata a 340×214 e scalata sulla larghezza disponibile: identica su ogni schermo.
 */
import { useEffect, useRef, useState } from "react";
import HocPalma from "@/components/HocPalma";
import { tesseraName, tesseraLine, tesseraRows, tesseraMilestones, memberSince } from "@/lib/hr-welcome-card";

export const TESSERA_W = 340;
export const TESSERA_H = 214;
const IVORY = "#f2eee6";
const GOLD = "#d9b46a";
const GREY = "#a7a39b";
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
export const TESSERA_BG = "linear-gradient(135deg, #1c1a17 0%, #0e0e10 45%, #1a1712 100%)";

const CSS = `
.ht-scene{position:relative;perspective:1200px}
.ht-glow{position:absolute;inset:-40px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,180,106,.45),rgba(217,180,106,.12) 55%,transparent 75%);opacity:0;transform:scale(.75);transition:opacity .9s ease .3s,transform 1.1s ease .3s;pointer-events:none;filter:blur(8px)}
.ht-scene.is-glow .ht-glow{opacity:1;transform:none}
.ht-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.2,.75,.2,1)}
.ht-scene.is-slow .ht-inner{transition-duration:1.6s;transition-timing-function:cubic-bezier(.45,.05,.35,1)}
.ht-scene.is-flipped .ht-inner{transform:rotateY(180deg)}
.ht-scene.is-reset .ht-inner,.ht-scene.is-reset .ht-glow{transition:none}
.ht-face{position:absolute;inset:0;border-radius:16px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-sizing:border-box}
.ht-back{transform:rotateY(180deg)}
.ht-sheen{position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,236,190,.30) 47%,rgba(255,255,255,.06) 52%,transparent 66%);transform:translateX(-130%);pointer-events:none}
.ht-sheen.is-on{animation:htSheen 1.3s ease .05s 1 forwards}
@keyframes htSheen{to{transform:translateX(130%)}}
.ht-tap{cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none}
.ht-tap:focus-visible{outline:2px solid ${GOLD};outline-offset:4px;border-radius:18px}
@media (prefers-reduced-motion:reduce){.ht-inner,.ht-glow{transition:none}.ht-sheen.is-on{animation:none}}
`;

const faceStyle = {
  background: TESSERA_BG,
  border: "1px solid rgba(217,180,106,.55)",
  boxShadow: "0 30px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,240,210,.12)",
  color: IVORY,
};

function Front({ data, at, sheenKey }) {
  const name = tesseraName(data);
  const line = tesseraLine(data, at);
  return (
    <div className="ht-face" style={faceStyle}>
      <div style={{ position: "absolute", left: 20, top: 20, color: GOLD, lineHeight: 0 }}><HocPalma width={78} title="" /></div>
      <div style={{ position: "absolute", right: 20, top: 22, fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD }}>Membro</div>
      <div style={{ position: "absolute", left: 20, right: 70, bottom: 20, display: "grid", gap: 5, minWidth: 0 }}>
        {name
          ? <div style={{ fontFamily: SERIF, fontSize: name.length > 20 ? 23 : 28, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          : <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 26, lineHeight: 1.05, color: "rgba(242,238,230,.30)" }}>Il tuo nome</div>}
        <div style={{ fontFamily: SANS, fontSize: 11, color: GREY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
      </div>
      <span style={{ position: "absolute", right: 20, bottom: 22, width: 34, height: 26, borderRadius: 5, background: "linear-gradient(135deg,#e3cd9c,#8f7646)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.22)" }} />
      <div key={sheenKey} className={`ht-sheen${sheenKey ? " is-on" : ""}`} />
    </div>
  );
}

function Back({ data, at }) {
  const rows = tesseraRows(data);
  return (
    <div className="ht-face ht-back" style={faceStyle}>
      <div style={{ position: "absolute", left: 20, right: 20, top: 18, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD }}>
        <span>{memberSince(at)}</span>
        <span style={{ lineHeight: 0, opacity: 0.8 }}><HocPalma width={30} title="" /></span>
      </div>
      <div style={{ position: "absolute", left: 20, right: 20, top: 44, bottom: 16, display: "grid", alignContent: "start" }}>
        {rows.length ? rows.map((r, i) => (
          <div key={`${r.kind}-${r.label}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "5px 0", borderTop: i ? "1px solid rgba(217,180,106,.14)" : "none", fontFamily: SANS, fontSize: 12.5, lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ color: IVORY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            {r.value && <span style={{ color: "#e3cd9c", whiteSpace: "nowrap" }}>{r.value}</span>}
          </div>
        )) : (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.35, color: "rgba(242,238,230,.38)", paddingTop: 18 }}>
            Le tue competenze e le lingue compariranno qui.
          </div>
        )}
        {rows.length > 0 && rows.length < 4 && (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.35, color: "rgba(242,238,230,.42)", paddingTop: 10 }}>
            Le prossime competenze si aggiungeranno qui.
          </div>
        )}
      </div>
    </div>
  );
}

function Cover() {
  return (
    <div className="ht-face ht-back" style={{ ...faceStyle, display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, rgba(217,180,106,.05) 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, rgba(217,180,106,.05) 0 1px, transparent 1px 12px)" }} />
      <div style={{ position: "relative", display: "grid", justifyItems: "center", gap: 12, color: GOLD }}>
        <HocPalma width={150} title="" />
        <span style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.26em", textTransform: "uppercase" }}>House of Creators</span>
      </div>
    </div>
  );
}

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** Testo per i lettori di schermo: le due facce lette in ordine. */
export function tesseraA11yText(data, at, prefix = "La tua tessera di House of Creators") {
  const rows = tesseraRows(data).map((r) => [r.label, r.value].filter(Boolean).join(" "));
  return [prefix, tesseraName(data), tesseraLine(data, at), ...rows].filter(Boolean).join(", ");
}

export default function HrTessera({
  data = {}, at = Date.now(), small = false, sample = false, autoFlip = false, live = false,
  flipped: flippedProp, onFlip, covered = false, glow = false, glintKey: glintProp, reset = false, width,
}) {
  const target = width || (small ? 272 : sample ? 316 : TESSERA_W);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(target / TESSERA_W);
  const [flippedState, setFlippedState] = useState(false);
  const [slow, setSlow] = useState(false);
  const [glint, setGlint] = useState(0);
  const userTouched = useRef(false);
  const controlled = flippedProp !== undefined;
  const flipped = controlled ? flippedProp : flippedState;

  // scala la tessera disegnata a 340×214 sulla larghezza reale del contenitore
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => { const w = el.getBoundingClientRect().width; if (w > 0) setScale(w / TESSERA_W); };
    fit();
    let ro;
    try { ro = new ResizeObserver(fit); ro.observe(el); } catch { window.addEventListener("resize", fit); }
    return () => { if (ro) ro.disconnect(); else window.removeEventListener("resize", fit); };
  }, []);

  // riflesso dorato quando compare un dato per la prima volta (non al primo disegno)
  const seen = useRef(null);
  const milestones = live ? tesseraMilestones(data).join(",") : "";
  useEffect(() => {
    if (!live) return;
    const cur = milestones ? milestones.split(",") : [];
    if (seen.current == null) { seen.current = new Set(cur); return; }
    const fresh = cur.filter((m) => !seen.current.has(m));
    if (fresh.length) {
      fresh.forEach((m) => seen.current.add(m));
      if (!reduced()) setGlint((g) => g + 1);
    }
  }, [live, milestones]);

  // intro: ogni tanto si gira lentamente per mostrare il retro (si ferma se la persona la tocca)
  useEffect(() => {
    if (!autoFlip || controlled || reduced()) return undefined;
    setSlow(true);
    const timers = [];
    const cycle = () => {
      if (userTouched.current) return;
      setFlippedState(true);
      timers.push(setTimeout(() => { if (!userTouched.current) setFlippedState(false); }, 3600));
      timers.push(setTimeout(cycle, 9000));
    };
    timers.push(setTimeout(cycle, 3200));
    return () => timers.forEach(clearTimeout);
  }, [autoFlip, controlled]);

  const toggle = () => {
    userTouched.current = true;
    setSlow(false);
    if (controlled) onFlip?.(!flipped);
    else setFlippedState((f) => !f);
  };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };

  const sheenKey = glintProp !== undefined ? glintProp : glint;
  const label = tesseraA11yText(data, at, sample ? "Tessera d'esempio" : "La tua tessera di House of Creators");
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: sample ? 12 : 0 }}>
      <style>{CSS}</style>
      <div ref={boxRef} style={{ width: `min(${target}px, 100%)`, aspectRatio: `${TESSERA_W} / ${TESSERA_H}`, position: "relative" }}>
        <div
          className={`ht-scene ht-tap${flipped ? " is-flipped" : ""}${slow ? " is-slow" : ""}${glow ? " is-glow" : ""}${reset ? " is-reset" : ""}`}
          role="button" tabIndex={0} aria-pressed={flipped} onClick={toggle} onKeyDown={onKey}
          aria-label={`${label}. ${flipped ? "Tocca per vedere il fronte" : "Tocca per vedere il retro"}.`}
          style={{ position: "absolute", left: 0, top: 0, width: TESSERA_W, height: TESSERA_H, transform: `scale(${scale})`, transformOrigin: "0 0", textAlign: "left" }}>
          <div className="ht-glow" />
          <div className="ht-inner" aria-hidden="true">
            <Front data={data} at={at} sheenKey={sheenKey} />
            {covered ? <Cover /> : <Back data={data} at={at} />}
          </div>
        </div>
      </div>
      {sample && (
        <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, border: "1px solid rgba(217,180,106,.45)", borderRadius: 999, padding: "5px 12px" }}>Esempio</span>
      )}
    </div>
  );
}
