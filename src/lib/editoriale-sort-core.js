// Editoriale — smistamento del drive (29/10/2026), logica pura (niente KV, niente rete).
//
// Nicholas su un reel di @viiolini («Sorting my Downloads folder»: le foto volano nei loro
// gruppi): «mi sembra tutto più chiaro». Da noi l'editor apriva il drive e sceglieva foto per foto
// in una griglia di migliaia di file. Ora un'AI guarda la miniatura di ogni file e lo mette in un
// GRUPPO (selfie, outfit, mare…); l'editor parte dai gruppi per fare i caroselli.
//
// Regole:
//   - il gruppo è un AIUTO per orientarsi, non un dato: si può sbagliare e si corregge a mano;
//   - i DOPPIONI non li decide l'AI: sono i file con la stessa impronta (md5 di Drive), cioè lo
//     stesso file caricato due volte. Si tiene il più vecchio, le copie vanno nel riquadro
//     «Doppioni» (da togliere dal drive a mano: HOC Pro il drive lo legge e basta);
//   - un file che l'AI non ha potuto guardare (niente miniatura, risposta mancante) è «non letto»,
//     MAI messo a caso in un gruppo.

/** I gruppi, nell'ordine in cui si mostrano. `hint` è quello che legge l'AI. */
export const SORT_CATEGORIES = [
  { key: "selfie", label: "Selfie e primi piani", hint: "selfie o primo piano del viso, anche allo specchio se si vede soprattutto il viso" },
  { key: "outfit", label: "Outfit e look", hint: "figura intera o mezzo busto per mostrare vestiti, look, posa in piedi, foto allo specchio del look" },
  { key: "intimo", label: "Intimo e lingerie", hint: "in intimo, lingerie, body, pigiama sexy (non al mare)" },
  { key: "mare", label: "Mare e piscina", hint: "spiaggia, mare, piscina, costume da bagno, barca" },
  { key: "palestra", label: "Palestra e sport", hint: "palestra, allenamento, abbigliamento sportivo, sport" },
  { key: "casa", label: "Casa e letto", hint: "in casa, a letto, sul divano, in bagno, vita di tutti i giorni dentro casa" },
  { key: "locali", label: "Cibo e locali", hint: "cibo, bevande, caffè, ristorante, bar, aperitivo" },
  { key: "viaggi", label: "Viaggi e città", hint: "città, strade, monumenti, hotel, aeroporto, auto, viaggio" },
  { key: "natura", label: "Natura e all'aperto", hint: "natura, parco, montagna, campagna, tramonto, all'aperto senza città" },
  { key: "sera", label: "Sera e feste", hint: "serata, festa, discoteca, evento, luci notturne, vestito elegante di sera" },
  { key: "amici", label: "Con altre persone", hint: "si vedono chiaramente altre persone insieme a lei (amiche, gruppo, coppia)" },
  { key: "screen", label: "Screenshot e testi", hint: "screenshot, schermate di app o chat, grafiche, testo, meme, documenti" },
  { key: "altro", label: "Altro", hint: "niente delle voci sopra: oggetti, animali, dettagli, foto venute male" },
];
export const SORT_KEYS = SORT_CATEGORIES.map((c) => c.key);
const KEYSET = new Set(SORT_KEYS);
/** Etichette speciali che NON vengono dall'AI. */
export const SORT_SPECIAL = { dup: "Doppioni", nd: "Non letti" };
export const sortLabel = (k) => SORT_CATEGORIES.find((c) => c.key === k)?.label || SORT_SPECIAL[k] || k;

/** Quanti file per chiamata all'AI e quante chiamate per passo. */
export const SORT_BATCH = 12;
export const SORT_PARALLEL = 4;
export const SORT_STEP_MAX = SORT_BATCH * SORT_PARALLEL;
/** Stima del costo per file (miniatura ~400 px ≈ 300 token + quota del testo), in dollari. */
export const SORT_USD_PER_FILE = 0.0004;

/** Istruzioni per l'AI: una riga per gruppo, risposta una riga per file. */
export function sortPrompt(n) {
  return [
    "Smisti le foto e i video (vedi la miniatura) del drive di una creator di Instagram, per aiutare il suo editor a preparare i post.",
    "Per ogni immagine scegli UN gruppo tra questi (la chiave a sinistra):",
    ...SORT_CATEGORIES.map((c) => `- ${c.key}: ${c.hint}`),
    "Se un'immagine sta in più gruppi, scegli quello che un editor userebbe per trovarla (es. selfie in palestra = palestra; outfit al mare = mare).",
    `Ricevi ${n} immagini numerate da 1 a ${n}. Rispondi SOLO con ${n} righe nel formato «numero: chiave», niente altro.`,
  ].join("\n");
}

/**
 * Legge la risposta dell'AI. Restituisce un array lungo n: chiave del gruppo, o null dove la
 * risposta manca o non è una chiave valida (quel file resta «non letto»).
 */
export function parseSortAnswer(text, n) {
  const out = Array(n).fill(null);
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*(?:immagine\s*|foto\s*|#)?(\d{1,3})\s*[:.)\-–]\s*([a-z]+)/i.exec(line);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    const k = m[2].toLowerCase();
    if (i >= 0 && i < n && KEYSET.has(k) && out[i] == null) out[i] = k;
  }
  return out;
}

/**
 * Doppioni: stessi byte (md5 di Drive) e stesso tipo. Si tiene il più vecchio (creato prima),
 * le altre copie sono doppioni. Restituisce Map(idCopia → idOriginale).
 */
export function duplicatesOf(files) {
  const groups = new Map();
  for (const f of files || []) {
    if (!f?.md5) continue;
    const k = `${f.kind}|${f.md5}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")) || String(a.id).localeCompare(String(b.id)));
    for (const f of sorted.slice(1)) out.set(f.id, sorted[0].id);
  }
  return out;
}

/**
 * Il gruppo di ogni file per la pagina: «dup» per le copie, l'etichetta dell'AI (se valida),
 * «nd» se l'AI l'ha guardato senza risposta, null se non è ancora stato smistato.
 */
export function groupOf(file, labels, dups) {
  if (dups?.has(file.id)) return "dup";
  const v = labels?.[file.id];
  if (v === "nd") return "nd";
  return KEYSET.has(v) ? v : null;
}

/** File ancora da far guardare all'AI (né smistati né doppioni). `retry` riprende i non letti. */
export function pendingFiles(files, labels, dups, { retry = false } = {}) {
  return (files || []).filter((f) => {
    if (dups?.has(f.id)) return false;
    const v = labels?.[f.id];
    if (v === "nd") return retry;
    return !KEYSET.has(v); // mai guardato, o etichetta non più valida
  });
}

/** Conteggi per la pagina: per tipo e per gruppo (con quanti liberi). */
export function sortSummary(files, labels, dups, isFree = () => true) {
  const by = {};
  let done = 0, pending = 0;
  for (const f of files || []) {
    const g = groupOf(f, labels, dups);
    if (!g) { pending++; continue; }
    done++;
    const k = `${f.kind}|${g}`;
    by[k] ||= { kind: f.kind, key: g, n: 0, free: 0 };
    by[k].n++;
    if (isFree(f)) by[k].free++;
  }
  return { done, pending, total: (files || []).length, groups: Object.values(by) };
}
