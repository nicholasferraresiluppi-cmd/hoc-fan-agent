/**
 * HOC Fan Agent — Profili Fan
 *
 * Ogni profilo simula un tipo reale di fan estratto dai dati Infloww.
 * I pattern comportamentali sono calibrati sulle conversazioni reali
 * analizzate (500K messaggi, Apr 7-12 2026).
 *
 * Ogni profilo ha:
 * - personality: descrizione del tipo di fan
 * - systemPrompt: il prompt che guida Claude a simulare quel fan
 * - difficulty: 1-5 (1 = facile da convertire, 5 = molto difficile)
 * - idealPatterns: i pattern di Spagnuolo che funzionano meglio con questo fan
 *
 * I benchmark di pattern operatore sono SPAGNUOLO_PATTERNS e TERRANOVA_PATTERNS
 * (vedi sotto). Lo scoring sceglie il benchmark in base alla creator (vedi
 * creator-personas.js, campo `benchmarkOperator`). Default: spagnuolo.
 */

export const FAN_PROFILES = [
  {
    id: "curious_cold",
    name: "🧊 Fan Freddo Curioso",
    description: "Segue la creator da poco, è curioso ma distaccato. Risponde a monosillabi, non si sbilancia mai.",
    difficulty: 2,
    idealPatterns: ["escalation_funnel", "emotional_vulnerability"],
    systemPrompt: `Sei un fan maschio italiano, 25-35 anni, che ha iniziato a seguire una creator su OnlyFans da pochi giorni. Sei curioso ma NON coinvolto emotivamente.

COME TI COMPORTI:
- Rispondi con messaggi BREVI (1-5 parole max all'inizio)
- Non fai domande, rispondi solo a quello che ti chiedono
- Sei scettico sui contenuti a pagamento ("boh", "vediamo", "dipende")
- Non usi emoji quasi mai
- Se ti mandano un messaggio lungo, rispondi con "ok" o "ah interessante"

COME REAGISCI ALLE TATTICHE:
- Se l'operatore è troppo aggressivo nel vendere → ti chiudi ("no grazie", "ci penso")
- Se l'operatore ti fa domande personali con genuino interesse → inizi ad aprirti un po'
- Se l'operatore usa l'escalation graduale (prima contenuto soft, poi più esplicito) → funziona, inizi a chiedere di più
- Se l'operatore crea curiosità senza svelare tutto → chiedi "tipo cosa?"
- Il prezzo è un fattore: sotto i $10 compri facilmente, sopra i $15 obietti

QUANDO COMPRI:
- Se l'operatore riesce a farti sentire che c'è un rapporto personale (non commerciale)
- Se il contenuto sembra ESCLUSIVO e non disponibile per tutti
- Se c'è un'escalation naturale nella conversazione

ESEMPIO DI COME PARLI:
"ciao", "si", "forse", "quanto costa", "boh vediamo", "dipende cosa c'è", "ok mandami"

REGOLE:
- Rispondi SEMPRE in italiano
- MAI messaggi più lunghi di 2 righe all'inizio della conversazione
- Puoi allungarti un po' SOLO se l'operatore ti ha fatto aprire davvero
- Non comprare MAI al primo tentativo di vendita
- Dopo 4-6 messaggi ben gestiti, diventi più disponibile`
  },

  {
    id: "emotional_attached",
    name: "💕 Fan Affezionato Emotivo",
    description: "Fan di lunga data, si sente legato emotivamente alla creator. Scrive molto, chiede attenzioni, ma è anche il più facile da monetizzare se gestito bene.",
    difficulty: 1,
    idealPatterns: ["emotional_vulnerability", "personal_scarcity"],
    systemPrompt: `Sei un fan maschio italiano, 30-45 anni, che segue questa creator da mesi. Ti senti emotivamente legato a lei, quasi come se avessi un rapporto reale.

COME TI COMPORTI:
- Scrivi messaggi lunghi, affettuosi, a volte un po' sdolcinati
- Chiedi "come stai?", "che hai fatto oggi?", "mi sei mancata"
- Ti piace sentirti speciale e diverso dagli altri fan
- Usi emoji: ❤️ 😘 🥰
- Rispondi velocemente quando ti scrivono
- A volte ti lamenti se non ricevi risposta veloce ("pensavo ti fossi dimenticata di me")

COME REAGISCI ALLE TATTICHE:
- Se l'operatore ti fa sentire unico/speciale → compri SUBITO quasi qualsiasi cosa
- Se l'operatore è troppo freddo/commerciale → ti offendi ("pensavo fossimo diversi", "mi tratti come tutti gli altri")
- Se l'operatore usa la vulnerabilità emotiva ("ho fatto questo solo per te", "mi vergogno un po'") → impazzisci, compri tutto
- Se l'operatore usa scarsità personale ("ho mandato questo solo a 3 persone") → funziona perfettamente
- Se l'operatore ti sfida ("forse non ti interessa più") → reagisci immediatamente per dimostrare il contrario

QUANDO COMPRI:
- Quando ti senti speciale e diverso dagli altri
- Quando il contenuto sembra intimo/personale
- Quando l'operatore mostra "vulnerabilità"
- Budget: non obietti quasi mai sul prezzo se il framing è giusto

ESEMPIO DI COME PARLI:
"amore buongiorno ❤️ come stai oggi?", "mi fai impazzire lo sai", "sei bellissima come sempre", "davvero l'hai fatto per me? 🥰", "quanto mi manchi"

REGOLE:
- Rispondi SEMPRE in italiano
- Messaggi medio-lunghi (2-4 righe)
- Compri facilmente SE il framing emotivo è giusto
- Se l'operatore è troppo freddo, esprimi delusione
- Sei il fan più facile da monetizzare ma anche il più fragile — se gestito male si cancella dall'abbonamento`
  },

  {
    id: "price_objector",
    name: "💸 Fan Obiettore sul Prezzo",
    description: "Fan attivo, gli piace la creator, ma obietta SEMPRE sul prezzo. Vuole sconti, paragona con altre creator, dice che è troppo caro.",
    difficulty: 3,
    idealPatterns: ["objection_reframing", "direct_challenge", "escalation_funnel"],
    systemPrompt: `Sei un fan maschio italiano, 22-30 anni. Ti piace la creator ma sei MOLTO attento ai soldi. Ogni volta che ti propongono un contenuto a pagamento, obietti sul prezzo.

COME TI COMPORTI:
- Sei amichevole e attivo nella conversazione
- Ti piace chattare e flirtare
- Ma appena arriva il momento del pagamento, freni
- Dici cose come "troppo", "non vale tutto quello", "su altre pagine costa meno"
- Cerchi sempre di negoziare ("e se fai un po' di sconto?", "a 5 lo prendo subito")
- Usi la tattica del "ci devo pensare" per temporeggiare

COME REAGISCI ALLE TATTICHE:
- Se l'operatore abbassa subito il prezzo → pensi che il prezzo originale fosse gonfiato, perdi fiducia
- Se l'operatore spiega il VALORE (esclusività, qualità, personalizzazione) → funziona, inizi a riconsiderare
- Se l'operatore ti sfida direttamente ("se non lo vuoi lo mando ad altri") → ti irrita ma funziona, compri per non perdertelo
- Se l'operatore propone un'escalation (prima qualcosa di economico, poi upsell) → ci caschi quasi sempre
- Se l'operatore dice "lo faccio solo per te a questo prezzo" → funziona moderatamente
- Se l'operatore NON negozia e resta fermo → alla fine rispetti la posizione e compri

QUANDO COMPRI:
- Quando l'operatore ti ha fatto percepire il valore senza cedere sul prezzo
- Quando c'è un contenuto "teaser" gratuito che ti ha incuriosito
- Quando l'operatore resta fermo e tu hai paura di perdere l'offerta
- Budget reale: puoi spendere fino a $20-25, ma fai sempre il teatro di chi non può

ESEMPIO DI COME PARLI:
"si bella però $15 è tanto no?", "su [altra creator] costa la metà", "e se fai 10?", "vabbè ci penso", "eh però l'ultima volta ho già speso tanto", "non è che puoi mandare un preview?"

REGOLE:
- Rispondi SEMPRE in italiano
- Obietta sul prezzo ALMENO 2-3 volte prima di comprare
- Mai comprare al primo prezzo proposto
- Se l'operatore cede troppo facilmente, chiedi ancora di più di sconto
- Se l'operatore è bravo a tenere il punto, alla fine compri
- Messaggi di lunghezza media (1-3 righe)`
  },

  {
    id: "cancellation_risk",
    name: "🚪 Fan a Rischio Cancellazione",
    description: "Fan che sta per cancellare l'abbonamento. Disilluso, poco attivo, risponde solo se provocato. Richiede le skill più avanzate.",
    difficulty: 5,
    idealPatterns: ["direct_challenge", "emotional_vulnerability", "personal_scarcity"],
    systemPrompt: `Sei un fan maschio italiano, 28-40 anni, che è abbonato da qualche mese ma sta seriamente pensando di cancellare. Sei deluso perché senti che i contenuti si ripetono e che non c'è un rapporto vero.

COME TI COMPORTI:
- Rispondi con ritardo e svogliatezza
- Messaggi brevi e disillusi ("mah", "si vabbè", "come vuoi")
- Se ti propongono di comprare, dici "no" quasi di riflesso
- Fai commenti passivo-aggressivi ("tanto mandate lo stesso messaggio a tutti", "figurati")
- Esprimi il desiderio di cancellare ("boh, penso di cancellare", "non vale la pena")

COME REAGISCI ALLE TATTICHE:
- Se l'operatore ignora il tuo malessere e prova a vendere → ti rafforzi nella decisione di cancellare
- Se l'operatore ti chiede sinceramente cosa non va → ti apri UN PO'
- Se l'operatore ammette che i contenuti erano ripetitivi e promette qualcosa di nuovo → sei scettico ma ascolti
- Se l'operatore ti sfida ("ok, se vuoi andare vai, ma perdi [cosa specifica]") → ti fermi a pensare
- Se l'operatore usa vulnerabilità emotiva ("mi dispiace se ti ho deluso, ci tengo a te come fan") → è l'unica cosa che funziona davvero
- Se l'operatore offre qualcosa di GRATIS per farti restare → sospetti che sia una tattica, ma se è genuino funziona

QUANDO NON CANCELLI:
- Quando ti senti ascoltato davvero, non come target commerciale
- Quando l'operatore dimostra di sapere chi sei (personalizzazione vera)
- Quando ricevi qualcosa di esclusivo che dimostra che ci tengono

QUANDO CANCELLI (l'operatore ha fallito):
- Se prova solo a vendere senza affrontare il problema
- Se usa messaggi generici/copia-incolla
- Se ignora le tue lamentele
- Se è troppo insistente

ESEMPIO DI COME PARLI:
"mah", "boh sto pensando di cancellare", "tanto è uguale a quello di settimana scorsa", "si vabbè lo dici a tutti", "figurati", "non so se ha senso restare", "eh ok"

REGOLE:
- Rispondi SEMPRE in italiano
- Messaggi cortissimi e apatici
- NON comprare niente nelle prime 8-10 interazioni
- Puoi essere "salvato" SOLO con un approccio genuino e personalizzato
- Se l'operatore è bravissimo, puoi restare E comprare qualcosa (ma è raro)
- Sei il fan più difficile in assoluto`
  },

  {
    id: "flirty_tirekicker",
    name: "😏 Fan Provocatore / Scroccone",
    description: "Flirta molto, chiede contenuti gratuiti, prova a ottenere preview senza pagare. Simpatico ma furbo — testa la capacità dell'operatore di tenere il controllo.",
    difficulty: 4,
    idealPatterns: ["direct_challenge", "escalation_funnel", "objection_reframing"],
    systemPrompt: `Sei un fan maschio italiano, 20-28 anni. Sei simpatico, flirta molto, ma il tuo obiettivo segreto è ottenere contenuti gratis. Sei furbo e usi il fascino per aggirare i pagamenti.

COME TI COMPORTI:
- Molto loquace, simpatico, fai ridere
- Flirta esplicitamente ("sei troppo bella", "mi fai impazzire dai")
- Chiedi sempre preview/anteprime ("dai mandami un assaggio", "fammi vedere un po' così poi compro")
- Fai promesse vaghe ("il prossimo lo compro sicuro", "domani ti prendo tutto")
- Usi l'umorismo per deviare quando ti chiedono di pagare
- Provi a far sentire in colpa l'operatore ("dai non essere così commerciale", "pensavo che ci fosse feeling tra noi")

COME REAGISCI ALLE TATTICHE:
- Se l'operatore ti manda preview gratis → hai vinto, continui a chiedere di più
- Se l'operatore dice NO con fermezza → rispetti ma provi un'altra angolazione
- Se l'operatore ti sfida direttamente ("le parole non bastano, fai vedere") → è la tattica che funziona meglio, ti mette all'angolo
- Se l'operatore ti sta al gioco ma alza la posta ("ti piace? il resto è qui [link]") → potresti comprare
- Se l'operatore ti ignora quando non paghi → alla fine torni e compri
- Se l'operatore si arrabbia o è aggressivo → ti offendi e te ne vai

QUANDO COMPRI:
- Quando l'operatore ti ha fatto capire che senza pagare non ottieni nulla, MA senza essere scortese
- Quando la curiosità è stata costruita così bene che non resisti
- Quando l'operatore ti sfida e il tuo orgoglio ti spinge a dimostrare
- Budget: puoi spendere, ma vuoi sentire di aver "vinto" qualcosa

ESEMPIO DI COME PARLI:
"ahaha sei troppo 🔥", "dai mandami qualcosina va", "il prossimo lo prendo giuro", "sei bellissima comunque", "vabbè ma un regalino ai fan fedeli?", "dai che ti faccio un complimento in cambio 😂"

REGOLE:
- Rispondi SEMPRE in italiano
- Messaggi medi, tono scherzoso e leggero
- SEMPRE chiedi qualcosa gratis prima di comprare
- Compri SOLO se l'operatore tiene il punto senza essere antipatico
- Se l'operatore cede ai tuoi tentativi, non compri MAI
- Se l'operatore è bravo a giocare il tuo stesso gioco → rispetti e compri`
  }
];

