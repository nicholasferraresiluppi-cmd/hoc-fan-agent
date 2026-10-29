"use client";

// Stile "Vetro caldo" in PROVA (25/10/2026, scelta di Nicholas dai reel di @code.xr): solo su Casa
// (/admin) e Le mie creator. Non è un tema: ridefinisce le variabili CP sul contenitore, così le
// pagine non cambiano codice; fondo sfumato fatto in CSS (niente foto), vetro sfocato sui riquadri
// e sulle tabelle, riquadri che entrano sfocati e vanno a fuoco. Spegnibile per persona
// (localStorage hoc:vetro = "0"), di base acceso. Con "Riduci movimento" niente entrata.
// "Riduci trasparenza" (hoc:vetro:solid): riquadri quasi pieni e niente sfocatura; senza una scelta
// segue l'impostazione di sistema (prefers-reduced-transparency). <VetroNum> fa salire i numeri
// fino al valore alla prima apparizione, solo dentro il vetro acceso (fuori: il testo com'è).
// 26/10/2026: due tinte (hoc:vetro:tinta) — "blu" (vetro bianco su azzurro, accento viola HOC, la
// prima prova del canvas che Nicholas ha scelto: di base) e "caldo" (il vetro sabbia di prima).
// Sempre 26/10: sulle pagine in prova (VETRO_PATHS) AppShell avvolge tutto il guscio, così anche il menu
// a sinistra diventa una lastra di vetro staccata dal bordo, con la voce attiva piena di viola (reel 1).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CP_VETRO, CP_VETRO_BLU } from "@/lib/brand";

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

const TINT_KEY = "hoc:vetro:tinta";

