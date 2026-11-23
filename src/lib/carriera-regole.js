/**
 * Carriera — il regolamento scritto (23/11/2026). Dati puri: la scheda «Le regole» li mostra
 * così come sono. Una sola fonte: le soglie vengono da carriera-core (mai riscritte qui a mano).
 *
 * Testo pensato per essere letto anche dagli operatori quando la scheda si aprirà a loro
 * (dopo il parere dell'avvocato): niente gerarchie, niente gergo da ufficio.
 * Cambiare una regola = nuova CARRIERA_VERSION in carriera-core + una riga in CHANGELOG qui sotto.
 */
import { CARRIERA_VERSION, SOGLIE, ECCEZIONE_MAX_GIORNI, PIANO_SETTIMANE } from "./carriera-core.js";

const pct = (x) => `${Math.round(Math.abs(x - 1) * 100)}%`;

export const REGOLE_STATO = {
  version: CARRIERA_VERSION,
  stato: "proposta",
  nota: "Proposta: la soglia della fascia C è stata scelta sui dati veri; la parte sui contratti va confermata dall'avvocato prima di mostrarla agli operatori.",
};

export const LIVELLI = [
  { id: "L0", titolo: "Trainee", testo: "4-6 settimane di formazione.", salire: "Turni affiancati superati e controllo qualità ok." },
  { id: "L1", titolo: "Sales Operator I", testo: "Lavora in autonomia sui profili assegnati.", salire: "Almeno 6 mesi, mestiere ≥ 61 in 3 mesi su 4, qualità ok." },
  { id: "L2", titolo: "Sales Operator II", testo: "Sopra la media, affidabile su più profili e fasce orarie.", salire: "Almeno 10 mesi, mestiere ≥ 71 in 4 mesi su 6, zero violazioni, 2 nuovi seguiti." },
  { id: "L3", titolo: "Senior", testo: "Riferimento del team. Da qui si sceglie una delle due strade.", salire: null },
  { id: "L4", titolo: "Team Lead", testo: "Strada gestione: ci si candida, percorso di 8-12 settimane, prova reversibile.", salire: null, ramo: "gestione" },
  { id: "L4", titolo: "Senior Specialist", testo: "Strada vendita: vende sui profili più importanti, senza persone da gestire.", salire: null, ramo: "vendita" },
];

export const LIVELLI_NOTE = [
  "Si sale con risultati sostenuti, mai per un mese fortunato. Il livello non si perde per un mese storto.",
  "«Mestiere» è lo score Infloww: come lavori in chat, non quanto vende la creator.",
];

export const FASCE_REGOLE = [
  { fascia: "A", soglia: `almeno il ${pct(SOGLIE.A)} in più dei colleghi`, cosa: "Prima scelta sui profili migliori e sulle fasce orarie più ricche. Il nome compare tra i migliori del mese." },
  { fascia: "B", soglia: `da ${pct(SOGLIE.C)} sotto a ${pct(SOGLIE.A)} sopra i colleghi`, cosa: "Resti sui tuoi profili e ricevi il prossimo passo su cui lavorare per salire in A." },
  { fascia: "C", soglia: `più del ${pct(SOGLIE.C)} sotto i colleghi`, cosa: "Dopo 2 mesi chiusi di fila in C parte la revisione. Nessuno lo decide a mano: è la regola, uguale per tutti." },
];

export const FASCE_NOTE = [
  "Il confronto è sempre con chi lavora sulla stessa creator, nella stessa fascia oraria: la creator «facile» o «difficile» non conta.",
  "La fascia si calcola sugli ultimi 3 mesi; i due mesi chiusi si guardano anche uno per uno per la regola della revisione.",
];

