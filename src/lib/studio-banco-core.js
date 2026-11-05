// Banco montaggi — logica pura (1/11/2026). I video montati stanno in una cartella Drive del profilo:
// si guardano in Regia social, si scelgono, e i pronti si scaricano per pubblicarli.
// Lo stato vive in HOC Pro, il drive resta com'è (stessa regola dell'Editoriale).

export const BANCO_STATES = [
  { key: "da_vedere", label: "Da guardare", hint: "Ancora da giudicare" },
  { key: "scelto", label: "Scelti", hint: "Piacciono: in attesa dell'ultima rifinitura" },
  { key: "pronto", label: "Pronti", hint: "Si scaricano e si pubblicano" },
  { key: "scartato", label: "Scartati", hint: "Non si usano; si possono ripescare" },
];
const KEYS = new Set(BANCO_STATES.map((s) => s.key));

export const isBancoState = (s) => KEYS.has(s);
export const titleOf = (name) => String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "");

/** Unisce i file del drive con le scelte: un file senza scelta è da guardare. */
export function mergeFiles(files = [], marks = {}) {
  return files
    .filter((f) => f?.kind === "video")
    .map((f) => {
      const m = marks[f.id];
      return { ...f, title: titleOf(f.name), state: isBancoState(m?.state) ? m.state : "da_vedere", markedAt: m?.at || null, markedBy: m?.by || null };
    })
    .sort((a, b) => String(a.path).localeCompare(String(b.path), "it") || a.title.localeCompare(b.title, "it", { numeric: true }));
}

/** Quanti per stato, su tutti i file o su una cartella: la somma fa sempre il totale. */
export function bancoCounts(rows = [], path = null) {
  const out = Object.fromEntries(BANCO_STATES.map((s) => [s.key, 0]));
  for (const r of rows) if (path == null || r.path === path) out[isBancoState(r.state) ? r.state : "da_vedere"]++;
  return out;
}

/** Cartelle con almeno un video, nell'ordine in cui si vedono nella griglia. */
export function bancoFolders(rows = []) {
  const m = new Map();
  for (const r of rows) m.set(r.path, (m.get(r.path) || 0) + 1);
  return [...m].map(([path, n]) => ({ path, label: path || "Cartella principale", n }));
}

export function filterRows(rows = [], { state = null, path = null } = {}) {
  return rows.filter((r) => (state == null || r.state === state) && (path == null || r.path === path));
}

/** Il primo stato con qualcosa da vedere: chi apre la sezione non trova mai una griglia vuota a caso. */
export function defaultState(counts = {}) {
  return BANCO_STATES.find((s) => counts[s.key] > 0)?.key || "da_vedere";
}

/** Dopo una scelta dal lettore si passa al video dopo; alla fine della coda ci si ferma. */
export function nextInQueue(queue = [], id) {
  const i = queue.indexOf(id);
  return i >= 0 && i + 1 < queue.length ? queue[i + 1] : null;
}
