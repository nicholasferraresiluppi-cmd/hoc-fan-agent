// Manuale salary model (26/11/2026) — il percorso di una modella salary dalla prima chat alla prima paga.
// Nato dall'onboarding di Sol (Argentina, novembre 2026): Nicholas trovava il documento ClickUp «troppo
// documento» e voleva vederlo come una lavagna che si compila man mano che le modelle avanzano.
// Prima versione su Miro, poi portata qui: «una sezione sulla nostra web app ci dà più libertà».
//
// Solo CONTENUTO (dati puri, niente logica): i passi coincidono con gli stati della lista ClickUp
// «Candidate» (space Salary, cartella 👩 Modelle). Il registro di ogni modella resta la card ClickUp;
// questa pagina la legge e basta.
//
// Regole che il testo rispetta (decise da Nicholas, non toglierle per «semplificare»):
//   - con i marketplace la chiamata con la modella si fa DOPO aver pagato l'intermediario
//   - alla modella niente percentuali sulla sua paga: solo cifre in dollari
//   - i profili social sono dell'agenzia: mai «i tuoi profili» / «tus perfiles»
//   - il marketplace non si nomina con la modella
//   - ogni messaggio in lingua straniera ha la traduzione italiana sotto

export const CANDIDATE_LIST_ID = "1501020000001355";

/** I 7 passi. `status` = nome dello stato sulla lista ClickUp (minuscolo, come lo restituisce l'API). */
export const STEPS = [
  {
    key: "trovata", status: "trovata", n: 1, title: "Trovata",
    who: ["Nicholas"],
    does: [
      "Annuncio su un marketplace (Nexus, BN Elite, MVP, Shaft)",
      "Scheda nella lista Candidate, con le risposte del marketplace come commenti datati",
      "Si paga l'intermediario, con garanzia",
    ],
    ask: ["Al venditore: foto e video in più, documento 18+, ore al giorno, limiti, OnlyFans già aperto?"],
    messages: [],
    watch: [
      "La chiamata con la modella si fa solo dopo aver pagato l'intermediario",
      "Segnare quando scade la garanzia",
    ],
    now: "Pagare l'intermediario e segnare la scadenza della garanzia, poi Gaia la contatta",
  },
  {
    key: "chiamata", status: "chiamata con gaia", n: 2, title: "Chiamata con Gaia",
    who: ["Gaia e Asja in call", "Nicholas in chat"],
    does: [
      "Primo messaggio di Gaia su Telegram",
      "Call di 30–40 minuti con la pagina di benvenuto a schermo",
      "5 tappe: chi siamo, conoscerla, la settimana, i soldi, come si parte",
    ],
    ask: ["In call: dove e con chi vive, dove gira, un'amica che aiuta, ore al giorno, passioni, limiti"],
    messages: ["m1"],
    watch: [
      "Non nominare il marketplace",
      "Niente percentuali sulla sua paga",
      "Mai «i tuoi profili social»: restano nostri",
      "Non promettere i livelli alti",
    ],
    now: "Fissare la call col messaggio 1 (sempre l'orario suo) e prepararle la pagina di benvenuto",
  },
  {
    key: "offerta", status: "offerta inviata", n: 3, title: "Offerta inviata",
    who: ["Gaia", "Nicholas"],
    does: [
      "500 $ di benvenuto quando il conto è aperto",
      "Fisso da 900 $, sale di livello col netto del profilo",
      "Bonus 300 $ se consegna tutti i PED",
      "Paga entro il 7 del mese, per il mese prima",
    ],
    ask: ["Dopo la call: la pagina e il numero WhatsApp", "Risposte su pagamenti e cifre alte"],
    messages: ["m2", "m3"],
    watch: ["Sulle cifre alte niente promesse: prima ci si arriva, poi se ne parla"],
    now: "Mandare la pagina (messaggio 2), rispondere alle domande (messaggio 3) e aprire i due gruppi WhatsApp",
  },
  {
    key: "contratto", status: "contratto", n: 4, title: "Contratto",
    who: ["Asja", "Davide per il template"],
    does: [
      "Gruppo WhatsApp finance: Gaia, Asja, Nicholas",
      "Documento d'identità, indirizzo, email e prova di residenza",
      "Contratto letto con calma e firmato online",
    ],
    ask: ["Benvenuto di Nicholas, poi richiesta documenti di Asja"],
    messages: ["m4", "m5"],
    watch: [
      "Template di Davide, art. 4.4: social a nome suo, da correggere prima della firma",
      "Fisso garantito: manca il parere di Davide",
    ],
    now: "Aprire il gruppo finance col benvenuto (messaggio 4), raccogliere i documenti (messaggio 5) e farle firmare il contratto",
  },
  {
    key: "conti", status: "conti aperti", n: 5, title: "Conti aperti",
    who: ["Asja", "Nicholas"],
    does: [
      "Conto bancario a suo nome",
      "OnlyFans: lei fa una volta la verifica del volto",
      "Parte il benvenuto da 500 $",
    ],
    ask: ["Dirle quando arriva il benvenuto"],
    messages: [],
    watch: ["Garanzia del marketplace: di solito OnlyFans, wallet e primo piano contenuti entro 7 giorni"],
    now: "Aprire conto e OnlyFans, poi far partire il benvenuto da 500 $",
  },
  {
    key: "lancio", status: "lancio", n: 6, title: "Lancio",
    who: ["Christian: social", "Sara: sexting e lei come persona"],
    does: [
      "Gruppo WhatsApp team",
      "Christian e Sara si presentano",
      "Call con Gaia: primo PED e nuovi profili social",
      "PED ogni lunedì in 2 parti, 2–4 set sexting a settimana",
    ],
    ask: ["Presentazioni di Christian e Sara"],
    messages: ["m6"],
    watch: ["Gli account social li apriamo noi e restano all'agenzia"],
    now: "Presentazioni nel gruppo team (messaggio 6) e call con Gaia per il primo PED",
  },
  {
    key: "attiva", status: "attiva", n: 7, title: "Attiva",
    who: ["Tutto il team", "Gaia: check del mese"],
    does: [
      "Paga dal 1 al 7 del mese",
      "Bonus 300 $ se tutti i PED",
      "Cambio di livello quando il netto sale",
    ],
    ask: ["Ogni lunedì il PED di Christian", "Ogni settimana il controllo di Sara"],
    messages: [],
    watch: [],
    now: "Check del mese con Gaia: PED consegnati, livello, paga entro il 7",
  },
];

