// Coaching vendite — orchestrazione (BigQuery + KV). La matematica sta nel core
// puro (`sales-coaching-core.js`), l'SQL in `sales-coaching-sql.js`.
//
// Nato da un'analisi dello split di Nicholas (set 2026): su 10 pagine su 15 i
// PPV mandati in chat ai fan che non hanno mai pagato si vendevano al 5–9%
// contro il 12–26% delle pagine migliori. Questa superficie porta quell'analisi
// nell'app per il sales manager: pagine di uno split, operatori a parità di
// pagina, comportamenti che vendono, riferimento HOC (pagine e operatori
// modello), test in corso, esempi reali da far studiare.
//
// GOVERNANCE: coaching, NON score/comp. L'indice operatore serve a decidere chi
// affiancare a chi; non si pubblica come classifica agli operatori.
//
// KV:
//   sales:coach:{v}:agg|lift|ex|meta   cache del calcolo (TTL 8g, ricalcolo >20h)
//   sales:coach:computing              lock single-flight (NX, 300s)
//   sales:splits                       [{id,name,creator_ids,updated_at,updated_by}]
//   sales:experiments                  [{id,name,creator_id,start,target,operators,note,…}]
//   sales:examples:approved            esempi approvati (copia congelata, cap 40)
//   sales:examples:hidden              set id nascosti

import crypto from "crypto";
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { fanHmac } from "@/lib/academy-tapes";
import { salesCoachingSQL, exampleMessagesSQL } from "@/lib/sales-coaching-sql";
import {
  SALES_COACHING_VERSION,
  compactRows,
  weeksOf,
  splitWeeks,
  referenceBenchmark,
  pickExamples,
  assembleExamples,
} from "@/lib/sales-coaching-core";

export { bigQueryConfigured };

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const K = (part) => `sales:coach:${SALES_COACHING_VERSION}:${part}`;
const TTL = 8 * 24 * 3600;
export const STALE_AFTER_H = 20;
const LOCK_KEY = "sales:coach:computing";
const SPLITS_KEY = "sales:splits";
const EXP_KEY = "sales:experiments";
const APPROVED_KEY = "sales:examples:approved";
const HIDDEN_KEY = "sales:examples:hidden";
const MAX_APPROVED = 40;

// ── Calcolo ──────────────────────────────────────────────────────────────────
async function creatorNames() {
  const { rows } = await bqQuery(
    `SELECT creator_id, ANY_VALUE(creator_name) AS name FROM \`${DATA()}.onlyfans.reach\`
     WHERE organization_id = '${HOC_ORGANIZATION_ID}' GROUP BY creator_id`,
    { maxBytesBilled: 1024 ** 3 }
  );
  return Object.fromEntries(rows.map((r) => [String(r.creator_id), r.name || String(r.creator_id)]));
}

const exampleId = (p) => `${fanHmac(p.creator_id, p.uid).slice(0, 12)}-${String(p.ts).replace(/[^0-9]/g, "").slice(0, 12)}`;

export async function computeSalesCoaching() {
  const started = Date.now();
  const [main, names] = await Promise.all([
    bqQuery(salesCoachingSQL({ dataProject: DATA(), orgId: HOC_ORGANIZATION_ID }), {
      // Il cap è confrontato con la STIMA pre-esecuzione, che su ws_chat
      // (clusterizzata creator,user) è un limite superiore: stima ~44GB,
      // letti davvero ~3GB (misurato set 2026, 8 settimane org intera).
      // Fusibile contro query sbagliate, non budget.
      maxBytesBilled: 90 * 1024 ** 3,
      timeoutMs: 60_000,
    }),
    creatorNames(),
  ]);
  const { agg, lift, cand } = compactRows(main.rows);
  const weeks = weeksOf(agg);
  const { recent } = splitWeeks(weeks);
  const ref = referenceBenchmark(agg, { weeks: recent });

  let examples = [];
  let exBytes = 0;
  const picks = pickExamples(cand, ref.operators.map((o) => o.op));
  if (picks.length) {
    const ex = await bqQuery(exampleMessagesSQL({ dataProject: DATA(), picks }), { maxBytesBilled: 60 * 1024 ** 3, timeoutMs: 60_000 }); // stima a partizione-giorno intera (~23GB per ~18 esempi): la lettura reale è potata dal cluster creator,user
    exBytes = ex.totalBytesProcessed;
    examples = assembleExamples(ex.rows, picks, exampleId);
  }

  const meta = {
    version: SALES_COACHING_VERSION,
    generated_at: new Date().toISOString(),
    weeks,
    names,
    bytes_processed: main.totalBytesProcessed + exBytes,
    duration_ms: Date.now() - started,
    counts: { agg: agg.length, lift: lift.length, cand: cand.length, examples: examples.length },
  };
  // chiavi separate: il payload intero (~700KB) sta stretto in un solo valore KV
  await Promise.all([
    kv.set(K("agg"), agg, { ex: TTL }),
    kv.set(K("lift"), lift, { ex: TTL }),
    kv.set(K("ex"), examples, { ex: TTL }),
  ]);
  await kv.set(K("meta"), meta, { ex: TTL }); // per ultima: meta presente = dati completi
  return meta;
}

