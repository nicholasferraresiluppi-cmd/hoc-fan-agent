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
 *
 * Profondità (03/10/2026, versione "C · materia e luce" scelta da Nicholas dopo il parere
 * "è molto piatta"): MATERIA = trama guilloché + grana (src/lib/tessera-material.js, la
 * stessa del PNG), palma in lamina oro, nome inciso, bordo metallico, chip con i contatti;
 * LUCE = la tessera si inclina seguendo dito/mouse (o il telefono, dove il browser lo
 * concede senza chiedere permessi), il riflesso e l'ombra si spostano. Esempio dell'intro
 * e rivelazione finale ondeggiano piano da sole; la piccola dei capitoli no (si muove solo
 * sotto il dito). Un trascinamento non gira la tessera: solo il tocco secco.
 * Disegnata a 340×214 e scalata sulla larghezza disponibile: identica su ogni schermo.
 */
import { useEffect, useId, useRef, useState } from "react";
import HocPalma, { HOC_PALMA_PATH } from "@/components/HocPalma";
import { guillocheDataUri, GRAIN_DATA_URI, tiltFrom } from "@/lib/tessera-material";
import { tesseraName, tesseraLine, tesseraRows, tesseraMilestones, memberSince } from "@/lib/hr-welcome-card";

export const TESSERA_W = 340;
export const TESSERA_H = 214;
const IVORY = "#f2eee6";
const GOLD = "#d9b46a";
const GREY = "#a7a39b";
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
export const TESSERA_BG = "radial-gradient(140% 100% at 0% 0%, #24211c 0%, #121214 50%, #0b0b0d 100%)";

const CSS = `
.ht-scene{position:relative;perspective:1200px}
.ht-glow{position:absolute;inset:-40px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,180,106,.45),rgba(217,180,106,.12) 55%,transparent 75%);opacity:0;transform:scale(.75);transition:opacity .9s ease .3s,transform 1.1s ease .3s;pointer-events:none;filter:blur(8px)}
.ht-scene.is-glow .ht-glow{opacity:1;transform:none}
.ht-tilt{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.ht-scene.is-live .ht-tilt{transition:transform .08s linear}
.ht-guil{position:absolute;inset:0;background:url("${guillocheDataUri()}") 0 0/100% 100% no-repeat;opacity:.75;pointer-events:none}
.ht-back .ht-guil{opacity:.32}
.ht-grain{position:absolute;inset:0;background-image:url("${GRAIN_DATA_URI}");background-size:160px 160px;mix-blend-mode:overlay;opacity:.16;pointer-events:none}
.ht-spec{position:absolute;inset:-1px;pointer-events:none;background:radial-gradient(260px circle at var(--mx,30%) var(--my,22%),rgba(255,236,196,.17),rgba(255,236,196,.05) 40%,transparent 66%)}
.ht-rim{position:absolute;inset:0;border-radius:16px;pointer-events:none;padding:1px;background:linear-gradient(var(--ang,135deg),rgba(255,230,170,.9),rgba(150,115,55,.38) 30%,rgba(90,70,35,.22) 55%,rgba(255,230,170,.75));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.ht-name{text-shadow:0 1px 0 rgba(0,0,0,.75),0 -1px 0 rgba(255,245,225,.10)}
.ht-foil{filter:drop-shadow(0 1px 0 rgba(0,0,0,.7)) drop-shadow(0 -.5px 0 rgba(255,240,200,.35))}
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
@media (prefers-reduced-motion:reduce){.ht-inner,.ht-glow,.ht-tilt{transition:none}.ht-sheen.is-on{animation:none}}
`;

const faceStyle = {
  background: TESSERA_BG,
  boxShadow: "var(--shx,0px) var(--shy,30px) 60px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,240,210,.14)",
  color: IVORY,
};

