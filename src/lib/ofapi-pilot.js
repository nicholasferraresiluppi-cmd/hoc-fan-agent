// Pilota di indipendenza dei dati (9/10/2026): ogni notte, per ogni account
// collegato a OnlyFansAPI, controlla che sia ancora autenticato (rischio ban)
// e confronta le transazioni del giorno prima con il warehouse
// (postgres.public_transactions, CDC della piattaforma attuale).
// Esito in KV `ofapi:pilot:history` (ultimi 60 giri) e nel heartbeat.
// Vedi docs/INDIPENDENZA_DATI.md.

import { kv } from "@vercel/kv";
import { bqQuery, bqProjects } from "@/lib/bigquery-api";
import { listOfapiAccounts, listOfapiTransactions } from "@/lib/ofapi-client";
import { apiTxOfDay, compareDay, pickCreatorId, verdict } from "@/lib/ofapi-pilot-core";

const KV_HISTORY = "ofapi:pilot:history";

function yesterdayUTC(now) {
  const d = new Date(now.getTime() - 86400e3);
  return d.toISOString().slice(0, 10);
}

/** Transazioni del giorno dal warehouse, una sola query per tutti gli account (~0,4 GB). */
async function warehouseDay(dataProject, onlyfansIds, day) {
  if (!onlyfansIds.length) return {};
  const ids = onlyfansIds.map(Number).filter(Number.isFinite).join(",");
  const next = new Date(Date.parse(day + "T00:00:00Z") + 86400e3).toISOString().slice(0, 10);
  const { rows } = await bqQuery(
    `SELECT c.platform_id, t.creator_id, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', t.created_at) AS created_at,
            t.net, t.user_id, t.type
     FROM \`${dataProject}.postgres.public_transactions\` t
     JOIN \`${dataProject}.postgres.public_creators\` c ON c.id = t.creator_id
     WHERE c.platform_id IN (${ids}) AND t.created_at >= '${day}' AND t.created_at < '${next}'`
  );
  const byPlatform = {};
  for (const r of rows) (byPlatform[r.platform_id] ||= []).push(r);
  // un account può avere più creator_id con righe duplicate: se ne tiene uno
  const out = {};
  for (const [pid, list] of Object.entries(byPlatform)) {
    const counts = Object.values(
      list.reduce((m, r) => ((m[r.creator_id] ||= { creator_id: r.creator_id, n: 0 }).n++, m), {})
    );
    const keep = pickCreatorId(counts);
    out[pid] = list.filter((r) => r.creator_id === keep);
  }
  return out;
}

export async function runOfapiPilot({ now = new Date(), day = yesterdayUTC(now) } = {}) {
  const { dataProject } = bqProjects();
  const accounts = await listOfapiAccounts();
  const wh = await warehouseDay(dataProject, accounts.map((a) => a.onlyfansId), day);

  const results = [];
  let credits = 0;
  for (const a of accounts) {
    const base = { account: a.name, username: a.username, onlyfansId: a.onlyfansId, authenticated: a.authenticated, authProgress: a.authProgress };
    if (!a.authenticated) {
      results.push({ ...base, verdict: verdict(base) });
      continue;
    }
    try {
      const tx = await listOfapiTransactions(a.id, `${day} 00:00:00`);
      credits += tx.credits;
      const comparison = compareDay(apiTxOfDay(tx.list, day), wh[a.onlyfansId] || []);
      results.push({ ...base, truncated: tx.truncated, comparison, verdict: verdict({ ...base, comparison, truncated: tx.truncated }) });
    } catch (e) {
      results.push({ ...base, error: e.message, verdict: e.status === 401 || e.status === 403 ? "disconnesso" : "errore" });
    }
  }

  const run = { at: now.toISOString(), day, credits, results };
  const history = ((await kv.get(KV_HISTORY)) || []).filter((r) => r.day !== day);
  await kv.set(KV_HISTORY, [run, ...history].slice(0, 60));
  return run;
}
