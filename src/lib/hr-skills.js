/**
 * Mappa delle competenze — v2 (03/10/2026, ristrutturazione approvata dal titolare).
 *
 * Aree che ricalcano l'azienda (OnlyFans, media buying, social organico,
 * contenuti, AI, tecnologia e dati, gestione). Ogni voce ha:
 *   - una CHIAVE stabile (è ciò che si salva in skillLevels / learnWish),
 *   - un nome italiano,
 *   - `cu`: le etichette equivalenti del campo "Skills" di ClickUp, se esistono.
 *     La PRIMA è quella che si scrive su ClickUp; le altre servono solo a
 *     riconoscere i valori vecchi (es. "Zapier" e "Make" → Automazioni).
 *     Le voci senza `cu` vivono solo in app e nel blocco "— Dati HOC Pro —".
 *
 * Compatibilità: fino al 02/10 skillLevels aveva come chiavi le etichette
 * ClickUp. `resolveSkillKey` traduce le chiavi vecchie in quelle nuove, così i
 * dati già salvati continuano a funzionare (si legge e si riscrive nel formato nuovo).
 *
 * Puro: usato dal modulo, dalla scheda e dal server.
 */
export const SKILL_LEVELS = ["Base", "Autonomo", "Esperto", "Posso insegnarla"];
/** Cosa vuol dire ogni livello, in concreto (mostrato nel modulo). */
export const SKILL_LEVEL_HINT = {
  Base: "l'hai provato",
  Autonomo: "lo fai da solo senza aiuto",
  Esperto: "lo fai da più di un anno con risultati",
  "Posso insegnarla": "l'hai già spiegato a un collega",
};

// senza etichetta ClickUp storica la voce usa il suo nome italiano come etichetta (opzioni aggiunte al campo Skills il 03/10/2026)
const sk = (key, name, cu = null) => ({ key, name, cu: cu == null ? [name] : [].concat(cu) });