/** Trama e grana: sotto il contenuto. */
function Matter() {
  return (<><div className="ht-guil" /><div className="ht-grain" /></>);
}
/** Riflesso che segue la luce e bordo metallico: sopra il contenuto. */
function Light() {
  return (<><div className="ht-spec" /><div className="ht-rim" /></>);
}

/** Palma in lamina oro: il gradiente scorre con l'inclinazione (--foil). */
function FoilPalma({ width }) {
  const id = `htf${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 476 168" width={width} height={(width * 168) / 476} aria-hidden="true" className="ht-foil" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="-120" y1="0" x2="356" y2="168">
          <stop offset="0" stopColor="#f6e3b2" /><stop offset=".35" stopColor="#c9a35d" /><stop offset=".55" stopColor="#8a6c37" /><stop offset=".8" stopColor="#e8cf96" /><stop offset="1" stopColor="#a98446" />
        </linearGradient>
      </defs>
      <path d={HOC_PALMA_PATH} fill={`url(#${id})`} />
    </svg>
  );
}

function Chip() {
  const line = { position: "absolute", background: "rgba(60,45,20,.45)" };
  return (
    <span style={{ position: "absolute", right: 20, bottom: 22, width: 34, height: 26, borderRadius: 5, overflow: "hidden", background: "linear-gradient(var(--ang,135deg),#f3e2b8,#b8975c 45%,#7d6436 70%,#e9d3a0)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.3), 0 1px 1px rgba(0,0,0,.5)" }}>
      <i style={{ ...line, left: 0, right: 0, top: 8, height: 1 }} /><i style={{ ...line, left: 0, right: 0, top: 17, height: 1 }} />
      <i style={{ ...line, top: 0, bottom: 0, left: 11, width: 1 }} /><i style={{ ...line, top: 0, bottom: 0, left: 22, width: 1 }} />
      <i style={{ position: "absolute", left: 9, top: 6, width: 16, height: 14, borderRadius: 3, background: "linear-gradient(135deg,#f0dcae,#b0925a)", boxShadow: "inset 0 0 0 1px rgba(60,45,20,.4)" }} />
    </span>
  );
}

