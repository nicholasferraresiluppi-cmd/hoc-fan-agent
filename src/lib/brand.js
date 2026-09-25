/**
 * HOC Pro — Brand design tokens.
 * Single source of truth per palette, tipografia e spacing.
 *
 * Rebrand "Dark SaaS" (giu 2026) — fonte di verità docs/DESIGN.md.
 * I NOMI chiave della palette V9 (obsidian, charcoal, champagne…) restano
 * per retrocompatibilità con i file che li importano, ma i VALORI sono i
 * token del design system: aggiornare qui = aggiornare tutta l'app.
 */

// Nomi legacy (palette V9) → puntano ai token del tema corrente (CSS variables):
// così anche le pagine vecchie seguono chiaro/scuro senza riscriverle.
export const COLORS = {
  obsidian: "var(--cp-bgSunken)",
  graphite: "var(--cp-bg)",
  charcoal: "var(--cp-surface)",
  steel: "var(--cp-border)",
  mist: "var(--cp-textMuted)",
  fog: "var(--cp-textSecondary)",
  alabaster: "var(--cp-textPrimary)",
  champagne: "var(--cp-accent)",
  champagneDeep: "var(--cp-accentDim)",
  champagneLight: "var(--cp-accentSoftText)",
  cobalt: "var(--cp-accentSoftText)",
  cobaltDeep: "var(--cp-accentDim)",
  verdant: "var(--cp-accentGreen)",
  ember: "var(--cp-accentRed)",
  signal: "var(--cp-accentRed)",
};

// Tier leghe — flat per DESIGN.md (niente gradienti): superficie standard,
// identità del tier affidata ad accent (bordo/testo). La chiave si chiama
// ancora `gradient` per retrocompatibilità con i caller (PlayerCard & co.).
export const TIER = {
  bronze: {
    accent: "#C87D46",
    label: "BRONZE",
    gradient: "#151a22",
    text: "#FFE4C2",
    ink: "#2B1709",
  },
  silver: {
    accent: "#DADEE6",
    label: "SILVER",
    gradient: "#151a22",
    text: "#f2f4f8",
    ink: "#15181E",
  },
  gold: {
    accent: "#F2D488",
    label: "GOLD",
    gradient: "#151a22",
    text: "#FFF5D4",
    ink: "#2C1E06",
  },
  platinum: {
    accent: "#BFE4FF",
    label: "PLATINUM",
    gradient: "#151a22",
    text: "#E6F5FF",
    ink: "#081B28",
  },
  diamond: {
    accent: "#A1E3FF",
    label: "DIAMOND",
    gradient: "#151a22",
    text: "#EAF6FF",
    ink: "#060B1F",
  },
  unranked: {
    accent: "#8c95a8",
    label: "UNRANKED",
    gradient: "#151a22",
    text: "#f2f4f8",
    ink: "#0a0d11",
  },
};

export const FONTS = {
  display: "'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
};

export const SPACE = { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };
export const RADIUS = { sm: 6, md: 12, lg: 18 };
export const SHADOW = "0 10px 30px rgba(0,0,0,0.45)";

/**
 * CP-style design tokens (per pagine "creator-first" che replicano
 * l'estetica di CreatorsPro Sales Analytics). Sovrapposti — non sostituiscono
 * i token HOC core: convivono nelle pagine che li scelgono.
 */