export const SKILL_AREAS = [
  {
    key: "of", area: "OnlyFans", skills: [
      sk("of_chat", "Chat e vendita", "OF Messaging"),
      sk("of_account", "Gestione account", "OF Management"),
      sk("of_content_plan", "Piano contenuti OnlyFans", "Planning OF "),
      sk("of_chatter_team", "Gestione di un team di chatter"),
      sk("of_sales_data", "Lettura dei dati di vendita"),
    ],
  },
  {
    key: "ads", area: "Media buying e pubblicità", skills: [
      sk("ads_meta", "Meta Ads (Facebook e Instagram)"),
      sk("ads_tiktok", "TikTok Ads"),
      sk("ads_google", "Google Ads"),
      sk("ads_reddit_x", "Reddit Ads e X Ads"),
      sk("ads_tracking", "Tracciamento (pixel, UTM)"),
      sk("ads_landing", "Landing page"),
      sk("ads_budget", "Gestione del budget e ROAS"),
      sk("ads_strategy", "Strategia di campagne a pagamento", "Paid Media Strategy"),
      sk("ads_social", "Pubblicità sui social", "Social ADS"),
      sk("ads_funnel", "Funnel di vendita", "Funnel Marketing "),
      sk("ads_affiliate", "Affiliazioni", "Affiliate Marketing "),
    ],
  },
  {
    // 05/10/2026: «Social organico» → «SMM · Social media manager» (Nicholas); il nome vecchio resta riconosciuto nel testo su ClickUp
    key: "social", area: "SMM · Social media manager", aliases: ["Social organico"], skills: [
      sk("soc_instagram", "Instagram"),
      sk("soc_tiktok", "TikTok"),
      sk("soc_reddit", "Reddit"),
      sk("soc_x", "X (Twitter)"),
      sk("soc_telegram", "Telegram"),
      sk("soc_strategy", "Strategia social", "Social Media Strategy"),
      sk("soc_editorial", "Piano editoriale", "Content Planning "),
      sk("soc_community", "Gestione della community", "Community Management"),
      sk("soc_trends", "Analisi dei trend", "Trent Analizer "),
      sk("soc_influencer", "Collaborazioni con creator e influencer", "Influencer Mareketing"),
      sk("soc_copy", "Copywriting (scrivere testi)", "Copywriting"),
      sk("soc_storytelling", "Storytelling", "Sorytelling"),
      sk("soc_seo", "SEO", "SEO / SEM"),
    ],
  },
  {
    key: "content", area: "Contenuti", skills: [
      sk("cnt_photo", "Shooting fotografico", "Fotografia"),
      sk("cnt_video_shoot", "Riprese video"),
      sk("cnt_editing", "Montaggio video", "Video Editing "),
      sk("cnt_short", "Reels, Shorts e TikTok", "Production (Reels, Shorts, TikTok)"),
      sk("cnt_graphic", "Grafica (Photoshop, Illustrator, Figma, Canva)", "Graphic Design (PS, AI, Figma, Canva)"),
      sk("cnt_motion", "Motion graphic", "Motion Graphic"),
      sk("cnt_creative_dir", "Direzione creativa", "Creative Direction"),
      sk("cnt_brand_identity", "Identità visiva", "Branding Visivo (mood & brand identity)"),
      sk("cnt_audio", "Audio e podcast", "Podcasting / Editing Audio"),
    ],
  },
  {
    key: "ai", area: "Intelligenza artificiale", skills: [
      sk("ai_assistants", "Uso quotidiano degli assistenti (ChatGPT, Claude)", "AI"),
      sk("ai_prompting", "Scrivere prompt"),
      sk("ai_media", "Immagini e video con l'AI"),
      sk("ai_automation", "Automazioni con l'AI"),
      sk("ai_avatars", "Modelli e avatar AI"),
      sk("ai_coding", "Programmare con l'AI"),
    ],
  },
  {
    key: "tech", area: "Tecnologia e dati", skills: [
      sk("tech_frontend", "Sviluppo frontend", "Frontend Development"),
      sk("tech_backend", "Sviluppo backend", "Backend Development"),
      sk("tech_fullstack", "Sviluppo full-stack", "Full-Stack Development"),
      sk("tech_api", "Integrazioni API", "API Integration"),
      sk("tech_automation", "Automazioni (Zapier, Make)", ["Automations", "Zapier", "Make"]),
      sk("tech_database", "Database", "Database Management SQL/NoSQL"),
      sk("tech_data_eng", "Data engineering", "Data Engineering "),
      sk("tech_analytics", "Analisi dei dati", "Data Analytics"),
      sk("tech_sheets", "Excel e Google Sheets avanzato"),
      sk("tech_clickup", "ClickUp", "ClickUp"),
      sk("tech_notion", "Notion"),
      sk("tech_security", "Sicurezza informatica", "Cybersecurity"),
    ],
  },
  {
    key: "mgmt", area: "Gestione e funzioni aziendali", skills: [
      sk("mgmt_leadership", "Guidare un team", "Leadership"),
      sk("mgmt_management", "Gestione", "Gestione Management"),
      sk("mgmt_project", "Project management", "Project Management"),
      sk("mgmt_product", "Product management"),
      sk("mgmt_hr", "Selezione e HR"),
      sk("mgmt_training", "Formazione di colleghi"),
      sk("mgmt_finance", "Amministrazione e finanza"),
      sk("mgmt_legal", "Contratti e legale"),
      sk("mgmt_priority", "Gestione delle priorità", "Priority Management"),
      sk("mgmt_communication", "Comunicazione", "Effective Communication"),
      sk("mgmt_problem", "Problem solving", "Problem Solving"),
      sk("mgmt_agile", "Metodi agile (Scrum, Kanban)", ["Agile Methodologies", "Scrum ", "Kanban"]),
      sk("mgmt_process", "Documentare i processi", "Process Documentation"),
    ],
  },
];

export const SKILLS = SKILL_AREAS.flatMap((a) => a.skills.map((x) => ({ ...x, area: a.key, areaName: a.area })));
export const SKILL_BY_KEY = Object.fromEntries(SKILLS.map((x) => [x.key, x]));
/** chiave → nome italiano (per le chiavi vecchie usa skillName). */
export const SKILL_NAME = Object.fromEntries(SKILLS.map((x) => [x.key, x.name]));
export const AREA_BY_KEY = Object.fromEntries(SKILL_AREAS.map((a) => [a.key, a]));

const norm = (v) => (v == null ? "" : String(v)).trim().toLowerCase();
/**
 * Etichette del catalogo v1 (fino al 02/10) senza un equivalente esatto nel v2:
 * si portano sulla voce più vicina, così il livello già dichiarato non si perde.
 */
const LEGACY_EXTRA = {
  "analytical thinking": "mgmt_problem",
  "creativity": "cnt_creative_dir",
  "risk management": "mgmt_management",
  "trello": "mgmt_project",
};
const LEGACY = new Map();
for (const x of SKILLS) for (const label of x.cu) LEGACY.set(norm(label), x.key);
for (const [label, key] of Object.entries(LEGACY_EXTRA)) LEGACY.set(label, key);

