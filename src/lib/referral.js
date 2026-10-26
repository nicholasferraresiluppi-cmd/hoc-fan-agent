/**
 * «Porta un collega» — lato server del programma referral (26/10/2026).
 * Regole e calcoli in referral-core.js (puro). Qui: KV, venduto Infloww, viste.
 *
 * KV (namespace isolato `referral:*`, HASH = una scrittura per voce, niente
 * documento unico che due persone si sovrascrivono):
 *   referral:referrers  HASH id → referente {name, email, phone, note, userId?}
 *   referral:recruits   HASH id → persona portata {referrerId, name, date degli step…}
 *   referral:stories    HASH id → storie Instagram {referrerId, agreedAt, publishedAt[]}
 *   referral:paid       HASH chiave voce → pagamento congelato {amountEur, amountUsd, paidAt, by}
 *   referral:sales:{YYYY-MM}  venduto Infloww del mese per nome {builtAt, map} (piccolo)
 *   referral:shifts:{YYYY-MM} date dei turni iniziati per nome, da CreatorsPro {builtAt, map}
 *   referral:fx         HASH mese → cambio dollaro→euro inserito dall'HR
 *   referral:audit      LIST cap 500 — chi ha fatto cosa
 *
 * Il venduto si legge da `ops_kpi:monthly:{mese}` (~360 KB) UNA volta per
 * import: la mappa {nome: venduto} si ricostruisce solo se l'import di quel
 * mese è più recente della mappa (lezione banda KV 4/10/2026).
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import {
  REFERRAL_RULES, validateReferrer, validateRecruit, validateStory, findDuplicateRecruit,
  recruitMilestones, storyMilestone, recruitSteps, summarize, referrerView,
  salesMapFromKpiRows, salesFor, monthsSince, normEmail, normName, shiftDatesFromWages, parseFx, addMonths, recruitMetrics, buildDashboard,
} from "@/lib/referral-core";

const K = {
  referrers: "referral:referrers",
  recruits: "referral:recruits",
  stories: "referral:stories",
  paid: "referral:paid",
  audit: "referral:audit",
  fx: "referral:fx",
  sales: (m) => `referral:sales:${m}`,
  shifts: (m) => `referral:shifts:${m}`,
};

const newId = (p) => `${p}_${randomBytes(6).toString("hex")}`;
const todayRome = (now = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(now));

function parse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}
async function readHash(key) {
  const h = (await kv.hgetall(key)) || {};
  return Object.entries(h).map(([id, v]) => {
    const o = parse(v);
    return o ? { ...o, id } : null;
  }).filter(Boolean);
}
async function readOne(key, id) {
  const v = await kv.hget(key, id);
  const o = parse(v);
  return o ? { ...o, id } : null;
}
const writeOne = (key, id, obj) => {
  const { id: _drop, ...rest } = obj;
  return kv.hset(key, { [id]: JSON.stringify(rest) });
};

export async function audit(actor, action, detail = {}) {
  try {
    await kv.lpush(K.audit, JSON.stringify({ at: Date.now(), actor: actor?.id || null, actorName: actor?.name || null, action, ...detail }));
    await kv.ltrim(K.audit, 0, 499);
  } catch {}
}

// ── Venduto Infloww per mese ────────────────────────────────────────────────

/** {nome: venduto} del mese, o null se il mese non è stato importato. */
export async function getMonthSales(month) {
  const [cached, importedAt] = await Promise.all([
    kv.get(K.sales(month)).catch(() => null),
    kv.zscore("ops_kpi:imports", `monthly:${month}`).catch(() => null),
  ]);
  if (importedAt == null) return null;
  const c = parse(cached);
  if (c && c.builtAt >= Number(importedAt)) return c.map || {};
  const rows = (await kv.get(`ops_kpi:monthly:${month}`).catch(() => null)) || [];
  const map = salesMapFromKpiRows(Array.isArray(rows) ? rows : []);
  await kv.set(K.sales(month), JSON.stringify({ builtAt: Date.now(), map }), { ex: 400 * 24 * 3600 }).catch(() => {});
  return map;
}

