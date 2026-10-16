// Studio social — agente qualità del video (logica pura, 16/10/2026).
//
// Divisione del lavoro (decisione di Nicholas, 16/10): l'AI fa il PRIMO passaggio e segnala, una
// PERSONA dà l'ok finale. Quindi:
//  - il CONTROLLO TECNICO è misurato (nel browser, sul file vero): formato, durata, audio, nero,
//    fermi immagine → l'esito lo scrive il codice, non l'AI (stesse regole di controllo_video.py);
//  - la QUALITÀ la legge l'AI sui fotogrammi + le foto di riferimento: per ogni voce «ok / dubbio /
//    errore» col secondo del video. Le voci «ok» si spuntano da sole, TRANNE quelle che restano
//    sempre a una persona (è lei identica; i primi 2 secondi fermano il pollice; audio ascoltato;
//    etichetta AI): sul volto l'AI non è affidabile. L'esito della Qualità NON lo mette mai l'agente: lo mette chi approva.

export const QC_VERSION = "qc-2";
export const QC_MODEL = "claude-opus-5-5"; // la qualità è la differenza: modello migliore, ~15-20 centesimi a video
// Le voci che l'AI legge sui fotogrammi. L'audio non lo sente (lo misura il controllo tecnico e lo
// ascolta una persona); l'etichetta AI è una scelta di pubblicazione, non si vede nel video.
export const AI_CHECKS = ["volto", "anatomia", "coerenza", "montaggio", "testo", "aggancio"];
// Voci che si spuntano SOLO a mano, anche se l'AI dice ok.
export const HUMAN_ONLY_CHECKS = ["volto", "aggancio", "audio", "etichetta_ai"];
// Fotogrammi (v qc-2, 16/10 sera — Nicholas: «valuta se i fotogrammi sono abbastanza»): non più 24 fissi
// (su un reel di 40 s = uno ogni 1,6 s: un difetto AI che dura pochi fotogrammi passava in mezzo) ma
// una FREQUENZA: ogni 0,5 s sulle riprese vere, ogni 0,33 s se ci sono parti AI (lì nascono mani e
// lineamenti che si deformano), più fitti nei primi 2 s, e uno subito prima/dopo ogni taglio (dove
// nascono gli errori di coerenza). Risoluzione piena per l'AI (lato lungo ~1540 px, il massimo che legge).
// I fotogrammi restano CAMPIONI: tra due campioni non si vede nulla, e chi approva guarda il video intero.
export const QC_MAX_FRAMES = 120;

// Regole tecniche (come ~/.claude/skills/social-creator/scripts/controllo_video.py)
export const TECH_RULES = { minWidth: 720, minSec: 3, maxSec: 90, ratioMin: 1.7, ratioMax: 1.8, freezeSec: 1, blackSec: 0.5 };
export const QC_STEP = { real: 0.5, ai: 0.33 };
export const QC_FRAMES_PER_CALL = 20;
const PER_FRAME_TOKENS = 1800;  // immagine ~860×1540 ≈ larghezza×altezza/750
const PER_REF_TOKENS = 1600;

/** Tempi dei fotogrammi: gancio fitto, passo regolare, prima/dopo ogni taglio. */
export function frameTimes(duration, { ai = false, cuts = [], max = QC_MAX_FRAMES } = {}) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return [];
  const end = Math.max(0, d - 0.05);
  const out = [0.1, 0.4, 0.7, 1.0, 1.3, 1.6, 1.9].filter((t) => t < end);
  const step = ai ? QC_STEP.ai : QC_STEP.real;
  for (let t = 2.2; t < end; t += step) out.push(t);
  out.push(end);
  const r2 = (t) => Math.round(Math.max(0, Math.min(t, end)) * 100) / 100;
  const cutFrames = [];
  for (const c of cuts || []) { if (c > 0.15) cutFrames.push(r2(c - 0.12)); if (c + 0.12 < end) cutFrames.push(r2(c + 0.12)); }
  // due tempi a meno di 0,08 s sono lo stesso fotogramma: vince quello accanto al taglio
  const grid = [...new Set(out.map(r2))].filter((t) => !cutFrames.some((c) => Math.abs(c - t) < 0.08));
  let ts = [...new Set([...grid, ...cutFrames])].sort((a, b) => a - b);
  ts = ts.filter((t, i) => i === 0 || t - ts[i - 1] >= 0.08 || cutFrames.includes(t));
  if (ts.length <= max) return ts;
  // oltre il massimo: si tengono gancio e tagli, si dirada il resto in modo uniforme
  const keep = new Set(ts.filter((t) => t < 2 || (cuts || []).some((c) => Math.abs(c - t) < 0.2)));
  const rest = ts.filter((t) => !keep.has(t));
  const room = Math.max(0, max - keep.size);
  const picked = rest.filter((_, i) => Math.floor((i * room) / rest.length) !== Math.floor(((i - 1) * room) / rest.length));
  return [...keep, ...picked].sort((a, b) => a - b).slice(0, max);
}

