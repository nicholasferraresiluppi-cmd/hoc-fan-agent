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

// Tier leghe — V10.0: accento + gradient FIFA-style per PlayerCard
// Il gradient è usato come sfondo della card, l'accent come bordo/testo tier.
export const TIER = {
  bronze: {
    accent: "#C87D46",
    label: "BRONZE",
    gradient: "linear-gradient(145deg, #6B3E1F 0%, #A8612F 45%, #D1833D 100%)",
    text: "#FFE4C2",
    ink: "#2B1709",
  },
  silver: {
    accent: "#DADEE6",
    label: "SILVER",
    gradient: "linear-gradient(145deg, #4A4F5B 0%, #8A93A3 45%, #C9D0DC 100%)",
    text: "#FFFFFF",
    ink: "#15181E",
  },
  gold: {
    accent: "#F2D488",
    label: "GOLD",
    gradient: "linear-gradient(145deg, #7A5A1F 0%, #C59436 45%, #F2CC72 100%)",
    text: "#FFF5D4",
    ink: "#2C1E06",
  },
  platinum: {
    accent: "#BFE4FF",
    label: "PLATINUM",
    gradient: "linear-gradient(145deg, #2D5874 0%, #4F93BC 40%, #9FD2EE 100%)",
    text: "#E6F5FF",
    ink: "#081B28",
  },
  diamond: {
    accent: "#A1E3FF",
    label: "DIAMOND",
    gradient: "linear-gradient(145deg, #1B2F5A 0%, #3C5FA8 35%, #7AA9FF 75%, #C9E5FF 100%)",
    text: "#EAF6FF",
    ink: "#060B1F",
  },
  unranked: {
    accent: "#6B7080",
    label: "UNRANKED",
    gradient: "linear-gradient(145deg, #111318 0%, #1B1E26 50%, #2A2E39 100%)",
    text: "#F5F6F8",
    ink: "#08090F",
  },
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
