// Canali Telegram delle creator — store KV + bot HOC + warehouse. La logica sta in telegram-channels-core.js.
//
// Il bot è UNO per tutta HOC (env TELEGRAM_BOT_TOKEN, creato da BotFather). Il sales lo aggiunge come
// amministratore del canale (permesso "invitare utenti tramite link"): da lì Telegram ci manda entrate e
// uscite sul webhook /api/webhooks/telegram (header segreto TELEGRAM_WEBHOOK_SECRET).
//
// KV (namespace tg:*):
//   tg:ch:index                set degli id canale
//   tg:ch:{id}                 { creators[], handle|invite, url, kind, manager, note, chat_id, title,
//                                bot:{status,can_invite,at}, members, members_at, members_hist[], links[], … }
//   tg:chat:{chat_id}          → id canale (abbinamento fatto)
//   tg:pending                 { chat_id → { title, username, kind, at } } bot aggiunto a un canale non ancora abbinato
//   tg:st:{id}                 hash contatori j:{link} l:{link} jd:{giorno} ld:{giorno}
//   tg:mm:{id}                 hash HMAC(id utente Telegram) → link da cui è entrato (per attribuire l'uscita)
//   tg:upd:{update_id}         dedup degli update (Telegram riprova se non rispondiamo in tempo)
//   tg:of:{TG_VERSION}         cache clic/abbonati dei link OF con "telegram"/"TG" nel nome, per creator (6h)

import crypto from "crypto";
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { getNames } from "@/lib/s4s";
import { personOf } from "@/lib/creator-scope";
import {
  TG_VERSION, BEFORE_BOT, botStatusOf, classifyMemberUpdate, creatorsOf, inviteLinkName, pushMemberCount, romeDay, summarizeOfLinks, SOURCES,
} from "@/lib/telegram-channels-core";

const IDX = "tg:ch:index";
const CH = (id) => `tg:ch:${id}`;
const CHAT = (chatId) => `tg:chat:${chatId}`;
const PENDING = "tg:pending";
const ST = (id) => `tg:st:${id}`;
const MM = (id) => `tg:mm:${id}`;
const OF_CACHE = `tg:of:${TG_VERSION}`;
const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

export const botConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Bot Telegram non configurato (TELEGRAM_BOT_TOKEN)");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.ok) throw new Error(`Telegram ${method}: ${json.description || `HTTP ${r.status}`}`);
  return json.result;
}

// Pseudonimo dell'iscritto: HMAC con segreto server, mai l'id nudo (enumerabile).
function memberKey(userId) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.KV_REST_API_TOKEN || "tg";
  return crypto.createHmac("sha256", secret).update(`tg:${userId}`).digest("hex").slice(0, 24);
}

// ── Canali ──────────────────────────────────────────────────────────────────
export async function listChannels() {
  const ids = await kv.smembers(IDX);
  if (!ids?.length) return [];
  const rows = await Promise.all(ids.map((id) => kv.get(CH(id))));
  return rows.filter(Boolean).sort((a, b) => creatorsOf(a).join().localeCompare(creatorsOf(b).join()) || (a.created_at || 0) - (b.created_at || 0));
}

export const getChannel = (id) => kv.get(CH(id));

export async function saveChannel(value, { id, by } = {}) {
  const now = Date.now();
  if (id) {
    const prev = await kv.get(CH(id));
    if (!prev) return null;
    const { creator: _old, ...rest } = prev; // i dati vecchi avevano `creator` singolo
    const next = { ...rest, ...value, updated_at: now, updated_by: by };
    await kv.set(CH(id), next);
    return next;
  }
  const newId = crypto.randomBytes(6).toString("hex");
  const row = { id: newId, ...value, links: [], chat_id: null, title: null, bot: null, members: null, members_hist: [], created_at: now, created_by: by };
  await kv.set(CH(newId), row);
  await kv.sadd(IDX, newId);
  return row;
}

export async function deleteChannel(id) {
  const ch = await kv.get(CH(id));
  if (!ch) return;
  if (ch.chat_id) await kv.del(CHAT(ch.chat_id));
  await kv.del(CH(id), ST(id), MM(id));
  await kv.srem(IDX, id);
}

// ── Abbinamento chat Telegram ↔ canale mappato ─────────────────────────────
export async function getPending() {
  return (await kv.get(PENDING)) || {};
}

async function setPending(chatId, info) {
  const p = await getPending();
  if (info) p[chatId] = info; else delete p[chatId];
  await kv.set(PENDING, p);
}

