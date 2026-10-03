// Simbolo del logo House of Creators (tetto + palma), dal file di Nicholas 03/10/2026.
// Inline per prendere il colore dal contesto (currentColor): avorio, oro, nero.
// Path del simbolo (viewBox 441×168): lo usa anche il disegno della tessera su canvas (Path2D).
export const HOC_PALMA_PATH = "M181.47,58.93l135.57,75.83v.07c.07.07.22.22.29.29,0,0,.15-.07.22-.15l57.64,32.26h65.32l-45.82-25.66v-32.41c17.91,8.7,35.67,17.25,53.5,25.88-3.19-17.62-14.21-33.35-30.09-41.76.07-.14.15-.29.22-.44,18.92-4.42,37.19,4.42,53.79,12.76-8.27-21.02-27.4-38.28-50.82-37.77,0-.14-.15-.29-.22-.44,14.86-14.35,35.89-14.43,55.32-14.72-17.69-12.9-43.86-23.92-63.22-8.99,8.55-19.86,22.69-33.64,42.77-41.47-27.19-8.84-62.71,9.71-71.85,35.52-9.13-25.08-45.09-44.15-71.41-35.23,19.14,7.1,34,22.26,42.48,40.89-.15.07-.22.22-.36.29-19.07-15.51-45.09-2.97-62.86,8.63.07.22.22.51.29.72h10.15c15.73-.44,32.92,3.34,44.66,14.43,0,.14-.15.29-.15.44-17.4-.44-32.7,9.28-42.7,22.98L178.64,20.65.14,167.24h49.37L181.54,58.86l-.07.07ZM368.15,108.74v18.05l-16.75-9.35c5.58-2.9,11.09-5.8,16.75-8.7ZM349.74,93.08c-6.89,3.77-12.62,8.34-17.4,13.63l-17.4-9.71c11.02-4.35,22.33-6.89,34.8-3.91h0Z";
export const HOC_PALMA_W = 441;
export const HOC_PALMA_H = 168;

export default function HocPalma({ width = 120, title = "House of Creators", style, className }) {
  return (
    <svg viewBox="0 0 441 168" width={width} height={(width * 168) / 441} fill="currentColor" role="img" aria-label={title} style={style} className={className}>
      <path d={HOC_PALMA_PATH} />
    </svg>
  );
}
