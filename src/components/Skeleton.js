"use client";

// V10.7 — skeleton placeholders to make navigation feel snappy.
// Generic shimmer block + ready-made shapes for hero / cards / rows.
// Flat per DESIGN.md: niente gradient, pulse di opacità su superficie solida.

import { COLORS, CP } from "@/lib/brand";

const BASE = COLORS.charcoal || "#151a22";
const BLOCK = CP.surfaceAlt; // blocco skeleton flat, visibile sia su bg che su surface

export function Shimmer({ width = "100%", height = 16, radius = 6, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: BLOCK,
        animation: "hocShimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function PlayerCardSkeleton({ compact = false }) {
  const w = compact ? 280 : 320;
  const h = compact ? 420 : 480;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 18,
        background: BASE,
        border: `1px solid ${BASE}`,
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.9rem",
        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
      }}
    >
      <Shimmer width="40%" height={14} />
      <Shimmer width="60%" height={42} />
      <Shimmer width="100%" height={compact ? 180 : 220} radius={12} />
      <Shimmer width="80%" height={14} />
      <Shimmer width="50%" height={14} />
    </div>
  );
}

export function XPBarSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Shimmer width={120} height={12} />
        <Shimmer width={60} height={12} />
      </div>
      <Shimmer width="100%" height={10} radius={6} />
    </div>
  );
}

export function CardRowSkeleton({ count = 3, height = 80 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} width="100%" height={height} radius={10} />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6, minWidth = 220, height = 140 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: "0.75rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} width="100%" height={height} radius={10} />
      ))}
    </div>
  );
}

// Inject keyframes once on the client.
if (typeof window !== "undefined" && !document.getElementById("hoc-shimmer-keyframes")) {
  const s = document.createElement("style");
  s.id = "hoc-shimmer-keyframes";
  s.textContent = `@keyframes hocShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`;
  document.head.appendChild(s);
}