export const CP_DARK = {
  // REBRAND "Dark SaaS" (giu 2026) — fonte di verità: docs/DESIGN.md +
  // docs/design-reference.html. Regole: gerarchia per LUMINOSITÀ, UN solo
  // accent (viola) col contagocce, niente nero/bianco puri, flat.
  // I nomi chiave restano per retrocompatibilità: i VALORI sono i token
  // del design system, quindi tutta l'app si aggiorna da qui.

  // Superfici (dal più scuro al più chiaro)
  bgSunken: "#0a0d11",    // sidebar, aree incassate
  bg: "#0c0f14",          // sfondo pagina
  surface: "#151a22",     // card, pannelli, input
  surfaceAlt: "#20283a",  // hover, elemento attivo
  // Bordi
  border: "#232b3a",      // bordo standard card/input
  borderSoft: "#1d2430",  // divider interni, righe tabella
  borderStrong: "#2c3650",// bordo accentuato (legacy)
  // Testo
  textPrimary: "#f2f4f8",
  textSecondary: "#cdd3de",
  textMuted: "#8c95a8",
  mutedIcons: "#5d6678",  // icone inattive
  // Accent — UNO SOLO (viola): azione primaria, attivo, dato corrente
  accent: "#8b7cf6",
  accentInk: "#14101f",      // testo sopra superfici accent
  accentSoft: "#2a2353",     // sfondo badge/chip accent
  accentSoftText: "#b9aef9", // testo su accent-soft
  accentDim: "#3a3470",      // serie non-correnti nei grafici
  // Semantici (solo come segnale, mai superfici grandi)
  accentGreen: "#4ade80", // success — delta positivi, ok
  accentRed: "#f08c8c",   // danger — delta negativi, errori
  accentBlue: "#b9aef9",  // legacy info → accent-soft-text
  // Logo: l'icona è un SVG nero → si rende bianca sullo scuro
  logoFilter: "brightness(0) invert(1)",
  // Avvisi (fondo tenue rosso, testo leggibile in entrambi i temi)
  dangerSoft: "#2a1d1d",
};
// Tema chiaro (25/09/2026): per tabelle dense di numeri il testo scuro su fondo
// chiaro si legge meglio (Piepenbrock et al. 2013); scelto da 4 tester su 5 nel
// pilota Calendario compensi. Stessi nomi, stessa gerarchia per luminosità.
export const CP_LIGHT = {
  bgSunken: "#eceef2", bg: "#f5f6f8", surface: "#ffffff", surfaceAlt: "#eef0f4",
  border: "#dcdfe6", borderSoft: "#eceef2", borderStrong: "#c9cdd6",
  textPrimary: "#14171f", textSecondary: "#434a58", textMuted: "#687183", mutedIcons: "#8a92a2",
  accent: "#6353e0", accentInk: "#ffffff", accentSoft: "#ebe8fd", accentSoftText: "#4a3bc4", accentDim: "#c7c0f5",
  accentGreen: "#17803d", accentRed: "#c53030", accentBlue: "#4a3bc4",
  logoFilter: "brightness(0)", dangerSoft: "#fdecec",
};

// Scala per i DATI (sequenziale, separata dall'accento viola che è per ciò che si
// clicca): chiaro = valore basso. Una tinta, 5 passi, per tema.
export const DATA_SCALE = {
  dark: { fill: ["#16303b", "#1a4a5a", "#1f6a7c", "#2a8da0", "#46b0c0"], text: ["#cfe7ec", "#dff1f4", "#eef8fa", "#ffffff", "#ffffff"] },
  light: { fill: ["#e6f3f6", "#c8e6ee", "#9fd1df", "#6fb6cb", "#3f93ad"], text: ["#14171f", "#14171f", "#14171f", "#0b1a20", "#ffffff"] },
};

// I token che le pagine usano: CSS variables → seguono il tema scelto.
export const CP = Object.fromEntries(Object.keys(CP_DARK).map((k) => [k, `var(--cp-${k})`]));

/** Trasparenza su qualsiasi colore (anche variabili): alpha(CP.accent, "55"). */
export function alpha(color, hex) {
  const pct = Math.round((parseInt(hex, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** CSS dei due temi (iniettato nel <head> da app/layout). */
export function themeCss() {
  const vars = (o) => Object.entries(o).map(([k, v]) => `--cp-${k}:${v};`).join("");
  return `:root{${vars(CP_DARK)}color-scheme:dark}:root[data-theme="light"]{${vars(CP_LIGHT)}color-scheme:light}`;
}


/**
 * Palette di "dot" colorati per creator (replica i pallini distintivi di CP).
 * 16 tinte ben distinguibili — assegnazione deterministica via hash dell'alias
 * cosicché lo stesso creator abbia sempre lo stesso colore in tutte le viste.
 */
export const CREATOR_DOT_PALETTE = [
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#3B82F6", // blue
  "#A855F7", // purple
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#EAB308", // yellow
  "#22C55E", // green
  "#D946EF", // fuchsia
  "#0EA5E9", // sky
  "#F43F5E", // rose
];

export function creatorDotColor(alias) {
  if (!alias) return CP.textMuted;
  const s = String(alias).toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return CREATOR_DOT_PALETTE[hash % CREATOR_DOT_PALETTE.length];
}

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