/** Tagli di scena dalle differenze tra miniature consecutive (media assoluta di luminanza 0-255). */
export function detectCuts(diffs, threshold = 28) {
  const out = [];
  for (const x of diffs || []) if (x.diff >= threshold && !out.some((c) => Math.abs(c - x.t) < 0.4)) out.push(x.t);
  return out;
}

/** Stima del costo prima di partire (dollari): fotogrammi + riferimenti ripetuti in ogni chiamata. */
export function estimateQcCost(nFrames, nRefs, price = { in: 4, out: 20 }) {
  const calls = Math.max(1, Math.ceil(nFrames / QC_FRAMES_PER_CALL));
  const input = nFrames * PER_FRAME_TOKENS + calls * (nRefs * PER_REF_TOKENS + 2500);
  const output = calls * 1500;
  return (input * price.in + output * price.out) / 1e6;
}

/** Unisce le risposte delle chiamate: per voce vince la peggiore (errore > dubbio > ok). */
export function mergeAnswers(answers, checkKeys) {
  const rank = { ok: 0, dubbio: 1, errore: 2 };
  const voci = {};
  for (const k of checkKeys) {
    const parts = answers.map((a) => a?.voci?.[k]).filter(Boolean);
    if (!parts.length) { voci[k] = { esito: "dubbio", nota: "", secondi: [] }; continue; }
    const worst = parts.reduce((w, p) => (rank[p.esito] > rank[w.esito] ? p : w), parts[0]);
    const notes = [...new Set(parts.filter((p) => p.esito !== "ok" && p.nota).map((p) => p.nota))];
    const secondi = [...new Set(parts.flatMap((p) => (p.esito !== "ok" ? p.secondi || [] : [])))].sort((a, b) => a - b).slice(0, 12);
    voci[k] = { esito: worst.esito, nota: (notes.join(" · ") || worst.nota || "").slice(0, 700), secondi };
  }
  const withErrors = answers.filter((a) => Object.values(a?.voci || {}).some((v) => v.esito !== "ok"));
  const sintesi = [...new Set((withErrors.length ? withErrors : answers).map((a) => a?.sintesi).filter(Boolean))].slice(0, 3).join(" ").slice(0, 900);
  const testo_letto = answers.map((a) => a?.testo_letto).filter(Boolean).join("\n").slice(0, 3000);
  return { voci, sintesi, testo_letto };
}

/** Intervalli [from,to] dove una serie (t, valore booleano) resta vera per almeno minSec. */
export function runsOver(samples, minSec, { endGrace = 0 } = {}) {
  const out = [];
  let start = null;
  let last = null;
  for (const s of samples || []) {
    if (s.on && start == null) start = s.t;
    if (!s.on && start != null) { if (last - start >= minSec) out.push({ from: start, to: last }); start = null; }
    last = s.t;
  }
  if (start != null && last - start >= minSec) out.push({ from: start, to: last });
  // il nero nell'ultimo mezzo secondo (dissolvenza finale) non conta
  return endGrace ? out.filter((r) => !(last - r.to <= endGrace && r.to - r.from < 1.5)) : out;
}

/** Esito del controllo tecnico dai numeri misurati nel browser. */
export function technicalVerdict(tech) {
  const problems = [];
  const warnings = [];
  const R = TECH_RULES;
  if (!tech || !Number.isFinite(tech.duration)) return { outcome: "blocca", problems: ["Il video non si legge"], warnings };
  const ratio = tech.width ? tech.height / tech.width : 0;
  if (ratio < R.ratioMin || ratio > R.ratioMax) problems.push(`Non è verticale 9:16 (${tech.width}×${tech.height})`);
  if (tech.width < R.minWidth) problems.push(`Risoluzione bassa: ${tech.width} px di larghezza (servono almeno ${R.minWidth})`);
  if (tech.duration < R.minSec || tech.duration > R.maxSec) problems.push(`Durata ${tech.duration.toFixed(1)} s (tra ${R.minSec} e ${R.maxSec})`);
  if (!tech.audio?.present) problems.push("Nessun audio");
  else {
    if (tech.audio.peakDb >= -0.1) warnings.push("Audio che satura (picco a 0 dB): può gracchiare");
    if (tech.audio.rmsDb < -35) warnings.push(`Audio molto basso (${Math.round(tech.audio.rmsDb)} dB in media)`);
  }
  for (const r of tech.freeze || []) problems.push(`Fermo immagine da ${fmtSec(r.from)} a ${fmtSec(r.to)}`);
  for (const r of tech.black || []) problems.push(`Schermo nero da ${fmtSec(r.from)} a ${fmtSec(r.to)}`);
  return { outcome: problems.length ? "blocca" : warnings.length ? "attenzione" : "ok", problems, warnings };
}

