// Trend modelle, livello 1 — lettura dal warehouse, descrizioni AI e format (3/11/2026).
// Logica pura in trend-modelle-core.js (test: tests/trend-modelle.mjs).
//
// Ogni notte (dispatcher → /api/cron/trend-modelle): UNA query BigQuery (~27 GB, ~0,17 $) legge
// le ultime foto dei reel di trendfinder (stranieri) e di ig (le nostre, solo la nostra
// organizzazione), calcola il solito di ogni profilo e restituisce solo i reel esplosi; poi l'AI
// descrive il format dei nuovi esplosi dalla copertina (al massimo 25 a notte, tetto mensile).
// Copertine = link firmati di Instagram: si rinnovano a ogni lettura notturna, poi scadono.
//
// Chiavi:  trendmod:hits          archivio degli esplosi (gz1, sovrascritto ogni notte)
//          trendmod:desc          HASH id reel → descrizione AI
//          trendmod:formats       HASH id → format fatto a mano { id, name, note, items, createdAt, by }
//          trendmod:spend:{mese}  spesa AI del mese ($)
//          trendmod:run           ultimo giro { at, ok, error, hits, gb, described }
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { bqQuery, bqProjects, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { costUSD } from "@/lib/sales-ai/core";
import {
  TREND_MODELLE_VERSION, BASE_MIN_DAYS, BASE_MAX_DAYS, MIN_BASE, FRESH_DAYS, HIT_TIMES, HIT_VIEWS,
  DESC_PER_NIGHT, AI_MODEL, AI_CAP_USD, BQ_MAX_GB, DESC_SCHEMA, DESC_SYSTEM,
  normalizeRow, findHits, autoGroups, snapshotHit, formatView, sortFormats, parseFormatName,
  normalizeDesc, pickToDescribe, descPrompt, monthKey,
} from "@/lib/trend-modelle-core";
import { SMALL_BASE } from "@/lib/clip-radar-core";

const HITS = "trendmod:hits";
const DESC = "trendmod:desc";
const FORMATS = "trendmod:formats";
const RUN = "trendmod:run";
const SPEND = (m) => `trendmod:spend:${m}`;
const GZ = "gz1:";
const enc = (v) => GZ + gzipSync(Buffer.from(JSON.stringify(v), "utf8")).toString("base64");
const dec = (raw) => (typeof raw === "string" && raw.startsWith(GZ) ? JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8")) : raw || null);
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const fakeAi = () => globalThis.__trendFakeAnthropic;
const GB = 1024 ** 3;
const REFRESH_EVERY_H = 20; // la lettura notturna non si ripete nello stesso giorno
const MANUAL_EVERY_H = 6;   // «Rileggi adesso» al massimo ogni 6 ore (~0,17 $ a lettura)

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || fakeAi());
export { bigQueryConfigured };

/**
 * La query: ultima foto di ogni reel degli ultimi 60 giorni, il solito di ogni profilo
 * (mediana dei reel di 7-60 giorni, almeno 5, fissati esclusi) e solo i reel esplosi.
 * Le soglie sono quelle del core; il core le ricontrolla sulle righe che tornano.
 */
export function hitsSQL(p = bqProjects().dataProject, org = HOC_ORGANIZATION_ID) {
  const j = (path) => `JSON_VALUE(data, '${path}')`;
  return `
WITH raw AS (
  SELECT 'tf' AS src, data, commit_timestamp FROM \`${p}.tf.raw_reels\`
  WHERE commit_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${BASE_MAX_DAYS - 15} DAY)
  UNION ALL
  SELECT 'ig', data, commit_timestamp FROM \`${p}.ig.raw_reels\`
  WHERE commit_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${BASE_MAX_DAYS - 15} DAY)
    AND organization_id = '${org}'
),
x AS (
  SELECT src,
    COALESCE(${j("$.user.id")}, ${j("$.owner.id")}) AS owner_id,
    COALESCE(${j("$.user.username")}, ${j("$.owner.username")}) AS username,
    ${j("$.code")} AS code,
    TIMESTAMP_SECONDS(SAFE_CAST(${j("$.taken_at")} AS INT64)) AS taken_at,
    SAFE_CAST(${j("$.play_count")} AS INT64) AS views,
    SAFE_CAST(${j("$.like_count")} AS INT64) AS likes,
    SAFE_CAST(${j("$.comment_count")} AS INT64) AS comments,
    SUBSTR(${j("$.caption.text")}, 1, 400) AS caption,
    COALESCE(${j("$.clips_metadata.audio_ranking_info.best_audio_cluster_id")}, ${j("$.clips_metadata.music_info.music_asset_info.audio_id")}, ${j("$.clips_metadata.original_sound_info.audio_id")}) AS audio_id,
    COALESCE(${j("$.clips_metadata.music_info.music_asset_info.title")}, ${j("$.clips_metadata.original_sound_info.original_audio_title")}) AS audio_title,
    COALESCE(${j("$.clips_metadata.template_info.template_clips_media_id")}, ${j("$.clips_metadata.basel_template_info_for_ig_app.original_template_media_id")}) AS template_id,
    ARRAY_TO_STRING(ARRAY(SELECT JSON_VALUE(c, '$.username') FROM UNNEST(JSON_QUERY_ARRAY(data, '$.coauthor_producers')) c), ',') AS coauthors,
    COALESCE(${j("$.image_versions2.candidates[0].url")}, ${j("$.thumbnail_url")}) AS cover,
    COALESCE(SAFE_CAST(${j("$.is_pinned")} AS BOOL), FALSE) AS pinned,
    commit_timestamp
  FROM raw
),
latest AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY commit_timestamp DESC) AS rn FROM x
    WHERE code IS NOT NULL AND taken_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${BASE_MAX_DAYS} DAY)
  ) WHERE rn = 1
),
base AS (
  SELECT src, owner_id, APPROX_QUANTILES(views, 100)[OFFSET(50)] AS base, COUNT(*) AS base_n FROM latest
  WHERE NOT pinned AND views IS NOT NULL
    AND taken_at BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${BASE_MAX_DAYS} DAY) AND TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${BASE_MIN_DAYS} DAY)
  GROUP BY src, owner_id HAVING COUNT(*) >= ${MIN_BASE}
)
SELECT l.* EXCEPT(commit_timestamp), b.base, b.base_n,
  (SELECT COUNTIF(src = 'tf') FROM base) AS n_int,
  (SELECT COUNTIF(src = 'ig') FROM base) AS n_ours
FROM latest l JOIN base b USING (src, owner_id)
WHERE l.taken_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${FRESH_DAYS} DAY)
  AND NOT l.pinned AND l.views >= ${HIT_VIEWS} AND b.base >= ${SMALL_BASE} AND l.views >= ${HIT_TIMES} * b.base`;
}

async function loadHits() {
  const d = dec(await kv.get(HITS).catch(() => null));
  return d && d.v === TREND_MODELLE_VERSION ? d : null;
}

/** Legge il warehouse e riscrive l'archivio degli esplosi. */
export async function refreshHits({ now = Date.now() } = {}) {
  if (!bigQueryConfigured()) throw new Error("BigQuery non è configurato su questo ambiente");
  const { rows, totalBytesProcessed } = await bqQuery(hitsSQL(), { maxBytesBilled: BQ_MAX_GB * GB, timeoutMs: 50_000 });
  const reels = rows.map(normalizeRow).filter(Boolean);
  const hits = findHits(reels, now);
  const doc = {
    v: TREND_MODELLE_VERSION,
    at: now,
    gb: Math.round((totalBytesProcessed / 1e9) * 10) / 10,
    accounts: { int: Number(rows[0]?.n_int) || 0, ours: Number(rows[0]?.n_ours) || 0 },
    hits,
  };
  await kv.set(HITS, enc(doc));
  // descrizioni di reel che non sono più né esplosi né in un format: si tolgono
  const keep = new Set(hits.map((h) => h.id));
  for (const f of await listFormats()) for (const id of Object.keys(f.items || {})) keep.add(id);
  const old = ((await kv.hkeys(DESC).catch(() => [])) || []).filter((id) => !keep.has(id));
  if (old.length) await kv.hdel(DESC, ...old).catch(() => {});
  return { hits: hits.length, gb: doc.gb, accounts: doc.accounts };
}

// ---------- descrizioni AI ----------

export const spentThisMonth = async () => Number((await kv.get(SPEND(monthKey())).catch(() => 0)) || 0);

async function coverBase64(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 4_000_000 ? null : { type, b64: buf.toString("base64") };
  } catch { return null; } finally { clearTimeout(t); }
}

