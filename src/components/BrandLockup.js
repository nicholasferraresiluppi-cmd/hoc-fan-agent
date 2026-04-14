"use client";

/**
 * HOC Pro — Brand lockup.
 * Logo HoC (SVG in /public/hoc-logo.svg, currentColor) + separatore + wordmark PRO.
 * Varianti:
 *   primary  — logo bianco + PRO champagne su scuro
 *   inverse  — logo nero + PRO champagne-deep su chiaro
 *   mono     — tutto champagne
 */
import { COLORS, FONTS } from "@/lib/brand";

export default function BrandLockup({ variant = "primary", size = "md" }) {
  const scale = size === "sm" ? 0.75 : size === "lg" ? 1.3 : 1;
  const logoHeight = 38 * scale;
  const proSize = 22 * scale;
  const gap = 14 * scale;

  let logoColor = COLORS.alabaster;
  let proColor = COLORS.champagne;
  let sepColor = COLORS.champagne;
  if (variant === "inverse") {
    logoColor = COLORS.obsidian;
    proColor = COLORS.champagneDeep;
    sepColor = COLORS.champagneDeep;
  } else if (variant === "mono") {
    logoColor = COLORS.champagne;
    proColor = COLORS.champagne;
    sepColor = COLORS.champagne;
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap }}>
      <img
        src="/hoc-logo.svg"
        alt="House of Creators"
        style={{
          height: logoHeight,
          width: "auto",
          // L'SVG usa currentColor, ma <img> non lo rispetta.
          // Forziamo il colore con filter: per bianco usiamo invert/bright, per champagne un tint.
          filter:
            variant === "inverse"
              ? "none" // logo nero nativo
              : variant === "mono"
              ? "brightness(0) saturate(100%) invert(79%) sepia(18%) saturate(664%) hue-rotate(354deg) brightness(92%) contrast(88%)"
              : "brightness(0) invert(1)", // white
          display: "block",
        }}
      />
      <div style={{ width: 1, height: 32 * scale, background: sepColor, opacity: 0.6 }} />
      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: proSize,
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
