/**
 * role-funnels.js — Il "funnel degli strumenti" per ruolo.
 *
 * Ogni ruolo ha una spina dorsale di strumenti che tocca per fare il suo lavoro.
 * Questo modulo la rende ESPLICITA: per ogni profilo (operatore, manager,
 * leadership, people) definisce il percorso come SEQUENZA di passi, dove ogni
 * passo dichiara lo strumento, il PERCHÉ (non il bottone) e cosa ci fai.
 *
 * Design (cfr CLAUDE.md decision log 2026-07-25):
 *   - UN engine, N funnel come DATI. Aggiungere un ruolo = aggiungere dati, non
 *     codice. Niente 4 tour su misura da mantenere.
 *   - Si insegna il FUNNEL (sequenza + perché + decisione), non la UI: le pagine
 *     cambiano a ogni PR, la logica del percorso no.
 *   - Ogni funnel segue lo stesso metodo HOC — diagnostica → allena/agisci →
 *     misura — declinato sull'altezza del ruolo.
 *   - Selezione per CAPABILITY/scope (robusta ai ruoli custom + unione
 *     multi-ruolo), non per nome-ruolo hardcodato. Cfr src/lib/rbac.js.
 *
 * PURO DATO: nessun import React/lucide qui, così è importabile ovunque.
 * Le icone sono stringhe → mappate a componente lato render (RoleFunnelGuide).
 *
 * ⚠️ Il CONTENUTO dei funnel è la parte che conta e va validata col board:
 * è il modello mentale che l'utente si forma dell'app. Modificarlo = editare
 * questi array, niente logica.
 */

const SCOPE_RANK = { own: 1, team: 2, all: 3 };

/** true se il capability `cap` ha scope >= `min` nell'oggetto capabilities di whoami. */
function scopeAtLeast(capabilities, cap, min) {
  const s = capabilities && capabilities[cap];
  if (!s) return false;
  return (SCOPE_RANK[s] || 0) >= (SCOPE_RANK[min] || 0);
}

