// Archivio NOSTRO dei dati OnlyFansAPI, nel progetto BigQuery di Nicholas
// (`<billing project>.ofapi`). È il primo pezzo del warehouse indipendente:
// vedi docs/INDIPENDENZA_DATI.md.
//
//   transactions          una riga per transazione (MERGE: lo stato può cambiare, es. rimborso → "undo")
//   tracking_links_daily  fotografia giornaliera dei contatori cumulativi di tracking e trial link
//   webhook_events        ogni evento in tempo reale ricevuto (messaggi, abbonati, acquisti…), intero
//
// Scrive con lo scope pieno del service account, che ha BigQuery Data Editor
// SOLO su hoc-pro (mai sul warehouse dell'altra parte).

import { bqApi, bqProjects } from "@/lib/bigquery-api";

export const OFAPI_DATASET = "ofapi";
const LOCATION = "europe-west3";
const MAX_BYTES = String(5 * 10 ** 9);

const TABLES = {
  transactions: {
    schema: [
      ["day", "DATE"], ["created_at", "TIMESTAMP"], ["account_id", "STRING"], ["onlyfans_id", "INT64"],
      ["tx_id", "STRING"], ["type", "STRING"], ["status", "STRING"], ["amount", "FLOAT64"], ["net", "FLOAT64"],
      ["fee", "FLOAT64"], ["vat", "FLOAT64"], ["currency", "STRING"], ["fan_id", "INT64"], ["fan_username", "STRING"],
      ["description", "STRING"], ["ingested_at", "TIMESTAMP"],
    ],
    partition: "day",
    clustering: ["account_id"],
  },
  tracking_links_daily: {
    schema: [
      ["snapshot_date", "DATE"], ["account_id", "STRING"], ["onlyfans_id", "INT64"], ["kind", "STRING"],
      ["link_id", "INT64"], ["name", "STRING"], ["url", "STRING"], ["created_at", "TIMESTAMP"], ["end_at", "STRING"],
      ["clicks", "INT64"], ["subscribers", "INT64"], ["trial_limit", "INT64"], ["revenue", "FLOAT64"],
      ["chargebacks", "FLOAT64"], ["spenders", "INT64"], ["revenue_pending", "BOOL"], ["ingested_at", "TIMESTAMP"],
    ],
    partition: "snapshot_date",
    clustering: ["account_id", "kind"],
  },
  webhook_events: {
    schema: [["received_at", "TIMESTAMP"], ["event", "STRING"], ["account_id", "STRING"], ["idempotency_key", "STRING"], ["payload", "STRING"]],
    partition: "received_at",
    clustering: ["event", "account_id"],
  },
};

function projectId() {
  return bqProjects().billingProject;
}

/** Crea dataset e tabelle se mancano (idempotente, poche chiamate GET). */
export async function ensureOfapiTables() {
  const p = projectId();
  try {
    await bqApi(`/projects/${p}/datasets/${OFAPI_DATASET}`, { write: true });
  } catch (e) {
    if (e.status !== 404) throw e;
    await bqApi(`/projects/${p}/datasets`, {
      method: "POST",
      write: true,
      body: {
        datasetReference: { projectId: p, datasetId: OFAPI_DATASET },
        location: LOCATION,
        description: "Dati OnlyFansAPI di HOC Pro (warehouse indipendente). Vedi src/lib/ofapi-store.js.",
      },
    });
  }
  for (const [tableId, t] of Object.entries(TABLES)) {
    try {
      await bqApi(`/projects/${p}/datasets/${OFAPI_DATASET}/tables/${tableId}`, { write: true });
    } catch (e) {
      if (e.status !== 404) throw e;
      await bqApi(`/projects/${p}/datasets/${OFAPI_DATASET}/tables`, {
        method: "POST",
        write: true,
        body: {
          tableReference: { projectId: p, datasetId: OFAPI_DATASET, tableId },
          schema: { fields: t.schema.map(([name, type]) => ({ name, type })) },
          timePartitioning: { type: "DAY", field: t.partition },
          clustering: { fields: t.clustering },
        },
      });
    }
  }
}

/** Query con parametri nominati (tutti STRING o INT64), attesa fino al completamento. */
async function runQuery(query, params) {
  const p = projectId();
  const queryParameters = Object.entries(params).map(([name, value]) => ({
    name,
    parameterType: { type: typeof value === "number" ? "INT64" : "STRING" },
    parameterValue: { value: String(value) },
  }));
  let r = await bqApi(`/projects/${p}/queries`, {
    method: "POST",
    write: true,
    body: { query, useLegacySql: false, location: LOCATION, parameterMode: "NAMED", queryParameters, maximumBytesBilled: MAX_BYTES, timeoutMs: 30000 },
  });
  for (let i = 0; !r.jobComplete && i < 20; i++) {
    r = await bqApi(`/projects/${p}/queries/${r.jobReference.jobId}`, { write: true, params: { location: LOCATION, timeoutMs: 10000, maxResults: 0 } });
  }
  if (!r.jobComplete) throw new Error("query BigQuery non completata in tempo");
  if (r.errors?.length) throw new Error(r.errors[0].message);
  return r;
}