/** Stato fuori dal percorso: la candidata non va avanti (resta visibile a parte, mai cancellata). */
export const DISCARDED_STATUS = "scartata";

/** Messaggi pronti. `<nome>`, `<paese>`, `<ora>` vanno sostituiti prima di copiare. */
export const MESSAGES = [
  {
    id: "m1", n: 1, step: "chiamata", title: "Primo messaggio", from: "Gaia", where: "Telegram", lang: "EN",
    text: `Hi <nome>! 🤍 I'm Gaia from House of Creators, an Italian agency. We are really happy to start working with you ✨

I would love to have a short video call to meet you, explain how we work and answer all your questions. It will be me and my colleague Asja, about 30–40 minutes.

Are you on <paese> time? If yes, are you free tomorrow at <ora> your time?

One small question: is it ok for you to do the call in English? If it's easier, you can also write to us in Spanish and we will translate 🍀`,
    it: "Ciao! Sono Gaia di House of Creators, agenzia italiana. Siamo felici di iniziare a lavorare con te. Vorrei fare una breve videochiamata per conoscerti, spiegarti come lavoriamo e rispondere alle tue domande: io e la mia collega Asja, 30–40 minuti. Sei sull'ora di <paese>? Sei libera domani alle <ora> tue? Ti va bene fare la chiamata in inglese? Se è più facile scrivici pure in spagnolo, traduciamo noi.",
    note: "Nel messaggio sempre l'orario suo, non il nostro.",
  },
  {
    id: "m2", n: 2, step: "offerta", title: "Dopo la chiamata", from: "Gaia", where: "Telegram", lang: "EN",
    text: `Thank you <nome>! We too!! 🤍

https://welcome.houseofcreators.app/<nome> here is the presentation we read earlier 🥰 for anything I'm here.

Have a good day ✨

Can you send us your WhatsApp number? So we can add you to the group chats.`,
    it: "Grazie! Anche noi! Ecco la presentazione che abbiamo letto prima, per qualsiasi cosa sono qui. Buona giornata. Ci mandi il tuo numero WhatsApp? Così ti aggiungiamo ai gruppi.",
    note: "Numeri argentini: su WhatsApp va il 9 dopo il prefisso (+54 9 11 …).",
  },
  {
    id: "m3", n: 3, step: "offerta", title: "Domande su pagamento e cifre alte", from: "Gaia", where: "Telegram", lang: "EN",
    text: `Hi <nome>! Great questions 🤍

Payments: we pay by bank transfer to an account in your name, every month within the first 7 days, for the month before. Asja will explain all the details in the finance group and help you open the account ✨

At a high level (e.g. $50,000 a month): it would be $2,400 fixed + the $300 bonus for your PEDs, so $2,700 a month. Right now we want to focus together on how to get there, because that's already a great result to reach. And if we get there and we work well together, we'll sit down and talk about it, no problem at all. We like to build long collaborations: some of our models have been with us for years.

Does that work for you? 🍀`,
    it: "Pagamenti: bonifico su un conto a tuo nome, entro il 7 di ogni mese per il mese prima; i dettagli li spiega Asja. A 50.000 $: 2.400 $ fissi più 300 $ di bonus, 2.700 $. Adesso concentriamoci su come arrivarci; se ci arriviamo e lavoriamo bene, ci sediamo e ne parliamo. Ti va bene così?",
    note: "Le cifre seguono la scala di livelli della sua pagina: se la scala cambia, cambia anche qui.",
  },
  {
    id: "m4", n: 4, step: "contratto", title: "Benvenuto nel gruppo finance", from: "Nicholas", where: "WhatsApp · <nome> × HOC · Contrato y pagos (Gaia, Asja, Nicholas)", lang: "ES",
    text: `¡Hola <nome>! 🤍 Soy Nicholas, de House of Creators. ¡Bienvenida oficialmente a HOC! Gaia y Asja me contaron de la llamada y estamos muy felices de empezar a trabajar contigo ✨

Este grupo es para la parte práctica: el contrato, tu cuenta bancaria y los pagos. Aquí te acompaña Asja, que en un momento te escribe lo que necesitamos para empezar. Vamos paso a paso y con calma: si algo no te queda claro, pregunta sin problema 🍀

En los próximos días te vamos a agregar también al grupo con el equipo que va a trabajar contigo todos los días.

¡Bienvenida otra vez! 🥰`,
    it: "Ciao! Sono Nicholas, di House of Creators. Benvenuta ufficialmente in HOC! Gaia e Asja mi hanno raccontato della chiamata e siamo molto felici di iniziare a lavorare con te. Questo gruppo serve per la parte pratica: contratto, conto bancario e pagamenti. Qui ti segue Asja, che tra poco ti scrive cosa ci serve per iniziare. Andiamo passo dopo passo e con calma: se qualcosa non ti è chiaro, chiedi pure. Nei prossimi giorni ti aggiungiamo anche al gruppo con il team che lavorerà con te ogni giorno. Benvenuta di nuovo!",
    note: "Va per primo, appena aperto il gruppo. Se Asja scrive ore dopo, «en un momento» diventa «te va a escribir».",
  },
  {
    id: "m5", n: 5, step: "contratto", title: "Documenti per contratto e conto", from: "Asja", where: "WhatsApp · <nome> × HOC · Contrato y pagos (Gaia, Asja, Nicholas)", lang: "ES",
    text: `Hola <nome>, cómo estás? 🫶🏻

Para poder enviarte el contrato, necesitaría que me facilitaras un documento de identidad, tu dirección de residencia y tu correo electrónico.

Por otro lado, para abrirte la cuenta bancaria de Cosmo, donde recibirás los ingresos generados a través de OnlyFans, quería preguntarte si tienes algún comprobante de domicilio, como una factura de la luz o un extracto bancario.`,
    it: "Ciao, come stai? Per mandarti il contratto avrei bisogno di un documento d'identità, del tuo indirizzo di residenza e della tua email. Poi, per aprirti il conto bancario Cosmo, dove riceverai gli incassi di OnlyFans, volevo chiederti se hai una prova di residenza, come una bolletta della luce o un estratto conto.",
    note: "Il testo è quello che usa Asja (26/11, Sol). Arriva dopo il benvenuto di Nicholas.",
  },
  {
    id: "m6", n: 6, step: "lancio", title: "Gruppo team", from: "Gaia, Christian, Sara", where: "WhatsApp · <nome> × House of Creators (Gaia, Christian, Sara, Nicholas)", lang: "ES",
    parts: [
      { from: "Gaia", text: "¡Hola <nome>! 🤍 Este es tu grupo con el equipo que va a trabajar contigo todos los días. Aquí están Christian y Sara, que ahora se presentan, y también Nicholas. Cualquier cosa, escríbenos aquí ✨" },
      { from: "Christian", text: "¡Hola! Soy Christian, tu social media manager 🤍 Cada lunes te voy a mandar tu PED, el plan de fotos y videos de la semana, con ejemplos para que sea fácil. En los próximos días organizamos una llamada con Gaia y Sara para presentarte todo y empezar juntos ✨" },
      { from: "Sara", text: "¡Hola! Soy Sara 🥰 Voy a estar a tu lado todos los días: para ver cómo estás, ayudarte a organizarte y explicarte cómo hacer tus sets de sexting. En los próximos días hacemos una llamada con Gaia y Christian. Mientras tanto, para cualquier cosa, aquí estoy 🍀" },
    ],
    it: "Gaia: questo è il tuo gruppo con il team che lavora con te ogni giorno. Christian: sono il tuo social media manager, ogni lunedì ti mando il PED con esempi; nei prossimi giorni una call con Gaia e Sara. Sara: sarò al tuo fianco ogni giorno, come stai, organizzazione, set sexting; nei prossimi giorni una call con Gaia e Christian.",
    note: "Mai «tus perfiles»: i profili social restano dell'agenzia.",
  },
];
