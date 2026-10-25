"use client";

// Stile "Vetro caldo" in PROVA (25/10/2026, scelta di Nicholas dai reel di @code.xr): solo su Casa
// (/admin) e Le mie creator. Non è un tema: ridefinisce le variabili CP sul contenitore, così le
// pagine non cambiano codice; fondo sfumato fatto in CSS (niente foto), vetro sfocato sui riquadri
// e sulle tabelle, riquadri che entrano sfocati e vanno a fuoco. Spegnibile per persona
// (localStorage hoc:vetro = "0"), di base acceso. Con "Riduci movimento" niente entrata.
import { useEffect, useState } from "react";
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
@keyframes vt-in{from{opacity:0;filter:blur(14px);transform:scale(.985)}to{opacity:1;filter:none;transform:none}}
.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:vt-in .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--vt-i,0) * 80ms)}
.hoc-vetro .ds-open{--vt-i:2}.hoc-vetro .hub-tool{--vt-i:4}
@media (prefers-reduced-motion: reduce){.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:none}}
@media (max-width:699px){:root .hoc-vetro .vt-glass,:root .hoc-vetro .ds-hero,:root .hoc-vetro .ds-open{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
`;

export default function VetroScope({ on, children }) {
  if (!on) return children;
  return (
    <div className="hoc-vetro">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

/** Interruttore della prova, da mettere nell'intestazione della pagina. */
export function VetroSwitch({ on, set }) {
  return (
    <button type="button" onClick={() => set(!on)} aria-pressed={on}
      style={{ font: "inherit", fontSize: 12.5, minHeight: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
        border: "1px solid var(--cp-border)", background: on ? "rgba(255,255,255,.6)" : "transparent", color: "var(--cp-textSecondary)" }}>
      {on ? "Stile vetro (prova) · spegni" : "Prova lo stile vetro"}
    </button>
  );
}