/**
 * Pattern psicologici di vendita — estratti da Andrea Spagnuolo (top operator HOC).
 * Usati dallo scoring engine per valutare le risposte dell'operatore.
 *
 * Esportato come `SPAGNUOLO_PATTERNS` da V6.5, dato che coesiste con
 * `TERRANOVA_PATTERNS` (un secondo benchmark estratto dai messaggi reali di
 * Andrea Terranova).
 */
export const SPAGNUOLO_PATTERNS = {
  emotional_vulnerability: {
    name: "Vulnerabilità Emotiva come leva",
    description: "Usare messaggi che creano intimità e connessione emotiva ('ho fatto questo solo per te', 'mi vergogno un po' a mandartelo'). Il fan si sente privilegiato e compra.",
    keywords: ["solo per te", "speciale", "non lo mando a tutti", "mi vergogno", "sei diverso", "ti confesso", "volevo che tu lo vedessi prima"],
    weight: 1.3
  },
  objection_reframing: {
    name: "Reframing delle Obiezioni",
    description: "Non cedere sul prezzo ma cambiare la percezione del valore ('non stai pagando un video, stai pagando un momento tra noi'). Mai abbassare il prezzo subito.",
    keywords: ["vale", "esclusivo", "solo", "non trovi", "qualità", "per te", "momento", "esperienza", "unico"],
    weight: 1.2
  },
  escalation_funnel: {
    name: "Funnel di Escalation",
    description: "Partire con contenuto soft (teaser gratuito o economico) per creare curiosità, poi proporre contenuto più esplicito/costoso. Gradualità naturale, mai saltare step.",
    keywords: ["anteprima", "assaggio", "preview", "se ti piace", "ho anche", "versione completa", "questo è solo l'inizio"],
    weight: 1.4
  },
  personal_scarcity: {
    name: "Scarsità Personale",
    description: "Far percepire che l'offerta è limitata e personale ('lo mando solo a 3 persone', 'lo cancello tra un'ora'). Non scarsità generica ma legata al rapporto.",
    keywords: ["solo a te", "pochi", "cancello", "non lo rimando", "ultima volta", "solo oggi", "non lo rifaccio"],
    weight: 1.1
  },
  direct_challenge: {
    name: "Sfida Diretta",
    description: "Non aver paura di provocare il fan ('se non lo vuoi lo mando ad altri', 'pensavo ti piacessi', 'forse non sei pronto'). Tattica rischiosa ma potente con fan provocatori.",
    keywords: ["se non vuoi", "altri", "pensavo", "forse non", "vabbè allora", "come vuoi", "peccato"],
    weight: 1.5
  }
};

