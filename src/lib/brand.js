/**
 * HOC Pro — Brand design tokens.
 * Single source of truth per palette, tipografia e spacing.
 * V9.0 rebrand (apr 2026) — sostituisce HOC_COLORS / ad-hoc colors.
 */

export const COLORS = {
  // Neutri
  obsidian: "#08090F",
  graphite: "#111318",
  charcoal: "#1B1E26",
  steel: "#2A2E39",
  mist: "#6B7080",
  fog: "#B9BDC7",
  alabaster: "#F5F6F8",

  // Accento primario — Champagne
  champagne: "#D4AF7A",
  champagneDeep: "#B89158",
  champagneLight: "#E8D4B0",

  // Data
  cobalt: "#4F8CCB",
  cobaltDeep: "#2A5A8A",

  // Semantici
  verdant: "#3FB97E",
  ember: "#E76F51",
  signal: "#D44545",
};

// Tier leghe — stessa base, accento diverso
export const TIER = {
  bronze:   { accent: "#8A5A3B", label: "BRONZE" },
  silver:   { accent: "#9AA3B0", label: "SILVER" },
  gold:     { accent: "#D4AF7A", label: "GOLD" },
  platinum: { accent: "#A8B8C9", label: "PLATINUM" },
  diamond:  { accent: "#6BA9E0", label: "DIAMOND" },
  unranked: { accent: "#6B7080", label: "UNRANKED" },
};

export const FONTS = {
  display: "'Inter Tight', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
};

export const SPACE = { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };
export const RADIUS = { sm: 6, md: 12, lg: 18 };
export const SHADOW = "0 10px 30px rgba(0,0,0,0.45)";

// Retrocompat: alcuni file vecchi usavano HOC_COLORS — li rimappiamo per non rompere nulla.
export const HOC_COLORS_COMPAT = {
  orange: COLORS.champagne,
  purple: COLORS.cobalt,
  white: COLORS.alabaster,
  gray: COLORS.mist,
  bgDark: COLORS.obsidian,
  bg: COLORS.graphite,
  red: COLORS.signal,
  green: COLORS.verdant,
  yellow: COLORS.ember,
  gold: COLORS.champagne,
};
