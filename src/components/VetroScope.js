"use client";

// Stile "Vetro caldo" in PROVA (25/10/2026, scelta di Nicholas dai reel di @code.xr): solo su Casa
// (/admin) e Le mie creator. Non è un tema: ridefinisce le variabili CP sul contenitore, così le
// pagine non cambiano codice; fondo sfumato fatto in CSS (niente foto), vetro sfocato sui riquadri
// e sulle tabelle, riquadri che entrano sfocati e vanno a fuoco. Spegnibile per persona
// (localStorage hoc:vetro = "0"), di base acceso. Con "Riduci movimento" niente entrata.
// "Riduci trasparenza" (hoc:vetro:solid): riquadri quasi pieni e niente sfocatura; senza una scelta
// segue l'impostazione di sistema (prefers-reduced-transparency). <VetroNum> fa salire i numeri
// fino al valore alla prima apparizione, solo dentro il vetro acceso (fuori: il testo com'è).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CP_VETRO } from "@/lib/brand";

const KEY = "hoc:vetro";
const EVT = "hoc:vetro-change";

export function useVetro() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => { try { setOn(localStorage.getItem(KEY) !== "0"); } catch {} };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  const set = (v) => {
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
    setOn(v);
    window.dispatchEvent(new Event(EVT));
  };
  return [on, set];
}

const SOLID_KEY = "hoc:vetro:solid";

export function useVetroSolid() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const read = () => {
      let v = null;
      try { v = localStorage.getItem(SOLID_KEY); } catch {}
      setSolid(v == null ? Boolean(window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) : v === "1");
    };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  const set = (v) => {
    try { localStorage.setItem(SOLID_KEY, v ? "1" : "0"); } catch {}
    setSolid(v);
    window.dispatchEvent(new Event(EVT));
  };
  return [solid, set];
}

const VetroCtx = createContext(false);
/** true dentro il vetro acceso: per le cose che esistono solo nella prova (es. la scheda che si apre). */
export const useInVetro = () => useContext(VetroCtx);

// "$248.300", "1.210", "62%", "$1.234,50" → prefisso, numero, decimali, suffisso. Altro (—, testo) = com'è.
const NUM_RE = /^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?(\D*)$/;
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Numero che sale fino al valore la prima volta che compare (dentro il vetro acceso). */
export function VetroNum({ value }) {
  const active = useContext(VetroCtx);
  const m = typeof value === "string" ? value.match(NUM_RE) : null;
  const target = m ? Number(m[2].replace(/\./g, "") + (m[3] ? "." + m[3].slice(1) : "")) : null;
  const done = useRef(false);
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!active || target == null || done.current) return;
    done.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf; const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const x = Math.min(1, (now - t0) / dur);
      setShown(target * (1 - Math.pow(1 - x, 3)));
      if (x < 1) raf = requestAnimationFrame(step); else setShown(null);
    };
    setShown(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  if (!m || shown == null) return value;
  const dec = m[3] ? m[3].length - 1 : 0;
  const [int, frac] = shown.toFixed(dec).split(".");
  return `${m[1]}${group(int)}${frac ? "," + frac : ""}${m[4]}`;
}

