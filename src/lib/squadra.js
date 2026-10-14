/**
 * Squadra — lettura dati, calcolo notturno e contatti (14/10/2026).
 * La logica sta in squadra-core.js (puro, testato); qui solo I/O su KV.
 *
 * Calcolo: una volta a notte dal dispatcher (/api/cron/squadra) → KV
 * `squadra:data:{versione}`. La pagina legge SOLO quella chiave (piccola):
 * le wage CP sono pesanti (incidente banda Upstash del 04/10) e non si leggono
 * mai all'apertura della pagina. Se la chiave manca, la GET avvia UN calcolo
 * (lock single-flight) e la pagina mostra "sto calcolando".
 *
 * Anzianità: mesi con turni nelle wage CP. I mesi CHIUSI non cambiano più →
 * si salvano una volta in `squadra:tenure:{mese}` (elenco membri con turni) e
 * non si rileggono; ogni notte si rileggono solo i 3 mesi della finestra.
 *
 * Contatti per la partita IVA: hash `squadra:contatti` (campo = chiave del
 * nome, valore = {stato, nota, at, by}). Globale, non per split: una persona è
 * la stessa in ogni split.
 */
import { kv } from "@vercel/kv";
import { getWages } from "@/lib/cp-wages-store";
import {
  SQUADRA_VERSION, MIN_HOURS_MONTH, rankPeriod, matchName, nameKey, monthRange, shiftMonth,
} from "@/lib/squadra-core";

const DATA_KEY = `squadra:data:${SQUADRA_VERSION}`;
const LOCK_KEY = "squadra:lock";
const TENURE_KEY = (m) => `squadra:tenure:${m}`;
export const CONTACTS_KEY = "squadra:contatti";
const TENURE_MONTHS = 13; // da ott 2025 l'archivio wage è completo
export const STALE_AFTER_H = 30;

export const CONTACT_STATES = ["", "da_contattare", "contattato", "aperta", "no"];