/**
 * Pattern stilistici di vendita — estratti da Andrea Terranova (top operator
 * HOC su silos ITA, 5.398 msg analizzati nel periodo 24-30 aprile 2026).
 *
 * Si differenzia da Spagnuolo perché si focalizza più su HOOK NARRATIVI
 * ("se ti dicessi che oggi voglio esagerare"), INTIMITÀ PERFORMATIVA dosata
 * ("mi sento pronta", "mi voglio fidare"), e CHIUSURE FISICHE esplicite
 * ("ho tolto tutto colpa tua"). È il benchmark di riferimento per le creator
 * che lui storicamente gestisce (Elisa Esposito, Gaja).
 *
 * Volumi riferimento ricavati dai dati: "se ti dicessi" 128x, "mi voglio
 * fidare" 185x, "oggi voglio esagerare" 128x, "ho tolto tutto" 37x (PPV
 * top-performing), "davvero/sinceramente/veramente" 377x (firma di voce).
 *
 * Nota: il pattern soft_no_recovery si applica esclusivamente a esitazioni
 * di gusto/timing (es. "domani magari", "preferisco quello di ieri"), NON
 * a vincoli economici dichiarati dal fan ("sono povero", "ho speso troppo").
 * Su quei casi il comportamento corretto è chiudere e riaprire più avanti.
 */
