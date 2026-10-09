// Copia di sicurezza giornaliera del warehouse HOC nel progetto di Nicholas.
//
// PERCHÉ (9/10/2026): i dati di HOC vivono in `house-of-creators-358213`, un
// progetto che non controlliamo (accesso in sola lettura concesso dal
// proprietario). La pipeline che li produce (Datastream → postgres.* →
// Dataform 05:00 UTC → onlyfans.*) e il suo codice (GitHub privato) non sono
// nostri. Se l'accesso venisse revocato perderemmo anche lo STORICO. Questa
// copia lo tiene nel billing project (`hoc-pro.warehouse_backup`), con nome
// `<dataset>__<tabella>`. Mappa completa: docs/warehouse-snapshot-2026-10-09/.
//
// COME:
//   - onlyfans.* e hoc.ws_chat → copy job (stessa regione = gratis).
//   - postgres.* → CREATE OR REPLACE TABLE AS SELECT: sono tabelle CDC di
//     Datastream e la copy job salta le righe ancora nel buffer di streaming.
//     ~15 GB letti al giorno (pochi centesimi), tetto per job in MAX_BYTES_CTAS.
//   - Le viste NON si copiano (il loro SQL è salvato nel repo); le tabelle
//     esterne (fogli Google) nemmeno: il service account non può leggerle.
//
// GUARDIA: se una tabella di origine scende sotto metà delle righe che aveva
// all'ultima copia riuscita, NON la sovrascriviamo (un upstream svuotato o
// rotto distruggerebbe proprio la copia che serve). Resta saltata e segnalata
// finché qualcuno non guarda; il time travel di BigQuery (7 giorni) copre il resto.
//
// I job partono in asincrono (la copia di ws_chat, 735 GB, dura minuti): l'esito
// si legge al giro successivo e finisce nel heartbeat `cron:heartbeat:warehouse-backup`.

import { kv } from "@vercel/kv";
import { bqApi, bqProjects } from "@/lib/bigquery-api";

import {
  BACKUP_DATASET,
  BACKUP_LOCATION,
  BACKUP_SOURCES,
  planBackup,
  jobConfiguration,
} from "@/lib/warehouse-backup-core";

const KV_STATE = "warehouse:backup:state";

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function listTables(project, dataset) {
  const tables = [];
  let pageToken;
  do {
    const r = await bqApi(`/projects/${project}/datasets/${dataset}/tables`, { params: { maxResults: 1000, pageToken } });
    tables.push(...(r.tables || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return tables;
}

async function ensureDataset(billingProject) {
  try {
    await bqApi(`/projects/${billingProject}/datasets/${BACKUP_DATASET}`, { write: true });
  } catch (e) {
    if (e.status !== 404) throw e;
    await bqApi(`/projects/${billingProject}/datasets`, {
      method: "POST",
      write: true,
      body: {
        datasetReference: { projectId: billingProject, datasetId: BACKUP_DATASET },
        location: BACKUP_LOCATION,
        description: "Copia di sicurezza del warehouse HOC (onlyfans, postgres, hoc.ws_chat). Vedi src/lib/warehouse-backup.js.",
      },
    });
  }
}

/** Esito dei job lanciati al giro precedente. */
async function checkPreviousJobs(billingProject, previous) {
  if (!previous?.jobs?.length) return null;
  const results = await inBatches(previous.jobs, 15, async ({ id, key, numRows }) => {
    try {
      const j = await bqApi(`/projects/${billingProject}/jobs/${id}`, { write: true, params: { location: BACKUP_LOCATION } });
      const st = j.status || {};
      if (st.state !== "DONE") return { key, state: "running" };
      return st.errorResult ? { key, state: "error", error: st.errorResult.message } : { key, state: "ok", numRows };
    } catch (e) {
      return { key, state: "error", error: e.message };
    }
  });
  return {
    date: previous.date,
    ok: results.filter((r) => r.state === "ok").length,
    running: results.filter((r) => r.state === "running").length,
    errors: results.filter((r) => r.state === "error").map((r) => `${r.key}: ${String(r.error).slice(0, 120)}`),
    okRows: Object.fromEntries(results.filter((r) => r.state === "ok").map((r) => [r.key, r.numRows])),
  };
}

/** Un giro completo: controlla il giro precedente, pianifica, lancia i job. */
export async function runWarehouseBackup({ now = new Date() } = {}) {
  const { billingProject, dataProject } = bqProjects();
  if (!dataProject) throw new Error("BIGQUERY_DATA_PROJECT non configurato");
  const state = (await kv.get(KV_STATE)) || { lastRows: {} };

  const previous = await checkPreviousJobs(billingProject, state.pending);
  // Le righe di riferimento della guardia si aggiornano solo con copie RIUSCITE.
  const lastRows = { ...(state.lastRows || {}), ...(previous?.okRows || {}) };

  await ensureDataset(billingProject);

  const listed = [];
  for (const src of BACKUP_SOURCES) {
    const tables = (await listTables(dataProject, src.dataset)).filter(
      (t) => t.type === "TABLE" && (!src.only || src.only.includes(t.tableReference.tableId))
    );
    for (const t of tables) listed.push({ src, tableId: t.tableReference.tableId });
  }
  // tables.list non riporta le righe: serve tables.get per la guardia.
  const sources = await inBatches(listed, 15, async ({ src, tableId }) => {
    const t = await bqApi(`/projects/${dataProject}/datasets/${src.dataset}/tables/${tableId}`);
    return {
      dataset: src.dataset,
      table: tableId,
      mode: src.mode,
      numRows: Number(t.numRows || 0),
      clustering: t.clustering?.fields || [],
      partitioned: Boolean(t.timePartitioning || t.rangePartitioning),
    };
  });

  const { jobs, skipped } = planBackup(sources, lastRows);
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = now.getTime().toString(36);
  const submitted = await inBatches(jobs, 10, async (job) => {
    const id = `wbackup_${day}_${stamp}_${job.key}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 1024);
    try {
      await bqApi(`/projects/${billingProject}/jobs`, {
        method: "POST",
        write: true,
        body: {
          jobReference: { projectId: billingProject, jobId: id, location: BACKUP_LOCATION },
          configuration: jobConfiguration(job, { dataProject, billingProject }),
        },
      });
      return { id, key: job.key, numRows: job.numRows };
    } catch (e) {
      return { key: job.key, error: e.message };
    }
  });

  const pending = submitted.filter((s) => s.id);
  const submitErrors = submitted.filter((s) => s.error).map((s) => `${s.key}: ${String(s.error).slice(0, 120)}`);
  await kv.set(KV_STATE, { lastRows, pending: { date: now.toISOString(), jobs: pending }, previous, skipped, submitErrors });

  return { submitted: pending.length, skipped, submitErrors, previous: previous && { ...previous, okRows: undefined } };
}