function Front({ data, at, sheenKey }) {
  const name = tesseraName(data);
  const line = tesseraLine(data, at);
  return (
    <div className="ht-face" style={faceStyle}>
      <Matter />
      <div style={{ position: "absolute", left: 20, top: 20, lineHeight: 0 }}><FoilPalma width={78} /></div>
      <div style={{ position: "absolute", right: 20, top: 22, fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD }}>Membro</div>
      <div style={{ position: "absolute", left: 20, right: 70, bottom: 20, display: "grid", gap: 5, minWidth: 0 }}>
        {name
          ? <div className="ht-name" style={{ fontFamily: SERIF, fontSize: name.length > 20 ? 23 : 28, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          : <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 26, lineHeight: 1.05, color: "rgba(242,238,230,.30)" }}>Il tuo nome</div>}
        <div style={{ fontFamily: SANS, fontSize: 11, color: GREY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
      </div>
      <Chip />
      <Light />
      <div key={sheenKey} className={`ht-sheen${sheenKey ? " is-on" : ""}`} />
    </div>
  );
}

function Back({ data, at }) {
  const rows = tesseraRows(data);
  return (
    <div className="ht-face ht-back" style={faceStyle}>
      <Matter />
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
      <Light />
    </div>
  );
}

function Cover() {
  return (
    <div className="ht-face ht-back" style={{ ...faceStyle, display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, rgba(217,180,106,.05) 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, rgba(217,180,106,.05) 0 1px, transparent 1px 12px)" }} />
      <div style={{ position: "relative", display: "grid", justifyItems: "center", gap: 12, color: GOLD }}>
        <FoilPalma width={150} />
        <span style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: "0.26em", textTransform: "uppercase" }}>House of Creators</span>
      </div>
      <Light />
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

  // LUCE: inclinazione col dito/mouse/telefono. Le variabili si scrivono direttamente sullo
  // stile della scena (niente re-render a ogni movimento).
  const sceneRef = useRef(null);
  const dragged = useRef(false);
  const start = useRef(null);
  const userTilt = useRef(false);
  const sway = sample || (!small && !live);
  const applyTilt = (px, py) => {
    const el = sceneRef.current;
    if (!el) return;
    const t = tiltFrom(px, py);
    el.style.setProperty("--rx", `${t.rx}deg`);
    el.style.setProperty("--ry", `${t.ry}deg`);
    el.style.setProperty("--mx", `${t.mx}%`);
    el.style.setProperty("--my", `${t.my}%`);
    el.style.setProperty("--ang", `${135 + (px - 0.5) * 120}deg`);
    el.style.setProperty("--shx", `${-t.ry * 1.4}px`);
    el.style.setProperty("--shy", `${30 + t.rx * 1.2}px`);
  };
  useEffect(() => {
    if (reduced()) { applyTilt(0.35, 0.3); return undefined; }
    applyTilt(0.4, 0.35);
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      if (!userTilt.current) {
        const t = (performance.now() - t0) / 1000;
        applyTilt(0.5 + Math.sin(t * 0.6) * 0.26, 0.5 + Math.cos(t * 0.45) * 0.2);
      }
      raf = requestAnimationFrame(loop);
    };
    if (sway) raf = requestAnimationFrame(loop);
    // telefono inclinato: dove il browser lo concede senza chiedere (Android); su iPhone resta il dito
    const onOrient = (e) => {
      if (e.gamma == null || e.beta == null) return;
      userTilt.current = true;
      applyTilt(0.5 + Math.max(-1, Math.min(1, e.gamma / 30)) / 2, 0.5 + Math.max(-1, Math.min(1, (e.beta - 45) / 30)) / 2);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("deviceorientation", onOrient); };
  }, [sway]);
  const pos = (e) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onPointerDown = (e) => { start.current = [e.clientX, e.clientY]; dragged.current = false; };
  const onPointerMove = (e) => {
    if (reduced()) return;
    if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) dragged.current = true;
    const p = pos(e);
    if (!p) return;
    userTilt.current = true;
    sceneRef.current?.classList.add("is-live");
    applyTilt(p[0], p[1]);
  };
  const onPointerLeave = () => {
    start.current = null;
    sceneRef.current?.classList.remove("is-live");
    if (!sway) applyTilt(0.4, 0.35);
    setTimeout(() => { userTilt.current = false; }, 700);
  };

  const toggle = () => {
    if (dragged.current) { dragged.current = false; return; }
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
          ref={sceneRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerCancel={onPointerLeave} onPointerUp={(e) => { if (e.pointerType !== "mouse") onPointerLeave(); }}
          className={`ht-scene ht-tap${flipped ? " is-flipped" : ""}${slow ? " is-slow" : ""}${glow ? " is-glow" : ""}${reset ? " is-reset" : ""}`}
          role="button" tabIndex={0} aria-pressed={flipped} onClick={toggle} onKeyDown={onKey}
          aria-label={`${label}. ${flipped ? "Tocca per vedere il fronte" : "Tocca per vedere il retro"}.`}
          style={{ position: "absolute", left: 0, top: 0, width: TESSERA_W, height: TESSERA_H, transform: `scale(${scale})`, transformOrigin: "0 0", textAlign: "left", touchAction: "pan-y" }}>
          <div className="ht-glow" />
          <div className="ht-tilt">
            <div className="ht-inner" aria-hidden="true">
              <Front data={data} at={at} sheenKey={sheenKey} />
              {covered ? <Cover /> : <Back data={data} at={at} />}
            </div>
          </div>
        </div>
      </div>
      {sample && (
        <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, border: "1px solid rgba(217,180,106,.45)", borderRadius: 999, padding: "5px 12px" }}>Esempio</span>
      )}
    </div>
  );
}
