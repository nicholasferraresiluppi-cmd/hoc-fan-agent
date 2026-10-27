/**
 * Publisher X — archivio e query (27/10/2026). Logica del conto in publisher-x-core.js.
 *
 * Nata da una chat di Nicholas su come pagare chi pubblica su X per portare sub:
 * il warehouse ha già, per OGNI nuova sub, il link da cui è entrata e la spesa nei
 * primi 0/7/30 giorni (`hoc.newsubs_spending`, una riga per sub, verificato senza
 * doppioni; spesa al netto del 20% OnlyFans). Quindi il conto si fa fan per fan,
 * ognuno sui suoi 30 giorni, senza cambiare link ogni mese.
 *
 * KV `pubx:config` { rev, at, by, settings, fees, links } — chi usa quale link, fee per
 * profilo (la fee vera vive nel conto dello split, cifrato per la contabilità: qui si
 * imposta a mano), provvigione chatter, quota publisher, base mensile.
 * Sempre filtrato sull'organizzazione HOC (il warehouse è multi-agenzia).
 * Costo misurato: ~0,06 GB per l'elenco link, ~0,01 GB per il conto di un mese.
 */
import { kv } from "@vercel/kv";
import { HOC_ORGANIZATION_ID, bqQuery, bqProjects } from "@/lib/bigquery-api";
import { sanitizeConfig, computeMonth, linkKey, isXLink, feeFor, publisherRate, monthClosesOn } from "@/lib/publisher-x-core";
import { linksSql as linksSqlFor, fansSql as fansSqlFor, untilSql as untilSqlFor, isMonth } from "@/lib/publisher-x-sql";

export const PUBX_VERSION = "pubx-1";
const CONFIG_KEY = "pubx:config";
const MAX_BYTES = 2 * 1024 ** 3;
const T = () => ({ table: `\`${bqProjects().dataProject}.hoc.newsubs_spending\``, org: HOC_ORGANIZATION_ID });
const linksSql = (month, links) => linksSqlFor(T(), month, links);
const fansSql = (month, links) => fansSqlFor(T(), month, links);
const untilSql = () => untilSqlFor(T());
const num = (v) => (v === null || v === undefined ? null : Number(v));

export class ConflictError extends Error {}

export async function getConfig() {
  const raw = await kv.get(CONFIG_KEY).catch(() => null);
  return raw ? { rev: raw.rev || 0, at: raw.at || null, by: raw.by || null, ...sanitizeConfig(raw) } : { rev: 0, at: null, by: null, ...sanitizeConfig({}) };
}

export async function saveConfig(input, { by, expectRev = null }) {
  const cur = await getConfig();
  if (expectRev !== null && Number(expectRev) !== Number(cur.rev || 0)) throw new ConflictError("Qualcun altro ha salvato nel frattempo: ricarica la pagina.");
  const doc = { rev: (cur.rev || 0) + 1, at: Date.now(), by: by || null, ...sanitizeConfig(input) };
  await kv.set(CONFIG_KEY, doc);
  return doc;
}

const cacheKey = (kind, month, rev) => `pubx:${PUBX_VERSION}:${kind}:${month}:${rev}:${new Date().toISOString().slice(0, 10)}`;

