// Carte-lezione Academy — il nuovo formato evidence-based (v lesson-1, lug 2026).
//
// PRINCIPIO (decision log 26 lug): il curriculum non si scrive a mano, si ESTRAE
// dalle conversazioni reali che hanno venduto, si cura e si etichetta per evidenza.
// Ogni affermazione porta una delle 4 etichette:
//   - "dato"                  → numero deterministico dal warehouse (query riproducibile)
//   - "correlazione"          → segnale correlazionale con caveat dichiarato (mai causa)
//   - "osservato-contrastato" → mossa con contrasto vinte-vs-perse su sequenze etichettate
//   - "osservato"             → pattern visto nel reale ma senza contrasto (aneddotico)
// Il chip certifica SOLO l'enunciato, mai il meccanismo psicologico sopra.
//
// PROVENIENZA lezione "ppv-gradini-elisa": estrazione BigQuery onlyfans.chat +
// attributed_transactions (Elisa Esposito, 2026-04-01→07-25). Episodio = PPV
// inviati allo stesso fan con gap ≤90min; vinto = txn 'message' entro 6h; mass
// blast esclusi (stessa caption a ≥10 fan/ora). 21.297 episodi 1:1; 200 sequenze
// etichettate a mano (100 vinte + 100 perse); distillazione con 3 critici
// avversariali (onestà-dati, compliance, pedagogia: 17 correzioni imposte).
// Generalizzazione testata su Giulia Ottorini (15.377 episodi, 200 sequenze).
// Fan pseudonimizzati; contenuto esplicito oscurato dove non porta la meccanica.
//
// GOVERNANCE: materiale di coaching, FUORI da score/comp (policy dati-fan).
// Le lezioni sono versionate in codice come playbook-entries; la revisione
// pre-publish è anche gate PII. Servite SOLO via API auth (i chunk statici
// Next sono pubblici: mai importare queste carte in un client component).

export const LESSON_VERSION = "lesson-1-2026-07";