/** Nomi Infloww dell'ultimo mese importato, per la tendina dell'HR. */
export async function listInflowwNames() {
  const periods = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true }).catch(() => [])) || [];
  const months = periods.map(String).filter((p) => p.startsWith("monthly:")).map((p) => p.slice(8)).sort().reverse().slice(0, 2);
  const names = new Set();
  for (const m of months) {
    const map = await getMonthSales(m);
    for (const n of Object.keys(map || {})) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "it"));
}

/** Venduto per mese di ogni persona portata, dal mese del primo turno a oggi: { recruitId: { "YYYY-MM": venduto|null } }. */
async function salesForRecruits(recruits, { now = Date.now() } = {}) {
  const today = todayRome(now);
  const monthsOf = (r) => (r.inflowwName ? monthsSince(r.firstShiftAt, today) : []);
  const need = new Set(recruits.flatMap(monthsOf));
  const maps = {};
  for (const m of need) maps[m] = await getMonthSales(m);
  const out = {};
  for (const r of recruits) {
    out[r.id] = {};
    for (const m of monthsOf(r)) out[r.id][m] = salesFor(maps[m], r.inflowwName);
  }
  return out;
}

// ── Turni da CreatorsPro ────────────────────────────────────────────────────
//
// Le buste CP di un mese sono pesanti (lezione banda 4/10): se ne tiene una
// mappa piccola {nome: [date dei turni]} e la si ricostruisce solo se vecchia
// (12 ore per il mese in corso e quello prima, che la sync notturna aggiorna;
// 30 giorni per i mesi più vecchi, che non cambiano più).
async function getMonthShiftDates(month, { now = Date.now() } = {}) {
  const c = parse(await kv.get(K.shifts(month)).catch(() => null));
  const cur = todayRome(now).slice(0, 7);
  const fresh = month >= addMonths(cur, -1) ? 12 * 3600e3 : 30 * 24 * 3600e3;
  if (c && now - c.builtAt < fresh) return c.map || {};
  const { getWages } = await import("@/lib/cp-wages-store");
  const [wages, mapping] = await Promise.all([getWages(month).catch(() => null), kv.get("cp:member_mapping").catch(() => null)]);
  if (!wages) return c?.map || null;
  const map = shiftDatesFromWages(wages, mapping || {}, now);
  await kv.set(K.shifts(month), JSON.stringify({ builtAt: now, map }), { ex: 400 * 24 * 3600 }).catch(() => {});
  return map;
}

/** Date dei turni di ogni persona portata dal primo turno a oggi: { recruitId: [date] | null }. */
async function shiftsForRecruits(recruits, { now = Date.now() } = {}) {
  const monthsOf = (r) => (!r.inflowwName || Number.isInteger(r.shiftsManual) ? [] : monthsSince(r.firstShiftAt, todayRome(now)));
  const need = new Set(recruits.flatMap(monthsOf));
  const maps = {};
  for (const m of need) maps[m] = await getMonthShiftDates(m, { now });
  const out = {};
  for (const r of recruits) {
    const months = monthsOf(r);
    if (!months.length) { out[r.id] = null; continue; }
    const key = normName(r.inflowwName);
    // nessun mese leggibile = non letti (mai «zero turni» per un dato mancante)
    if (months.every((m) => !maps[m])) { out[r.id] = null; continue; }
    out[r.id] = months.flatMap((m) => maps[m]?.[key] || []);
  }
  return out;
}

export async function getFx() {
  const h = (await kv.hgetall(K.fx).catch(() => null)) || {};
  const out = {};
  for (const [m, v] of Object.entries(h)) { const x = parseFx(v); if (x != null) out[m] = x; }
  return out;
}

export async function setFx(month, rate, actor) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw new Error("Mese non valido");
  if (rate === "" || rate == null) {
    await kv.hdel(K.fx, month);
    await audit(actor, "fx.clear", { month });
    return null;
  }
  const x = parseFx(rate);
  if (x == null) throw new Error("Cambio non valido: scrivi quanti euro vale 1 dollaro (es. 0,86)");
  await kv.hset(K.fx, { [month]: String(x) });
  await audit(actor, "fx.set", { month, rate: x });
  return x;
}

