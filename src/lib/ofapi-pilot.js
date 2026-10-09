// Pilota di indipendenza dei dati (9/10/2026): ogni notte, per ogni account
// collegato a OnlyFansAPI, controlla che sia ancora autenticato (rischio ban)
// e confronta le transazioni del giorno prima con il warehouse
// (postgres.public_transactions, CDC della piattaforma attuale).
// Esito in KV `ofapi:pilot:history` (ultimi 60 giri) e nel heartbeat.
// Dal 9/10/2026 ARCHIVIA anche, con le stesse letture (niente crediti doppi):
// transazioni e fotografia di tracking/trial link in `hoc-pro.ofapi` (lib/ofapi-store).
// Vedi docs/INDIPENDENZA_DATI.md.

import { kv } from "@vercel/kv";
import { bqQuery, bqProjects } from "@/lib/bigquery-api";
import { listOfapiAccounts, listOfapiTransactions, listOfapiLinks } from "@/lib/ofapi-client";
import { ensureOfapiTables, storeTransactions, storeLinksSnapshot } from "@/lib/ofapi-store";
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

/**
 * Un giro (o una tappa del giro). Con molti account il giro supera i 300 s di
 * una funzione (≈12 s per account col ritmo prudente di ofapi-client): si
 * lavora a tappe — dall'account `start`, finché resta budget — e si restituisce
 * `nextStart` (null = finito). La route rilancia sé stessa (cron-chain).
 */
export async function runOfapiPilot({ now = new Date(), day = yesterdayUTC(now), start = 0, budgetMs = 200000 } = {}) {
  const t0 = Date.now();
  const { dataProject } = bqProjects();
  const accounts = await listOfapiAccounts();
  const snapshotDate = now.toISOString().slice(0, 10);
  let storeReady = true;
  try {
    await ensureOfapiTables();
  } catch (e) {
    storeReady = false;
    console.error("ofapi: archivio non disponibile", e?.message);
  }
  const wh = await warehouseDay(dataProject, accounts.map((a) => a.onlyfansId), day);

  const results = [];
  let credits = 0;
  let nextStart = null;
  for (let i = start; i < accounts.length; i++) {
    if (i > start && Date.now() - t0 > budgetMs) {
      nextStart = i;
      break;
    }
    const a = accounts[i];
    const base = { account: a.name, username: a.username, onlyfansId: a.onlyfansId, authenticated: a.authenticated, authProgress: a.authProgress };
    if (!a.authenticated) {
      results.push({ ...base, verdict: verdict(base) });
      continue;
    }
    try {
      const tx = await listOfapiTransactions(a.id, `${day} 00:00:00`);
      credits += tx.credits;
      const comparison = compareDay(apiTxOfDay(tx.list, day), wh[a.onlyfansId] || []);
      // archivio: un errore qui non cambia il verdetto del confronto, si annota e basta
      const stored = { transactions: 0, tracking: 0, trial: 0 };
      let storeError = storeReady ? null : "archivio non disponibile";
      if (storeReady) {
        try {
          stored.transactions = await storeTransactions(a.id, a.onlyfansId, tx.list);
          for (const kind of ["tracking", "trial"]) {
            const links = await listOfapiLinks(a.id, kind);
            credits += links.credits;
            stored[kind] = await storeLinksSnapshot(a.id, a.onlyfansId, kind, snapshotDate, links.list);
          }
        } catch (e) {
          storeError = e.message;
        }
      }
      results.push({ ...base, truncated: tx.truncated, comparison, stored, storeError, verdict: verdict({ ...base, comparison, truncated: tx.truncated }) });
    } catch (e) {
      results.push({ ...base, error: e.message, verdict: e.status === 401 || e.status === 403 ? "disconnesso" : "errore" });
    }
  }

  // le tappe dello stesso giorno si sommano nella stessa voce di storico
  const history = (await kv.get(KV_HISTORY)) || [];
  const prev = start > 0 ? history.find((r) => r.day === day) : null;
  const run = {
    at: prev?.at || now.toISOString(),
    day,
    credits: (prev?.credits || 0) + credits,
    results: [...(prev?.results || []), ...results],
    complete: nextStart === null,
  };
  await kv.set(KV_HISTORY, [run, ...history.filter((r) => r.day !== day)].slice(0, 60));
  return { ...run, nextStart, stepResults: results };
}
