// Coaching paths — dal GAP comportamentale reale al percorso di training su misura.
//
// Chiude l'anello del coaching data-driven: il profilo-segnali (operator-signals.js)
// dice DOVE un operatore è carente dal suo lavoro vero; qui traduciamo quel gap nel
// PERCORSO concreto — quali scenari dell'Academy allenano proprio quel comportamento.
//
// Complementare alla Coaching Center (coaching-center.js), che parte dai pattern KPI/CP
// per periodo e gestisce le assegnazioni formali: quella resta la sede dell'assegnazione,
// questo è il suggerimento ancorato al comportamento reale, sulla stessa tassonomia di
// categorie Academy (PATTERN_TO_TRAINING). Deterministico, dal catalogo scenari statico.

import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";

// Nomi categoria coerenti con coaching-center.js.
const CATEGORY_NAME = {
  "le-basi-della-chat": "Le Basi della Chat",
  "mass-e-conversione": "Mass & Conversione",
  "custom-e-upsell": "Custom & Upsell",
  "recuperi-e-retention": "Recuperi & Retention",
  "script-avanzati": "Script Avanzati",
};

// Gap del profilo-segnali (key) → focus di coaching + categorie che lo allenano.
// Le direzioni vengono dall'evidenza validata (academy-tier2-signals-evidence).
const GAP_TO_PATH = {
  question_rate: {
    focus: "Conduci, non intervistare: porta il fan verso un'azione invece di sommergerlo di domande.",
    categories: ["mass-e-conversione", "le-basi-della-chat"],
  },
  avg_ppv_price: {
    focus: "Prezza con sicurezza: reggi il valore e gestisci la richiesta di sconto senza svenderti.",
    categories: ["custom-e-upsell", "recuperi-e-retention"],
  },
  ppv_per_h: {
    focus: "Proponi con continuità: trasforma l'ingaggio in offerte di contenuto, non aspettare che chieda.",
    categories: ["mass-e-conversione", "custom-e-upsell"],
  },
  msgs_per_h: {
    focus: "Presidia di più: tieni viva la conversazione e riaggancia chi si sta raffreddando.",
    categories: ["le-basi-della-chat", "recuperi-e-retention"],
  },
  slow_reply_rate: {
    focus: "Rispondi prima: non lasciare in attesa i fan caldi, la lentezza raffredda la vendita.",
    categories: ["le-basi-della-chat", "recuperi-e-retention"],
  },
};

let _byCat = null;
function scenariosByCategory() {
  if (_byCat) return _byCat;
  const map = {};
  for (const cat of TRAINING_SCENARIOS || []) {
    if (!cat?.categoryId) continue;
    map[cat.categoryId] = (cat.scenarios || [])
      .filter((s) => s && s.id)
      .map((s) => ({ id: s.id, title: s.title || s.id, difficulty: s.difficulty || 3 }));
  }
  _byCat = map;
  return map;
}

/**
 * @param {string} gapKey una key di GAP_TO_PATH (top_gap.key del profilo-segnali)
 * @param {number} [max=3] quanti scenari suggerire
 * @returns {{focus:string, categories:{id,name}[], scenarios:{id,title,categoryId,difficulty}[]}|null}
 */
export function recommendPathForGap(gapKey, max = 3) {
  const spec = GAP_TO_PATH[gapKey];
  if (!spec) return null;
  const byCat = scenariosByCategory();
  const categories = spec.categories.map((c) => ({ id: c, name: CATEGORY_NAME[c] || c }));
  // scenari per categoria, ciascuna ordinata per difficoltà crescente (ramp)
  const perCat = spec.categories.map((c) =>
    (byCat[c] || []).slice().sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3)).map((s) => ({ ...s, categoryId: c }))
  );
  // round-robin: dà priorità alla PRIMA categoria (la più rilevante per il gap) ma
  // garantisce che anche la secondaria compaia, invece di pescare solo i più facili.
  const scenarios = [];
  const cap = Math.max(1, max);
  let i = 0;
  while (scenarios.length < cap && perCat.some((arr) => arr.length)) {
    const arr = perCat[i % perCat.length];
    if (arr.length) scenarios.push(arr.shift());
    i++;
  }
  return { focus: spec.focus, categories, scenarios };
}

/** Arricchisce i profili-segnali (in place, oggetto già deserializzato) col percorso per il gap. */
export function attachCoachingPaths(data) {
  if (!data || !Array.isArray(data.profiles)) return data;
  for (const p of data.profiles) {
    if (p.top_gap?.key) p.top_gap.path = recommendPathForGap(p.top_gap.key);
  }
  return data;
}