export const KPI = {
  conta: [
    ["Resa rispetto ai colleghi", "Vendite per ora confrontate con chi lavora sulla stessa creator e fascia oraria, su 3 mesi."],
    ["Qualità", "3 conversazioni al mese controllate. Un errore di compliance blocca tutto."],
    ["Turni minimi", "Sotto il minimo di ore il mese è non valutabile, mai zero."],
  ],
  non_conta: [
    ["Percentuale di PPV comprati", "Non prevede quanto vendi."],
    ["Ritmo di PPV", "Premia chi bombarda i fan."],
    ["Venduto totale nelle ore di turno", "Lo gonfiano masse e mance."],
    ["Venduto grezzo", "Dipende dalla creator che ti capita."],
  ],
  regole: [
    ["Soglie fisse, non quote", "Nessuno esce solo perché è nel 10% più basso."],
    ["Assenze giustificate", "Malattia o ferie: il mese è non valutabile, mai zero."],
    ["Mai un mese solo", "Un mese è rumore, 3 mesi sono un segnale."],
  ],
  limite_v01: "Versione 0.1: la resa conta tutto il venduto Infloww dell'operatore. Il calcolo sui soli PPV mandati da lui arriva con la prossima versione.",
};

export const REVISIONE = {
  passi: [
    ["Parte da sola", "Fascia C in entrambi gli ultimi due mesi chiusi."],
    ["Colloquio", "Con il revisore qualità, non con il sales coach del proprio profilo."],
    [`Piano di ${PIANO_SETTIMANE} settimane`, "1-2 obiettivi in numeri e allenamento mirato."],
    ["Verifiche", "A metà e alla fine del piano."],
    ["Esito scritto", "Firmato dal revisore e dal sales coach di un altro profilo."],
  ],
  esiti: [
    ["Rientra", "Torna in fascia B o A e prosegue sul suo percorso."],
    ["Prova su un altro profilo", "A volte il problema è l'abbinamento, non la persona."],
    ["Lascia il profilo", "L'incarico su quel profilo si chiude."],
  ],
  eccezione: `Il sales coach può tenere qualcuno sotto soglia sullo stesso profilo, ma scrive il motivo e l'eccezione scade dopo al massimo ${ECCEZIONE_MAX_GIORNI} giorni.`,
};

export const RUOLI = [
  ["Operatore", "Vede i criteri, la sua fascia e il prossimo passo. Può contestare un numero e riceve risposta entro 10 giorni lavorativi."],
  ["Sales coach", "Garantisce la copertura dei turni del profilo, fa crescere gli operatori, cura la strategia del profilo e dei fan che spendono di più, tiene la roundtable ogni settimana. Non conduce le revisioni del proprio team."],
  ["Revisore qualità", "Un operatore senior pagato a forfait: controlla la qualità e conduce le revisioni."],
  ["Calibrazione mensile", "45 minuti: revisore e sales coach guardano insieme i casi in fascia C, così tutti usano lo stesso metro."],
  ["HOC Pro", "Calcola le fasce, sceglie le conversazioni da controllare, prepara il fascicolo di ogni revisione."],
];

export const ROUNDTABLE = [
  ["I numeri", "5'", "Li prepara l'app: come è andato il profilo, cosa è cambiato."],
  ["Una chat riuscita", "15'", "Letta insieme: cosa ha fatto l'operatore, perché il fan ha comprato."],
  ["Una chat persa", "10'", "Senza il nome di chi l'ha scritta: dove si è perso il fan."],
  ["La prova della settimana", "10'", "Una cosa sola da provare, con il numero che la giudica."],
  ["Domande", "5'", "Dubbi degli operatori e idee da portare al sales coach."],
];

export const CHANGELOG = [
  ["carriera-0.2", "23/11/2026", "Fascia C sotto 0,70 (era 0,85): con 0,85 finiva in C un operatore attivo su tre. Con 0,70 è il quarto più basso."],
  ["carriera-0.1", "23/11/2026", "Prima versione: fasce A/B/C sull'indice della Squadra, revisione dopo 2 mesi chiusi in C, eccezioni del sales coach, roundtable settimanale."],
];