async function describeOne(h) {
  const img = await coverBase64(h.cover);
  if (!img) return { id: h.id, error: "copertina non leggibile (link scaduto?)" };
  const client = fakeAi() || new Anthropic();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1200,
    output_config: { format: { type: "json_schema", schema: DESC_SCHEMA } },
    system: DESC_SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: img.type, data: img.b64 } },
      { type: "text", text: descPrompt(h) },
    ] }],
  });
  const cost = costUSD(msg.model || AI_MODEL, msg.usage, { batch: false });
  await kv.incrbyfloat(SPEND(monthKey()), cost).then(() => kv.expire(SPEND(monthKey()), 120 * 86400)).catch(() => {});
  if (msg.stop_reason === "refusal") return { id: h.id, error: "l'AI non ha voluto leggere questa copertina", cost };
  let desc = null;
  try { desc = normalizeDesc(JSON.parse((msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""))); } catch {}
  if (!desc) return { id: h.id, error: "risposta dell'AI non leggibile", cost };
  await kv.hset(DESC, { [h.id]: JSON.stringify({ ...desc, at: Date.now(), model: msg.model || AI_MODEL }) });
  return { id: h.id, ok: true, cost };
}

/** Descrive i nuovi esplosi (o quelli indicati), dentro il tetto mensile. */
export async function describeHits({ max = DESC_PER_NIGHT, ids = null } = {}) {
  if (!aiConfigured()) return { skipped: "AI non configurata" };
  const doc = await loadHits();
  if (!doc) return { skipped: "archivio vuoto" };
  const described = new Set(ids ? [] : ((await kv.hkeys(DESC).catch(() => [])) || []));
  const pool = ids ? doc.hits.filter((h) => ids.includes(h.id)) : doc.hits;
  const todo = pickToDescribe(pool, described, max);
  let done = 0, cost = 0;
  const errors = [];
  for (let i = 0; i < todo.length; i += 5) {
    if ((await spentThisMonth()) >= AI_CAP_USD) { errors.push(`tetto mensile di ${AI_CAP_USD} $ raggiunto`); break; }
    const res = await Promise.all(todo.slice(i, i + 5).map((h) => describeOne(h).catch((e) => ({ id: h.id, error: e?.message || "errore" }))));
    for (const r of res) { cost += r.cost || 0; if (r.ok) done++; else errors.push(`${r.id}: ${r.error}`); }
  }
  return { described: done, usd: Math.round(cost * 1000) / 1000, errors: errors.slice(0, 5) };
}