/** Inserisce o aggiorna le transazioni lette da OnlyFansAPI per un account. */
export async function storeTransactions(accountId, onlyfansId, list) {
  if (!list?.length) return 0;
  const t = `\`${projectId()}.${OFAPI_DATASET}.transactions\``;
  await runQuery(
    `MERGE ${t} T
     USING (
       SELECT DATE(TIMESTAMP(JSON_VALUE(r,'$.createdAt'))) AS day, TIMESTAMP(JSON_VALUE(r,'$.createdAt')) AS created_at,
              @account AS account_id, @ofid AS onlyfans_id, JSON_VALUE(r,'$.id') AS tx_id,
              JSON_VALUE(r,'$.type') AS type, JSON_VALUE(r,'$.status') AS status,
              SAFE_CAST(JSON_VALUE(r,'$.amount') AS FLOAT64) AS amount, SAFE_CAST(JSON_VALUE(r,'$.net') AS FLOAT64) AS net,
              SAFE_CAST(JSON_VALUE(r,'$.fee') AS FLOAT64) AS fee, SAFE_CAST(JSON_VALUE(r,'$.vatAmount') AS FLOAT64) AS vat,
              JSON_VALUE(r,'$.currency') AS currency, SAFE_CAST(JSON_VALUE(r,'$.user.id') AS INT64) AS fan_id,
              JSON_VALUE(r,'$.user.username') AS fan_username, JSON_VALUE(r,'$.description') AS description,
              CURRENT_TIMESTAMP() AS ingested_at
       FROM UNNEST(JSON_QUERY_ARRAY(@rows)) r
     ) S
     ON T.account_id = S.account_id AND T.tx_id = S.tx_id AND T.day = S.day
     WHEN MATCHED THEN UPDATE SET status = S.status, amount = S.amount, net = S.net, fee = S.fee, vat = S.vat, ingested_at = S.ingested_at
     WHEN NOT MATCHED THEN INSERT ROW`,
    { account: accountId, ofid: Number(onlyfansId), rows: JSON.stringify(list) }
  );
  return list.length;
}

/** Fotografia del giorno dei tracking link o trial link di un account (sostituisce quella già presente). */
export async function storeLinksSnapshot(accountId, onlyfansId, kind, snapshotDate, list) {
  const t = `\`${projectId()}.${OFAPI_DATASET}.tracking_links_daily\``;
  const trial = kind === "trial";
  await runQuery(
    `DELETE FROM ${t} WHERE snapshot_date = DATE(@day) AND account_id = @account AND kind = @kind;
     INSERT INTO ${t}
     SELECT DATE(@day), @account, @ofid, @kind,
            SAFE_CAST(JSON_VALUE(r,'$.id') AS INT64),
            JSON_VALUE(r, '${trial ? "$.trialLinkName" : "$.campaignName"}'),
            JSON_VALUE(r, '${trial ? "$.url" : "$.campaignUrl"}'),
            SAFE.TIMESTAMP(JSON_VALUE(r,'$.createdAt')),
            JSON_VALUE(r, '${trial ? "$.expiredAt" : "$.endDate"}'),
            SAFE_CAST(JSON_VALUE(r, '${trial ? "$.clicksCounts" : "$.clicksCount"}') AS INT64),
            SAFE_CAST(JSON_VALUE(r, '${trial ? "$.claimCounts" : "$.subscribersCount"}') AS INT64),
            ${trial ? "SAFE_CAST(JSON_VALUE(r,'$.subscribeCounts') AS INT64)" : "NULL"},
            SAFE_CAST(JSON_VALUE(r,'$.revenue.total') AS FLOAT64),
            SAFE_CAST(JSON_VALUE(r,'$.revenue.chargebacks') AS FLOAT64),
            SAFE_CAST(JSON_VALUE(r,'$.revenue.spendersCount') AS INT64),
            SAFE_CAST(JSON_VALUE(r,'$.revenue.isLoading') AS BOOL),
            CURRENT_TIMESTAMP()
     FROM UNNEST(JSON_QUERY_ARRAY(@rows)) r`,
    { day: snapshotDate, account: accountId, ofid: Number(onlyfansId), kind, rows: JSON.stringify(list || []) }
  );
  return list?.length || 0;
}

/** Salva un evento webhook (streaming). insertId = chiave di idempotenza: i reinvii non duplicano. */
export async function insertWebhookEvent(row) {
  const p = projectId();
  const send = () =>
    bqApi(`/projects/${p}/datasets/${OFAPI_DATASET}/tables/webhook_events/insertAll`, {
      method: "POST",
      write: true,
      body: { rows: [{ ...(row.idempotency_key ? { insertId: row.idempotency_key } : {}), json: row }] },
    });
  let r;
  try {
    r = await send();
  } catch (e) {
    if (e.status !== 404) throw e;
    await ensureOfapiTables();
    r = await send();
  }
  if (r.insertErrors?.length) throw new Error("insertAll: " + JSON.stringify(r.insertErrors[0]).slice(0, 200));
}