const PPV_GRADINI_ELISA = {
  id: "ppv-gradini-elisa",
  status: "pilota",
  title: "Aprire e chiudere un PPV: il metodo dei gradini",
  creator: "Elisa Esposito",
  subtitle:
    "Distillata da 21.297 episodi PPV reali (apr–lug 2026), 200 sequenze etichettate vinte-contro-perse, 3 critici avversariali. Ogni affermazione porta la sua etichetta di evidenza.",
  provenance: {
    episodi: 21297,
    finestra: "2026-04-01 → 2026-07-25",
    sequenze_etichettate: 200,
    winrate_medio: 20.7,
    correzioni_critici: 17,
  },

  // Gap del profilo-segnali (operator-signals) che questa lezione allena, in
  // ordine di rilevanza. Mappatura curatoriale, NON transfer validato: dice
  // "questa lezione tratta quel comportamento", non "chi la studia migliora".
  trains_gaps: ["avg_ppv_price", "ppv_per_h", "question_rate"],

  // "Se ricordi solo tre cose" — la velocità 1.
  three_things: [
    {
      title: "Il PPV è un episodio, non una cartolina",
      body:
        "La vendita avviene nei messaggi dopo il primo invio: multi-invio 62,4% vs colpo secco 6,1% — con caveat di selezione: si continua a scrivere a chi risponde.",
    },
    {
      title: "Si vende a catene di gradini, non a caption",
      body:
        "La catena-script (spogliarello a puntate, prezzo che sale a ogni gradino) compare in 26 vinte contro 1 persa. Non memorizzare caption: memorizza catene.",
    },
    {
      title: "Mai il salto al numero del fan",
      body:
        "Si scende a gradini con una ragione. Lo sconto secco senza ragione è il marcatore più sbilanciato verso le perse: 10 vinte / 22 perse.",
    },
  ],

  // La mappa dei gradini — l'artefatto da memorizzare (velocità 2).
  chain_map: {
    intro:
      "Il 71,8% degli episodi usa caption da libreria (top: 1.283 fan distinti). Ma l'unità dello script non è la caption — è la catena: quale gradino sei, a che prezzo, cosa prepara il gradino dopo.",
    ingresso: { price: "8,99", label: "welcome low-ticket", note: "fan appena iscritto" },
    principale: [
      { price: "34", label: "«questo vestitino adesso è di troppo…»", note: "gradino d'apertura" },
      { price: "57", label: "«ecco, ho tolto il vestitino — è tutta colpa tua»", note: "149 episodi concatenati · winrate 40,6%" },
      { price: "99–100", label: "gradino intermedio", note: "dentro la stessa scena" },
      { price: "200", label: "«finalmente mi sono decisa…»", note: "fascia top · 1.283 fan" },
    ],
    parallele: [
      { price: "34", label: "«pigiamino»", note: "→ «mi sono spogliata per te» · 85 episodi" },
      { price: "34", label: "«autoreggenti»", note: "→ «ho tolto tutto» ($57, 83 ep.) → «lo sto leccando» (68 ep.)" },
    ],
    nota:
      "Perché il 40,6% di metà catena non è magia del testo: quel gradino arriva a fan già scaldati dal gradino prima — selezione, non causalità. E la stessa caption viene rispedita a prezzi diversi (200→170→149) e chiude comunque: il fan compra il punto della negoziazione, non la prosa.",
  },

  // Le mosse — 6 core + 3 di secondo giro. evidence ∈ dato | correlazione | osservato-contrastato | osservato
  moves: [
    {
      tier: "core",
      n: 1,
      name: "Tratta il PPV come un episodio, non una cartolina",
      evidence: "dato",
      claim: "Il singolo invio-e-silenzio quasi non converte; l'episodio in cui resti nella scena converte dieci volte tanto.",
      numbers:
        "single-send n=15.789 → 6,1% · multi-send n=5.508 → 62,4%. Caveat: in parte selezione — si continua a scrivere a chi risponde; non è il winrate che otterresti forzando il multi-send.",
      how_to:
        "Quando il fan risponde qualunque cosa dopo il primo invio → resta nella scena e riporta al contenuto; se esita su un pacchetto, restringi la scelta (uno solo, scontato). Scope onesto: il 74% degli episodi è fan in silenzio — quel ramo è fuori da questa lezione; «multi-send vince» non significa insistere nel vuoto.",
      quote: "amore togline solo una dai, ti faccio uno sconto — solo per te però",
    },
    {
      tier: "core",
      n: 2,
      name: "La catena di script: spogliarello a puntate, gradini ascendenti",
      evidence: "osservato-contrastato",
      claim: "Ogni PPV prepara il successivo a prezzo più alto; la catena quasi non compare mai nelle perse.",
      numbers: "script_chain 26 vinte / 1 persa. Scale osservate: 8,99→34→57→99 · 34→57→100 · 29→54→99 su fan nuovo.",
      how_to:
        "Quando apri l'episodio → parti dal gradino basso della catena. Quando il fan sblocca → sali al gradino dopo dentro la stessa scena: il contenuto appena visto giustifica il prezzo del prossimo. La scala ascendente sostituisce lo sconto. Fan nuovi: welcome low-ticket prima di tutto.",
      quote: "in effetti questo vestitino adesso è di troppo… e l'idea che ti sto facendo vedere sotto mi piace",
    },
    {
      tier: "core",
      n: 3,
      name: "La discesa a gradini con ragione — mai il salto al numero del fan",
      evidence: "osservato-contrastato",
      claim: "La mossa-firma della chiusura: 2-3 gradini, ognuno con ragione o contropartita, controfferta sopra il numero del fan.",
      numbers:
        "Discesa in negoziazione n=2.059 → 50,8%; sconto mediano nelle vinte −48,7%. Contrasto: gradini-con-ragione 30/13 vs sconto-senza-ragione 10/22 (il gap più largo verso le perse). Gradazione onesta dal test sul 2º creator: la regola «mai concessione senza ragione» è quantitativa su Elisa; su Ottorini è solo direzione coerente (10/14, dentro il rumore) — e la discesa PROFONDA è sistema-Elisa: compensa un'ancora gonfiata che il listino più onesto di Ottorini non ha (sconto mediano −20,7%, concessioni in valore, non in prezzo).",
      how_to:
        "Alla prima controfferta del fan → rifiuta le prime 1-2 con una ragione («sono cose molto intime»), scendi a gradini tuoi (200→180→150), controproponi sopra il suo numero (fan: 100 → tu: 120 «solo per te»), estrai l'impegno prima di concedere («se te lo mando scontato lo sblocchi subito però?»). Alternativa che non svaluta: riduci il contenuto, non il prezzo del pieno.",
      quote: "se riesci a salire a 170 magari ci penso",
    },
    {
      tier: "core",
      n: 4,
      name: "Redirect, non rispondere: alle domande si vende il mistero",
      evidence: "osservato-contrastato",
      claim: "A «cosa si vede?» la mossa vincente devia verso la scena e la fiducia; compilare la lista compare più nelle perse.",
      numbers: "redirect 27/12 · rispondere-a-tutto 3/5 (n piccolo). Coerente col segnale org: tasso domande −0.10.",
      how_to:
        "Quando il fan chiede «cosa si vede?» → rispondi con l'esperienza («lasciati andare, segui il flusso») o rimanda all'azione. Limite etico netto: redirect = non spoilerare, mai promettere il falso; a richiesta esplicita ripetuta → «no» onesto tenendo l'ancora. L'ambiguità vince la vendita e brucia il fan (vedi anti-esempi).",
      quote: "lasciati andare, affidati a me… segui il flusso",
    },
    {
      tier: "core",
      n: 5,
      name: "Obiezione di prezzo: tieni il punto con ragione (le fasce)",
      evidence: "osservato",
      claim: "Se il fan contesta il prezzo mentre continua a chattare, difendi la fascia con una ragione. L'analogia del ristorante è il framing-casa di Elisa.",
      numbers:
        "Nessun contrasto etichettato per questa mossa — evidenza aneddotica (educare al pricing a fasce; floor motivato; riprezzo del prezzo storico; ritiro dell'offerta). Imparentata con la mossa 3 (30/13).",
      how_to:
        "Quando contesta senza cifre né limiti → è negoziale: niente scuse — spiega la fascia («hai sbloccato 24, non 200: più spendi più vedi») o usa il ristorante. Prezzo storico vero ricordato → riprezzalo all'istante: la coerenza vale più del margine. Rilancia sotto il concordato → ritira l'offerta.",
      quote: "è come se entri in un ristorante e pretendi di pagare 30 e mangiare per 300 — come spendi mangi",
    },
    {
      tier: "core",
      n: 6,
      name: "Vincolo economico reale: la vendita si chiude per il turno",
      evidence: "osservato",
      policy: true,
      claim: "Quando il vincolo è reale e specifico, comanda la policy (playbook-008), non il winrate: chiusura calda, senza transazione.",
      numbers:
        "Trasparenza sul dato scomodo: close_after_hard_constraint 1/3 nel contrasto (n=4: troppo piccolo per concludere, citato perché sfavorevole). La difesa della mossa non dipende dal numero: è policy, e regge col dato in vista. Nota post-test sul 2º creator: il sotto-caso «capacità parziale → chiudi dentro il tetto» è USCITO dalla lezione — su Elisa è invertito (1 vinta / 3 perse), su Ottorini n=7: dati insufficienti in entrambi i sensi.",
      how_to:
        "Il test è la specificità verificabile, non la ripetizione: cifra, limite carta, budget speso, età/lavoro → vincolo reale. Quando c'è → chiusura calda del turno senza transazione; vietati sconto-rilancio, leva-fiducia, «regalone»; niente follow-up commerciale per 7 giorni. Proteggi il rientro del mese prossimo. Un «non pago più» generico mentre il fan continua a chattare e rilanciare resta negoziazione → mossa 5.",
      quote: "fan: «ho finito il budget» — da qui in poi solo calore, nessuna transazione",
    },
    {
      tier: "secondo-giro",
      n: 7,
      name: "Ancora alta + qualifica («quanto riesci?») — un trade-off, non un free lunch",
      evidence: "correlazione",
      claim: "L'ancora alta non alza la probabilità di chiudere — compra scontrino, non probabilità — e dà spazio alla discesa.",
      numbers:
        "Winrate per banda d'ancora: 10-30 → 25,7% (il più alto) · 30-60 → 19,5% · 60-100 → 23,6% · 100+ → 20,0%. Mediana d'acquisto crescente: $20→$34→$70→$119. Prova che è composizione, non causa: sul 2º creator la curva si INVERTE (cresce con la banda, 25,9→37,7) — nessuna delle due va letta come effetto del prezzo. Il nucleo che regge ovunque: contrasto piatto + scontrino che sale = trade-off, non free lunch. Coerente col segnale prezzo PPV +0.41 (reverse-causation nota).",
      how_to:
        "Quando il fan è già ingaggiato e proponi la fascia alta (mai apertura fredda) → ancora in alto («li hai 200?») e subito qualifica la capacità («quanto riesci?»). L'ancora è il tetto del negoziato, non una promessa: se dichiari 800, il contenuto deve reggere il racconto.",
      quote: "li hai 200? e ti mostro quello",
    },
    {
      tier: "secondo-giro",
      n: 8,
      name: "Cornice emotiva e sfida giocosa — condimento, non piatto",
      evidence: "osservato-contrastato",
      claim: "Fiducia/complicità e sfida spostano qualcosa ma sono segnali deboli: compaiono spesso anche nelle perse.",
      numbers:
        "wrapper emotivo 47/32 · sfida giocosa 25/15 · hook-invito 36/28 — discriminano molto meno delle mosse strutturali (catena 26/1, gradini 30/13).",
      how_to:
        "Quando concedi un gradino → leva-fiducia per dare valore alla concessione. Quando lo scambio si arena ma il fan è lì → sfida giocosa. Sempre appoggiate ai gradini: la cornice senza struttura è ciò che si vede nelle perse. Dopo un vincolo reale, la leva-fiducia per estrarre è vietata (mossa 6).",
      quote: "io mi sto fidando e ti ho fatto un grande sconto — se non ti fidi mi deludi moltissimo",
    },
    {
      tier: "secondo-giro",
      n: 9,
      name: "Upsell post-acquisto immediato: il secondo sì è facile",
      evidence: "dato",
      claim: "Appena il fan sblocca, il rilancio immediato converte quasi una volta su due — più del doppio del winrate medio.",
      numbers:
        "Upsell tentato in 2.663 episodi → secondo acquisto 48,8% (vs 20,7% medio; sotto multi-send 62,4%). Tempo mediano all'acquisto: 6,5 minuti — il ferro è caldo subito. Il contrasto 36/0 è in parte tautologico.",
      how_to:
        "Nel messaggio subito dopo lo sblocco → rilancia dentro la stessa scena («togliamo tutto tutto?») o con ancora-sconto («a 150 al posto di 500»). Carve-out lamentele: contenuto non conforme all'inteso → niente upsell, onestà di scope; normale fame di «di più» → vendi il gradino dopo. Vincolo reale emerso → mossa 6, stop.",
      quote: "il video a soli 150 al posto di 500",
    },
  ],

  worked_examples: [
    {
      id: "w-011",
      tag: "catena ascendente pura",
      title: "Fan nuovo: da $8,99 a $99 senza mai scontare",
      beats: [
        "Welcome PPV a 8,99: il primo micro-acquisto",
        "Gradino a 34 col template di catena: «questo vestitino adesso è di troppo…»",
        "Escalation nella scena: 57 poi 99 — ogni sblocco giustifica il prezzo dopo",
        "Zero sconti, zero difese: ogni gradino è piccolo rispetto all'eccitazione accumulata",
      ],
    },
    {
      id: "w-015",
      tag: "discesa da manuale",
      title: "Ancora 200 → chiusura 155: metà dello sconto mediano",
      beats: [
        "Ancora dichiarata a 200",
        "Fan offre 80, 100, 120 — ogni rifiuto con ragione: «sono cose molto intime»",
        "Il pivot: «se riesci a salire a 170 magari ci penso» — controfferta sopra",
        "Chiusura a 155 con scarcity («ultima possibilità»): sconto 22% vs mediana 48,7%",
      ],
    },
    {
      id: "w-028",
      tag: "la qualifica che non regala",
      title: "«Quanto riesci?» → fan: 100 → chiude a 120",
      beats: [
        "«quanto riesci?» — qualifica prima di muovere il prezzo",
        "Fan dichiara 100: l'op non lo prende — «posso così ok? solo per te» (120)",
        "Chiude sopra il numero dichiarato (numero negoziale, non vincolo: test della mossa 6)",
        "Subito dopo lo sblocco: «togliamo tutto tutto?» — il secondo sì col ferro caldo",
      ],
    },
  ],

  anti_examples: [
    {
      id: "w-022",
      title: "Il crollo dell'ancora: da 800 dichiarati a 50 in un solo messaggio",
      body:
        "Ancora a 800, PPV a 200, poi crollo diretto al 50 del fan («va bene amio»): −75% senza gradini, senza ragione, senza contropartita. Ha incassato 50, ma è l'anatomia dello sconto-senza-ragione (10/22 nelle perse): il salto al numero del fan azzera retroattivamente l'ancora e addestra il fan a offrire poco la prossima volta. Confronta w-015: stessa situazione, chiusura a 155.",
      note: "vinta usata come anti-esempio — il costo si vede nel contrasto aggregato",
    },
    {
      id: "w-025",
      title: "L'ambiguità che brucia: tre conferme eluse, vendita a 60, fan perso",
      body:
        "Il fan chiede tre volte cosa si vede; l'op vende cedendo da 200 a 60 mantenendo l'ambiguità, e dopo l'acquisto ammette «non ho mai detto che si vedono» — chiusura con minaccia di denuncia. Quando la domanda è esplicita e ripetuta, il redirect diventa inganno e si paga in refund e churn. Il contrasto giusto: «no» onesto sul gradino basso, nudo ancorato al 200, chiude comunque.",
      note: "vinta usata come anti-esempio — survivorship nella sua forma più pura",
    },
  ],

  do_not_teach: [
    {
      title: "Spingere dopo un vincolo economico reale",
      body:
        "Il dato scomodo, dichiarato: sul flag automatico (1.064 episodi), spingere dopo → 62,9% winrate vs fermarsi → 30,3%. Il contrasto etichettato a mano (4/3, n=7) non conferma né ribalta. Ipotesi interpretativa dichiarata: il flag probabilmente mischia obiezioni negoziali (che vincono spesso) con vincoli reali, gonfiando il 62,9%.",
      why:
        "Il divieto poggia sulla policy (playbook-008 + regola etica del coach), non su un contrasto favorevole: anche se il push pagasse nel breve, estrae l'ultimo euro oggi e brucia LTV, fiducia e reputazione domani. Doppio confound dichiarato sul 62,9% (identico sul 2º creator: 67,3% vs 43,8%): oltre al flag che mischia obiezione/vincolo, c'è la selezione — l'operatore spinge quando il fan sembra ancora caldo e si ferma quando è chiuso, quindi il gap non è l'effetto della scelta. Test operativo: specificità verificabile → si chiude con calore; rifiuto generico mentre chatta → è negoziazione (mossa 5).",
    },
    {
      title: "Ambiguità deliberata sul contenuto e meccaniche di piattaforma inventate",
      body:
        "Evidenza aneddotica: tre conferme eluse → minaccia di denuncia; doppia lamentela «pagato 200 e non era nuda»; meccanica OnlyFans inventata per forzare l'impegno.",
      why:
        "È inganno, non vendita: genera refund e dispute, espone su compliance piattaforma, e il «vinto» è survivorship puro — il costo arriva dopo la finestra. Il mistero si vende (mossa 4), il falso no.",
    },
    {
      title: "Ultimatum aggressivi e insulti come leva di chiusura",
      body:
        "L'episodio osservato vince nonostante la mossa, non grazie: la chiusura arriva dal tetto dichiarato del fan, non dall'aggressione.",
      why:
        "La fermezza si insegna come nella mossa 5 (ragione + fascia); il ritiro dell'offerta come scarsità leggera («hai interrotto la magia»), mai come minaccia o insulto.",
    },
  ],

  drill: {
    title: "Il drill: tre gradini con ragione",
    scenario: "Fan interessato che apre con un'offerta bassa.",
    steps: [
      "Un rifiuto della prima offerta con una ragione («sono cose molto intime», la fascia, il ristorante)",
      "Una controproposta sopra il numero del fan, incorniciata come favore («solo per te»)",
      "L'estrazione dell'impegno prima della concessione («se te lo mando scontato lo sblocchi subito però?»)",
    ],
    fail: "Saltare al numero del fan o concedere senza ragione.",
    twist:
      "A metà drill il fan dichiara un vincolo reale specifico («ho finito il budget, davvero») → cambio di registro secondo playbook-008: chiusura calda del turno senza transazione, niente rilancio, niente leva-fiducia.",
    reality:
      "Il simulatore oggi non ha deep-link a scenari dedicati, non modella i prezzi, e il signal-scoring copre solo il tasso di domande — squalifica automatica e twist non sono implementabili in sim adesso. Finché lo scenario dedicato non esiste, il drill si esegue come roleplay guidato in affiancamento (coach/CM fa il fan) con la checklist dei 3 gradini; i gradini si esprimono come pieno / medio / dentro-il-tetto e la calibrazione sui numeri veri (fasce 34/57/100/200, sconto mediano 48,7%) si allena sul vivo.",
  },

  // Test di generalizzazione su un secondo creator (Giulia Ottorini, 15.377 episodi 1:1).
  // Popolato dai fatti deterministici; il verdetto mossa-per-mossa arriva dal
  // workflow di etichettatura (200 sequenze Ottorini) — vedi generalization.per_move.
  generalization: {
    intro:
      "La lezione è stata rifatta su un secondo creator (Giulia Ottorini, 15.377 episodi 1:1 + 200 sequenze etichettate, stessa finestra) per separare il metodo generale dal sistema-Elisa. La tesi che emerge: due equilibri interni coerenti — Elisa è industria (listino gonfiato, ancora alta, discesa profonda scriptata, libreria su massa di fan, winrate 20,7%), Ottorini è bottega (prezzi più onesti, «non è un'asta», concessioni in valore, personalizzazione, cornice emotiva vicina al motore, winrate 27,6%, chiusure in 3,2 min vs 6,5). Due creator non fanno una legge: «generalizza» qui significa «ha superato il primo test di trasferimento».",
    regge: [
      "Episodio > cartolina: multi-invio 69,5% vs 13,7% su Ottorini (62,4% vs 6,1% su Elisa) — stesso caveat di selezione su entrambi",
      "Sequenza a gradini ascendenti come principio: win-marked su entrambi (26/1 Elisa, 22/5 Ottorini) — ma la libreria di catene pre-costruite è infrastruttura di Elisa (top 149 episodi vs 6)",
      "Upsell post-acquisto immediato: contrasto quasi perfetto su entrambi (36/0 e 23/1), hit-rate 48,8% e 59,6% — il secondo sì è facile ovunque; il confronto vale solo within-metric (popolazione condizionale di fan appena convertiti)",
      "La forma del dato scomodo sul vincolo economico è identica (spingere 67,3% vs fermarsi 43,8%) — e resta non-insegnabile per policy, col doppio confound dichiarato",
    ],
    sistema_elisa: [
      "La libreria di caption: 10,1% di riuso su Ottorini vs 71,8% su Elisa (top caption: 79 fan vs 1.283). RICONCILIATO (query dedicata sul riuso): più una caption è riusata, meno converte, in modo monotòno su ENTRAMBI (unica → mass template: Elisa 39,6%→21,8%, Ottorini 35,3%→16,4%) — il template è il pavimento, non il vantaggio, confermato. La differenza è di STRATEGIA di volume, non di efficacia: Elisa accetta la resa per-send più bassa perché gira i template a scala enorme (20,5k invii mass), Ottorini fa su misura ad alta resa e basso volume. Caveat: in parte selezione (il template è lo strumento del mass a freddo, la caption unica del 1:1 a caldo — le due cose non si separano del tutto sull'osservazionale).",
      "La discesa profonda: mediana −48,7% vs −20,7% — è il parametro di compensazione di un'ancora gonfiata; insegnarla su Ottorini significherebbe insegnare a svendere. Sul 2º creator la concessione vincente è in valore («oltre al video posso farti un regalino»), non in prezzo",
      "La cornice emotiva: condimento su Elisa (47/32), vicina al motore su Ottorini (50/21, la separazione più forte tra le mosse morbide) — la gerarchia delle mosse è essa stessa creator-specifica",
      "Il winrate per banda d'ancora è invertito tra i due (piatto su Elisa, crescente su Ottorini) — prova che quelle curve sono composizione/selezione, non causalità",
    ],
    per_move: [
      { move: "1. Multi-send: il PPV come episodio", elisa_evidence: "62,4% vs 6,1% (n 5.508/15.789)", ottorini_evidence: "69,5% vs 13,7% (n 3.817/11.560)", verdict: "generalizza", note: "La replica più pulita; caveat di selezione su entrambi." },
      { move: "2. Catena a gradini ascendenti", elisa_evidence: "26 vinte / 1 persa; catene industriali (top 149 ep.)", ottorini_evidence: "22 vinte / 5 perse; catene artigianali (top 6 ep.)", verdict: "generalizza", note: "Il principio regge; la libreria pre-costruita è sistema-Elisa." },
      { move: "3. Discesa a gradini con ragione", elisa_evidence: "30/13; sconto-secco 10/22; mediana −48,7%", ottorini_evidence: "24/21 (piatto); sconto-secco 10/14 (rumore); mediana −20,7%", verdict: "creator-specifico", note: "Sopravvive il kernel «mai concessione senza ragione o contropartita», gradato; la discesa profonda no." },
      { move: "4. Redirect, non rispondere", elisa_evidence: "27/12", ottorini_evidence: "17/13 (4pp, sotto soglia rumore)", verdict: "dati-insufficienti", note: "Indicazione coerente, mai invertita — non mossa validata cross-creator." },
      { move: "5. Obiezione: tieni il punto con ragione", elisa_evidence: "solo osservato (nessun contrasto dedicato)", ottorini_evidence: "qualitativamente fortissima («non è un'asta»), nessun contrasto", verdict: "dati-insufficienti", note: "Prima candidata per un contrasto dedicato nella prossima iterazione." },
      { move: "6. Vincolo reale: si chiude (policy)", elisa_evidence: "push 62,9% vs stop 30,3% (n 618/446)", ottorini_evidence: "push 67,3% vs stop 43,8% (n 333/306)", verdict: "generalizza", note: "Come policy sul dato aggregato, col confound di selezione dichiarato; il sotto-caso capacità-parziale è uscito (invertito su Elisa 1W/3L)." },
      { move: "7. Ancora alta + qualifica", elisa_evidence: "contrasto piatto 39/41; winrate max in banda 10-30", ottorini_evidence: "contrasto piatto 19/20; winrate crescente per banda", verdict: "invertito", note: "Si inverte la curva per banda (= composizione); regge solo «trade-off, non free lunch». La qualifica del budget è ipotesi solo-Ottorini da validare." },
      { move: "8. Cornice emotiva e sfida", elisa_evidence: "47/32 (condimento)", ottorini_evidence: "50/21 (vicina al motore)", verdict: "creator-specifico", note: "La mossa non si inverte mai, ma la gerarchia sì: il peso è un parametro del sistema-creator." },
      { move: "9. Upsell post-acquisto immediato", elisa_evidence: "48,8% (1.299/2.663); 36/0", ottorini_evidence: "59,6% (1.311/2.198); 23/1", verdict: "generalizza", note: "Con multi-send la replica più solida; hit-rate non confrontabile con le winrate delle altre mosse (selezione)." },
    ],
    implicazione:
      "La lezione si ristruttura in tre strati: (1) core cross-creator con evidenza gradata — episodio, gradini ascendenti come principio, upsell immediato, «mai concessione senza ragione» (gradata), policy sul vincolo, redirect come indicazione; (2) ipotesi-da-contrastare — tieni-il-punto sull'obiezione e qualifica del budget (si osservano, non si prescrivono); (3) scheda sistema-creator — livello dell'ancora, profondità dei gradini, moneta della concessione (prezzo vs valore), riuso template, peso della cornice emotiva, framing-casa. Ogni creator onboardato riceve core + scheda propria compilata con la stessa pipeline di contrasto. Come i segnali org non si importano da altri settori, i sistemi non si copiano tra creator.",
  },

  limits: [
    "Un solo creator per la parte di sistema: la mappa dei gradini e le fasce 34/57/100/200 sono di Elisa. Non trasferire i numeri ad altri creator senza ricalcolo.",
    "Tutto osservazionale, zero A/B. Il 62,4% vs 6,1% è in parte selezione; l'ancora alta compra scontrino, non probabilità — trade-off correlazionale, non causale.",
    "Il caso maggioritario è fuori scope: il 74% degli episodi è un singolo invio nel silenzio del fan — la gestione del silenzio/re-hook merita una lezione dedicata.",
    "n piccoli sul contrasto per mossa: push/close dopo vincolo hanno n=7 e n=4 (inconclusivi, citati comunque); il 62,9% del flag automatico resta ipotesi interpretativa; upsell 36/0 in parte tautologico.",
    "Survivorship mitigato, non eliminato: churn e refund post-finestra sono invisibili — alcune «vittorie» potrebbero essere perdite nette a 60 giorni.",
    "Gli anti-esempi sono vinte pirriche (il batch citabile non ha perse citabili): un batch di perse renderebbe la lezione più forte.",
    "Solo turni attribuibili dal warehouse (operatore singolo); il duo è coperto solo in aggregato via export Infloww.",
    "Il simulatore non modella prezzi né tempi: gradini/ancora/upsell si allenano in sim solo a livello concettuale; la verifica del transfer reale non è ancora costruita.",
    "n=2 sistemi: la generalizzazione è una replica su un secondo caso, non una legge di mercato — il terzo creator può ribaltare di nuovo (come ha già fatto la curva d'ancora). E i due sistemi non sono osservazioni indipendenti: stessa agenzia, stessa finestra, operatori potenzialmente formati insieme.",
    "Win/loss misura la chiusura dell'episodio, non il revenue: l'ancora alta può perdere winrate e vincere scontrino — le due metriche vanno tenute separate in ogni claim.",
  ],
};

