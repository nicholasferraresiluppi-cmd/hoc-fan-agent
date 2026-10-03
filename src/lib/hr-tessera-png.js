/**
 * "Salva la tua tessera" (03/10/2026): disegna il FRONTE della tessera D1 in un PNG
 * 1080×680 con Canvas 2D (nessuna libreria, nessuna cattura dello schermo) e lo
 * condivide (telefono: foglio di condivisione → su iPhone "Salva immagine" in Foto)
 * o lo scarica.
 *
 * Solo i dati della tessera: nome, ruolo, "membro da". Niente città. MAI email, telefono,
 * codice fiscale o altro (la funzione riceve i dati del modulo ma ne legge solo
 * quelli, via tesseraName/tesseraLine).
 *
 * Solo browser: importarla lato client (usa document, canvas, navigator).
 */
import { HOC_PALMA_PATH, HOC_PALMA_W } from "@/components/HocPalma";
import { tesseraName, tesseraLine } from "@/lib/hr-welcome-card";

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
export async function drawTesseraCanvas(data = {}, at = Date.now()) {
  const serif = cssFamily("--f-display", "'Instrument Serif', Georgia, 'Times New Roman', serif");
  const sans = cssFamily("--f-sans", "Manrope, 'Helvetica Neue', Arial, sans-serif");
  const s = PNG_W / BASE_W;
  await fontsReady([`${Math.round(28 * s)}px ${serif}`, `500 ${Math.round(11 * s)}px ${sans}`]);

  const c = document.createElement("canvas");
  c.width = PNG_W;
  c.height = PNG_H;
  const ctx = c.getContext("2d");
  const R = 16 * s;

  // sfondo + bordo
  const g = ctx.createLinearGradient(0, 0, PNG_W, PNG_H);
  g.addColorStop(0, "#1c1a17"); g.addColorStop(0.45, "#0e0e10"); g.addColorStop(1, "#1a1712");
  roundRect(ctx, 0, 0, PNG_W, PNG_H, R);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  roundRect(ctx, 0, 0, PNG_W, PNG_H, R);
  ctx.clip();
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
  ctx.strokeStyle = "rgba(217,180,106,.55)";
  ctx.lineWidth = s;
  ctx.stroke();

  // palma oro in alto a sinistra (78px a misura schermo)
  try {
    const p = new Path2D(HOC_PALMA_PATH);
    ctx.save();
    ctx.translate(20 * s, 20 * s);
    const k = (78 * s) / HOC_PALMA_W;
    ctx.scale(k, k);
    ctx.fillStyle = "#d9b46a";
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
  cg.addColorStop(0, "#e3cd9c"); cg.addColorStop(1, "#8f7646");
  roundRect(ctx, cx, cy, 34 * s, 26 * s, 5 * s);
  ctx.fillStyle = cg;
  ctx.fill();

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
    ctx.fillStyle = "#f2eee6";
    ctx.font = `400 ${(name.length > 20 ? 23 : 28) * s}px ${serif}`;
    ctx.fillText(ellipsize(ctx, name, maxW), 20 * s, lineY - 18 * s);
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
  const canvas = await drawTesseraCanvas(data, at);
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