// ── Stato completo (HR) ─────────────────────────────────────────────────────

async function readPaid() {
  const h = (await kv.hgetall(K.paid)) || {};
  const out = {};
  for (const [k, v] of Object.entries(h)) { const o = parse(v); if (o) out[k] = o; }
  return out;
}

export async function loadState({ now = Date.now() } = {}) {
  const [referrers, recruits, stories, paid, fx] = await Promise.all([readHash(K.referrers), readHash(K.recruits), readHash(K.stories), readPaid(), getFx()]);
  const today = todayRome(now);
  const [sales, shifts] = await Promise.all([salesForRecruits(recruits, { now }), shiftsForRecruits(recruits, { now })]);
  const recruitRows = recruits.map((r) => {
    const milestones = recruitMilestones(r, { today, salesByMonth: sales[r.id] || {}, shiftDates: shifts[r.id], fx, paid });
    return { ...r, milestones, steps: recruitSteps(r, milestones, { today }), totals: summarize(milestones), metrics: recruitMetrics(r, { salesByMonth: sales[r.id] || {}, shiftDates: shifts[r.id] }) };
  });
  const storyRows = stories.map((st) => ({ ...st, milestone: storyMilestone(st, { today, paid }) }));
  const referrerRows = referrers.map((ref) => {
    const mine = recruitRows.filter((r) => r.referrerId === ref.id);
    const myStories = storyRows.filter((s) => s.referrerId === ref.id);
    const all = [...mine.flatMap((r) => r.milestones), ...myStories.map((s) => s.milestone)];
    return { ...ref, recruitCount: mine.length, storyCount: myStories.length, totals: summarize(all) };
  });
  // da pagare = voci maturate e non ancora pagate, per persona
  const toPay = [];
  for (const r of recruitRows) for (const m of r.milestones) if (m.status === "maturato") toPay.push({ ...m, recruitId: r.id, recruitName: r.name, referrerId: r.referrerId });
  for (const s of storyRows) if (s.milestone.status === "maturato") toPay.push({ ...s.milestone, referrerId: s.referrerId });
  // mesi delle provvigioni già calcolabili: l'HR ci mette il cambio
  const fxMonths = [...new Set(recruitRows.flatMap((r) => r.milestones.filter((m) => m.kind === "commission" && m.amountUsd != null && (m.status === "maturato" || m.fxMissing === false && m.status === "pagato")).map((m) => m.month)))].sort();
  const dashboard = buildDashboard({ referrers, recruits: recruitRows, stories: storyRows, fx, today });
  return { rules: REFERRAL_RULES, today, fx, fxMonths, referrers: referrerRows, recruits: recruitRows, stories: storyRows, toPay, dashboard };
}

/** Suggerimenti dal CRM persone: chi ha scritto «Me l'ha consigliato qualcuno» e non è ancora nel programma. */
export async function crmSuggestions(recruits) {
  try {
    const { listPeople } = await import("@/lib/hr-people");
    const { SOURCE_REFERRAL, fullName } = await import("@/lib/hr-people-core");
    const people = await listPeople();
    const taken = new Set(recruits.map((r) => r.hrPersonId).filter(Boolean));
    const takenNames = new Set(recruits.map((r) => normName(r.name)));
    return people
      .filter((p) => p?.fields?.source === SOURCE_REFERRAL && !taken.has(p.id) && !takenNames.has(normName(fullName(p.fields))))
      .map((p) => ({ hrPersonId: p.id, name: fullName(p.fields), referredBy: p.fields.referredBy || null, phase: p.fields.collaborationStatus || null, createdAt: p.createdAt || null }))
      .slice(0, 100);
  } catch {
    return [];
  }
}

// ── Scritture (HR) ──────────────────────────────────────────────────────────

