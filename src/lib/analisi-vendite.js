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
  nuoviMetricsSql, nuoviPersoneSql, nuoviLinkSql, trackingSql, coperturaSql, coperturaDailySql,
  notificheAggSql, notificheListSql, welcomeSql, ricercaSql, cleanSearch, SUB_TYPES,
  diagnosiSql, diagnosiDailySql,
} from "@/lib/analisi-vendite-sql";
import { buildDiagnosi, summaryOf } from "@/lib/analisi-vendite-diagnosi";
import {
  lkRecapDailyNetSql, lkRecapDailySubsSql, lkClicksSql, lkWelcomeDailySql, lkPerfSql, lkSubsRangeSql, lkAmountRangeSql,
  lkTxSummarySql, lkTxSeriesSql, lkTxTopUsersSql, lkTxListSql, lkUsersSql, lkChargebacksSql, lkOverallSql, lkOverallDailySql,
  lkNewsubsDailySql, lkNewsubsListSql, lkNewsubsCreatorSql,
} from "@/lib/looker-sql";
import { LIVE_CREATORS } from "@/lib/live-creators";

function daysOf(range) {
  const out = [];
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
/** Pagina "Revenue e chat" della persona, se ce l'ha (creator seguite dal vivo). */
function liveSlugOf(person) {
  const p = String(person || "").trim().toLowerCase();
  return LIVE_CREATORS.find((c) => c.matches(p))?.slug || null;
}

const TABLES = {
  attributed: ["onlyfans", "attributed_transactions"],
  subscriptions: ["onlyfans", "subscriptions"],
  transactionsAnalytics: ["onlyfans", "transactions_analytics"],
  kpi: ["onlyfans", "kpi"],
  chargebacks: ["postgres", "public_chargebacks"],
  users: ["postgres", "public_users"],
  creators: ["postgres", "public_creators"],
  newsubs: ["hoc", "newsubs_spending_daily"],
  linksStats: ["onlyfans", "links_stats"],
  reach: ["onlyfans", "reach"],
  notifications: ["postgres", "public_notifications"],
  linksSubscriptions: ["onlyfans", "links_subscriptions"],
  welcomeUnlocks: ["onlyfans", "welcome_unlocks"],
  usersResearch: ["onlyfans", "users_research"],
  chat: ["onlyfans", "chat"],
  // viste del warehouse usate dal Report Looker (non sono nella copia di sicurezza: senza warehouse non rispondono)
  daysSubbed: ["hoc", "days_subbed_range"],
  txByAmount: ["hoc", "transactions_by_amount"],
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
export async function runOnSource(build, opts) {
  // opts → bqQuery (es. maxBytesBilled più alto per chi legge le chat di tutte le creator)
  try {
    return { source: "warehouse", rows: await Promise.all(build(refsFor("warehouse")).map((sql) => bqQuery(sql, opts).then((r) => r.rows))) };
  } catch (e) {
    if (!lostAccess(e)) throw e;
    return { source: "backup", rows: await Promise.all(build(refsFor("backup")).map((sql) => bqQuery(sql, opts).then((r) => r.rows))) };
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
    // % Δ anche sul totale, come la riga "Totale complessivo" di Looker KPI Sales
    const tp = rows[0].reduce((a, r) => ({ new_subs: a.new_subs + (Number(r.new_subs_prev) || 0), converted: a.converted + (Number(r.converted_prev) || 0), revenue: a.revenue + (Number(r.revenue_prev) || 0) }), { new_subs: 0, converted: 0, revenue: 0 });
    const crT = t.new_subs ? t.converted / t.new_subs : null;
    const crTp = tp.new_subs ? tp.converted / tp.new_subs : null;
    return { rows: list, total: { ...t, revenue: r2(t.revenue), cr: crT, cr_delta: crT != null && crTp ? (crT - crTp) / crTp : null, revenue_delta: pctDelta(t.revenue, tp.revenue), per_transaction: t.transactions ? r2(t.revenue / t.transactions) : null }, previous: previousRange(range) };
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
  if (view === "nuovi-abbonati") {
    const [byType, byCreator, people, byLink] = rows;
    const metrics = (r) => {
      const subs = Number(r.subs) || 0;
      return {
        subs, ltv_d0: subs ? r2(r.spend_d0 / subs) : null, cr_d0: subs ? r.conv_d0 / subs : null,
        ltv30: subs ? r2(r.revenue / subs) : null, cr30: subs ? r.conv / subs : null,
        arppu30: r.conv ? r2(r.revenue / r.conv) : null, revenue: r2(r.revenue), conv: Number(r.conv) || 0,
      };
    };
    const TYPE = { new_subscriber: "Nuovi", returning_subscriber: "Di ritorno", new_subscriber_trial: "Trial" };
    const total = byType.find((r) => r.k == null);
    const cur = people.find((r) => r.cur === true) || {};
    const prev = people.find((r) => r.cur === false) || {};
    const pick = (k) => ({ value: k.startsWith("revenue") ? r2(cur[k]) : Number(cur[k]) || 0, prev: k.startsWith("revenue") ? r2(prev[k]) : Number(prev[k]) || 0, delta: pctDelta(cur[k], prev[k]) });
    return {
      byType: byType.filter((r) => r.k != null).map((r) => ({ type: r.k, label: TYPE[r.k] || r.k, ...metrics(r) })),
      total: total ? metrics(total) : null,
      byCreator: byCreator.filter((r) => r.k != null).map((r) => ({ creator_id: Number(r.k), name: nameOf(r.k), ...metrics(r) })),
      people: Object.fromEntries(["gained", "gained_ret", "gained_new", "revenue", "revenue_ret", "revenue_new", "conv", "conv_ret", "conv_new"].map((k) => [k, pick(k)])),
      byLink: byLink.map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), link_name: r.link_name, placement: r.placement, alterego: r.alterego, revenue: r2(r.revenue), subs: Number(r.subs) || 0, conv: Number(r.conv) || 0, cr: r.subs ? r.conv / r.subs : null, arppu: r.conv ? r2(r.revenue / r.conv) : null })),
      previous: previousRange(range),
    };
  }
  if (view === "tracking") {
    const links = rows[0].map((r) => ({
      creator_id: Number(r.creator_id), name: nameOf(r.creator_id), link_name: r.link_name, link_url: r.link_url, placement: r.placement, spending_id: r.spending_id,
      clicks: Number(r.clicks) || 0, clicks_delta: pctDelta(r.clicks, r.clicks_prev), subs: Number(r.subs) || 0, subs_delta: pctDelta(r.subs, r.subs_prev),
      revenue: r2(r.revenue), revenue_delta: pctDelta(r.revenue, r.revenue_prev), cr: r.clicks ? r.subs / r.clicks : null,
      cr_delta: r.clicks && r.clicks_prev && r.subs_prev ? (r.subs / r.clicks - r.subs_prev / r.clicks_prev) / (r.subs_prev / r.clicks_prev) : null,
      new_sub_revenue: r2(r.new_sub_revenue),
    }));
    const byId = {};
    for (const r of rows[0]) {
      const c = (byId[r.creator_id] ||= { creator_id: Number(r.creator_id), name: nameOf(r.creator_id), clicks: 0, clicks_prev: 0, subs: 0, subs_prev: 0, revenue: 0, new_sub_revenue: 0, links: 0 });
      c.clicks += Number(r.clicks) || 0; c.clicks_prev += Number(r.clicks_prev) || 0; c.subs += Number(r.subs) || 0; c.subs_prev += Number(r.subs_prev) || 0;
      c.revenue += Number(r.revenue) || 0; c.new_sub_revenue += Number(r.new_sub_revenue) || 0; c.links += 1;
    }
    const creators = Object.values(byId).map((c) => ({ ...c, revenue: r2(c.revenue), new_sub_revenue: r2(c.new_sub_revenue), cr: c.clicks ? c.subs / c.clicks : null, clicks_delta: pctDelta(c.clicks, c.clicks_prev), subs_delta: pctDelta(c.subs, c.subs_prev) }));
    const t = creators.reduce((a, c) => ({ clicks: a.clicks + c.clicks, clicks_prev: a.clicks_prev + c.clicks_prev, subs: a.subs + c.subs, subs_prev: a.subs_prev + c.subs_prev, revenue: a.revenue + c.revenue, new_sub_revenue: a.new_sub_revenue + c.new_sub_revenue }), { clicks: 0, clicks_prev: 0, subs: 0, subs_prev: 0, revenue: 0, new_sub_revenue: 0 });
    // NB: non chiamarlo `creators`: la route aggiunge `creators` (quelle visibili) e lo sovrascriverebbe
    return { links, byCreator: creators, total: { ...t, revenue: r2(t.revenue), new_sub_revenue: r2(t.new_sub_revenue), cr: t.clicks ? t.subs / t.clicks : null, clicks_delta: pctDelta(t.clicks, t.clicks_prev), subs_delta: pctDelta(t.subs, t.subs_prev) }, previous: previousRange(range) };
  }
  if (view === "copertura") {
    const [byCreator, daily] = rows;
    const list = byCreator.map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), reach: Number(r.reach) || 0, reach_prev: Number(r.reach_prev) || 0, delta: pctDelta(r.reach, r.reach_prev) })).sort((a, b) => b.reach - a.reach);
    const tot = list.reduce((a, r) => ({ reach: a.reach + r.reach, reach_prev: a.reach_prev + r.reach_prev }), { reach: 0, reach_prev: 0 });
    return { rows: list, total: { ...tot, delta: pctDelta(tot.reach, tot.reach_prev) }, daily: daily.map((d) => ({ day: d.day, reach: Number(d.reach) || 0 })), previous: previousRange(range) };
  }
  if (view === "notifiche") {
    const [agg, list] = rows;
    const zero = () => Object.fromEntries(SUB_TYPES.map((t) => [t, 0]));
    const byCreator = {}, byDay = {}, byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: 0 }));
    const totals = zero();
    for (const r of agg) {
      const n = Number(r.n) || 0;
      (byCreator[r.creator_id] ||= { creator_id: Number(r.creator_id), name: nameOf(r.creator_id), ...zero() })[r.sub_type] += n;
      (byDay[r.day] ||= { day: r.day, ...zero() })[r.sub_type] += n;
      byHour[Number(r.hour)].n += n;
      totals[r.sub_type] += n;
    }
    const sum = (o) => SUB_TYPES.reduce((a, t) => a + o[t], 0);
    return {
      totals: { ...totals, total: sum(totals) },
      byCreator: Object.values(byCreator).map((c) => ({ ...c, total: sum(c) })).sort((a, b) => b.total - a.total),
      daily: Object.values(byDay).map((d) => ({ ...d, total: sum(d) })).sort((a, b) => a.day.localeCompare(b.day)),
      hourly: byHour,
      dayHour: agg.reduce((acc, r) => { const k = `${r.day}|${Number(r.hour)}`; acc[k] = (acc[k] || 0) + (Number(r.n) || 0); return acc; }, {}),
      list: list.map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id) })),
    };
  }
  if (view === "welcome") {
    const list = rows[0].map((r) => {
      const subs = Number(r.subs) || 0, unlocks = Number(r.unlocks) || 0, amount = Number(r.amount) || 0;
      return { creator_id: Number(r.creator_id), name: nameOf(r.creator_id), amount, type: r.type, subs, unlocks, revenue: r2(amount * unlocks), cr: subs ? unlocks / subs : null };
    }).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "it"));
    const unlocks = list.reduce((a, r) => a + r.unlocks, 0);
    return { rows: list, total: { unlocks, revenue: r2(list.reduce((a, r) => a + r.revenue, 0)) } };
  }
  if (view === "ricerca-fan") {
    return { rows: (rows[0] || []).map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), spent: r2(r.spent), transactions: Number(r.transactions) || 0 })) };
  }
  if (view === "diagnosi") {
    const [agg, daily] = rows;
    const persons = buildDiagnosi(agg, names, daily, daysOf(range)).map((p) => ({ ...p, live: liveSlugOf(p.name) }));
    return { persons, summary: summaryOf(persons), previous: previousRange(range) };
  }
  if (view === "creator") {
    const [agg, daily, links, cbs, welcome, ticket, types] = rows;
    const person = buildDiagnosi(agg, names, daily, daysOf(range))[0] || null;
    const linkRows = links.map((r) => ({
      name: nameOf(r.creator_id), link_name: r.link_name, link_url: r.link_url, spending_id: r.spending_id,
      clicks: Number(r.clicks) || 0, clicks_prev: Number(r.clicks_prev) || 0, subs: Number(r.subs) || 0, subs_prev: Number(r.subs_prev) || 0,
      revenue: r2(r.revenue), new_sub_revenue: r2(r.new_sub_revenue), cr: r.clicks ? r.subs / r.clicks : null, subs_delta: pctDelta(r.subs, r.subs_prev),
    }));
    const TYPE = { new_subscriber: "Nuovi", returning_subscriber: "Di ritorno", new_subscriber_trial: "Trial" };
    return {
      person: person && { ...person, live: liveSlugOf(person.name) },
      links: {
        top: [...linkRows].sort((a, b) => b.subs - a.subs || b.clicks - a.clicks).slice(0, 8),
        falling: linkRows.filter((l) => l.subs_prev >= 10 && l.subs_delta != null && l.subs_delta <= -0.3).sort((a, b) => (a.subs - a.subs_prev) - (b.subs - b.subs_prev)).slice(0, 5),
        // link nuovi o ripartiti che portano tanti abbonati: spesso spiegano un cambio di conversione (traffico diverso)
        fresh: linkRows.filter((l) => l.subs_prev === 0 && l.subs >= 20).sort((a, b) => b.subs - a.subs).slice(0, 5),
        total: linkRows.length,
      },
      chargebacks: cbs.slice(0, 10).map((r) => ({ ...r, name: nameOf(r.creator_id), amount: r2(r.amount) })),
      welcome: welcome.filter((r) => Number(r.amount) > 0).map((r) => ({ name: nameOf(r.creator_id), amount: Number(r.amount), subs: Number(r.subs) || 0, unlocks: Number(r.unlocks) || 0, revenue: r2(Number(r.amount) * (Number(r.unlocks) || 0)) })),
      welcomeMissing: welcome.filter((r) => !(Number(r.amount) > 0)).map((r) => nameOf(r.creator_id)),
      ticket: ticket.filter((r) => r.month === range.to.slice(0, 7)).map((r) => ({ name: nameOf(r.creator_id), avg: r2(r.avg), median: r2(r.median), transactions: Number(r.transactions) })),
      newsubs: types.filter((r) => r.k != null).map((r) => ({ type: TYPE[r.k] || r.k, subs: Number(r.subs) || 0, d0: r.subs ? r2(r.spend_d0 / r.subs) : null, cr30: r.subs ? r.conv / r.subs : null, ltv30: r.subs ? r2(r.revenue / r.subs) : null })),
      previous: previousRange(range),
    };
  }
  if (view === "lk-recap") {
    // Looker "Recap Dashboard": tabella per creator (net / nuovi abbonati con % Δ), linee giornaliere, quote
    const [agg, dn, ds] = rows;
    const days = daysOf(range);
    const series = (daily, ranked) => {
      const by = {};
      for (const r of daily) (by[Number(r.creator_id)] ||= {})[r.day] = Number(r.v) || 0;
      return ranked.map((r) => ({ creator_id: r.creator_id, label: r.name, values: days.map((dd) => r2((by[r.creator_id] || {})[dd] || 0)) }));
    };
    const list = agg.map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), net: r2(r.net), net_prev: r2(r.net_prev), net_delta: pctDelta(r.net, r.net_prev), subs: Number(r.subs) || 0, subs_prev: Number(r.subs_prev) || 0, subs_delta: pctDelta(r.subs, r.subs_prev) }));
    const byNet = [...list].sort((a, b) => b.net - a.net);
    const bySubs = [...list].sort((a, b) => b.subs - a.subs);
    const t = list.reduce((a, r) => ({ net: a.net + r.net, net_prev: a.net_prev + r.net_prev, subs: a.subs + r.subs, subs_prev: a.subs_prev + r.subs_prev }), { net: 0, net_prev: 0, subs: 0, subs_prev: 0 });
    return {
      net: byNet, subs: bySubs, days,
      netSeries: series(dn, byNet), subsSeries: series(ds, bySubs),
      total: { net: r2(t.net), net_delta: pctDelta(t.net, t.net_prev), subs: t.subs, subs_delta: pctDelta(t.subs, t.subs_prev) },
      previous: previousRange(range),
    };
  }
  if (view === "lk-clicks") {
    // Looker "Clicks Overall": righe creator × mese con % Δ sulla stessa riga del periodo prima (vedi looker-sql)
    const [agg] = rows;
    const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    const list = agg.filter((r) => r.in_range === true || r.in_range === "true").map((r) => {
      const cr = Number(r.clicks) ? Number(r.subs) / Number(r.clicks) : null;
      const crPrev = Number(r.clicks_prev) ? Number(r.subs_prev) / Number(r.clicks_prev) : null;
      return {
        creator_id: Number(r.creator_id), name: nameOf(r.creator_id), month: r.month, month_label: `${MONTHS[Number(r.month.slice(5, 7)) - 1]} ${r.month.slice(0, 4)}`,
        clicks: Number(r.clicks) || 0, clicks_delta: pctDelta(r.clicks, r.clicks_prev), subs: Number(r.subs) || 0, subs_delta: pctDelta(r.subs, r.subs_prev),
        cr, cr_delta: cr != null && crPrev ? (cr - crPrev) / crPrev : null,
      };
    }).sort((a, b) => b.clicks - a.clicks);
    const t = agg.reduce((a, r) => ({ c: a.c + (Number(r.clicks) || 0), cp: a.cp + (Number(r.clicks_prev) || 0), s: a.s + (Number(r.subs) || 0), sp: a.sp + (Number(r.subs_prev) || 0) }), { c: 0, cp: 0, s: 0, sp: 0 });
    const cr = t.c ? t.s / t.c : null; const crp = t.cp ? t.sp / t.cp : null;
    return { rows: list, total: { clicks: t.c, clicks_delta: pctDelta(t.c, t.cp), subs: t.s, subs_delta: pctDelta(t.s, t.sp), cr, cr_delta: cr != null && crp ? (cr - crp) / crp : null }, previous: previousRange(range) };
  }
  if (view === "lk-welcome") {
    const w = shape("welcome", [rows[0]], names, range);
    return { ...w, daily: rows[1].map((r) => ({ day: r.day, subs: Number(r.subs) || 0, unlocks: Number(r.unlocks) || 0 })) };
  }
  if (view === "lk-perf") {
    const [perf, byRange, byCreatorRange, amount] = rows;
    const list = perf.map((r) => {
      const n = (k) => Number(r[k]) || 0;
      const rpt = n("tx") ? n("revenue") / n("tx") : null, rptP = n("tx_prev") ? n("revenue_prev") / n("tx_prev") : null;
      const rpu = n("users") ? n("revenue") / n("users") : null, rpuP = n("users_prev") ? n("revenue_prev") / n("users_prev") : null;
      return {
        creator_id: Number(r.creator_id), name: nameOf(r.creator_id),
        new_subs: n("new_subs"), new_subs_delta: pctDelta(r.new_subs, r.new_subs_prev), tx: n("tx"), tx_delta: pctDelta(r.tx, r.tx_prev),
        revenue: r2(n("revenue")), revenue_delta: pctDelta(r.revenue, r.revenue_prev), users: n("users"), users_delta: pctDelta(r.users, r.users_prev),
        rpt: rpt == null ? null : r2(rpt), rpt_delta: rpt != null && rptP ? (rpt - rptP) / rptP : null,
        rpu: rpu == null ? null : r2(rpu), rpu_delta: rpu != null && rpuP ? (rpu - rpuP) / rpuP : null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "it"));
    const sum = (k) => list.reduce((a, r) => a + (r[k] || 0), 0);
    const sumP = (k) => perf.reduce((a, r) => a + (Number(r[`${k}_prev`]) || 0), 0);
    const t = { new_subs: sum("new_subs"), tx: sum("tx"), revenue: r2(sum("revenue")), users: sum("users") };
    const arppu = (r) => ({ revenue: r2(r.revenue), users: Number(r.users) || 0, arppu: Number(r.users) ? r2(r.revenue / r.users) : null,
      arppu_delta: Number(r.users) && Number(r.users_prev) ? (r.revenue / r.users - r.revenue_prev / r.users_prev) / (r.revenue_prev / r.users_prev) : null,
      users_delta: pctDelta(r.users, r.users_prev) });
    return {
      rows: list,
      total: { ...t, new_subs_delta: pctDelta(t.new_subs, sumP("new_subs")), tx_delta: pctDelta(t.tx, sumP("tx")), revenue_delta: pctDelta(t.revenue, sumP("revenue")), users_delta: pctDelta(t.users, sumP("users")),
        rpt: t.tx ? r2(t.revenue / t.tx) : null, rpu: t.users ? r2(t.revenue / t.users) : null },
      bySubsRange: byRange.filter((r) => r.k != null && r.k !== "0_UNKNOWN").map((r) => ({ range: r.k, ...arppu(r) })).sort((a, b) => a.range.localeCompare(b.range)),
      subsRangeTotal: (() => { const r = byRange.find((x) => x.k == null); return r ? arppu(r) : null; })(),
      byCreatorArppu: byCreatorRange.filter((r) => r.k != null).map((r) => ({ creator_id: Number(r.k), name: nameOf(r.k), ...arppu(r) })).sort((a, b) => (b.arppu || 0) - (a.arppu || 0)),
      creatorArppuTotal: (() => { const r = byCreatorRange.find((x) => x.k == null); return r ? arppu(r) : null; })(),
      byAmount: amount.map((r) => ({ range: r.k, tx: Number(r.tx) || 0 })),
      previous: previousRange(range),
    };
  }
  if (view === "lk-tx") {
    const [list, summary, series, top] = rows;
    const cur = summary.find((r) => r.cur === true || r.cur === "true") || {};
    const prev = summary.find((r) => r.cur === false || r.cur === "false") || {};
    const net = r2(cur.net), users = Number(cur.users) || 0;
    const netP = Number(prev.net) || 0, usersP = Number(prev.users) || 0;
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, net: 0 }));
    const byDay = {};
    for (const r of series) { byHour[Number(r.hour)].net += Number(r.net) || 0; byDay[r.day] = (byDay[r.day] || 0) + (Number(r.net) || 0); }
    return {
      rows: list.map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), net: r2(r.net), amount: r2(r.amount) })),
      truncated: list.length >= 1000,
      totals: { net, net_delta: pctDelta(net, netP), users, users_delta: pctDelta(users, usersP), ltv: users ? r2(net / users) : null,
        ltv_delta: users && usersP ? (net / users - netP / usersP) / (netP / usersP) : null },
      byHour: byHour.map((h) => ({ ...h, net: r2(h.net) })),
      byDay: daysOf(range).map((dd) => ({ day: dd, net: r2(byDay[dd] || 0) })),
      topUsers: top.map((r) => ({ creator_id: Number(r.creator_id), name: nameOf(r.creator_id), user_id: Number(r.user_id), net: r2(r.net) })),
      previous: previousRange(range),
    };
  }
  if (view === "lk-users") {
    // "name" della riga è il nome del FAN: va in fan_name, "name" resta la creator come in tutte le viste
    const list = rows[0].map((r) => ({ ...r, fan_name: r.name, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), user_id: Number(r.user_id), spent: r.spent == null ? null : r2(r.spent), transactions: Number(r.transactions) || 0 }));
    return { rows: list, truncated: list.length >= 1000, total: { spent: r2(list.reduce((a, r) => a + (r.spent || 0), 0)), transactions: list.reduce((a, r) => a + r.transactions, 0) } };
  }
  if (view === "lk-chargebacks") {
    const list = rows[0].map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), user_id: Number(r.user_id), amount: r2(r.amount) }));
    const group = (key, label) => Object.values(list.reduce((acc, r) => { const k = r[key] ?? "null"; (acc[k] ||= { [label]: k, amount: 0, ...(key === "creator_id" ? { name: r.name } : {}) }).amount += r.amount; return acc; }, {}))
      .map((x) => ({ ...x, amount: r2(x.amount) })).sort((a, b) => b.amount - a.amount);
    return { rows: list, truncated: list.length >= 2000, total: r2(list.reduce((a, r) => a + r.amount, 0)), byUser: group("username", "username"), byCreator: group("creator_id", "creator_id"), paymentTypes: [...new Set(list.map((r) => r.payment_type).filter(Boolean))].sort() };
  }
  if (view === "lk-overall") {
    const [agg, daily] = rows;
    const a = agg[0] || {};
    const n = (k) => (a[k] == null ? null : Number(a[k]));
    const win = (N) => ({
      subs: { value: n(`subs_${N}`), delta: pctDelta(a[`subs_${N}`], a[`subs_${N}_prev`]) },
      users: { value: n(`users_${N}`), delta: pctDelta(a[`users_${N}`], a[`users_${N}_prev`]) },
      rev: { value: r2(n(`rev_${N}`)), delta: pctDelta(a[`rev_${N}`], a[`rev_${N}_prev`]) },
      rpu: { value: n(`rpu_${N}`) == null ? null : r2(n(`rpu_${N}`)), delta: pctDelta(a[`rpu_${N}`], a[`rpu_${N}_prev`]) },
      hoc_rpu: { value: n(`hoc_rpu_${N}`) == null ? null : r2(n(`hoc_rpu_${N}`)), delta: pctDelta(a[`hoc_rpu_${N}`], a[`hoc_rpu_${N}_prev`]) },
      reach: { value: n(`reach_${N}`), delta: pctDelta(a[`reach_${N}`], a[`reach_${N}_prev`]) },
    });
    return { windows: { 7: win(7), 14: win(14), 28: win(28) }, daily: daily.map((r) => ({ day: r.day, subs: Number(r.subs) || 0, users: Number(r.users) || 0, rev: r2(r.rev), rpu: r.rpu == null ? null : r2(r.rpu), reach: Number(r.reach) || 0 })), as_of: new Date().toISOString().slice(0, 10) };
  }
  if (view === "lk-newsubs") {
    const base = shape("nuovi-abbonati", rows.slice(0, 4), names, range);
    const [daily, list, byCreator] = rows.slice(4);
    return {
      ...base,
      daily: daily.map((r) => ({ day: r.day, subs: Number(r.subs) || 0, spend_d0: r2(r.spend_d0), revenue: r2(r.revenue), ltv_d0: Number(r.subs) ? r2(r.spend_d0 / r.subs) : null })),
      list: list.map((r) => ({ ...r, creator_id: Number(r.creator_id), name: nameOf(r.creator_id), revenue: r2(r.revenue), spend_d0: r2(r.spend_d0) })),
      creatorCr: byCreator.map((r) => {
        const subs = Number(r.subs) || 0, conv = Number(r.conv) || 0, subsP = Number(r.subs_prev) || 0, convP = Number(r.conv_prev) || 0;
        const cr = subs ? conv / subs : null, crP = subsP ? convP / subsP : null;
        const arppu = conv ? r.revenue / conv : null, arppuP = convP ? r.revenue_prev / convP : null;
        return { creator_id: Number(r.creator_id), name: nameOf(r.creator_id), subs, conv, conv_delta: pctDelta(conv, convP), cr, cr_delta: cr != null && crP ? (cr - crP) / crP : null,
          arppu: arppu == null ? null : r2(arppu), revenue: r2(r.revenue) };
      }).sort((a, b) => b.cr - a.cr),
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
  "nuovi-abbonati": (refs, ids, range) => [nuoviMetricsSql(refs, ids, range, "sub_type"), nuoviMetricsSql(refs, ids, range, "creator_id"), nuoviPersoneSql(refs, ids, range), nuoviLinkSql(refs, ids, range)],
  tracking: (refs, ids, range) => [trackingSql(refs, ids, range)],
  copertura: (refs, ids, range) => [coperturaSql(refs, ids, range), coperturaDailySql(refs, ids, range)],
  notifiche: (refs, ids, range) => [notificheAggSql(refs, ids, range), notificheListSql(refs, ids, range)],
  welcome: (refs, ids, range) => [welcomeSql(refs, ids, range)],
  "ricerca-fan": (refs, ids, range, q) => [ricercaSql(refs, ids, q)],
  diagnosi: (refs, ids, range) => [diagnosiSql(refs, ids, range), diagnosiDailySql(refs, ids, range)],
  "lk-recap": (refs, ids, range) => [recapSql(refs, ids, range), lkRecapDailyNetSql(refs, ids, range), lkRecapDailySubsSql(refs, ids, range)],
  "lk-clicks": (refs, ids, range) => [lkClicksSql(refs, ids, range)],
  "lk-welcome": (refs, ids, range) => [welcomeSql(refs, ids, range), lkWelcomeDailySql(refs, ids, range)],
  "lk-perf": (refs, ids, range) => [lkPerfSql(refs, ids, range), lkSubsRangeSql(refs, ids, range, "subscription_range"), lkSubsRangeSql(refs, ids, range, "creator_id"), lkAmountRangeSql(refs, ids, range)],
  "lk-tx": (refs, ids, range, q, f) => [lkTxListSql(refs, ids, range, f), lkTxSummarySql(refs, ids, range, f), lkTxSeriesSql(refs, ids, range, f), lkTxTopUsersSql(refs, ids, range, f)],
  "lk-users": (refs, ids, range, q, f) => [lkUsersSql(refs, ids, range, f)],
  "lk-chargebacks": (refs, ids, range, q, f) => [lkChargebacksSql(refs, ids, range, f)],
  "lk-overall": (refs, ids) => [lkOverallSql(refs, ids, new Date().toISOString().slice(0, 10)), lkOverallDailySql(refs, ids, new Date().toISOString().slice(0, 10))],
  "lk-newsubs": (refs, ids, range) => [
    nuoviMetricsSql(refs, ids, range, "sub_type"), nuoviMetricsSql(refs, ids, range, "creator_id"), nuoviPersoneSql(refs, ids, range), nuoviLinkSql(refs, ids, range),
    lkNewsubsDailySql(refs, ids, range), lkNewsubsListSql(refs, ids, range), lkNewsubsCreatorSql(refs, ids, range),
  ],
  creator: (refs, ids, range) => [
    diagnosiSql(refs, ids, range), diagnosiDailySql(refs, ids, range), trackingSql(refs, ids, range), chargebackSql(refs, ids, range),
    welcomeSql(refs, ids, range), rapportoSql(refs, ids, { from: `${range.to.slice(0, 7)}-01`, to: range.to }), nuoviMetricsSql(refs, ids, range, "sub_type"),
  ],
};

/**
 * Una vista per le creator `ids` (già filtrate per visibilità). Cache 10 minuti per
 * vista + periodo + creator: i dati di base si aggiornano in tempo quasi reale.
 */
export async function getAnalisi(view, ids, query = {}, { force = false } = {}) {
  if (!BUILDERS[view]) throw new Error("vista sconosciuta");
  const range = normalizeRange(view, query);
  const q = view === "ricerca-fan" ? cleanSearch(query.q) : null;
  if (view === "ricerca-fan" && !q) return { view, range, rows: [], needsQuery: true, source: null, computed_at: new Date().toISOString() };
  // filtri delle pagine Looker (link, utente, tipo, spending, username, pagamento): validati nelle query
  const f = Object.fromEntries(Object.entries(query.f || {}).filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => [k, String(v).trim().slice(0, 80)]));
  const fk = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("&");
  const key = `analisi:v5:${view}:${range.from}:${range.to}:${q || ""}:${fk}:${[...ids].sort((a, b) => a - b).join(",")}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return { ...hit, cached: true };
  }
  const creators = await splitCreators();
  const names = Object.fromEntries(creators.map((c) => [c.id, c.name]));
  const { source, rows } = await runOnSource((refs) => BUILDERS[view](refs, ids, range, q, f), view.startsWith("lk-") ? { maxBytesBilled: 20 * 1024 ** 3, timeoutMs: 45_000 } : undefined);
  const out = { view, range, source, computed_at: new Date().toISOString(), ...(q ? { q } : {}), ...(fk ? { filters: f } : {}), ...shape(view, rows, names, range) };
  await kv.set(key, out, { ex: 600 }).catch(() => {});
  return out;
}
