/**
 * Periodi a giorni interi (UTC, come i filtri dei report): funzioni pure per il
 * selettore di periodo (components/PeriodPicker). Un giorno è una stringa "YYYY-MM-DD".
 */
const DAY = 86400e3;
const RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDay = (s) => typeof s === "string" && RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const toDay = (t) => new Date(t).toISOString().slice(0, 10);
export const parseDay = (s) => Date.parse(`${s}T00:00:00Z`);
export const addDays = (s, n) => toDay(parseDay(s) + n * DAY);
/** Giorni nel periodo, estremi inclusi. */
export const lengthOf = ({ from, to }) => Math.round((parseDay(to) - parseDay(from)) / DAY) + 1;

/** Il periodo subito prima, di pari durata (quello con cui si confronta). */
export function previousOf({ from, to }) {
  const len = lengthOf({ from, to });
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** Ordina gli estremi e li tiene dentro [min, max]. */
export function clampRange({ from, to }, { min, max } = {}) {
  let [a, b] = parseDay(from) <= parseDay(to) ? [from, to] : [to, from];
  if (max && parseDay(b) > parseDay(max)) b = max;
  if (max && parseDay(a) > parseDay(max)) a = max;
  if (min && parseDay(a) < parseDay(min)) a = min;
  if (min && parseDay(b) < parseDay(min)) b = min;
  return { from: a, to: b };
}

/** Periodi pronti, tutti chiusi su `end` (di solito ieri: l'ultimo giorno completo). */
export function presetsFor(end) {
  const [y, m] = end.split("-").map(Number);
  const firstThis = `${end.slice(0, 7)}-01`;
  const lastPrev = toDay(Date.UTC(y, m - 1, 0));
  const firstPrev = `${lastPrev.slice(0, 7)}-01`;
  const last = (n) => ({ from: addDays(end, -(n - 1)), to: end });
  return [
    { id: "7", label: "Ultimi 7 giorni", ...last(7) },
    { id: "14", label: "Ultimi 14 giorni", ...last(14) },
    { id: "28", label: "Ultimi 28 giorni", ...last(28) },
    { id: "90", label: "Ultimi 90 giorni", ...last(90) },
    { id: "mese", label: "Questo mese", from: firstThis, to: end },
    { id: "mese-prima", label: "Mese scorso", from: firstPrev, to: lastPrev },
  ];
}

export function matchPreset(range, presets) {
  if (!range) return null;
  return presets.find((p) => p.from === range.from && p.to === range.to)?.id || null;
}

/** Settimane del mese (lunedì per primo): sempre 6 righe da 7 celle (altezza fissa: i mesi
 * affiancati restano allineati e il calendario non salta cambiando mese), null fuori dal mese. */
export function monthGrid(year, month) {
  const first = Date.UTC(year, month, 1);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toDay(first + i * DAY))];
  while (cells.length < 42) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const shiftMonth = ({ year, month }, n) => {
  const d = new Date(Date.UTC(year, month + n, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
};

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const monthTitle = ({ year, month }) => `${MONTHS_LONG[month]} ${year}`;

/** Etichetta corta e leggibile: "8 – 21 ago", "22 ago – 4 set", "28 dic 2025 – 4 gen 2026". */
export function formatRange({ from, to }, currentYear = new Date().getUTCFullYear()) {
  if (!isDay(from) || !isDay(to)) return "—";
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const yr = (y) => (y === currentYear ? "" : ` ${y}`);
  if (from === to) return `${td} ${MONTHS[tm - 1]}${yr(ty)}`;
  if (fy !== ty) return `${fd} ${MONTHS[fm - 1]} ${fy} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fm === tm) return `${fd} – ${td} ${MONTHS[tm - 1]}${yr(ty)}`;
  return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]}${yr(ty)}`;
}

export const daysLabel = (n) => (n === 1 ? "1 giorno" : `${n} giorni`);
