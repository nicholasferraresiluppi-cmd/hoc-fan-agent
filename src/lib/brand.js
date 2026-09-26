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

// Caratteri come variabili: lo stile v3 ("Notte/Carta", anteprima 26/09) passa a
// Jost + Cormorant Garamond ("Couture") senza toccare le pagine; lo stile attuale resta Inter.
export const FONTS = {
  display: "var(--cp-font)",
  body: "var(--cp-font)",
  mono: "var(--cp-mono)",
  signature: "var(--cp-sig)",
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
  // Token dello stile v3 (qui valori neutri per lo stile attuale)
  gold: "#d9c29a", goldSoft: "rgba(217,194,154,.10)", track: "#2c3650", neu: "#8c95a8",
  ruleData: "#5d6678", fieldBd: "#2c3650", sel: "rgba(139,124,246,.12)", hover: "rgba(255,255,255,.03)",
  scrim: "rgba(0,0,0,.6)", cool: "#b9aef9", warm: "#4ade80", heroBg: "#151a22",
  tierTop: "#4ade80", tierStrong: "#4ade80",
  // attenzione su PERSONE (da rivedere, cali): nel vecchio stile resta rosso; in Couture il rosso è solo denaro/allarmi
  attn: "#f08c8c",
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
  gold: "#7a5f2c", goldSoft: "rgba(122,95,44,.07)", track: "#c9cdd6", neu: "#434a58",
  ruleData: "#8a92a2", fieldBd: "#c9cdd6", sel: "rgba(99,83,224,.08)", hover: "rgba(20,23,31,.03)",
  scrim: "rgba(20,23,31,.38)", cool: "#4a3bc4", warm: "#17803d", heroBg: "#ffffff",
  tierTop: "#17803d", tierStrong: "#17803d",
  attn: "#c53030",
};

// ── Stile v3 "Notte / Carta" (26/09/2026) ─────────────────────────────────────
// Dalla revisione di 10 esperti sintetici su 3 prototipi (voto medio 6,5 → 7,6).
// In ANTEPRIMA: si attiva con data-style="v3" su <html> (interruttore admin nel
// menu, localStorage hoc:style). Stessi nomi dei token: le pagine non cambiano.
// Rosso SOLO per denaro negativo e allarmi; champagne ("gold") solo per sigillo,
// fascia Eccellente, "Pro" e traguardi (max 2 per schermata).
export const CP_NOTTE = {
  // "Couture" scuro (26/09 sera, scelto dal board tra 22 stili): antracite con velluto,
  // azioni in AVORIO (testo inchiostro), champagne SOLO per il merito (Eccellente,
  // Pro, traguardi). Il viola non c'è più.
  bgSunken: "#090a0f", bg: "#0c0d13", surface: "#13141b", surfaceAlt: "#1d1e27",
  border: "rgba(238,233,223,.11)", borderSoft: "rgba(238,233,223,.07)", borderStrong: "rgba(238,233,223,.18)",
  textPrimary: "#eee9df", textSecondary: "#c7c1b5", textMuted: "#9a958b", mutedIcons: "#76716a",
  accent: "#ece7db", accentInk: "#17140e", accentSoft: "rgba(236,231,219,.10)", accentSoftText: "#eee9df", accentDim: "#4a463f",
  accentGreen: "#a3d4b2", accentRed: "#f0a3a3", accentBlue: "#c7c1b5",
  logoFilter: "brightness(0) invert(1)", dangerSoft: "rgba(240,130,130,.11)",
  gold: "#d6bd8e", goldSoft: "rgba(214,189,142,.09)", track: "#66636b", neu: "#cfc8ba",
  ruleData: "#5b5a62", fieldBd: "#6f6c73", sel: "rgba(236,231,219,.07)", hover: "rgba(255,255,255,.025)",
  scrim: "rgba(4,5,9,.6)", cool: "#a9bfe8", warm: "#a3d4b2",
  heroBg: "linear-gradient(180deg, #181a24, #121319)",
  tierTop: "#d6bd8e", tierStrong: "#eee9df",
  attn: "#eee9df",
};
// Carta: chiaro caldo, stesso mondo dell'attestato; grigi ricalcolati per AA sul
// caldo (--muted #655f54 dalla revisione accessibilità), card staccate dal fondo.
export const CP_CARTA = {
  // "Couture" chiaro (Atelier): crema e carta pesante, azioni in INCHIOSTRO,
  // champagne scuro solo per il merito; grigi a contrasto AA sul caldo.
  bgSunken: "#ede6d8", bg: "#f5f0e6", surface: "#fbf8f1", surfaceAlt: "#f0e9dc",
  border: "#ddd3c1", borderSoft: "#e8e0d1", borderStrong: "#cdc2ad",
  textPrimary: "#2a2521", textSecondary: "#4b433b", textMuted: "#6b6157", mutedIcons: "#8c8272",
  accent: "#2a2521", accentInk: "#fbf8f1", accentSoft: "#ebe4d6", accentSoftText: "#2a2521", accentDim: "#cfc5b2",
  accentGreen: "#1b6b49", accentRed: "#a61e33", accentBlue: "#4b433b",
  logoFilter: "brightness(0)", dangerSoft: "#f8e8e5",
  gold: "#8a6a32", goldSoft: "rgba(138,106,50,.07)", track: "#a39886", neu: "#3e3a33",
  ruleData: "#a39886", fieldBd: "#8c8272", sel: "rgba(42,37,33,.06)", hover: "rgba(40,30,10,.025)",
  scrim: "rgba(28,24,16,.38)", cool: "#2a569f", warm: "#1b6b49", heroBg: "#fcf9f3",
  tierTop: "#8a6a32", tierStrong: "#2a2521",
  attn: "#2a2521",
};

