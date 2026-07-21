"use client";

import { CP } from "@/lib/brand";

/**
 * RitualiAvatar — avatar umano a "trait accretion" (SVG parametrico, CRAWL v1).
 * docs/RITUALI_PERSONALI.md
 *
 * La crescita è resa SOLO da postura, luce/energia, corporatura (forza) e oggetti
 * (libro/occhiali dalla lettura) — MAI da peso o tono della pelle (guardrail dalla
 * ricerca: critica razziale a Fable II, stigma body-image nelle weight app).
 *
 * props:
 *   adherence: 0..100  → postura + aura + anello di progresso
 *   traits: { forza:{level}, vitalita:{level}, lettura:{level}, ... }  (livello 0..4)
 *   size: px (default 220)
 */

// Luminosità/energia della figura per livello di "vitalità" (NON è tono pelle:
// è quanto la figura "si accende" verso l'accent viola).
const ENERGY_COLORS = ["#454a5c", "#565b78", "#6c66a0", "#8b7cf6", "#a99bff"];

function clampLvl(t) {
  const l = t && typeof t.level === "number" ? t.level : 0;
  return Math.max(0, Math.min(4, l));
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export default function RitualiAvatar({ adherence = 0, traits = {}, size = 220 }) {
  const adh = Math.max(0, Math.min(100, adherence || 0));
  const forza = clampLvl(traits.forza);
  const vitalita = clampLvl(traits.vitalita);
  const lettura = clampLvl(traits.lettura);

  const cx = 110;
  const figureColor = ENERGY_COLORS[vitalita];
  const shoulder = 40 + forza * 8;           // forza → corporatura (capacità, non magrezza)
  const glowOpacity = 0.04 + vitalita * 0.05; // vitalità → luce
  const auraOpacity = Math.min(0.5, (adh / 100) * 0.6); // costanza → aura
  const tilt = (1 - adh / 100) * 6;          // bassa costanza → figura leggermente curva

  // Anello di progresso adherence (attorno alla figura)
  const ringR = 96;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - adh / 100);

  return (
    <svg
      viewBox="0 0 220 240"
      width="100%"
      style={{ maxWidth: size, height: "auto", display: "block" }}
      role="img"
      aria-label={`Avatar personale — costanza ${adh}%`}
    >
      <title>Il mio avatar</title>

      {/* Glow / energia (vitalità) */}
      <ellipse cx={cx} cy={128} rx={92} ry={98} fill={CP.accent} opacity={glowOpacity} />

      {/* Anello adherence */}
      <circle cx={cx} cy={120} r={ringR} fill="none" stroke={CP.surfaceAlt} strokeWidth={5} />
      <circle
        cx={cx} cy={120} r={ringR} fill="none" stroke={CP.accent} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={ringC.toFixed(1)} strokeDashoffset={ringOffset.toFixed(1)}
        transform={`rotate(-90 ${cx} 120)`}
      />

      {/* Aura arcs (costanza complessiva) */}
      {adh > 5 && (
        <g fill="none" stroke={CP.accentSoftText} strokeLinecap="round" opacity={auraOpacity}>
          <path d={`M76,74 Q${cx},44 144,74`} strokeWidth={2.4} />
          <path d={`M86,64 Q${cx},40 134,64`} strokeWidth={1.8} opacity={0.7} />
        </g>
      )}

      {/* Figura (postura via rotazione attorno alla base) */}
      <g transform={`rotate(${tilt.toFixed(2)} ${cx} 214)`}>
        {/* Spalle / busto — la larghezza cresce con la forza */}
        <path
          d={`M${cx - shoulder},214
              C ${cx - shoulder},178 ${cx - 26},176 ${cx},176
              C ${cx + 26},176 ${cx + shoulder},178 ${cx + shoulder},214 Z`}
          fill={figureColor}
        />
        {/* Collo */}
        <rect x={cx - 8} y={158} width={16} height={26} rx={5} fill={figureColor} />
        {/* Testa */}
        <circle cx={cx} cy={140} r={27} fill={figureColor} />
        {/* Highlight sul volto (luce, non tono pelle) */}
        <ellipse cx={cx + 8} cy={132} rx={9} ry={12} fill="#ffffff" opacity={0.06 + vitalita * 0.02} />

        {/* Occhiali (lettura ≥ 3) */}
        {lettura >= 3 && (
          <g stroke={CP.textPrimary} strokeWidth={2} fill="none" opacity={0.9}>
            <circle cx={cx - 10} cy={140} r={7} />
            <circle cx={cx + 10} cy={140} r={7} />
            <path d={`M${cx - 3},140 L${cx + 3},140`} />
            <path d={`M${cx - 17},138 L${cx - 23},135`} />
            <path d={`M${cx + 17},138 L${cx + 23},135`} />
          </g>
        )}

        {/* Libro in mano (lettura ≥ 1) */}
        {lettura >= 1 && (
          <g transform={`translate(${cx + shoulder - 20} 196)`}>
            <rect x={0} y={0} width={26} height={20} rx={2} fill={CP.surface} stroke={CP.accentSoftText} strokeWidth={1.5} />
            <path d="M13,1 L13,19" stroke={CP.accentSoftText} strokeWidth={1.2} />
          </g>
        )}

        {/* Scintilla sul petto (vitalità ≥ 2) */}
        {vitalita >= 2 && (
          <path
            d={`M${cx},192 l4,5 -4,5 -4,-5 z`}
            fill={CP.accentSoftText}
            opacity={0.85}
          />
        )}
      </g>
    </svg>
  );
}
