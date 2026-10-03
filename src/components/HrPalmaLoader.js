"use client";

/**
 * Indicatore di caricamento con la palma del logo (modulo HR, 03/10/2026).
 *
 * Al posto degli spinner generici: la palma "respira" (opacità lenta) e un
 * riflesso dorato la attraversa. Il riflesso è un gradiente ritagliato sulla
 * sagoma con una maschera CSS (public/brand/hoc-palma.svg); dove la maschera
 * non è supportata resta solo il respiro (gated da @supports).
 * Con prefers-reduced-motion: palma ferma, nessuna animazione.
 *
 * tone "ivory" (su scuro) | "ink" (dentro un bottone avorio).
 */
import HocPalma from "@/components/HocPalma";

const CSS = `
.hpl{position:relative;display:inline-block;line-height:0}
.hpl-base{animation:hplBreath 2.8s ease-in-out infinite}
.hpl-sheen{display:none}
@supports ((-webkit-mask-image:url("/brand/hoc-palma.svg")) or (mask-image:url("/brand/hoc-palma.svg"))){
  .hpl-sheen{display:block;position:absolute;inset:0;pointer-events:none;
    -webkit-mask:url("/brand/hoc-palma.svg") center/contain no-repeat;mask:url("/brand/hoc-palma.svg") center/contain no-repeat;
    background-size:300% 100%;background-repeat:no-repeat;animation:hplSheen 2.8s cubic-bezier(.45,.05,.35,1) infinite}
}
@keyframes hplBreath{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes hplSheen{0%{background-position:120% 0}60%,100%{background-position:-20% 0}}
@media (prefers-reduced-motion:reduce){.hpl-base,.hpl-sheen{animation:none}.hpl-base{opacity:.85}.hpl-sheen{display:none}}
`;

const TONES = {
  ivory: { color: "#f2eee6", sheen: "linear-gradient(100deg,transparent 38%,rgba(217,180,106,.95) 48%,rgba(255,236,190,1) 50%,rgba(217,180,106,.95) 52%,transparent 62%)" },
  gold: { color: "#d9b46a", sheen: "linear-gradient(100deg,transparent 38%,rgba(255,240,205,.9) 50%,transparent 62%)" },
  ink: { color: "#0b0c10", sheen: "linear-gradient(100deg,transparent 38%,rgba(176,138,69,1) 50%,transparent 62%)" },
};

/**
 * @param width  larghezza della palma in px (l'altezza segue le proporzioni del logo)
 * @param label  testo per i lettori di schermo (e, con showLabel, anche a schermo)
 */
export default function HrPalmaLoader({ width = 96, tone = "ivory", label = "Caricamento", showLabel = false, style }) {
  const t = TONES[tone] || TONES.ivory;
  return (
    <span role="status" aria-live="polite" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 14, ...style }}>
      <style>{CSS}</style>
      <span className="hpl" aria-hidden="true" style={{ width, height: (width * 168) / 476, color: t.color }}>
        <span className="hpl-base" style={{ display: "block" }}><HocPalma width={width} title="" /></span>
        <span className="hpl-sheen" style={{ backgroundImage: t.sheen }} />
      </span>
      {showLabel
        ? <span style={{ fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,238,230,.55)" }}>{label}</span>
        : <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{label}</span>}
    </span>
  );
}