// PROVENIENZA lezione "silenzio-rehook-elisa": estrazione BigQuery onlyfans.chat
// (Elisa Esposito, 2026-04-01→07-25). Re-hook = messaggio dell'operatore che
// rompe un silenzio ≥24h dopo che il fan aveva ghostato il suo ultimo messaggio.
// Outcome: re-ingaggio = fan risponde entro 48h; conversione = acquisto entro 7g.
// 19.142 re-hook; 240 sequenze etichettate (120 riagganciate + 120 ignorate);
// distillazione con 3 critici avversariali (onestà-dati, compliance, pedagogia:
// 14 correzioni imposte). Copre il caso maggioritario (~74% degli episodi PPV è
// un invio singolo senza ingaggio) che la carta "gradini" lasciava fuori.
const SILENZIO_REHOOK_ELISA = {
  id: "silenzio-rehook-elisa",
  status: "pilota",
  title: "Il silenzio e il re-hook: far tornare un fan che ti ha ghostato",
  creator: "Elisa Esposito",
  subtitle:
    "Copre il caso maggioritario che la carta «gradini» lasciava fuori: ~74% degli episodi PPV è un invio singolo senza ingaggio. Distillata da 19.142 re-hook reali, 240 sequenze etichettate riagganciate-vs-ignorate, 3 critici avversariali. Ogni affermazione porta la sua etichetta di evidenza.",
  provenance: {
    episodi: 19142,
    episodi_label: "re-hook analizzati",
    finestra: "2026-04-01 → 2026-07-25",
    sequenze_etichettate: 240,
    seq_label: "sequenze etichettate (riagganciate + ignorate)",
    winrate_medio: 19.3,
    metric_label: "re-ingaggio a 48h",
    correzioni_critici: 14,
  },

  // Vedi nota su trains_gaps nella carta PPV. Il re-hook allena il presidio /
  // riaggancio (cadenza messaggi); slow_reply_rate è adiacente ma NON coperto
  // (qui è ghost ≥24h, non latenza <5min) → volutamente escluso, resta un buco onesto.
  trains_gaps: ["msgs_per_h"],

  three_things: [
    {
      title: "Il cancello è la risposta, non la vendita",
      body:
        "Chi torna a scriverti converte 22,8% (importo medio $69,9); chi resta muto 3,4%. Quindi il primo messaggio non deve vendere: deve strappare un «ci sono». Il PPV arriva dopo. Onestà: chi risponde è già un fan più caldo, quindi quel 22,8% non è merito solo del tuo aggancio — ma la mossa giusta resta aprire per la risposta, non per l'offerta.",
    },
    {
      title: "Presto e corto",
      body:
        "La finestra 24-48h è il picco (re-ingaggio 24%), ma non è «prima è sempre meglio»: la settimana-mese (7-30g) è la buca (15,4%) e oltre il mese risale (17,5%). E un'apertura di 1-4 parole batte nettamente il paragrafo medio (21,4% vs 13,9%). Metti in cima i ghost freschi, apri breve.",
    },
    {
      title: "Un invito, non un assedio",
      body:
        "A 19,3% di risposte è un gioco di volume sulla lista, non un colpo sul singolo. Regola dura: un solo re-hook per silenzio. Se non aggancia non ri-colpire a raffica — al massimo molto più avanti, con un testo diverso. Se il fan mostra fastidio, dice basta o è ostile, si chiude: è un no da rispettare, non un ostacolo da aggirare.",
    },
  ],

  moves: [
    {
      tier: "core", n: 1,
      name: "[Portante] Punta alla risposta, non alla vendita",
      evidence: "correlazione",
      claim: "Monetizzi soprattutto chi prima ti ha risposto; ma chi risponde è un sottoinsieme già più caldo, quindi il divario sovrastima l'effetto del solo aggancio.",
      numbers: "Dopo risposta: converte 22,8% (importo medio $69,9; n=3.702 riagganciati). Senza risposta visibile: 3,4%.",
      how_to: "Apri leggero e senza PPV. L'unico obiettivo del primo messaggio è strappare un «ci sono»; l'offerta viene dopo.",
      quote: "r-005: «heyyyyy»",
    },
    {
      tier: "core", n: 2,
      name: "[Portante] Tieni corto: 1-4 parole",
      evidence: "dato",
      claim: "Il cortissimo batte la via di mezzo; il paragrafo medio (5-12 parole) è la fascia peggiore.",
      numbers: "1-4 parole: re-ingaggio 21,4% / conv 8% (n=13.612). 5-12 parole: 13,9% / 4,7% (n=5.284). 13+ parole: su Elisa 22% (n=246) MA su Ottorini è la fascia peggiore (3,8%) → la «coda lunga buona» era Elisa-specifica/rumore, non insegnarla. Ciò che regge su entrambi: cortissimo batte la via di mezzo.",
      how_to: "Apri con un aggancio di 1-4 parole (un nome, un «eii», un «ci sei?»). Evita lo spiegone medio: è la fascia dove il fan scivola via.",
      quote: "r-019: solo il nome del fan",
    },
    {
      tier: "core", n: 3,
      name: "[Portante] Colpisci presto — ma la buca è la settimana, non il mese",
      evidence: "dato",
      claim: "Il picco di risposta è a 24-48h, poi non è monotòno: 7-30 giorni è la fascia peggiore e oltre il mese risale.",
      numbers: "24-48h: re-ingaggio 24% / conv 8,6% (n=4.102, picco). 2-7g: 20,1% / 7,2% (n=8.178). 7-30g: 15,4% / 6% (n=5.899, buca). 30g+: 17,5% / 7,9% (n=963, risale).",
      how_to: "Metti in cima alla coda i ghost di 1-2 giorni. Ma non pensare «prima è sempre meglio»: chi supera il mese recupera, mentre la settimana-morta rende meno.",
      quote: "r-016: «ah si ?»",
    },
    {
      tier: "core", n: 4,
      name: "[Forma] Il check-in leggero è il tipo che più riaggancia",
      evidence: "osservato-contrastato",
      claim: "Il check-in leggero e generico è sia il più frequente tra chi riaggancia sia quello che più separa chi torna da chi no; riprendere un filo lasciato a metà aiuta, ma su pochissimi casi.",
      numbers: "check-in generico: 73% dei riagganciati vs 64% degli ignorati (+9pt, il più comune). continuation: 8% vs 1% (+7pt) ma su appena 10 riagganciati vs 1 ignorato — base minima, solo direzionale. (240 conversazioni etichettate.)",
      how_to: "Apri con un check-in leggero e naturale. Se puoi riprendere un discorso reale lasciato a metà, meglio ancora — ma non è una leva provata da sola: non forzarla su un filo che non esiste.",
      quote: "r-006: «come va la serata amio?»",
    },
    {
      tier: "core", n: 5,
      name: "[Contesto] L'ora conta, ma spesso non la scegli",
      evidence: "dato",
      claim: "Pomeriggio e sera rendono più di mattina e notte; ma è un fattore di contesto, non un gesto allenabile (sei in turno, e il simulatore non modella l'ora).",
      numbers: "Pomeriggio 12-18: re-ingaggio 21% / conv 8,6%. Sera 18-24: 20,8% / 7,6%. Mattina 6-12: 17,3% / 5,8%. Notte 0-6: 17,9% / 6,2% (ora di Roma).",
      how_to: "Se puoi scegliere, concentra i re-hook dal primo pomeriggio a tarda sera. Ma trattalo come contesto: non è una mossa di testo da drillare.",
      quote: "r-010: «se ti dicessi che oggi voglio esagerare»",
    },
    {
      tier: "core", n: 6,
      name: "[Cornice] Lavora la lista con un tetto: un re-hook per silenzio",
      evidence: "osservato",
      claim: "A 19,3% di risposte nessun singolo re-hook è garantito: contano costanza sulla lista e un limite superiore per fan. Il tetto è una scelta di rispetto, non un numero ottimizzato.",
      numbers: "re-ingaggio 19,3% su 19.142 re-hook. Stesso testo «amoo??»: ignorato in i-001, riaggancia in r-022 (esito opposto → non è la frase, è timing + stato del fan + costanza).",
      how_to: "Un solo re-hook per silenzio. Se non aggancia, non ri-colpire lo stesso fan a raffica: lascialo andare, al massimo ritenta molto più avanti con un messaggio diverso. Fastidio, «basta», «non scrivermi» o ostilità = stop: si chiude, non si aggira.",
      quote: "i-001 vs r-022: «amoo??» (stesso testo, esito opposto)",
    },
  ],

  worked_examples: [
    {
      id: "r-006", tag: "check-in leggero",
      title: "Il tipo che più riaggancia: fa parlare il fan senza vendere",
      beats: [
        "Stato prima: silenzio recente sul fan",
        "Hook: «come va la serata amio?» — breve, naturale, zero PPV",
        "Decisione chiave: l'obiettivo è una risposta, non l'offerta",
        "Esito: il fan risponde e in seguito converte → il cancello è aperto",
      ],
    },
    {
      id: "r-016", tag: "continuation (base minima)",
      title: "Riapre un filo lasciato a metà con due parole, senza colpe né PPV",
      beats: [
        "Stato prima: uno scambio era rimasto sospeso giorni prima",
        "Hook: «ah si ?» come se il tempo non fosse passato",
        "Decisione chiave: zero colpevolizzazione, zero offerta — solo riprende il filo",
        "Esito: il fan torna a scrivere. Nota: continuation riaggancia su base minima (10 vs 1), non è la leva più forte",
      ],
    },
    {
      id: "r-010", tag: "curiosità",
      title: "Sospende una promessa senza chiedere nulla; il fan morde, e solo allora il prezzo",
      beats: [
        "Stato prima: fan ghostato da riattivare",
        "Hook: apre con curiosità aperta («oggi voglio esagerare»), non un interrogatorio",
        "Decisione chiave: promette senza chiedere soldi — crea tensione, non pressione",
        "Esito: il fan si incuriosisce → il PPV si tratta solo ora, dopo la risposta",
      ],
    },
  ],

  anti_examples: [
    {
      id: "i-029",
      title: "Il template riciclato uguale per tutti",
      body:
        "Template identico riconoscibile come copia-incolla, ignorato nonostante il timing buono (24-48h). ↳ Il timing giusto non salva un testo prefabbricato: rileggi l'ultimo messaggio reale del fan e riparti da lì con 3-4 parole tue («ma quella cosa di ieri poi?»), non da un template.",
      note: "caso osservato, senza base rate del template → aneddoto, non prova di inefficacia",
    },
    {
      id: "i-012",
      title: "Apre vendendo, prima della risposta",
      body:
        "Apre col tease di contenuto pronto («sono pronta a mostrartele») prima di avere una risposta, poi si lamenta di essere ignorata. ↳ Prima la risposta, poi l'offerta: il primo messaggio è un aggancio corto e senza PPV; il tease arriva solo dopo il «ci sono». Si converte 22,8% dopo una risposta, 3,4% senza.",
      note: "guidare con la vendita su un fan freddo salta il cancello",
    },
  ],

  do_not_teach: [
    {
      title: "Colpevolizzazione, finta preoccupazione e drammi come apertura",
      body:
        "«mi manchi», «sei sparito, sono preoccupata», «non ti piaccio più?», emoji piangenti. Tag miss_you: 5% dei riagganciati vs 16% degli ignorati (su base piccola, 6 vs 19 su 240: direzionale). Sostituisci con un check-in leggero e un filo ripreso; una micro-colpa scherzosa («non mi scrivi nulla??») è il limite massimo, mai allarme o dramma.",
      why: "È manipolativo e contrario alla policy HOC (mai molestia). La direzione dei dati suggerisce anche che sia inefficace, ma la ragione primaria per non insegnarlo è etica, non statistica.",
    },
    {
      title: "Raffiche di poke automatici (cinque «ci sei?» di fila)",
      body:
        "Nessuna evidenza numerica che le raffiche riducano il re-ingaggio (provocazione/insistenza ~16% vs 17%, praticamente pari). Un poke leggero, non una scarica: se il primo non aggancia, cambia messaggio o momento — non alzare il volume sullo stesso fan. Rispetta il tetto: un re-hook per silenzio.",
      why: "Scelta di policy relazionale ed etica, non un risultato dei dati: anche quando rompe il silenzio, la raffica danneggia la relazione (fastidio dichiarato) e ha forma molesta; il re-ingaggio così ottenuto è di bassa qualità.",
    },
  ],

  drill: {
    title: "Il drill: riprendi il filo",
    scenario:
      "Prendi 5 conversazioni ghostate; per ciascuna scrivi un solo re-hook che punti a una risposta, non a una vendita. Rubrica pass/fail auto-somministrata:",
    steps: [
      "L'aggancio cita qualcosa di specifico dall'ultimo messaggio reale del fan, oppure è un check-in leggero e naturale?",
      "Zero «mi manchi» / «perché non rispondi» / finte urgenze?",
      "Zero PPV?",
    ],
    fail: "Un «mi manchi» drammatico, un PPV nel primo messaggio, o un template uguale per tutti. Tendi al cortissimo (1-4 parole) — ma se stai riprendendo un filo reale e servono 5-6 parole, va bene: non sacrificare il filo alla lunghezza.",
    reality:
      "Il simulatore non modella né l'ora né il prezzo: la finestra 24-48h, la fascia pomeriggio/sera e il PPV-dopo-la-risposta si allenano solo sul vivo; qui alleni solo il testo. E nel sim il fan risponde comunque: «ha risposto» non è la prova che l'aggancio fosse buono — giudica con la rubrica, non con l'esito. Tetto: un solo re-hook per fan.",
  },

  // Test di generalizzazione su un 2º creator (Giulia Ottorini, 44.353 re-hook +
  // 240 sequenze etichettate). Il re-hook generalizza molto più dei gradini:
  // tocca dinamiche universali di ri-ingaggio, non il sistema-prezzi del creator.
  generalization: {
    intro:
      "Il re-hook è stato rifatto su un 2º creator (Giulia Ottorini, 44.353 re-hook + 240 sequenze etichettate). Generalizza molto più dei gradini: il cancello (~23% converte dopo la risposta, quasi identico), la forma del timing e «corto batte medio» replicano nettamente. Ciò che cambia è il LIVELLO (base rate, prezzo), non il pattern — Ottorini non è «diversa», è più in basso sulla stessa curva. 2 creator confermano forma e direzione, non fanno una legge.",
    regge: [
      "Il cancello è la stella polare: dopo la risposta, ~1 fan su 4 converte — 22,8% (Elisa) vs 23,8% (Ottorini), quasi identico nonostante il re-ingaggio di base sia dimezzato (19,3% vs 8,8%). Tasso di sistema-fan, non del creator.",
      "Tieni corto: 1-4 parole battono 5-12 su entrambi. NON forzare «anche il lungo va bene»: su Ottorini 13+ è la fascia peggiore.",
      "Timing: picco a 24-48h, buca sulla settimana (7-30g), leggera risalita oltre il mese — stessa forma su entrambi, solo i livelli scalano.",
      "Constatazione batte domanda in CONVERSIONE su entrambi (7,5% vs 6,2% Elisa; 3,6% vs 2,2% Ottorini). Sul tasso di risposta è rumore.",
      "Il pomeriggio è la fascia migliore su entrambi (ma è contesto/turno, non gesto allenabile).",
    ],
    sistema_elisa: [
      "Il base rate (re-ingaggio 19,3% vs 8,8%, conversione 7,1% vs 3,0%) e il valore medio ($69,9 vs $29,9): livello del sistema-fan e price point del creator, non skill dell'operatore.",
      "La «coda lunga buona» (13+ parole rende su Elisa, peggiore su Ottorini): Elisa-specifica/rumore. Trasferibile solo «corto batte medio».",
      "Il ranking della sera come co-vincitrice: solo Elisa (lì sera ≈ pomeriggio); su Ottorini la sera è in fondo.",
      "I tag a campione singolo che FLIPPANO tra i due creator: la domanda diretta al fan (negativa su Ottorini, positiva su Elisa), miss_you (negativo su Elisa, piatto su Ottorini), il PPV dentro il re-hook (fortissimo su Elisa, neutro su Ottorini) — provvisori, non meccanismi provati.",
    ],
    per_move: [
      { move: "Il cancello: converte ~1 su 4 dopo la risposta", elisa_evidence: "22,8% (base 19,3%)", ottorini_evidence: "23,8% (base 8,8%)", verdict: "generalizza", note: "Invariante più forte: base dimezzato, cancello identico. Correlazionale (chi risponde è già più caldo)." },
      { move: "Timing: picco 24-48h, buca 7-30g", elisa_evidence: "24,0→15,4→17,5", ottorini_evidence: "11,7→7,2→7,8", verdict: "generalizza", note: "Stessa forma, livelli più bassi. «La buca è la settimana, non il mese» confermato." },
      { move: "Cortissimo (1-4) batte la via di mezzo (5-12)", elisa_evidence: "21,4>13,9; ma 13+=22 (U-shape)", ottorini_evidence: "11,1>6,4>3,8 (monotono)", verdict: "generalizza", note: "Il core regge; la U-shape era Elisa-specifica (n=246, rumore)." },
      { move: "Constatazione batte domanda (in conversione)", elisa_evidence: "conv 7,5 vs 6,2; reeng 19,5 vs 18,8 (rumore)", ottorini_evidence: "conv 3,6 vs 2,2", verdict: "generalizza", note: "Robusto in conversione; la domanda DIRETTA al fan è incoerente tra creator (positiva su Elisa, negativa su Ottorini)." },
      { move: "Il pomeriggio è la fascia migliore", elisa_evidence: "pom 21,0 ≈ sera 20,8", ottorini_evidence: "pom 10,2 stacca; sera 8,4 in fondo", verdict: "generalizza", note: "Solo «pomeriggio best»; il ranking della sera è Elisa-specifico. Contesto, non gesto." },
      { move: "Il check-in leggero è il tipo che più riaggancia", elisa_evidence: "+9pp (73 vs 64), n~88 (~2 SE)", ottorini_evidence: "+22pp (63 vs 41), netto", verdict: "generalizza", note: "Direzione coerente ma da confermare: su Elisa il campione è piccolo. Non equiparare agli invarianti forti." },
      { move: "miss_you come marcatore negativo", elisa_evidence: "5% vs 16% (n 6/19)", ottorini_evidence: "13% vs 14% (piatto)", verdict: "dati-insufficienti", note: "Non replica su Ottorini; campioni Elisa minuscoli. Non promuovere a regola." },
    ],
    implicazione:
      "La lezione si legge su due strati: il metodo universale (cancello, corto, timing, constatazione-in-conversione, check-in) è candidato a metodo generale — molto più solido dei gradini, perché il re-ingaggio è dinamica umana, non sistema-prezzi; il livello (base rate, prezzo) e i dettagli a campione piccolo (U-shape, miss_you, PPV-nel-rehook, ranking sera) sono creator-specifici o provvisori. Come per i gradini: 2 creator confermano forma e direzione, servono un 3º/4º per una legge.",
  },

  limits: [
    "Il cancello 22,8% vs 3,4% è in gran parte selezione, non effetto del re-hook: chi risponde è già un fan più caldo e auto-selezionato. Il divario sovrastima quanto «produce» il riagganciare; la mossa (aprire per la risposta) resta giusta, ma il numero non è l'effetto causale del messaggio.",
    "Generalizzazione: testata su 2 creator (Elisa + Ottorini). Forma e direzione dei pattern reggono, ma 2 creator non fanno una legge — e i tag a campione singolo flippano direzione tra i due (provvisori, non meccanismi provati).",
    "Il vantaggio del tempismo (24-48h 24% vs 7-30g 15,4%) è in parte selezione (chi re-hooka presto ha fan più caldi) ed è non monotòno: oltre il mese risale a 17,5%. Non leggerlo come «prima è sempre meglio».",
    "Constatazione vs domanda è rumore, non una leva: 19,5% vs 18,8%. Per questo non è tra le mosse — al massimo, a parità, un tocco leggero batte di un soffio l'interrogatorio.",
    "continuation poggia su base minima (10 riagganciati vs 1 ignorato): direzionale, mai un superlativo. Il tipo che davvero separa di più ed è il più frequente tra chi torna è il check-in generico (+9pt).",
    "Il re-hook-con-PPV riaggancia 32,6% ma su n=46: aneddotico, non prescrivibile. La regola resta: prima la risposta, il PPV dopo.",
    "L'estremo lungo (13+ parole, 22%) ha n=246: non sovrappesarlo. Il segnale solido è che 1-4 parole battono la via di mezzo (5-12).",
    "Il contrasto per tipo viene da 240 conversazioni etichettate: direzionale, non definitivo; qualche etichetta è rumorosa (esiti di singola riga da leggere con cautela).",
    "Tutto è specifico di Elisa Esposito, una sola creator, finestra apr-lug 2026. Citazioni pseudonimizzate, singoli messaggi: non generalizzare ad altre creator senza rimisurare.",
  ],
};

