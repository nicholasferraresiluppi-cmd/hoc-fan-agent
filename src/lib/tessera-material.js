/**
 * La "materia" della tessera (03/10/2026, versione C scelta da Nicholas: materia + luce).
 *
 * Logica PURA (niente React, niente DOM): la usano la tessera a schermo (HrTessera, come
 * immagine di sfondo SVG) e il PNG "Salva la tua tessera" (hr-tessera-png, come Path2D),
 * così le due restano identiche.
 *  - guillochePaths: la trama fine da banconota (onde orizzontali + rosetta a destra),
 *    deterministica, disegnata a 340×214 (misura della tessera a schermo);
 *  - guillocheDataUri: la stessa trama come SVG in data URI, calcolata una volta sola;
 *  - GRAIN_DATA_URI: grana leggera (feTurbulence), per tessera e fondo del modulo.
 */
export const MAT_W = 340;
export const MAT_H = 214;

const r1 = (n) => Math.round(n * 10) / 10;

/** [{ d, alpha }] — onde e rosetta. Stessi numeri a ogni chiamata. */
export function guillochePaths(w = MAT_W, h = MAT_H) {
  const out = [];
  for (let k = 0; k < 20; k += 1) {
    let d = "";
    for (let t = 0; t <= w; t += 4) {
      const y = h * 0.12 + k * 8.4 + Math.sin(t / 38 + k * 0.42) * 9 + Math.sin(t / 13 + k) * 1.6;
      d += `${t ? "L" : "M"}${t},${r1(y)}`;
    }
    out.push({ d, alpha: k % 5 === 0 ? 0.15 : 0.075 });
  }
  const cx = w * 0.82, cy = h * 0.34;
  for (let k = 0; k < 26; k += 1) {
    let d = "";
    for (let i = 0; i <= 105; i += 1) {
      const a = (i / 105) * Math.PI * 2;
      const rr = 36 + 10 * Math.sin(a * 9 + k * 0.24);
      const px = cx + Math.cos(a + k * 0.075) * rr;
      const py = cy + Math.sin(a + k * 0.075) * rr * 0.92;
      d += `${i ? "L" : "M"}${r1(px)},${r1(py)}`;
    }
    out.push({ d: `${d}Z`, alpha: 0.045 });
  }
  return out;
}

let cachedUri = null;
/** La trama come immagine (data URI SVG), calcolata una volta. */
export function guillocheDataUri(color = "217,180,106") {
  if (cachedUri) return cachedUri;
  const paths = guillochePaths()
    .map((p) => `<path d="${p.d}" fill="none" stroke="rgba(${color},${p.alpha})" stroke-width=".5"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAT_W} ${MAT_H}" preserveAspectRatio="none">${paths}</svg>`;
  cachedUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return cachedUri;
}

/** Grana: rumore in scala di grigi, da usare con mix-blend-mode overlay e opacità bassa. */
export const GRAIN_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>',
)}`;

/** Inclinazione dalla posizione del dito/mouse (0..1 su ciascun asse) → gradi. */
export function tiltFrom(px, py, maxX = 8, maxY = 10) {
  const cx = Math.min(1, Math.max(0, px)), cy = Math.min(1, Math.max(0, py));
  return { rx: r1((0.5 - cy) * 2 * maxX), ry: r1((cx - 0.5) * 2 * maxY), mx: Math.round(cx * 100), my: Math.round(cy * 100) };
}