/** Collega una chat (dove il bot è entrato) a un canale mappato, e legge subito titolo e iscritti. */
export async function connectChat(id, chatId) {
  const ch = await kv.get(CH(id));
  if (!ch) throw new Error("Canale non trovato");
  const owner = await kv.get(CHAT(chatId));
  if (owner && owner !== id) throw new Error("Questa chat è già collegata a un altro canale");
  if (ch.chat_id && String(ch.chat_id) !== String(chatId)) await kv.del(CHAT(ch.chat_id));
  await kv.set(CHAT(chatId), id);
  await kv.set(CH(id), { ...ch, chat_id: Number(chatId) });
  await setPending(chatId, null);
  return refreshChannel(id);
}

/** Rilegge dal bot titolo, stato del bot e numero di iscritti. */
export async function refreshChannel(id) {
  const ch = await kv.get(CH(id));
  if (!ch) throw new Error("Canale non trovato");
  const target = ch.chat_id || (ch.handle ? `@${ch.handle}` : null);
  if (!target) return { ...ch, check: "Canale privato: aggiungi il bot come amministratore e collegalo dalla lista qui sotto" };
  const chat = await tg("getChat", { chat_id: target });
  const me = await tg("getMe", {});
  const member = await tg("getChatMember", { chat_id: chat.id, user_id: me.id }).catch(() => null);
  const count = await tg("getChatMemberCount", { chat_id: chat.id }).catch(() => null);
  const day = romeDay(Date.now() / 1000);
  const bot = { ...botStatusOf(member), at: Date.now() };
  const next = {
    ...ch,
    chat_id: chat.id,
    title: chat.title || ch.title,
    kind: chat.type === "channel" ? "canale" : ch.kind,
    bot,
    members: count ?? ch.members,
    members_at: count != null ? Date.now() : ch.members_at,
    members_hist: count != null ? pushMemberCount(ch.members_hist, day, count) : ch.members_hist,
  };
  const owner = await kv.get(CHAT(chat.id));
  if (!owner) await kv.set(CHAT(chat.id), id);
  else if (owner !== id) throw new Error("Questa chat è già collegata a un altro canale mappato");
  await kv.set(CH(id), next);
  await setPending(chat.id, null);
  return next;
}

/** Giro giornaliero (cron): iscritti di tutti i canali dove il bot è dentro. */
export async function refreshAll() {
  if (!botConfigured()) return { skipped: "no-bot" };
  const list = await listChannels();
  let ok = 0, fail = 0;
  for (const ch of list) {
    if (!ch.chat_id && !ch.handle) continue;
    try { await refreshChannel(ch.id); ok++; } catch { fail++; }
  }
  return { ok, fail };
}

// ── Link d'invito per fonte ────────────────────────────────────────────────
export async function createInviteLink(id, { source, label }, by) {
  const ch = await kv.get(CH(id));
  if (!ch) throw new Error("Canale non trovato");
  if (!ch.chat_id) throw new Error("Prima aggiungi il bot come amministratore del canale");
  if (!SOURCES[source]) throw new Error("Fonte non valida");
  if ((ch.links || []).length >= 40) throw new Error("Troppi link su questo canale (max 40)");
  const name = inviteLinkName(source, label);
  const res = await tg("createChatInviteLink", { chat_id: ch.chat_id, name });
  const link = { key: crypto.randomBytes(4).toString("hex"), source, name, url: res.invite_link, created_at: Date.now(), by };
  await kv.set(CH(id), { ...ch, links: [...(ch.links || []), link] });
  return link;
}

/** Revoca il link su Telegram; le entrate già contate restano (la riga diventa "revocato"). */
export async function revokeInviteLink(id, key) {
  const ch = await kv.get(CH(id));
  const link = ch?.links?.find((l) => l.key === key);
  if (!link) throw new Error("Link non trovato");
  if (!link.revoked) await tg("revokeChatInviteLink", { chat_id: ch.chat_id, invite_link: link.url }).catch(() => {});
  await kv.set(CH(id), { ...ch, links: ch.links.map((l) => (l.key === key ? { ...l, revoked: Date.now() } : l)) });
}

export const getStats = (id) => kv.hgetall(ST(id));

// ── Webhook ────────────────────────────────────────────────────────────────
/** Elabora un update Telegram. Idempotente sull'update_id. */
export async function handleUpdate(update) {
  if (!update?.update_id) return "vuoto";
  const fresh = await kv.set(`tg:upd:${update.update_id}`, 1, { nx: true, ex: 2 * 86400 });
  if (!fresh) return "doppione";
  try {
    return await applyUpdate(update);
  } catch (e) {
    // si libera il dedup: Telegram riprova e l'evento non va perso
    await kv.del(`tg:upd:${update.update_id}`).catch(() => {});
    throw e;
  }
}