/** Chiave nuova da una chiave nuova o da una vecchia (etichetta ClickUp, spazi e maiuscole ignorati). */
export function resolveSkillKey(k) {
  if (k == null) return null;
  if (SKILL_BY_KEY[k]) return k;
  return LEGACY.get(norm(k)) || null;
}
export function skillName(k) {
  const key = resolveSkillKey(k);
  return key ? SKILL_NAME[key] : String(k ?? "");
}
export const levelRank = (l) => SKILL_LEVELS.indexOf(l);

/**
 * Pulisce {chiave: livello}: chiavi vecchie tradotte, voci sconosciute e livelli
 * non validi scartati; se due chiavi vecchie finiscono sulla stessa voce
 * (es. Zapier e Make) resta il livello più alto.
 */
export function normalizeSkillMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = resolveSkillKey(k);
    if (!key || !SKILL_LEVELS.includes(v)) continue;
    if (!out[key] || levelRank(v) > levelRank(out[key])) out[key] = v;
  }
  return out;
}

/** Elenco "vorrei imparare": chiavi tradotte, uniche, al massimo `max`. */
export function normalizeLearnList(raw, max = 2) {
  const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : String(raw).split(",");
  const out = [];
  for (const x of list) {
    const key = resolveSkillKey(typeof x === "string" ? x.trim() : x);
    if (key && !out.includes(key)) out.push(key);
  }
  return out.slice(0, max);
}

/** Etichette da scrivere nel campo "Skills" di ClickUp (solo le voci che hanno un equivalente). */
export function clickupSkillLabels(map) {
  const out = [];
  for (const k of Object.keys(normalizeSkillMap(map))) {
    const label = SKILL_BY_KEY[k].cu[0];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Aree in cui la persona ha almeno una competenza. */
export function areasOfSkillMap(map) {
  const m = normalizeSkillMap(map);
  return SKILL_AREAS.filter((a) => a.skills.some((x) => m[x.key])).map((a) => a.key);
}

/** La persona ha la competenza `key` almeno al livello `minLevel`? (minLevel vuoto = qualunque livello) */
export function hasSkillAtLeast(map, key, minLevel) {
  const lvl = normalizeSkillMap(map)[key];
  if (!lvl) return false;
  return !minLevel || levelRank(lvl) >= levelRank(minLevel);
}

// ── Ruoli già ricoperti ──────────────────────────────────────────────────────
export const PAST_ROLES = [
  ["team_lead", "Responsabile di un team"],
  ["product_manager", "Product manager"],
  ["project_manager", "Project manager"],
  ["media_buyer", "Media buyer"],
  ["social_media_manager", "Social media manager"],
  ["account_manager", "Account manager"],
  ["sales", "Venditore"],
  ["customer_care", "Assistenza clienti"],
  ["chatter_agency", "Chatter in un'altra agenzia"],
  ["founder", "Imprenditore o fondatore"],
  ["other", "Altro"],
];
export const PAST_ROLE_NAME = Object.fromEntries(PAST_ROLES);
export const ROLE_DURATIONS = [
  ["lt1", "meno di 1 anno"],
  ["1to3", "1-3 anni"],
  ["3to5", "3-5 anni"],
  ["gt5", "oltre 5 anni"],
];
export const ROLE_DURATION_NAME = Object.fromEntries(ROLE_DURATIONS);
const ONE_LINE = (v, max) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);

/** [{ role, duration, other? }] puliti: ruoli noti, uno per tipo, durata valida o null. */
export function normalizePastRoles(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || !PAST_ROLE_NAME[r.role]) continue;
    if (out.some((x) => x.role === r.role)) continue;
    const item = { role: r.role, duration: ROLE_DURATION_NAME[r.duration] ? r.duration : null };
    if (r.role === "other") item.other = ONE_LINE(r.other, 80);
    out.push(item);
  }
  return out;
}
/** "Media buyer (1-3 anni)" / "Altro: fotografo (meno di 1 anno)". */
export function pastRoleText(r) {
  if (!r) return "";
  const name = r.role === "other" && r.other ? `Altro: ${r.other}` : PAST_ROLE_NAME[r.role] || r.role;
  return `${name}${r.duration ? ` (${ROLE_DURATION_NAME[r.duration]})` : ""}`;
}

/** Testo libero su una riga sola (per il blocco in descrizione: niente righe aggiunte di nascosto). */
export const oneLine = ONE_LINE;