// ---------- giro notturno ----------

export async function nightly({ force = false } = {}) {
  const last = parse(await kv.get(RUN).catch(() => null));
  if (!force && last?.ok && Date.now() - last.at < REFRESH_EVERY_H * 3_600_000) return { skipped: "già letto oggi" };
  const run = { at: Date.now() };
  try {
    Object.assign(run, await refreshHits(), { ok: true });
    run.ai = await describeHits();
  } catch (e) {
    run.ok = false;
    run.error = String(e?.message || e).slice(0, 300);
  }
  await kv.set(RUN, JSON.stringify(run), { ex: 40 * 86400 }).catch(() => {});
  return run;
}

/** «Rileggi adesso» dalla pagina: al massimo ogni 6 ore. */
export async function manualRefresh() {
  const last = parse(await kv.get(RUN).catch(() => null));
  if (last?.at && Date.now() - last.at < MANUAL_EVERY_H * 3_600_000) {
    const h = Math.ceil((MANUAL_EVERY_H * 3_600_000 - (Date.now() - last.at)) / 3_600_000);
    throw Object.assign(new Error(`Letto da poco: si può rileggere tra ${h} ${h === 1 ? "ora" : "ore"}`), { status: 429 });
  }
  return nightly({ force: true });
}

// ---------- format ----------

