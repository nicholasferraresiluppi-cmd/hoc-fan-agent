/**
 * Publisher X — archivio e query (27/10/2026). Logica del conto in publisher-x-core.js.
 *
 * Nata da una chat di Nicholas su come pagare chi pubblica su X per portare sub:
 * il warehouse ha già, per OGNI nuova sub, il link da cui è entrata e la spesa nei
 * primi 0/7/30 giorni (`hoc.newsubs_spending`, una riga per sub, verificato senza
 * doppioni; spesa al netto del 20% OnlyFans). Quindi il conto si fa fan per fan,
 * ognuno sui suoi 30 giorni, senza cambiare link ogni mese.
 *
 * KV `pubx:config` { rev, at, by, settings, fees, rates, links, people } — chi usa quale link, fee per
 * profilo (la fee vera vive nel conto dello split, cifrato per la contabilità: qui si
 * imposta a mano, serve solo al controllo interno), provvigione chatter, tariffa publisher
 * (una per tutti + eventuale tariffa per profilo), base mensile.
 * Sempre filtrato sull'organizzazione HOC (il warehouse è multi-agenzia).
 * Le BUSTE (27/10): ogni fan è una busta che si chiude al 30° giorno; un mese paga le buste
 * chiuse in quel mese. Tre viste: admin (tutto, nomi dei fan), HR (solo quanto si deve, niente
 * fee né nomi), publisher (solo le sue buste, fan in codice, niente fee). Una lettura delle
 * buste al giorno, condivisa dalle tre (cache KV per giorno e versione delle regole).
 * Costo misurato: ~0,06 GB per l'elenco link, ~0,02 GB per le buste.
 */
import { kv } from "@vercel/kv";
import { HOC_ORGANIZATION_ID, bqQuery, bqProjects } from "@/lib/bigquery-api";
import { createHmac } from "node:crypto";
import { sanitizeConfig, toEnvelopes, monthPayout, monthsHistory, publisherForEmails, profilesFor, fxFor, monthOf, linkKey, isXLink, feeFor, rateFor, splitDollar, WINDOW_DAYS } from "@/lib/publisher-x-core";
import { getFx } from "@/lib/referral";
import { linksSql as linksSqlFor, fansSql as fansSqlFor, untilSql as untilSqlFor, isMonth } from "@/lib/publisher-x-sql";

export const PUBX_VERSION = "pubx-1";
const CONFIG_KEY = "pubx:config";
const MAX_BYTES = 2 * 1024 ** 3;
const T = () => ({ table: `\`${bqProjects().dataProject}.hoc.newsubs_spending\``, org: HOC_ORGANIZATION_ID });
const linksSql = (month, links) => linksSqlFor(T(), month, links);
const fansSql = (since, links) => fansSqlFor(T(), since, links);
const untilSql = () => untilSqlFor(T());
const r2 = (n) => Math.round(n * 100) / 100;
/** Per una sub media del link: quanto va al publisher e quanto resta all'agenzia (interno). */
const perSub = (avgD30, fee, rate, settings) => {
  if (avgD30 === null) return { perSubToPublisher: null, perSubToAgency: null };
  const d = splitDollar(fee, rate, settings);
  return { perSubToPublisher: r2(avgD30 * d.rate), perSubToAgency: r2(avgD30 * d.agency) };
};
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

const day = () => new Date().toISOString().slice(0, 10);
const cacheKey = (kind, rev) => `pubx:${PUBX_VERSION}:${kind}:${rev}:${day()}`;
const LOOKBACK_MONTHS = 7;

/** Primo giorno del mese, N mesi fa (le buste che si chiudono nei mesi che la pagina mostra). */
function sinceDate(months = LOOKBACK_MONTHS) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1)).toISOString().slice(0, 10);
}

const toFan = (r) => ({
  creatorId: Number(r.creator_id), creatorName: r.creator_name || String(r.creator_id), linkName: r.link_name,
  userId: String(r.user_id), username: r.username || "", subStart: r.sub_start_at,
  d0: Number(r.spend_d0) || 0, d7: Number(r.spend_d7) || 0, d30: Number(r.spend_d30) || 0,
});

