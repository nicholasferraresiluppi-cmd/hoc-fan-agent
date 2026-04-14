"use client";

/**
 * HOC Pro — Brand lockup
 * Logo HoC (placeholder "H" finché non arriva l'SVG reale) + separatore + wordmark PRO.
 * Props:
 *   variant: "primary" | "inverse" | "mono"
 *   size: "sm" | "md" | "lg"
 */
import { COLORS, FONTS } from "@/lib/brand";

export default function BrandLockup({ variant = "primary", size = "md" }) {
  const scale = size === "sm" ? 0.8 : size === "lg" ? 1.3 : 1;
  const boxSize = 38 * scale;
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
      {/* Logo placeholder: H in un quadrato. Sostituire con <img src="/hoc-logo.svg"/> appena arriva. */}
      <div
        aria-label="House of Creators"
        style={{
          width: boxSize,
          height: boxSize,
          border: `2px solid ${logoColor}`,
          borderRadius: 8 * scale,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: 18 * scale,
          color: logoColor,
          letterSpacing: "-0.04em",
        }}
      >
        H
      </div>
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
