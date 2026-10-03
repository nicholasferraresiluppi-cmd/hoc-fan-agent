// Sales manager AI — gli uffici che usano l'AI: i due manager (Analisi) e
// l'arbitro-coach (Consegne). Qui ci sono SOLO i prompt e la costruzione delle
// richieste: l'invio (batch) e i controlli stanno in pipeline.js / core.js.
//
// Principio (dal "trading floor" che Nicholas ha indicato come modello, ott
// 2026): ogni ufficio ha UN compito, e l'ufficio rischi è indipendente — qui il
// Garante è CODICE (core.guard), non un'altra AI che si può convincere.

import { LEVERS, METRICS, OPERATOR_METRICS } from "./core.js";

export const MODEL = () => process.env.SALES_AI_MODEL || "claude-opus-5";

const EVIDENZA_ORG = `EVIDENZA DAI NOSTRI DATI (House of Creators, set-ott 2026). Usala, non contraddirla:
- Studio 6 mesi su 257 operatori (confronto con i colleghi sulla stessa creator e fascia oraria): la % di PPV comprati NON predice quanto un operatore guadagnerà. Il numero di proposte sì. Quindi non consigliare mai qualcosa che riduce le proposte senza prova.
- Proporre mentre il fan sta scrivendo: 18% comprati (fan che ha scritto negli ultimi 2 minuti) contro 1,5% (fan zitto da più di un'ora). È il comportamento più legato ai PPV comprati (31 creator su 36).
- Quando il fan chiede di vedere qualcosa, il PPV si vende circa il doppio a ogni livello di conversazione.
- La stessa caption ha resa simile con tutti gli operatori: una caption che non vende è un problema del testo, non della persona.
- Fare più domande e scrivere messaggi più lunghi va insieme a MENO vendite. La lunghezza dei messaggi non distingue gli operatori (tutti 3-5 parole).
- Le ipotesi nate da pochi esempi spesso sono false (es. "proporre dopo un sì del fan": 9,2% vs 9,8% su 3.846 PPV). Un turno solo è un campione piccolo.`;

const leveList = () => Object.entries(LEVERS)
  .map(([k, v]) => `- ${k} ${v.prescrivibile ? "(PRESCRIVIBILE)" : "(SOLO INCUBATRICE: non si prescrive)"}: ${v.titolo}. ${v.evidenza}`).join("\n");

const packForPrompt = (pack) => JSON.stringify({
  operatore: pack.operator,
  ore_turno: pack.ore_turno,
  numeri: pack.metrics,
  acquisti_finestra_aperta: pack.acquisti_finestra_aperta,
  giornata_leggera: pack.giornata_leggera,
  caption_che_non_vendono_usate: pack.caption_ripetute,
  impegno_precedente: pack.impegno_precedente || null,
  momenti: pack.moments.map((m) => ({
    id: m.id, prezzo: m.price, venduto: m.venduto, scambi_ora_prima: m.scambi_ora_prima,
    min_da_ultimo_msg_fan: m.min_da_ultimo_msg_fan, caption_bassa_resa: m.caption_bassa_resa,
    chat: m.chat.map((c) => `${c.hhmm} ${c.who}: ${c.text}${c.ppv ? ` [PPV $${c.ppv}]` : ""}`),
  })),
}, null, 1);

const COMMON = `Contesto: agenzia italiana che gestisce account di creator su piattaforme per adulti. Gli operatori scrivono ai fan a nome della creator e vendono contenuti a pagamento (PPV). Il contenuto esplicito è il contesto normale del lavoro: giudichi il METODO di vendita, non il tema. Il fan si chiama sempre "il fan", mai per nome.`;

