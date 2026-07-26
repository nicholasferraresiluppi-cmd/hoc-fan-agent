/**
 * activation-core.js — logica PURA dell'attivazione operatore (ZERO import).
 *
 * Separata da activation.js (che fa I/O su KV + coaching-paths) così è
 * unit-testabile in node puro, come game-film-core. La mappa gap→categorie è
 * INIETTATA (gapCategoriesFor), non importata: il core non conosce il catalogo.
 *
 * Definizione v1 e rationale: vedi header di activation.js e CLAUDE.md decision log.
 */

export const ACTIVATION_VERSION = "act-1-2026-07";

/** Soglie PLACEHOLDER — da derivare dai dati (magic-number), non copiate. */
export const ACTIVATION_THRESHOLDS = {
  version: ACTIVATION_VERSION,
  windowDays: 7, // finestra dall'aha per completare gli scenari-gap
  minGapScenarios: 2, // scenari nella categoria del gap
  minOverall: 60, // floor qualità: uno scenario svogliato non conta
  derived: false, // true solo quando la soglia sarà derivata da una coorte reale
};

export const EVENT = {
  SIGNALS_VIEWED: "signals_viewed",
  SCENARIO_COMPLETED: "scenario_completed",
  COACHING_ACKNOWLEDGED: "coaching_acknowledged",
  TURNO_VIEWED: "turno_viewed",
};

/**
 * Calcola lo stato di attivazione da una lista di eventi. PURA e deterministica.
 *
 * @param {Array<{t,ts,...}>} events           eventi grezzi dell'utente
 * @param {object} cfg                          soglie (default ACTIVATION_THRESHOLDS)
 * @param {(gapKey:string)=>string[]} gapCategoriesFor  categorie che allenano il gap
 * @returns {{ahaReached, gapKey, gapCategories, gapScenariosInWindow, activated, ahaTs, activatedTs}}
 */
export function computeActivation(events, cfg = ACTIVATION_THRESHOLDS, gapCategoriesFor = () => []) {
  const list = Array.isArray(events) ? events : [];
  const windowMs = cfg.windowDays * 24 * 60 * 60 * 1000;

  // (1) L'aha: primo signals_viewed con un gap vero.
  const ahaEvents = list
    .filter((e) => e && e.t === EVENT.SIGNALS_VIEWED && e.top_gap_key)
    .sort((a, b) => a.ts - b.ts);
  const aha = ahaEvents[0] || null;

  if (!aha) {
    return {
      ahaReached: false, gapKey: null, gapCategories: [],
      gapScenariosInWindow: 0, activated: false, ahaTs: null, activatedTs: null,
    };
  }

  const gapKey = aha.top_gap_key;
  const cats = gapCategoriesFor(gapKey) || [];
  // Normalizza a id-stringa: il resolver di produzione (recommendPathForGap)
  // ritorna categorie come oggetti {id,name}; qui accettiamo sia stringhe sia {id}
  // così il match con scenario.categoryId (stringa) è sempre corretto.
  const catSet = new Set(
    cats.map((c) => (typeof c === "string" ? c : (c && c.id))).filter(Boolean)
  );

  // (2) Scenari-gap completati nella finestra, sopra il floor qualità, ordinati
  //     per ts così l'activatedTs è quando si raggiunge la soglia.
  const qualifying = list
    .filter(
      (e) =>
        e && e.t === EVENT.SCENARIO_COMPLETED &&
        e.categoryId && catSet.has(e.categoryId) &&
        typeof e.overall === "number" && e.overall >= cfg.minOverall &&
        e.ts >= aha.ts && e.ts <= aha.ts + windowMs
    )
    .sort((a, b) => a.ts - b.ts);

  const activated = qualifying.length >= cfg.minGapScenarios;
  const activatedTs = activated ? qualifying[cfg.minGapScenarios - 1].ts : null;

  return {
    ahaReached: true,
    gapKey,
    gapCategories: cats,
    gapScenariosInWindow: qualifying.length,
    activated,
    ahaTs: aha.ts,
    activatedTs,
  };
}
