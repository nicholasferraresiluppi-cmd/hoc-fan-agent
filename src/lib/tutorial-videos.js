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
];

export const getTutorial = (id) => TUTORIAL_VIDEOS.find((v) => v.id === id) || null;

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
}
