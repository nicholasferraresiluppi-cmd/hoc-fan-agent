"use client";

/**
 * HOC Pro — Brand lockup.
 * Icona SVG (/public/hoc-logo.svg, solo tetto+palma) + wordmark HTML
 * "House of Creators" + separatore + accent "PRO".
 *
 * Il wordmark è HTML (non SVG <text>) perché i font caricati via CSS della
 * pagina non sono accessibili all'interno di <img src="...svg">, e i font
 * di fallback (Arial Black) rompono il layout del testo.
 *
 * Varianti:
 *   primary  — icona bianca + wordmark bianco + PRO champagne su scuro
 *   inverse  — icona nera + wordmark nero + PRO champagne-deep su chiaro
 *   mono     — tutto champagne
 */
import { COLORS, FONTS } from "@/lib/brand";

export default function BrandLockup({ variant = "primary", size = "md", showWordmark = true }) {
  const scale = size === "sm" ? 0.75 : size === "lg" ? 1.3 : 1;
  const iconHeight = 42 * scale;
  const wordmarkFs = 13 * scale;
  const proFs = 22 * scale;
  const gap = 12 * scale;
  const sepHeight = 32 * scale;

  let iconColor = COLORS.alabaster;
  let wordmarkColor = COLORS.alabaster;
  let proColor = COLORS.champagne;
  let sepColor = COLORS.champagne;
  if (variant === "inverse") {
    iconColor = COLORS.obsidian;
    wordmarkColor = COLORS.obsidian;
    proColor = COLORS.champagneDeep;
    sepColor = COLORS.champagneDeep;
  } else if (variant === "mono") {
    iconColor = COLORS.champagne;
    wordmarkColor = COLORS.champagne;
    proColor = COLORS.champagne;
    sepColor = COLORS.champagne;
  }

  // L'SVG usa currentColor ma <img> non lo rispetta: forziamo via filter.
  const iconFilter =
    variant === "inverse"
      ? "none"
      : variant === "mono"
      ? "brightness(0) saturate(100%) invert(79%) sepia(18%) saturate(664%) hue-rotate(354deg) brightness(92%) contrast(88%)"
      : "brightness(0) invert(1)";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap }}>
      <img
        src="/hoc-logo.svg"
        alt="House of Creators"
        style={{ height: iconHeight, width: "auto", filter: iconFilter, display: "block" }}
      />
      {showWordmark && (
        <div style={{
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: wordmarkFs,
          color: wordmarkColor,
          letterSpacing: "0.08em",
          lineHeight: 1.1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          House <span style={{ fontStyle: "italic", fontWeight: 700, opacity: 0.85 }}>of</span> Creators
        </div>
      )}
      <div style={{ width: 1, height: sepHeight, background: sepColor, opacity: 0.6 }} />
      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: proFs,
          color: proColor,
          letterSpacing: "0.14em",
          lineHeight: 1,
        }}
      >
        PRO
      </div>
    </div>
  );
}
