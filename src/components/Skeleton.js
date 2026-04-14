"use client";

// V10.7 — skeleton placeholders to make navigation feel snappy.
// Generic shimmer block + ready-made shapes for hero / cards / rows.

import { COLORS } from "@/lib/brand";

const BASE = COLORS.charcoal || "#1B1E26";
const HIGHLIGHT = COLORS.graphite || "#111318";

export function Shimmer({ width = "100%", height = 16, radius = 6, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${BASE} 0%, ${HIGHLIGHT} 50%, ${BASE} 100%)`,
        backgroundSize: "200% 100%",
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
        background: `linear-gradient(180deg, ${HIGHLIGHT} 0%, ${BASE} 100%)`,
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
  s.textContent = `@keyframes hocShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(s);
}
