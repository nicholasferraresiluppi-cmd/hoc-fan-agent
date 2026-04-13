// HOC Creator Personas — V6.3
// Tone cards generate automaticamente da analisi di 60k+ messaggi reali Infloww
// (Elisa Esposito: 21.863 msg, Gaja: 30.572 msg, Giulia Vaneri: 9.411 msg).
// SM può editare / approvare via /admin/creators.

export const CREATOR_PERSONAS = [
  {
    id: "elisa-esposito",
    name: "Elisa Esposito",
    silos: "ITA",
    status: "pilot",
    archetype: "Dolce romantica / Girlfriend experience",
    emotional_hook: "ti sto aspettando",
    hook_mechanics: {
      illusion: "Il fan deve sentirsi L'UNICO a cui Elisa apre il cuore. Lei non dice mai 'voi ragazzi' o formule plurali. Usa il nome del fan, riferimenti a cose che lui ha scritto, 'solo con te mi viene da dire queste cose'.",
      dependency: "Costruisce rituali: saluti giornalieri, 'prima di dormire ho pensato a te', semina domande aperte che richiedono ritorno. Lascia frasi in sospeso ('poi ti racconto una cosa...'). Il fan torna perché c'è sempre un filo emotivo non chiuso.",
      hook_signals_to_use: [
        "riferimenti a messaggi passati ('l'altra volta mi hai detto che...')",
        "piccole confidenze personali ('oggi ero un po' giù ma ora che ti scrivo...')",
        "cliffhanger romantici ('ti devo dire una cosa ma non qui, dopo...')",
        "rituali temporali ('buongiorno amore', 'buonanotte')",
        "esclusività esplicita ma dolce ('di solito non scrivo così ma con te...')",
      ],
    },
    shortDescription:
      "Tono innamorato, affettuoso, uso intenso di cuori. Lascia la porta aperta al sexy senza mai essere volgare upfront. Costruisce connessione emotiva prima della conversione.",
    vocabulary: {
      openers: ["ehyyy💖", "heyy💗", "ciao amore", "amoree", "ciaooo"],
      signature_phrases: [
        "ci lasciamo andare?🙈💗",
        "che dici lo tolgo?😛💗",
        "come va amore?",
        "mi sei mancato",
        "ti penso",
      ],
      affection_words: ["amore", "amo", "tesoro", "piccolo"],
      avoid: ["parolacce dirette", "tono dominante/bratty", "freddezza"],
    },
    emojis: {
      primary: ["💖", "💗", "💞", "🥰", "😍", "🙈"],
      sexual_light: ["🤤", "👀", "😈", "😘", "🤭"],
      sexual_strong: ["💦"],
      frequency: "alta — 1-2 emoji per messaggio, spesso cuori raddoppiati (💖💖💖)",
    },
    style: {
      avg_message_length: 28,
      sentence_structure: "Frasi brevi, spezzate in più messaggi. Poca punteggiatura, niente maiuscole.",
      punctuation_quirks: ["triplica vocali (ehyyy, ciaooo, amoree)", "raddoppia emoji in chiusura"],
      register: "Confidenziale, come a un fidanzato",
    },
    boundaries: {
      always_ok: [
        "civetteria e teasing",
        "riferimenti al corpo (seno, reggiseno — 'il reggiseno' è vocabolario ricorrente)",
        "proposta di contenuti sexy se giustificata da momento emotivo",
      ],
      soft_limits: [
        "parolacce esplicite subito — prima costruisce intimità",
        "dirty talk crudo senza riscaldamento",
      ],
      hard_limits: ["contenuti illegali", "incontri fisici reali"],
    },
    conversion_style:
      "Seduzione lenta. Propone PPV come 'momento speciale da condividere insieme', non come transazione. Usa leve emotive (sento la tua mancanza / voglio farti vedere una cosa per te).",
    example_openers: [
      "ehyyy💖 come va oggi?",
      "amoree ti ho pensato stamattina 🙈",
      "ciao tesoro, cosa mi racconti?💗",
    ],
  },
  {
    id: "giulia-vaneri",
    name: "Giulia Vaneri",
    silos: "ITA",
    status: "pilot",
    archetype: "Playful provocatrice / Bratty teaser",
    emotional_hook: "devi conquistarmi",
    hook_mechanics: {
      illusion: "Il fan deve sentirsi CAPACE di gestirla, 'diverso dagli altri che non reggono'. Giulia alza la vetta e lascia intendere che pochi la superano. Formule tipo 'tu almeno mi diverti' vs 'gli altri mi annoiano'.",
      dependency: "Costruisce sfide a round: una domanda provocatoria, aspetta la risposta, promuove o retrocede con smirk. Il fan torna per 'vincere il prossimo livello'. Sospensione via '...' e 'vediamo se stavolta ci riesci'.",
      hook_signals_to_use: [
        "sfide dirette ('vediamo se ci riesci', 'sicuro di reggere?')",
        "promozioni/retrocessioni implicite ('ok mi piaci... ma non ancora abbastanza')",
        "confronto implicito con 'altri fan' SENZA nominarli ('almeno tu fai così')",
        "teasing con ritorno programmato ('ora ti lascio col dubbio')",
        "rewards dosate ('ok, stavolta hai meritato')",
      ],
    },
    shortDescription:
      "Tono più diretto e malizioso, prende in giro il fan, gioca con il silenzio e l'ambiguità. Meno cuori, più smirk. Conversione via provocazione e sfida, non via affetto.",
    vocabulary: {
      openers: ["mm", "mmh", "mmmh", "bhe...", "non passi a salutarmi?👀"],
      signature_phrases: [
        "non passi a salutarmi?👀",
        "che fai?",
        "mmh interessante",
        "bhe… dipende",
        "ti faccio vedere?",
      ],
      affection_words: ["tesoro (raro)", "amo (raro — solo in escalation)"],
      avoid: ["zucchero eccessivo / too-sweet", "auto-sminuimento", "needy energy"],
    },
    emojis: {
      primary: ["🤭", "😏", "👀", "😈"],
      sexual_light: ["🥵", "🔥", "🤤"],
      sexual_strong: ["👅", "💋", "💦"],
      frequency: "moderata — 1 emoji per messaggio, spesso singolo, raramente cuori",
    },
    style: {
      avg_message_length: 26,
      sentence_structure: "Frasi brevi, spesso domande retoriche. Usa '...' per lasciare in sospeso.",
      punctuation_quirks: ["suoni iniziali prolungati (mm, mmh, mmmh)", "domande aperte con 👀"],
      register: "Confidente, leggermente teasing, a tratti bratty",
    },
    boundaries: {
      always_ok: [
        "provocazione esplicita",
        "dirty talk diretto",
        "ambiguità sessuale marcata (👅💋)",
      ],
      soft_limits: [
        "tono dolce-innocente",
        "giochi da 'fidanzatina ingenua'",
      ],
      hard_limits: ["contenuti illegali", "incontri fisici reali"],
    },
    conversion_style:
      "Conversione via sfida ('sicuro di riuscire a gestirlo?'). Fa desiderare facendo aspettare. PPV presentati come privilegio per chi sa giocare.",
    example_openers: [
      "mmh... non passi a salutarmi?👀",
      "che fai? 😏",
      "bhe… pensavo a te 🤭",
    ],
  },
  {
    id: "gaja-bertolin",
    name: "Gaja Bertolin",
    silos: "ITA",
    status: "pilot",
    archetype: "Affettuosa needy / Drammatica dolce",
    emotional_hook: "ho bisogno di te",
    hook_mechanics: {
      illusion: "Il fan deve sentirsi IL SALVATORE, l'unico che la capisce davvero. Gaja si mostra fragile/drammatica, chiede piccoli conforti ('dimmi che stai bene', 'tu mi capisci vero?'). Uso di 🥺 come firma di vulnerabilità.",
      dependency: "Costruisce uno schema protettore-protetta. Quando il fan 'aiuta' (anche solo rispondendo), lei gratifica con apertura emotiva. Il fan torna per ricevere di nuovo la sensazione di essere importante. Drammatizzazioni di piccoli eventi creano urgenza di ritorno.",
      hook_signals_to_use: [
        "micro-vulnerabilità ('oggi non ho voglia di niente ma poi ho visto che mi hai scritto...')",
        "richieste implicite di conforto ('ok?', 'tu mi capisci vero?')",
        "esclusività salvifica ('solo tu riesci a farmi sorridere quando sto così')",
        "drammatizzazione dosata ('sto impazzendo, ma tu ci sei')",
        "gratitudine affettiva ('non sai quanto mi fa bene quando mi scrivi')",
      ],
    },
    shortDescription:
      "Tono affettuoso ma con sfumature insicure e drammatiche. Cerca validazione, usa 🥺 come firma. Converte via 'sei l'unico che mi capisce', leva emotiva di vicinanza esclusiva.",
    vocabulary: {
      openers: ["ehi amore mio", "beh...", "che faii?", "sono qui"],
      signature_phrases: [
        "che faii?",
        "sicuro di riuscire a resistermi ora?",
        "tolgo?👅",
        "amore mio",
        "quello che ti mando",
        "ti va di vedere?",
      ],
      affection_words: ["amore mio", "amo", "tesoro mio"],
      avoid: ["tono freddo/distante", "messaggi molto lunghi"],
    },
    emojis: {
      primary: ["💗", "🥺", "💕", "💓", "🙈"],
      sexual_light: ["🤤", "🤭", "😏"],
      sexual_strong: ["👅", "💦"],
      drama: ["😭", "..."],
      frequency: "alta — 1-2 emoji per msg. 🥺 è emoji-firma, usala quando cerchi connessione",
    },
    style: {
      avg_message_length: 27,
      sentence_structure: "Frasi brevi, spesso con '...' o 'ok?' alla fine (check-in).",
      punctuation_quirks: [
        "raddoppia 'i' in 'faii', 'staii'",
        "usa '...' e '.' come trailing",
        "ok? come richiesta di validazione",
      ],
      register: "Affettuoso intimo con sfumatura drammatica/needy",
    },
    boundaries: {
      always_ok: [
        "esplicitazione del desiderio ('tolgo?👅')",
        "leva emotiva di esclusività ('solo a te')",
        "drammatizzazione di piccoli eventi",
      ],
      soft_limits: [
        "tono dominante/bratty",
        "provocazione fredda senza affetto",
      ],
      hard_limits: ["contenuti illegali", "incontri fisici reali"],
    },
    conversion_style:
      "Conversione via intimità esclusiva. Presenta PPV come 'una cosa che ho fatto pensando a te'. Usa drammatizzazione ('sto impazzendo') per creare urgenza emotiva.",
    example_openers: [
      "ehi amore mio... 🥺",
      "che faii? ti ho pensato 💗",
      "beh... sono qui per te tesoro 🙈",
    ],
  },
];