// null se un altro calcolo è già in volo (il chiamante risponde "in calcolo")
export async function computeSalesCoachingOnce() {
  const got = await kv.set(LOCK_KEY, 1, { nx: true, ex: 300 });
  if (!got) return null;
  try {
    return await computeSalesCoaching();
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

export async function getSalesCoachingData() {
  const meta = await kv.get(K("meta"));
  if (!meta) return null;
  const [agg, lift, examples] = await Promise.all([kv.get(K("agg")), kv.get(K("lift")), kv.get(K("ex"))]);
  if (!Array.isArray(agg) || !Array.isArray(lift)) return null;
  return { meta, agg, lift, examples: Array.isArray(examples) ? examples : [] };
}

export async function isComputing() {
  return Boolean(await kv.get(LOCK_KEY));
}

export function isStale(meta, now = Date.now()) {
  if (!meta?.generated_at) return true;
  return now - Date.parse(meta.generated_at) > STALE_AFTER_H * 3600 * 1000;
}

// Per il cron: ricalcola solo se stantio.
export async function warmSalesCoaching() {
  const meta = await kv.get(K("meta"));
  if (meta && !isStale(meta)) return "fresh";
  const done = await computeSalesCoachingOnce();
  return done ? "recomputed" : "skipped:in-flight";
}

// ── Split ────────────────────────────────────────────────────────────────────
const newId = () => crypto.randomBytes(6).toString("hex");
const cleanIds = (ids) => [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
const cleanText = (s, max) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function listSplits() {
  const v = await kv.get(SPLITS_KEY);
  return Array.isArray(v) ? v : [];
}

export async function saveSplit({ id, name, creator_ids }, userId) {
  const nm = cleanText(name, 60);
  const ids = cleanIds(creator_ids);
  if (!nm) throw new Error("Dai un nome allo split");
  if (!ids.length) throw new Error("Scegli almeno una pagina");
  const list = await listSplits();
  const rec = { id: id || newId(), name: nm, creator_ids: ids, updated_at: new Date().toISOString(), updated_by: userId || null };
  const i = list.findIndex((s) => s.id === rec.id);
  if (id && i < 0) throw new Error("Split non trovato");
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  await kv.set(SPLITS_KEY, list);
  return rec;
}

export async function deleteSplit(id) {
  const list = await listSplits();
  await kv.set(SPLITS_KEY, list.filter((s) => s.id !== id));
}

// ── Test in corso ────────────────────────────────────────────────────────────
export async function listExperiments() {
  const v = await kv.get(EXP_KEY);
  return Array.isArray(v) ? v : [];
}

export async function saveExperiment(input, userId) {
  const name = cleanText(input.name, 80);
  const creator_id = Number(input.creator_id);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(input.start || "")) ? input.start : null;
  const target = input.target === "" || input.target == null ? null : Number(input.target);
  if (!name) throw new Error("Dai un nome al test");
  if (!Number.isInteger(creator_id) || creator_id <= 0) throw new Error("Scegli la pagina del test");
  if (!start) throw new Error("Data di inizio non valida");
  if (target != null && !(target > 0 && target < 1)) throw new Error("Obiettivo tra 0 e 100%");
  const operators = [...new Set((input.operators || []).map((o) => cleanText(o, 80)).filter(Boolean))].slice(0, 12);
  const list = await listExperiments();
  const rec = {
    id: input.id || newId(),
    name,
    creator_id,
    start,
    target,
    operators,
    note: cleanText(input.note, 600),
    status: input.status === "chiuso" ? "chiuso" : "in corso",
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  const i = list.findIndex((e) => e.id === rec.id);
  if (input.id && i < 0) throw new Error("Test non trovato");
  if (i >= 0) list[i] = { ...list[i], ...rec };
  else list.push({ ...rec, created_at: rec.updated_at });
  await kv.set(EXP_KEY, list);
  return rec;
}

export async function deleteExperiment(id) {
  const list = await listExperiments();
  await kv.set(EXP_KEY, list.filter((e) => e.id !== id));
}

// ── Esempi: curatela (gate PII sul testo libero prima della pubblicazione) ───
export async function listApproved() {
  const v = await kv.get(APPROVED_KEY);
  return Array.isArray(v) ? v : [];
}

export async function listHidden() {
  return (await kv.smembers(HIDDEN_KEY)) || [];
}

// approva = copia congelata dell'esempio (sopravvive al ricalcolo notturno)
export async function approveExample(example, { note, creatorName }, userId) {
  if (!example?.id || !Array.isArray(example.messages)) throw new Error("Esempio non valido");
  const list = await listApproved();
  const rec = {
    ...example,
    creator: creatorName || "",
    note: cleanText(note, 400),
    approved_at: new Date().toISOString(),
    approved_by: userId || null,
  };
  const next = [rec, ...list.filter((e) => e.id !== example.id)].slice(0, MAX_APPROVED);
  await kv.set(APPROVED_KEY, next);
  await kv.srem(HIDDEN_KEY, example.id).catch(() => {});
  return rec;
}

export async function unapproveExample(id) {
  const list = await listApproved();
  await kv.set(APPROVED_KEY, list.filter((e) => e.id !== id));
}

export async function hideExample(id) {
  await kv.sadd(HIDDEN_KEY, id);
  await unapproveExample(id);
}
