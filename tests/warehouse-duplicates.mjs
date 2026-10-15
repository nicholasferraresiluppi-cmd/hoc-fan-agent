// node tests/warehouse-duplicates.mjs
import assert from "node:assert/strict";
import { duplicatesSql, classifyDuplicates, mergeSubstitutions, dedupeIds } from "../src/lib/warehouse-duplicates-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const sql = duplicatesSql({ creators: "p.pg.creators", attributed: "p.of.at" });
ok(sql.includes("deleted_at IS NULL") && sql.includes("HAVING COUNT(*) > 1"), "solo record vivi con account condiviso");
ok(sql.includes("ORDER BY created_at, id LIMIT 1"), "si tiene il più vecchio");
ok(sql.includes("ABS(a.g - b.g) < 0.01"), "giorni identici al centesimo");

const row = (o) => ({ platform_id: 1, keep_id: 10, keep_name: "Elisa - IT", id: 20, name: "Elisa", both_days: 0, identical_days: 0, gross_doubled: 0, ...o });
const [dup, pass, sep] = classifyDuplicates([
  row({ id: 20, both_days: 81, identical_days: 80, gross_doubled: 94472 }),
  row({ id: 21, both_days: 4, identical_days: 2, gross_doubled: 598 }),
  row({ id: 22 }),
]);
ok(dup.kind === "doppione" && dup.drop.id === 20 && dup.keep.id === 10, "copia identica = doppione");
ok(pass.kind === "passaggio", "pochi giorni non identici = passaggio");
ok(sep.kind === "separati", "nessun giorno in comune = separati");
ok(classifyDuplicates([row({ both_days: 2, identical_days: 2 })])[0].kind === "passaggio", "sotto 3 giorni non basta");
ok(classifyDuplicates([row({ both_days: 10, identical_days: 7 })])[0].kind === "passaggio", "sotto l'80% non basta");

// appiccicosa: un doppione resta sostituito anche quando non compare più
const subs1 = mergeSubstitutions({}, [dup, pass]);
ok(subs1[20] === 10 && subs1[21] === undefined, "si sostituiscono solo i doppioni");
const subs2 = mergeSubstitutions(subs1, []);
ok(subs2[20] === 10, "appiccicosa");
ok(mergeSubstitutions({ 3: 2, 2: 1 }, [])[3] === 1, "catene risolte");
ok(mergeSubstitutions({ 1: 2, 2: 1 }, [])[1] != null, "nessun ciclo infinito");

ok(JSON.stringify(dedupeIds([5, 20, 10, 7], subs1)) === "[5,10,7]", "doppione sostituito, niente ripetizioni, ordine tenuto");
ok(JSON.stringify(dedupeIds([20], subs1)) === "[10]", "split col solo record doppio: la creator resta, col record giusto");
ok(JSON.stringify(dedupeIds(["5", 6], null)) === "[5,6]", "senza mappa non cambia niente");
console.log(`warehouse-duplicates: ${n} asserzioni ok`);
