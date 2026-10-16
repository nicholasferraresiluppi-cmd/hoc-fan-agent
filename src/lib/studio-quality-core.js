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

export const QC_VERSION = "qc-1";
export const QC_MODEL = "claude-opus-5-5"; // la qualità è la differenza: modello migliore, ~15-20 centesimi a video
// Le voci che l'AI legge sui fotogrammi. L'audio non lo sente (lo misura il controllo tecnico e lo
// ascolta una persona); l'etichetta AI è una scelta di pubblicazione, non si vede nel video.
export const AI_CHECKS = ["volto", "anatomia", "coerenza", "montaggio", "testo", "aggancio"];
// Voci che si spuntano SOLO a mano, anche se l'AI dice ok.
export const HUMAN_ONLY_CHECKS = ["volto", "aggancio", "audio", "etichetta_ai"];
export const QC_MAX_FRAMES = 24;

// Regole tecniche (come ~/.claude/skills/social-creator/scripts/controllo_video.py)
export const TECH_RULES = { minWidth: 720, minSec: 3, maxSec: 90, ratioMin: 1.7, ratioMax: 1.8, freezeSec: 1, blackSec: 0.5 };

/** Tempi dei fotogrammi da far leggere: i primi 2 secondi più fitti (il gancio), poi regolari. */
export function frameTimes(duration, max = QC_MAX_FRAMES) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return [];
  const end = Math.max(0, d - 0.05);
  const hook = [0.1, 0.6, 1.2, 1.9].filter((t) => t < end);
  const rest = Math.max(0, max - hook.length);
  const from = 2.5;
  const out = [...hook];
  if (end > from && rest > 0) {
    const step = (end - from) / Math.max(1, rest - 1);
    for (let i = 0; i < rest; i++) out.push(from + step * i);
  }
  return [...new Set(out.map((t) => Math.round(Math.min(t, end) * 100) / 100))].sort((a, b) => a - b).slice(0, max);
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