export const MANAGER_QUALITA = {
  id: "qualita",
  nome: "Manager qualità chat",
  system: `${COMMON}
Sei un sales manager che è stato un top chatter: rivedi le chat come un allenatore rivede la partita. Cerchi il MOMENTO preciso in cui una conversazione prende la strada giusta o quella sbagliata, e le parole esatte.
${EVIDENZA_ORG}`,
  task: `Leggi TUTTI i momenti del turno. Scrivi un report (max 450 parole) con:
1. 1-2 momenti in cui ha lavorato bene: ID, citazione ESATTA copiata dalla chat (solo righe OPERATORE), perché funziona.
2. Il pattern che le/gli costa vendite, con almeno 3 momenti a supporto (ID + citazione esatta). Se non c'è un pattern chiaro, dillo.
3. Quale leva tra quelle elencate applicheresti, e come la diresti con parole sue (un esempio di frase nel suo stile).
Regole: copia le citazioni parola per parola, non riassumerle. Non inventare. Non giudicare la persona, solo i comportamenti. Se il campione è piccolo, dillo.`,
};

export const MANAGER_DATI = {
  id: "dati",
  nome: "Manager dati",
  system: `${COMMON}
Sei un sales manager data-driven: ragioni su numeri, situazioni e campioni, e diffidi delle conclusioni prese da pochi casi. Ricordi sempre che i soldi = numero di proposte × probabilità che vengano comprate × prezzo: una regola che alza la percentuale ma taglia le proposte può far guadagnare meno.
${EVIDENZA_ORG}`,
  task: `Scrivi un report (max 450 parole) con:
1. Cosa dicono i numeri del turno: cosa è segnale e cosa è rumore (campione piccolo, acquisti ancora aperti).
2. I momenti raggruppati per situazione (scambi nell'ora prima, minuti dall'ultimo messaggio del fan, caption a bassa resa, richieste del fan) con conteggi e ID.
3. Quale leva PRESCRIVIBILE ha più margine per questa persona oggi, e con quale numero la misureresti domani.
4. Eventuali idee per l'incubatrice (leve non ancora provate), separate.
Regole: niente percentuali inventate; se un numero non è nel pacchetto non citarlo.`,
};

export const MANAGERS = [MANAGER_QUALITA, MANAGER_DATI];

export function managerRequest(mgr, pack, customId) {
  return {
    custom_id: customId,
    params: {
      model: MODEL(),
      max_tokens: 12000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: mgr.system + `\n\nLE LEVE (solo quelle PRESCRIVIBILI possono arrivare all'operatore):\n${leveList()}`,
      messages: [{ role: "user", content: `PACCHETTO DEL TURNO (dati veri, preparati dall'ufficio dati):\n${packForPrompt(pack)}\n\nCOMPITO:\n${mgr.task}` }],
    },
  };
}

const prescrivibili = Object.entries(LEVERS).filter(([, v]) => v.prescrivibile).map(([k]) => k);

export const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisione: { type: "string", enum: ["consegna", "non_consegnare"] },
    motivo: { type: "string" },
    riscontro: { type: "string", description: "Se c'è un impegno precedente: com'è andata la regola che si era impegnata/o a provare (in 1-2 frasi, partendo dal suo momento migliore). Stringa vuota se non c'è." },
    apertura: { type: "string", description: "Una frase di apertura calda e concreta, seconda persona, forme verbali con 'avere' (neutra di genere)." },
    forza: {
      type: "object", additionalProperties: false,
      properties: {
        momento_id: { type: "string" },
        citazione: { type: "string", description: "Copiata PAROLA PER PAROLA da una riga OPERATORE di quel momento." },
        perche: { type: "string" },
      },
      required: ["momento_id", "citazione", "perche"],
    },
    regola: {
      type: "object", additionalProperties: false,
      properties: {
        leva: { type: "string", enum: [...prescrivibili, "nessuna"] },
        quando: { type: "string" },
        allora: { type: "string" },
        esempio: { type: "string", description: "Una frase d'esempio nel suo stile, adatta alla situazione." },
      },
      required: ["leva", "quando", "allora", "esempio"],
    },
    cambio_facile: { type: "string", description: "Facoltativo: se usa caption che non vendono, dillo qui in una frase senza numeri. Stringa vuota se non serve." },
    numeri: { type: "array", items: { type: "string", enum: OPERATOR_METRICS }, description: "1-2 metriche da guardare domani (le scrive il sistema, tu scegli solo quali)." },
    per_la_direzione: { type: "string", description: "Note per il sales manager umano: disaccordi tra i due report, cose da dire A VOCE (cali, problemi), dubbi sui dati." },
    incubatrice: { type: "array", items: { type: "string" }, description: "Idee non ancora provate emerse dai report (vanno testate, non prescritte)." },
    confidenza: { type: "string", enum: ["alta", "media", "bassa"] },
  },
  required: ["decisione", "motivo", "riscontro", "apertura", "forza", "regola", "cambio_facile", "numeri", "per_la_direzione", "incubatrice", "confidenza"],
};