export async function saveReferrer({ id = null, input, actor }) {
  const v = validateReferrer(input);
  if (v.error) throw new Error(v.error);
  const all = await readHash(K.referrers);
  if (v.value.email && all.some((r) => r.id !== id && r.email === v.value.email)) throw new Error("C'è già un referente con questa email");
  const prev = id ? all.find((r) => r.id === id) : null;
  if (id && !prev) throw new Error("Referente non trovato");
  const rid = id || newId("rf");
  const rec = { ...(prev || { createdAt: Date.now(), createdBy: actor?.name || null }), ...v.value, updatedAt: Date.now() };
  // cambiando email si stacca l'account collegato: si ricollega al prossimo accesso con la nuova
  if (prev && prev.email !== v.value.email) rec.userId = null;
  await writeOne(K.referrers, rid, rec);
  await audit(actor, id ? "referrer.update" : "referrer.create", { id: rid, name: rec.name });
  return { ...rec, id: rid };
}

export async function deleteReferrer(id, actor) {
  const [recruits, stories] = await Promise.all([readHash(K.recruits), readHash(K.stories)]);
  if (recruits.some((r) => r.referrerId === id) || stories.some((s) => s.referrerId === id)) {
    throw new Error("Ha persone o storie collegate: toglile prima");
  }
  await kv.hdel(K.referrers, id);
  await audit(actor, "referrer.delete", { id });
}

export async function saveRecruit({ id = null, input, actor }) {
  const v = validateRecruit(input);
  if (v.error) throw new Error(v.error);
  const [refs, recruits] = await Promise.all([readHash(K.referrers), readHash(K.recruits)]);
  if (!refs.some((r) => r.id === v.value.referrerId)) throw new Error("Referente non trovato");
  const dup = findDuplicateRecruit(recruits, v.value, id);
  if (dup) throw new Error(`${dup.name} è già stata portata da qualcuno: una persona ha un solo referente`);
  // un referente non porta sé stesso
  const ref = refs.find((r) => r.id === v.value.referrerId);
  if (normName(ref.name) === normName(v.value.name)) throw new Error("Non si può portare sé stessi");
  const prev = id ? recruits.find((r) => r.id === id) : null;
  if (id && !prev) throw new Error("Persona non trovata");
  if (prev && prev.referrerId !== v.value.referrerId) {
    // cambiare referente dopo un pagamento sposterebbe soldi già dati
    const paid = await readPaid();
    if (Object.keys(paid).some((k) => k.startsWith(`${id}:`))) throw new Error("Ci sono già premi pagati: il referente non si può più cambiare");
  }
  const rid = id || newId("rc");
  const rec = { ...(prev || { createdAt: Date.now(), createdBy: actor?.name || null }), ...v.value, updatedAt: Date.now() };
  await writeOne(K.recruits, rid, rec);
  await audit(actor, id ? "recruit.update" : "recruit.create", { id: rid, name: rec.name });
  return { ...rec, id: rid };
}

export async function deleteRecruit(id, actor) {
  const paid = await readPaid();
  if (Object.keys(paid).some((k) => k.startsWith(`${id}:`))) throw new Error("Ci sono premi già pagati su questa persona: non si cancella (segna l'uscita)");
  await kv.hdel(K.recruits, id);
  await audit(actor, "recruit.delete", { id });
}

export async function saveStory({ id = null, input, actor }) {
  const v = validateStory(input);
  if (v.error) throw new Error(v.error);
  const refs = await readHash(K.referrers);
  if (!refs.some((r) => r.id === v.value.referrerId)) throw new Error("Referente non trovato");
  const prev = id ? await readOne(K.stories, id) : null;
  if (id && !prev) throw new Error("Storie non trovate");
  const sid = id || newId("st");
  const rec = { ...(prev || { createdAt: Date.now(), createdBy: actor?.name || null }), ...v.value, updatedAt: Date.now() };
  await writeOne(K.stories, sid, rec);
  await audit(actor, id ? "story.update" : "story.create", { id: sid });
  return { ...rec, id: sid };
}

