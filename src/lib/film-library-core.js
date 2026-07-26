// Film library — core PURO (zero import, testabile con node secco).
//
// Trasforma il game film da FOTOGRAFIA (ricalcolo che dimentica) a LIBRERIA:
// i momenti si accumulano con id stabile, il giudizio del coach persiste tra
// i ricalcoli, la coda "nuovi da giudicare" è la risposta a "come arrivo alle
// altre 22" e "come ho esempi freschi in continuo" (blueprint 26 lug: pattern
// coaching-inbox di Gong + tassonomia chiusa di MaestroQA — il free-text non
// si aggrega né calibra tra coach).
//
// POLICY: il giudizio è coaching, MAI metrica comparativa (niente conteggi
// vinte/perse in score/leaderboard/comp — appena è metrica viene gamata e
// scatta il perimetro legale dello scoring). Lo user_id resta nel RECORD
// server-side (serve per il transcript on-demand, pattern academy-tapes);
// stripMomentMeta lo toglie da ogni risposta.

export const FILM_LIBRARY_VERSION = "film-lib-1-2026-07";

// Stati del momento nella coda del coach. Flusso: nuovo → visto → (legittima | da_coaching).
export const JUDGMENT_STATUSES = ["nuovo", "visto", "legittima", "da_coaching"];

// Tassonomia CHIUSA della "persa legittima" (lezione MaestroQA: mai free-text
// come campo primario — non si aggrega e non si calibra tra coach).
export const LEGIT_REASONS = {
  no_budget: "Fan senza budget",
  timing: "Momento sbagliato (fan di passaggio)",
  offerta_rifiutata: "Offerta vera fatta e rifiutata altrove nel periodo",
  fuori_policy: "Richiesta fuori policy: NON vendere era giusto",
  altro: "Altro (vedi nota)",
};

// Gap del profilo-segnali allenato da ciascuna reason di persa → aggancia
// recommendPathForGap (coaching-paths) quando il coach marca "da coaching".
export function lossGapKey(reason) {
  if (reason === "mai_proposto") return "ppv_per_h";
  if (reason === "gioco_timido") return "avg_ppv_price";
  return null;
}

/**
 * Fonde i momenti freschi (ri-estrazione) nella libreria esistente.
 * PRESERVA il giudizio e first_seen dei momenti già noti (id stabile =
 * shift_id + alias HMAC fan, invariante alla ri-estrazione); i nuovi nascono
 * con judgment {status:"nuovo"}. Non rimuove mai un momento (la libreria è
 * un archivio che cresce; il ricalcolo non deve orfanare giudizi).
 * @param {object|null} prev  store precedente { moments: {key: m}, ... } o null
 * @param {Array<object>} fresh  metas dal film (con key già calcolata)
 * @param {number} now
 * @returns {{store: object, added: number, updated: number}}
 */
export function mergeLibrary(prev, fresh, now) {
  const moments = { ...(prev && prev.moments ? prev.moments : {}) };
  let added = 0;
  let updated = 0;
  for (const m of Array.isArray(fresh) ? fresh : []) {
    if (!m || !m.key) continue;
    const old = moments[m.key];
    if (old) {
      // meta aggiornata (es. il bought può crescere se la coda +2h matura),
      // giudizio e first_seen conservati — TRANNE se il momento cambia natura
      // (persa→vinta per coda maturata): un giudizio dato sull'altra natura
      // non ha più senso, torna in coda come nuovo.
      const judgment = old.kind === m.kind ? old.judgment : { status: "nuovo" };
      moments[m.key] = { ...m, judgment, first_seen: old.first_seen };
      updated++;
    } else {
      moments[m.key] = { ...m, judgment: { status: "nuovo" }, first_seen: now };
      added++;
    }
  }
  return {
    store: { version: FILM_LIBRARY_VERSION, moments, updated_at: now },
    added,
    updated,
  };
}

/**
 * Applica il giudizio del coach a un momento. Valida stato e tassonomia.
 * Ritorna lo store aggiornato; lancia su input invalido o momento assente.
 */
export function applyJudgment(store, key, { status, reason, note } = {}, now) {
  // hasOwnProperty: '__proto__' o chiavi ereditate NON sono momenti (un
  // momento-fantasma persistito inquinerebbe counts e coda per sempre)
  if (!store || !store.moments || !Object.prototype.hasOwnProperty.call(store.moments, key) || !store.moments[key]) {
    throw new Error("Momento non trovato nella libreria");
  }
  if (!JUDGMENT_STATUSES.includes(status) || status === "nuovo") throw new Error("Stato non valido");
  if (status === "legittima" && !Object.prototype.hasOwnProperty.call(LEGIT_REASONS, reason)) {
    throw new Error("Motivo 'legittima' fuori tassonomia");
  }
  const judgment = {
    status,
    reason: status === "legittima" ? reason : null,
    note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null,
    at: now,
  };
  const moments = { ...store.moments, [key]: { ...store.moments[key], judgment } };
  // updated_at NON si tocca: è il segnale di freschezza dei DATI per il
  // refresh notturno — un giudizio non deve far sembrare la libreria fresca.
  return { ...store, moments };
}

/** Conteggi per la coda (header pagina, pannello indice, digest). */
export function libraryCounts(store) {
  const c = { total: 0, nuovi: 0, visti: 0, legittime: 0, da_coaching: 0, wins: 0, losses: 0 };
  for (const m of Object.values(store?.moments || {})) {
    c.total++;
    if (m.kind === "win") c.wins++;
    else c.losses++;
    const s = m.judgment?.status || "nuovo";
    if (s === "nuovo") c.nuovi++;
    else if (s === "visto") c.visti++;
    else if (s === "legittima") c.legittime++;
    else if (s === "da_coaching") c.da_coaching++;
  }
  return c;
}

/** Lista ordinata per la UI: prima i nuovi, poi per giorno desc. */
export function libraryList(store) {
  return Object.values(store?.moments || {}).sort((a, b) => {
    const an = (a.judgment?.status || "nuovo") === "nuovo" ? 0 : 1;
    const bn = (b.judgment?.status || "nuovo") === "nuovo" ? 0 : 1;
    if (an !== bn) return an - bn;
    return String(b.day || "").localeCompare(String(a.day || ""));
  });
}

/** Versione da risposta API: via lo user_id (resta solo l'alias, come stripTape). */
export function stripMomentMeta(m) {
  if (!m) return m;
  const { user_id, ...pub } = m;
  return pub;
}