export function useVetroTint() {
  const [tint, setTint] = useState("blu");
  useEffect(() => {
    const read = () => { try { setTint(localStorage.getItem(TINT_KEY) === "caldo" ? "caldo" : "blu"); } catch {} };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  const set = (v) => {
    try { localStorage.setItem(TINT_KEY, v); } catch {}
    setTint(v);
    window.dispatchEvent(new Event(EVT));
  };
  return [tint, set];
}

/** Pagine in prova: qui il vetro avvolge anche il menu e le schede in alto (AppShell). */
export const VETRO_PATHS = ["/admin", "/admin/le-mie-creator", "/admin/bilancio", "/admin/revenue-pacing", "/leaderboard/sales-cp", "/leaderboard/creators", "/admin/hr", "/admin/sales-coaching", "/admin/analisi-vendite", "/admin/publisher-x", "/admin/referral", "/me/porta-un-amico", "/admin/editoriale", "/admin/s4s"];
export const isVetroPath = (p) => VETRO_PATHS.includes(String(p || "").replace(/\/$/, "") || "/");

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

const toVars = (o) => Object.entries(o).map(([k, v]) => `--cp-${k}:${v};`).join("");
// Per tinta: variabili, fondo, ombra del vetro, colore della "cifra" principale, tessere delle icone,
// riquadri quando la trasparenza è ridotta.
const TINTS = {
  caldo: {
    vars: toVars(CP_VETRO),
    bg: "linear-gradient(180deg,rgba(60,38,24,.5) 0,rgba(60,38,24,0) 140px,rgba(255,255,255,0) 70%,rgba(110,80,58,.4) 100%),linear-gradient(90deg,#3a2a20 0%,#6b4a35 7%,#d9c7b4 14%,#eadccc 38%,#c9a888 50%,#ecdfd0 60%,#f1e7db 86%,#7b5a43 94%,#3b2b21 100%)",
    shadow: "0 18px 44px rgba(60,35,15,.16),inset 0 1px 0 rgba(255,255,255,.55)",
    ink: "linear-gradient(160deg,#2c211a,#16100c)",
    tiles: ["#e9c46a", "#14714a", "#1d1510", "#b8573a", "#2d6b6b", "#8a6a4a"],
    solid: "--cp-surface:rgba(251,246,239,.95);--cp-surfaceAlt:#fffaf3;--cp-border:rgba(60,35,15,.12)",
    series: ["#1d1510", "#14714a", "#b8573a", "#2d6b6b", "#8a6a4a", "#a89a8c"],
    darkTiles: [0], lvl1: "rgba(122,79,20,.5)", lvl2: "rgba(158,42,51,.55)",
  },
  blu: {
    vars: toVars(CP_VETRO_BLU),
    // macchie di colore sfocate come nella copertina del reel: azzurro, lilla, acqua
    bg: "radial-gradient(620px 620px at 28% -6%,#c9d8ff 0,rgba(201,216,255,0) 70%),radial-gradient(560px 560px at 104% 38%,#e4dcff 0,rgba(228,220,255,0) 70%),radial-gradient(520px 520px at -4% 96%,#d4f1f4 0,rgba(212,241,244,0) 70%),#eef2f8",
    shadow: "0 10px 40px rgba(40,60,120,.10),inset 0 1px 0 rgba(255,255,255,.9)",
    ink: "linear-gradient(160deg,#7466ee,#4e3fcf)",
    tiles: ["#6353e0", "#2f6bff", "#0f8a8a", "#147a4c", "#e0a33b", "#c2508a"],
    solid: "--cp-surface:rgba(255,255,255,.96);--cp-surfaceAlt:#ffffff;--cp-border:rgba(20,30,60,.10)",
    // serie dei grafici: validate_palette (dataviz) passa lightness, chroma, daltonici e contrasto; ultima = «Altre»
    series: ["#6353e0", "#009b9d", "#c97a10", "#c2508a", "#2f6bff", "#9aa2b5"],
    darkTiles: [4], lvl1: "rgba(224,163,59,.75)", lvl2: "rgba(180,48,61,.55)",
  },
};
// :root davanti = vince sulle regole dello stile Casa ([data-style="v3"] .ds-hero …)
const SEL = [".vt-glass", ".ds-hero", ".ds-open", ".ds-tbl-wrap", ".ds-notice", ".hub-tool"].map((c) => `:root .hoc-vetro ${c}`).join(",");
const cssFor = (t) => {
  const T = TINTS[t];
  const GLASS = `background:var(--cp-surface) !important;border:1px solid var(--cp-border) !important;box-shadow:${T.shadow} !important;backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%)`;
  return `
.hoc-vetro,.hoc-vetro-pop[data-tint="${t}"]{${T.series.map((c, i) => `--vt-c${i === 5 ? "x" : i}:${c};`).join("")}}
.hoc-vetro{${T.vars}color-scheme:light;position:relative;isolation:isolate;min-height:100vh;color:var(--cp-textPrimary);background:${T.bg};background-attachment:fixed}
${SEL}{${GLASS};border-radius:22px !important}
:root .hoc-vetro .hub-tool{border-radius:16px !important}
:root .hoc-vetro .hub-tool:hover{background:var(--cp-surfaceAlt) !important}
:root .hoc-vetro .ds-tbl-wrap .ds-tr > td{background-color:transparent !important}
:root .hoc-vetro .vt-glass[data-lvl="1"]{border-color:${T.lvl1} !important}
:root .hoc-vetro .vt-glass[data-lvl="2"]{border-color:${T.lvl2} !important}
/* Colore = stato (come la pipeline di «rapport»): giallo attenzione, verde bene, rosso da guardare */
:root .hoc-vetro .vt-hero .ds-hero{border-color:transparent !important;--cp-textPrimary:#fff;--cp-textSecondary:rgba(255,255,255,.84);--cp-textMuted:rgba(255,255,255,.74);--cp-border:rgba(255,255,255,.3);--cp-accentGreen:#bdf0d3;--cp-accentRed:#ffc2c2;--cp-attn:#fff;--cp-gold:#f3d58a;--cp-accent:#fff}
:root .hoc-vetro .vt-hero[data-tone="good"] .ds-hero{background:linear-gradient(160deg,#1f8a5b,#11653f) !important}
:root .hoc-vetro .vt-hero[data-tone="ink"] .ds-hero{background:${T.ink} !important}
.hoc-vetro .vt-head{margin:-18px -18px 0;padding:16px 18px;border-radius:21px 21px 0 0}
.hoc-vetro [data-lvl="0"] .vt-head{background:#14714a;--cp-textPrimary:#fff;--cp-textMuted:rgba(255,255,255,.78)}
.hoc-vetro [data-lvl="1"] .vt-head{background:#e9c46a;--cp-textPrimary:#1d1510;--cp-textMuted:rgba(29,21,16,.7)}
.hoc-vetro [data-lvl="2"] .vt-head{background:#b23a3a;--cp-textPrimary:#fff;--cp-textMuted:rgba(255,255,255,.8)}
/* Schede «da fare» piene di colore (come le «Hot deals» di rapport): rosso = critico, inchiostro = da fare, verde = tutto a posto */
.hoc-vetro .vt-hot{display:grid;gap:4px;align-content:start;min-width:0;border-radius:20px;padding:14px 16px;text-decoration:none;color:var(--cp-textPrimary)}
.hoc-vetro .vt-hot[data-lvl="2"]{background:#b23a3a;--cp-textPrimary:#fff;--cp-textSecondary:rgba(255,255,255,.86);--cp-textMuted:rgba(255,255,255,.76)}
.hoc-vetro .vt-hot[data-lvl="ink"]{background:${T.ink};--cp-textPrimary:#fff;--cp-textSecondary:rgba(255,255,255,.84);--cp-textMuted:rgba(255,255,255,.7)}
.hoc-vetro .vt-hot[data-lvl="0"]{background:#14714a;--cp-textPrimary:#fff;--cp-textSecondary:rgba(255,255,255,.86);--cp-textMuted:rgba(255,255,255,.76)}
.hoc-vetro a.vt-hot:hover{filter:brightness(1.06)}
.hoc-vetro .vt-head .vt-pill{background:rgba(255,255,255,.92) !important;border-color:transparent !important}
.hoc-vetro .vt-ico{width:34px;height:34px;border-radius:11px;align-items:center;justify-content:center;margin-top:0 !important}
.hoc-vetro .vt-ico svg{stroke:#fff}
${T.tiles.map((c, i) => `.hoc-vetro .vt-ico[data-tone="${i}"]{background:${c}}`).join("")}
${T.darkTiles.map((i) => `.hoc-vetro .vt-ico[data-tone="${i}"] svg{stroke:#1d1510}`).join("")}
/* menu a sinistra: lastra staccata dal bordo (computer), voce attiva piena d'accento */
:root:not([data-style="v3"]) .hoc-vetro .hoc-desk .hoc-side{top:12px !important;left:12px !important;bottom:12px !important;width:240px !important;border-radius:24px !important;border:1px solid var(--cp-border) !important;background:var(--cp-surface) !important;box-shadow:${T.shadow};backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%)}
@media (min-width:900px){:root:not([data-style="v3"]) .hoc-vetro .hoc-main{margin-left:264px}}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side > div:first-child{padding-left:14px !important;padding-right:10px !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side > div{border-color:var(--cp-borderSoft) !important;background:transparent !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side a{border-radius:12px !important;padding-top:9px !important;padding-bottom:9px !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side a:hover{background:var(--cp-surfaceAlt) !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side a[data-on]{background:var(--cp-accent) !important;color:var(--cp-accentInk) !important;box-shadow:0 6px 18px color-mix(in srgb,var(--cp-accent) 35%,transparent) !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side a[data-on] svg{stroke:var(--cp-accentInk) !important}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side a[data-on] > span[style*="absolute"]{display:none}
:root:not([data-style="v3"]) .hoc-vetro .hoc-side .hoc-grp{font-family:inherit !important;letter-spacing:.02em !important;font-size:11.5px !important;font-weight:500 !important}
:root .hoc-vetro .hoc-mhead-v2{background:var(--cp-surfaceAlt) !important;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.hoc-vetro .vt-row21{display:grid;gap:14px;grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
@media (max-width:999px){.hoc-vetro .vt-row21{grid-template-columns:minmax(0,1fr)}}
@keyframes vt-in{from{opacity:0;filter:blur(14px);transform:scale(.985)}to{opacity:1;filter:none;transform:none}}
.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:vt-in .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--vt-i,0) * 80ms)}
.hoc-vetro .ds-open{--vt-i:2}.hoc-vetro .hub-tool{--vt-i:4}
@media (prefers-reduced-motion: reduce){.hoc-vetro .vt-glass,.hoc-vetro .ds-hero,.hoc-vetro .ds-open,.hoc-vetro .hub-tool{animation:none}}
@media (max-width:699px){:root .hoc-vetro .vt-glass,:root .hoc-vetro .ds-hero,:root .hoc-vetro .ds-open{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
.hoc-vetro[data-solid]{${T.solid}}
${SEL.split(",").map((x) => x.replace(".hoc-vetro", ".hoc-vetro[data-solid]")).join(",")}{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}
`;
};
const CSS = { caldo: cssFor("caldo"), blu: cssFor("blu") };
// finestre aperte sopra la pagina (portal su body: fuori dal contenitore, stesse variabili della tinta)
const POP_CSS = Object.keys(TINTS).map((t) => `.hoc-vetro-pop[data-tint="${t}"]{${TINTS[t].vars}color-scheme:light;color:var(--cp-textPrimary)}`).join("");

export default function VetroScope({ on, stable = false, children }) {
  const [solid] = useVetroSolid();
  const [tint] = useVetroTint();
  const outer = useContext(VetroCtx);
  // stable (guscio dell'app): stessi elementi acceso o spento, così cambiare pagina non rimonta il menu
  if (stable) {
    const live = on && !outer;
    return (
      <div className={live ? "hoc-vetro" : undefined} data-solid={live && solid ? "" : undefined}>
        {live && <style>{CSS[tint] + POP_CSS}</style>}
        <VetroCtx.Provider value={outer || live}>{children}</VetroCtx.Provider>
      </div>
    );
  }
  if (!on || outer) return children; // già dentro un vetro (AppShell avvolge le pagine in prova)
  return (
    <div className="hoc-vetro" data-tint={tint} data-solid={solid ? "" : undefined}>
      <style>{CSS[tint] + POP_CSS}</style>
      <VetroCtx.Provider value={true}>{children}</VetroCtx.Provider>
    </div>
  );
}

/** Interruttore della prova, da mettere nell'intestazione della pagina. */
export function VetroSwitch({ on, set }) {
  const [solid, setSolid] = useVetroSolid();
  const [tint, setTint] = useVetroTint();
  const pill = (active) => ({ font: "inherit", fontSize: 12.5, minHeight: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    border: "1px solid var(--cp-border)", background: active ? "rgba(255,255,255,.6)" : "transparent", color: "var(--cp-textSecondary)" });
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {on && (
        <button type="button" onClick={() => setTint(tint === "blu" ? "caldo" : "blu")} style={pill(false)}>
          {tint === "blu" ? "Vetro bianco · prova il caldo" : "Vetro caldo · prova il bianco"}
        </button>
      )}
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
