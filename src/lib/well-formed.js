/**
 * Testo Unicode "ben formato" per l'export del database (20/11/2026).
 *
 * PERCHÉ: un testo tagliato a metà di un'emoji (es. .slice() su "ciao 😘")
 * lascia un surrogato solitario. JSON.stringify lo scrive come "\ud83d" e jq,
 * che il backup notturno usa per unire le pagine, lo rifiuta: il backup è
 * fallito ogni notte dal 9/10 al 19/11/2026 per questo. Qui il mezzo carattere
 * diventa U+FFFD (il "?" di sostituzione); tutto il resto resta identico.
 */
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function wellFormedString(s) {
  if (typeof s.toWellFormed === "function") return s.toWellFormed();
  return s.replace(LONE, "�");
}

/** Copia profonda con le stringhe (chiavi comprese) rese ben formate; `hit.n` conta le correzioni. */
export function wellFormedDeep(v, hit = { n: 0 }) {
  if (typeof v === "string") {
    const out = wellFormedString(v);
    if (out !== v) hit.n += 1;
    return out;
  }
  if (Array.isArray(v)) return v.map((x) => wellFormedDeep(x, hit));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[wellFormedDeep(k, hit)] = wellFormedDeep(x, hit);
    return out;
  }
  return v;
}