/** Elenco link + conto del mese (aggregati per publisher, senza i nomi dei fan). */
export async function getOverview(month, { force = false } = {}) {
  if (!isMonth(month)) throw new Error("mese non valido");
  const config = await getConfig();
  const ck = cacheKey("ov", month, config.rev);
  if (!force) {
    const hit = await kv.get(ck).catch(() => null);
    if (hit) return { ...hit, config, cached: true };
  }
  const [linksRes, fansRes] = await Promise.all([
    bqQuery(linksSql(month, config.links), { maxBytesBilled: MAX_BYTES }),
    config.links.length ? bqQuery(fansSql(month, config.links), { maxBytesBilled: MAX_BYTES }) : Promise.resolve({ rows: [] }),
  ]);
  const dataUntil = linksRes.rows[0]?.data_until || new Date(Date.now() - 86400000).toISOString();
  const assigned = new Map(config.links.map((l) => [linkKey(l.creatorId, l.linkName), l]));
  const links = linksRes.rows.map((r) => {
    const creatorId = Number(r.creator_id);
    const a = assigned.get(linkKey(creatorId, r.link_name));
    const fee = feeFor(config, creatorId);
    const avgD30 = num(r.avg_d30);
    return {
      key: linkKey(creatorId, r.link_name), creatorId, creatorName: r.creator_name || String(creatorId),
      linkName: r.link_name, linkUrl: r.link_url || null, isX: isXLink(r.link_name),
      publisher: a?.publisher || null, from: a?.from || null,
      subsMonth: Number(r.subs_month) || 0, subs6m: Number(r.subs_6m) || 0, mature6m: Number(r.mature_6m) || 0,
      avgD7: num(r.avg_d7), avgD30, firstDay: r.first_day, lastDay: r.last_day,
      fee, perSubToPublisher: avgD30 === null ? null : Math.round(avgD30 * publisherRate(fee, config.settings).rate * 100) / 100,
    };
  });
  // un link assegnato che non compare (nome sbagliato o niente sub da 6 mesi) resta visibile
  for (const l of config.links) {
    if (!links.some((x) => x.key === linkKey(l.creatorId, l.linkName))) {
      links.push({ key: linkKey(l.creatorId, l.linkName), creatorId: l.creatorId, creatorName: String(l.creatorId), linkName: l.linkName, linkUrl: null, isX: isXLink(l.linkName), publisher: l.publisher, from: l.from, subsMonth: 0, subs6m: 0, mature6m: 0, avgD7: null, avgD30: null, firstDay: null, lastDay: null, fee: feeFor(config, l.creatorId), perSubToPublisher: null, missing: true });
    }
  }
  const fans = fansRes.rows.map(toFan);
  const { publishers, unassigned } = computeMonth({ fans, config, dataUntil });
  const out = {
    version: PUBX_VERSION, month, computedAt: Date.now(), dataUntil, closesOn: monthClosesOn(month),
    links,
    publishers: publishers.map(({ fans: f, ...p }) => ({ ...p, creators: [...new Set(f.map((x) => x.creatorName))] })),
    unassigned,
  };
  await kv.set(ck, out, { ex: 26 * 3600 }).catch(() => {});
  return { ...out, config };
}

const toFan = (r) => ({
  creatorId: Number(r.creator_id), creatorName: r.creator_name || String(r.creator_id), linkName: r.link_name,
  userId: String(r.user_id), username: r.username || "", subStart: r.sub_start_at,
  d0: Number(r.spend_d0) || 0, d7: Number(r.spend_d7) || 0, d30: Number(r.spend_d30) || 0,
});

/** I fan di UN publisher nel mese, nominati (la route registra ogni apertura). */
export async function getPublisherFans(month, publisher) {
  if (!isMonth(month)) throw new Error("mese non valido");
  const config = await getConfig();
  const links = config.links.filter((l) => l.publisher === publisher);
  if (!links.length) throw new Error("Nessun link assegnato a questo publisher");
  const ck = cacheKey(`fans:${publisher}`, month, config.rev);
  const hit = await kv.get(ck).catch(() => null);
  if (hit) return { ...hit, cached: true };
  const [fansRes, untilRes] = await Promise.all([
    bqQuery(fansSql(month, links), { maxBytesBilled: MAX_BYTES }),
    bqQuery(untilSql(), { maxBytesBilled: MAX_BYTES }),
  ]);
  const dataUntil = untilRes.rows[0]?.t || new Date(Date.now() - 86400000).toISOString();
  const { publishers } = computeMonth({ fans: fansRes.rows.map(toFan), config, dataUntil });
  const p = publishers.find((x) => x.name === publisher) || { name: publisher, fans: [], subs: 0, spend30: 0, value: 0, bonus: 0, base: config.settings.baseUsd, total: config.settings.baseUsd, immature: 0, final: true };
  const out = { month, dataUntil, closesOn: monthClosesOn(month), publisher: p };
  await kv.set(ck, out, { ex: 26 * 3600 }).catch(() => {});
  return out;
}
