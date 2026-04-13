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
  return `La chat appartiene alla creator "${creator.name}" (archetipo: ${creator.archetype}).

TONO CREATOR: ${creator.shortDescription}

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