const CARDS = [PPV_GRADINI_ELISA, SILENZIO_REHOOK_ELISA];

// Etichette dei gap del profilo-segnali (coerenti con SIGNALS in operator-signals.js).
// Tenute qui per non importare operator-signals (dipendenze BigQuery pesanti).
const GAP_LABELS = {
  question_rate: "Tasso di domande",
  avg_ppv_price: "Prezzo medio PPV",
  ppv_per_h: "Cadenza PPV",
  msgs_per_h: "Cadenza messaggi",
  slow_reply_rate: "Fan fatti attendere",
};

function gapTags(card) {
  return (card.trains_gaps || []).map((k) => ({ key: k, label: GAP_LABELS[k] || k }));
}

/** Lista leggera per l'indice (senza il corpo della lezione). */
export function listLessonCards() {
  return CARDS.map((c) => ({
    id: c.id,
    status: c.status,
    title: c.title,
    creator: c.creator,
    subtitle: c.subtitle,
    provenance: c.provenance,
    trains: gapTags(c),
  }));
}

/** Carta completa per id (null se non esiste). */
export function getLessonCard(id) {
  return CARDS.find((c) => c.id === id) || null;
}

/**
 * Dal gap comportamentale (top_gap.key del profilo-segnali) alle lezioni che lo
 * allenano — l'anello che porta la diagnosi al curriculum. Mappatura curatoriale
 * dichiarata (i tag trains_gaps sulle carte), NON transfer validato. Ritorna refs
 * leggeri, ordinati come i tag (rilevanza). Array vuoto se nessuna lezione copre
 * ancora quel gap (buco onesto, es. slow_reply_rate oggi).
 * @param {string} gapKey
 * @returns {{id:string, title:string, status:string, primary:boolean}[]}
 */
export function recommendLessonsForGap(gapKey) {
  if (!gapKey) return [];
  return CARDS
    .filter((c) => (c.trains_gaps || []).includes(gapKey))
    .map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      // primary = questa lezione mette quel gap tra i suoi obiettivi principali (primo tag)
      primary: (c.trains_gaps || [])[0] === gapKey,
    }))
    // prima le lezioni per cui il gap è obiettivo primario
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
}

/** Etichetta leggibile di un gap (per le superfici che mostrano i tag). */
export function gapLabel(gapKey) {
  return GAP_LABELS[gapKey] || gapKey;
}
