// node tests/warehouse-backup.mjs
import assert from "node:assert/strict";
import { planBackup, jobConfiguration, backupTableName } from "../src/lib/warehouse-backup-core.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const P = { dataProject: "src-proj", billingProject: "bill-proj" };

// nomi
ok(backupTableName("onlyfans", "chat") === "onlyfans__chat", "nome destinazione");

// primo giro: niente storico → copia tutto
{
  const { jobs, skipped } = planBackup([
    { dataset: "onlyfans", table: "chat", mode: "copy", numRows: 100 },
    { dataset: "postgres", table: "public_creators", mode: "ctas", numRows: 342, clustering: ["id"] },
  ]);
  ok(jobs.length === 2 && skipped.length === 0, "primo giro copia tutto");
  ok(jobs[1].mode === "ctas" && jobs[1].clustering[0] === "id", "postgres resta ctas con clustering");
}

// guardia: calo sotto metà → salta
{
  const { jobs, skipped } = planBackup(
    [{ dataset: "onlyfans", table: "attributed_transactions", mode: "copy", numRows: 1000 }],
    { onlyfans__attributed_transactions: 5_953_928 }
  );
  ok(jobs.length === 0 && skipped[0].reason === "shrink", "upstream svuotato non sovrascrive la copia");
  ok(skipped[0].prev === 5_953_928 && skipped[0].now === 1000, "lo skip riporta i numeri");
}

// guardia: tabella vuota a monte → salta
{
  const { skipped } = planBackup([{ dataset: "onlyfans", table: "x", mode: "copy", numRows: 0 }], { onlyfans__x: 50_000 });
  ok(skipped.length === 1, "zero righe a monte = salta");
}

// guardia: calo normale (sopra metà) → copia
{
  const { jobs } = planBackup([{ dataset: "onlyfans", table: "x", mode: "copy", numRows: 40_000 }], { onlyfans__x: 50_000 });
  ok(jobs.length === 1, "calo del 20% passa (tabelle ricostruite ogni notte possono oscillare)");
}

// guardia: tabelle piccole oscillano liberamente
{
  const { jobs } = planBackup([{ dataset: "postgres", table: "y", mode: "ctas", numRows: 10 }], { postgres__y: 900 });
  ok(jobs.length === 1, "sotto 1000 righe di riferimento niente guardia");
}

// partizionata in modalità ctas → copy
{
  const { jobs } = planBackup([{ dataset: "postgres", table: "z", mode: "ctas", numRows: 5, partitioned: true }]);
  ok(jobs[0].mode === "copy", "partizionata passa dalla copy job");
}

// configurazione job: copy
{
  const cfg = jobConfiguration({ key: "hoc__ws_chat", dataset: "hoc", table: "ws_chat", mode: "copy", clustering: [] }, P);
  ok(cfg.copy.sourceTable.projectId === "src-proj" && cfg.copy.sourceTable.tableId === "ws_chat", "copy legge dal progetto dati");
  ok(cfg.copy.destinationTable.projectId === "bill-proj" && cfg.copy.destinationTable.datasetId === "warehouse_backup", "copy scrive nel progetto di Nicholas");
  ok(cfg.copy.writeDisposition === "WRITE_TRUNCATE", "copy sovrascrive");
}

// configurazione job: ctas
{
  const cfg = jobConfiguration({ key: "postgres__public_creators", dataset: "postgres", table: "public_creators", mode: "ctas", clustering: ["id"] }, P);
  const q = cfg.query.query;
  ok(q.startsWith("CREATE OR REPLACE TABLE `bill-proj.warehouse_backup.postgres__public_creators` CLUSTER BY `id` AS SELECT * FROM `src-proj.postgres.public_creators`"), "ctas SQL: " + q);
  ok(Number(cfg.query.maximumBytesBilled) > 0 && Number(cfg.query.maximumBytesBilled) <= 50e9, "ctas con tetto di spesa");
  const noCl = jobConfiguration({ key: "postgres__a", dataset: "postgres", table: "a", mode: "ctas", clustering: [] }, P);
  ok(!noCl.query.query.includes("CLUSTER BY"), "senza clustering niente CLUSTER BY");
}

console.log(`warehouse-backup: ${n} asserzioni ok`);