// Menu notte sotto Carta: stesso schema di CP_NOTTE ma col nero CALDO, così il
// menu scuro appartiene al mondo della carta invece di sembrare un'altra app.
export const CP_NOTTE_CALDA = {
  ...CP_NOTTE,
  // menu su Carta: inchiostro caldo, stessa famiglia del chiaro
  bgSunken: "#1f1b17", bg: "#1f1b17", surface: "#28231e", surfaceAlt: "#322c26", heroBg: "#28231e",
  textMuted: "#a8a092", mutedIcons: "#857d70", hover: "rgba(255,245,225,.04)",
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
  const fontOld = `--cp-font:'Inter',system-ui,-apple-system,sans-serif;--cp-mono:'JetBrains Mono',ui-monospace,Menlo,monospace;--cp-sig:Georgia,serif;`;
  const fontV3 = `--cp-font:var(--f-sans),ui-sans-serif,system-ui,-apple-system,sans-serif;--cp-mono:ui-monospace,"SF Mono",Menlo,monospace;--cp-sig:var(--f-display),Georgia,serif;--cp-display:var(--f-display),Georgia,serif;`;
  return `:root{${vars(CP_DARK)}${fontOld}color-scheme:dark}:root[data-theme="light"]{${vars(CP_LIGHT)}color-scheme:light}`
    // stile v3 in anteprima (vince per specificità/ordine sui due temi attuali)
    + `:root[data-style="v3"]{${vars(CP_NOTTE)}${fontV3}color-scheme:dark}`
    + `:root[data-style="v3"][data-theme="light"]{${vars(CP_CARTA)}color-scheme:light}`
    // Menu laterale v3: sempre notte, anche in Carta (dove il nero è CALDO)
    + `:root[data-style="v3"] .hoc-side{${vars(CP_NOTTE)}color-scheme:dark}`
    + `:root[data-style="v3"][data-theme="light"] .hoc-side{${vars(CP_NOTTE_CALDA)}}`
    // Segnaposto sempre tenue: nel tema scuro gli esempi sembravano dati inseriti
    + `::placeholder{color:var(--cp-textMuted);opacity:.65}`;
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
