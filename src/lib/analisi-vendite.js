// Analisi vendite (fase 1, 9/10/2026): i report Looker dell'altra parte portati
// in HOC Pro per i sales manager, con le stesse formule (lib/analisi-vendite-sql.js).
//
// FONTE DEI DATI — pensata per sopravvivere allo split:
//   1. primaria: il warehouse `BIGQUERY_DATA_PROJECT` (stesse tabelle di Looker, dati freschi);
//   2. se l'accesso viene tolto (403/404), la COPIA DI SICUREZZA nostra
//      `<billing>.warehouse_backup.<dataset>__<tabella>` (aggiornata ogni notte, lib/warehouse-backup).
// La risposta dichiara sempre da quale fonte arriva (`source`).
//
// CHI VEDE COSA: creator degli split (KV sales:splits) ∩ creator assegnate all'utente (creator-scope).

import { kv } from "@vercel/kv";
import { bqQuery, bqProjects } from "@/lib/bigquery-api";
import { listSplits } from "@/lib/sales-coaching";
import { allowsCreator } from "@/lib/creator-scope";
import {
  normalizeRange, previousRange, pctDelta, namesSql, recapSql, recapDailySql, conversioniSql,
  rapportoSql, metaMeseSql, transazioniSql, chargebackSql,
} from "@/lib/analisi-vendite-sql";

const TABLES = {
  attributed: ["onlyfans", "attributed_transactions"],
  subscriptions: ["onlyfans", "subscriptions"],
  transactionsAnalytics: ["onlyfans", "transactions_analytics"],
  kpi: ["onlyfans", "kpi"],
  chargebacks: ["postgres", "public_chargebacks"],
  users: ["postgres", "public_users"],
  creators: ["postgres", "public_creators"],
};

function refsFor(source) {
  const { dataProject, billingProject } = bqProjects();
  return Object.fromEntries(
    Object.entries(TABLES).map(([k, [ds, t]]) => [
      k,
      source === "backup" ? `${billingProject}.warehouse_backup.${ds}__${t}` : `${dataProject}.${ds}.${t}`,
    ])
  );
}

const lostAccess = (e) => /access denied|permission|not found: (dataset|table)|\b40[34]\b/i.test(String(e?.message || ""));

/** Esegue le query sulla fonte primaria; se l'accesso manca, sulla copia di sicurezza. */
async function runOnSource(build) {
  try {
    return { source: "warehouse", rows: await Promise.all(build(refsFor("warehouse")).map((sql) => bqQuery(sql).then((r) => r.rows))) };
  } catch (e) {
    if (!lostAccess(e)) throw e;
    return { source: "backup", rows: await Promise.all(build(refsFor("backup")).map((sql) => bqQuery(sql).then((r) => r.rows))) };
  }
}