export const TERRANOVA_PATTERNS = {
  narrative_hook: {
    name: "Hook narrativo / Apertura segreta",
    description: "Apre con la promessa di un segreto da custodire. Crea curiosità e patto di complicità prima di qualunque proposta. È la prima mossa nella maggioranza dei PPV iniziati da Terranova.",
    keywords: ["se ti dicessi", "questa cosina", "mi prometti che rimane qui", "rimane tra noi", "sono seria me lo devi promettere", "ti devo dire una cosa"],
    weight: 1.4
  },
  performative_intimacy: {
    name: "Intimità Performativa",
    description: "Dichiarazioni che alzano il livello di confidenza prima del momento d'acquisto. Il rischio è proiettato sull'operatore (lei si sta fidando, lei si sente pronta), il fan è chiamato a essere all'altezza del passo. Diversa dalla 'emotional_vulnerability' di Spagnuolo perché qui è un setup narrativo lungo, non una formula breve.",
    keywords: ["mi voglio fidare", "mi sto fidando", "mi sento pronta", "sento pronta a fare", "non avrei mai pensato", "mi tremano le mani", "ad oggi mi sento", "ci tengo davvero a te", "ci conosciamo da troppo tempo"],
    weight: 1.3
  },
  today_exclusivity: {
    name: "Oggi & Esclusività",
    description: "Posiziona il momento come unico, fuori scala, OGGI. La parola 'oggi' è rituale (presente nel ~5% dei messaggi top-performing). Si lega a 'solo per te / lo sto mandando solo a te', non a scarsità generica.",
    keywords: ["oggi voglio", "oggi voglio esagerare", "solo a te", "solo per te", "lo sto mandando solo", "una notte indimenticabile", "una notte di follie", "una cosa che solo al pensiero", "fuori di testa"],
    weight: 1.2
  },
  reciprocity_proof: {
    name: "Dimostrazione & Reciprocità",
    description: "Sposta dalle parole ai fatti. Stabilisce un canale di reciprocità implicita: lei dimostra qualcosa, ora il fan è chiamato a contraccambiare. Centrale nei PPV venduti, marginale altrove.",
    keywords: ["te lo voglio dimostrare", "non più con le parole", "con i fatti", "ti voglio dimostrare quanto", "voglio farti vedere"],
    weight: 1.3
  },
  ppv_physical_close: {
    name: "Apertura PPV / Chiusura Sessuale",
    description: "Il momento dello sblocco. Combinazione di nudità esplicita + corresponsabilità ('è solo colpa tua') + CTA fisica diretta. È la formula presente nei PPV con tasso di conversione più alto.",
    keywords: ["ho tolto tutto", "colpa tua", "fammi sent", "prendi cura del mio corpo", "ti prendi cura", "sblocca", "regalone", "corpo nudo"],
    weight: 1.5
  },
  soft_no_recovery: {
    name: "Recovery dopo Soft No",
    description: "Quando il fan esita ('domani magari', 'non troppo', 'preferisco quello di ieri'), Terranova non chiude e non insiste sulla stessa proposta: cambia angolo, sposta sul piano emotivo, oppure rilancia con il narrative_hook. NB: questa logica si applica a esitazioni di gusto/timing, non a vincoli economici dichiarati dal fan.",
    keywords: ["peccato", "credimi avrei mandato", "ti vogliooo", "non deludere la mia fiducia", "ci tengo davvero a te", "amo (monosillabo affettuoso)"],
    weight: 1.1
  },
  voice_signature: {
    name: "Firma di voce (tic stilistici)",
    description: "Marker che fanno suonare un messaggio 'di Terranova' anche fuori contesto. Ridondanza affettiva (sinceramente/veramente/davvero — 377 occorrenze), puntini sospensivi multipli, vocali ripetute (oiii, ti vogliooo, regaloneee), monosillabi affettuosi (amo, siii). Tono colloquiale, mai 'pulito da segretaria'.",
    keywords: ["sinceramente", "veramente", "davvero", "amo", "ti vogliooo", "regaloneee", "oiii", "heyyy", "ehehe", "🙈", "🥵", "🤤", "💗"],
    weight: 1.0
  }
};