export const ARBITRO = {
  id: "arbitro",
  nome: "Arbitro e coach",
  system: `${COMMON}
Sei l'arbitro tra due sales manager che hanno analizzato lo stesso turno, e poi il coach che scrive all'operatore. Prima arbitri: dove i due report non sono d'accordo, decidi in base ai dati del pacchetto e all'evidenza; scarti ogni affermazione che la verifica automatica segnala come non trovata. Poi scrivi il feedback.
${EVIDENZA_ORG}

REGOLE DEL MESSAGGIO ALL'OPERATORE (nate da prove reali, sono vincolanti):
- Apre SEMPRE da una vittoria vera (un momento in cui ha lavorato bene), con la citazione esatta.
- UNA sola cosa da provare, in forma "quando succede X, fai Y", solo con una leva PRESCRIVIBILE. "quando" e "allora" descrivono SOLO l'azione di quella leva: niente consigli aggiunti (prezzi, sconti, trattative, tono) — quelli, se ti sembrano utili, vanno in "incubatrice" o in "per_la_direzione". Non iniziare "quando" con la parola "quando" né "allora" con "allora": il sistema le aggiunge. Se il turno non offre un margine chiaro: leva "nessuna" e lo dici in "motivo".
- La citazione della cosa fatta bene è copiata da una riga OPERATORE, senza le etichette tra parentesi quadre come [PPV $30].
- Niente cattive notizie (cali, "sei andata male"): quelle vanno in "per_la_direzione", le dice una persona.
- Niente confronti con i colleghi, nessun nome di altri operatori.
- Mai consigliare più domande o messaggi più lunghi.
- Niente numeri nel testo: i numeri li aggiunge il sistema dalle metriche che scegli in "numeri".
- Lodi il comportamento, mai il tratto ("hai ripreso le sue parole", non "sei brava").
- Seconda persona con l'ausiliare avere ("hai proposto"), per restare neutri di genere.
- Tono: diretto, caldo, da collega esperto. Italiano parlato, frasi brevi.
- Se c'è un impegno precedente, "riscontro" parte da lì.
- decisione "non_consegnare" se i dati non bastano a dire niente di utile e vero.`,
};

export function arbiterRequest(pack, reports, verification, customId) {
  return {
    custom_id: customId,
    params: {
      model: MODEL(),
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: FEEDBACK_SCHEMA } },
      system: ARBITRO.system + `\n\nLE LEVE:\n${leveList()}`,
      messages: [{
        role: "user",
        content: `PACCHETTO DEL TURNO:\n${packForPrompt(pack)}\n\nREPORT DEL MANAGER QUALITÀ CHAT:\n${reports.qualita || "(mancante)"}\n\nREPORT DEL MANAGER DATI:\n${reports.dati || "(mancante)"}\n\nVERIFICA AUTOMATICA DELLE CITAZIONI DEI REPORT (codice, affidabile):\n${verification}\n\nArbitra e scrivi il feedback nello schema richiesto.`,
      }],
    },
  };
}

/** Estrae le citazioni «...» o "..." dai report dei manager, con l'ID momento più vicino. */
export function extractQuotes(report) {
  const out = [];
  const text = String(report || "");
  const re = /(M\d{1,2})[^"«“]{0,80}["«“]([^"»”]{6,240})["»”]/g;
  let m;
  while ((m = re.exec(text))) out.push({ id: m[1], quote: m[2] });
  return out;
}

export function textOf(message) {
  return (message?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