export const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${s % 1 >= 0.05 ? `.${Math.round((s % 1) * 10)}` : ""}`;

// ── Risposta dell'AI ────────────────────────────────────────────────────────
export const QC_ESITI = ["ok", "dubbio", "errore"];

/** Schema JSON che l'AI deve rispettare (una voce per check di qualità). */
export function qcSchema(checkKeys) {
  const voce = {
    type: "object", additionalProperties: false,
    required: ["esito", "nota", "secondi"],
    properties: {
      esito: { type: "string", enum: QC_ESITI },
      nota: { type: "string" },
      secondi: { type: "array", items: { type: "number" } },
    },
  };
  return {
    type: "object", additionalProperties: false,
    required: ["voci", "testo_letto", "sintesi"],
    properties: {
      voci: { type: "object", additionalProperties: false, required: checkKeys, properties: Object.fromEntries(checkKeys.map((k) => [k, voce])) },
      testo_letto: { type: "string" },
      sintesi: { type: "string" },
    },
  };
}

/** Ripulisce la risposta dell'AI: solo voci note, esiti validi, secondi dentro il video. */
export function normalizeAgentAnswer(raw, checkKeys, duration) {
  const voci = {};
  for (const k of checkKeys) {
    const v = raw?.voci?.[k];
    const esito = QC_ESITI.includes(v?.esito) ? v.esito : "dubbio"; // risposta mancante = da guardare, mai ok
    const secondi = (Array.isArray(v?.secondi) ? v.secondi : []).map(Number).filter((s) => Number.isFinite(s) && s >= 0 && s <= (duration || 1e9) + 0.5).slice(0, 8);
    voci[k] = { esito, nota: String(v?.nota || "").slice(0, 400), secondi };
  }
  return { voci, testo_letto: String(raw?.testo_letto || "").slice(0, 1500), sintesi: String(raw?.sintesi || "").slice(0, 600) };
}

/**
 * Applica l'esito dell'agente alle revisioni del contenuto:
 *  - Controllo tecnico: esito misurato, nota con i problemi;
 *  - Qualità: spunta le voci «ok» (mai quelle solo-umane), toglie le spunte delle voci in dubbio/errore,
 *    NON tocca l'esito (lo dà una persona). Una voce già spuntata da una persona resta solo se l'AI
 *    non ci ha trovato un errore.
 */
export function applyAgentToReviews(reviews, { tech, answer }, checkKeys, at = Date.now()) {
  const out = { ...(reviews || {}) };
  const tv = technicalVerdict(tech);
  out.tecnico = { outcome: tv.outcome, note: ["Agente:", ...(tv.problems.length ? tv.problems : ["nessun problema"]), ...tv.warnings].join(" ").slice(0, 600), at };
  const prevQ = out.qualita || {};
  const had = new Set(prevQ.checks || []);
  const checks = new Set();
  for (const k of checkKeys) {
    const esito = answer?.voci?.[k]?.esito;
    if (HUMAN_ONLY_CHECKS.includes(k)) { if (had.has(k) && esito !== "errore") checks.add(k); continue; }
    if (esito === "ok") checks.add(k);
    else if (had.has(k) && esito === "dubbio") checks.add(k); // una persona l'aveva già vista: il dubbio non la toglie
  }
  const problems = checkKeys.filter((k) => answer?.voci?.[k]?.esito === "errore");
  out.qualita = { ...prevQ, checks: [...checks] };
  // un errore trovato rimette la qualità a «non ancora»: chi approvava deve riguardare
  if (problems.length && prevQ.outcome === "ok") delete out.qualita.outcome;
  return { reviews: out, technical: tv, errors: problems };
}
