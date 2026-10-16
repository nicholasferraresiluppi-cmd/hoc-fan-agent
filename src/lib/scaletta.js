// La scaletta — orchestrazione (BigQuery + KV). Matematica in scaletta-core.js, SQL in scaletta-sql.js.
//
// Nata dal caso di studio Martina Scavo (16/10/2026, https://claude.ai/artifact/JEFbjYCK542tTbCNdmKAYe):
// Nicholas ha chiesto di portare quel funnel nell'app invece che nei documenti, così si aggiorna da
// solo e mostra se i concetti passano. Ricalcolo SETTIMANALE dal dispatcher (le misure sono
// settimanali e la query legge 8 settimane di ws_chat: ~35 GB, ~0,30 $ a giro su tutta HOC).
//
// KV:
//   scaletta:{v}:c|o|m|p|meta   cache del calcolo (TTL 15g, ricalcolo se > 6 giorni)
//   scaletta:computing          lock single-flight (NX, 300s)
//   scaletta:prove              { [creator_id]: prova }  (una prova attiva per pagina)
import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { scalettaSQL, massSQL, payersSQL } from "@/lib/scaletta-sql";
import { SCALETTA_VERSION, compactMain, weeksOf, toRow, M_COLS, P_COLS } from "@/lib/scaletta-core";

export { bigQueryConfigured };

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const K = (part) => `scaletta:${SCALETTA_VERSION}:${part}`;
const TTL = 15 * 24 * 3600;
export const STALE_AFTER_H = 6 * 24;
const LOCK_KEY = "scaletta:computing";
const PROVE_KEY = "scaletta:prove";

async function creatorNames() {
  const { rows } = await bqQuery(
    `SELECT creator_id, ANY_VALUE(creator_name) AS name FROM \`${DATA()}.onlyfans.reach\`
     WHERE organization_id = '${HOC_ORGANIZATION_ID}' GROUP BY creator_id`,
    { maxBytesBilled: 1024 ** 3 }
  );
  return Object.fromEntries(rows.map((r) => [String(r.creator_id), r.name || String(r.creator_id)]));
}

export async function computeScaletta() {
  const started = Date.now();
  const o = { dataProject: DATA(), orgId: HOC_ORGANIZATION_ID };
  const [main, mass, pay, names] = await Promise.all([
    // fusibile contro query sbagliate (misurato 16/10: ~33 GB per 6 settimane, la stima è più alta)
    bqQuery(scalettaSQL(o), { maxBytesBilled: 150 * 1024 ** 3, timeoutMs: 90_000 }),
    bqQuery(massSQL(o), { maxBytesBilled: 5 * 1024 ** 3, timeoutMs: 60_000 }),
    bqQuery(payersSQL(o), { maxBytesBilled: 10 * 1024 ** 3, timeoutMs: 60_000 }),
    creatorNames(),
  ]);
  const { c, o: ops } = compactMain(main.rows);
  const m = mass.rows.map((r) => toRow(M_COLS, { ...r, cid: r.creator_id }));
  const p = pay.rows.map((r) => toRow(P_COLS, { ...r, cid: r.creator_id }));
  const meta = {
    version: SCALETTA_VERSION,
    generated_at: new Date().toISOString(),
    weeks: weeksOf(c),
    names,
    bytes_processed: main.totalBytesProcessed + mass.totalBytesProcessed + pay.totalBytesProcessed,
    duration_ms: Date.now() - started,
    counts: { c: c.length, o: ops.length, m: m.length, p: p.length },
  };
  await Promise.all([
    kv.set(K("c"), c, { ex: TTL }),
    kv.set(K("o"), ops, { ex: TTL }),
    kv.set(K("m"), m, { ex: TTL }),
    kv.set(K("p"), p, { ex: TTL }),
  ]);
  await kv.set(K("meta"), meta, { ex: TTL }); // per ultima: meta presente = dati completi
  return meta;
}

// null se un altro calcolo è già in volo (il chiamante risponde "in calcolo")
export async function computeScalettaOnce() {
  const got = await kv.set(LOCK_KEY, 1, { nx: true, ex: 300 });
  if (!got) return null;
  try {
    return await computeScaletta();
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

// Copia in memoria dell'istanza, valida finché meta.generated_at non cambia: la cache intera
// pesa qualche centinaio di KB e non va riletta da KV a ogni apertura (lezione banda KV, 4/10).
let mem = null;
export async function getScalettaData() {
  const meta = await kv.get(K("meta"));
  if (!meta) return null;
  if (mem && mem.meta.generated_at === meta.generated_at) return { ...mem, meta };
  const [c, o, m, p] = await Promise.all([kv.get(K("c")), kv.get(K("o")), kv.get(K("m")), kv.get(K("p"))]);
  if (!Array.isArray(c) || !Array.isArray(o)) return null;
  mem = { meta, c, o, m: Array.isArray(m) ? m : [], p: Array.isArray(p) ? p : [] };
  return mem;
}

export async function isComputing() {
  return Boolean(await kv.get(LOCK_KEY));
}

export function isStale(meta, now = Date.now()) {
  if (!meta?.generated_at) return true;
  return now - Date.parse(meta.generated_at) > STALE_AFTER_H * 3600 * 1000;
}

// Per il cron: ricalcola solo se stantio (> 6 giorni).
export async function warmScaletta() {
  const meta = await kv.get(K("meta"));
  if (meta && !isStale(meta)) return "fresh";
  const done = await computeScalettaOnce();
  return done ? "recomputed" : "skipped:in-flight";
}

// ── Prove ─────────────────────────────────────────────────────────────────────
export async function listProve() {
  const all = await kv.get(PROVE_KEY).catch(() => null);
  return all && typeof all === "object" ? all : {};
}

export async function saveProva(prova, by) {
  const all = await listProve();
  all[String(prova.creator_id)] = { ...prova, by: String(by || "").slice(0, 80) };
  await kv.set(PROVE_KEY, all);
  return all[String(prova.creator_id)];
}

export async function endProva(creatorId) {
  const all = await listProve();
  delete all[String(Number(creatorId))];
  await kv.set(PROVE_KEY, all);
}