/** Tutte le buste dei link assegnati (una lettura al giorno per versione delle regole). */
async function loadEnvelopes(config, { force = false } = {}) {
  const ck = cacheKey("env", config.rev);
  let raw = force ? null : await kv.get(ck).catch(() => null);
  if (!raw) {
    const [fansRes, untilRes] = await Promise.all([
      config.links.length ? bqQuery(fansSql(sinceDate(), config.links), { maxBytesBilled: MAX_BYTES }) : Promise.resolve({ rows: [] }),
      bqQuery(untilSql(), { maxBytesBilled: MAX_BYTES }),
    ]);
    raw = { dataUntil: untilRes.rows[0]?.t || new Date(Date.now() - 86400000).toISOString(), fans: fansRes.rows.map(toFan) };
    await kv.set(ck, raw, { ex: 26 * 3600 }).catch(() => {});
  }
  return { dataUntil: raw.dataUntil, envelopes: toEnvelopes({ fans: raw.fans, config, dataUntil: raw.dataUntil }) };
}

const PAYOUT_FIELDS = ["name", "profiles", "subs", "spend30", "bonusUsd", "bonusEur", "baseEur", "totalEur", "openCount", "openBonusEur", "fx", "fxEstimated"];
/** Cambio dollaro→euro per mese, lo stesso di «Porta un collega» (inserito dall'HR). */
const loadFx = () => getFx().catch(() => ({}));
const pickFields = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/**
 * Conto del mese (mese = quando le buste si CHIUDONO).
 * view "full" (admin): + link X, regole, margine, persone. view "payout" (HR): solo quanto si deve.
 */
export async function getOverview(month, { force = false, view = "full" } = {}) {
  if (!isMonth(month)) throw new Error("mese non valido");
  const config = await getConfig();
  const [{ dataUntil, envelopes }, fxByMonth] = await Promise.all([loadEnvelopes(config, { force }), loadFx()]);
  const { publishers, fx, fxEstimated } = monthPayout({ envelopes, config, month, fxByMonth });
  const base = { version: PUBX_VERSION, month, computedAt: Date.now(), dataUntil, view, fx, fxEstimated };
  const current = monthOf(new Date().toISOString()) === month;
  if (view === "payout") {
    return { ...base, current, publishers: publishers.map((p) => pickFields(p, PAYOUT_FIELDS)) };
  }
  const lk = cacheKey(`links:${month}`, config.rev);
  let linkRows = force ? null : await kv.get(lk).catch(() => null);
  if (!linkRows) {
    linkRows = (await bqQuery(linksSql(month, config.links), { maxBytesBilled: MAX_BYTES })).rows;
    await kv.set(lk, linkRows, { ex: 26 * 3600 }).catch(() => {});
  }
  const assigned = new Map(config.links.map((l) => [linkKey(l.creatorId, l.linkName), l]));
  const links = linkRows.map((r) => {
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
      fee, rate: rateFor(config, creatorId), ...perSub(avgD30, fee, rateFor(config, creatorId), config.settings),
    };
  });
  // un link assegnato che non compare (nome sbagliato o niente sub da 6 mesi) resta visibile
  for (const l of config.links) {
    if (!links.some((x) => x.key === linkKey(l.creatorId, l.linkName))) {
      links.push({ key: linkKey(l.creatorId, l.linkName), creatorId: l.creatorId, creatorName: String(l.creatorId), linkName: l.linkName, linkUrl: null, isX: isXLink(l.linkName), publisher: l.publisher, from: l.from, subsMonth: 0, subs6m: 0, mature6m: 0, avgD7: null, avgD30: null, firstDay: null, lastDay: null, fee: feeFor(config, l.creatorId), rate: rateFor(config, l.creatorId), perSubToPublisher: null, perSubToAgency: null, missing: true });
    }
  }
  return {
    ...base, current, links,
    publishers: publishers.map(({ fans, ...p }) => ({ ...p, creators: [...new Set(fans.map((x) => x.creatorName))] })),
    config,
  };
}

