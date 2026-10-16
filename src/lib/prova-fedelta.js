/**
 * Prova fedeltà (16/10/2026) — impostazioni in KV, calcolo dal warehouse con cache breve.
 * Logica pura in prova-fedelta-core.js, SQL in prova-fedelta-sql.js.
 *
 * KV `prova-fedelta:config` = { creatorId, name, start (ISO), weeks, salt, by, created_at, stopped_at? }
 * KV `prova-fedelta:data:{start}` = ultimo calcolo (20 minuti: la lista serve durante il turno,
 * ma ogni calcolo legge ~8 GB di ws_chat, ~0,05 $).
 */
import { kv } from "@vercel/kv";
import { HOC_ORGANIZATION_ID, bqQuery, bqProjects } from "@/lib/bigquery-api";
import { provaFansSql } from "@/lib/prova-fedelta-sql";
import { shapeFans, measure, phaseOf, ENROLL_WEEKS } from "@/lib/prova-fedelta-core";

const CONFIG = "prova-fedelta:config";
const DATA = (start) => `prova-fedelta:data:${start}`;
const LOCK = "prova-fedelta:computing";
const TTL_S = 20 * 60;
export const DEFAULT_CREATOR = { creatorId: 1000000358, name: "Martina Scavo" };

export async function getConfig() { return (await kv.get(CONFIG).catch(() => null)) || null; }

export async function startProva({ start, by }) {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) throw new Error("Data di avvio non valida");
  d.setUTCHours(0, 0, 0, 0);
  const cfg = {
    ...DEFAULT_CREATOR, start: d.toISOString(), weeks: ENROLL_WEEKS,
    salt: `pf-${d.toISOString().slice(0, 10)}`, by: by || null, created_at: Date.now(),
  };
  await kv.set(CONFIG, cfg);
  return cfg;
}

export async function stopProva({ by }) {
  const cfg = await getConfig();
  if (!cfg) throw new Error("Nessuna prova avviata");
  const next = { ...cfg, stopped_at: Date.now(), stopped_by: by || null };
  await kv.set(CONFIG, next);
  return next;
}

async function compute(cfg) {
  const { dataProject } = bqProjects();
  const t = {
    wsChat: `${dataProject}.hoc.ws_chat`,
    attributed: `${dataProject}.onlyfans.attributed_transactions`,
    subs: `${dataProject}.onlyfans.subscriptions_intervals`,
  };
  const { rows, totalBytesProcessed } = await bqQuery(provaFansSql(t, cfg.creatorId, cfg.start, HOC_ORGANIZATION_ID), { maxBytesBilled: 20 * 1024 ** 3, timeoutMs: 50_000 });
  return { computed_at: Date.now(), bytes: Number(totalBytesProcessed) || null, rows };
}

/** Dati della prova: cache 20 minuti, un solo calcolo alla volta. */
export async function getProvaData({ force = false } = {}) {
  const cfg = await getConfig();
  const now = Date.now();
  const phase = phaseOf(cfg, now);
  if (!cfg || phase.key === "non-avviata" || phase.key === "in-partenza") return { config: cfg, phase, fans: [], metrics: null };
  let raw = force ? null : await kv.get(DATA(cfg.start)).catch(() => null);
  if (!raw) {
    const got = await kv.set(LOCK, now, { nx: true, ex: 90 }).catch(() => "OK");
    if (!got) {
      const stale = await kv.get(DATA(cfg.start)).catch(() => null);
      if (!stale) return { config: cfg, phase, computing: true, fans: [], metrics: null };
      raw = stale;
    } else {
      try {
        raw = await compute(cfg);
        await kv.set(DATA(cfg.start), raw, { ex: TTL_S }).catch(() => {});
      } finally { await kv.del(LOCK).catch(() => {}); }
    }
  }
  const fans = shapeFans(raw.rows || [], cfg, now);
  return { config: cfg, phase, computed_at: raw.computed_at, fans, metrics: measure(fans) };
}
