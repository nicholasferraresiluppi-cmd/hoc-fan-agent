// Creator di Revenue e chat, lette dallo split (15/10/2026). Logica di raggruppamento in
// live-creators.js; qui solo le letture: split in KV + anagrafica pagine dal warehouse.
//
// Costo: una query piccola (anagrafica + turni 14g + venduto 30g delle sole pagine dello
// split), cache KV 6 ore con chiave sugli id dello split → aggiungere una creator cambia la
// chiave e la lista si rifà subito, senza aspettare la scadenza.
// Se split vuoto o warehouse giù: FALLBACK_PAGES (le creator com'erano il 15/10), mai pagina vuota.
import crypto from "crypto";
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";
import { listSplits } from "@/lib/sales-coaching";
import { buildLiveCreators, isActiveAccount, FALLBACK_PAGES } from "@/lib/live-creators";

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const TTL_S = 6 * 3600;
const MEM_MS = 60 * 1000;
let mem = null; // { at, key, list }

const cleanIds = (ids) => [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
const idsKey = (ids) => crypto.createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 16);

// Anagrafica + turni 14g + venduto 30g. `where` è SQL costruito qui (id numerici o termini ripuliti).
function pagesSQL(where) {
  const p = P();
  return `
WITH c AS (
  SELECT id, alias, name, username, language, platform_id, deleted_at IS NOT NULL AS deleted,
         CAST(DATE(last_data) AS STRING) AS last_data
  FROM \`${p}.postgres.public_creators\`
  WHERE ${where}
),
sh AS (
  SELECT ec.creator_id, COUNT(*) AS shifts14
  FROM \`${p}.postgres.public_events\` e
  JOIN \`${p}.postgres.public_events_creators\` ec ON ec.event_id = e.id
  WHERE e.started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
    AND e.started_at < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
    AND ec.creator_id IN (SELECT id FROM c)
  GROUP BY 1
),
tx AS (
  SELECT creator_id, ROUND(SUM(net)) AS net30
  FROM \`${p}.onlyfans.attributed_transactions\`
  WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    AND creator_id IN (SELECT id FROM c)
  GROUP BY 1
)
SELECT c.*, COALESCE(sh.shifts14, 0) AS shifts14, tx.net30
FROM c LEFT JOIN sh ON sh.creator_id = c.id LEFT JOIN tx ON tx.creator_id = c.id
LIMIT 200`;
}
const QOPTS = { maxBytesBilled: 10 * 1024 ** 3, timeoutMs: 30_000 };
const shape = (r) => ({
  id: Number(r.id), alias: r.alias, name: r.name, username: r.username, language: r.language,
  platform_id: r.platform_id == null ? null : Number(r.platform_id), deleted: r.deleted === true || r.deleted === "true",
  last_data: r.last_data || null, shifts14: Number(r.shifts14) || 0, net30: r.net30 == null ? null : Number(r.net30),
});

/** Pagine (anagrafica + attività) per questi id. Cache KV 6h. */
export async function pagesFor(ids, { force = false } = {}) {
  const list = cleanIds(ids);
  if (!list.length) return [];
  const key = `live:creators:pages:v1:${idsKey(list)}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return hit;
  }
  const { rows } = await bqQuery(pagesSQL(`id IN (${list.join(", ")})`), QOPTS);
  const pages = rows.map(shape);
  // id dello split che il warehouse non conosce: restano visibili come pagina senza nome
  for (const id of list) if (!pages.some((p) => p.id === id)) pages.push({ id, alias: null, name: `Pagina ${id}`, platform_id: id, deleted: false, shifts14: 0, net30: null });
  await kv.set(key, pages, { ex: TTL_S }).catch(() => {});
  return pages;
}

/** Tutti gli id degli split (unione). */
export async function splitIds() {
  const splits = await listSplits().catch(() => []);
  return cleanIds(splits.flatMap((s) => s.creator_ids || []));
}

/** Le creator di Revenue e chat: quelle degli split, raggruppate per persona. */
export async function getLiveCreators() {
  const ids = await splitIds();
  const key = ids.join(",");
  if (mem && mem.key === key && Date.now() - mem.at < MEM_MS) return mem.list;
  let list;
  try {
    if (!ids.length || !bigQueryConfigured()) throw new Error("split vuoto o warehouse non configurato");
    // creator ferme (nessun turno in 14g né venduto in 30g su nessuna pagina, es. chi ha smesso ma è
    // ancora nello split) fuori da Revenue e chat: pagine vuote che nessuno legge. Restano visibili,
    // come ferme, in /admin/creator-split, da dove si tolgono.
    list = buildLiveCreators(await pagesFor(ids)).filter((c) => c.accounts.some(isActiveAccount));
  } catch {
    list = buildLiveCreators(FALLBACK_PAGES);
  }
  mem = { at: Date.now(), key, list };
  return list;
}
export async function getLiveCreator(slug) {
  return (await getLiveCreators()).find((c) => c.slug === slug) || null;
}
export const forgetLiveCreators = () => { mem = null; };

/** Ricerca nell'anagrafica per nome, alias o username (pagine non cancellate). */
export async function searchPages(q) {
  const words = String(q || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9._ ]+/g, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
  if (!words.length) return [];
  // i termini contengono solo [a-z0-9._]: il punto si escapa per la regex, nient'altro può uscire dalla stringa
  const hay = "LOWER(CONCAT(IFNULL(alias,''),' ',IFNULL(name,''),' ',IFNULL(username,'')))";
  const where = ["deleted_at IS NULL", ...words.map((w) => `REGEXP_CONTAINS(${hay}, r'${w.replace(/\./g, "\\.")}')`)].join(" AND ");
  const { rows } = await bqQuery(pagesSQL(where), QOPTS);
  return rows.map(shape);
}
