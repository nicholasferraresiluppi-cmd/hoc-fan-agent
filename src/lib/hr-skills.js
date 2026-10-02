/**
 * Mappa delle competenze (02/10/2026): le STESSE etichette del campo "Skills" su ClickUp,
 * raggruppate per area e con un nome italiano leggibile. Il livello vive in HOC Pro.
 * Puro: usato dal modulo, dalla scheda e dal server.
 */
export const SKILL_LEVELS = ["Base", "Autonomo", "Esperto", "Posso insegnarla"];

export const SKILL_AREAS = [
  { area: "OnlyFans e chat", skills: [["OF Messaging", "Chat e vendita su OnlyFans"], ["OF Management", "Gestione account OnlyFans"], ["Planning OF ", "Pianificazione contenuti OnlyFans"]] },
  { area: "Social e marketing", skills: [["Social Media Strategy", "Strategia social"], ["Content Planning ", "Piano editoriale"], ["Copywriting", "Scrittura di testi"], ["Sorytelling", "Storytelling"], ["Community Management", "Gestione community"], ["Trent Analizer ", "Analisi dei trend"], ["Social ADS", "Pubblicità sui social"], ["Paid Media Strategy", "Strategia di campagne a pagamento"], ["Influencer Mareketing", "Influencer marketing"], ["Funnel Marketing ", "Funnel di vendita"], ["Affiliate Marketing ", "Affiliazioni"], ["SEO / SEM", "SEO e SEM"]] },
  { area: "Contenuti ed editing", skills: [["Video Editing ", "Montaggio video"], ["Production (Reels, Shorts, TikTok)", "Reels, Shorts e TikTok"], ["Fotografia", "Fotografia"], ["Graphic Design (PS, AI, Figma, Canva)", "Grafica (Photoshop, Illustrator, Figma, Canva)"], ["Motion Graphic", "Motion graphic"], ["Creative Direction", "Direzione creativa"], ["Branding Visivo (mood & brand identity)", "Identità visiva"], ["Podcasting / Editing Audio", "Audio e podcast"]] },
  { area: "Tecnologia e dati", skills: [["AI", "Intelligenza artificiale"], ["Automations", "Automazioni"], ["Zapier", "Zapier"], ["Make", "Make"], ["API Integration", "Integrazioni API"], ["Frontend Development", "Sviluppo frontend"], ["Backend Development", "Sviluppo backend"], ["Full-Stack Development", "Sviluppo full-stack"], ["Database Management SQL/NoSQL", "Database"], ["Data Engineering ", "Data engineering"], ["Data Analytics", "Analisi dei dati"], ["Cybersecurity", "Sicurezza informatica"], ["ClickUp", "ClickUp"]] },
  { area: "Organizzazione e persone", skills: [["Leadership", "Guidare un gruppo"], ["Gestione Management", "Gestione"], ["Project Management", "Gestione progetti"], ["Priority Management", "Gestione delle priorità"], ["Effective Communication", "Comunicazione"], ["Problem Solving", "Risolvere problemi"], ["Analytical Thinking", "Pensiero analitico"], ["Creativity", "Creatività"], ["Process Documentation", "Scrivere procedure"], ["Risk Management", "Gestione dei rischi"], ["Agile Methodologies", "Metodi agile"], ["Scrum ", "Scrum"], ["Kanban", "Kanban"], ["Trello", "Trello"]] },
];
export const SKILL_NAME = Object.fromEntries(SKILL_AREAS.flatMap((a) => a.skills.map(([k, it]) => [k, it])));

/** Pulisce {etichetta: livello}: solo etichette note e livelli validi. */
export function normalizeSkillMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (SKILL_NAME[k] && SKILL_LEVELS.includes(v)) out[k] = v;
  return out;
}
