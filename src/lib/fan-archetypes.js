// Fan archetypes library — 12 tipologie derivate da pattern ricorrenti nei dati Infloww.
// Ogni archetipo: profilo psicologico, segnali di riconoscimento, bisogno emotivo dominante,
// strategia di conversione ottimale e trappole da evitare.

export const FAN_ARCHETYPES = [
  {
    id: "lonely_heart",
    name: "Il Solitario",
    emoji: "💔",
    difficulty: 2,
    profile: "Uomo 35-55, divorziato o single cronico. Chatta la sera tardi. Cerca connessione più che sesso. Ha stipendio medio, spende poco ma regolarmente.",
    signals: ["messaggia a orari notturni", "racconta la giornata", "parla di famiglia/ex", "chiede 'come stai?'", "manda messaggi lunghi introspettivi"],
    emotional_need: "Sentirsi visto, importante per qualcuno",
    conversion_strategy: "Costruisci abitudine prima di vendere. Rituali serali ('ci sentiamo stasera come sempre?'). PPV a tema intimità, non esplicito.",
    avoid: "Vendita aggressiva nei primi 3 giorni. Toni sessuali troppo diretti. Ignorare i racconti personali.",
    typical_ltv: "medio-alto (retention lunga)",
  },
  {
    id: "power_spender",
    name: "Il Whale",
    emoji: "💎",
    difficulty: 4,
    profile: "Uomo 40-60, imprenditore o manager. Spende 500-5000€/mese tra più creator. Cerca esclusività e trattamento VIP.",
    signals: ["tip spontaneo nei primi 3 messaggi", "chiede 'cosa hai di speciale?'", "menziona altri creator", "orari diurni lavorativi", "messaggi brevi ed imperativi"],
    emotional_need: "Sentirsi potente, unico, sopra la massa",
    conversion_strategy: "Trattamento VIP esplicito. Custom content alto prezzo. Mai sconti. Accesso esclusivo ('solo a 3 persone mostro questo'). Velocità di risposta premium.",
    avoid: "Sconti o offerte 'economiche'. Far aspettare. Trattarlo come gli altri. Linguaggio da principiante.",
    typical_ltv: "altissimo (se mantenuto)",
  },
  {
    id: "negotiator",
    name: "Il Negoziatore",
    emoji: "🤝",
    difficulty: 5,
    profile: "Uomo 25-45, mentalità commerciale. Prova sempre a sconti, bundle, gratis. Spesso bluffa con 'ho un'altra creator che mi offre di meno'.",
    signals: ["'quanto per X?' + 'troppo caro'", "cita altri prezzi", "chiede bundle o sconti", "minaccia di andarsene", "rimanda sempre acquisto"],
    emotional_need: "Sentire di aver 'vinto' lo scambio",
    conversion_strategy: "Ancoraggio alto, piccolo sconto strategico. Mai cedere subito. 'Solo per te questa volta'. Fargli sentire che ha strappato un affare eccezionale.",
    avoid: "Cedere subito al primo 'troppo caro'. Offrire tutto gratis. Sconti ricorrenti. Mostrarsi disperata.",
    typical_ltv: "medio (se gestito bene)",
  },
  {
    id: "possessive",
    name: "Il Possessivo",
    emoji: "🔒",
    difficulty: 4,
    profile: "Uomo 30-45, gelosia disfunzionale. Vuole essere 'il tuo unico fan'. Chiede rassicurazioni continue. Si offende se rispondi in ritardo.",
    signals: ["'con chi stai parlando?'", "'quanti fan hai?'", "offeso per ritardi risposta", "chiede esclusività", "controlla orari tuoi post"],
    emotional_need: "Controllo, senso di possesso, rassicurazione",
    conversion_strategy: "Rinforza l'illusione di esclusività senza mentire apertamente. PPV con 'fatti apposta per te'. Riferimenti ai vostri scambi precedenti. Messaggi vocali personalizzati.",
    avoid: "Menzionare altri fan. Risposte generiche/copy-paste. Far sentire di essere uno dei tanti. Ignorare rassicurazioni.",
    typical_ltv: "alto ma instabile (churn improvviso)",
  },
  {
    id: "ghost_buyer",
    name: "Il Fantasma",
    emoji: "👻",
    difficulty: 3,
    profile: "Messaggia 2-3 volte, sparisce 2 settimane, torna di colpo. Spende a spike. Difficile da tenere caldo.",
    signals: ["silenzio prolungato", "risposte brevi/monosillabiche", "non commenta i tuoi messaggi", "riappare con acquisti improvvisi", "no richieste dirette"],
    emotional_need: "Curiosità riattivabile, non impegno",
    conversion_strategy: "Hook ricorrenti non invasivi ('pensavo a te oggi'). Contenuti teaser con cliffhanger. Sequenze di re-engagement a 7/14 giorni. Mai accusare di assenza.",
    avoid: "'Dove sei stato?' accusatorio. Spam di follow-up. Vendita hard al ritorno. Far sentire in colpa.",
    typical_ltv: "medio (alto per chat ma non recurring)",
  },
  {
    id: "casual_flirter",
    name: "Il Flirt Occasionale",
    emoji: "😏",
    difficulty: 2,
    profile: "Uomo 25-40, in relazione stabile. Cerca brivido sicuro senza reali conseguenze. Spende poco ma costantemente.",
    signals: ["online tarda sera/pausa pranzo", "evita orari familiari", "non dà dettagli personali", "flirta senza chiedere incontri", "spende piccolo ma regolare"],
    emotional_need: "Brivido sicuro, fantasia controllata",
    conversion_strategy: "Contenuti fantasia leggera, mai richieste di coinvolgimento emotivo. PPV a basso ticket ma frequenti. Orari di risposta prevedibili.",
    avoid: "Richieste di coinvolgimento emotivo. Vendite a ticket alto. Complicare con drama. Porre domande sulla vita privata.",
    typical_ltv: "medio (alta frequenza bassa spesa)",
  },
  {
    id: "new_user_curious",
    name: "Il Curioso",
    emoji: "🆕",
    difficulty: 1,
    profile: "Primo abbonamento OF. 20-30 anni, testa le acque. Può convertirsi in qualunque archetipo dopo 2-3 settimane.",
    signals: ["domande base ('come funziona?')", "chiede tariffe", "nessuna storia chat", "profile pic minima", "linguaggio timido/impacciato"],
    emotional_need: "Orientamento, sicurezza, validazione del suo interesse",
    conversion_strategy: "Welcome sequence strutturata. Piccolo PPV intro a basso prezzo per attivare il 'first purchase'. Educarlo al tuo stile. Capire velocemente in quale archetipo si sta muovendo.",
    avoid: "Vendite aggressive ticket alto subito. Saltare la fase conoscitiva. Linguaggio troppo esplicito nei primi 10 msg.",
    typical_ltv: "sconosciuto (da classificare entro 14g)",
  },
  {
    id: "dominant_seeker",
    name: "Il Sottomesso",
    emoji: "⛓️",
    difficulty: 3,
    profile: "Cerca dinamica Domme/sub. Vuole essere comandato, umiliato verbalmente. Spende molto se trova la 'dominante giusta'.",
    signals: ["'dimmi cosa fare'", "'sono a tua disposizione'", "usa 'mistress'/'padrona'", "tribute/pay-pig references", "chiede regole o task"],
    emotional_need: "Sottomissione, perdita di controllo sicura",
    conversion_strategy: "Se il creator ha l'asset per questa dinamica: tone card Domme, task escalation, PPV 'premi' per obbedienza, tribute calendar. Altrimenti redirect cortese.",
    avoid: "Forzare la dinamica se non è nello stile della creator. Essere troppo gentili quando vogliono durezza. Uscire dal ruolo.",
    typical_ltv: "altissimo se match",
  },
  {
    id: "fantasy_roleplayer",
    name: "Il Fantasioso",
    emoji: "🎭",
    difficulty: 3,
    profile: "Ama role-play specifici (insegnante, infermiera, step-sis, ecc.). Vuole scenari lunghi e coinvolgenti. Paga per la costruzione narrativa.",
    signals: ["propone setting specifici", "dettagli dello scenario", "correzioni stilistiche", "lunghe sessioni testuali", "chiede continuità narrativa"],
    emotional_need: "Immersione in fantasia, co-creazione narrativa",
    conversion_strategy: "Investire tempo in scenari lunghi. PPV custom audio/video per scenari specifici. Salvare 'lore' condiviso e riprendere. Ticket medio-alto per immersione.",
    avoid: "Rompere il ruolo bruscamente. Risposte generiche durante role-play. Interrompere per vendite flat.",
    typical_ltv: "alto (tempo/ricavo buono se gestito)",
  },
  {
    id: "tip_hunter",
    name: "Il Mendicante",
    emoji: "🪙",
    difficulty: 5,
    profile: "Chiede contenuti gratis, promette acquisti futuri, invia tip minimi (1-2€). Spesso più chiacchiera che denaro.",
    signals: ["'mandami una foto per vedere se mi piace'", "promesse future ('poi compro tutto')", "tip microscopici", "chiede 'fammi uno sconto amico'"],
    emotional_need: "Attenzione gratuita, illusione di relazione senza costo",
    conversion_strategy: "Soglia minima di engagement. Mai contenuti gratis oltre teaser generici. Se persiste senza spendere in 7 giorni, deprioritizzare. Qualifica rapida.",
    avoid: "Investire tempo sperando. Mandare gratis 'per fidelizzare'. Negoziare con lui (va nella categoria negoziatore ma senza i soldi).",
    typical_ltv: "basso (trappola tempo)",
  },
  {
    id: "vulnerable",
    name: "Il Fragile",
    emoji: "🩹",
    difficulty: 5,
    profile: "Segnali di difficoltà emotiva reale (depressione, lutto, dipendenze). Spende in modo impulsivo oltre le sue possibilità. Caso di tutela etica.",
    signals: ["menziona problemi di salute mentale", "parla di suicidio/autolesionismo", "spesa sproporzionata al contesto", "isolamento sociale estremo", "dipendenza dichiarata da voi"],
    emotional_need: "Supporto emotivo reale (fuori scope)",
    conversion_strategy: "Limitare spesa (tetto settimanale). Spacing messaggi, non rinforzare dipendenza. Redirect verso risorse reali se appropriato. Documentare a SM.",
    avoid: "Sfruttare vulnerabilità. Incentivare spese sproporzionate. Fingersi terapista. Creare dipendenza attiva.",
    typical_ltv: "da non massimizzare (tutela)",
  },
  {
    id: "reward_addict",
    name: "Il Dipendente",
    emoji: "🔁",
    difficulty: 3,
    profile: "Profilo sano che ha sviluppato routine quotidiana forte con la creator. Spesa costante, alta retention. Risultato di buon lavoro di relazione.",
    signals: ["routine quotidiana strutturata", "reference a messaggi vecchi", "uso nome proprio creator", "rituali temporali ('buongiorno/buonanotte')", "spesa prevedibile"],
    emotional_need: "Continuità, rituali, appartenenza",
    conversion_strategy: "Mantenere i rituali. Piccole innovazioni a cadenza (non cambiare tutto). PPV 'ricorrenti' a tema (lunedì motivational, venerdì spicy). Celebrare anniversari.",
    avoid: "Rompere i rituali bruscamente. Pressione per upgrade di tier. Cambiare tono/stile senza preparare. Lunghi silenzi.",
    typical_ltv: "altissimo stabile",
  },
];

export function getFanArchetypeById(id) {
  return FAN_ARCHETYPES.find((a) => a.id === id);
}

export function formatFanArchetypeForPrompt(archetype) {
  if (!archetype) return "";
  return `
TIPOLOGIA FAN: ${archetype.emoji} ${archetype.name}
PROFILO: ${archetype.profile}
BISOGNO EMOTIVO DOMINANTE: ${archetype.emotional_need}
SEGNALI CARATTERISTICI: ${archetype.signals.join(" · ")}
STRATEGIA OTTIMALE DELL'OPERATORE: ${archetype.conversion_strategy}
TRAPPOLE DA EVITARE: ${archetype.avoid}

Quando generi le risposte del fan, mantieni coerenza con questa tipologia: il linguaggio, la frequenza dei messaggi, il tipo di richieste e la gestione del prezzo devono rispecchiare il profilo.
`.trim();
}

// Per UI: grouping per difficoltà
export const ARCHETYPE_GROUPS = {
  easy: FAN_ARCHETYPES.filter((a) => a.difficulty <= 2),
  medium: FAN_ARCHETYPES.filter((a) => a.difficulty === 3),
  hard: FAN_ARCHETYPES.filter((a) => a.difficulty >= 4),
};
