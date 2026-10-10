/**
 * Prova del compito (10/10/2026): per ogni tipo di persona, i lavori che deve riuscire a fare dall'inizio
 * alla fine. Non «la pagina si vede?» ma «Antonio riesce a fare il suo lavoro?»: esito riuscito/non riuscito.
 *
 * Li esegue il robot del giro (scripts/qualita/giro.mjs) con i permessi della persona («Vedi come»).
 * Dati puri: la pagina /admin/qualita li mostra, il robot li riceve da /api/admin/qualita/plan.
 *
 * Passi:
 *   { goto: "/path" }                          apre la pagina e aspetta che si fermi
 *   { click: "css" }                           clic sul primo elemento che corrisponde (e attesa)
 *   { expectText: "testo" | ["a","b"] }        tutti i testi devono comparire (maiuscole indifferenti)
 *   { expectAnyText: ["a","b"] }               almeno uno
 *   { expectNotText: ["a","b"] }               nessuno deve comparire
 *   { expectCount: "css", min: n }             almeno n elementi
 *   { expectMoney: true }                      almeno un importo in dollari a schermo
 * Valori speciali nei testi: "{creators}" = le creator assegnate alla persona (tutte devono comparire).
 * Ogni compito fallisce anche se durante i passi un'API risponde 403/5xx o la pagina va in errore.
 */

// Testi che una pagina mostra quando qualcosa non va: valgono per tutti i compiti
export const ERROR_TEXTS = ["non hai il permesso", "application error", "qualcosa è andato storto", "errore di caricamento", "serve un admin"];

export const TASKS = [
  // ---- Chi guida le vendite (Sales Manager, team lead) ----
  {
    id: "sm-settimana", for: "sales", title: "Vedere chi seguire questa settimana",
    why: "È la pagina iniziale della vista Sales Manager: se è vuota, il lunedì non parte.",
    steps: [{ goto: "/admin/settimana" }, { expectNotText: ["nessuna creator", "non vedrai numeri"] }, { expectMoney: true }],
  },
  {
    id: "sm-scheda-operatore", for: "sales", title: "Aprire la scheda di un operatore dalla classifica",
    why: "Il colloquio parte dalla scheda: classifica → nome → numeri della persona.",
    steps: [{ goto: "/leaderboard/sales-cp" }, { expectCount: "a[href^='/leaderboard/operational/']", min: 1 }, { click: "a[href^='/leaderboard/operational/']" }, { expectMoney: true }],
  },
  {
    id: "sm-le-mie-creator", for: "sales", title: "Vedere revenue e chat delle sue creator",
    why: "Le creator assegnate devono comparire tutte: se ne manca una, l'assegnazione non funziona.",
    steps: [{ goto: "/admin/le-mie-creator" }, { expectText: "{creators}" }, { expectMoney: true }],
  },
  {
    id: "sm-sotto-soglia", for: "sales", title: "Vedere chi è sotto soglia",
    why: "Action Center: le decisioni sugli operatori in difficoltà.",
    steps: [{ goto: "/admin/action-center" }, { expectNotText: ["nessuna creator"] }],
  },
  {
    id: "sm-coaching", for: "sales", title: "Vedere chi far crescere",
    why: "Coaching Center: chi allenare e su cosa.",
    steps: [{ goto: "/admin/coaching-center" }, { expectNotText: ["nessuna creator"] }],
  },

  // ---- Admin / direzione ----
  {
    id: "adm-pnl", for: "admin", title: "Leggere il P&L Live del mese",
    why: "Il numero principale della direzione: deve esserci e avere importi.",
    steps: [{ goto: "/admin/pnl-live" }, { expectMoney: true }],
  },
  {
    id: "adm-alert", for: "admin", title: "Aprire gli alert operativi",
    why: "Se gli alert non si aprono, nessuno vede i problemi che il sistema trova.",
    steps: [{ goto: "/admin/alerts" }, { expectAnyText: ["alert", "nessun alert", "tutto a posto"] }],
  },
  {
    id: "adm-membri", for: "admin", title: "Gestire membri e ruoli",
    why: "Membri deve elencare le persone e dire il vero sui loro accessi.",
    steps: [{ goto: "/admin/ruoli" }, { expectText: "membri" }, { expectCount: "tbody tr", min: 1 }],
  },

  // ---- Operatore (pagine personali con i dati di un operatore vero) ----
  {
    id: "op-progresso", for: "operator", title: "Vedere il proprio progresso",
    why: "La pagina che motiva l'operatore: deve avere i suoi dati, non «non collegato».",
    steps: [{ goto: "/me/progresso" }, { expectNotText: ["non collegato", "non risulti collegato"] }],
  },
  {
    id: "op-score", for: "operator", title: "Vedere i propri score",
    why: "I due score con il loro nome: devono esserci numeri.",
    steps: [{ goto: "/me/score" }, { expectNotText: ["non collegato", "non risulti collegato"] }, { expectCount: "main", min: 1 }],
  },
  {
    id: "op-turno", for: "operator", title: "Aprire il proprio turno",
    why: "Il copilota del turno: la prima cosa che l'operatore apre.",
    steps: [{ goto: "/me/turno" }, { expectNotText: ["non collegato", "non risulti collegato"] }],
  },
];

// Operatori veri con cui provare le pagine personali (uno per tipo del pilota, set 2026): forte, medio, nuovo.
export const OPERATOR_PERSONAS = ["Andrea Terranova", "Daniela Marcucci", "Gabriele Timperi"];

/** Tipo di persona per scegliere i compiti: admin | sales | operator | altro */
export function personaKind(p) {
  if (p.employee) return "operator";
  if (p.admin) return "admin";
  if (["team", "all"].includes(p.caps?.["scores.view"])) return "sales";
  return "altro";
}

export const tasksFor = (p) => TASKS.filter((t) => t.for === personaKind(p));
