// Unit test — squadra-core (funzioni pure). Esegui: node tests/squadra.mjs
// Copre le scelte facili da rompere: confronto coi colleghi SENZA se stessi,
// niente refusi tollerati sui nomi corti, almeno 2 colleghi per cella,
// quota dello split, disaccordo tra le due misure.
import assert from "node:assert/strict";
import {
  nameKey, matchName, rowHours, aggregateKpi, buildCells, compareWithPeers, rankPeriod,
  splitShare, rowFlags, measuresDisagree, monthRange, shiftMonth,
} from "../src/lib/squadra-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("nameKey toglie HOC, apostrofi e accenti", () => {
  assert.equal(nameKey("Flora D'Anna"), "floradanna");
  assert.equal(nameKey("Flora D Anna"), "floradanna");
  assert.equal(nameKey("Olenka HOC ES"), "olenka");
  assert.equal(nameKey("Niccolò"), "niccolo");
});

t("matchName: esatto, sottoinsieme, refuso solo su nomi lunghi, ambiguo = null", () => {
  const ops = ["Naz HOC", "Alessandro Izzo", "Pierricardo Lampasona", "Danie Ann Castro", "Danie Castro"];
  assert.equal(matchName("Naz HOC", ops), "Naz HOC");
  assert.equal(matchName("Max HOC", ops), null); // "max" ≠ "naz": nome corto, nessun refuso
  assert.equal(matchName("Felice Alessandro Izzo", ops), "Alessandro Izzo");
  assert.equal(matchName("Pierriccardo Lampasona", ops), "Pierricardo Lampasona");
  assert.equal(matchName("Danie", ops), null);
});

t("rowHours usa le ore attive Infloww", () => {
  assert.equal(rowHours({ sales: 1000, sales_per_hour: 50 }), 20);
  assert.equal(rowHours({ sales: 0, direct_messages_sent: 300, messages_sent_per_hour: 100 }), 3);
  assert.equal(rowHours({}), 0);
});

const row = (employee, sales, hours, extra = {}) => ({
  employee, group: "Team", sales, sales_per_hour: sales / hours, direct_messages_sent: 1000, messages_sent_per_hour: 1000 / hours,
  ppv_sales: sales, ppvs_unlocked: 10, direct_ppvs_sent: 40, fans_chatted: 100, fans_who_spent_money: 5, ...extra,
});

t("aggregateKpi: soglie di ingresso e righe escluse", () => {
  const ops = aggregateKpi([
    row("A", 5000, 50), row("A", 5000, 50), row("Poco", 100, 10),
    row("Massa", 9000, 90, { is_mass: true }), row("Capo", 9000, 90, { group: "👤 Chatter Manager" }),
  ]);
  assert.equal(ops.get("A").h, 100);
  assert.equal(ops.get("A").sph, 100);
  assert.ok(!ops.has("Poco") && !ops.has("Massa") && !ops.has("Capo"));
});

// tre operatori sulla stessa modella e fascia: A 100/h, B 50/h, C 50/h
const sh = (who, cid, bucket, h) => ({ who, creator_ids: [cid], bucket, h });
const resolve = (s) => s.who;

t("leave-one-out: l'atteso di A sono i colleghi, non lui", () => {
  const ops = aggregateKpi([row("A", 10000, 100), row("B", 5000, 100), row("C", 5000, 100)]);
  const cells = buildCells([sh("A", 1, "Evening", 100), sh("B", 1, "Evening", 100), sh("C", 1, "Evening", 100)], resolve);
  const c = compareWithPeers(ops, cells);
  assert.equal(c.get("A").exp, 50);
  assert.equal(c.get("A").idx, 2);
  assert.equal(c.get("B").exp, 75);
});

t("almeno 2 colleghi nella cella, altrimenti si usa la modella intera", () => {
  const ops = aggregateKpi([row("A", 10000, 100), row("B", 5000, 100), row("C", 2000, 100)]);
  // A e B di notte, C di sera: nella cella notte A ha 1 solo collega → si confronta con la modella
  const cells = buildCells([sh("A", 1, "Night", 100), sh("B", 1, "Night", 100), sh("C", 1, "Evening", 100)], resolve);
  const c = compareWithPeers(ops, cells);
  assert.equal(c.get("A").exp, 35); // (50×100 + 20×100) / 200
  assert.equal(c.get("A").few_peers, true);
  assert.equal(c.get("A").night, 1);
});

t("v2: il venduto all'ora usa le ore di turno, non le ore attive Infloww", () => {
  // stesso venduto e stesse ore di turno, ma Infloww conta ore attive diverse (cambio di definizione)
  const rows = [row("A", 6000, 40), row("B", 6000, 90), row("C", 6000, 60)];
  const shifts = [sh("A", 1, "Evening", 60), sh("B", 1, "Evening", 60), sh("C", 1, "Evening", 60)];
  const { ops, cmp } = rankPeriod(rows, shifts, resolve);
  assert.equal(ops.get("A").sph, 100);
  assert.equal(ops.get("B").sph, 100);
  assert.equal(cmp.get("A").idx, 1);
  assert.equal(ops.get("A").h_infloww, 40);
});

t("v2: senza turni abbinati resta in elenco ma non confrontabile", () => {
  const { ops, cmp } = rankPeriod([row("A", 6000, 60), row("Z", 6000, 60)], [sh("A", 1, "Evening", 60)], resolve);
  assert.equal(ops.get("Z").sph, null);
  assert.equal(ops.get("Z").no_calendar, true);
  assert.ok(!cmp.has("Z"));
});

t("un turno su due modelle si divide in parti uguali", () => {
  const cells = buildCells([{ who: "A", creator_ids: [1, 2], bucket: "Morning", h: 10 }], resolve);
  assert.equal(cells.get("A").get("1|Morning"), 5);
  assert.equal(cells.get("A").get("2|Morning"), 5);
});

t("splitShare somma solo le modelle dello split", () => {
  assert.equal(splitShare({ 1: 0.6, 2: 0.3, 3: 0.1 }, [1, 3]), 0.7);
  assert.equal(splitShare(null, [1]), 0);
});

t("avvisi di lettura", () => {
  assert.deepEqual(rowFlags({ h: 80, tenure: 2, m1: 0.4, m2: 1.2, few_peers: true }), ["poche ore", "nuovo", "altalenante", "pochi colleghi"]);
  assert.deepEqual(rowFlags({ h: 200, tenure: 8, m1: 0.9, m2: 1.0 }), []);
});

t("le due misure in disaccordo solo se una è alta e l'altra bassa", () => {
  assert.equal(measuresDisagree(1.3, 0.6), true);
  assert.equal(measuresDisagree(0.6, 1.2), true);
  assert.equal(measuresDisagree(1.0, 0.8), false);
  assert.equal(measuresDisagree(null, 0.5), false);
});

t("mesi", () => {
  assert.equal(shiftMonth("2026-01", -2), "2025-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.deepEqual(monthRange("2025-11", "2026-01"), ["2025-11", "2025-12", "2026-01"]);
});

console.log(`squadra: ${n} gruppi di asserzioni ok`);
