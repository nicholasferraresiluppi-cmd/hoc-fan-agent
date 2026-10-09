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
  { dataset: "hoc", mode: "copy", only: ["ws_chat"] },
];

// Credenziali: NON si copiano (sessioni OnlyFans delle creator, password dei
// proxy, token Meta/dispositivi). Non servono a nessun numero e una loro copia
// è solo un'altra porta d'accesso agli account. Vale per ogni giro, anche per
// le tabelle in copy job (che per questo passano in CTAS).
export const EXCLUDED_COLUMNS = {
  "postgres.public_creators": ["token"],
  "postgres.public_proxies": ["password"],
  "postgres.public_sessions": ["device_token"],
  "postgres.public_accounts": ["graph_token"],
};

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
