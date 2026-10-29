"use client";

// Intestazione «stile reel» (29/10/2026, Nicholas: «i nostri strumenti li vedo basic, quello mi
// sembra più chiaro»). Nata sul Radar del clipping, si riusa pagina per pagina:
// una cosa sola in cima — titolo grande con la parola chiave nell'accento, una riga di spiegazione,
// pochi numeri grandi con l'etichetta piccola sopra (salgono all'apertura), un alone di colore.
import { useEffect, useRef, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { NUM } from "@/components/ds";

/** Numero che sale fino al valore all'apertura e quando cambia (6 decimi di secondo). */
export function useCountUp(target) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { from.current = target; setV(target); return; }
    let raf, t0;
    const tick = (t) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / 600);
      const x = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      from.current = x; setV(x);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/** Un numero grande con l'etichetta piccola sopra. `strong` = nell'accento (il numero che conta). */
export function BigNum({ label, value, strong, title }) {
  const v = useCountUp(Number(value) || 0);
  return (
    <div title={title} style={{ minWidth: 72 }}>
      <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.1, color: strong ? CP.accent : CP.textPrimary, ...NUM }}>{v.toLocaleString("it-IT")}</div>
    </div>
  );
}

/**
 * Il riquadro in cima alla pagina. eyebrow = nome dello strumento, title + accent = la frase
 * (accent nel colore d'accento), sub = una riga di spiegazione, numbers = <BigNum>…, actions =
 * pulsanti sotto (al massimo un primario).
 */
export default function HeroHead({ eyebrow, title, accent, sub, numbers, actions, style }) {
  return (
    <div style={{ position: "relative", borderRadius: 20, border: `1px solid ${CP.borderSoft}`, padding: "22px 24px", marginBottom: 16, background: `radial-gradient(ellipse at 18% 0%, ${alpha(CP.accent, "1c")}, transparent 60%), ${CP.surface}`, ...style }}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          {eyebrow && <div style={{ fontSize: 13, color: CP.textMuted }}>{eyebrow}</div>}
          <h2 style={{ margin: "3px 0 6px", fontSize: 28, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.15 }}>{title}{accent && <> <span style={{ color: CP.accent }}>{accent}</span></>}</h2>
          {sub && <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.5, maxWidth: 560 }}>{sub}</p>}
        </div>
        {numbers && <div style={{ display: "flex", gap: "16px 26px", flexWrap: "wrap" }}>{numbers}</div>}
      </div>
      {actions && <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
