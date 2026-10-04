/**
 * Catalogo dei tutorial video (03/10/2026).
 *
 * Nicholas ha scelto i tutorial come VIDEO (voce, interfaccia animata, sottotitoli) invece che
 * come testo da leggere. I video si producono fuori dal repo con il toolkit
 * ~/Documents/progetti/hoc-video (skill "hoc-video-tutorial") e qui arrivano compressi per il web
 * in public/video/ (H.264 ~4-6 MB, poster .jpg). Aggiungere un video = aggiungere una riga.
 *
 * Campi:
 *  - orientation: "portrait" (9:16, pensato per il telefono) | "landscape" (16:9, desktop)
 *  - audience: a chi serve; adminOnly: true se mostra pagine riservate agli admin (in /guida
 *    lo vede solo chi ha accesso a quelle pagine — non è una difesa, è solo pertinenza)
 *  - leadsOnly: true se serve solo a chi guida una squadra (stessa logica di pertinenza)
 *  - asOf: data della versione dell'interfaccia mostrata: se la pagina cambia molto, il video va rifatto
 */
export const TUTORIAL_VIDEOS = [
  {
    id: "persone-hr",
    title: "Persone HR: come si usa il CRM",
    summary: "Il link del modulo, le fasi, i filtri, la scheda persona, il contratto, la sincronizzazione con ClickUp e la regola del «non si cancella mai».",
    src: "/video/tutorial-persone-hr.mp4",
    poster: "/video/tutorial-persone-hr.jpg",
    orientation: "landscape",
    durationSec: 70,
    audience: "Team HR",
    adminOnly: true,
    asOf: "2026-10-03",
  },
  {
    id: "modulo-collaboratori",
    title: "Il modulo dei tuoi dati e la tessera",
    summary: "Cosa trova chi riceve il link: i sette capitoli, cosa serve, perché chiediamo il codice fiscale, i documenti e la tessera finale.",
    src: "/video/tutorial-modulo-collaboratori.mp4",
    poster: "/video/tutorial-modulo-collaboratori.jpg",
    orientation: "portrait",
    durationSec: 50,
    audience: "Collaboratori",
    adminOnly: false,
    asOf: "2026-10-03",
  },
  {
    id: "sales-manager",
    title: "La settimana del Sales Manager",
    summary: "Da dove cominciare il lunedì: Da seguire, Sotto soglia con contesto e sostituti, Da far crescere, Classifica vendite, Creator e Presidio chat.",
    src: "/video/tutorial-sales-manager.mp4",
    poster: "/video/tutorial-sales-manager.jpg",
    orientation: "landscape",
    durationSec: 82,
    audience: "Sales Manager e team lead",
    adminOnly: false,
    leadsOnly: true, // in /guida solo a chi guida una squadra (scores.view team o all): agli operatori non serve
    asOf: "2026-10-03",
  },
];

/**
 * Serie di formazione vendite «Il percorso di una vendita» (04/10/2026): 6 episodi, la coach Vera
 * (senza volto) segue un fan, Marco, dal primo messaggio al giorno dopo. Numeri dallo studio delle
 * chat (26 mesi). TENUTA FUORI da TUTORIAL_VIDEOS di proposito: /guida la mostrerebbe a tutti, e agli
 * operatori arriva solo quando la direzione vendite la approva. Per ora vive nel Manuale vendite.
 */
const ep = (n, slug, title, summary, durationSec) => ({
  id: `vendita-${slug}`, title: `${n}. ${title}`, summary,
  src: `/video/vendita-${slug}.mp4`, poster: `/video/vendita-${slug}.jpg`,
  orientation: "portrait", durationSec, audience: "Operatori (dopo l'approvazione)", asOf: "2026-10-04",
});
export const VENDITA_SERIE = [
  ep(1, "e1-il-fan-arriva", "Il fan arriva", "Chi scrive entro un'ora è un fan caldo: prima lo fai parlare, poi un contenuto gratis porta la conversazione verso una scena.", 78),
  ep(2, "e2-il-si", "Il sì", "Il momento giusto te lo dice il fan. Prima del contenuto a pagamento serve un sì: la domanda va nel messaggio che lo prepara.", 56),
  ep(3, "e3-la-proposta", "La proposta", "Il messaggio a pagamento è una frase della scena, senza domande. Il primo gradino è basso: dopo un anno il fan vale lo stesso.", 51),
  ep(4, "e4-dopo-acquisto", "Dopo l'acquisto", "Il momento più caldo: prima il calore e un piccolo regalo, poi il gradino dopo, appena più su. La mancia è il segnale più forte.", 50),
  ep(5, "e5-il-no", "Il no", "I gradini salgono col sì e scendono col no. Dopo un «basta per stasera» si smette di vendere, non di parlare.", 51),
  ep(6, "e6-il-giorno-dopo", "Il giorno dopo", "A un fan che non scrive non si manda subito il pagamento: prima si riaccende la conversazione. Sei passi, sempre uguali.", 42),
];

export const getTutorial = (id) => TUTORIAL_VIDEOS.find((v) => v.id === id) || VENDITA_SERIE.find((v) => v.id === id) || null;

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
}