/** Le buste di UN publisher nel mese, nominate (solo admin: la route registra ogni apertura). */
export async function getPublisherFans(month, publisher) {
  if (!isMonth(month)) throw new Error("mese non valido");
  const config = await getConfig();
  if (!config.links.some((l) => l.publisher === publisher)) throw new Error("Nessun link assegnato a questo publisher");
  const [{ dataUntil, envelopes }, fxByMonth] = await Promise.all([loadEnvelopes(config), loadFx()]);
  const mine = envelopes.filter((e) => e.publisher === publisher);
  const p = monthPayout({ envelopes: mine, config, month, fxByMonth }).publishers.find((x) => x.name === publisher);
  const open = mine.filter((e) => !e.closed).sort((a, b) => b.day - a.day);
  return { month, dataUntil, publisher: p, open };
}

/** Codice del fan per il publisher: stabile, non reversibile (HMAC con segreto del server). */
function fanCode(creatorId, userId) {
  const secret = process.env.ACADEMY_TAPE_SECRET || process.env.KV_REST_API_TOKEN || "pubx";
  return createHmac("sha256", secret).update(`pubx|${creatorId}|${userId}`).digest("hex").slice(0, 6).toUpperCase();
}

/**
 * La pagina del publisher: SOLO le sue buste, riconosciuto dall'email verificata dell'account.
 * Niente nome/username/id del fan (un codice), niente fee, niente altri publisher.
 */
export async function getMyPublisher(verifiedEmails = []) {
  const config = await getConfig();
  const name = publisherForEmails(config, verifiedEmails);
  if (!name) return { linked: false };
  const [{ dataUntil, envelopes }, fxByMonth] = await Promise.all([loadEnvelopes(config), loadFx()]);
  const mine = envelopes.filter((e) => e.publisher === name);
  const month = monthOf(new Date().toISOString());
  const { fx, fxEstimated } = fxFor(fxByMonth, month);
  const perProfile = config.settings.baseEurPerProfile;
  const myCreators = [...new Map(config.links.filter((l) => l.publisher === name).map((l) => [l.creatorId, l])).keys()];
  const nameOf = new Map(mine.map((e) => [e.creatorId, e.creatorName]));
  const rates = myCreators.map((id) => ({ profile: nameOf.get(id) || String(id), rate: rateFor(config, id) }));
  const cutoff = new Date(Date.now() - 100 * 86400000).toISOString(); // buste chiuse degli ultimi ~3 mesi + tutte le aperte
  return {
    linked: true, name, dataUntil, windowDays: WINDOW_DAYS,
    deal: { rate: config.settings.pubRate, perProfileEur: perProfile, profiles: profilesFor(config, name, month), rates },
    month, fx, fxEstimated,
    months: monthsHistory(mine, { config, publisher: name, fxByMonth }).slice(0, 6),
    open: { count: mine.filter((e) => !e.closed).length, bonusEur: r2(mine.filter((e) => !e.closed).reduce((s, e) => s + e.bonus, 0) * fx) },
    envelopes: mine.filter((e) => !e.closed || e.closeAt >= cutoff).map((e) => ({
      code: fanCode(e.creatorId, e.userId), profile: e.creatorName, entered: e.subStart, closeAt: e.closeAt,
      day: e.day, closed: e.closed, spent: e.spent, bonusEur: r2(e.bonus * fxFor(fxByMonth, e.closed ? e.closeMonth : month).fx), rate: e.rate,
    })),
  };
}

/** Invito in HOC Pro col solo ruolo «Publisher» (vede solo /me/publisher). */
export async function invitePublisher(name, actor, origin) {
  const config = await getConfig();
  const person = config.people?.[name];
  if (!person?.email) throw new Error("Scrivi e salva l'email del publisher prima di invitarlo");
  const { createInvitation } = await import("@/lib/invitations");
  let res;
  try {
    const inv = await createInvitation({ email: person.email, roles: ["publisher"], inviterId: actor.id, inviterName: actor.name, origin });
    res = { ok: true, url: inv.url || null };
  } catch (e) {
    if (e.code !== "exists") throw e;
    res = { ok: true, exists: true }; // ha già un account: vedrà la pagina accedendo con questa email
  }
  const cur = await getConfig();
  if (cur.people?.[name]) await saveConfig({ ...cur, people: { ...cur.people, [name]: { ...cur.people[name], invitedAt: Date.now() } } }, { by: actor.id });
  return res;
}
