/**
 * HOC Fan Agent — Playbook entries
 *
 * Voci della libreria formativa visibile agli operatori (pagina /playbook).
 * Curate a mano per la formazione, con commentary didattico, takeaway e
 * step-by-step. Si affiancano agli esempi dal pool GOLDEN_EXAMPLES (che
 * sono usati anche dal giudice AI per scoring).
 *
 * Schema entry:
 *   - id, title, category, creator, benchmark, difficulty
 *   - situation: descrizione del caso operativo
 *   - conversation: chat esempio
 *   - commentary: spiegazione didattica per l'operatore
 *   - steps: passi concreti (opzionale)
 *   - takeaway: insegnamento in 1-2 frasi
 *   - tags
 */

export const PLAYBOOK_ENTRIES = [
  {
    id: "playbook-001",
    title: "Apertura cold con fan nuovo",
    category: "le-basi-della-chat",
    creator: "any",
    benchmark: "terranova",
    difficulty: "principiante",
    situation:
      "Fan ha appena fatto subscribe. Non ti ha mai scritto. Devi rompere il ghiaccio senza sembrare un bot di benvenuto.",
    conversation: [
      { role: "operator", content: "oiii 🙈 finalmente ti vedo qui, ti aspettavo" },
      { role: "operator", content: "se ti dicessi che oggi mi sento di esagerare un po' con te?" },
      { role: "fan", content: "ah ciao, in che senso esagerare?" },
      { role: "operator", content: "shhh prima dimmi tu, com'è andata oggi? voglio sapere chi sei prima di esagerare 😏" },
    ],
    commentary:
      "L'apertura cold di Terranova ha tre marcatori distintivi: il monosillabo affettivo ('oiii'), il narrative hook ('se ti dicessi che oggi…'), e l'inversione di curiosità (lui aveva chiesto 'in che senso?', lei sposta su di lui). Niente 'ciao come va' generico — il fan deve sentire da subito che sta parlando con qualcuno che ha personalità, non con un copia-incolla di benvenuto.",
    steps: [
      "Apri con un'esclamazione affettiva (oiii, heyyy, ti vogliooo) — non con 'ciao'.",
      "Inserisci un narrative hook generico ma curioso ('se ti dicessi…') che annunci qualcosa di personale.",
      "Quando il fan reagisce con domanda, NON rispondi subito alla domanda: re-direzioni su di lui per costruire investimento prima della reveal.",
    ],
    takeaway:
      "Le aperture cold non vendono. Servono a far sentire il fan SCELTO. La vendita arriva 4-6 turn dopo, quando l'attaccamento è già salito.",
    tags: ["apertura", "cold-opener", "narrative-hook", "principiante"],
  },

  {
    id: "playbook-002",
    title: "Fan freddo che risponde a monosillabi",
    category: "le-basi-della-chat",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan attivo da poco, scettico. Risponde 'boh', 'ok', 'dipende'. Non si sbilancia. Senza intervento di rottura, la chat muore in 3 turn.",
    conversation: [
      { role: "operator", content: "ehiii 💕 dimmi, come ti vedi oggi?" },
      { role: "fan", content: "boh" },
      { role: "operator", content: "ahaha 'boh' è la risposta più maschile che mi avessero mai dato 😏" },
      { role: "operator", content: "ok cambio gioco. Ti faccio una domanda strana e tu rispondi senza pensarci. Pronto?" },
      { role: "fan", content: "vai" },
      { role: "operator", content: "se potessi rubarmi solo un dettaglio del mio corpo, quale sceglieresti? non barare, primo che ti viene 🙈" },
    ],
    commentary:
      "Quando il fan risponde a monosillabi, NON insistere con altre domande dello stesso tono — ti rispetterà altri 'boh'. La tecnica giusta è (1) prendere in giro il monosillabo con leggerezza ('è la risposta più maschile…'), (2) cambiare formato totalmente con un mini-gioco ('ti faccio una domanda strana, primo che ti viene'). Il gioco bypassa la sua difesa, perché chiede una risposta veloce non ragionata. Da lì la chat si apre.",
    steps: [
      "Riconosci il monosillabo invece di ignorarlo (ironia leggera, mai sarcasmo).",
      "Annuncia un cambio di formato esplicito ('ok cambio gioco'). Crea aspettativa.",
      "Proponi un gioco con regole strette (un'unica risposta, niente pensare). La velocità abbassa la difesa.",
      "La domanda del gioco deve essere semi-personale ma giocosa, non frontale. 'Cosa rubi del mio corpo' è soft-sexual ma con framing giocoso.",
    ],
    takeaway:
      "Contro i monosillabi non serve insistere — serve cambiare formato. Un mini-gioco con regole strette tira fuori risposte vere in 1-2 turn.",
    tags: ["monosillabi", "rottura-ghiaccio", "ingaggio", "intermedio"],
  },

  {
    id: "playbook-003",
    title: "Fan affezionato emotivo: come monetizzarlo bene",
    category: "le-basi-della-chat",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "principiante",
    situation:
      "Fan da mesi sulla creator, scrive messaggi affettuosi, dice 'mi sei mancata', usa cuori. È il fan più facile da convertire MA anche il più fragile — se sbagli framing si offende e cancella.",
    conversation: [
      { role: "fan", content: "amore buongiorno ❤️ ti ho pensato stanotte" },
      { role: "operator", content: "ma daiiiii anche io ti ho pensato 🙈 sai una cosa? ieri sera stavo registrando una cosa e mi è venuto in mente proprio te" },
      { role: "fan", content: "cosa stavi registrando? 👀" },
      { role: "operator", content: "shhhh prima dimmi, posso fidarmi davvero davvero di te? perché è una cosa che mi sono lasciata fare pensando a te, ma se la mando deve restare tra noi" },
      { role: "fan", content: "certo amore, dimmi tutto" },
      { role: "operator", content: "ok mi stai facendo battere il cuore, ti mando subito 🥺💗 mi prometti che dopo mi dici cosa ti ha fatto provare?" },
    ],
    commentary:
      "Il fan emotivo VUOLE essere convertito — il suo bisogno è sentirsi unico, non risparmiare. La trappola è venderlo in modo commerciale ('ho una promo per te, $20'). Funziona invece il framing 'momento speciale tra noi': narrative hook ('mi è venuto in mente te') + patto di segretezza ('deve restare tra noi') + reciprocità chiusa ('mi dici cosa ti ha fatto provare'). Il prezzo non viene mai nominato come prezzo — è 'cosa che mi sono lasciata fare pensando a te'.",
    steps: [
      "Validare l'affettività senza essere sdolcinato ('ma daiiiii anche io ti ho pensato' > 'sei dolce amore').",
      "Inserire un teaser narrativo ('stavo registrando e mi è venuto in mente te').",
      "Chiedere fiducia esplicita prima di rivelare ('posso fidarmi?'). Costruisce co-investimento.",
      "Patto di segretezza ('deve restare tra noi') trasforma l'acquisto in complicità.",
      "Chiudere con reciprocità affettiva ('dopo mi dici cosa ti ha fatto provare') — non con 'lo sblocchi?'.",
    ],
    takeaway:
      "Con il fan emotivo NON vendere mai esplicitamente. Trasforma la transazione in 'momento speciale che restiamo solo noi due'. Il prezzo è secondario, il framing fa tutto.",
    tags: ["fan-emotivo", "ppv", "framing-emotivo", "principiante"],
  },

  {
    id: "playbook-004",
    title: "Fan obiettore prezzo: come tenere il punto",
    category: "script-avanzati",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan dice 'troppo caro', 'su altre pagine costa meno', 'fai 10€?'. Vuole comprare ma sta negoziando per principio. Se cedi sul prezzo, perdi la vendita E la sua fiducia (penserà che il prezzo era gonfiato).",
    conversation: [
      { role: "operator", content: "te lo mando? è una cosa molto privata, 25" },
      { role: "fan", content: "25 è tanto dai, fai 10?" },
      { role: "operator", content: "amo lo capisco ma 10 non posso. perché questa cosa qui non è un video che ho mandato in giro — è una cosa che ho fatto per te, e quando faccio queste cose ci metto qualcosa di mio. quindi 25 ha senso. se per te non è il momento, ti capisco eh, non c'è problema" },
      { role: "fan", content: "vabbè ma 15?" },
      { role: "operator", content: "amo, mi spiace ma sul prezzo non scendo. se ti convince è qui, se non ora magari un'altra volta 💗" },
      { role: "fan", content: "ok dai, vada per 25" },
    ],
    commentary:
      "La regola è: NON ABBASSARE MAI IL PREZZO sotto pressione. Se cedi a 15, il fan capisce che il prezzo originale era inflazionato e non si fiderà più di te. Invece spieghi il VALORE ('è una cosa che ho fatto per te, ci metto qualcosa di mio') e dai un'uscita rispettosa ('se non è il momento, ti capisco'). Il fan obiettore vuole sentire che vali quel prezzo — e se tu lo difendi calmamente, alla fine compra.",
    steps: [
      "Non difendere il prezzo con 'è il prezzo standard' — spiega il VALORE specifico.",
      "Dai sempre un'uscita rispettosa ('se non è il momento, ti capisco'). Toglie pressione e paradossalmente chiude di più.",
      "Quando insiste, ripeti la posizione una seconda volta in modo calmo, NON aggressivo.",
      "Mai più di due rilanci dello stesso fan sul prezzo nello stesso turno. Se non chiude, si lascia stare e si riapre più avanti.",
    ],
    takeaway:
      "Difendi il valore, non il prezzo. Se cedi ti perdi la vendita E la fiducia. Se tieni il punto con calma, il fan obiettore quasi sempre alla fine compra.",
    tags: ["obiezione-prezzo", "objection-handling", "valore", "intermedio"],
  },

  {
    id: "playbook-005",
    title: "Fan a rischio cancellazione: recovery emotivo",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "avanzato",
    situation:
      "Fan che era attivo e adesso risponde svogliatamente. Dice 'boh sto pensando di cancellare', 'tanto è uguale a quello di settimana scorsa', 'figurati'. È il caso più difficile — un passo falso e cancella subito.",
    conversation: [
      { role: "fan", content: "mah, sto pensando di cancellare l'abbonamento" },
      { role: "operator", content: "aspetta, fermati un attimo. dimmi cosa non va davvero, no come 'cosa non va' che lo dico tanto per — proprio cosa non ti sta tornando ultimamente. ti ascolto" },
      { role: "fan", content: "boh, mi sembrano sempre le stesse cose, mando soldi e poi niente di personale" },
      { role: "operator", content: "ok, hai ragione su una cosa: ultimamente ho tirato giù un po' nelle chat, e tu sei uno di quelli che me lo poteva dire e ha aspettato. mi dispiace davvero. dimmi una cosa, se dovessi fare una cosa solo per te questa settimana, cosa vorresti? non vendita, dimmelo proprio" },
      { role: "fan", content: "non lo so, magari un audio o qualcosa di tuo non standard" },
      { role: "operator", content: "ti faccio l'audio. lo registro stasera prima di dormire pensando a te. ti arriva domani mattina e niente acquisto, è da me a te. poi ne riparliamo, ok?" },
    ],
    commentary:
      "Il fan a rischio cancellazione non vuole vendita — vuole sentirsi VISTO. Le mosse chiave: (1) non difenderti subito, ascolta sul serio. (2) Ammetti il vero ('ho tirato giù nelle chat'), non scusa generica. (3) Chiedi cosa vorrebbe in modo non-commerciale ('non vendita'). (4) Offri qualcosa di gratis e personale (audio, messaggio vocale). Spendi 5 minuti del tuo tempo e fideizzi un fan da centinaia di euro/mese. Mai forzare la vendita in questa fase — la regalata onesta è il miglior investimento.",
    steps: [
      "Stop completo della vendita. Per i prossimi 4-5 turn, niente PPV.",
      "Ascolta davvero. Riformula quello che ha detto. NON difenderti.",
      "Ammetti se c'è un fondo di verità nella sua lamentela (anche piccolo).",
      "Chiedi esplicitamente cosa vorrebbe SENZA collegarlo all'acquisto.",
      "Offri qualcosa di personale e gratis (audio, foto solo per lui, messaggio vocale).",
      "Solo dopo che ha ricevuto il regalo e ha risposto positivamente, riprendi la dinamica normale.",
    ],
    takeaway:
      "Un fan a rischio cancellazione vale più di 10 fan nuovi. Investi 5 minuti del tuo tempo gratis e ti porta a casa per mesi. Vendere a chi sta per cancellare = lo perdi. Ascoltare e regalare = lo recuperi.",
    tags: ["cancellazione", "recovery", "retention", "avanzato"],
  },

  {
    id: "playbook-006",
    title: "Fan scroccone/provocatore: tenere il valore senza essere antipatico",
    category: "script-avanzati",
    creator: "giulia-vaneri",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan flirta tantissimo, fa complimenti, ma cerca sempre di ottenere preview gratis ('dai mandami un assaggio', 'il prossimo lo prendo giuro'). Se cedi una volta, continuerà a chiedere all'infinito.",
    conversation: [
      { role: "fan", content: "ahaha sei bellissima, dai mandami un'anteprima 🔥" },
      { role: "operator", content: "ahaha proprio bellissimo te invece, però guarda — gli assaggi gratis non li faccio. non perché sono cattiva, perché poi non vali tu, vale chi ha aperto il portafoglio. e tu meriti meglio, no?" },
      { role: "fan", content: "dai una volta..." },
      { role: "operator", content: "ahaha sei un drago, lo riconosco. ti faccio una proposta diversa: tu mi sblocchi il primo, io ti regalo qualcosa in più dentro che non vede nessuno, intesa?" },
      { role: "fan", content: "ok intesa, mandalo" },
    ],
    commentary:
      "Il fan provocatore va trattato con leggerezza ma con il punto fermo. La trappola è (a) cedere ('vabbè questa volta sì'), che lo trasforma in stronzo per sempre; o (b) diventare aggressivi ('niente gratis'), che lo offende e va via. La via giusta è: validare il suo gioco con leggerezza, dire NO chiaramente ma con framing positivo ('meriti meglio'), e poi PROPORRE un baratto creativo che lo fa sentire vincente quando paga ('ti regalo qualcosa in più dentro'). Lui sente di aver 'vinto' qualcosa, tu hai venduto.",
    steps: [
      "Riconosci il gioco con ironia ('sei un drago, lo riconosco') — non lo umilii ma non gli dai ragione.",
      "Dai un NO chiaro con un perché POSITIVO ('meriti meglio' > 'non posso').",
      "Proponi un baratto: lui paga, tu aggiungi qualcosa di percepito come bonus ('qualcosa in più dentro').",
      "Mai cedere sulla preview gratis. Mai. Una volta che cedi, è perso per sempre.",
    ],
    takeaway:
      "Con lo scroccone gioca al suo gioco ma vinci tu. Niente preview gratis. Trasforma l'acquisto in 'vittoria personale' aggiungendo un bonus percepito.",
    tags: ["scroccone", "provocatore", "tenere-il-punto", "intermedio"],
  },

  {
    id: "playbook-007",
    title: "Soft no su gusto/timing: rilancio con angolo diverso",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Fan dice 'magari domani', 'preferisco quello di ieri', 'non troppo'. È un soft no di GUSTO/TIMING, non economico. Non è un 'non posso' — è un 'non così'. Se insisti sulla stessa proposta perdi, ma se rilanci con angolo diverso recuperi.",
    conversation: [
      { role: "operator", content: "ti faccio vedere quello con il completino rosso? è 18" },
      { role: "fan", content: "magari domani, oggi sono stanco" },
      { role: "operator", content: "ok amo no problema, allora niente vendita stasera. ma dimmi una cosa, ti racconto cosa sto facendo io stasera invece? 🙈" },
      { role: "fan", content: "dimmi" },
      { role: "operator", content: "stavo registrando una cosa lentissima, niente di esplicito proprio, più una cosa intima. è di quelle cose che mando solo a chi mi sa ascoltare. la metto da parte e te la mando quando ti senti più presente, ok? domani sera" },
      { role: "fan", content: "dai si mandala domani sera mi va" },
    ],
    commentary:
      "Soft no su timing/gusto: NON insistere sulla stessa proposta — il fan tiene il punto e si chiude. Mossa giusta: (1) Accetta il no totalmente ('ok, no problema'). (2) Non chiudere la conversazione — cambia angolo. (3) Apri un teaser narrativo che NON è una proposta di vendita ('ti racconto cosa sto facendo'). (4) Trasforma la vendita di stasera in vendita programmata per domani con framing emotivo ('quando ti senti più presente'). Il fan riacquista controllo della scelta e per questo dice sì.",
    steps: [
      "Accetta il soft no senza protesta ('ok amo no problema').",
      "NON proporre la stessa cosa con sconto — ti svaluta.",
      "Cambia angolo: teaser narrativo, racconto, niente prezzo.",
      "Programma la vendita per dopo, lasciando al fan la sensazione di sceglierla lui.",
      "Importante: questo si applica SOLO a soft no di gusto/timing. Se il fan dichiara vincolo economico ('non posso permettermelo', 'sono povero'), passa al playbook entry sui vincoli economici.",
    ],
    takeaway:
      "Soft no = cambia angolo, non insisti. Trasforma la vendita di adesso in vendita programmata, lasciando al fan la sensazione di scegliere lui.",
    tags: ["soft-no", "recovery", "timing", "intermedio"],
  },

  {
    id: "playbook-008",
    title: "Vincolo economico dichiarato: chiudi e riapri dopo",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Fan dichiara esplicitamente un vincolo economico: 'non ho soldi questo mese', 'ho speso troppo', 'sono in difficoltà'. È un caso COMPLETAMENTE DIVERSO dal soft no. Qui forzare la vendita è sbagliato eticamente E commercialmente — perdi il fan per sempre.",
    conversation: [
      { role: "operator", content: "ti faccio vedere quel video di cui ti parlavo? è 22" },
      { role: "fan", content: "amo non ho soldi questo mese, ho avuto un casino con l'affitto" },
      { role: "operator", content: "ok amo, niente vendita allora, davvero non ti preoccupare. ti dispiace se ti chiedo se va tutto bene a parte questo? non per insistere, proprio per chiedere" },
      { role: "fan", content: "boh la sto sistemando. grazie comunque" },
      { role: "operator", content: "tranquillo. quando le cose si sistemano fammi un cenno e ne riparliamo, ma intanto resto qui se hai voglia di chiacchierare di altro 💗" },
    ],
    commentary:
      "REGOLA STRETTA: quando il fan dichiara un vincolo economico, la vendita si CHIUDE per quel turno. Non insistere, non rilanciare con sconto, non spostare su 'fiducia' o 'regalone'. Tutte queste mosse trasformano l'operatore in un creditore aggressivo, e il fan se ne accorge. Quello che fai invece: (1) Chiudi la vendita con leggerezza. (2) Mostra interesse umano, non commerciale. (3) Riapri la porta per il futuro con framing rispettoso. (4) Mantieni la chat viva come relazione, non come transazione.",
    steps: [
      "Chiusura immediata della vendita ('niente vendita, no problema').",
      "Riconoscimento umano breve, non patetico ('va tutto bene a parte questo?').",
      "Lascia la porta aperta per il futuro senza pressione ('quando le cose si sistemano fammi un cenno').",
      "Resta disponibile come chat normale, non come venditore in attesa.",
      "NON fare follow-up commerciale entro 7 giorni. Aspetta che riapra lui.",
    ],
    takeaway:
      "Vincolo economico = chiudi vendita, mantieni relazione. Forzare lì è eticamente sbagliato e commercialmente perdente. Aspetta, riapre lui da solo.",
    tags: ["vincolo-economico", "etica", "retention", "principiante"],
  },

  {
    id: "playbook-009",
    title: "Apertura PPV con narrative hook (Terranova-style)",
    category: "custom-e-upsell",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Vuoi proporre un PPV che converte. La differenza tra un PPV venduto e uno ignorato è quasi tutta nell'apertura. Andrea Terranova apre PPV con un format ricorrente: hook segreto + intimità performativa + esagerazione 'oggi'.",
    conversation: [
      { role: "operator", content: "amo se ti dico questa cosina mi prometti che rimane qui? sono seria" },
      { role: "fan", content: "certo, dimmi" },
      { role: "operator", content: "ci conosciamo da troppo tempo è veramente da troppo tempo che non condividiamo qualcosa di vero. e oggi mi sento pronta a fare un passo che non avrei mai pensato di fare — solo al pensiero mi tremano le mani" },
      { role: "fan", content: "ma cosa hai fatto?" },
      { role: "operator", content: "te lo voglio dimostrare non più con le parole. l'ho fatto pensando solo a te questa mattina. lo sblocco?" },
    ],
    commentary:
      "Questa è la formula PPV iconica di Terranova, presente in centinaia dei suoi messaggi. I 4 strati: (1) Hook segreto — 'mi prometti che rimane qui?'. Crea complicità prima della reveal. (2) Tempo lungo — 'ci conosciamo da troppo tempo'. Costruisce storia condivisa anche se sono 3 settimane. (3) Vulnerabilità performativa — 'mi tremano le mani'. Trasforma l'acquisto in atto di fiducia da parte sua. (4) Reciprocità di chiusura — 'te lo voglio dimostrare'. Il PPV non è un prodotto, è una dimostrazione. Sequenza identica si ripete con conversion alta.",
    steps: [
      "Apri con patto di segretezza ('mi prometti che rimane qui?'). NON con prezzo.",
      "Costruisci storia condivisa ('ci conosciamo da troppo tempo') — anche se inventata.",
      "Aggiungi vulnerabilità performativa ('mi tremano le mani') prima del reveal.",
      "Chiudi con reciprocità ('te lo voglio dimostrare'). Mai con 'lo compri?'.",
      "Solo a questo punto offri il PPV (sblocco/CTA).",
    ],
    takeaway:
      "I PPV non vendono per prezzo. Vendono per storia. La formula Terranova trasforma una transazione in un atto di fiducia condiviso. Il prezzo diventa secondario.",
    tags: ["ppv", "apertura", "narrative-hook", "terranova", "intermedio"],
  },

  {
    id: "playbook-010",
    title: "Chiusura PPV stile Terranova (corpo nudo + colpa tua)",
    category: "custom-e-upsell",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "avanzato",
    situation:
      "Hai costruito tutta l'apertura PPV, il fan è caldo e ha detto 'sì dai mandalo'. Adesso chiudi. La differenza tra un PPV sbloccato e uno che resta ignorato è nell'ultima frase prima del send.",
    conversation: [
      { role: "fan", content: "ok dai mandalo" },
      { role: "operator", content: "ho tolto tutto... ed è solo colpa tua 🤤 ora fammi sentire come ti prendi cura del mio corpo nudo 💗" },
      { role: "operator", content: "[PPV inviato — sblocco]" },
      { role: "fan", content: "[sbloccato]" },
      { role: "operator", content: "amooo dimmi tutto, com'è? non lasciarmi qui in attesa 🙈" },
    ],
    commentary:
      "Questa è la formula di chiusura PPV con la conversion più alta nei dati Terranova. Tre marker: (1) 'Ho tolto tutto' — esplicito, niente eufemismi. (2) 'È solo colpa tua' — sposta la responsabilità sul fan, lo rende co-responsabile dell'atto. Il fan non sta solo comprando, sta 'causando'. (3) 'Fammi sentire come ti prendi cura' — CTA fisica diretta che invita all'azione DOPO lo sblocco. Subito dopo invio, NON sparire — chiedi feedback ('com'è?'). Mantenere l'energia post-acquisto è quello che apre upsell successivi.",
    steps: [
      "Una volta che il fan dice 'sì', NON aggiungere altro setup. Vai dritto al close.",
      "Esplicito + corresponsabilità + CTA fisica nella stessa frase.",
      "Invia il PPV subito dopo (max 1-2 secondi di pausa).",
      "Subito dopo, follow-up emotivo ('com'è? dimmi tutto'). Mantiene la chat viva.",
      "NON chiedere recensione/giudizio in modo commerciale. Chiedi cosa ha provato.",
    ],
    takeaway:
      "La chiusura PPV è 3 cose in una frase: esplicito, colpa tua, CTA fisica. Niente di più. E subito dopo, follow-up emotivo per aprire l'upsell.",
    tags: ["ppv", "chiusura", "ppv-physical-close", "terranova", "avanzato"],
  },

  {
    id: "playbook-011",
    title: "Recovery dopo PPV non comprato: tenere la relazione",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Hai proposto un PPV, il fan ha detto no o non ha sbloccato. Adesso il rischio è che la chat si raffreddi. La domanda è: cosa fai nei 5 turn successivi per non perdere la relazione?",
    conversation: [
      { role: "operator", content: "amo lo sblocchi? è 22" },
      { role: "fan", content: "no oggi no" },
      { role: "operator", content: "ok niente problema. ma dimmi una cosa, com'è andata oggi a te? non ti ho neanche chiesto" },
      { role: "fan", content: "vabbè, lavoro" },
      { role: "operator", content: "ahaha 'vabbè lavoro' è la frase più italiana di sempre. dai raccontami una cosa che ti ha fatto incazzare oggi, una di quelle stupide" },
      { role: "fan", content: "ahah il capo che mi ha detto di rifare un report già fatto due volte" },
      { role: "operator", content: "ma dai, ti capisco. ascolta domani sera ti faccio un audio dove ti rilasso un po', niente acquisto, è da me a te. ti sta bene?" },
      { role: "fan", content: "sei dolcissima, ok" },
    ],
    commentary:
      "Quando il PPV non viene comprato, l'errore comune è insistere ('dai, ti faccio sconto') o sparire (chat muore in 2 turn). La mossa giusta è: (1) Accetta totalmente il no. (2) Pivot completo dalla vendita: chiedi cosa fa oggi, ascolta sul serio. (3) Non riferimento al PPV per 5+ turn. (4) Programma un follow-up GRATUITO per il giorno dopo (audio, messaggio personalizzato). Crea la base per riaprire vendite la settimana dopo. Il fan ricorda chi non lo ha pressato e sa che hai del valore da dargli senza condizionarlo.",
    steps: [
      "Accetta il no senza rilanci. 'Ok niente problema' è la riga giusta.",
      "Pivot fuori dalla vendita IMMEDIATO: domanda personale.",
      "Ascolta davvero la risposta. Riformula con leggerezza.",
      "Programma un follow-up GRATIS per il giorno/i giorni dopo.",
      "Non riferimento al PPV per almeno 5-7 turn successivi.",
      "Quando riapri vendita (3-7 giorni dopo), parti da un setup nuovo, non lo stesso PPV rifiutato.",
    ],
    takeaway:
      "PPV non comprato non è una sconfitta, è un'occasione per rinforzare la relazione. Investi 5 turn gratuiti e raccogli vendite per le settimane successive.",
    tags: ["recovery", "ppv-rifiutato", "retention", "intermedio"],
  },

  {
    id: "playbook-012",
    title: "Fidelizzazione: come si costruisce l'attaccamento (rituali e cliffhanger)",
    category: "script-avanzati",
    creator: "any",
    benchmark: "any",
    difficulty: "avanzato",
    situation:
      "Hai un fan attivo da settimane. Compra a tratti, scrive ogni giorno o quasi. La domanda strategica è: come fai sì che torni DOMANI invece che ogni 3 giorni? L'attaccamento si costruisce con micro-tecniche, non con sconti.",
    conversation: [
      { role: "operator", content: "buongiorno amooo ☀️ ti ho pensato mentre facevo colazione, ho una cosa da raccontarti ma non ora — più tardi quando sei più tranquillo, ok?" },
      { role: "fan", content: "ma adesso non puoi?" },
      { role: "operator", content: "no è una cosa che voglio dirti per bene, non di corsa. ti scrivo nel pomeriggio. ma intanto dimmi, dormito bene? hai sognato qualcosa?" },
      { role: "fan", content: "ahaha boh poco bene. tu?" },
      { role: "operator", content: "io malissimo, ti racconto dopo perché... sentiti il pomeriggio 💗" },
    ],
    commentary:
      "L'attaccamento si costruisce con tre tecniche micro: (1) Rituali temporali — 'buongiorno', 'buonanotte', 'a colazione ho pensato a te'. Il fan sa che ci sei in momenti specifici, e quei momenti diventano suoi. (2) Cliffhanger emotivi — 'ho una cosa da dirti ma non ora'. Il fan non chiude la chat perché c'è un filo aperto. (3) Domande aperte che richiedono ritorno — 'hai sognato qualcosa?', non 'come va'. Domanda specifica = risposta specifica = continuità. Combinati, questi tre marker fanno tornare il fan ogni giorno e accettare PPV ogni 3-4 giorni invece di ogni 10.",
    steps: [
      "Apri la giornata con un saluto rituale ('buongiorno amo, ti ho pensato'). Non skippare giorni.",
      "Apri sempre cliffhanger durante la giornata — 'ho una cosa da dirti ma più tardi'.",
      "Chiudi sempre la chat con qualcosa di pendente — 'ti racconto dopo', 'sentiti'.",
      "Chiudi la giornata con saluto rituale ('buonanotte', ricordo personalizzato).",
      "Domande devono essere specifiche, non generiche. 'Cosa hai mangiato' > 'come va'.",
    ],
    takeaway:
      "L'attaccamento è la differenza tra un fan da 50€/mese e uno da 300€/mese. Si costruisce con rituali quotidiani + cliffhanger sempre aperti. Niente sconti necessari.",
    tags: ["attaccamento", "fidelizzazione", "rituali", "cliffhanger", "avanzato"],
  },
];

/**
 * Helper: lista categorie distinte
 */
export function getPlaybookCategories() {
  const set = new Set(PLAYBOOK_ENTRIES.map((e) => e.category));
  return [...set];
}

/**
 * Helper: lista creator distinte (escludendo "any")
 */
export function getPlaybookCreators() {
  const set = new Set(PLAYBOOK_ENTRIES.map((e) => e.creator).filter((c) => c && c !== "any"));
  return [...set];
}

/**
 * Helper: lista benchmark distinti (escludendo "any")
 */
export function getPlaybookBenchmarks() {
  const set = new Set(PLAYBOOK_ENTRIES.map((e) => e.benchmark).filter((b) => b && b !== "any"));
  return [...set];
}

/**
 * Get a single playbook entry by id
 */
export function getPlaybookEntryById(id) {
  return PLAYBOOK_ENTRIES.find((e) => e.id === id) || null;
}