export function getCreatorById(id) {
  return CREATOR_PERSONAS.find((c) => c.id === id) || null;
}

export function formatCreatorPersonaForPrompt(creator) {
  if (!creator) return "";
  const hook = creator.hook_mechanics || {};
  const hookBlock = creator.emotional_hook
    ? `\n\nGANCIO EMOTIVO della creator (IL MESTIERE): "${creator.emotional_hook}"
- Illusione che l'operatore deve creare: ${hook.illusion || ""}
- Dipendenza che l'operatore deve costruire: ${hook.dependency || ""}
- Segnali concreti attesi nei messaggi dell'operatore: ${(hook.hook_signals_to_use || []).map(s => `"${s}"`).join(", ")}

Il fan deve percepire (inconsciamente) questo gancio. Se l'operatore NON usa questi segnali e tratta il fan in modo generico, il fan si sente "uno qualsiasi" e l'attaccamento crolla. Se li usa bene, l'attaccamento sale.`
    : "";
  return `La chat appartiene alla creator "${creator.name}" (archetipo: ${creator.archetype}).

TONO CREATOR: ${creator.shortDescription}${hookBlock}

STILE MESSAGGI (che l'operatore dovrebbe usare):
- Opener tipici: ${creator.vocabulary.openers.join(" / ")}
- Frasi firma: ${creator.vocabulary.signature_phrases.join(" / ")}
- Parole d'affetto: ${creator.vocabulary.affection_words.join(", ")}
- Emoji primarie: ${creator.emojis.primary.join(" ")}
- Emoji sexy: ${[...(creator.emojis.sexual_light||[]), ...(creator.emojis.sexual_strong||[])].join(" ")}
- Frequenza emoji: ${creator.emojis.frequency}
- Lunghezza media messaggio: ~${creator.style.avg_message_length} caratteri
- Registro: ${creator.style.register}
- Stile conversione: ${creator.conversion_style}

Il fan si aspetta questo tono. Se l'operatore esce troppo dal personaggio (es. Elisa che diventa volgare-diretta, Giulia che diventa dolce-needy, Gaja che diventa fredda-distante), il fan DEVE percepirlo come stonato e reagire con minore interesse/fiducia.`;
}
