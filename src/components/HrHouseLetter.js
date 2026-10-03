"use client";

/**
 * Messaggio della Casa sotto la tessera finale del modulo HR (03/10/2026):
 * due righe in stile lettera, avorio su scuro, firma in corsivo Instrument Serif.
 * Il testo vive in HOUSE_LETTER (lib/hr-form-experience.js): si cambia solo lì.
 */
import { HOUSE_LETTER } from "@/lib/hr-form-experience";

const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";

export default function HrHouseLetter() {
  return (
    <figure className="hrf-letter" style={{ margin: "6px auto 0", maxWidth: 420, width: "100%", boxSizing: "border-box", textAlign: "left", padding: "22px 4px 0", borderTop: "1px solid rgba(217,180,106,.28)" }}>
      <blockquote style={{ margin: 0, fontFamily: SERIF, fontSize: 20, lineHeight: 1.4, color: "rgba(242,238,230,.86)" }}>
        {HOUSE_LETTER.text}
      </blockquote>
      <figcaption style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 24, color: "#f2eee6" }}>— {HOUSE_LETTER.signature}</span>
        <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,238,230,.5)" }}>{HOUSE_LETTER.org}</span>
      </figcaption>
    </figure>
  );
}
