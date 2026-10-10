// Radar creator — risultati dello studio di mercato (9-10/10/2026), mostrati nella vista "Mercato".
// Sono MISURE fatte una volta su dati raccolti in sessione (non ricalcolate dall'app):
// si aggiornano a mano quando si rifà lo studio. I conteggi per nicchia invece sono live
// (scouting-core.marketByGroup).
//
// Metodo, in breve:
//  - indice per nicchia = view mediane ÷ follower, diviso per la mediana degli account della
//    stessa fascia di follower (1,00 = media del mercato a parità di taglia);
//  - regole dei reel = ogni reel confrontato con gli altri della STESSA creator
//    (1.902 reel di 207 creator), differenza media pesata con intervallo bootstrap;
//  - tipi di reel esplosi = 201 reel molto sopra la mediana della loro creator, letti uno per
//    uno (127 creator); descrittivo, senza gruppo di controllo.

export const MARKET_ASOF = "9-10 ottobre 2026";

export const NICHE_INDEX = {
  "Comicità e ironia": 1.44,
  "Fetish e dominazione": 1.44,
  "Alternativa e goth": 1.16,
  "Estetica generica": 0.94,
  "Ruoli e mestieri": 0.83,
  "Viaggi e lifestyle": 0.66,
};

export const REEL_RULES = [
  { k: "audio", v: "+18%", tone: "up", title: "Audio originale", text: "La voce o un suono suo, non la musica di libreria. Intervallo 0% / +39%: positivo, misura incerta." },
  { k: "vuota", v: "−24%", tone: "down", title: "Didascalia vuota", text: "Scrivere sempre una o due righe." },
  { k: "domanda", v: "−15%", tone: "down", title: "Domanda in didascalia", text: "La domanda va a schermo, nei primi secondi." },
  { k: "hashtag", v: "−19%", tone: "down", title: "Tre o più hashtag", text: "Al limite della significatività. Due precisi bastano." },
  { k: "orario", v: "0", tone: "flat", title: "Orario e durata", text: "Nessun effetto misurabile." },
];

// Categorie con i nomi usati nel mondo dei social (decisione di Nicholas, 10/10/2026).
export const REEL_TYPES = [
  { t: "Q&A · domanda a schermo", x: 9.5, solo: 78, of: 61, top: true },
  { t: "Skit · doppio senso", x: 5.8, solo: 69, of: 73, top: true },
  { t: "POV · flirt in soggettiva", x: 4.1, solo: 73, of: 91, top: true },
  { t: "Outfit e transition", x: 6.5, solo: 61, of: 89 },
  { t: "Storytime · racconto in prima persona", x: 6.4, solo: 56, of: 44 },
  { t: "Skit · personaggio o mestiere", x: 6.2, solo: 50, of: 60 },
  { t: "Gaming", x: 8.6, solo: 100, of: 12, dim: true },
  { t: "Day in my life · vlog", x: 5.1, solo: 22, of: 25, dim: true },
];

export const COMPETITOR = {
  name: "«Serena, camionista, 54 anni»",
  line: "almeno sette account, lo stesso Telegram su tre di loro",
  text: "Due o tre reel al giorno, didascalie lunghe in prima persona che chiudono con una domanda. Un reel a 798 mila view. Occupa la nicchia «matura + mestiere», dove in Italia non c'è quasi nessuno.",
  handles: ["serena.cab_", "serena.onroad", "serena.motore.1", "serena.su_strada", "serena.strada0", "serena.incabina", "serena.direzione_nord"],
};

// Creator che vivono di caption (studio del 10/10/2026: 967 reel di 50 OnlyFanser, copertine
// lette una per una). Confronti dentro la stessa creator; tra parentesi quante creator entrano.
export const CAPTION_STUDY = {
  asof: "10 ottobre 2026",
  who: "17 OnlyFanser su 50 vivono di caption: una posa in casa e la frase sopra. Sono account piccoli (15 mila follower mediani contro 63 mila).",
  findings: [
    { v: "+79%", tone: "up", title: "La domanda a schermo fa commentare", text: "Quasi il doppio dei commenti per view, ma −26% di view (24 creator). Serve a far scrivere, non a farsi vedere." },
    { v: "≈ 0", tone: "flat", title: "Il caption reel non fa più view", text: "Stesse view degli altri tipi sulla stessa creator (20). Il vantaggio è il costo: si fa da sola in casa e si ripete." },
    { v: "≈ 0", tone: "flat", title: "La serie non alza le view del reel", text: "Stesse view di un reel isolato (25), un po' più condivisioni. Il suo effetto su iscritti e fiducia va misurato con un link per serie." },
    { v: "×3", tone: "up", title: "La confessione è la pista da provare", text: "Molto sopra la media della creator, ma la usano solo 4 creator: è un segnale, non una regola." },
  ],
  families: [
    { t: "Il personaggio con la sua serie", d: "Un ruolo fisso e una situazione che torna.", ex: ["«Collega: Sono sposato! Io:»", "«non so chi è più cavalla tra le due»"] },
    { t: "L'indovinello con il «senza»", d: "Un gioco di parole da decifrare; lo usano più creator.", ex: ["«La mia debolezza: Mare (senza re), Tuono (senza ono)… Capito?»"] },
    { t: "La domanda che apre la chat", d: "Meno view, molti più commenti.", ex: ["«Fammi una domanda»"] },
    { t: "Il doppio senso di casa propria", d: "Una frase innocente legata alla sua terra.", ex: ["«Sono sarda, è ovvio che il sole qui non è la cosa più calda»"] },
    { t: "La confessione", d: "Prima persona, qualcosa di intimo o di sfida.", ex: ["«Non mi sento bene, ho solo bisogno di un po' d'acqua»"] },
    { t: "Il gioco con chi guarda", d: "Un numero da trovare, una scelta da fare.", ex: ["«Il numero che vedi dice ciò che devi fare…»"] },
    { t: "La battuta secca su di sé", d: "Autoironia breve, funziona anche in inglese.", ex: ["«Io quando ho soldi»"] },
  ],
};