export const ROLE_FUNNELS = [
  {
    key: "operator",
    label: "Operatore",
    tagline: "Il tuo loop di performance: diagnostica → allena → agisci → misura.",
    forWhom: "Chi lavora in chat con i fan.",
    steps: [
      {
        phase: "Diagnostica",
        title: "Il tuo profilo",
        href: "/profilo",
        icon: "UserCircle2",
        why: "Dove sei forte e dove sei carente, letto dai tuoi turni reali — non da un'opinione.",
        do: "Parti da qui a ogni ciclo: individua il tuo gap principale.",
      },
      {
        phase: "Diagnostica",
        title: "Il tuo score",
        href: "/me/score",
        icon: "Gauge",
        why: "Come vieni valutato e perché il numero è quello. Se vuoi la versione lenta, apri il tutorial dello score.",
        do: "Capisci quali comportamenti spostano il tuo punteggio.",
      },
      {
        phase: "Allena",
        title: "Simulatore Academy",
        href: "/",
        icon: "GraduationCap",
        why: "Alleni i comportamenti che monetizzano contro fan AI, senza rischi sul vivo.",
        do: "Ripeti gli scenari sul tuo gap finché il gesto diventa automatico.",
      },
      {
        phase: "Allena",
        title: "Game tape",
        href: "/academy/tapes",
        icon: "Film",
        why: "Le sequenze di vendita reali dei tuoi creator, curate. Impari dai migliori, non dalla teoria.",
        do: "Studia come chi converte davvero apre, costruisce e chiude.",
      },
      {
        phase: "Allena",
        title: "Il tuo coaching",
        href: "/me/coaching",
        icon: "Route",
        why: "Gli scenari su misura assegnati esattamente sul comportamento in cui sei carente.",
        do: "Segui il percorso: è cucito sul tuo gap, non generico.",
      },
      {
        phase: "Agisci",
        title: "Il tuo turno",
        href: "/me/turno",
        icon: "Radar",
        why: "Il cockpit che ti guida durante lo shift, sul vivo — dove il metodo diventa vendita.",
        do: "Tienilo aperto in turno e applica ciò che hai allenato.",
      },
      {
        phase: "Misura",
        title: "Il tuo percorso",
        href: "/me/percorso",
        icon: "TrendingUp",
        why: "L'esito del loop: stai davvero migliorando, turno dopo turno? È la prova che l'allenamento trasferisce.",
        do: "Chiudi il cerchio e riparti dalla diagnostica.",
      },
    ],
  },

  {
    key: "manager",
    label: "Chatter / team manager",
    tagline: "Guida il tuo team: leggi chi rende, interveni sul gap, misura l'effetto.",
    forWhom: "Chi coordina un gruppo di operatori.",
    steps: [
      {
        phase: "Diagnostica il team",
        title: "Creator-first",
        href: "/leaderboard/creators",
        icon: "Users",
        why: "La foto della performance per creator: chi rende e chi no nel tuo perimetro.",
        do: "Individua i creator e le persone che meritano un drill-down.",
      },
      {
        phase: "Diagnostica il team",
        title: "Scheda operatore",
        href: "/leaderboard/operational",
        icon: "UserSearch",
        why: "Il drill-down sul singolo: metodo × resa, skill vs fortuna-del-creator. È la scheda usata da tutta l'app.",
        do: "Da ogni nome apri la sua scheda e leggi dove interviene il coaching.",
      },
      {
        phase: "Agisci",
        title: "Coaching Center",
        href: "/admin/coaching-center",
        icon: "GraduationCap",
        why: "Assegni i percorsi di training alla persona giusta, sul gap giusto.",
        do: "Trasforma la diagnosi in un'assegnazione concreta.",
      },
      {
        phase: "Agisci",
        title: "Action Center",
        href: "/admin/action-center",
        icon: "Target",
        why: "Gli underperformer del periodo, pronti da gestire fino all'export per HR.",
        do: "Lavora la coda: chi va supportato, chi spostato.",
      },
      {
        phase: "Agisci",
        title: "Cockpit CM",
        href: "/cm-cockpit",
        icon: "Gauge",
        why: "Traccia le supervisioni e l'affiancamento sul turno del tuo team.",
        do: "Registra gli affiancamenti così il coaching è documentato.",
      },
      {
        phase: "Misura",
        title: "Loop azione → esito",
        href: "/admin/loop",
        icon: "RefreshCw",
        why: "Il coaching ha spostato l'ago? Qui chiudi il cerchio con l'esito reale, non con l'intenzione.",
        do: "Verifica il transfer: se non muove i numeri, ricalibra.",
      },
    ],
  },

  {
    key: "leadership",
    label: "Sales manager / leadership",
    tagline: "Performance e decisioni d'organizzazione: leggi, decidi, agisci sui numeri.",
    forWhom: "Chi ha visibilità e responsabilità su tutta l'org.",
    steps: [
      {
        phase: "Leggi la performance",
        title: "Sales CP",
        href: "/leaderboard/sales-cp",
        icon: "DollarSign",
        why: "La leaderboard autorevole (score CP v3): il riferimento per le decisioni HR sui chatter.",
        do: "Parti da qui per la foto della performance di vendita.",
      },
      {
        phase: "Leggi la performance",
        title: "Dashboard SM",
        href: "/admin/dashboard",
        icon: "LayoutDashboard",
        why: "La vista d'insieme del sales management, sopra le singole leaderboard.",
        do: "Usala per la lettura macro prima di scendere nel dettaglio.",
      },
      {
        phase: "Leggi la performance",
        title: "Profilo operatore",
        href: "/admin/operator-signals",
        icon: "UserSearch",
        why: "Metodo × resa per operatore: separa la skill dalla fortuna-del-creator, dal warehouse.",
        do: "Distingui chi ha il metodo da chi cavalca un creator forte.",
      },
      {
        phase: "Decidi e agisci",
        title: "Action Center",
        href: "/admin/action-center",
        icon: "Target",
        why: "Gli underperformer del periodo, con l'export pronto per HR.",
        do: "Trasforma la lettura in azioni HR tracciabili.",
      },
      {
        phase: "Decidi e agisci",
        title: "Coaching Center",
        href: "/admin/coaching-center",
        icon: "GraduationCap",
        why: "Le assegnazioni formali di training per periodo, per persona.",
        do: "Indirizza lo sviluppo dove i segnali dicono che serve.",
      },
      {
        phase: "Comp & decisioni economiche",
        title: "P&L Live",
        href: "/admin/pnl-live",
        icon: "Wallet",
        why: "Il conto economico per creator e gli scaglioni a confronto.",
        do: "Lega la performance alla marginalità reale.",
      },
      {
        phase: "Comp & decisioni economiche",
        title: "Comp Review",
        href: "/admin/comp-review",
        icon: "Activity",
        why: "La hot list delle anomalie di compensazione, dove guardare per prima.",
        do: "Interveni sulle anomalie prima che diventino casi.",
      },
    ],
  },

  {
    key: "people",
    label: "People / HR",
    tagline: "Il ciclo di vita delle persone: diagnosi → sviluppo → anagrafica e governance.",
    forWhom: "Chi gestisce le persone post-firma.",
    steps: [
      {
        phase: "Diagnosi persone",
        title: "Action Center",
        href: "/admin/action-center",
        icon: "Target",
        why: "Gli underperformer del periodo, con l'export HR già pronto. È il punto d'ingresso people.",
        do: "Parti dalla lista: chi ha bisogno di un intervento strutturato.",
      },
      {
        phase: "Diagnosi persone",
        title: "Profilo operatore",
        href: "/admin/operator-signals",
        icon: "UserSearch",
        why: "Dove ogni persona è carente, in modo diagnostico e non punitivo — dal comportamento reale.",
        do: "Usa i segnali per un colloquio basato sui fatti, non sulle impressioni.",
      },
      {
        phase: "Sviluppo",
        title: "Coaching Center",
        href: "/admin/coaching-center",
        icon: "GraduationCap",
        why: "Il piano di sviluppo per persona e periodo: dal gap al percorso di training.",
        do: "Formalizza il percorso e assegnalo.",
      },
      {
        phase: "Sviluppo",
        title: "Seniority",
        href: "/admin/seniority",
        icon: "Medal",
        why: "Livelli e gate del career ladder: come si cresce e quando.",
        do: "Allinea sviluppo e progressione di livello.",
      },
      {
        phase: "Anagrafica & governance",
        title: "Team",
        href: "/admin/team",
        icon: "UserCircle2",
        why: "Composizione delle squadre e assegnazioni.",
        do: "Tieni aggiornata la mappa di chi sta con chi.",
      },
      {
        phase: "Anagrafica & governance",
        title: "Profili dipendenti",
        href: "/admin/employee-profiles",
        icon: "Contact",
        why: "L'anagrafica delle persone: start date, ruolo, dati che alimentano il resto.",
        do: "Verifica che i dati sorgente siano corretti — tutto a valle ne dipende.",
      },
      {
        phase: "Anagrafica & governance",
        title: "Contestazioni",
        href: "/admin/disputes",
        icon: "MessageSquareWarning",
        why: "La coda delle dispute, con evidenza congelata per la policy.",
        do: "Gestisci i casi con la traccia scritta, non a memoria.",
      },
    ],
  },
];

