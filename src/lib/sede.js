// La Sede — l'azienda di HOC vista come uffici (persone, codice, AI) che si
// passano il lavoro. Logica PURA (nessun import): la usano la route e i test.
//
// Nata da Nicholas (4/10/2026): "strutturiamo un'azienda con agenti AI che
// funzionino davvero bene in un ecosistema, che lavora e ottiene risultati".
// Modello: il trading floor di agenti (uffici con un compito, un ufficio rischi
// indipendente, un'incubatrice). Le QUATTRO REGOLE di un ufficio che lavora
// bene (verificate sul sales manager AI la notte del 3/10):
//   1. un solo compito chiaro
//   2. un risultato misurabile
//   3. un controllore indipendente che blocca gli errori
//   4. una persona che ne risponde
// La Sede mostra per ogni ufficio se le quattro regole ci sono e se ha lavorato
// davvero (prova = il "battito" che lascia nel database), e fa vedere i BUCHI.

export const VERSION = "sede-1";

// cadenze attese → dopo quanto un ufficio è "in ritardo"
export const CADENCE = {
  "5min": { label: "ogni 5 minuti", lateMs: 30 * 60e3 },
  daily: { label: "ogni notte", lateMs: 30 * 3600e3 },
  weekdays: { label: "lun-ven mattina", lateMs: 80 * 3600e3 },
  weekly: { label: "ogni settimana", lateMs: 8 * 86400e3 },
  monday: { label: "il lunedì", lateMs: 8 * 86400e3 },
  monthly: { label: "ogni mese", lateMs: 35 * 86400e3 },
  ondemand: { label: "quando serve", lateMs: null },
};

export const FLOORS = [
  { id: "direzione", nome: "Direzione", desc: "Le persone che decidono, approvano e rispondono dei risultati" },
  { id: "vendite", nome: "Vendite e coaching", desc: "Chi aiuta gli operatori a vendere meglio" },
  { id: "persone", nome: "Persone e organizzazione", desc: "Anagrafica, ClickUp, la città" },
  { id: "dati", nome: "Fonti dei dati", desc: "Chi porta dentro i numeri ogni giorno" },
  { id: "controllo", nome: "Controllo", desc: "Chi verifica che il resto funzioni" },
];

/**
 * Gli uffici. `beat` = chiave del battito in KV (prova di lavoro); `controllore`
 * = chi o cosa verifica il lavoro (null = nessuno: è un BUCO); `risultato` = come
 * si misura; `responsabile_default` = proposta, la conferma la Direzione in pagina.
 */
