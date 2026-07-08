/**
 * GET /api/admin/infloww-probe?creator=<substr>&days=<n>
 *
 * Verifica end-to-end + DIMENSIONAMENTO della connessione Infloww API (beta).
 *   - elenca TUTTI i creator connessi (quanti sono, come sono nominati)
 *   - sceglie il creator: ?creator=<substr> (match su name/userName/tagName),
 *     altrimenti il primo
 *   - con quel creatorId interroga transactions/refunds/messaggi/links su una
 *     finestra di ?days giorni (default 30), aggregando la revenue reale per tipo
 *
 * Read-only. Nessun dato personale dei fan viene restituito: solo nomi-campo,
 * conteggi e numeri aggregati. I nomi dei CREATOR (dato aziendale) sì, servono
 * per il mapping.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwGet, inflowwPaged, centsToUsd } from "@/lib/infloww-api";

export const maxDuration = 60;

function itemKeys(json) {
  const list = json?.data?.list;
  return Array.isArray(list) && list[0] ? Object.keys(list[0]) : [];
}

async function safe(fn) {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

export async function GET(req) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const missing = [];
  if (!process.env.INFLOWW_API_KEY) missing.push("INFLOWW_API_KEY");
  if (!process.env.INFLOWW_OID) missing.push("INFLOWW_OID");
  if (missing.length) {
    return Response.json({ error: `Env mancanti: ${missing.join(", ")}.`, base_url: "https://openapi.infloww.com" }, { status: 428 });
  }

  const url = new URL(req.url);
  const creatorQ = (url.searchParams.get("creator") || "").trim().toLowerCase();
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Roster completo creator connessi (sizing + naming per il mapping)
  const creatorsRes = await safe(() => inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 }));
  if (!creatorsRes.ok) return Response.json({ error: `/v1/creators fallito: ${creatorsRes.error}` }, { status: 502 });
  const allCreators = creatorsRes.value.items;
  const creators_index = allCreators.map((c) => ({ id: c.id, name: c.name, userName: c.userName }));

  // 2. Scelta creator
  let picked = null;
  if (creatorQ) {
    picked = allCreators.find((c) =>
      [c.name, c.userName, c.nickName, c.tagName].some((f) => String(f || "").toLowerCase().includes(creatorQ))
    ) || null;
  }
  if (!picked) picked = allCreators[0] || null;

  if (!picked) {
    return Response.json({ base_url: "https://openapi.infloww.com", connected_creators: { total: allCreators.length, truncated: creatorsRes.value.truncated }, creators_index, note: "Nessun creator selezionabile." });
  }
  const creatorId = picked.id;
  const noMatch = creatorQ && !allCreators.some((c) => [c.name, c.userName, c.nickName, c.tagName].some((f) => String(f || "").toLowerCase().includes(creatorQ)));

  // 3. Transazioni: paginiamo fino a 5 pagine (500) per stimare il VOLUME e la revenue per tipo
  const txRes = await safe(() => inflowwPaged("/v1/transactions", { query: { creatorId, startTime, endTime, platformCode: "OnlyFans" }, limit: 100, maxPages: 5 }));
  let transactions = { error: txRes.ok ? undefined : txRes.error };
  if (txRes.ok) {
    const list = txRes.value.items;
    const byType = {};
    let net = 0, gross = 0, fee = 0;
    for (const t of list) {
      const n = centsToUsd(t.net), g = centsToUsd(t.amount), f = centsToUsd(t.fee);
      net += n; gross += g; fee += f;
      const k = t.type || "?";
      if (!byType[k]) byType[k] = { n: 0, net_usd: 0 };
      byType[k].n++; byType[k].net_usd += n;
    }
    for (const k of Object.keys(byType)) byType[k].net_usd = Math.round(byType[k].net_usd * 100) / 100;
    transactions = {
      pulled: list.length,
      truncated: txRes.value.truncated,
      note: txRes.value.truncated ? `>= ${list.length} in ${days}gg (troncato a 5 pagine): volume alto` : `${list.length} in ${days}gg`,
      net_usd: Math.round(net * 100) / 100,
      gross_usd: Math.round(gross * 100) / 100,
      fee_usd: Math.round(fee * 100) / 100,
      by_type: byType,
      item_keys: itemKeys({ data: { list } }),
    };
  }

  // 4. Messaggi (aggreghiamo totalRevenue in $), refunds, links — 1 pagina ciascuno
  async function msgSummary(path) {
    const r = await safe(() => inflowwGet(path, { query: { creatorId, startTime, endTime, limit: 50, platformCode: "OnlyFans" } }));
    if (!r.ok) return { error: r.error };
    const list = r.value?.data?.list || [];
    const rev = list.reduce((s, m) => s + centsToUsd(m.totalRevenue), 0);
    const sent = list.reduce((s, m) => s + (Number(m.totalNumberOfTimeSent) || 0), 0);
    const buys = list.reduce((s, m) => s + (Number(m.totalNumberOfPurchases) || 0), 0);
    return { count: list.length, total_sent: sent, total_purchases: buys, total_revenue_usd: Math.round(rev * 100) / 100, item_keys: itemKeys(r.value) };
  }
  const automated = await msgSummary("/v1/automated-messages");
  const priority = await msgSummary("/v1/priority-mass-messages");

  const refundsR = await safe(() => inflowwGet("/v1/refunds", { query: { creatorId, startTime, endTime, limit: 50 } }));
  const refunds = refundsR.ok ? { count: (refundsR.value?.data?.list || []).length, item_keys: itemKeys(refundsR.value) } : { error: refundsR.error };

  const linksR = await safe(() => inflowwGet("/v1/links", { query: { creatorId, linkType: "CAMPAIGN", startTime, endTime, limit: 50 } }));
  const links_campaign = linksR.ok ? { count: (linksR.value?.data?.list || []).length, item_keys: itemKeys(linksR.value) } : { error: linksR.error };

  return Response.json({
    base_url: "https://openapi.infloww.com",
    window_days: days,
    connected_creators: { total: allCreators.length, truncated: creatorsRes.value.truncated },
    creators_index,
    picked: { creatorId, name: picked.name, userName: picked.userName, matched_query: creatorQ || null, no_match_fell_back_to_first: noMatch || undefined },
    transactions,
    refunds,
    automated_messages: automated,
    priority_mass_messages: priority,
    links_campaign,
  });
}