export async function listFormats() {
  const h = (await kv.hgetall(FORMATS).catch(() => null)) || {};
  return Object.values(h).map(parse).filter(Boolean);
}
async function getFormat(id) {
  const f = parse(await kv.hget(FORMATS, String(id)));
  if (!f) throw Object.assign(new Error("Format non trovato: forse è stato cancellato"), { status: 404 });
  return f;
}
const saveFormat = (f) => kv.hset(FORMATS, { [f.id]: JSON.stringify(f) });
async function hitById(id) {
  const doc = await loadHits();
  const h = doc?.hits.find((x) => x.id === String(id));
  if (!h) throw Object.assign(new Error("Reel non più nell'elenco: ricarica la pagina"), { status: 404 });
  return h;
}

export async function createFormat({ name, hitId }, by) {
  const n = parseFormatName(name);
  if (!n) throw Object.assign(new Error("Dai al format un nome di 3-80 caratteri («Domanda giudicante + reveal»)"), { status: 400 });
  const f = { id: randomUUID().slice(0, 8), name: n, note: null, items: {}, createdAt: Date.now(), by: by?.name || null };
  if (hitId) { const h = await hitById(hitId); f.items[h.id] = { ...snapshotHit(h), addedAt: Date.now(), addedBy: by?.name || null }; }
  await saveFormat(f);
  return { id: f.id };
}

export async function addToFormat({ id, hitId }, by) {
  const [f, h] = await Promise.all([getFormat(id), hitById(hitId)]);
  f.items = { ...(f.items || {}), [h.id]: { ...snapshotHit(h), addedAt: Date.now(), addedBy: by?.name || null } };
  await saveFormat(f);
  return { ok: true };
}

export async function removeFromFormat({ id, hitId }) {
  const f = await getFormat(id);
  delete f.items?.[String(hitId)];
  await saveFormat(f);
  return { ok: true };
}

export async function editFormat({ id, name, note }) {
  const f = await getFormat(id);
  if (name != null) {
    const n = parseFormatName(name);
    if (!n) throw Object.assign(new Error("Il nome va da 3 a 80 caratteri"), { status: 400 });
    f.name = n;
  }
  if (note != null) f.note = String(note).trim().slice(0, 400) || null;
  await saveFormat(f);
  return { ok: true };
}

export const deleteFormat = (id) => kv.hdel(FORMATS, String(id));

// ---------- tutto per la pagina ----------

export async function loadAll() {
  const [doc, descRaw, formats, runRaw, spent] = await Promise.all([
    loadHits(), kv.hgetall(DESC).catch(() => null), listFormats(), kv.get(RUN).catch(() => null), spentThisMonth(),
  ]);
  const desc = Object.fromEntries(Object.entries(descRaw || {}).map(([k, v]) => [k, parse(v)]));
  const hits = doc?.hits || [];
  const byId = new Map(hits.map((h) => [h.id, h]));
  const inFormat = {};
  for (const f of formats) for (const id of Object.keys(f.items || {})) (inFormat[id] ||= []).push(f.id);
  return {
    at: doc?.at || null,
    gb: doc?.gb ?? null,
    accounts: doc?.accounts || { int: 0, ours: 0 },
    hits: hits.map((h) => ({ ...h, desc: desc[h.id] || null, formats: inFormat[h.id] || [] })),
    auto: autoGroups(hits),
    formats: sortFormats(formats.map((f) => formatView(f, byId))).map((f) => ({
      ...f, items: f.items.map((it) => ({ ...it, desc: desc[it.id] || null })),
    })),
    run: parse(runRaw),
    spent: Math.round(spent * 100) / 100,
    cap: AI_CAP_USD,
  };
}
