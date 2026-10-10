// node tests/looker-sql.mjs
import assert from "node:assert/strict";
import * as L from "../src/lib/looker-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const refs = new Proxy({}, { get: (_, k) => `p.ds.${String(k)}` });
const R = { from: "2026-10-03", to: "2026-10-09" };

// letterali sicuri: barre rovesciate prima, poi apici; niente a capo
ok(L.sqlStr("a'b") === "'a\\'b'", "apice");
ok(L.sqlStr("a\\'b") === "'a\\\\\\'b'", "barra + apice");
ok(!L.sqlStr("x\ny").includes("\n"), "niente a capo");
ok(L.sqlStr("x".repeat(500)).length <= 122, "max 120 caratteri");
// i filtri delle transazioni non permettono di uscire dalla stringa
const tx = L.lkTxListSql(refs, [1], R, { link: "x' OR 1=1 --", user: "5 OR 1=1", type: "tip'; DROP", spending: "a\\' OR '1'='1" });
ok(tx.includes("link_name = 'x\\' OR 1=1 --'"), "link chiuso nella stringa");
ok(tx.includes("user_id = 0"), "user_id non numerico → 0");
ok(tx.includes("type = 'tip'"), "type solo lettere minuscole e _");
ok(tx.includes("spending_id = 'a\\\\\\' OR \\'1\\'=\\'1'"), "spending_id chiuso nella stringa");
ok(L.lkUsersSql(refs, [1], R, { username: "ab'c; --", user: "x" }).includes("STARTS_WITH(LOWER(username), 'abc--')"), "username ripulito");
ok(L.lkChargebacksSql(refs, [1], R, { payment: "tips' OR", user: "12" }).includes("c.payment_type = 'tips'") , "payment_type ripulito");
assert.throws(() => L.lkSubsRangeSql(refs, [1], R, "creator_name")); n++;

// regole verificate contro Looker (10/10)
const sr = L.lkSubsRangeSql(refs, [1], R, "subscription_range");
ok(sr.includes("COUNT(DISTINCT IF(cur, user_id, NULL))") && !sr.includes("CONCAT(creator_id"), "ARPPU per fascia: fan distinti per user_id (3.162 come Looker)");
const ov = L.lkOverallSql(refs, [1], "2026-10-10");
ok(ov.includes("p.ds.subscriptions") && ov.includes("new_subs AS subs"), "Creator Overall: abbonati = SUM(new_subs)");
ok(ov.includes("unique_users") && ov.includes("AVG(IF(") && ov.includes("hoc_rpu"), "spending users = SUM(unique_users), Rev x User = AVG(revenue_per_user), HOC AVG");
ok(ov.includes("DATE_SUB(DATE '2026-10-10', INTERVAL 7 DAY) AND DATE_SUB(DATE '2026-10-10', INTERVAL 1 DAY)"), "ultimi 7 giorni fino a ieri");
ok(ov.includes("DATE_SUB(DATE '2026-10-10', INTERVAL 14 DAY) AND DATE_SUB(DATE '2026-10-10', INTERVAL 8 DAY)"), "7 giorni prima per il % Δ");
ok(!ov.includes("linksinbio"), "niente Links Visits (foglio Google non leggibile)");
const cl = L.lkClicksSql(refs, [1], R);
ok(cl.includes("FORMAT_DATE('%Y-%m', calendar_date) AS month") && cl.includes("DATE '2026-09-26'"), "Clicks: per mese, periodo prima incluso");
ok(L.lkAmountRangeSql(refs, [1], R).includes("SUM(num_transactions)"), "fasce di importo: SUM(num_transactions)");
console.log(`looker-sql: ${n} asserzioni ok`);
