/**
 * "Pronta": a che punto è la scheda di una persona (05/10/2026, redesign del Centro HR).
 *
 * Logica PURA, solo sui dati della scheda: NON è una checklist di onboarding con compiti e
 * scadenze (decisione di Nicholas: le procedure d'ingresso restano su ClickUp, qui niente
 * complicazioni). Dice soltanto cosa manca nei dati, così l'elenco lo mostra su ogni riga.
 */
export const READINESS = [
  { key: "document", label: "documento", test: (f) => Boolean(f.idDocument?.at || f.idDocument?.title) },
  { key: "contract", label: "contratto firmato", test: (f) => f.hvContractStatus === "Firmato" },
  { key: "referent", label: "referente", test: (f) => Array.isArray(f.referent) && f.referent.length > 0 },
  { key: "project", label: "progetto", test: (f) => Array.isArray(f.project) && f.project.length > 0 },
  { key: "job", label: "mansione", test: (f) => Boolean(String(f.currentJob || "").trim()) },
];

/** { done, total, missing: [{key,label}] } per una scheda. */
export function readiness(fields = {}) {
  const missing = READINESS.filter((r) => !r.test(fields || {})).map(({ key, label }) => ({ key, label }));
  return { done: READINESS.length - missing.length, total: READINESS.length, missing };
}

/** Iniziali per l'avatar: "Giulia Rossi" → "GR". */
export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Colore stabile per persona (stesso nome → stesso colore), dalla palette dei pallini. */
const AVATAR = ["#6b4ee6", "#2f8f6b", "#c46a2b", "#2f6fb3", "#a8456b", "#7a7f2a", "#3f8a9a", "#8a5a2b"];
export function avatarColor(seed = "") {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
