/**
 * Vocabolario delle competenze — il ponte tra l'Academy (simulatore) e la
 * qualità sul lavoro vero (QA conversazionale).
 *
 * Problema che risolve (studio benchmark, voce #2 "una rubrica sola"):
 * il simulatore valuta 6 dimensioni (naturalezza/esclusività/dipendenza/
 * conversione/tono/gestione_obiezioni, scala 0-100) e la QA sul vivo ne valuta
 * 5 completamente diverse (compliance/brand_voice/sales_technique/retention/
 * writing, scala 1-4). Due vocabolari che non si toccano: un punteggio alto in
 * Academy non "parlava" con la qualità sul turno.
 *
 * Qui definiamo UNA volta le competenze canoniche condivise e il crosswalk tra
 * le due sponde, così l'operatore vede la stessa lingua nei due posti e la
 * validazione predittiva (training → vendite/QA reali) ha un aggancio esplicito.
 *
 * Modulo PURO (nessun import di kv): usabile sia server sia client.
 * `qa-reviews.js` importa da qui QA_DIMENSIONS → un solo posto, niente drift.
 */

// Dimensioni della QA conversazionale sul vivo (CAREER_LADDER §8.1, rubrica v1).
// Vivevano in qa-reviews.js; spostate qui come sorgente unica del vocabolario.
export const QA_DIMENSIONS = [
  { key: "compliance", label: "Compliance e safety", critical: true },
  { key: "brand_voice", label: "Aderenza a brand voice / persona creator", critical: false },
  { key: "sales_technique", label: "Tecnica di vendita non pressante", critical: false },
  { key: "retention", label: "Retention del fan (riaperture, follow-up)", critical: false },
  { key: "writing", label: "Qualità di scrittura", critical: false },
];

// Le 6 dimensioni del simulatore, forma leggera (id allineati a SKILL_DIMENSIONS
// in training-scenarios.js). Le teniamo qui in versione compatta per non tirare
// dentro l'intero file scenari quando serve solo l'etichetta.
export const SIM_DIMENSIONS_LITE = [
  { key: "naturalezza", label: "Naturalezza" },
  { key: "esclusivita", label: "Esclusività" },
  { key: "dipendenza", label: "Dipendenza" },
  { key: "conversione", label: "Conversione" },
  { key: "tono", label: "Tono" },
  { key: "gestione_obiezioni", label: "Gestione obiezioni" },
];

/**
 * Il crosswalk: le competenze canoniche condivise. Per ognuna, quali dimensioni
 * dell'Academy (`sim`) e quali della QA sul vivo (`qa`) la misurano.
 * Un array vuoto su un lato = quella competenza NON è misurata su quel lato
 * (è un buco dichiarato, vedi VOCAB_GAPS).
 */
export const SKILL_CROSSWALK = [
  {
    key: "persona",
    label: "Voce della creator",
    definition: "Scrivere nel tono e nella personalità della creator, senza mai scollarsi dal personaggio.",
    sim: ["tono"],
    qa: ["brand_voice"],
  },
  {
    key: "vendita",
    label: "Vendita non pressante",
    definition: "Portare il fan all'azione di valore (PPV, tip, custom) leggendo i segnali e gestendo obiezioni e prezzo, senza forzare.",
    sim: ["conversione", "gestione_obiezioni"],
    qa: ["sales_technique"],
  },
  {
    key: "retention",
    label: "Loop di ritorno",
    definition: "Costruire i motivi per cui il fan torna: riaperture, follow-up, cliffhanger, rituali temporali.",
    sim: ["dipendenza"],
    qa: ["retention"],
  },
  {
    key: "autenticita",
    label: "Autenticità e scrittura",
    definition: "Suonare come una persona vera e non un template; qualità e naturalezza della scrittura.",
    sim: ["naturalezza"],
    qa: ["writing"],
  },
  {
    key: "esclusivita",
    label: "Esclusività",
    definition: "Far sentire il fan l'unico: personalizzazione, riferimenti a lui, zero tono da messaggio di massa.",
    sim: ["esclusivita"],
    qa: [], // sul vivo confluisce in brand_voice/retention: nessuna dimensione QA dedicata
  },
  {
    key: "compliance",
    label: "Compliance e safety",
    definition: "Le righe rosse: niente dati personali, niente incontri reali, niente minori, niente fuori piattaforma.",
    sim: [], // l'Academy NON allena ancora la compliance (vedi VOCAB_GAPS)
    qa: ["compliance"],
    critical: true,
  },
];

/**
 * Buchi dichiarati dal crosswalk — input di prodotto onesti, non da nascondere.
 * - academyBlind: competenze valutate sul vivo ma che l'Academy non allena.
 *   `compliance` è il caso grosso: è la dimensione critica che congela le
 *   promozioni, e oggi il simulatore non la misura affatto.
 * - liveBlind: competenze allenate in Academy senza una dimensione QA dedicata.
 */
export const VOCAB_GAPS = {
  academyBlind: SKILL_CROSSWALK.filter((c) => c.qa.length && !c.sim.length).map((c) => c.key),
  liveBlind: SKILL_CROSSWALK.filter((c) => c.sim.length && !c.qa.length).map((c) => c.key),
};

const SIM_LABEL = Object.fromEntries(SIM_DIMENSIONS_LITE.map((d) => [d.key, d.label]));

/** Etichetta leggibile di una dimensione del simulatore. */
export function simLabel(key) {
  return SIM_LABEL[key] || key;
}

/**
 * Per una dimensione QA del vivo, quali competenze si allenano in Academy.
 * Ritorna { competency, sim: [{key,label}] } oppure null se non mappata.
 */
export function academyForQaDim(qaKey) {
  const competency = SKILL_CROSSWALK.find((c) => c.qa.includes(qaKey));
  if (!competency) return null;
  return {
    competency,
    sim: competency.sim.map((k) => ({ key: k, label: simLabel(k) })),
  };
}
