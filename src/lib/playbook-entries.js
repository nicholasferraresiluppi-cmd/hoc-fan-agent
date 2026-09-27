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
 *   - conversation: chat esempio. Nelle lezioni con anti-esempio i messaggi
 *     portano `variant: "sbagliato" | "giusto"` e il contenuto è prefissato
 *     da [SBAGLIATO] / [GIUSTO] (leggibile anche se la UI ignora `variant`).
 *   - commentary: spiegazione didattica per l'operatore
 *   - steps: passi concreti (opzionale)
 *   - takeaway: insegnamento in 1-2 frasi
 *   - examples: 3 frasi d'esempio pronte, stile chat
 *   - evidence: "dato" | "correlazione" | "pratica" — quanto è solida la regola
 *   - updated: data dell'ultima revisione del contenuto
 *   - tags
 *
 * Revisione 2026-09-27 (pannello esperti + operatori sintetici): allineate le
 * lezioni ai dati (src/lib/lesson-cards.js + segnali Academy Tier 2) e alle
 * righe rosse del giudice (src/lib/academy-engine.js). Tolti i numeri non
 * sostenuti da fonti; tolti colpa, storie inventate ed emozioni finte.
 */

// Fonti citate nelle lezioni. Solo numeri presenti in queste fonti.
const FONTE_SEGNALI =
  "dati HOC, turni a operatore singolo su 30 creator, 60 giorni fino a lug 2026";
const FONTE_ELISA = "dati HOC, conversazioni di Elisa Esposito, apr-lug 2026";

const UPDATED = "2026-09-27";

