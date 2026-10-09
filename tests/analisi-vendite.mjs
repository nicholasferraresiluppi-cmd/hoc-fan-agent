// node tests/analisi-vendite.mjs
import assert from "node:assert/strict";
import * as q from "../src/lib/analisi-vendite-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const now = new Date("2026-10-09T12:00:00Z");
const refs = { attributed: "p.onlyfans.attributed_transactions", subscriptions: "p.onlyfans.subscriptions", transactionsAnalytics: "p.onlyfans.transactions_analytics", kpi: "p.onlyfans.kpi", chargebacks: "p.postgres.public_chargebacks", users: "p.postgres.public_users", creators: "p.postgres.public_creators" };

// periodi di default come in Looker, fino a ieri
ok(JSON.stringify(q.defaultRange("recap", now)) === JSON.stringify({ from: "2026-09-25", to: "2026-10-08" }), "riepilogo: 14 giorni (Looker 25/9-8/10)");
ok(JSON.stringify(q.defaultRange("conversioni", now)) === JSON.stringify({ from: "2026-09-11", to: "2026-10-08" }), "conversioni: 28 giorni");
ok(q.defaultRange("rapporto", now).from === "2026-10-01", "rapporto: mese corrente");
// periodo precedente di pari durata (il % Δ)
ok(JSON.stringify(q.previousRange({ from: "2026-09-25", to: "2026-10-08" })) === JSON.stringify({ from: "2026-09-11", to: "2026-09-24" }), "periodo prima = 14 giorni subito prima");
ok(JSON.stringify(q.previousRange({ from: "2026-10-01", to: "2026-10-01" })) === JSON.stringify({ from: "2026-09-30", to: "2026-09-30" }), "un giorno → il giorno prima");
// variazione
ok(Math.abs(q.pctDelta(56945.36, 54545.36) - 0.044) < 0.001, "delta come Looker");
ok(q.pctDelta(10, 0) === null, "periodo prima a zero → nessuna percentuale");
// periodo richiesto: invertito, malformato, troppo lungo
ok(JSON.stringify(q.normalizeRange("recap", { from: "2026-10-08", to: "2026-10-01" }, now)) === JSON.stringify({ from: "2026-10-01", to: "2026-10-08" }), "date invertite rimesse in ordine");
ok(q.normalizeRange("recap", { from: "2026-13-40", to: "x" }, now).from === "2026-09-25", "date malformate → default");
ok(q.normalizeRange("recap", { from: "2020-01-01", to: "2026-10-08" }, now).from === "2025-09-03", "massimo 400 giorni");
// niente iniezioni: id solo numeri, date solo AAAA-MM-GG
ok(q.idList([1, "2", "3; DROP TABLE x", -4, 2]) === "1,2", "id non numerici scartati, doppioni tolti");
assert.throws(() => q.idList([]), /nessuna creator/); n++;
assert.throws(() => q.recapSql(refs, [1], { from: "2026-10-01' OR 1=1 --", to: "2026-10-08" }), /data non valida/); n++;
// le formule usano le tabelle e i filtri giusti
const conv = q.conversioniSql(refs, [1000000377], { from: "2026-09-11", to: "2026-10-08" });
ok(conv.includes("p.onlyfans.transactions_analytics") && conv.includes("DATE '2026-08-14'"), "conversioni leggono anche il periodo prima");
const rapp = q.rapportoSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" });
ok(rapp.includes("net > 0") && rapp.includes("PERCENTILE_CONT(net, 0.5)") && rapp.includes("LAST_DAY"), "rapporto = hoc.sales_kpi (netto > 0, mediana vera, mese intero)");
ok(!/type\s*!=\s*'subscription'/.test(rapp), "rapporto NON esclude gli abbonamenti");
ok(q.transazioniSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" }, 99999).includes("LIMIT 2000"), "tetto alle righe di transazioni");
ok(q.chargebackSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" }).includes("created_at_transaction"), "chargeback per data della transazione");

// fase 2
const refs2 = { ...refs, newsubs: "p.hoc.newsubs_spending_daily", linksStats: "p.onlyfans.links_stats", reach: "p.onlyfans.reach" };
const r7 = { from: "2026-10-02", to: "2026-10-08" };
assert.throws(() => q.nuoviMetricsSql(refs2, [1], r7, "user_id; --"), /raggruppamento/); n++;
const nm = q.nuoviMetricsSql(refs2, [1], r7, "sub_type");
ok(nm.includes("COUNT(DISTINCT user_key)") && nm.includes("ROLLUP(sub_type)"), "nuovi abbonati: coppie fan×creator + totale");
const np = q.nuoviPersoneSql(refs2, [1], r7);
ok(np.includes("COUNT(DISTINCT user_id)") && np.includes("sub_type != 'returning_subscriber'") && np.includes("DATE '2026-09-25'"), "persone: per fan, nuovi = non returning (trial compresi), periodo prima");
const tr = q.trackingSql(refs2, [1], r7);
ok(tr.includes("clicks_diff") && tr.includes("HAVING") && tr.includes("DATE '2026-09-25'"), "tracking: somme dei diff, solo link attivi, periodo prima");
ok(q.coperturaSql(refs2, [1], r7).includes("SUM(IF(calendar_date >= DATE '2026-10-02', total, 0))"), "copertura: somma di total");
ok(q.VIEWS.length === 13 && q.VIEWS.includes("diagnosi") && q.VIEWS.includes("creator"), "11 schede + diagnosi + creator");
ok(JSON.stringify(q.defaultRange("tracking", now)) === JSON.stringify({ from: "2026-10-02", to: "2026-10-08" }), "tracking: 7 giorni come Looker");

// fase 3
ok(q.cleanSearch("@Pippo.99") === "pippo.99" && q.cleanSearch("ab") === null && q.cleanSearch("x' OR 1=1") === null && q.cleanSearch("a%b") === null, "ricerca: solo username/id puliti");
const rs = q.ricercaSql({ usersResearch: "p.onlyfans.users_research" }, [1], "1234567");
ok(rs.includes("STARTS_WITH(LOWER(username), '1234567')") && rs.includes("user_id = 1234567"), "ricerca: per inizio username o id");
assert.throws(() => q.ricercaSql({ usersResearch: "x" }, [1], "a'b"), /ricerca non valida/); n++;
ok(JSON.stringify(q.defaultRange("notifiche", now)) === JSON.stringify({ from: "2026-09-26", to: "2026-10-09" }), "notifiche fino a oggi (tempo reale), 14 giorni come Looker");
const na = q.notificheAggSql({ notifications: "p.postgres.public_notifications" }, [1], { from: "2026-09-26", to: "2026-10-09" });
ok(na.includes("'new_subscriber', 'returning_subscriber', 'new_subscriber_trial'") && !na.includes("ROW_NUMBER"), "notifiche: tutti e tre i tipi, nessuna deduplica 'ultima del giorno'");
ok(q.welcomeSql({ welcomeUnlocks: "p.onlyfans.welcome_unlocks" }, [1], r7).includes("GROUP BY creator_id, amount"), "welcome per creator e prezzo");

console.log(`analisi-vendite: ${n} asserzioni ok`);