export const OFFICES = [
  // ── Direzione (persone)
  { id: "nicholas", piano: "direzione", nome: "Nicholas", tipo: "persona", compito: "Decide la direzione, approva regole e spese, risponde dei risultati dell'agenzia", cadenza: "ondemand", controllore: "—", risultato: "Decisioni prese dalla lista «Da decidere»", passa_a: [], link: "/admin/roadmap", responsabile_default: "Nicholas", coda: "decisioni" },
  { id: "antonio", piano: "direzione", nome: "Sales manager", tipo: "persona", compito: "Rivede i feedback dell'AI, fa i colloqui con gli operatori, decide chi spostare", cadenza: "ondemand", controllore: "Nicholas", risultato: "Feedback rivisti entro la mattina; operatori che migliorano sulla leva concordata", passa_a: [], link: "/admin/sales-ai", responsabile_default: "Antonio", coda: "feedback" },

  // ── Vendite
  { id: "sales-ai", piano: "vendite", nome: "Sales manager AI", tipo: "AI", compito: "Ogni notte un feedback personale a chi ha lavorato da solo: cosa ha fatto bene, una cosa da provare", cadenza: "daily", beat: "cron:heartbeat:sales-ai", controllore: "Garante (codice) + revisione del sales manager", risultato: "Feedback approvati, voti «utile», leva che migliora il giorno dopo", passa_a: ["antonio"], link: "/admin/sales-ai", responsabile_default: "Antonio", fmt: "salesAi" },
  { id: "sales-coaching", piano: "vendite", nome: "Coaching vendite", tipo: "codice", compito: "Ricalcola per split chi vende meglio a parità di pagina e cosa fa vendere", cadenza: "daily", beat: "cron:heartbeat:sales-coaching", controllore: "Il sales manager approva gli esempi prima che arrivino agli operatori", risultato: "Conversione dei fan mai paganti per pagina, test in corso", passa_a: ["antonio"], link: "/admin/sales-coaching", fmt: "result" },
  { id: "film", piano: "vendite", nome: "Game film", tipo: "codice", compito: "Ogni notte rinfresca le librerie di chat vinte e perse da studiare", cadenza: "daily", beat: "cron:heartbeat:film-refresh", controllore: "Il coach giudica ogni momento prima del coaching", risultato: "Momenti nuovi in coda per il coach", passa_a: ["antonio"], link: "/admin/operator-signals", fmt: "film" },
  { id: "operator-signals", battito_dal: "2026-10-05", piano: "vendite", nome: "Segnali operatori", tipo: "codice", compito: "Profilo dei comportamenti di ogni operatore rispetto agli altri", cadenza: "daily", beat: "cron:heartbeat:operator-signals", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Il punto debole principale di ogni operatore", passa_a: ["sales-ai", "antonio"], link: "/admin/operator-signals", fmt: "result" },
  { id: "academy-signals", battito_dal: "2026-10-05", piano: "vendite", nome: "Cosa fa vendere", tipo: "codice", compito: "Ricalcola quali comportamenti vanno con più vendite, dentro ogni creator", cadenza: "daily", beat: "cron:heartbeat:academy-signals", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Le leve che si possono insegnare", passa_a: ["sales-ai"], link: "/admin/academy-signals", fmt: "result" },
  { id: "transfer", battito_dal: "2026-10-05", piano: "vendite", nome: "Misura del progresso", tipo: "codice", compito: "Traiettoria mese per mese dei comportamenti di ogni operatore", cadenza: "daily", beat: "cron:heartbeat:transfer", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Chi migliora dopo il coaching", passa_a: ["antonio"], link: "/admin/transfer", fmt: "result" },
  { id: "creator-difficulty", battito_dal: "2026-10-05", piano: "vendite", nome: "Difficoltà creator", tipo: "codice", compito: "Quanto è caldo o freddo il pubblico di ogni creator, per leggere i numeri nel contesto giusto", cadenza: "weekly", beat: "cron:heartbeat:creator-difficulty", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Profilo del pubblico per creator", passa_a: ["antonio"], link: "/admin/creator-difficulty", fmt: "result" },

  // ── Persone e organizzazione
  { id: "hr-sync", piano: "persone", nome: "Centro HR · ClickUp", tipo: "codice", compito: "Allinea ogni notte le schede delle persone con la lista HR di ClickUp", cadenza: "daily", beat: "cron:heartbeat:hr-clickup", controllore: "Storico delle modifiche per persona + vista «Da ripulire»", risultato: "Schede allineate, nessun campo in sospeso", passa_a: [], link: "/admin/hr/sync", responsabile_default: "HR", fmt: "result" },
  { id: "hr-queue", battito_dal: "2026-10-05", piano: "persone", nome: "Coda HR", tipo: "codice", compito: "Ogni 5 minuti riprende schede e documenti rimasti in coda verso ClickUp", cadenza: "5min", beat: "cron:alive:hr-queue", controllore: "Avviso dopo 12 tentativi falliti", risultato: "Coda vuota", passa_a: ["hr-sync"], link: "/admin/hr/sync", responsabile_default: "HR", fmt: "hrQueue" },
  { id: "citta", piano: "persone", nome: "La città · ClickUp", tipo: "AI", compito: "Ogni notte legge i task di ClickUp e costruisce la città (palazzi, piani, chi lavora su cosa)", cadenza: "daily", beat: "cron:heartbeat:citta-clickup", controllore: "Etichette AI verificabili in pagina", risultato: "Aree in ritardo e priorità senza nessuno", passa_a: ["nicholas"], link: "/admin/citta", fmt: "citta" },
  { id: "citta-lunedi", piano: "persone", nome: "Il lunedì della città", tipo: "codice", compito: "Il lunedì: priorità senza nessuno, piani riaccesi, nuovi ritardi", cadenza: "monday", beat: "cron:heartbeat:citta-lunedi", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Lista del lunedì", passa_a: ["nicholas"], link: "/admin/citta", fmt: "result" },

  // ── Fonti dei dati
  { id: "dispatch", piano: "dati", nome: "Centralino notturno", tipo: "codice", compito: "Alle 5 fa partire tutti i lavori della notte, in ordine", cadenza: "daily", beat: "cron:heartbeat:dispatch", controllore: "Alert «Lavori notturni fermi»", risultato: "Nessun lavoro non partito", passa_a: ["cp-sync", "payout", "infloww-agency", "queue", "sales-ai", "sales-coaching", "film", "hr-sync", "citta"], link: "/admin/alerts", fmt: "dispatch" },
  { id: "cp-sync", piano: "dati", nome: "Sync CreatorsPro", tipo: "codice", compito: "Scarica turni e vendite di ogni operatore; pubblica il mese solo se completo", cadenza: "daily", beat: "cron:heartbeat:cp-wages", controllore: "Blocca il mese se è più piccolo del 70% del precedente + alert", risultato: "Mese completo e pubblicato", passa_a: ["sales-ai", "alerts"], link: "/admin/creatorspro-sync", fmt: "beat" },
  { id: "payout", piano: "dati", nome: "Registro pagamenti", tipo: "codice", compito: "Transazioni Infloww fan per fan, abbinate ai turni (albero dei pagamenti, rimborsi)", cadenza: "daily", beat: "cron:heartbeat:payout-ledger", controllore: "Confidenza dichiarata per ogni abbinamento", risultato: "% di vendite abbinate a un operatore", passa_a: ["alerts"], link: "/admin/payout-tree", fmt: "beat" },
  { id: "infloww-agency", piano: "dati", nome: "Incassi Infloww", tipo: "codice", compito: "Ricavi dell'agenzia per creator dall'API Infloww, per il controllo con CreatorsPro", cadenza: "daily", beat: "cron:heartbeat:infloww-agency", controllore: "Alert «creator non scaricate»", risultato: "Creator scaricate su quelle attive", passa_a: ["alerts"], link: "/admin/infloww-agency", fmt: "beat" },
  { id: "queue", piano: "dati", nome: "Fan in attesa", tipo: "codice", compito: "Fotografia giornaliera dei fan che aspettano una risposta, per creator", cadenza: "daily", beat: "cron:heartbeat:queue-snapshot", controllore: "Controllo delle uscite (ogni mattina alle 7:30)", ctrl: true, risultato: "Fan in coda per creator", passa_a: [], link: "/admin/conversation-intelligence", fmt: "queue" },
  { id: "robot-infloww", piano: "dati", nome: "Robot Infloww", tipo: "robot", compito: "Ogni mattina alle 8 esporta le statistiche operatori da Infloww e le carica (gira sul Mac di Nicholas)", cadenza: "daily", beat: "sede:proof:infloww-import", controllore: "Alert «import Infloww fermo»", risultato: "Statistiche del giorno caricate", passa_a: ["alerts"], link: "/leaderboard/operational", responsabile_default: "Nicholas", fmt: "beat" },

  // ── Controllo
  { id: "alerts", piano: "controllo", nome: "Alert operativi", tipo: "codice", compito: "Ogni notte controlla dati e lavori; apre un avviso per ogni problema e lo chiude quando sparisce", cadenza: "daily", beat: "ops:alerts:last_run", controllore: "La Direzione legge gli avvisi critici", risultato: "Avvisi aperti, con chi li ha presi in carico", passa_a: ["nicholas"], link: "/admin/alerts", fmt: "alerts" },
  { id: "controllori", piano: "controllo", nome: "Controllo delle uscite", tipo: "codice", compito: "Ogni mattina alle 7:30 controlla che il risultato degli uffici senza controllore sia credibile: non vuoto, non vecchio, non crollato, non in contraddizione con lo studio", cadenza: "daily", beat: "cron:heartbeat:controllori", battito_dal: "2026-10-05", controllore: "Alert operativi + Direzione", risultato: "Risultati sospetti trovati prima che qualcuno li usi", passa_a: ["alerts"], link: "/admin/alerts", fmt: "result" },
  { id: "controllo-mattutino", piano: "controllo", nome: "Controllo del mattino", tipo: "AI", compito: "Lun-ven alle 9:30 Claude controlla alert, lavori notturni, sync e sicurezza e apre le correzioni", cadenza: "weekdays", beat: "cron:heartbeat:controllo-mattutino", esterno: "Task programmato sul Mac di Nicholas", fmt: "result", controllore: "Nicholas rivede le correzioni proposte", risultato: "Problemi trovati prima delle persone", passa_a: ["nicholas"], link: null },
  { id: "pannello-tester", piano: "controllo", nome: "Pannello tester", tipo: "AI", compito: "Ogni settimana tester simulati per ruolo provano l'app e danno un voto", cadenza: "weekly", beat: "cron:heartbeat:pannello-tester", esterno: "Task programmato sul Mac di Nicholas", fmt: "result", controllore: "Nicholas", risultato: "Voto di facilità per ruolo", passa_a: ["nicholas"], link: null },
];

const byId = Object.fromEntries(OFFICES.map((o) => [o.id, o]));
export const officeById = (id) => byId[id];

/** Stato di un ufficio dal suo battito. */
export function statusOf(office, beat, now = Date.now()) {
  if (office.tipo === "persona") return { stato: "persona" };
  if (!office.beat) return { stato: "senza_prova" };
  const at = beat?.at ? Number(beat.at) : null;
  // battito appena introdotto: finché non è passata la prima notte non è un "fermo"
  if (!at && office.battito_dal && now < Date.parse(`${office.battito_dal}T12:00:00Z`)) return { stato: "attesa" };
  if (!at) return { stato: "mai" };
  const late = CADENCE[office.cadenza]?.lateMs;
  if (beat?.error || beat?.ok === false) return { stato: "errore", at };
  if (late && now - at > late) return { stato: "in_ritardo", at };
  return { stato: "lavora", at };
}

/** I buchi dell'ecosistema: le quattro regole e la prova di lavoro. */
export function gapsOf(office, { owner, status, controllo } = {}) {
  const g = [];
  if (controllo && controllo.ok === false) g.push({ tipo: "uscita", testo: `Risultato non credibile: ${(controllo.problemi || []).join("; ")}` });
  if (office.tipo === "persona") return g;
  if (!office.controllore) g.push({ tipo: "controllore", testo: "Nessuno controlla il suo lavoro" });
  if (!owner) g.push({ tipo: "responsabile", testo: "Nessuna persona ne risponde" });
  if (!office.beat) g.push({ tipo: "prova", testo: office.esterno ? `Lavora fuori dall'app (${office.esterno.toLowerCase()}): nessuna prova che abbia girato` : "Non lascia prova di aver lavorato" });
  if (status?.stato === "in_ritardo") g.push({ tipo: "ritardo", testo: `Ultimo lavoro oltre il previsto (${CADENCE[office.cadenza]?.label})` });
  if (status?.stato === "mai") g.push({ tipo: "ritardo", testo: "Nessuna traccia di lavoro" });
  if (status?.stato === "errore") g.push({ tipo: "errore", testo: "L'ultimo giro è finito con un errore" });
  return g;
}

/** Una riga leggibile su cosa ha fatto l'ultima volta (dal contenuto del battito). */
export function lastWork(office, beat) {
  if (!beat) return null;
  const b = beat;
  switch (office.fmt) {
    case "salesAi": return b.day ? `Ha lavorato sulla giornata del ${b.day}` : null;
    case "film": return Array.isArray(b.refreshed) ? `Librerie rinfrescate: ${b.refreshed.length}${b.failed?.length ? `, ${b.failed.length} non riuscite` : ""}` : null;
    case "hrQueue": return b.inCoda ? `In coda: ${b.inCoda.schede || 0} schede, ${b.inCoda.documenti || 0} documenti` : "Coda vuota";
    case "citta": return b.tasks != null ? `${b.tasks} task letti, ${b.projects ?? "?"} progetti` : null;
    case "queue": return b.fans_total != null ? `${b.fans_total} fan in attesa su ${b.creators} creator` : null;
    case "dispatch": return Array.isArray(b.failed_kicks) ? (b.failed_kicks.length ? `Non partiti: ${b.failed_kicks.join(", ")}` : "Tutti i lavori partiti") : null;
    case "alerts": return Array.isArray(b.checks) ? `${b.checks.length} controlli, ${b.checks.reduce((s, c) => s + (c.found || 0), 0)} problemi trovati${b.checks.some((c) => c.ok === false) ? ", qualche controllo non riuscito" : ""}` : null;
    case "result": return typeof b.result === "string" ? b.result.slice(0, 140) : null;
    default: return null;
  }
}

/** Flusso del lavoro: archi da→a tra uffici esistenti. */
export function edges() {
  const out = [];
  for (const o of OFFICES) for (const to of o.passa_a || []) if (byId[to]) out.push({ from: o.id, to });
  return out;
}