const FUNNELS_BY_KEY = Object.fromEntries(ROLE_FUNNELS.map((f) => [f.key, f]));

/** Ritorna il funnel per chiave (o undefined). */
export function getFunnel(key) {
  return FUNNELS_BY_KEY[key];
}

/**
 * Sceglie quali funnel mostrare a un utente e quale è il primario, dai dati di
 * /api/whoami. Progressive disclosure: un operatore vede solo il suo percorso
 * (niente strumenti admin che gli darebbero 403); man mano che lo scope cresce
 * si sbloccano gli altri.
 *
 * @param {{ admin?: boolean, capabilities?: Record<string,string> }} whoami
 * @returns {{ visibleKeys: string[], primaryKey: string }}
 */
export function selectFunnels(whoami) {
  const caps = (whoami && whoami.capabilities) || {};
  const isAdmin = !!(whoami && whoami.admin);
  const hasAllScores = isAdmin || scopeAtLeast(caps, "scores.view", "all");
  const hasTeamScores = hasAllScores || scopeAtLeast(caps, "scores.view", "team");

  // operator è la base: sempre presente.
  const visibleKeys = ["operator"];
  if (hasTeamScores) visibleKeys.push("manager");
  if (hasAllScores) visibleKeys.push("leadership", "people");

  let primaryKey = "operator";
  if (hasAllScores) primaryKey = "leadership";
  else if (hasTeamScores) primaryKey = "manager";

  return { visibleKeys, primaryKey };
}