const vars = Object.entries(CP_VETRO).map(([k, v]) => `--cp-${k}:${v};`).join("");
const GLASS = "background:var(--cp-surface) !important;border:1px solid var(--cp-border) !important;box-shadow:0 18px 44px rgba(60,35,15,.16),inset 0 1px 0 rgba(255,255,255,.55) !important;backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%)";
// :root davanti = vince sulle regole dello stile Casa ([data-style="v3"] .ds-hero …)
const SEL = [".vt-glass", ".ds-hero", ".ds-open", ".ds-tbl-wrap", ".ds-notice", ".hub-tool"].map((c) => `:root .hoc-vetro ${c}`).join(",");
const CSS = `
.hoc-vetro{${vars}color-scheme:light;position:relative;isolation:isolate;min-height:100vh;color:var(--cp-textPrimary);
background:linear-gradient(180deg,rgba(60,38,24,.5) 0,rgba(60,38,24,0) 140px,rgba(255,255,255,0) 70%,rgba(110,80,58,.4) 100%),
linear-gradient(90deg,#3a2a20 0%,#6b4a35 7%,#d9c7b4 14%,#eadccc 38%,#c9a888 50%,#ecdfd0 60%,#f1e7db 86%,#7b5a43 94%,#3b2b21 100%)}
${SEL}{${GLASS};border-radius:22px !important}
:root .hoc-vetro .hub-tool{border-radius:16px !important}
:root .hoc-vetro .hub-tool:hover{background:var(--cp-surfaceAlt) !important}
:root .hoc-vetro .ds-tbl-wrap .ds-tr > td{background-color:transparent !important}
:root .hoc-vetro .vt-glass[data-lvl="1"]{border-color:rgba(122,79,20,.5) !important}
:root .hoc-vetro .vt-glass[data-lvl="2"]{border-color:rgba(158,42,51,.55) !important}
/* Colore = stato (come la pipeline di «rapport»): giallo attenzione, verde bene, rosso da guardare, nero neutro */
:root .hoc-vetro .vt-hero .ds-hero{border-color:transparent !important;--cp-textPrimary:#fff;--cp-textSecondary:rgba(255,255,255,.84);--cp-textMuted:rgba(255,255,255,.74);--cp-border:rgba(255,255,255,.3);--cp-accentGreen:#bdf0d3;--cp-accentRed:#ffc2c2;--cp-attn:#fff;--cp-gold:#f3d58a}
:root .hoc-vetro .vt-hero[data-tone="good"] .ds-hero{background:linear-gradient(160deg,#1f8a5b,#11653f) !important}
:root .hoc-vetro .vt-hero[data-tone="ink"] .ds-hero{background:linear-gradient(160deg,#2c211a,#16100c) !important}
.hoc-vetro .vt-head{margin:-18px -18px 0;padding:16px 18px;border-radius:21px 21px 0 0}
.hoc-vetro [data-lvl="0"] .vt-head{background:#14714a;--cp-textPrimary:#fff;--cp-textMuted:rgba(255,255,255,.78)}
.hoc-vetro [data-lvl="1"] .vt-head{background:#e9c46a;--cp-textMuted:rgba(29,21,16,.7)}
.hoc-vetro [data-lvl="2"] .vt-head{background:#b23a3a;--cp-textPrimary:#fff;--cp-textMuted:rgba(255,255,255,.8)}
.hoc-vetro .vt-head .vt-pill{background:rgba(255,255,255,.92) !important;border-color:transparent !important}
.hoc-vetro .vt-ico{width:34px;height:34px;border-radius:11px;align-items:center;justify-content:center;margin-top:0 !important}
.hoc-vetro .vt-ico svg{stroke:#fff}
.hoc-vetro .vt-ico[data-tone="0"]{background:#e9c46a}.hoc-vetro .vt-ico[data-tone="0"] svg{stroke:#1d1510}
.hoc-vetro .vt-ico[data-tone="1"]{background:#14714a}
.hoc-vetro .vt-ico[data-tone="2"]{background:#1d1510}
.hoc-vetro .vt-ico[data-tone="3"]{background:#b8573a}
.hoc-vetro .vt-ico[data-tone="4"]{background:#2d6b6b}
.hoc-vetro .vt-ico[data-tone="5"]{background:#8a6a4a}
@keyframes vt-in{from{opacity:0;filter:blur(14px);transform:scale(.985)}to{opacity:1;filter:none;transform:none}}
.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:vt-in .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--vt-i,0) * 80ms)}
.hoc-vetro .ds-open{--vt-i:2}.hoc-vetro .hub-tool{--vt-i:4}
@media (prefers-reduced-motion: reduce){.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:none}}
@media (max-width:699px){:root .hoc-vetro .vt-glass,:root .hoc-vetro .ds-hero,:root .hoc-vetro .ds-open{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
/* finestre aperte sopra la pagina (portal su body: fuori dal contenitore, stesse variabili) */
.hoc-vetro-pop{${vars}color-scheme:light;color:var(--cp-textPrimary)}
.hoc-vetro[data-solid]{--cp-surface:rgba(251,246,239,.95);--cp-surfaceAlt:#fffaf3;--cp-border:rgba(60,35,15,.12)}
${SEL.split(",").map((x) => x.replace(".hoc-vetro", ".hoc-vetro[data-solid]")).join(",")}{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}
`;

export default function VetroScope({ on, children }) {
  const [solid] = useVetroSolid();
  if (!on) return children;
  return (
    <div className="hoc-vetro" data-solid={solid ? "" : undefined}>
      <style>{CSS}</style>
      <VetroCtx.Provider value={true}>{children}</VetroCtx.Provider>
    </div>
  );
}

/** Interruttore della prova, da mettere nell'intestazione della pagina. */
export function VetroSwitch({ on, set }) {
  const [solid, setSolid] = useVetroSolid();
  const pill = (active) => ({ font: "inherit", fontSize: 12.5, minHeight: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    border: "1px solid var(--cp-border)", background: active ? "rgba(255,255,255,.6)" : "transparent", color: "var(--cp-textSecondary)" });
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {on && (
        <button type="button" onClick={() => setSolid(!solid)} aria-pressed={solid} style={pill(solid)}>
          {solid ? "Trasparenza ridotta" : "Riduci trasparenza"}
        </button>
      )}
      <button type="button" onClick={() => set(!on)} aria-pressed={on} style={pill(on)}>
        {on ? "Stile vetro (prova) · spegni" : "Prova lo stile vetro"}
      </button>
    </span>
  );
}