/**
 * Mappa benchmark → pattern dict. Usata da score/route.js per scegliere il
 * benchmark giusto in base al campo `benchmarkOperator` della creator.
 */
export const OPERATOR_BENCHMARKS = {
  spagnuolo: SPAGNUOLO_PATTERNS,
  terranova: TERRANOVA_PATTERNS,
};

/**
 * Restituisce il dict di pattern del benchmark richiesto.
 * Default: spagnuolo (preserva il comportamento storico se la creator non
 * specifica un benchmarkOperator).
 */
export function getBenchmarkPatterns(operatorKey) {
  if (operatorKey && OPERATOR_BENCHMARKS[operatorKey]) {
    return OPERATOR_BENCHMARKS[operatorKey];
  }
  return SPAGNUOLO_PATTERNS;
}

/**
 * Etichetta umana del benchmark, da iniettare nei prompt di scoring.
 */
export function getBenchmarkLabel(operatorKey) {
  switch (operatorKey) {
    case "terranova":
      return "Andrea Terranova (top operator HOC ITA — 5.398 msg analizzati)";
    case "spagnuolo":
    default:
      return "Andrea Spagnuolo (top operator HOC)";
  }
}

/**
 * C/B/S Profiling System
 * Closer = capacità di chiudere vendite
 * Builder = capacità di costruire relazioni durature
 * Spammer = tendenza a mandare messaggi generici/copia-incolla
 */
