// Logica pura della copia di sicurezza del warehouse (vedi warehouse-backup.js).
// Niente KV né rete: testata in tests/warehouse-backup.mjs.

export const BACKUP_DATASET = "warehouse_backup";
export const BACKUP_LOCATION = "europe-west3";
const MAX_BYTES_CTAS = 20 * 10 ** 9; // la tabella postgres più grande pesa ~4 GB
const SHRINK_GUARD = 0.5;
const GUARD_MIN_ROWS = 1000; // sotto questa soglia le oscillazioni sono normali

/** Sorgenti: dataset intero (solo TABLE) o singole tabelle. */
export const BACKUP_SOURCES = [
  { dataset: "onlyfans", mode: "copy" },
  { dataset: "postgres", mode: "ctas" },
  // newsubs_spending_daily (9/10/2026): la legge Analisi vendite → Nuovi abbonati
  { dataset: "hoc", mode: "copy", only: ["ws_chat", "newsubs_spending_daily"] },
];

// Colonne da NON copiare, per tabella ("dataset.tabella": [colonne]).
// Vuoto per decisione di Nicholas (9/10/2026): la copia è COMPLETA, credenziali
// incluse (token di sessione OnlyFans, password dei proxy, device token, graph
// token Meta) — sono dati di HOC e il progetto hoc-pro è suo. Attenzione: chi
// ha accesso a hoc-pro.warehouse_backup può usare quelle sessioni finché valide.
export const EXCLUDED_COLUMNS = {};

export const backupTableName = (dataset, table) => `${dataset}__${table}`;

/**
 * Logica pura: decide cosa copiare e cosa saltare.
 * @param {Array<{dataset, table, mode, numRows, clustering?: string[], partitioned?: boolean}>} sources
 * @param {Record<string, number>} lastRows - righe di origine all'ultima copia riuscita, per chiave
 * @returns {{ jobs: object[], skipped: object[] }}
 */
export function planBackup(sources, lastRows = {}) {
  const jobs = [];
  const skipped = [];
  for (const s of sources) {
    const key = backupTableName(s.dataset, s.table);
    const prev = Number(lastRows[key] || 0);
    const now = Number(s.numRows || 0);
    if (prev >= GUARD_MIN_ROWS && now < prev * SHRINK_GUARD) {
      skipped.push({ key, reason: "shrink", prev, now });
      continue;
    }
    // CTAS solo su tabelle non partizionate (PARTITION BY andrebbe ricostruito
    // dallo schema); le partizionate passano dalla copy job, che conserva lo schema.
    const except = EXCLUDED_COLUMNS[`${s.dataset}.${s.table}`] || [];
    // con colonne escluse serve per forza la CTAS (la copy job copia tutto)
    const mode = (s.mode === "ctas" && !s.partitioned) || except.length ? "ctas" : "copy";
    jobs.push({ key, dataset: s.dataset, table: s.table, mode, clustering: s.clustering || [], numRows: now, except });
  }
  return { jobs, skipped };
}

/** Corpo del job BigQuery per una voce del piano. */
export function jobConfiguration(job, { dataProject, billingProject }) {
  const dest = { projectId: billingProject, datasetId: BACKUP_DATASET, tableId: job.key };
  if (job.mode === "copy") {
    return {
      copy: {
        sourceTable: { projectId: dataProject, datasetId: job.dataset, tableId: job.table },
        destinationTable: dest,
        writeDisposition: "WRITE_TRUNCATE",
        createDisposition: "CREATE_IF_NEEDED",
      },
    };
  }
  const cluster = job.clustering.length ? ` CLUSTER BY ${job.clustering.map((c) => `\`${c}\``).join(", ")}` : "";
  return {
    query: {
      query: `CREATE OR REPLACE TABLE \`${billingProject}.${BACKUP_DATASET}.${job.key}\`${cluster} AS SELECT *${job.except?.length ? ` EXCEPT(${job.except.map((c) => `\`${c}\``).join(", ")})` : ""} FROM \`${dataProject}.${job.dataset}.${job.table}\``,
      useLegacySql: false,
      maximumBytesBilled: String(MAX_BYTES_CTAS),
    },
  };
}
