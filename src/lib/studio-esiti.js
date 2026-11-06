// Cosa ha funzionato — lettura dal magazzino dati e collegamenti (6/11/2026). Logica in studio-esiti-core.js.
//
// Due query piccole per profilo (misurate su @fishballla: ~7 MB il profilo, ~0,55 GB i reel, ~45 MB le copertine: meno di mezzo centesimo):
//   instagram.cache_accounts_talents   una riga al giorno del profilo → id Instagram, visite al link, iscritti
//   instagram.reels_diffs              una riga al giorno per reel → view, like, commenti
// Il risultato resta in cache WARM_MS: il magazzino si aggiorna una volta al giorno, rileggerlo a ogni
// apertura non porta niente. Una sola lettura alla volta per profilo (le altre aspettano la cache).
//
// Chiavi (namespace `studio:esiti:*`, letto solo da questa sezione):
//   studio:esiti:data:{pid}    { v, at, handle, platformId, lastDay, reels, accountDays, error }
//   studio:esiti:lock:{pid}    lettura in corso (scade da sola)
//   studio:esiti:links:{pid}   hash codice reel → { fileId, by, at }   reel ↔ video del Banco
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { ESITI_VERSION, WINDOW_DAYS, buildReels, buildAccountDays, normalizeLinks } from "@/lib/studio-esiti-core";

const dataKey = (pid) => `studio:esiti:data:${pid}`;
const lockKey = (pid) => `studio:esiti:lock:${pid}`;
const linksKey = (pid) => `studio:esiti:links:${pid}`;
const WARM_MS = 6 * 3600_000;
const DS = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const MAX_BYTES = 3 * 1024 ** 3;

const cleanHandle = (h) => { const s = String(h || "").trim().replace(/^@+/, "").toLowerCase(); return /^[a-z0-9._]{1,30}$/.test(s) ? s : null; };

async function readWarehouse(handle) {
  const org = String(HOC_ORGANIZATION_ID).replace(/'/g, "");
  const { rows: acc } = await bqQuery(`
SELECT CAST(date_key AS STRING) AS date_key, platform_id, unique_visitors_count_diff, subs_diff, followed_by
FROM \`${DS()}.instagram.cache_accounts_talents\`
WHERE LOWER(owner_username) = '${handle}' AND organization_id = '${org}'
  AND date_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS + 10} DAY)`, { maxBytesBilled: MAX_BYTES, timeoutMs: 30_000 });
  const platformId = [...acc].sort((a, b) => String(b.date_key).localeCompare(String(a.date_key)))[0]?.platform_id || null;
  if (!platformId) return { platformId: null, reels: [], accountDays: {}, lastDay: null };
  const pidSql = String(platformId).replace(/[^0-9]/g, "");
  // platform_id è già verificato sull'organizzazione dalla query sopra. Le copertine (stringhe lunghe:
  // ×10 sui byte letti) si prendono solo dalla foto dell'ultimo giorno.
  const { rows } = await bqQuery(`
SELECT content_id, CAST(date_key AS STRING) AS date_key, play_count, like_count, comment_count,
  UNIX_SECONDS(create_time) AS create_time
FROM \`${DS()}.instagram.reels_diffs\`
WHERE platform_id = '${pidSql}' AND date_key >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)`, { maxBytesBilled: MAX_BYTES, timeoutMs: 45_000 });
  const days = [...rows.map((r) => String(r.date_key)), ...acc.map((r) => String(r.date_key))].filter(Boolean).sort();
  const lastDay = days[days.length - 1] || null;
  if (lastDay) {
    const { rows: th } = await bqQuery(`
SELECT content_id, thumbnail_url FROM \`${DS()}.instagram.reels_diffs\`
WHERE platform_id = '${pidSql}' AND date_key = '${lastDay}'`, { maxBytesBilled: MAX_BYTES, timeoutMs: 30_000 }).catch(() => ({ rows: [] }));
    const thumbs = new Map(th.map((r) => [String(r.content_id), r.thumbnail_url]));
    for (const r of rows) if (r.date_key === lastDay) r.thumbnail_url = thumbs.get(String(r.content_id)) || null;
  }
  return { platformId: pidSql, reels: buildReels(rows, lastDay), accountDays: buildAccountDays(acc), lastDay };
}

/** Dati del profilo dal magazzino (dalla cache se fresca). `computing` = un'altra lettura è in corso. */
export async function getEsitiData(pid, handle, { force = false, cacheOnly = false } = {}) {
  const h = cleanHandle(handle);
  if (!h) return { error: "Il profilo non ha un nome utente Instagram valido", reels: [], accountDays: {} };
  const cached = await kv.get(dataKey(pid));
  const fresh = cached && cached.v === ESITI_VERSION && cached.handle === h && Date.now() - (cached.at || 0) < WARM_MS;
  if (fresh && !force) return cached;
  // chi vuole solo i numeri già letti (la Redazione) non fa partire il magazzino
  if (cacheOnly) return cached && cached.v === ESITI_VERSION && cached.handle === h ? cached : { reels: [], accountDays: {} };
  if (!bigQueryConfigured()) return cached || { error: "Magazzino dati non configurato in questo ambiente", reels: [], accountDays: {} };
  if (!(await kv.set(lockKey(pid), Date.now(), { nx: true, ex: 90 }))) return { ...(cached || { reels: [], accountDays: {} }), computing: true };
  try {
    const doc = { v: ESITI_VERSION, at: Date.now(), handle: h, error: null, ...(await readWarehouse(h)) };
    await kv.set(dataKey(pid), doc);
    // prova di lavoro per la Sede (ufficio «Cosa ha funzionato»)
    await kv.set("cron:heartbeat:misura-reel", { at: doc.at, via: "pagina", result: `@${h}: ${doc.reels.length} reel letti, dati al ${doc.lastDay || "—"}` }, { ex: 60 * 86400 });
    return doc;
  } catch (e) {
    // il magazzino non risponde: restano i numeri già letti, con l'errore in vista
    return { ...(cached || { reels: [], accountDays: {} }), error: e.message || "Magazzino dati non raggiungibile" };
  } finally {
    await kv.del(lockKey(pid));
  }
}

export async function getLinks(pid) {
  return normalizeLinks((await kv.hgetall(linksKey(pid))) || {});
}

/** Collega un reel a un video del Banco (fileId null = scollega). Un video resta su un solo reel. */
export async function setLink(pid, code, fileId, userId) {
  const c = String(code || "");
  if (!/^[A-Za-z0-9_-]{5,20}$/.test(c)) return { ok: false, error: "Reel non valido" };
  if (!fileId) { await kv.hdel(linksKey(pid), c); return { ok: true }; }
  const cur = await getLinks(pid);
  const other = Object.entries(cur).find(([k, v]) => k !== c && v.fileId === fileId);
  if (other) await kv.hdel(linksKey(pid), other[0]);
  await kv.hset(linksKey(pid), { [c]: { fileId: String(fileId), by: userId || null, at: Date.now() } });
  return { ok: true, moved: other ? other[0] : null };
}
