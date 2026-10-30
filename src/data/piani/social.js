// Primo piano (30/10/2026): Social, collaudo dello strumento e decisione sui 3 dispositivi.
// Stesso contenuto del documento «Social: piano dei prossimi giorni» consegnato a Luis.
// Si carica con scripts/piani-seed.mjs; ricaricarlo cambia le voci ma non tocca le spunte.
const W = "/admin/warmup";

export const SOCIAL_PLAN = {
  id: "social-5-dispositivi",
  title: "Social: verso 5 dispositivi",
  goal: "Oggi seguiamo 2 profili di Giulia Ottorini. Gli altri 3 dispositivi si comprano dopo aver confermato che lo strumento Social regge e che la preparazione dei contenuti tiene il ritmo. Se qualcosa non torna o si può fare meglio, il parere di chi ci lavora conta più del piano.",
  area: "social",
  cap: "social.manage",
  people: ["Luis", "Nicholas"],
  start: "2026-10-30",
  end: "2026-11-04",
  phases: [
    {
      id: "collaudo",
      title: "Collaudo dello strumento",
      due: "2026-11-03",
      note: "Si conferma usandolo sul lavoro vero. Ogni cosa strana si segnala col tasto «Segnala o suggerisci» in basso a destra: arriva a noi con la pagina in cui sei. Anche le cose piccole.",
      items: [
        { id: "oggi-per-azione", who: "Luis", link: W, text: "Usare la vista «Per azione» per una giornata intera: è più comoda della vista per profilo?" },
        { id: "oggi-conteggio", who: "Luis", link: W, text: "Spuntare le azioni dai profili e controllare che il conteggio torni" },
        { id: "oggi-timer", who: "Luis", link: W, text: "Usare il timer sulle azioni che lo hanno (engagement prima di pubblicare)" },
        { id: "drive-cartelle", who: "Luis", link: W + "?tab=contenuti", text: "Rileggere il drive e controllare che si vedano tutte le cartelle, anche quelle vuote" },
        { id: "caroselli", who: "Luis", link: W + "?tab=contenuti", text: "Fare 2-3 caroselli, riordinare le foto trascinandole",
          auto: { type: "editoriale_items", kind: "carosello", min: 2 } },
        { id: "reel", who: "Luis", link: W + "?tab=contenuti", text: "Preparare 2-3 reel, provando a riusare lo stesso video grezzo in due reel (deve dire «usato 2 volte»)",
          auto: { type: "editoriale_items", kind: "reel", min: 2 } },
        { id: "reel-montato", who: "Luis", link: W + "?tab=contenuti", text: "Agganciare il reel montato dalla cartella «video editati»: deve diventare «pronto» da solo" },
        { id: "scarica-pubblica", who: "Luis", link: W, text: "Scaricare dal telefono un carosello e un reel («Prepara» poi «Salva sul telefono») e pubblicare da lì" },
        { id: "autopub", who: "Luis", link: W + "?tab=contenuti", text: "Dopo la pubblicazione, entro un'ora il contenuto risulta «trovato sul profilo» e l'azione del giorno si spunta",
          auto: { type: "autopub", min: 1 } },
        { id: "dati-filtri", who: "Luis", link: W + "?tab=dati", text: "Panoramica: provare i filtri per modella e account e le date a scelta (anche un giorno solo)" },
        { id: "dati-settimana", who: "Luis", link: W + "?tab=dati", text: "Inserire i dati della settimana dei profili",
          auto: { type: "weekly_data" } },
        { id: "radar-ita", who: "Luis", link: W + "?tab=radar", text: "Aggiungere 5-10 profili di clipping italiani che conosci (oggi ci sono solo inglesi)",
          auto: { type: "radar_profiles", country: "ita", min: 5 } },
        { id: "radar-idee", who: "Luis", link: W + "?tab=radar", text: "Guardare i video «fuori dal solito» e salvare come idea quelli da rifare",
          auto: { type: "radar_saved", min: 5 } },
        { id: "radar-scarica", who: "Luis", link: W + "?tab=radar", text: "Scaricare un video da usare come riferimento per il montaggio" },
        { id: "radar-multiplo", who: "Luis", ask: true, text: "Il numero «×» (quante volte il solito del profilo) aiuta davvero a scegliere?" },
      ],
    },
    {
      id: "avanti",
      title: "Mettersi avanti con i contenuti",
      due: "2026-11-03",
      note: "Il warm-up chiede 3 reel al giorno per profilo, più i caroselli: con 2 profili 42 reel a settimana, con 5 profili 105. L'idea è avere sempre contenuti pronti prima del giorno in cui servono.",
      items: [
        { id: "tempo-reel", who: "Luis", ask: true, text: "Quanto tempo ti serve, in media, per montare un reel (dal video grezzo al reel pronto)?" },
        { id: "tempo-carosello", who: "Luis", ask: true, text: "Quanto tempo per un carosello (scelta foto, ordine, didascalia)?" },
        { id: "al-giorno", who: "Luis", ask: true, text: "Quanti contenuti riesci a preparare in una giornata di lavoro?" },
        { id: "materiale", who: "Luis", ask: true, text: "Il materiale nel drive di Giulia basta per 5 profili, o va chiesto altro materiale?" },
        { id: "giorni-avanti", who: "Luis, Nicholas", text: "Decidere insieme di quanti giorni metterci avanti (proposta: 7 giorni di calendario pieno)" },
      ],
    },
    {
      id: "decisione",
      title: "Decisione sui 3 dispositivi",
      kind: "decision",
      due: "2026-11-04",
      note: "Si comprano gli altri 3 dispositivi se queste condizioni sono vere. Quando arrivano: profili registrati in Account social, warm-up avviato dall'app, contenuti già pronti in calendario dal primo giorno.",
      items: [
        { id: "cond-segnalazioni", link: "/admin/utilizzo", text: "Strumento confermato: niente di bloccante aperto tra le segnalazioni del Social",
          auto: { type: "feedback_open", kind: "problem", page: "/admin/warmup" } },
        { id: "cond-calendario", link: W + "?tab=contenuti", text: "Calendario dei profili Instagram attivi pieno per i giorni concordati",
          auto: { type: "calendar_days", days: 7 } },
        { id: "cond-tempi", text: "I tempi di preparazione dicono che reggiamo 5 profili con il tempo di lavoro che c'è oggi" },
        { id: "cond-materiale", text: "C'è materiale sufficiente nel drive per i nuovi profili" },
      ],
    },
  ],
};
