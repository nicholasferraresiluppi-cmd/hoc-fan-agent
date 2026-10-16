/**
 * Retention delle creator dello split (16/10/2026) — il «CRM fan» di management.
 *
 * Rifà l'idea della PR #48 (luglio, sul payout ledger: 5 mesi di storia) sul
 * warehouse, che ha TUTTA la storia fan per fan (dal 2021). Per ogni pagina
 * OnlyFans dello split (ITA ed ENG separate: hanno fan diversi):
 *   - quanto pesa chi spende di più (top 10 fan e top 1% sugli ultimi 90 giorni);
 *   - i fan di valore (≥ 500 $ negli ultimi 12 mesi): attivi, in pausa, persi,
 *     e quanto valevano al mese quelli in pausa;
 *   - i fan nuovi: quanti tornano a comprare entro 60 giorni dal primo acquisto,
 *     mese per mese (solo i mesi chiusi da almeno 60 giorni).
 * Solo numeri aggregati: nessun fan nominato (l'azione sul fan vive in Infloww).
 * Sempre filtrato sull'organizzazione HOC (il warehouse è multi-agenzia).
 * Costo misurato: ~0,6 GB per tutto lo split; cache KV giornaliera.
 */
import { kv } from "@vercel/kv";
import { runOnSource } from "@/lib/analisi-vendite";
import { HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { summarySql, cohortSql } from "@/lib/retention-split-sql";
export { VALUE_FAN_USD, PAUSE_DAYS, REPEAT_DAYS } from "@/lib/retention-split-sql";
import { listSplits } from "@/lib/sales-coaching";
import { pagesFor } from "@/lib/live-creators-store";
import { buildLiveCreators } from "@/lib/live-creators";

export const RETENTION_VERSION = "ret-split-1";
const MAX_BYTES = 8 * 1024 ** 3;
const num = (v) => Number(v) || 0;

/** Pagine dello split (una per account OnlyFans), con il nome della persona e il paese. */
export async function splitPages() {
  const splits = await listSplits();
  const all = [...new Set(splits.flatMap((s) => s.creator_ids || []).map(Number).filter(Boolean))];
  if (!all.length) return [];
  const people = buildLiveCreators(await pagesFor(all));
  return people.flatMap((p) => (p.accounts || []).map((a) => ({
    creator_id: Number(a.creator_id),
    name: p.accounts.length > 1 ? `${p.name} ${a.country === "EN" ? "ENG" : a.country || ""}`.trim() : p.name,
    person: p.name,
    country: a.country || null,
  })));
}

export async function computeRetention() {
  const pages = await splitPages();
  if (!pages.length) return { version: RETENTION_VERSION, computed_at: Date.now(), pages: [] };
  const list = pages.map((p) => p.creator_id);
  const { rows, source } = await runOnSource((refs) => [summarySql(refs.attributed, list, HOC_ORGANIZATION_ID), cohortSql(refs.attributed, list, HOC_ORGANIZATION_ID)], { maxBytesBilled: MAX_BYTES });
  const [sum, coh] = rows;
  const byId = new Map(sum.map((r) => [Number(r.creator_id), r]));
  const cohorts = new Map();
  for (const r of coh) {
    const k = Number(r.creator_id);
    if (!cohorts.has(k)) cohorts.set(k, []);
    cohorts.get(k).push({ month: r.month, fans: num(r.fans), spend30: num(r.spend30), back: num(r.back), ripe: Boolean(r.ripe) });
  }
  const out = pages.map((p) => {
    const r = byId.get(p.creator_id) || {};
    const rev90 = num(r.rev90);
    return {
      ...p,
      rev90, payers90: num(r.payers90),
      top10: num(r.top10), top10Share: rev90 > 0 ? num(r.top10) / rev90 : null,
      top1pct: num(r.top1pct), top1pctShare: rev90 > 0 ? num(r.top1pct) / rev90 : null,
      valueFans: num(r.value_fans), valueActive: num(r.value_active), valuePaused: num(r.value_paused), valueLost: num(r.value_lost),
      pausedMonthly: num(r.paused_monthly),
      new90: num(r.new90), newRipe: num(r.new_ripe), newRepeat: num(r.new_repeat),
      repeatRate: num(r.new_ripe) > 0 ? num(r.new_repeat) / num(r.new_ripe) : null,
      cohorts: cohorts.get(p.creator_id) || [],
    };
  }).filter((p) => p.rev90 > 0 || p.valueFans > 0).sort((a, b) => b.rev90 - a.rev90);
  return { version: RETENTION_VERSION, computed_at: Date.now(), source, pages: out };
}

const cacheKey = () => `retention:split:${RETENTION_VERSION}:${new Date().toISOString().slice(0, 10)}`;

/** Una volta al giorno (i dati di ieri non cambiano): cache KV 26h. */
export async function getRetention({ force = false } = {}) {
  if (!force) {
    const hit = await kv.get(cacheKey()).catch(() => null);
    if (hit) return { ...hit, cached: true };
  }
  const fresh = await computeRetention();
  await kv.set(cacheKey(), fresh, { ex: 26 * 3600 }).catch(() => {});
  return fresh;
}