/** creator_id degli split, con i nomi delle pagine (cache 6h). */
export async function splitCreators() {
  const splits = await listSplits();
  const ids = [...new Set(splits.flatMap((s) => s.creator_ids || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  if (!ids.length) return [];
  const key = `analisi:names:${ids.join(",")}`;
  const hit = await kv.get(key).catch(() => null);
  if (hit) return hit;
  const { rows } = await runOnSource((refs) => [namesSql(refs, ids)]);
  const byId = Object.fromEntries(rows[0].map((r) => [Number(r.creator_id), r.name]));
  const out = ids.map((id) => ({ id, name: byId[id] || `Creator ${id}` })).sort((a, b) => a.name.localeCompare(b.name, "it"));
  await kv.set(key, out, { ex: 6 * 3600 }).catch(() => {});
  return out;
}

/** Creator che questo utente può vedere (split ∩ assegnate). */
export async function visibleCreators(scope) {
  return (await splitCreators()).filter((c) => allowsCreator(scope, c.name));
}

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

function shape(view, rows, names, range) {
  const nameOf = (id) => names[Number(id)] || `Creator ${id}`;
  if (view === "recap") {
    const [byCreator, daily] = rows;
    const list = byCreator
      .map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), net: r2(r.net), net_delta: pctDelta(r.net, r.net_prev), subs: Number(r.subs) || 0, subs_delta: pctDelta(r.subs, r.subs_prev), net_prev: r2(r.net_prev), subs_prev: Number(r.subs_prev) || 0 }))
      .sort((a, b) => b.net - a.net);
    const tot = list.reduce((t, r) => ({ net: t.net + r.net, net_prev: t.net_prev + r.net_prev, subs: t.subs + r.subs, subs_prev: t.subs_prev + r.subs_prev }), { net: 0, net_prev: 0, subs: 0, subs_prev: 0 });
    return { rows: list, total: { ...tot, net: r2(tot.net), net_delta: pctDelta(tot.net, tot.net_prev), subs_delta: pctDelta(tot.subs, tot.subs_prev) }, daily: daily.map((d) => ({ day: d.day, net: r2(d.net), subs: Number(d.subs) || 0 })), previous: previousRange(range) };
  }
  if (view === "conversioni") {
    const list = rows[0]
      .map((r) => {
        const cr = r.new_subs ? r.converted / r.new_subs : null;
        const crPrev = r.new_subs_prev ? r.converted_prev / r.new_subs_prev : null;
        return {
          creator_id: Number(r.creator_id), name: nameOf(r.creator_id), new_subs: Number(r.new_subs) || 0, converted: Number(r.converted) || 0,
          cr, cr_delta: cr != null && crPrev ? (cr - crPrev) / crPrev : null, users: Number(r.users) || 0,
          transactions: Number(r.transactions) || 0, revenue: r2(r.revenue), revenue_delta: pctDelta(r.revenue, r.revenue_prev),
          per_transaction: r.transactions ? r2(r.revenue / r.transactions) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
    const t = list.reduce((a, r) => ({ new_subs: a.new_subs + r.new_subs, converted: a.converted + r.converted, users: a.users + r.users, transactions: a.transactions + r.transactions, revenue: a.revenue + r.revenue }), { new_subs: 0, converted: 0, users: 0, transactions: 0, revenue: 0 });
    return { rows: list, total: { ...t, revenue: r2(t.revenue), cr: t.new_subs ? t.converted / t.new_subs : null, per_transaction: t.transactions ? r2(t.revenue / t.transactions) : null }, previous: previousRange(range) };
  }
  if (view === "rapporto") {
    return { rows: rows[0].map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), month: r.month, transactions: Number(r.transactions), revenue: r2(r.revenue), avg: r2(r.avg), median: r2(r.median), rr: r.rr == null ? null : Math.round(r.rr * 100) / 100 })).sort((a, b) => a.name.localeCompare(b.name, "it") || b.month.localeCompare(a.month)) };
  }
  if (view === "meta-mese") {
    return { rows: rows[0].map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), mid_revenue: r2(r.mid_revenue), end_revenue: r2(r.end_revenue), total_revenue: r2(r.total_revenue), total_subs: (Number(r.mid_subs) || 0) + (Number(r.end_subs) || 0) })).sort((a, b) => a.name.localeCompare(b.name, "it") || b.month.localeCompare(a.month)) };
  }
  if (view === "transazioni") {
    const [tx, cb] = rows;
    return {
      rows: tx.map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), net: r2(r.net), amount: r2(r.amount) })),
      chargebacks: cb.map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), amount: r2(r.amount) })),
      truncated: tx.length >= 500,
    };
  }
  throw new Error("vista sconosciuta");
}

const BUILDERS = {
  recap: (refs, ids, range) => [recapSql(refs, ids, range), recapDailySql(refs, ids, range)],
  conversioni: (refs, ids, range) => [conversioniSql(refs, ids, range)],
  rapporto: (refs, ids, range) => [rapportoSql(refs, ids, range)],
  "meta-mese": (refs, ids, range) => [metaMeseSql(refs, ids, range)],
  transazioni: (refs, ids, range) => [transazioniSql(refs, ids, range), chargebackSql(refs, ids, range)],
};

/**
 * Una vista per le creator `ids` (già filtrate per visibilità). Cache 10 minuti per
 * vista + periodo + creator: i dati di base si aggiornano in tempo quasi reale.
 */
export async function getAnalisi(view, ids, query = {}, { force = false } = {}) {
  if (!BUILDERS[view]) throw new Error("vista sconosciuta");
  const range = normalizeRange(view, query);
  const key = `analisi:v1:${view}:${range.from}:${range.to}:${[...ids].sort((a, b) => a - b).join(",")}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return { ...hit, cached: true };
  }
  const creators = await splitCreators();
  const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));
  const { source, rows } = await runOnSource((refs) => BUILDERS[view](refs, ids, range));
  const out = { view, range, source, computed_at: new Date().toISOString(), ...shape(view, rows, names, range) };
  await kv.set(key, out, { ex: 600 }).catch(() => {});
  return out;
}
