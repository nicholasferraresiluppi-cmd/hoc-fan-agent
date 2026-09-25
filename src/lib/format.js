// Formati dei numeri — UNO solo in tutta l'app (it-IT): separatore delle migliaia
// sempre, virgola decimale, segno meno tipografico. Pilota Calendario compensi:
// formati misti ("$6449" accanto a "$175.460", "10.6%") minavano la fiducia.
const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
const bad = (n) => n == null || Number.isNaN(Number(n));

export const fmtInt = (n) => (bad(n) ? "—" : nf0.format(Math.round(Number(n))));
export const fmt$ = (n) => (bad(n) ? "—" : `$${nf0.format(Math.round(Number(n)))}`);
/** $1,6 mln / $175k per numeri grandi in testata */
export const fmt$Short = (n) => {
  if (bad(n)) return "—";
  const v = Number(n), a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 2 })} mln`;
  if (a >= 1e4) return `$${Math.round(v / 1e3).toLocaleString("it-IT")}k`;
  return fmt$(v);
};
export const fmtSigned$ = (n) => (bad(n) ? "—" : Math.round(n) === 0 ? "$0" : `${n > 0 ? "+" : "−"}$${nf0.format(Math.abs(Math.round(n)))}`);
export const fmtPct = (v, d = 0) => (bad(v) ? "—" : `${(Number(v) * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
/** variazione relativa: +12% / −3% */
export const fmtDelta = (cur, prev) => {
  if (bad(cur) || bad(prev) || !Number(prev)) return null;
  const d = (cur - prev) / Math.abs(prev);
  return `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })}%`;
};
export const fmtPts = (v) => (bad(v) ? "" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`);
export const fmtAgo = (ts) => {
  if (!ts) return "mai";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return "adesso";
  if (m < 60) return `${m} minuti fa`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const g = Math.round(h / 24);
  return `${g} giorni fa`;
};
export const MONTHS_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
