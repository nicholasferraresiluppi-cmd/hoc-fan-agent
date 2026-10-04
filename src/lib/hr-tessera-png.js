/**
 * "Salva la tua tessera" (03/10/2026): disegna la tessera D1 con Canvas 2D.
 * 05/10/2026 (Nicholas: «si salva solo il fronte»): l'immagine salvata ha FRONTE e RETRO
 * uno sotto l'altro (1200×1640), così nella galleria c'è la tessera intera. Prima era un PNG
 * 1080×680 del solo fronte (nessuna libreria, nessuna cattura dello schermo) e lo
 * condivide (telefono: foglio di condivisione → su iPhone "Salva immagine" in Foto)
 * o lo scarica.
 *
 * Solo i dati della tessera: nome, ruolo, "membro da". Niente città. MAI email, telefono,
 * codice fiscale o altro (la funzione riceve i dati del modulo ma ne legge solo
 * quelli, via tesseraName/tesseraLine).
 *
 * Stessa materia della tessera a schermo (03/10/2026, versione C): trama guilloché
 * (stessi tracciati, da tessera-material.js), grana, palma in lamina oro, nome inciso,
 * bordo metallico e chip con i contatti; la luce è fissata in alto a sinistra.
 *
 * Solo browser: importarla lato client (usa document, canvas, navigator).
 */
import { HOC_PALMA_PATH, HOC_PALMA_W } from "@/components/HocPalma";
import { tesseraName, tesseraLine, tesseraRows, memberSince } from "@/lib/hr-welcome-card";
import { guillochePaths } from "@/lib/tessera-material";

export const PNG_W = 1080;
export const PNG_H = 680;
const BASE_W = 340; // misura della tessera a schermo: tutte le quote sotto sono in quella scala

function cssFamily(varName, fallback) {
  try {
    const v = getComputedStyle(document.body).getPropertyValue(varName).trim();
    return v ? `${v}, ${fallback}` : fallback;
  } catch { return fallback; }
}