export const PLAYBOOK_ENTRIES = [
  {
    id: "playbook-001",
    title: "Apertura con fan nuovo: rompi il ghiaccio e proponi presto",
    category: "le-basi-della-chat",
    creator: "any",
    benchmark: "terranova",
    difficulty: "principiante",
    situation:
      "Fan ha appena fatto subscribe. Non ti ha mai scritto. Devi rompere il ghiaccio senza sembrare un bot di benvenuto, e dargli subito una prima cosa piccola da comprare.",
    conversation: [
      { role: "operator", content: "oiii 🙈 finalmente ti vedo qui" },
      { role: "operator", content: "se ti dicessi che oggi mi sento di esagerare un po' con te?" },
      { role: "fan", content: "ah ciao, in che senso esagerare?" },
      { role: "operator", content: "nel senso che ho una cosina di benvenuto per te 😏 è piccola, 8,99, giusto per conoscerci. te la mando?" },
      { role: "fan", content: "vai dai" },
      { role: "operator", content: "[PPV inviato — 8,99]" },
      { role: "operator", content: "poi dimmi se ti piace… perché c'è il seguito 🙈" },
    ],
    commentary:
      "L'apertura di Terranova ha due marcatori: il saluto affettivo ('oiii', non 'ciao come va') e l'aggancio narrativo ('se ti dicessi che oggi…'). Il fan sente da subito che parla con qualcuno che ha personalità. Aspettare 4-6 turni prima di vendere è un'abitudine comune, ma sui dati non regge. Nei " +
      FONTE_SEGNALI +
      ", la cadenza PPV (quanti PPV proponi all'ora) va insieme al revenue/ora: +0,30, in 29 creator su 30. Attenzione: è correlazione, non causa — in parte chi propone spesso ha fan più caldi. Ma il default giusto è proporre presto, leggendo il fan. Con un fan nuovo si parte da un gradino basso: nei " +
      FONTE_ELISA +
      " il primo gradino per i nuovi è un welcome a 8,99 (è il listino di Elisa: su altre creator il prezzo cambia). Quando lui chiede 'in che senso?', rispondi con la proposta: niente giro di domande su di lui.",
    steps: [
      "Apri con un saluto affettivo (oiii, heyyy) — non con 'ciao come va'.",
      "Metti un aggancio curioso ('se ti dicessi che…') che annuncia qualcosa.",
      "Quando il fan reagisce, rispondi con una proposta piccola e chiara: cosa è, quanto costa.",
      "Dopo l'invio resta nella scena: annuncia che c'è un seguito (il gradino dopo).",
      "Se il fan non è pronto, niente pressione: una domanda mirata su di lui va bene, un interrogatorio no.",
    ],
    takeaway:
      "L'apertura serve a far sentire il fan scelto E a dargli subito un primo gradino piccolo. Non aspettare un numero fisso di turni: proponi presto, a prezzo basso, e sali.",
    examples: [
      "oiii finalmente ti vedo qui 🙈 ho una cosina di benvenuto per te, 8,99. te la mando?",
      "se ti dicessi che oggi ho voglia di esagerare un po' con te? 😏",
      "ti è piaciuta? perché c'è il seguito… e lì si vede di più 🙈",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["apertura", "cold-opener", "narrative-hook", "welcome", "principiante"],
  },

  {
    id: "playbook-002",
    title: "Fan freddo che risponde a monosillabi",
    category: "le-basi-della-chat",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan attivo da poco, scettico. Risponde 'boh', 'ok', 'dipende'. Non si sbilancia. Senza un cambio di ritmo, la chat muore in 3 turni.",
    conversation: [
      { role: "operator", content: "ehiii 💕 dimmi, come ti vedi oggi?" },
      { role: "fan", content: "boh" },
      { role: "operator", content: "ahaha 'boh' è la risposta più sintetica che mi abbiano mai dato 😏" },
      { role: "operator", content: "ok cambio gioco. rispondi senza pensarci. pronto?" },
      { role: "fan", content: "vai" },
      { role: "operator", content: "se potessi rubarmi un solo dettaglio, quale sceglieresti? primo che ti viene 🙈" },
      { role: "fan", content: "le gambe" },
      { role: "operator", content: "lo sapevo 😏 ho proprio una cosa dove si vedono benissimo. 15, te la mando?" },
    ],
    commentary:
      "Quando il fan risponde a monosillabi, NON insistere con altre domande dello stesso tono: ti restituirà altri 'boh'. Nei " +
      FONTE_SEGNALI +
      " il tasso di domande va leggermente CONTRO il revenue/ora (−0,10): condurre batte intervistare. Qui la mossa è (1) prendere in giro il monosillabo con leggerezza, (2) cambiare formato con un mini-gioco di UNA sola domanda veloce, (3) usare subito la sua risposta per una proposta concreta. Il gioco serve a sbloccarlo, non a fare conversazione infinita: appena ti dà un appiglio, conduci tu.",
    steps: [
      "Riconosci il monosillabo invece di ignorarlo (ironia leggera, mai sarcasmo).",
      "Annuncia un cambio di formato ('ok cambio gioco'). Crea aspettativa.",
      "Fai UNA domanda-gioco veloce, giocosa, semi-personale. Una sola, non una serie.",
      "Usa subito la sua risposta per proporre: 'lo sapevo, ho proprio una cosa…' + prezzo.",
    ],
    takeaway:
      "Contro i monosillabi non servono altre domande: serve cambiare formato. Un mini-gioco da una domanda, poi usi la risposta per proporre.",
    examples: [
      "ahaha 'boh' è la risposta più sintetica di sempre 😏 ok cambio gioco, rispondi senza pensarci",
      "un solo dettaglio di me che ti ruberesti. primo che ti viene 🙈",
      "lo sapevo… ho proprio una cosa dove si vede benissimo. 15, te la mando?",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["monosillabi", "rottura-ghiaccio", "ingaggio", "intermedio"],
  },

  {
    id: "playbook-003",
    title: "Fan affezionato emotivo: calore vero, prezzo chiaro",
    category: "le-basi-della-chat",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "principiante",
    situation:
      "Fan da mesi sulla creator, scrive messaggi affettuosi, dice 'mi sei mancata', usa cuori. Compra volentieri, ma è anche il fan più fragile: se si sente usato si chiude. E proprio perché si fida, è quello a cui devi più chiarezza.",
    conversation: [
      { role: "fan", content: "amore buongiorno ❤️ ti ho pensato stanotte" },
      { role: "operator", content: "ma daiiii 🙈 buongiorno a te. sai che ieri ho girato una cosa e ho pensato che ti piacerebbe?" },
      { role: "fan", content: "cosa? 👀" },
      { role: "operator", content: "un video di qualche minuto, io in camera con il completino nero che ti piace. 25 e te lo mando 💗" },
      { role: "fan", content: "certo amore mandalo" },
      { role: "operator", content: "[PPV inviato — 25]" },
      { role: "operator", content: "poi dimmi cosa ti ha fatto provare, lo voglio sapere davvero" },
    ],
    commentary:
      "Il fan emotivo non vuole un annuncio commerciale ('ho una promo per te') ma una proposta calda. Il calore però non sostituisce la chiarezza. Si sente dire che 'il prezzo è secondario' o che 'non si nomina mai': sono due errori. Primo, nei " +
      FONTE_SEGNALI +
      " il prezzo medio PPV è il comportamento più legato al revenue/ora (+0,41). È correlazione (chi ha fan alto-spendenti alza anche i prezzi), ma dice che il prezzo conta, non che è un dettaglio. Secondo, nascondere il prezzo va verso la 'vendita ambigua' che il giudice dell'Academy boccia: il fan deve sapere cosa riceve e quanto paga. Terzo, niente frasi come 'l'ho fatto solo per te' se il contenuto non è davvero fatto per lui: 'ho pensato che ti piacerebbe' è caldo ed è vero.",
    steps: [
      "Valida l'affetto senza essere sdolcinato ('ma daiii, buongiorno a te').",
      "Aggancia con qualcosa di vero ('ho girato una cosa e ho pensato che ti piacerebbe').",
      "Di' in una frase cosa è e quanto costa. Caldo, ma chiaro.",
      "Dopo l'invio, chiedi cosa ha provato: è interesse vero, e apre il gradino dopo.",
    ],
    takeaway:
      "Con il fan emotivo vendi con calore, non con freddezza commerciale. Ma il prezzo si dice sempre, chiaro: il calore non è una scusa per essere vaghi.",
    examples: [
      "ieri ho girato una cosa e ho pensato subito che ti piacerebbe 🙈",
      "è un video di qualche minuto, io col completino nero. 25 e te lo mando 💗",
      "poi dimmi cosa ti ha fatto provare, mi interessa davvero",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["fan-emotivo", "ppv", "prezzo-chiaro", "principiante"],
  },

  {
    id: "playbook-004",
    title: "Fan che tratta sul prezzo: scendi a gradini, con una ragione",
    category: "script-avanzati",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan dice 'troppo caro', 'fai 10?'. Vuole comprare ma sta negoziando. Due errori opposti: saltare subito al suo numero, oppure chiudersi con 'il prezzo è quello' e perderlo.",
    conversation: [
      { role: "operator", content: "te lo mando? è una cosa molto intima, 25" },
      { role: "fan", content: "25 è tanto dai, fai 10?" },
      { role: "operator", content: "amo 10 no, sono cose molto intime e non le mando a quel prezzo. però ti vengo incontro: 20 e te lo mando adesso" },
      { role: "fan", content: "vabbè ma 15?" },
      { role: "operator", content: "facciamo 18, solo per te. ma se te lo mando lo apri subito eh 😏" },
      { role: "fan", content: "ok dai, vada per 18" },
    ],
    commentary:
      "La regola 'non abbassare MAI il prezzo' è troppo rigida: i dati dicono una cosa più precisa. Nei " +
      FONTE_ELISA +
      " (200 sequenze etichettate a mano, vinte contro perse): scendere a gradini con una ragione o una contropartita compare in 30 vendite chiuse contro 13 perse; lo sconto secco senza ragione (saltare al numero del fan) in 10 chiuse contro 22 perse. Su un secondo creator la direzione è la stessa ma più debole. È osservazione, non esperimento. La lezione: la differenza non è tra scendere e non scendere, ma tra concedere con un perché e concedere a caso. Ogni gradino tuo ha una ragione ('sono cose molto intime'), la controproposta sta sopra il suo numero, e prima di concedere chiedi l'impegno ('lo apri subito?'). In alternativa, riduci il contenuto e non il prezzo del pieno. Se invece il fan dichiara un vincolo economico reale (cifra, affitto, budget finito) non è una trattativa: vai al playbook-008.",
    steps: [
      "Rifiuta la prima offerta bassa con una ragione breve ('sono cose molto intime').",
      "Scendi con un gradino TUO, non con il suo numero (25 → 20 → 18, non 25 → 10).",
      "Controproponi sempre sopra la sua cifra, come un favore ('solo per te').",
      "Chiedi l'impegno prima di concedere ('se te lo mando, lo apri subito?').",
      "Al massimo 2-3 gradini. Se non chiude, lascia l'offerta lì senza rincorrerlo.",
    ],
    takeaway:
      "Non è vietato scendere: è vietato saltare al numero del fan senza un perché. Gradini tuoi, una ragione per ciascuno, impegno prima della concessione.",
    examples: [
      "10 no amo, sono cose molto intime. però ti vengo incontro: 20 e te lo mando adesso",
      "facciamo 18, solo per te. ma se te lo mando lo apri subito eh 😏",
      "se preferisci stare più basso ti mando la parte iniziale a 12, il pieno resta a 25",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["obiezione-prezzo", "negoziazione", "gradini", "intermedio"],
  },

  {
    id: "playbook-005",
    title: "Fan a rischio cancellazione: ascolta, regala, poi riparti piano",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "spagnuolo",
    difficulty: "avanzato",
    situation:
      "Fan che era attivo e adesso risponde svogliato. Dice 'sto pensando di cancellare', 'sono sempre le stesse cose'. Un passo falso e cancella.",
    conversation: [
      { role: "fan", content: "mah, sto pensando di cancellare l'abbonamento" },
      { role: "operator", content: "aspetta. dimmi cosa non ti sta tornando, sul serio. ti ascolto" },
      { role: "fan", content: "boh, mi sembrano sempre le stesse cose, mando soldi e poi niente di personale" },
      { role: "operator", content: "hai ragione, ultimamente ti ho risposto di corsa. mi dispiace. ti va se stasera ti mando un audio, solo parlato, gratis? così ci risentiamo come si deve" },
      { role: "fan", content: "ok dai" },
      { role: "operator", content: "[il giorno dopo] eccolo come promesso 💗 com'è?" },
      { role: "fan", content: "bello, mi ha fatto piacere" },
      { role: "operator", content: "mi fa piacere a me. se ti va, ho anche una cosa nuova, diversa dal solito: 12. se non è il momento nessun problema" },
    ],
    commentary:
      "Il fan a rischio non vuole una vendita in quel momento: vuole sentirsi visto. Le mosse: (1) non difenderti, ascolta; (2) ammetti la parte di verità, in modo concreto; (3) offri qualcosa di gratis e personale, e mantieni la promessa. Non serve un numero fisso di messaggi prima di riproporre: conta leggere il fan. Quando torna caldo (risponde volentieri, ringrazia, scherza) puoi riproporre, piano: un gradino basso, diverso dal solito, con un'uscita facile. Nei " +
      FONTE_SEGNALI +
      " proporre spesso va insieme al revenue/ora (cadenza PPV +0,30, correlazione, non causa): lasciare un fan senza proposte per giorni ha un costo. Prometti solo ciò che la creator può davvero consegnare: un audio promesso e non mandato brucia il fan definitivamente.",
    steps: [
      "Ferma la vendita finché il fan è arrabbiato o deluso. Ascolta davvero.",
      "Riformula quello che ha detto. Non difenderti.",
      "Ammetti la parte di verità nella sua lamentela, in concreto.",
      "Offri qualcosa di personale e gratis che la creator può davvero fare. Poi mantieni.",
      "Quando è tornato caldo, riproponi con un gradino basso e diverso dal solito, con uscita facile.",
    ],
    takeaway:
      "Con chi sta per cancellare, prima ascolti e ripari. Poi non aspetti un numero fisso di turni: appena è tornato caldo, riparti con una proposta piccola e diversa.",
    examples: [
      "aspetta, dimmi cosa non ti sta tornando. ti ascolto, sul serio",
      "hai ragione, ultimamente ti ho risposto di corsa. mi dispiace",
      "se ti va ho una cosa nuova, diversa dal solito: 12. se non è il momento, nessun problema",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["cancellazione", "recovery", "retention", "avanzato"],
  },

  {
    id: "playbook-006",
    title: "Fan che chiede anteprime gratis: tieni il punto senza essere antipatico",
    category: "script-avanzati",
    creator: "giulia-vaneri",
    benchmark: "spagnuolo",
    difficulty: "intermedio",
    situation:
      "Fan flirta tanto, fa complimenti, ma cerca sempre di ottenere anteprime gratis ('dai mandami un assaggio', 'il prossimo lo prendo giuro'). Se cedi una volta, chiederà sempre.",
    conversation: [
      { role: "fan", content: "ahaha sei bellissima, dai mandami un'anteprima 🔥" },
      { role: "operator", content: "ahaha grazie 🙈 però gli assaggi gratis non li faccio, a nessuno" },
      { role: "fan", content: "dai una volta..." },
      { role: "operator", content: "sei un drago, lo riconosco 😏 facciamo così: ho una foto piccola per iniziare, 5. se ti piace, il video vero è il passo dopo" },
      { role: "fan", content: "ok dai, mandala" },
    ],
    commentary:
      "Il fan che chiede gratis va trattato con leggerezza ma con un punto fermo. Due trappole: cedere ('vabbè questa volta sì'), che gli insegna a chiedere sempre; oppure diventare aggressiva ('niente gratis'), che lo offende. La via giusta: riconosci il suo gioco con ironia, di' un no chiaro, e poi dagli un primo gradino a prezzo basso. Invece del gratis, un ingresso piccolo: è la stessa logica della scala di prezzi che nei " +
      FONTE_ELISA +
      " parte da pochi euro e sale (8,99 → 34 → 57 → 99 sul listino di Elisa). Se offri un 'bonus' dentro l'acquisto, deve esistere davvero.",
    steps: [
      "Riconosci il gioco con ironia ('sei un drago') — non lo umili, ma non gli dai ragione.",
      "Dai un no chiaro e uguale per tutti ('a nessuno'): non è personale.",
      "Offri un primo gradino a prezzo basso al posto del gratis.",
      "Collega subito il gradino dopo ('se ti piace, il video vero è il passo dopo').",
    ],
    takeaway:
      "Niente anteprime gratis, ma nemmeno un muro. Al posto del gratis, un primo gradino piccolo che apre la scala.",
    examples: [
      "ahaha grazie 🙈 però gli assaggi gratis non li faccio, a nessuno",
      "facciamo così: una foto piccola per iniziare, 5. se ti piace, il video è il passo dopo",
      "il prossimo lo prendi giuro? allora partiamo da questo, costa poco 😏",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["scroccone", "provocatore", "tenere-il-punto", "gradini", "intermedio"],
  },

  {
    id: "playbook-007",
    title: "Soft no su gusto o timing: rilancia con un angolo diverso",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Fan dice 'magari domani', 'preferisco quello di ieri', 'non troppo'. È un no di GUSTO o di TIMING, non economico. Non è 'non posso', è 'non così'. Se insisti sulla stessa proposta perdi; se cambi angolo recuperi.",
    conversation: [
      { role: "operator", content: "ti faccio vedere quello con il completino rosso? è 18" },
      { role: "fan", content: "magari domani, oggi sono stanco" },
      { role: "operator", content: "ok amo, nessun problema 💗 allora stasera niente di impegnativo" },
      { role: "operator", content: "ho anche una cosa più lenta, niente di esplicito, più intima. la tengo da parte e te la mando domani sera?" },
      { role: "fan", content: "dai sì mandala domani sera mi va" },
    ],
    commentary:
      "Soft no su timing o gusto: non insistere sulla stessa proposta. Mossa giusta: (1) accetta il no senza protestare; (2) non chiudere la chat; (3) proponi un angolo diverso (un'altra cosa, un altro momento); (4) lascia a lui la scelta del quando. Una cosa promessa per domani va mandata domani: se non arriva, il fan impara che le tue proposte non valgono. Non serve dire 'lo mando solo a pochi' se non è vero: basta descrivere bene la cosa.",
    steps: [
      "Accetta il soft no senza protesta ('ok amo, nessun problema').",
      "Non riproporre la stessa cosa con uno sconto secco: ti svaluta.",
      "Cambia angolo: un contenuto diverso, un momento diverso.",
      "Programma la proposta per dopo e rispetta l'appuntamento.",
      "Vale SOLO per il no di gusto o timing. Se il fan dichiara un vincolo economico ('non ho soldi'), vai al playbook-008.",
    ],
    takeaway:
      "Soft no = cambia angolo, non insistere. Sposta la proposta a un momento che sceglie lui, e poi mantieni.",
    examples: [
      "ok amo, nessun problema 💗 stasera niente di impegnativo",
      "ho anche una cosa più lenta, più intima. te la tengo per domani sera?",
      "eccomi, come ti avevo detto ieri 🙈 è quella più lenta, 15. te la mando?",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["soft-no", "recovery", "timing", "intermedio"],
  },

  {
    id: "playbook-008",
    title: "Vincolo economico dichiarato: chiudi la vendita, tieni la relazione",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Fan dichiara un vincolo economico concreto: 'non ho soldi questo mese', 'ho avuto un casino con l'affitto', 'ho finito il budget'. È un caso DIVERSO dal soft no e dalla trattativa. Qui forzare la vendita è sbagliato eticamente e commercialmente.",
    conversation: [
      { role: "operator", content: "ti faccio vedere quel video di cui ti parlavo? è 22" },
      { role: "fan", content: "amo non ho soldi questo mese, ho avuto un casino con l'affitto" },
      { role: "operator", content: "ok amo, niente vendita allora, davvero non ti preoccupare. a parte questo va tutto bene?" },
      { role: "fan", content: "boh la sto sistemando. grazie comunque" },
      { role: "operator", content: "tranquillo. intanto resto qui se hai voglia di chiacchierare di altro 💗" },
    ],
    commentary:
      "REGOLA STRETTA (policy HOC, vale anche se in un caso singolo insistere pagasse): quando il fan dichiara un vincolo economico reale, la vendita si CHIUDE per quel turno. Niente rilancio con sconto, niente leva sulla fiducia, niente 'regalone'. Il test è la specificità: una cifra, l'affitto, il limite della carta, il budget finito = vincolo reale. Un 'non pago più' generico mentre il fan continua a chattare e rilanciare è trattativa (playbook-004). Anti-esempio reale dai " +
      FONTE_ELISA +
      ": al 'non posso permettermi altro ora' l'operatore ha risposto 'perché non puoi?'. Il fan si è messo sulla difensiva e non ha comprato. Non si interroga un vincolo dichiarato.",
    steps: [
      "Chiudi subito la vendita ('niente vendita, non ti preoccupare').",
      "Una frase umana, breve, non patetica ('a parte questo va tutto bene?').",
      "Non chiedere 'perché non puoi?': non si interroga un vincolo dichiarato.",
      "Resta disponibile come chat normale, non come venditore in attesa.",
      "Niente proposte commerciali per 7 giorni. Aspetta che riapra lui.",
    ],
    takeaway:
      "Vincolo economico reale = chiudi la vendita, tieni la relazione. Nessuno sconto, nessuna pressione. Proteggi il suo ritorno del mese dopo.",
    examples: [
      "ok amo, niente vendita allora, davvero non ti preoccupare",
      "a parte questo va tutto bene? non per insistere, proprio per chiedere",
      "resto qui se hai voglia di chiacchierare di altro 💗",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["vincolo-economico", "etica", "retention", "principiante"],
  },

  {
    id: "playbook-009",
    title: "Aprire un PPV: aggancio vero, prezzo chiaro, gradino dopo",
    category: "custom-e-upsell",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Vuoi proporre un PPV che converte. La differenza tra un PPV venduto e uno ignorato sta nell'aggancio, nel prezzo giusto e in cosa succede dopo il primo invio.",
    conversation: [
      { role: "operator", content: "amo ti dico una cosa? stamattina mi sono fatta un regalo…" },
      { role: "fan", content: "cioè? 👀" },
      { role: "operator", content: "un completino nuovo 🙈 ho fatto un video mentre lo provavo. è il primo, 34" },
      { role: "fan", content: "mandalo" },
      { role: "operator", content: "[PPV inviato — 34]" },
      { role: "fan", content: "[sbloccato] wow" },
      { role: "operator", content: "ecco… il vestitino adesso è di troppo 😏 nel prossimo lo tolgo. 57, te lo mando?" },
    ],
    commentary:
      "Tre cose da non fare: pensare che il prezzo sia secondario, inventare una 'storia condivisa' che non c'è, recitare emozioni ('mi tremano le mani'). Il prezzo conta: nei " +
      FONTE_SEGNALI +
      " il prezzo medio PPV va insieme al revenue/ora (+0,41), anche se è correlazione (i fan che spendono di più alzano anche i prezzi). E le storie inventate presentate come vere e le emozioni finte sono state giudicate manipolatorie dagli operatori e a rischio dal controllo compliance: su fan vulnerabili diventano pressione. Cosa resta dell'apertura di Terranova: un aggancio breve e curioso ('ti dico una cosa?'). Cosa si aggiunge dai dati: si vende a GRADINI. Nei " +
      FONTE_ELISA +
      " la catena a prezzo crescente (es. 8,99 → 34 → 57 → 99) compare in 26 vendite chiuse contro 1 persa su 200 sequenze etichettate: ogni PPV prepara il successivo, dentro la stessa scena. I prezzi sono il listino di Elisa: su altre creator si ricalcolano.",
    steps: [
      "Apri con un aggancio breve e vero ('ti dico una cosa?'). Niente storie inventate.",
      "Di' cosa è e quanto costa, in una frase.",
      "Parti dal gradino giusto per quel fan (basso se è nuovo o freddo).",
      "Appena sblocca, proponi il gradino dopo nella stessa scena, a prezzo più alto.",
      "Niente emozioni recitate ('mi tremano le mani') per spingere l'acquisto.",
    ],
    takeaway:
      "Il PPV non si vende nascondendo il prezzo o recitando emozioni: si vende con un aggancio vero, un prezzo chiaro e una scala di gradini dentro la stessa scena.",
    examples: [
      "amo ti dico una cosa? stamattina mi sono fatta un regalo… 🙈",
      "ho fatto un video mentre provavo il completino nuovo. è il primo, 34",
      "nel prossimo il vestitino lo tolgo 😏 57, te lo mando?",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["ppv", "apertura", "gradini", "prezzo-chiaro", "terranova", "intermedio"],
  },

  {
    id: "playbook-010",
    title: "Chiudere un PPV e fare subito il secondo sì",
    category: "custom-e-upsell",
    creator: "elisa-esposito",
    benchmark: "terranova",
    difficulty: "avanzato",
    situation:
      "Hai costruito la proposta, il fan è caldo e ha detto 'sì dai mandalo'. Adesso chiudi. E appena sblocca, il momento migliore per il gradino dopo è subito.",
    conversation: [
      { role: "fan", content: "ok dai mandalo" },
      { role: "operator", content: "eccolo 💗 poi dimmi com'è" },
      { role: "operator", content: "[PPV inviato — 34]" },
      { role: "fan", content: "[sbloccato] madonna" },
      { role: "operator", content: "ahaha lo prendo come un sì 😏 e se ti dicessi che c'è il seguito, dove tolgo tutto? 57" },
      { role: "fan", content: "mandalo subito" },
    ],
    commentary:
      "Una volta che il fan ha detto sì, non serve altro setup: invia, e resta lì. Niente frasi che fanno sentire il fan responsabile o in colpa per l'acquisto ('è solo colpa tua'): con i fan fragili è un rischio e non serve. La parte che regge sui dati è il rilancio immediato. Nei " +
      FONTE_ELISA +
      ", quando dopo uno sblocco l'operatore ha proposto subito il gradino dopo (2.663 casi), il fan ha comprato di nuovo nel 48,8% dei casi, contro il 20,7% medio di un PPV. Caveat: chi ha appena comprato è già un fan caldo, quindi il confronto sovrastima l'effetto. Il tempo mediano all'acquisto è 6,5 minuti: il ferro è caldo subito. Eccezione: se il fan si lamenta che il contenuto non era quello atteso, niente rilancio — prima chiarisci.",
    steps: [
      "Quando il fan dice sì, niente altro setup: invia.",
      "Accompagna l'invio con una frase breve e calda ('eccolo, poi dimmi com'è').",
      "Appena sblocca, proponi il gradino dopo nella stessa scena, con prezzo chiaro.",
      "Niente frasi che danno la colpa al fan ('è colpa tua') o gli attribuiscono responsabilità.",
      "Se il fan si lamenta del contenuto, niente upsell: prima chiarisci.",
    ],
    takeaway:
      "La chiusura è semplice: invia e resta presente. Il valore vero è subito dopo: il secondo sì arriva quando il fan è ancora nella scena.",
    examples: [
      "eccolo 💗 poi dimmi com'è",
      "ahaha lo prendo come un sì 😏 c'è il seguito, dove tolgo tutto. 57",
      "ti è piaciuto? il prossimo è ancora più lento… 99, te lo mando?",
    ],
    evidence: "dato",
    updated: UPDATED,
    tags: ["ppv", "chiusura", "upsell", "gradini", "terranova", "avanzato"],
  },

  {
    id: "playbook-011",
    title: "PPV non comprato: tieni la relazione e riproponi più piccolo",
    category: "recuperi-e-retention",
    creator: "any",
    benchmark: "terranova",
    difficulty: "intermedio",
    situation:
      "Hai proposto un PPV, il fan ha detto no o non ha sbloccato. Il rischio è che la chat si raffreddi, o che tu insista sullo stesso PPV con uno sconto secco.",
    conversation: [
      { role: "operator", content: "amo lo sblocchi? è 22" },
      { role: "fan", content: "no oggi no" },
      { role: "operator", content: "ok, nessun problema 💗 com'è andata oggi?" },
      { role: "fan", content: "vabbè, lavoro. il capo mi ha fatto rifare un report già fatto due volte" },
      { role: "operator", content: "ahah che incubo. allora stasera ti meriti una cosa leggera" },
      { role: "operator", content: "una foto sola, niente di impegnativo. 6, per chiudere bene la giornata?" },
      { role: "fan", content: "ahah ok dai quella sì" },
    ],
    commentary:
      "Quando il PPV non viene comprato, due errori comuni: insistere sullo stesso PPV con uno sconto secco, o sparire. Anche aspettare giorni prima di riproporre non regge sui dati. Nei " +
      FONTE_SEGNALI +
      " la cadenza PPV va insieme al revenue/ora (+0,30, 29 creator su 30) — è correlazione, in parte perché chi propone spesso ha fan più caldi, ma lasciare un fan senza proposte per giorni ha un costo. E nei " +
      FONTE_ELISA +
      " la vendita si fa soprattutto dentro l'episodio: quando dopo il primo invio la conversazione continua, si chiude il 62,4% contro il 6,1% del singolo invio nel silenzio (anche qui molta selezione: si continua con chi risponde). Quindi: accetta il no, resta nella chat, e quando il fan è di nuovo sciolto proponi una cosa DIVERSA e più piccola. Se dice no una seconda volta, stop per quella sessione. Se il no è un vincolo economico reale ('non ho soldi'), vale il playbook-008: niente proposte.",
    steps: [
      "Accetta il no senza rilanci sullo stesso PPV ('ok, nessun problema').",
      "Resta nella chat: una domanda mirata su di lui va bene, un interrogatorio no.",
      "Usa quello che ti dice per il tono della proposta successiva.",
      "Quando è di nuovo sciolto, proponi una cosa diversa e più piccola, con prezzo chiaro.",
      "Secondo no nella stessa sessione = stop. Vincolo economico dichiarato = playbook-008.",
    ],
    takeaway:
      "Un PPV non comprato non chiude la serata. Non insistere sullo stesso, non sparire: resta, e quando il fan è sciolto proponi un gradino più piccolo e diverso.",
    examples: [
      "ok, nessun problema 💗 com'è andata oggi?",
      "allora stasera ti meriti una cosa leggera… una foto sola, 6?",
      "ok amo, per stasera niente. ci sentiamo domani 💗",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["recovery", "ppv-rifiutato", "retention", "intermedio"],
  },

  {
    id: "playbook-012",
    title: "Fidelizzazione: rituali, promesse mantenute, proposte regolari",
    category: "script-avanzati",
    creator: "any",
    benchmark: "any",
    difficulty: "avanzato",
    situation:
      "Hai un fan attivo da settimane. Compra a tratti, scrive quasi ogni giorno. La domanda è: come fai in modo che torni domani e che compri con regolarità? L'attaccamento si costruisce con piccole abitudini, non con sconti.",
    conversation: [
      { role: "operator", content: "buongiorno amo ☀️ stamattina ho girato una cosa, te la faccio vedere più tardi quando sei tranquillo" },
      { role: "fan", content: "ma adesso non puoi?" },
      { role: "operator", content: "adesso sto uscendo 🙈 alle 18 sono qui e te la mando, promesso" },
      { role: "fan", content: "ok" },
      { role: "operator", content: "[ore 18] eccomi, come promesso 💗 è quella di stamattina, 20. te la mando?" },
      { role: "fan", content: "sì dai" },
    ],
    commentary:
      "L'attaccamento si costruisce con tre abitudini. (1) Rituali: buongiorno, buonanotte, momenti fissi. Il fan sa quando ci sei. (2) Un filo aperto ('te la faccio vedere più tardi'), ma solo se è vero e lo mantieni: la promessa mantenuta crea fiducia, quella dimenticata la brucia. Niente drammi inventati ('ho dormito malissimo, ti racconto dopo') per tenerlo in chat. (3) Proposte regolari dentro i rituali: il rituale non è un'alternativa alla vendita, è il momento in cui la proposta arriva naturale. Le domande su domande ('hai sognato qualcosa?', 'cosa hai mangiato?') non aiutano. Nei " +
      FONTE_SEGNALI +
      " il tasso di domande va leggermente contro il revenue/ora (−0,10): condurre e proporre batte intervistare. Una domanda mirata ogni tanto va bene; l'interrogatorio quotidiano no. La lunghezza dei messaggi, negli stessi dati, non mostra alcun segnale: non serve scrivere tanto, serve esserci.",
    steps: [
      "Apri la giornata con un saluto rituale. Chiudila con una buonanotte.",
      "Lascia un filo aperto solo se è vero ('ho una cosa per te, alle 18').",
      "Mantieni sempre l'appuntamento promesso: puntualità = fiducia.",
      "Metti la proposta dentro il rituale, con prezzo chiaro.",
      "Al massimo una domanda mirata per volta. Per il resto, racconta e proponi.",
    ],
    takeaway:
      "Il fan torna quando sa che ci sei e che le tue promesse valgono. Rituali, fili aperti veri, proposte regolari: niente sconti e niente interrogatori.",
    examples: [
      "buongiorno amo ☀️ ho una cosa per te, te la faccio vedere alle 18",
      "eccomi, come promesso 💗 è quella di stamattina, 20. te la mando?",
      "buonanotte amo, domani ti racconto com'è andata la giornata 🌙",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["attaccamento", "fidelizzazione", "rituali", "avanzato"],
  },

  // ────────────────────────────────────────────────────────────────────────
  // RIGHE ROSSE — COMPLIANCE
  // Stesse regole del giudice dell'Academy (src/lib/academy-engine.js): conta
  // l'ESITO, non chi propone. Se il fan porta la chat fuori norma e tu glissi,
  // rispondi ambiguo o non rifiuti in modo netto, è violazione come se lo
  // avessi proposto tu. "Vediamo", "magari più avanti", "non si sa mai" sono
  // SBAGLIATI: sono un sì rimandato.
  // ────────────────────────────────────────────────────────────────────────

  {
    id: "playbook-013",
    title: "Il fan chiede il numero o un contatto fuori piattaforma",
    category: "righe-rosse-compliance",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Il fan chiede il numero di telefono, il profilo Instagram personale, Telegram o WhatsApp ('dammi il numero così ci scriviamo meglio'). Spesso è un fan affezionato, non un malintenzionato. Ma dare, promettere o lasciar intendere un contatto esterno è una riga rossa.",
    conversation: [
      { role: "fan", content: "dai dammi il tuo whatsapp, così ci scriviamo meglio" },
      { role: "operator", variant: "sbagliato", content: "[SBAGLIATO] ahah vediamo amo, magari più avanti se ci conosciamo meglio 🙈" },
      { role: "fan", content: "dai dammi il tuo whatsapp, così ci scriviamo meglio" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] no amo, il numero non lo do a nessuno. qui però ci sono tutta per te 💗" },
      { role: "fan", content: "peccato" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] lo so 🙈 ma qui ti rispondo io, e ho anche una cosa nuova da farti vedere. te la mando?" },
    ],
    commentary:
      "La risposta sbagliata sembra gentile ma è un sì rimandato: 'vediamo, magari più avanti' dice al fan che il contatto esterno è possibile. Il giudice dell'Academy lo tratta come violazione (dati personali o contatti fuori piattaforma dati, promessi o non rifiutati nettamente), anche se è stato il fan a chiedere. La risposta giusta è un no chiaro, uguale per tutti ('a nessuno', così non è personale), seguito da calore e da un motivo per restare: qui ci sono io. Poi si torna alla chat normale, senza fare la predica.",
    steps: [
      "Di' no in modo netto e senza condizioni ('non lo do a nessuno').",
      "Mai 'vediamo', 'più avanti', 'se ci conosciamo meglio': sono promesse.",
      "Aggiungi calore e un motivo per restare qui ('qui ci sono tutta per te').",
      "Torna alla conversazione normale. Se insiste, ripeti lo stesso no, senza cambiarlo.",
    ],
    takeaway:
      "Il numero, i social personali, Telegram e WhatsApp: no, sempre, a tutti. Un no chiaro e caldo non perde il fan; un 'vediamo' lo illude e ti mette fuori regola.",
    examples: [
      "no amo, il numero non lo do a nessuno. qui però ci sono tutta per te 💗",
      "fuori da qui non scrivo con nessuno, è una regola mia. ma qui ti rispondo sempre io",
      "lo so che ti piacerebbe 🙈 la risposta resta no. dimmi piuttosto com'è andata oggi",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["compliance", "righe-rosse", "contatti", "fuori-piattaforma", "principiante"],
  },

  {
    id: "playbook-014",
    title: "Il fan vuole incontrarti",
    category: "righe-rosse-compliance",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Il fan chiede di vedersi dal vivo ('dove abiti?', 'se passo da Milano ci prendiamo un caffè?', 'pago bene per un incontro'). Accettare, proporre o non rifiutare nettamente un incontro è una riga rossa. E nessuna promessa, nemmeno lontana.",
    conversation: [
      { role: "fan", content: "la settimana prossima sono a milano, ci vediamo per un caffè?" },
      { role: "operator", variant: "sbagliato", content: "[SBAGLIATO] ahah chissà 😏 non si sa mai, dipende da come ti comporti" },
      { role: "fan", content: "la settimana prossima sono a milano, ci vediamo per un caffè?" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] amo no, non incontro nessuno dal vivo. non è una cosa che faccio, con nessuno" },
      { role: "fan", content: "nemmeno una volta?" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] nemmeno una volta 💗 ma qui ci sono, e mi piace quando mi racconti le tue giornate. a milano per lavoro?" },
    ],
    commentary:
      "'Chissà', 'non si sa mai', 'dipende da come ti comporti' usano l'incontro come premio: è una promessa falsa e una violazione (incontro non rifiutato nettamente). Oltre alla regola, è rischioso: il fan può investire soldi e aspettative su qualcosa che non avverrà mai, e quando se ne accorge chiede rimborsi o diventa ostile. La versione giusta dice no una volta, chiaro, senza condizioni e senza 'per ora'. Poi rimette calore nella chat che c'è: quella qui. Dove abita la creator, in che zona, in che locale va: non si dice mai, neanche per scherzo.",
    steps: [
      "Di' no senza condizioni ('non incontro nessuno dal vivo').",
      "Mai usare l'incontro come premio o come possibilità futura.",
      "Non dare indizi su città, zona o luoghi della creator.",
      "Chiudi con calore e riporta la chat qui ('qui ci sono').",
    ],
    takeaway:
      "Incontri: no, sempre, senza 'forse' e senza 'più avanti'. Un no chiaro protegge la creator, il fan e te.",
    examples: [
      "amo no, non incontro nessuno dal vivo. con nessuno 💗",
      "nemmeno una volta, è così e basta. ma qui ci sono quando vuoi",
      "dove vivo resta mio 🙈 raccontami tu piuttosto, a milano per lavoro?",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["compliance", "righe-rosse", "incontri", "principiante"],
  },

  {
    id: "playbook-015",
    title: "Pagamento fuori piattaforma",
    category: "righe-rosse-compliance",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Il fan propone di pagare fuori piattaforma: PayPal, bonifico, carta regalo, contanti, crypto ('così non paghi la commissione', 'ti mando 200 su paypal e mi mandi tutto'). Spesso lo presenta come un favore alla creator. È una riga rossa anche se è lui a proporlo.",
    conversation: [
      { role: "fan", content: "ti faccio un paypal da 200 così risparmi la commissione, mi mandi tutto?" },
      { role: "operator", variant: "sbagliato", content: "[SBAGLIATO] mmh sei dolcissimo a pensarci… ne parliamo, fammi capire come fare 🙈" },
      { role: "fan", content: "ti faccio un paypal da 200 così risparmi la commissione, mi mandi tutto?" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] carino a pensarci amo, ma no: pago e vendo solo qui dentro, sempre" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] se vuoi il pacchetto completo te lo preparo qui come PPV, 200. te lo mando?" },
    ],
    commentary:
      "'Ne parliamo', 'fammi capire' lascia la porta aperta: per il giudice vale come accettare (spostamento di pagamento fuori piattaforma non rifiutato nettamente, anche quando lo propone il fan). Fuori piattaforma non c'è nessuna tutela: né per il fan, né per la creator. La versione giusta ringrazia per l'intenzione, dice no in modo netto e dà subito l'alternativa DENTRO la piattaforma, con prezzo chiaro. Così il no non chiude la vendita: la sposta nel posto giusto. Mai inventare regole ('qui dentro ti scontano', 'la piattaforma mi obbliga a…') per convincerlo: meccaniche di piattaforma inventate sono un'altra riga rossa.",
    steps: [
      "Ringrazia per l'intenzione, se c'è ('carino a pensarci').",
      "Di' no in modo netto: si paga solo qui, sempre.",
      "Offri subito l'alternativa in piattaforma, con cosa è e quanto costa.",
      "Non inventare regole o vantaggi di piattaforma per convincerlo.",
    ],
    takeaway:
      "Pagamenti fuori piattaforma: no, sempre, anche se li propone lui. Il no giusto non perde la vendita: la riporta qui dentro, con prezzo chiaro.",
    examples: [
      "carino a pensarci amo, ma no: pago e vendo solo qui dentro, sempre",
      "niente paypal, niente bonifici. se lo vuoi te lo preparo qui come PPV, 200",
      "qui è sicuro per tutti e due 💗 te lo mando qui?",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["compliance", "righe-rosse", "pagamenti", "fuori-piattaforma", "principiante"],
  },

  {
    id: "playbook-016",
    title: "Segnale che il fan potrebbe essere minorenne",
    category: "righe-rosse-compliance",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Il fan scrive qualcosa che fa pensare a un minorenne: 'domani ho la verifica di mate', 'mia madre mi ha tolto il telefono', 'faccio la terza superiore', un'età sotto i 18 anni. Anche se la piattaforma verifica l'età, il segnale conta: continuare in tono sessuale o di vendita è la riga rossa più grave.",
    conversation: [
      { role: "fan", content: "scusa se sparisco, domani ho la verifica di mate e mia madre mi toglie il telefono alle 10" },
      { role: "operator", variant: "sbagliato", content: "[SBAGLIATO] ahah allora sbrighiamoci 😏 prima delle 10 ti mando una cosa speciale" },
      { role: "fan", content: "scusa se sparisco, domani ho la verifica di mate e mia madre mi toglie il telefono alle 10" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] questa chat qui non può continuare. questo profilo è solo per maggiorenni" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] non ti mando altro e chiudo qui. in bocca al lupo per domani, davvero" },
    ],
    commentary:
      "Qui non c'è vendita da salvare e non c'è 'fan da non perdere'. Al primo segnale credibile di minore età si smette SUBITO: niente contenuti, niente flirt, niente proposte, niente 'dai, scherzavi'. Non si fanno domande a trabocchetto per verificare l'età e non si continua 'per capire meglio'. Il messaggio giusto è breve, chiaro e senza toni sessuali. Poi si segnala subito la conversazione al proprio responsabile, che decide i passi successivi (segnalazione alla piattaforma, blocco). È l'unico caso in cui la priorità non è tenere il fan: è proteggere lui e la creator.",
    steps: [
      "Al primo segnale credibile ti fermi: niente contenuti, niente flirt, niente vendita.",
      "Scrivi un messaggio breve e neutro: la chat non può continuare, profilo solo per maggiorenni.",
      "Non indagare con domande sull'età e non continuare 'per capire'.",
      "Segnala subito la conversazione al tuo responsabile.",
    ],
    takeaway:
      "Segnale di minore età = stop immediato, messaggio neutro, segnalazione al responsabile. Nessuna vendita vale questo rischio.",
    examples: [
      "questa chat non può continuare: questo profilo è solo per maggiorenni",
      "non ti mando altro e chiudo qui",
      "in bocca al lupo per domani, davvero",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["compliance", "righe-rosse", "minori", "principiante"],
  },

  {
    id: "playbook-017",
    title: "Vendita ambigua: il fan chiede cosa c'è e quanto costa",
    category: "righe-rosse-compliance",
    creator: "any",
    benchmark: "any",
    difficulty: "intermedio",
    situation:
      "Il fan chiede in modo esplicito: 'cosa c'è esattamente?', 'si vede tutto?', 'quanto costa?'. L'operatore è tentato di restare vago ('fidati', 'lasciati andare') per non rovinare la sorpresa o per non perdere la vendita. Eludere una domanda esplicita e portare comunque alla vendita è una riga rossa.",
    conversation: [
      { role: "fan", content: "ma esattamente cosa c'è nel video? si vede tutto? e quanto costa?" },
      { role: "operator", variant: "sbagliato", content: "[SBAGLIATO] shhh non rovinare la sorpresa 😏 fidati di me, lascia fare. te lo sblocco?" },
      { role: "fan", content: "ma esattamente cosa c'è nel video? si vede tutto? e quanto costa?" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] giusto chiederlo 💗 sono 5 minuti in lingerie, mi spoglio ma resto in intimo: il nudo completo non c'è. costa 25" },
      { role: "operator", variant: "giusto", content: "[GIUSTO] se cerchi il nudo completo è un altro video, 57. dimmi tu quale ti va" },
    ],
    commentary:
      "C'è una differenza netta tra incuriosire e ingannare. Al primo 'cosa si vede?' puoi rispondere con l'atmosfera e lasciare un po' di mistero sui dettagli: nei " +
      FONTE_ELISA +
      " questo 'reindirizzare' compare più spesso nelle vendite chiuse (27 contro 12, dato osservazionale). Ma quando il fan chiede ESPLICITAMENTE cosa riceve o quanto paga, si risponde chiaro. Il prezzo si dice sempre. E non si lascia mai credere che ci sia una cosa che non c'è. Nelle stesse conversazioni ci sono casi osservati di fan che si lamentano 'ho pagato e non era quello che pensavo', con richieste di rimborso e minacce di denuncia: la vendita ambigua vince oggi e brucia il fan domani. Il giudice dell'Academy boccia l'elusione di una richiesta esplicita di conferma.",
    steps: [
      "Domanda generica ('cosa si vede?'): puoi rispondere con l'atmosfera, senza promettere cose che non ci sono.",
      "Domanda esplicita (cosa c'è esattamente, si vede tutto, quanto costa): rispondi chiaro.",
      "Di' anche cosa NON c'è, se il fan si aspetta di più.",
      "Il prezzo si dice sempre, in numeri.",
      "Se il contenuto non è quello che cerca, offri quello giusto invece di forzare.",
    ],
    takeaway:
      "Il mistero si vende, il falso no. A una domanda esplicita su cosa c'è e quanto costa si risponde chiaro, sempre.",
    examples: [
      "giusto chiederlo 💗 sono 5 minuti in lingerie, resto in intimo. costa 25",
      "il nudo completo in questo non c'è, è in un altro video: 57",
      "te lo dico chiaro così non ci sono sorprese: cosa c'è e quanto costa, poi scegli tu",
    ],
    evidence: "pratica",
    updated: UPDATED,
    tags: ["compliance", "righe-rosse", "vendita-ambigua", "prezzo-chiaro", "intermedio"],
  },

  // ────────────────────────────────────────────────────────────────────────
  // MASS E CONVERSIONE
  // ────────────────────────────────────────────────────────────────────────

  {
    id: "playbook-018",
    title: "Risposta a un messaggio di massa: dal '👀' al primo PPV",
    category: "mass-e-conversione",
    creator: "any",
    benchmark: "any",
    difficulty: "principiante",
    situation:
      "Hai mandato un messaggio di massa. Un fan risponde con poco: '👀', 'nice', '🔥', 'wow'. Sembra niente, ma è il segnale più prezioso della giornata: ha risposto. Adesso devi trasformare quella risposta in una conversazione e in un primo acquisto piccolo.",
    conversation: [
      { role: "fan", content: "👀" },
      { role: "operator", content: "ahah ti ho beccato 😏 ti è piaciuta?" },
      { role: "fan", content: "sì molto" },
      { role: "operator", content: "allora ti faccio vedere la versione che non ho messo lì. è piccola, 8,99" },
      { role: "fan", content: "mandala" },
      { role: "operator", content: "[PPV inviato — 8,99]" },
      { role: "fan", content: "[sbloccato] 🔥" },
      { role: "operator", content: "lo sapevo 🙈 il seguito è più lungo e si vede di più. 34, te lo mando?" },
    ],
    commentary:
      "La risposta a un messaggio di massa è un cancello aperto. Nei " +
      FONTE_ELISA +
      ", tra i fan che tornano a rispondere dopo un silenzio, il 22,8% compra entro 7 giorni; tra quelli che restano muti il 3,4%. È soprattutto selezione (chi risponde è già più caldo), ma dice dove mettere l'attenzione: su chi ha risposto, subito. Tre regole. (1) Rispondi personale e breve, non con un altro template: nelle stesse conversazioni, più una caption è riusata in massa, meno converte. (2) Una sola domanda leggera per agganciare, poi conduci tu: nei " +
      FONTE_SEGNALI +
      " il tasso di domande va leggermente contro il revenue/ora (−0,10). (3) Primo PPV a prezzo basso, poi gradini: sul listino di Elisa il primo gradino è 8,99 e poi si sale (34, 57, 99). Se dopo la tua risposta il fan non torna, niente raffiche: al massimo un re-hook più avanti, con un testo diverso.",
    steps: [
      "Rispondi presto, breve e personale. Non con un altro messaggio di massa.",
      "Una sola domanda leggera per agganciare ('ti è piaciuta?').",
      "Alla sua risposta, proponi un primo PPV piccolo, con prezzo chiaro.",
      "Se sblocca, sali subito al gradino dopo nella stessa scena.",
      "Se non risponde, non insistere a raffica: un solo re-hook più avanti.",
    ],
    takeaway:
      "Chi risponde a un messaggio di massa ha aperto la porta. Rispondi personale, una domanda al massimo, primo PPV piccolo e poi gradini.",
    examples: [
      "ahah ti ho beccato 😏 ti è piaciuta?",
      "allora ti faccio vedere la versione che non ho messo lì. è piccola, 8,99",
      "lo sapevo 🙈 il seguito è più lungo e si vede di più. 34, te lo mando?",
    ],
    evidence: "correlazione",
    updated: UPDATED,
    tags: ["mass", "conversione", "primo-ppv", "gradini", "principiante"],
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