const ROME_YM = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
export function currentMonthRome(now = Date.now()) {
  const p = ROME_YM.formatToParts(new Date(now));
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}`;
}

function shiftsFromWages(wages) {
  const seen = new Set();
  const out = [];
  for (const w of wages || []) {
    for (const s of w.shifts || []) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        member_id: w.member_id,
        member_name: w.member_name,
        start: String(s.started_at || ""),
        h: Number(s.worked_hours) || 0,
        bucket: s.interval_bucket || null,
        creator_ids: Array.isArray(s.creator_ids) ? s.creator_ids : [],
      });
    }
  }
  return out;
}

/** Membri con almeno un turno nel mese: [{mid, nm}]. */
function activeMembers(wages) {
  const m = new Map();
  for (const w of wages || []) if (Number(w.total_worked_shifts) > 0) m.set(w.member_id, w.member_name);
  return [...m].map(([mid, nm]) => ({ mid, nm }));
}

async function tenureMonth(month, loaded) {
  if (loaded) return activeMembers(loaded);
  const cached = await kv.get(TENURE_KEY(month));
  if (Array.isArray(cached)) return cached;
  const wages = await getWages(month);
  const list = wages ? activeMembers(wages) : [];
  if (wages) await kv.set(TENURE_KEY(month), list, { ex: 500 * 24 * 3600 });
  return list;
}

/** Calcolo completo. Restituisce il documento salvato in KV. */
export async function computeSquadra({ now = Date.now() } = {}) {
  const cur = currentMonthRome(now);
  const months = [shiftMonth(cur, -2), shiftMonth(cur, -1), cur];
  const [m2, m1] = [months[0], months[1]];

  const [mapping, ...kpiByMonth] = await Promise.all([
    kv.get("cp:member_mapping"),
    ...months.map((m) => kv.get(`ops_kpi:monthly:${m}`)),
  ]);
  const rows = [];
  months.forEach((m, i) => (Array.isArray(kpiByMonth[i]) ? kpiByMonth[i] : []).forEach((r) => rows.push({ ...r, _m: m })));

  const wagesByMonth = {};
  for (const m of months) wagesByMonth[m] = (await getWages(m)) || [];
  // il calendario si ferma al giorno dell'ultimo export Infloww del mese in corso:
  // ore e vendite devono coprire gli stessi giorni
  const importedAt = await kv.zscore("ops_kpi:imports", `monthly:${cur}`).catch(() => null);
  const cutoff = importedAt ? new Date(Number(importedAt)).toISOString().slice(0, 10) : null;
  const allShifts = months.flatMap((m) => shiftsFromWages(wagesByMonth[m]));
  const shifts = allShifts.filter((s) => !cutoff || s.start.slice(0, 10) <= cutoff);

  // nome Infloww di ogni membro CP (memo per member_id)
  const opNames = [...new Set(rows.map((r) => r.employee).filter(Boolean))];
  const memo = new Map();
  const resolveMember = (mid, nm) => {
    if (memo.has(mid)) return memo.get(mid);
    const cpName = (mapping && mapping[mid]) || nm;
    const hit = opNames.includes(cpName) ? cpName : matchName(cpName, opNames);
    memo.set(mid, hit);
    return hit;
  };
  const resolve = (s) => resolveMember(s.member_id, s.member_name);

  const full = rankPeriod(rows, shifts, resolve);
  const byMonth = {};
  for (const m of [m2, m1]) {
    byMonth[m] = rankPeriod(rows.filter((r) => r._m === m), shifts.filter((s) => s.start.startsWith(m)), resolve);
  }

  // anzianità
  const tenure = new Map();
  for (const m of monthRange(shiftMonth(cur, -(TENURE_MONTHS - 1)), cur)) {
    const list = await tenureMonth(m, months.includes(m) ? wagesByMonth[m] : null);
    const names = new Set(list.map((x) => resolveMember(x.mid, x.nm)).filter(Boolean));
    for (const n of names) tenure.set(n, (tenure.get(n) || 0) + 1);
  }

  // busta del mese scorso
  const busta = new Map();
  for (const w of wagesByMonth[m1]) {
    const n = resolveMember(w.member_id, w.member_name);
    if (!n) continue;
    const b = busta.get(n) || { total: 0, status: new Set() };
    b.total += Number(w.total_wage) || 0;
    if (w.status) b.status.add(w.status);
    busta.set(n, b);
  }

  // ultimo turno
  const lastShift = new Map();
  for (const s of allShifts) {
    const n = resolve(s);
    if (n && s.start > (lastShift.get(n) || "")) lastShift.set(n, s.start);
  }

  // bravura del mese solo con abbastanza ore Infloww in quel mese
  const monthIdx = (m, name) => ((byMonth[m].ops.get(name)?.h || 0) >= MIN_HOURS_MONTH ? byMonth[m].cmp.get(name)?.idx ?? null : null);
  const r2 = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  const out = [];
  for (const [name, o] of full.ops) {
    const c = full.cmp.get(name);
    const b = busta.get(name);
    out.push({
      name,
      idx: r2(c?.idx),
      exp: r2(c?.exp, 0),
      sph: o.sph == null ? null : r2(o.sph, 0),
      h: Math.round(o.h),
      cp_h: c ? Math.round(c.cp_h) : 0,
      crs: c ? Object.fromEntries(Object.entries(c.crs).map(([k, v]) => [k, r2(v, 3)])) : {},
      night: c ? r2(c.night, 2) : null,
      few_peers: Boolean(c?.few_peers),
      m2: r2(monthIdx(m2, name)),
      m1: r2(monthIdx(m1, name)),
      tenure: tenure.get(name) || null,
      ppv_price: r2(o.ppv_price, 0),
      cvr: r2(o.cvr, 4),
      rt: r2(o.rt, 0),
      busta: b ? Math.round(b.total) : null,
      busta_status: b ? [...b.status] : [],
      last_shift: (lastShift.get(name) || "").slice(0, 10) || null,
    });
  }

  const doc = {
    version: SQUADRA_VERSION,
    generated_at: new Date(now).toISOString(),
    months: { window: months, m2, m1, cur, busta: m1, infloww_until: cutoff },
    tenure_from: shiftMonth(cur, -(TENURE_MONTHS - 1)),
    counts: { operators: out.length, compared: out.filter((x) => x.idx != null).length, kpi_rows: rows.length, shifts: shifts.length },
    rows: out,
  };
  await kv.set(DATA_KEY, doc, { ex: 4 * 24 * 3600 });
  return doc;
}

/** Calcolo con lock: null se un altro lo sta già facendo. */
export async function computeSquadraOnce(opts) {
  const got = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: 180 });
  if (!got) return null;
  try {
    return await computeSquadra(opts);
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

export const getSquadraData = () => kv.get(DATA_KEY);
export const isSquadraComputing = async () => Boolean(await kv.get(LOCK_KEY));
export function isSquadraStale(doc, now = Date.now()) {
  return !doc?.generated_at || now - Date.parse(doc.generated_at) > STALE_AFTER_H * 3600 * 1000;
}

export async function listContacts() {
  const h = (await kv.hgetall(CONTACTS_KEY)) || {};
  const out = {};
  for (const [k, v] of Object.entries(h)) out[k] = typeof v === "string" ? JSON.parse(v) : v;
  return out;
}

export async function saveContact(name, { stato, nota }, by) {
  const key = nameKey(name);
  if (!key) return { ok: false, error: "Nome non valido." };
  if (stato != null && !CONTACT_STATES.includes(stato)) return { ok: false, error: "Stato non previsto." };
  const cur = (await kv.hget(CONTACTS_KEY, key)) || {};
  const prev = typeof cur === "string" ? JSON.parse(cur) : cur;
  const next = {
    stato: stato != null ? stato : prev.stato || "",
    nota: nota != null ? String(nota).slice(0, 300) : prev.nota || "",
    at: new Date().toISOString(),
    by: by || null,
  };
  await kv.hset(CONTACTS_KEY, { [key]: JSON.stringify(next) });
  return { ok: true, key, contact: next };
}
