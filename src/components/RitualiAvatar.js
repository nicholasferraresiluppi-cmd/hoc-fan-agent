"use client";

import { CP } from "@/lib/brand";

/**
 * RitualiAvatar — avatar umano a "trait accretion" (SVG parametrico). CRAWL v1.
 * docs/RITUALI_PERSONALI.md
 *
 * La crescita è resa SOLO da postura, luce/energia, corporatura (forza) e oggetti
 * (libro/occhiali dalla lettura) — MAI da peso o tono della pelle (guardrail dalla
 * ricerca: critica razziale Fable II, stigma body-image nelle weight app).
 *
 * props:
 *   adherence: 0..100  → postura + aura + anello di progresso
 *   traits: { forza:{level}, vitalita:{level}, lettura:{level} }  (livello 0..4)
 *   size: px (default 220)
 */

// Corpo: da tono spento (v0) all'accent pieno (v4). NON è tono pelle — è "quanta
// energia sprigiona" la figura (luminosità), applicata in modo uniforme.
const BODY_COLORS = ["#3d4356", "#4d5170", "#655f9c", "#8b7cf6", "#a99bff"];

function clampLvl(t) {
  const l = t && typeof t.level === "number" ? t.level : 0;
  return Math.max(0, Math.min(4, l));
}

export default function RitualiAvatar({ adherence = 0, traits = {}, size = 220 }) {
  const adh = Math.max(0, Math.min(100, adherence || 0));
  const forza = clampLvl(traits.forza);
  const vitalita = clampLvl(traits.vitalita);
  const lettura = clampLvl(traits.lettura);

  const cx = 120;
  const body = BODY_COLORS[vitalita];
  const hair = "#2b3042";
  const shoulder = 42 + forza * 8;          // forza → corporatura (capacità, non magrezza)
  const armOut = forza >= 2;                // accenno di braccia ai livelli alti
  const glowOpacity = 0.05 + vitalita * 0.055; // vitalità → alone di luce
  const rimOpacity = 0.05 + vitalita * 0.07;   // vitalità → luce di taglio sulla figura
  const auraOpacity = Math.min(0.55, (adh / 100) * 0.62); // costanza → aura
  const tilt = (1 - adh / 100) * 5;         // bassa costanza → figura leggermente curva

  const ringR = 104;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - adh / 100);

  return (
    <svg
      viewBox="0 0 240 264"
      width="100%"
      style={{ maxWidth: size, height: "auto", display: "block" }}
      role="img"
      aria-label={`Avatar personale — costanza ${adh}%`}
    >
      <title>Il mio avatar</title>

      {/* Alone / energia (vitalità) */}
      <ellipse cx={cx} cy={138} rx={98} ry={104} fill={CP.accent} opacity={glowOpacity} />

      {/* Ombra a terra */}
      <ellipse cx={cx} cy={244} rx={44 + forza * 4} ry={9} fill="#000000" opacity={0.28} />

      {/* Anello adherence */}
      <circle cx={cx} cy={130} r={ringR} fill="none" stroke={CP.surfaceAlt} strokeWidth={4} />
      <circle
        cx={cx} cy={130} r={ringR} fill="none" stroke={CP.accent} strokeWidth={4}
        strokeLinecap="round" strokeDasharray={ringC.toFixed(1)} strokeDashoffset={ringOffset.toFixed(1)}
        transform={`rotate(-90 ${cx} 130)`}
      />

      {/* Aura (costanza) */}
      {adh > 5 && (
        <g fill="none" stroke={CP.accentSoftText} strokeLinecap="round" opacity={auraOpacity}>
          <path d={`M82,70 Q${cx},38 158,70`} strokeWidth={2.4} />
          <path d={`M94,60 Q${cx},34 146,60`} strokeWidth={1.6} opacity={0.7} />
        </g>
      )}

      {/* Figura (postura via rotazione attorno alla base) */}
      <g transform={`rotate(${tilt.toFixed(2)} ${cx} 246)`}>
        {/* Accenno di braccia (forza ≥ 2) */}
        {armOut && (
          <>
            <path d={`M${cx - shoulder + 4},196 q-14,6 -16,42`} stroke={body} strokeWidth={13} fill="none" strokeLinecap="round" />
            <path d={`M${cx + shoulder - 4},196 q14,6 16,42`} stroke={body} strokeWidth={13} fill="none" strokeLinecap="round" />
          </>
        )}

        {/* Busto — spalle che si allargano con la forza, rastremate in vita */}
        <path
          d={`M${cx - shoulder},240
              C ${cx - shoulder},196 ${cx - 30},188 ${cx},188
              C ${cx + 30},188 ${cx + shoulder},196 ${cx + shoulder},240 Z`}
          fill={body}
        />
        {/* Collo */}
        <rect x={cx - 9} y={168} width={18} height={26} rx={6} fill={body} />
        {/* Testa (ovale) */}
        <ellipse cx={cx} cy={148} rx={27} ry={29} fill={body} />
        {/* Capelli (calotta) */}
        <path
          d={`M${cx - 27},146
              C ${cx - 28},124 ${cx - 15},116 ${cx},116
              C ${cx + 15},116 ${cx + 28},124 ${cx + 27},146
              C ${cx + 18},134 ${cx - 18},134 ${cx - 27},146 Z`}
          fill={hair}
        />

        {/* Luce di taglio (vitalità) — rim light, non tono pelle */}
        <path
          d={`M${cx - 22},150 C ${cx - 24},132 ${cx - 12},120 ${cx},120`}
          stroke="#ffffff" strokeWidth={4} fill="none" strokeLinecap="round" opacity={rimOpacity}
        />

        {/* Occhiali (lettura ≥ 3) */}
        {lettura >= 3 && (
          <g stroke={CP.textPrimary} strokeWidth={2} fill="none" opacity={0.92}>
            <circle cx={cx - 10} cy={150} r={7} />
            <circle cx={cx + 10} cy={150} r={7} />
            <path d={`M${cx - 3},150 L${cx + 3},150`} />
            <path d={`M${cx - 17},148 L${cx - 24},145`} />
            <path d={`M${cx + 17},148 L${cx + 24},145`} />
          </g>
        )}

        {/* Libro in mano (lettura ≥ 1) */}
        {lettura >= 1 && (
          <g transform={`translate(${cx + shoulder - 16} 210) rotate(-8)`}>
            <rect x={0} y={0} width={28} height={21} rx={2} fill={CP.surface} stroke={CP.accentSoftText} strokeWidth={1.5} />
            <path d="M14,1 L14,20" stroke={CP.accentSoftText} strokeWidth={1.2} />
            <path d="M4,6 H11 M4,10 H11 M17,6 H24 M17,10 H24" stroke={CP.accentSoftText} strokeWidth={0.8} opacity={0.7} />
          </g>
        )}

        {/* Emblema sul petto (vitalità ≥ 2) */}
        {vitalita >= 2 && (
          <path d={`M${cx},206 l5,6 -5,6 -5,-6 z`} fill={CP.accentSoftText} opacity={0.9} />
        )}
      </g>
    </svg>
  );
}
