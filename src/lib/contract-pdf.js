/**
 * PDF del contratto (10/10/2026) — stessa impaginazione dei contratti firmati finora:
 * logo e intestazione della società su ogni pagina, titolo sottolineato, articoli in
 * grassetto, testo giustificato, firme in fondo su due colonne.
 *
 * Firme: «text tags» di Dropbox Sign scritti in bianco sotto le righe di firma
 * ([sig|req|signer1] = House of Creators, [sig|req|signer2] = la persona). All'invio con
 * `use_text_tags` Dropbox Sign li trasforma nei campi firma e li nasconde. Nell'anteprima
 * non si vedono.
 *
 * pdf-lib si importa in modo dinamico (pesante): entra solo nelle funzioni che lo usano.
 */
import { CONTRACT_LOGO_JPG_BASE64 } from "./contract-logo.js";

const A4 = [595.28, 841.89];
const M = { left: 62, right: 62, top: 36, bottom: 56 };
const SIZE = 10;
const LEAD = 15.5;
export const SIGNER_TAGS = { hoc: "[sig|req|signer1]", person: "[sig|req|signer2]" };

/** Testo compatibile con i font standard (WinAnsi): il resto si sostituisce. */
function winAnsi(s) {
  return String(s)
    .replace(/[●▪■]/g, "•")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7e -ÿ‘’“”–—•…€]/g, (ch) => ({ "Ā": "A", "ā": "a", "ł": "l", "Ł": "L", "ș": "s", "ț": "t", "ğ": "g", "ı": "i" }[ch] || "?"));
}

export async function renderContractPdf(blocks, { title = "Contratto" } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("HOC Pro");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logo = await doc.embedJpg(Buffer.from(CONTRACT_LOGO_JPG_BASE64, "base64"));
  const width = A4[0] - M.left - M.right;
  const black = rgb(0, 0, 0);

  let page, y;
  const header = () => {
    page = doc.addPage(A4);
    const lw = 64, lh = (lw * logo.height) / logo.width;
    page.drawImage(logo, { x: (A4[0] - lw) / 2, y: A4[1] - M.top - lh, width: lw, height: lh });
    let hy = A4[1] - M.top - lh - 9;
    for (const [i, line] of ["H.O.C. Business Unit Superbia Management S.A.", "Tovèda n. 3,", "6535 Roveredo (GR) - Switzerland", "houseofcreators.ch"].entries()) {
      const f = i === 0 || i === 3 ? bold : font;
      const t = winAnsi(line);
      page.drawText(t, { x: (A4[0] - f.widthOfTextAtSize(t, 6.5)) / 2, y: hy, size: 6.5, font: f, color: black });
      hy -= 8;
    }
    y = hy - 18;
  };
  const ensure = (h) => { if (y - h < M.bottom) header(); };

  /** Righe di un paragrafo (a capo per parole). */
  const wrap = (text, f, size, w) => {
    const words = winAnsi(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = [];
    for (const word of words) {
      const test = [...cur, word].join(" ");
      if (cur.length && f.widthOfTextAtSize(test, size) > w) { lines.push(cur); cur = [word]; } else cur.push(word);
    }
    if (cur.length) lines.push(cur);
    return lines;
  };
  const para = (text, { f = font, size = SIZE, indent = 0, align = "justify", underline = false, before = 0, after = 4 } = {}) => {
    y -= before;
    const w = width - indent;
    const lines = wrap(text, f, size, w);
    lines.forEach((words, i) => {
      ensure(LEAD);
      const last = i === lines.length - 1;
      const line = words.join(" ");
      const lineW = f.widthOfTextAtSize(line, size);
      let x = M.left + indent;
      if (align === "center") x = M.left + (width - lineW) / 2;
      if (align === "right") x = M.left + width - lineW;
      if (align === "justify" && !last && words.length > 1) {
        const gap = (w - words.reduce((a, wd) => a + f.widthOfTextAtSize(wd, size), 0)) / (words.length - 1);
        let cx = x;
        for (const wd of words) { page.drawText(wd, { x: cx, y: y - size, size, font: f, color: black }); cx += f.widthOfTextAtSize(wd, size) + gap; }
      } else {
        page.drawText(line, { x, y: y - size, size, font: f, color: black });
      }
      if (underline) page.drawLine({ start: { x, y: y - size - 1.5 }, end: { x: x + lineW, y: y - size - 1.5 }, thickness: 0.6, color: black });
      y -= LEAD;
    });
    y -= after;
  };

  header();
  for (const b of blocks) {
    if (b.t === "title") para(b.x, { f: bold, size: 11, align: "center", underline: true, after: 2 });
    else if (b.t === "center") para(b.x, { f: bold, align: "center", after: 6 });
    else if (b.t === "right") para(b.x, { f: italic, align: "right", after: 6 });
    else if (b.t === "hc") para(b.x, { f: bold, align: "center", underline: true, before: 10, after: 8 });
    else if (b.t === "h") { ensure(LEAD * 3); para(b.x, { f: bold, align: "left", before: 10, after: 2 }); }
    else if (b.t === "li") {
      const m = /^(•|●|-|[a-e]\))\s*(.*)$/.exec(b.x);
      const mark = m ? (m[1] === "●" ? "•" : m[1]) : "•";
      const yTop = y;
      ensure(LEAD);
      page.drawText(winAnsi(mark), { x: M.left + 14, y: (y === yTop ? y : y) - SIZE, size: SIZE, font, color: black });
      para(m ? m[2] : b.x, { indent: 32, after: 2 });
    } else if (b.t === "sign") {
      ensure(110);
      y -= 34;
      const colW = width / 2 - 20;
      const [left, right] = b.x.split("|");
      const cols = [[M.left, left, SIGNER_TAGS.hoc], [M.left + width / 2 + 20, right, SIGNER_TAGS.person]];
      for (const [x, label, tag] of cols) {
        // campo firma (invisibile): Dropbox Sign lo trova e lo sostituisce
        page.drawText(tag, { x: x + 2, y: y + 4, size: 9, font, color: rgb(1, 1, 1) });
        page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.6, color: black });
        const lines = wrap(label, font, 8.5, colW);
        let ly = y - 12;
        for (const words of lines) { const t = words.join(" "); page.drawText(t, { x: x + (colW - font.widthOfTextAtSize(t, 8.5)) / 2, y: ly, size: 8.5, font, color: black }); ly -= 11; }
      }
      y -= 40;
    } else para(b.x);
  }
  return Buffer.from(await doc.save());
}