export async function deleteStory(id, actor) {
  const paid = await readPaid();
  if (paid[`story:${id}`]) throw new Error("Premio già pagato: non si cancella");
  await kv.hdel(K.stories, id);
  await audit(actor, "story.delete", { id });
}

/** Segna pagata una voce MATURATA, congelando l'importo di adesso. */
export async function markPaid(key, actor, { now = Date.now() } = {}) {
  const state = await loadState({ now });
  const m = state.toPay.find((x) => x.key === key);
  if (!m) throw new Error("Questa voce non è da pagare (non maturata o già pagata)");
  if (m.amountEur == null) throw new Error(`Manca il cambio dollaro→euro di ${m.month}: inseriscilo prima di pagare`);
  const rec = { amountEur: m.amountEur, amountUsd: m.amountUsd ?? null, paidAt: todayRome(now), by: actor?.name || null, at: now };
  // HSETNX: due clic in contemporanea non pagano due volte
  const ok = await kv.hsetnx(K.paid, key, JSON.stringify(rec));
  if (!ok) throw new Error("Già segnata come pagata");
  await audit(actor, "paid.mark", { key, amountEur: rec.amountEur });
  return rec;
}

export async function unmarkPaid(key, actor) {
  await kv.hdel(K.paid, key);
  await audit(actor, "paid.unmark", { key });
}

export async function listAudit(limit = 50) {
  const rows = (await kv.lrange(K.audit, 0, limit - 1).catch(() => [])) || [];
  return rows.map(parse).filter(Boolean);
}

// ── Vista del referente ─────────────────────────────────────────────────────

/**
 * Il referente collegato all'utente: per userId già collegato, altrimenti per
 * email VERIFICATA dell'account (al primo abbinamento si salva lo userId).
 */
export async function findReferrerForUser({ userId, verifiedEmails = [] }) {
  const refs = await readHash(K.referrers);
  const byId = refs.find((r) => r.userId && r.userId === userId);
  if (byId) return byId;
  const emails = new Set(verifiedEmails.map(normEmail).filter(Boolean));
  const hits = refs.filter((r) => r.email && emails.has(r.email) && !r.userId);
  if (hits.length !== 1) return null;
  const ref = hits[0];
  await writeOne(K.referrers, ref.id, { ...ref, userId, linkedAt: Date.now() }).catch(() => {});
  return { ...ref, userId };
}

export async function referrerDashboard(referrer, { now = Date.now() } = {}) {
  const state = await loadState({ now });
  const recruits = state.recruits.filter((r) => r.referrerId === referrer.id)
    .map((r) => referrerView(r, r.milestones, r.steps))
    .sort((a, b) => (b.totals.guadagnato + b.totals.in_corso) - (a.totals.guadagnato + a.totals.in_corso));
  const stories = state.stories.filter((s) => s.referrerId === referrer.id).map((s) => ({
    id: s.id, agreedAt: s.agreedAt, published: s.publishedAt.length, ...s.milestone,
  }));
  const all = [...recruits.flatMap((r) => r.milestones), ...stories];
  return { rules: state.rules, today: state.today, name: referrer.name, recruits, stories, totals: summarize(all) };
}

/** Invito in HOC Pro col solo ruolo «Referente» (vede solo /me/porta-un-collega). */
export async function inviteReferrer(referrerId, actor, origin) {
  const ref = await readOne(K.referrers, referrerId);
  if (!ref) throw new Error("Referente non trovato");
  if (!ref.email) throw new Error("Serve l'email del referente per invitarlo");
  const { createInvitation } = await import("@/lib/invitations");
  try {
    const inv = await createInvitation({ email: ref.email, roles: ["referente"], inviterId: actor.id, inviterName: actor.name, origin });
    await writeOne(K.referrers, referrerId, { ...ref, invitedAt: Date.now() });
    await audit(actor, "referrer.invite", { id: referrerId });
    return { ok: true, url: inv.url || null };
  } catch (e) {
    // ha già un account: vedrà la pagina accedendo con questa email, nessun invito serve
    if (e.code === "exists") return { ok: true, exists: true };
    throw e;
  }
}
