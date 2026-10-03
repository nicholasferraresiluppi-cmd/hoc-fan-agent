// Sales manager AI — archivio (KV). Namespace isolato `smai:*`.
//
//   smai:config                 configurazione (creator pilota, visibilità operatori, tetto spesa)
//   smai:job:{day}              stato della notte (uffici, batch, log)
//   smai:pack:{day}:{opKey}     pacchetto dati dell'operatore (60 giorni)
//   smai:fb:{day}:{opKey}       feedback: report, arbitro, Garante, revisione (180 giorni)
//   smai:fb:index               ZSET day → per l'elenco
//   smai:reply:{day}:{opKey}    risposta dell'operatore (impegno + utile/non utile)
//   smai:spend:{day}            dollari spesi in AI quel giorno
//   smai:events                 ultimi eventi degli uffici (cap 300) per il Quartier generale

import { kv } from "@vercel/kv";

const DAY = 86400;
export const DEFAULT_CONFIG = {
  enabled: true,
  pilot_creators: ["1000000358"], // Martina Scavo IT (pilota concordato con Nicholas, ott 2026)
  operator_visible: false,        // il gate legale è aperto: all'inizio vedono solo direzione e sales manager
  daily_cap_usd: 5,               // tetto concordato con Nicholas il 4/10/2026
  max_operators: 12,
};

export const opKey = (operator, creatorId) =>
  `${String(operator).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}__${creatorId}`;

export async function getConfig() {
  const c = await kv.get("smai:config").catch(() => null);
  return { ...DEFAULT_CONFIG, ...(c || {}) };
}
export async function setConfig(patch, by) {
  const cur = await getConfig();
  const next = { ...cur };
  if (Array.isArray(patch.pilot_creators)) next.pilot_creators = patch.pilot_creators.map((x) => String(Number(x))).filter((x) => x !== "NaN").slice(0, 20);
  if (typeof patch.operator_visible === "boolean") next.operator_visible = patch.operator_visible;
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (Number.isFinite(Number(patch.daily_cap_usd))) next.daily_cap_usd = Math.max(0, Math.min(20, Number(patch.daily_cap_usd)));
  if (Number.isFinite(Number(patch.max_operators))) next.max_operators = Math.max(1, Math.min(60, Math.round(Number(patch.max_operators))));
  next.updated_at = Date.now(); next.updated_by = by || null;
  await kv.set("smai:config", next);
  await event("direzione", `Configurazione aggiornata${by ? "" : ""}`);
  return next;
}

export const getJob = (day) => kv.get(`smai:job:${day}`);
export const saveJob = (job) => kv.set(`smai:job:${job.day}`, { ...job, updated_at: Date.now() }, { ex: 40 * DAY });

export const savePack = (day, key, pack) => kv.set(`smai:pack:${day}:${key}`, pack, { ex: 60 * DAY });
export const getPack = (day, key) => kv.get(`smai:pack:${day}:${key}`);

export async function saveFeedback(day, key, fb) {
  await kv.set(`smai:fb:${day}:${key}`, { ...fb, updated_at: Date.now() }, { ex: 180 * DAY });
  await kv.zadd("smai:fb:index", { score: Date.parse(`${day}T12:00:00Z`), member: day });
}
export const getFeedback = (day, key) => kv.get(`smai:fb:${day}:${key}`);
export async function listDays(limit = 30) {
  const days = await kv.zrange("smai:fb:index", 0, limit - 1, { rev: true }).catch(() => []);
  return days || [];
}

export const getReply = (day, key) => kv.get(`smai:reply:${day}:${key}`);
export const saveReply = (day, key, r) => kv.set(`smai:reply:${day}:${key}`, { ...r, at: Date.now() }, { ex: 180 * DAY });

export async function addSpend(day, usd) {
  if (!(usd > 0)) return;
  await kv.incrbyfloat(`smai:spend:${day}`, Math.round(usd * 10000) / 10000);
  await kv.expire(`smai:spend:${day}`, 400 * DAY);
}
export async function getSpend(day) {
  return Number((await kv.get(`smai:spend:${day}`).catch(() => 0)) || 0);
}

export async function event(office, text, extra = {}) {
  try {
    await kv.lpush("smai:events", JSON.stringify({ at: Date.now(), office, text, ...extra }));
    await kv.ltrim("smai:events", 0, 299);
  } catch {}
}
export async function recentEvents(n = 60) {
  const raw = await kv.lrange("smai:events", 0, n - 1).catch(() => []);
  return (raw || []).map((x) => (typeof x === "string" ? JSON.parse(x) : x));
}

/** Ultimo feedback consegnato a questo operatore prima di `day`, con la risposta (per il riscontro). */
export async function lastCommitment(key, beforeDay, lookbackDays = 4) {
  const d = new Date(`${beforeDay}T12:00:00Z`);
  for (let i = 1; i <= lookbackDays; i++) {
    const prev = new Date(d.getTime() - i * DAY * 1000).toISOString().slice(0, 10);
    const fb = await getFeedback(prev, key);
    if (!fb || !["approvato", "modificato"].includes(fb.status)) continue;
    const reply = await getReply(prev, key);
    return { day: prev, feedback: fb, reply };
  }
  return null;
}
