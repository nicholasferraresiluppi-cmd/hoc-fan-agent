// Modelle salary — logica pura (26/11/2026). Trasforma i task della lista ClickUp «Candidate» in righe
// «dove sono le modelle». Niente I/O: testata in tests/salary-modelle.mjs.
//
// Fonte unica = la card ClickUp. Il nome del task è «<annuncio> · <paese>, <età> · <marketplace>»
// (es. «Nexus 1451 · Argentina, 18 · Nexus»); i dati della modella sono in una tabella markdown nella
// descrizione (| Età | 18 |). Se la forma cambia, si mostra quello che c'è, senza inventare.

import { STEPS, DISCARDED_STATUS } from "./salary-manuale.js";

const norm = (s) => String(s || "").trim().toLowerCase();

/** Indice del passo (0-6) per lo stato ClickUp; -1 se scartata; null se lo stato non è del percorso. */
export function stepIndex(status) {
  const s = norm(status);
  if (s === DISCARDED_STATUS) return -1;
  const i = STEPS.findIndex((st) => st.status === s);
  return i >= 0 ? i : null;
}

/** Righe `| chiave | valore |` della descrizione markdown → { chiave: valore }. Salta intestazioni vuote e separatori. */
export function parseInfoTable(md) {
  const out = {};
  for (const line of String(md || "").split("\n")) {
    const m = line.match(/^\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!k || !v || /^-+$/.test(k.replace(/\s/g, "")) || /^-+$/.test(v.replace(/\s/g, ""))) continue;
    out[k.replace(/\*\*/g, "")] = v.replace(/\*\*/g, "");
  }
  return out;
}

/** «Nexus 1451 · Argentina, 18 · Nexus» → { label: "Nexus 1451", place: "Argentina, 18", source: "Nexus" }. */
export function splitTaskName(name) {
  const parts = String(name || "").split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { label: parts[0], place: parts.slice(1, -1).join(" · "), source: parts[parts.length - 1] };
  if (parts.length === 2) return { label: parts[0], place: parts[1], source: null };
  return { label: parts[0] || "Senza nome", place: null, source: null };
}

// Quali righe della tabella mostrare nella scheda, in quest'ordine. Le altre (costo del passaggio,
// salary chiesta dall'annuncio) restano sulla card: qui servono a lavorare, non a trattare.
export const INFO_KEYS = ["Età", "Paese", "Tempo al giorno", "Inglese", "Contenuti", "Telefono", "Social"];

/** Testo di un commento ClickUp → prima riga leggibile, accorciata. */
export function commentLine(text, max = 220) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/**
 * Task ClickUp (+ ultimo commento opzionale) → modella per la pagina.
 * `comment` = { text, date (ms), by } o null.
 */
export function toModel(task, comment = null) {
  const info = parseInfoTable(task?.markdown_description || task?.description || "");
  const name = splitTaskName(task?.name);
  const idx = stepIndex(task?.status?.status ?? task?.status);
  const shown = INFO_KEYS.filter((k) => info[k]).map((k) => [k, info[k]]);
  return {
    id: String(task?.id || ""),
    url: task?.url || (task?.id ? `https://app.clickup.com/t/${task.id}` : null),
    label: name.label,
    place: name.place,
    source: name.source,
    status: norm(task?.status?.status ?? task?.status),
    step: idx, // 0-6, -1 scartata, null fuori percorso
    info: shown,
    assignees: (task?.assignees || []).map((a) => a.username || a.email).filter(Boolean),
    createdAt: Number(task?.date_created) || null,
    updatedAt: Number(task?.date_updated) || null,
    last: comment && comment.text ? { text: commentLine(comment.text), date: Number(comment.date) || null, by: comment.by || null } : null,
  };
}

/** Modelle in ordine: le più avanti nel percorso prima, a parità le aggiornate di recente. Scartate e fuori percorso in fondo. */
export function sortModels(models) {
  const rank = (m) => (m.step == null ? -2 : m.step);
  return [...models].sort((a, b) => rank(b) - rank(a) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Quante modelle per passo (0-6) + scartate + fuori percorso. */
export function countByStep(models) {
  const steps = STEPS.map(() => 0);
  let discarded = 0, other = 0;
  for (const m of models) {
    if (m.step === -1) discarded++;
    else if (m.step == null) other++;
    else steps[m.step]++;
  }
  return { steps, discarded, other, active: steps.reduce((s, n) => s + n, 0) };
}