/** Aspetta i font (con un tetto: se non arrivano si disegna col fallback). */
async function fontsReady(fonts, ms = 1800) {
  const wait = (async () => {
    try {
      if (!document.fonts) return;
      await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));
      await document.fonts.ready;
    } catch { /* fallback */ }
  })();
  await Promise.race([wait, new Promise((r) => setTimeout(r, ms))]);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Testo con spaziatura tra le lettere (ctx.letterSpacing non c'è ovunque). */
function spacedText(ctx, text, x, y, spacing, align = "left") {
  const chars = [...text];
  const total = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let cx = align === "right" ? x - total : x;
  for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
}

function ellipsize(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Disegna la tessera e restituisce il canvas. */
/** Fondo comune alle due facce: radiale, trama guilloché (guil = intensità), grana, luce, bordo. */
function drawMaterial(ctx, s, guil) {
  const R = 16 * s;

  // sfondo (stesso radiale della tessera a schermo) + bordo
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, PNG_W * 1.4);
  g.addColorStop(0, "#24211c"); g.addColorStop(0.5, "#121214"); g.addColorStop(1, "#0b0b0d");
  roundRect(ctx, 0, 0, PNG_W, PNG_H, R);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  roundRect(ctx, 0, 0, PNG_W, PNG_H, R);
  ctx.clip();
  // trama guilloché (gli stessi tracciati della tessera a schermo, scalati)
  try {
    ctx.save();
    ctx.scale(s, s);
    ctx.lineWidth = 0.5;
    for (const p of guillochePaths()) {
      ctx.strokeStyle = `rgba(217,180,106,${(p.alpha * guil).toFixed(3)})`;
      ctx.stroke(new Path2D(p.d));
    }
    ctx.restore();
  } catch { /* Path2D assente: niente trama */ }
  // grana leggera
  try {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 160;
    const tx = tile.getContext("2d");
    const img = tx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    tx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, PNG_W, PNG_H);
    ctx.restore();
  } catch { /* niente grana */ }
  // riflesso della luce in alto a sinistra
  const spec = ctx.createRadialGradient(PNG_W * 0.3, PNG_H * 0.22, 0, PNG_W * 0.3, PNG_H * 0.22, 260 * s);
  spec.addColorStop(0, "rgba(255,236,196,.15)"); spec.addColorStop(0.4, "rgba(255,236,196,.04)"); spec.addColorStop(0.66, "rgba(255,236,196,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, PNG_W, PNG_H);
  // riflesso interno in alto
  ctx.fillStyle = "rgba(255,240,210,.12)";
  ctx.fillRect(0, s, PNG_W, s);
  // un velo di luce diagonale, come sul vetro della tessera
  const sheen = ctx.createLinearGradient(0, 0, PNG_W, PNG_H);
  sheen.addColorStop(0.3, "rgba(255,236,190,0)"); sheen.addColorStop(0.47, "rgba(255,236,190,.06)"); sheen.addColorStop(0.62, "rgba(255,236,190,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, PNG_W, PNG_H);
  ctx.restore();
  roundRect(ctx, s / 2, s / 2, PNG_W - s, PNG_H - s, R - s / 2);
  const rim = ctx.createLinearGradient(0, 0, PNG_W, PNG_H);
  rim.addColorStop(0, "rgba(255,230,170,.9)"); rim.addColorStop(0.3, "rgba(150,115,55,.38)"); rim.addColorStop(0.55, "rgba(90,70,35,.22)"); rim.addColorStop(1, "rgba(255,230,170,.75)");
  ctx.strokeStyle = rim;
  ctx.lineWidth = s;
  ctx.stroke();

}

export async function drawTesseraCanvas(data = {}, at = Date.now()) {
  const serif = cssFamily("--f-display", "'Instrument Serif', Georgia, 'Times New Roman', serif");
  const sans = cssFamily("--f-sans", "Manrope, 'Helvetica Neue', Arial, sans-serif");
  const s = PNG_W / BASE_W;
  await fontsReady([`${Math.round(28 * s)}px ${serif}`, `500 ${Math.round(11 * s)}px ${sans}`]);

  const c = document.createElement("canvas");
  c.width = PNG_W;
  c.height = PNG_H;
  const ctx = c.getContext("2d");
  drawMaterial(ctx, s, 0.75);

  // palma oro in alto a sinistra (78px a misura schermo)
  try {
    const p = new Path2D(HOC_PALMA_PATH);
    ctx.save();
    ctx.translate(20 * s, 20 * s);
    const k = (78 * s) / HOC_PALMA_W;
    ctx.scale(k, k);
    const foil = ctx.createLinearGradient(0, 0, HOC_PALMA_W, 168);
    [[0, "#f6e3b2"], [0.35, "#c9a35d"], [0.55, "#8a6c37"], [0.8, "#e8cf96"], [1, "#a98446"]].forEach(([o, col]) => foil.addColorStop(o, col));
    ctx.translate(0, 1 / k * s); // ombra d'incisione: 1px sotto
    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.fill(p);
    ctx.translate(0, -1 / k * s);
    ctx.fillStyle = foil;
    ctx.fill(p);
    ctx.restore();
  } catch { /* Path2D assente: tessera senza palma, il resto c'è */ }

  // "Membro" in alto a destra
  ctx.fillStyle = "#d9b46a";
  ctx.textBaseline = "top";
  ctx.font = `500 ${9.5 * s}px ${sans}`;
  spacedText(ctx, "MEMBRO", PNG_W - 20 * s, 22 * s, 0.22 * 9.5 * s, "right");

  // chip metallico in basso a destra
  const cx = PNG_W - 20 * s - 34 * s, cy = PNG_H - 22 * s - 26 * s;
  const cg = ctx.createLinearGradient(cx, cy, cx + 34 * s, cy + 26 * s);
  cg.addColorStop(0, "#f3e2b8"); cg.addColorStop(0.45, "#b8975c"); cg.addColorStop(0.7, "#7d6436"); cg.addColorStop(1, "#e9d3a0");
  roundRect(ctx, cx, cy, 34 * s, 26 * s, 5 * s);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.save();
  roundRect(ctx, cx, cy, 34 * s, 26 * s, 5 * s);
  ctx.clip();
  ctx.fillStyle = "rgba(60,45,20,.45)";
  ctx.fillRect(cx, cy + 8 * s, 34 * s, s); ctx.fillRect(cx, cy + 17 * s, 34 * s, s);
  ctx.fillRect(cx + 11 * s, cy, s, 26 * s); ctx.fillRect(cx + 22 * s, cy, s, 26 * s);
  const pad = ctx.createLinearGradient(cx + 9 * s, cy + 6 * s, cx + 25 * s, cy + 20 * s);
  pad.addColorStop(0, "#f0dcae"); pad.addColorStop(1, "#b0925a");
  roundRect(ctx, cx + 9 * s, cy + 6 * s, 16 * s, 14 * s, 3 * s);
  ctx.fillStyle = pad;
  ctx.fill();
  ctx.restore();

  // nome e riga in basso a sinistra
  const maxW = PNG_W - 40 * s - 70 * s;
  const name = tesseraName(data);
  const line = tesseraLine(data, at);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#a7a39b";
  ctx.font = `400 ${11 * s}px ${sans}`;
  const lineY = PNG_H - 20 * s - 2 * s;
  ctx.fillText(ellipsize(ctx, line, maxW), 20 * s, lineY);
  if (name) {
    ctx.font = `400 ${(name.length > 20 ? 23 : 28) * s}px ${serif}`;
    const shown = ellipsize(ctx, name, maxW);
    ctx.fillStyle = "rgba(0,0,0,.75)"; // incisione: ombra sotto, filo di luce sopra
    const nameY = line ? lineY - 18 * s : lineY; // senza riga sotto, il nome scende al suo posto
    ctx.fillText(shown, 20 * s, nameY + s);
    ctx.fillStyle = "rgba(255,245,225,.10)";
    ctx.fillText(shown, 20 * s, nameY - s);
    ctx.fillStyle = "#f2eee6";
    ctx.fillText(shown, 20 * s, nameY);
  }
  return c;
}

/** Retro: intestazione, righe dichiarate (competenze più forti e lingue), come a schermo. */
export async function drawTesseraBackCanvas(data = {}, at = Date.now()) {
  const serif = cssFamily("--f-display", "'Instrument Serif', Georgia, 'Times New Roman', serif");
  const sans = cssFamily("--f-sans", "Manrope, 'Helvetica Neue', Arial, sans-serif");
  const s = PNG_W / BASE_W;
  await fontsReady([`italic ${Math.round(17 * s)}px ${serif}`, `400 ${Math.round(12.5 * s)}px ${sans}`]);
  const c = document.createElement("canvas");
  c.width = PNG_W;
  c.height = PNG_H;
  const ctx = c.getContext("2d");
  drawMaterial(ctx, s, 0.32);
  // intestazione: "House of Creators" a sinistra, piccola palma a destra
  ctx.fillStyle = "#d9b46a";
  ctx.textBaseline = "top";
  ctx.font = `500 ${9.5 * s}px ${sans}`;
  spacedText(ctx, String(memberSince(at)).toUpperCase(), 20 * s, 20 * s, 0.2 * 9.5 * s);
  try {
    const p = new Path2D(HOC_PALMA_PATH);
    ctx.save();
    const k = (30 * s) / HOC_PALMA_W;
    ctx.translate(PNG_W - 20 * s - 30 * s, 16 * s);
    ctx.scale(k, k);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#d9b46a";
    ctx.fill(p);
    ctx.restore();
  } catch { /* niente palma */ }
  const rows = tesseraRows(data);
  const left = 20 * s, right = PNG_W - 20 * s;
  let y = 44 * s;
  ctx.textBaseline = "middle";
  if (!rows.length) {
    ctx.fillStyle = "rgba(242,238,230,.38)";
    ctx.font = `italic 400 ${17 * s}px ${serif}`;
    ctx.fillText("Le tue competenze e le lingue compariranno qui.", left, y + 30 * s);
  }
  const rowH = 25 * s;
  rows.forEach((row, i) => {
    if (i) { ctx.fillStyle = "rgba(217,180,106,.14)"; ctx.fillRect(left, y, right - left, Math.max(1, s / 2)); }
    const mid = y + rowH / 2;
    ctx.font = `400 ${12.5 * s}px ${sans}`;
    let valueW = 0;
    if (row.value) {
      ctx.fillStyle = "#e3cd9c";
      ctx.textAlign = "right";
      ctx.fillText(row.value, right, mid);
      valueW = ctx.measureText(row.value).width + 12 * s;
      ctx.textAlign = "left";
    }
    ctx.fillStyle = "#f2eee6";
    ctx.fillText(ellipsize(ctx, row.label, right - left - valueW), left, mid);
    y += rowH;
  });
  return c;
}

/** Un'immagine sola con fronte e retro, uno sotto l'altro, su fondo scuro. */
export async function drawTesseraSheet(data = {}, at = Date.now()) {
  const [front, back] = await Promise.all([drawTesseraCanvas(data, at), drawTesseraBackCanvas(data, at)]);
  const pad = 60, gap = 60;
  const c = document.createElement("canvas");
  c.width = PNG_W + pad * 2;
  c.height = PNG_H * 2 + pad * 2 + gap;
  const ctx = c.getContext("2d");
  const bg = ctx.createRadialGradient(c.width / 2, 0, 0, c.width / 2, 0, c.height);
  bg.addColorStop(0, "#17161c"); bg.addColorStop(0.55, "#0b0c10"); bg.addColorStop(1, "#0b0c10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  for (const [img, y] of [[front, pad], [back, pad + PNG_H + gap]]) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.drawImage(img, pad, y);
    ctx.restore();
  }
  return c;
}

function fileName(data) {
  const n = tesseraName(data).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `tessera-house-of-creators${n ? `-${n}` : ""}.png`;
}

/**
 * Salva la tessera. Telefono con condivisione di file → foglio di condivisione;
 * altrimenti download. Restituisce "shared" | "downloaded" | "cancelled".
 */
export async function saveTesseraPng(data = {}, at = Date.now()) {
  const canvas = await drawTesseraSheet(data, at);
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Immagine non creata."))), "image/png"));
  const name = fileName(data);
  let coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch { /* */ }
  if (coarse && typeof File === "function" && navigator.share && navigator.canShare) {
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "La mia tessera di House of Creators" });
        return "shared";
      } catch (e) {
        if (e && e.name === "AbortError") return "cancelled";
        // altro errore: si scarica
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