async function applyUpdate(update) {
  if (update.my_chat_member) {
    const { chat, new_chat_member: m, date } = update.my_chat_member;
    const status = botStatusOf(m);
    const id = await kv.get(CHAT(chat.id));
    if (id) {
      const ch = await kv.get(CH(id));
      if (ch) await kv.set(CH(id), { ...ch, title: chat.title || ch.title, bot: { ...status, at: date * 1000 } });
      return "bot:" + status.status;
    }
    // canale pubblico già mappato con lo stesso @nome → abbinamento automatico
    if (status.status !== "fuori" && chat.username) {
      const list = await listChannels();
      const hit = list.find((c) => c.handle && c.handle === chat.username.toLowerCase() && !c.chat_id);
      if (hit) { await connectChat(hit.id, chat.id); return "abbinato"; }
    }
    if (status.status === "fuori") await setPending(chat.id, null);
    else await setPending(chat.id, { title: chat.title || null, username: chat.username || null, kind: chat.type, at: date * 1000, bot: status.status });
    return "in attesa";
  }

  if (update.chat_member) {
    const cm = update.chat_member;
    const id = await kv.get(CHAT(cm.chat.id));
    if (!id) return "chat non mappata";
    const ch = await kv.get(CH(id));
    if (!ch) return "chat non mappata";
    const ev = classifyMemberUpdate(cm, ch.links || []);
    if (!ev) return "ignorato";
    const day = romeDay(cm.date);
    const who = memberKey(cm.new_chat_member?.user?.id ?? cm.from?.id);
    if (ev.type === "join") {
      await kv.hincrby(ST(id), `j:${ev.key}`, 1);
      await kv.hincrby(ST(id), `jd:${day}`, 1);
      await kv.hset(MM(id), { [who]: ev.key });
    } else {
      const from = await kv.hget(MM(id), who);
      await kv.hincrby(ST(id), `l:${from || BEFORE_BOT}`, 1);
      await kv.hincrby(ST(id), `ld:${day}`, 1);
      if (from) await kv.hdel(MM(id), who);
    }
    return ev.type;
  }
  return "ignorato";
}

/** Registra il webhook su Telegram (admin, una volta). */
export async function setupWebhook(origin) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("Manca TELEGRAM_WEBHOOK_SECRET");
  await tg("setWebhook", {
    url: `${origin}/api/webhooks/telegram`,
    secret_token: secret,
    allowed_updates: ["my_chat_member", "chat_member"],
    drop_pending_updates: false,
  });
  return tg("getWebhookInfo", {});
}

export async function botInfo() {
  if (!botConfigured()) return null;
  try {
    const [me, hook] = await Promise.all([tg("getMe", {}), tg("getWebhookInfo", {})]);
    return { username: me.username, webhook: Boolean(hook.url), webhook_error: hook.last_error_message || null, pending: hook.pending_update_count || 0 };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Passaggio a OnlyFans: link di tracciamento OF con "telegram"/"TG" nel nome, per creator ─────────
// Riconosciuti dal nome (nessun campo da compilare). Per ogni link: totale da quando esiste (ultima
// fotografia) + ultimi 30 giorni (somma dei *_diff giornalieri). ~pochi MB letti.
export function ofTelegramSQL() {
  return `
WITH l AS (
  SELECT creator_id, link_name, link_url, calendar_date, subs, clicks, revenue, subs_diff, clicks_diff
  FROM \`${DATA()}.onlyfans.links_stats\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}'
    AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    AND REGEXP_CONTAINS(LOWER(link_name), r'telegram|\\btg\\b'))
SELECT creator_id, link_url, ANY_VALUE(link_name) AS link_name,
  ARRAY_AGG(STRUCT(subs, clicks, revenue) ORDER BY calendar_date DESC LIMIT 1)[OFFSET(0)].*,
  SUM(subs_diff) AS subs_30, SUM(clicks_diff) AS clicks_30
FROM l GROUP BY creator_id, link_url`;
}

/** { persona → { links[], subs, clicks, revenue, subs_30, clicks_30 } }. Cache 6h. */
export async function getOfTelegramStats() {
  if (!bigQueryConfigured()) return { creators: {}, available: false };
  const cached = await kv.get(OF_CACHE);
  if (cached && Date.now() - cached.at < 6 * 3600e3) return { creators: cached.creators, at: cached.at, available: true };
  const [{ rows }, names] = await Promise.all([
    bqQuery(ofTelegramSQL(), { maxBytesBilled: 2 * 1024 ** 3, timeoutMs: 30_000 }),
    getNames().catch(() => ({})),
  ]);
  const creators = summarizeOfLinks(rows, (id) => personOf(names[id]));
  const at = Date.now();
  await kv.set(OF_CACHE, { creators, at }, { ex: 2 * 86400 });
  return { creators, at, available: true };
}