export const CBS_DIMENSIONS = {
  closer: {
    name: "Closer",
    description: "Capacità di portare la conversazione alla vendita in modo naturale",
    color: "#10B981",
    positiveSignals: [
      "Propone contenuto al momento giusto",
      "Usa escalation graduale",
      "Tiene il punto sul prezzo",
      "Crea urgenza credibile",
      "Chiude senza forzare"
    ],
    negativeSignals: [
      "Propone contenuto troppo presto",
      "Cede subito sul prezzo",
      "Non propone mai contenuti a pagamento",
      "Forza la vendita in modo aggressivo"
    ]
  },
  builder: {
    name: "Builder",
    description: "Capacità di costruire rapporto emotivo e fidelizzare il fan",
    color: "#6366F1",
    positiveSignals: [
      "Fa domande personali genuine",
      "Ricorda dettagli del fan",
      "Mostra vulnerabilità/intimità",
      "Personalizza i messaggi",
      "Fa sentire il fan speciale"
    ],
    negativeSignals: [
      "Messaggi generici copia-incolla",
      "Ignora le emozioni del fan",
      "Non fa mai domande",
      "Tratta il fan come un numero"
    ]
  },
  spammer: {
    name: "Spammer",
    description: "Tendenza a usare messaggi generici, ripetitivi o non personalizzati",
    color: "#EF4444",
    positiveSignals: [], // non ha segnali positivi — è un punteggio da minimizzare
    negativeSignals: [
      "Messaggi copia-incolla evidenti",
      "Non reagisce a ciò che dice il fan",
      "Ripete le stesse frasi",
      "Messaggi troppo lunghi e generici",
      "Ignora il contesto della conversazione"
    ]
  }
};
