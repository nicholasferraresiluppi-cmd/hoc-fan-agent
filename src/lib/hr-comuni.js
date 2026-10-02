/**
 * Comuni italiani (elenco ufficiale ISTAT, scaricato il 02/10/2026 → public/data/comuni-istat.json:
 * [nome, sigla provincia, codice catastale, regione]) e controllo di coerenza del codice fiscale
 * con data di nascita, genere e luogo di nascita. Puro.
 * Nota: l'elenco ISTAT contiene i comuni ATTUALI: chi è nato in un comune poi fuso o soppresso
 * può avere un codice catastale che non c'è più → il controllo AVVISA, non blocca.
 */
const OMO = { L: "0", M: "1", N: "2", P: "3", Q: "4", R: "5", S: "6", T: "7", U: "8", V: "9" };
const dig = (c) => (/\d/.test(c) ? c : OMO[c] ?? c);
const MONTHS = "ABCDEHLMPRST";

/** Estrae dal CF anno (2 cifre), mese, giorno, genere, codice del luogo. null se illeggibile. */
export function decodeCf(cf) {
  const v = String(cf || "").toUpperCase().replace(/\s+/g, "");
  if (v.length !== 16) return null;
  const yy = Number(dig(v[6]) + dig(v[7]));
  const mm = MONTHS.indexOf(v[8]) + 1;
  let dd = Number(dig(v[9]) + dig(v[10]));
  const female = dd > 40;
  if (female) dd -= 40;
  const place = v[11] + dig(v[12]) + dig(v[13]) + dig(v[14]);
  if (!mm || !Number.isFinite(yy) || !Number.isFinite(dd)) return null;
  return { yy, mm, dd, female, place };
}

/**
 * Confronta il CF con i dati dichiarati. Ritorna un elenco di AVVISI (vuoto = coerente).
 * dob "YYYY-MM-DD"; gender "Female"/"Male"/…; birth { abroad, code }.
 */
export function cfCoherence(cf, { dob, gender, birth } = {}) {
  const d = decodeCf(cf);
  if (!d) return [];
  const out = [];
  if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, day] = dob.split("-").map(Number);
    if (y % 100 !== d.yy || m !== d.mm || day !== d.dd) out.push("la data di nascita non corrisponde a quella nel codice fiscale");
  }
  if (gender === "Female" && !d.female) out.push("nel codice fiscale risulta il genere maschile");
  if (gender === "Male" && d.female) out.push("nel codice fiscale risulta il genere femminile");
  if (birth?.abroad && !d.place.startsWith("Z")) out.push("il codice fiscale indica un comune italiano, non un paese estero");
  if (birth && !birth.abroad && birth.code && d.place !== birth.code) out.push("il comune di nascita non corrisponde a quello nel codice fiscale");
  return out;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
/** Cerca nell'elenco [[nome, prov, codice, regione]] — prima chi inizia con la ricerca. */
export function searchComuni(list, q, max = 8) {
  const n = norm(q);
  if (n.length < 2 || !Array.isArray(list)) return [];
  const exact = [], starts = [], inside = [];
  for (const r of list) {
    const k = norm(r[0]);
    if (k === n) exact.push(r); else if (k.startsWith(n)) starts.push(r); else if (k.includes(n)) inside.push(r);
  }
  const byLen = (a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0], "it");
  return [...exact, ...starts.sort(byLen), ...inside.sort(byLen)].slice(0, max).map(([name, prov, code, region]) => ({ name, prov, code, region }));
}
