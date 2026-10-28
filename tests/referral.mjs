// Unit test — referral-core («Porta un amico»). Esegui: node tests/referral.mjs
import assert from "node:assert/strict";
import {
  REFERRAL_RULES as R, missionProgress, buildPayslips, payslipsCsv, hrInbox, payslipMonth, recruitMetrics, buildDashboard, parseFx, shiftDatesFromWages, monthsSince, blockSales, addMonths, monthEnd, validateRecruit, validateStory, validateReferrer,
  recruitMilestones, storyMilestone, summarize, recruitSteps, referrerView, salesMapFromKpiRows, salesFor,
  findDuplicateRecruit,
} from "../src/lib/referral-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const byKey = (ms) => Object.fromEntries(ms.map((m) => [m.key.split(":").pop(), m]));

// ── mesi ────────────────────────────────────────────────────────────────────
eq(addMonths("2026-11", 2), "2027-01", "anno che scatta");
eq(addMonths("2026-01", -1), "2025-12", "mese indietro");
eq(monthEnd("2028-02"), "2028-02-29", "bisestile");
eq(monthsSince("2026-11-20", "2027-01-05"), ["2026-11", "2026-12", "2027-01"]);
eq(monthsSince(null, "2027-01-05"), []);
{
  // venduto di un blocco = quota del venduto del mese pari ai turni del blocco
  const d = [...Array(20).fill("2026-11-10"), ...Array(15).fill("2026-12-10")];
  eq(blockSales(d, 0, 25, { "2026-11": 8000, "2026-12": 6000 }).sales, 10000, "20 turni di nov (tutto) + 5/15 di dic");
  eq(blockSales(d, 25, 35, { "2026-11": 8000, "2026-12": 6000 }).sales, 4000, "10/15 di dicembre");
  eq(blockSales(d, 0, 25, { "2026-11": 8000 }).sales, null, "manca dicembre = null");
}

// ── validazione ─────────────────────────────────────────────────────────────
ok(validateReferrer({ name: "" }).error, "nome obbligatorio");
ok(validateReferrer({ name: "Giulia", email: "x" }).error, "email non valida");
eq(validateReferrer({ name: " Giulia ", email: "G@Hoc.IT" }).value.email, "g@hoc.it");
ok(validateRecruit({ name: "Luca", referrerId: "rf_1", firstShiftAt: "2026-11-03" }).error, "primo turno senza formazione superata");
ok(validateRecruit({ name: "Luca", referrerId: "rf_1", interviewAt: "2026-11-05", trainingAt: "2026-11-01" }).error, "formazione prima del colloquio");
ok(validateRecruit({ name: "Luca", referrerId: "rf_1", trainingAt: "2026-13-01" }).error, "data impossibile");
eq(validateRecruit({ name: "Luca", referrerId: "rf_1", shiftsManual: "30" }).value.shiftsManual, 30);
eq(validateRecruit({ name: "Luca", referrerId: "rf_1", shiftsManual: "" }).value.shiftsManual, null, "vuoto = automatico");
ok(validateRecruit({ name: "Luca", referrerId: "rf_1", shiftsManual: "3,5" }).error, "turni non interi");
eq([parseFx("0,86"), parseFx(" 0.9 "), parseFx("86"), parseFx(""), parseFx(null)], [0.86, 0.9, null, null, null], "cambio inserito dall'HR");
ok(validateStory({ referrerId: "rf_1", agreedAt: "2026-11-10", publishedAt: ["2026-11-01"] }).error, "storia prima dell'accordo");
eq(validateStory({ referrerId: "rf_1", agreedAt: "2026-11-10", publishedAt: ["2026-11-20", "", "2026-11-12"] }).value.publishedAt, ["2026-11-12", "2026-11-20"]);

// ── un solo referente per persona ───────────────────────────────────────────
{
  const list = [{ id: "a", name: "Luca Rossi", hrPersonId: "p_1" }];
  ok(findDuplicateRecruit(list, { name: "luca  ROSSÌ" }), "stesso nome normalizzato");
  ok(findDuplicateRecruit(list, { name: "Altro", hrPersonId: "p_1" }), "stessa scheda HR");
  eq(findDuplicateRecruit(list, { name: "Luca Rossi" }, "a"), null, "sé stesso in modifica non è un doppione");
}

// ── storie ──────────────────────────────────────────────────────────────────
{
  const st = { id: "s1", agreedAt: "2026-11-01", publishedAt: ["2026-11-05"] };
  eq(storyMilestone(st, { today: "2026-11-10" }).status, "in_attesa", "1 storia su 2");
  eq(storyMilestone({ ...st, publishedAt: ["2026-11-05", "2026-11-20"] }, { today: "2026-11-21" }).status, "maturato");
  eq(storyMilestone({ ...st, publishedAt: ["2026-11-05", "2026-12-05"] }, { today: "2026-12-06" }).status, "perso", "la seconda fuori dai 30 giorni");
  eq(storyMilestone(st, { today: "2026-12-02" }).status, "perso", "scaduta");
  const paid = { "story:s1": { amountEur: 50, paidAt: "2026-11-30" } };
  eq(storyMilestone(st, { today: "2027-01-01", paid }).status, "pagato", "il pagamento vince su tutto");
}

// ── percorso completo (Luca, primo turno il 3 novembre, un turno al giorno) ──
const luca = { id: "rc1", name: "Luca", referrerId: "rf1", interviewAt: "2026-10-20", trainingAt: "2026-10-27", trainingPassed: true, firstShiftAt: "2026-11-03" };
const FX = { "2026-11": 0.86, "2026-12": 0.86, "2027-01": 0.86 };
const turni = (n, from = "2026-11-03") => Array.from({ length: n }, (_, i) => { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
{
  // a novembre, 8 turni fatti: niente è ancora sbloccato, la percentuale cresce
  const m = byKey(recruitMilestones(luca, { today: "2026-11-10", salesByMonth: { "2026-11": 2000 }, shiftDates: turni(8) }));
  eq(m.first_shift.status, "maturato", "primo turno dopo la formazione = 50€");
  eq([m.commission_1.status, m.commission_1.salesUsd, m.commission_1.amountUsd], ["in_corso", 2000, 100], "8 turni su 25: si vede quanto sta maturando");
  eq(m.commission_2.status, "in_attesa");
  eq(m.shifts_25.why, "8 turni su 25");
  eq(byKey(recruitMilestones(luca, { today: "2026-11-10" })).shifts_25.why, "Turni non ancora letti da CreatorsPro");
}
{
  // a febbraio: 60 turni (3 nov → 1 gen); nov 28 turni $8.400, dic 31 $6.200, gen 1 $100
  const sales = { "2026-11": 8400, "2026-12": 6200, "2027-01": 100 };
  const ms = recruitMilestones(luca, { today: "2027-02-05", salesByMonth: sales, shiftDates: turni(60), fx: FX });
  const m = byKey(ms);
  eq([m.commission_1.salesUsd, m.commission_1.amountUsd, m.commission_1.amountEur], [7500, 375, 322.5], "turni 1-25 tutti a novembre: 25/28 di $8.400");
  eq(m.commission_1.unlockedAt, "2026-11-27", "sbloccata al 25º turno");
  eq([m.commission_2.salesUsd, m.commission_2.amountUsd], [5300, 132.5], "turni 26-50: 3/28 di nov (900) + 22/31 di dic (4.400)");
  eq(m.commission_2.month, "2026-12", "cambio del mese in cui si sblocca");
  eq([m.shifts_25.status, m.shifts_50.status, m.shifts_75.status], ["maturato", "maturato", "in_attesa"], "i €100 si accumulano");
  eq(m.shifts_75.why, "60 turni su 75");
  eq(summarize(ms).maturato, 50 + 322.5 + 113.95 + 200, "totale maturato");
}
{
  // l'esempio di Nicholas: entra il 15 del mese, esce (o viene mandato via) dopo 20 turni → nessuna percentuale
  const r = { ...luca, firstShiftAt: "2026-11-15", exitedAt: "2026-12-05" };
  const m = byKey(recruitMilestones(r, { today: "2027-01-10", salesByMonth: { "2026-11": 4000, "2026-12": 900 }, shiftDates: turni(20, "2026-11-15"), fx: FX }));
  eq(m.first_shift.status, "maturato");
  eq([m.commission_1.status, m.commission_2.status, m.shifts_25.status], ["perso", "perso", "perso"]);
  eq(m.commission_1.why, "Uscita dopo 20 turni: la percentuale si sblocca solo a 25 turni");
  // stesso ingresso, resta: 25º turno il 9 dicembre, cambio di dicembre
  const r2 = { ...luca, firstShiftAt: "2026-11-15" };
  const m2 = byKey(recruitMilestones(r2, { today: "2027-01-10", salesByMonth: { "2026-11": 4000, "2026-12": 3100 }, shiftDates: turni(40, "2026-11-15"), fx: FX }));
  eq([m2.commission_1.status, m2.commission_1.unlockedAt, m2.commission_1.salesUsd], ["maturato", "2026-12-09", 4000 + 3100 * 9 / 24], "16 turni di nov + 9 su 24 di dic");
}
{
  // blocco finito nel mese in corso: la cifra si chiude a fine mese
  const m = byKey(recruitMilestones(luca, { today: "2026-11-29", salesByMonth: { "2026-11": 5000 }, shiftDates: turni(27), fx: FX }));
  eq([m.commission_1.status, m.commission_1.why], ["in_corso", "25 turni fatti: la cifra si chiude a fine mese col venduto Infloww"]);
}
{
  // cambio mancante: la percentuale resta in dollari, fuori dal totale in euro
  const ms = recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 8400, "2026-12": 6200, "2027-01": 100 }, shiftDates: turni(60), fx: { "2026-11": 0.86 } });
  const m = byKey(ms);
  eq([m.commission_2.status, m.commission_2.amountEur, m.commission_2.fxMissing], ["maturato", null, true]);
  eq(summarize(ms).senzaCambioUsd, 132.5, "i dollari senza cambio a parte");
}
{
  // turni scritti a mano: servono anche i venduti dei blocchi a mano
  let m = byKey(recruitMilestones({ ...luca, shiftsManual: 52 }, { today: "2027-02-05", shiftDates: turni(3), fx: FX }));
  eq([m.shifts_50.status, m.shifts_50.unlockedAt, m.shifts_75.why], ["maturato", null, "52 turni su 75"]);
  eq(m.commission_1.status, "in_attesa", "senza il venduto a mano non si calcola");
  m = byKey(recruitMilestones({ ...luca, shiftsManual: 52, blockSalesManual: [6000, null] }, { today: "2027-02-05", fx: { "2027-02": 0.9 } }));
  eq([m.commission_1.status, m.commission_1.amountUsd, m.commission_1.amountEur], ["maturato", 300, 270], "venduto a mano, cambio del mese in corso");
}
{
  // blocco senza vendite = niente percentuale; mese non importato = in attesa, mai perso
  let m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 0, "2026-12": 0, "2027-01": 0 }, shiftDates: turni(60), fx: FX }));
  eq(m.commission_1.status, "perso");
  m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 1000 }, shiftDates: turni(60), fx: FX }));
  eq([m.commission_1.status, m.commission_2.status], ["maturato", "in_attesa"]);
}
{
  const ms = recruitMilestones({ ...luca, trainingPassed: false, firstShiftAt: null }, { today: "2026-11-10" });
  ok(ms.every((x) => x.status === "perso"), "formazione non superata");
  const ms2 = recruitMilestones({ id: "x", name: "Ada", referrerId: "rf1" }, { today: "2026-11-10", shiftDates: turni(40) });
  ok(ms2.every((x) => x.status === "in_attesa"), "appena segnalata: i turni non contano prima del primo turno");
}
{
  // pagato: importo congelato anche se il venduto cambia dopo (export corretto)
  const paid = { "rc1:commission_1": { amountEur: 344, amountUsd: 400, paidAt: "2026-12-05" } };
  const m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 9999 }, shiftDates: turni(30), fx: FX, paid }));
  eq([m.commission_1.status, m.commission_1.amountEur, m.commission_1.amountUsd], ["pagato", 344, 400]);
}
{
  // vista del referente: niente note HR, nome Infloww, scheda HR
  const r = { ...luca, note: "nota interna", inflowwName: "Luca R", hrPersonId: "p_x" };
  const ms = recruitMilestones(r, { today: "2026-11-10", shiftDates: turni(3) });
  const v = referrerView(r, ms, recruitSteps(r, ms, { today: "2026-11-10" }));
  const s = JSON.stringify(v);
  ok(!s.includes("nota interna") && !s.includes("Luca R") && !s.includes("p_x"), "il referente non vede i dati interni");
  eq(v.next, "rc1:shifts_25", "prossima tappa = 25 turni");
}
{
  const now = Date.parse("2026-11-10T12:00:00Z");
  const map = shiftDatesFromWages([
    { member_id: 7, member_name: "luca cp", shifts: [{ started_at: "2026-11-03T23:30:00Z" }, { started_at: "2026-11-20T10:00:00Z" }] },
    { member_id: 8, member_name: "Ada Neri", shifts: [{ started_at: "2026-11-04T10:00:00Z" }] },
  ], { 7: "Luca Verdi" }, now);
  eq(map, { "luca verdi": ["2026-11-04"], "ada neri": ["2026-11-04"] }, "23:30 UTC = giorno dopo a Roma; turno futuro escluso");
}


// ── dashboard del programma ─────────────────────────────────────────────────
{
  const today = "2027-03-01";
  const mk = (id, ref, o = {}, salesByMonth = {}, shiftDates = null) => {
    const r = { id, name: id, referrerId: ref, trainingPassed: true, firstShiftAt: "2026-11-03", createdAt: Date.parse("2026-10-15"), ...o };
    return { ...r, metrics: recruitMetrics(r, { salesByMonth, shiftDates }), milestones: recruitMilestones(r, { today, salesByMonth, shiftDates, fx: FX }) };
  };
  const recs = [
    mk("a", "g", { storyId: "s1" }, { "2026-11": 5000, "2026-12": 5000 }, turni(40)),   // 25 turni, $200/turno
    mk("b", "g", {}, { "2026-11": 1000 }, turni(10)),                                     // 10 turni, ancora dentro
    mk("c", "m", { exitedAt: "2026-11-20" }, { "2026-11": 300 }, turni(6)),               // uscita a 6 turni
    mk("d", "m", { trainingPassed: false, firstShiftAt: null }),                         // formazione non superata
    mk("e", "m", {}, { "2026-11": 100 }, turni(28)),                                      // 25 turni, $100/turno... (28 turni a nov)
  ];
  const stories = [
    { id: "s1", referrerId: "g", agreedAt: "2026-10-01", publishedAt: ["2026-10-02", "2026-10-05"] },
    { id: "s2", referrerId: "m", agreedAt: "2026-10-01", publishedAt: ["2026-10-02"] },
  ].map((s) => ({ ...s, milestone: storyMilestone(s, { today }) }));
  const d = buildDashboard({ referrers: [{ id: "g", name: "Giulia" }, { id: "m", name: "Marco" }], recruits: recs, stories, fx: FX, today });
  eq(d.funnel.map((f) => f.n), [5, 0, 4, 4, 2, 0, 0], "imbuto");
  eq([d.storyStats.published, d.storyStats.expired, d.storyStats.publishers, d.storyStats.recruitsFromStories], [1, 1, 1, 1], "storie");
  eq(d.storyStats.byReferrer[0].name, "Giulia", "chi ha pubblicato in cima");
  const g = d.quality.find((q) => q.name === "Giulia"), m = d.quality.find((q) => q.name === "Marco");
  eq([g.referred, g.reached25, g.decided, g.fewData], [2, 1, 1, true], "Giulia: pochi dati, non si giudica");
  eq(g.tenurePct, null);
  eq([m.reached25, m.decided, m.tenurePct], [1, 3, 33.3], "Marco: 1 su 3 decise arriva a 25 turni");
  ok(g.perShift > m.perShift && g.vsAvg > 1 && m.vsAvg < 1, "venduto a turno contro la media del programma");
  eq(recs[2].metrics.perShift, 50, "6 turni: venduto a turno calcolato (≥5)");
  eq(d.quality[0].name, "Giulia", "a pari 25 turni, prima chi vende di più a turno");
  ok(d.economics.costEur > 0 && d.economics.marginEur > 0 && d.economics.costPer25 === Math.round(d.economics.costEur / 2 * 100) / 100, "costo e ritorno");
  eq(d.trend, [{ month: "2026-10", referred: 5, started: 0 }, { month: "2026-11", referred: 0, started: 4 }], "andamento");
  const gap = buildDashboard({ today, recruits: [mk("x", "g", { createdAt: Date.parse("2026-08-10") }), mk("y", "g", { createdAt: Date.parse("2026-10-10"), trainingPassed: false, firstShiftAt: null })] });
  eq(gap.trend.map((x) => x.month), ["2026-08", "2026-09", "2026-10", "2026-11"], "i mesi vuoti restano, a zero");
  eq(recruitSteps({ id: "z", trainingPassed: false }, [], { today }).closedWhy, "Formazione non superata");
  eq(buildDashboard({ today }).economics.costPer25, null, "programma vuoto: niente divisioni per zero");
}


// ── missioni e buste ────────────────────────────────────────────────────────
{
  const today = "2027-02-05";
  const sales = { "2026-11": 8400, "2026-12": 6200, "2027-01": 100 };
  const paid = { "rc1:first_shift": { amountEur: 50, paidAt: "2026-11-30" } };
  const ms = recruitMilestones(luca, { today, salesByMonth: sales, shiftDates: turni(60), fx: { "2026-11": 0.86 }, paid });
  const m = byKey(ms);
  eq(missionProgress(m.shifts_75, luca), { done: 60, target: 75, unit: "turni" });
  eq(missionProgress(m.shifts_25, luca), { done: 25, target: 25, unit: "turni" }, "completata non va oltre il traguardo");
  eq(missionProgress(m.first_shift, luca), { done: 3, target: 3, unit: "tappe" });
  eq(missionProgress(m.first_shift, { interviewAt: "2026-10-20" }), { done: 1, target: 3, unit: "tappe" });
  eq(missionProgress(byKey(recruitMilestones(luca, { today: "2026-11-10" })).shifts_25, luca), null, "turni non letti: niente barra finta");
  const st = { id: "s", referrerId: "rf1", agreedAt: "2026-11-01", publishedAt: ["2026-11-02"] };
  eq(missionProgress(storyMilestone(st, { today: "2026-11-05" })), { done: 1, target: 2, unit: "storie" });
  eq(payslipMonth({ unlockedAt: "2026-12-07" }, today), "2026-12");
  eq(payslipMonth({ paidAt: "2026-11-30" }, today), "2026-11");
  eq(payslipMonth({}, today), "2027-02", "senza date: busta del mese in corso");
  const story = { referrerId: "rf1", milestone: storyMilestone({ ...st, publishedAt: ["2026-11-02", "2026-11-09"] }, { today }) };
  const slips = buildPayslips({ referrers: [{ id: "rf1", name: "Giulia" }], recruits: [{ id: "rc1", name: "Luca", referrerId: "rf1", milestones: ms }], stories: [story], today });
  eq(slips.map((b) => b.month), ["2026-12", "2026-11"], "una busta per mese di sblocco, la più recente prima");
  const nov = slips.find((b) => b.month === "2026-11"), dic = slips.find((b) => b.month === "2026-12");
  eq([nov.paidEur, nov.dueEur], [50, 50 + 100 + 322.5], "novembre: primo turno pagato; storie, 25 turni e 5% da pagare");
  eq([dic.dueEur, dic.waitingFxUsd], [100, 132.5], "dicembre: 50 turni da pagare, 2,5% in attesa del cambio");
  ok(!slips.some((b) => b.lines.some((l) => l.label.includes("75"))), "le missioni non completate non entrano nella busta");
  const csv = payslipsCsv([nov]);
  ok(csv.split("\n").length === 1 + nov.lines.length && csv.includes(";322,5;") && csv.includes('"pagato"'), "CSV per Excel italiano");
  eq(hrInbox({ toPay: [1, 2, 3], fxMonths: ["2026-11", "2026-12"], fx: { "2026-11": 0.86 } }), { toPay: 3, fxMissing: 1, count: 4 });
}

// ── venduto Infloww ─────────────────────────────────────────────────────────
{
  const map = salesMapFromKpiRows([{ employee: "Luca Rossi", sales: 100.5 }, { employee: "Luca Rossi", sales: 50 }, { employee: "Ada", sales: "20" }, { sales: 9 }]);
  eq(map, { "Luca Rossi": 150.5, Ada: 20 }, "una riga per gruppo: si sommano");
  eq(salesFor(map, "luca rossi"), 150.5, "match normalizzato");
  eq(salesFor(map, "Nessuno"), 0, "mese importato, nome assente = 0");
  eq(salesFor(null, "Ada"), null, "mese non importato = null");
  eq(salesFor({ "Ada B": 1, "ada b": 2 }, "ADA B"), null, "ambiguo = null, mai a caso");
}

// ── la simulazione della tabella del 26/10: $5k ogni 25 turni, 75 turni ─────
{
  const sales = { "2026-11": 5600, "2026-12": 6200, "2027-01": 3000 }; // 28 + 31 + 16 turni, $200 a turno
  const ms = recruitMilestones(luca, { today: "2027-02-05", salesByMonth: sales, shiftDates: turni(75), fx: FX });
  const story = storyMilestone({ id: "s", agreedAt: "2026-10-01", publishedAt: ["2026-10-02", "2026-10-09"] }, { today: "2027-02-05" });
  const t = summarize([...ms, story]);
  // 50 storia + 50 turno + 300 turni + 5%·5000·0,86 (215) + 2,5%·5000·0,86 (107,5)
  eq(t.maturato, 722.5, "stessa cifra della tabella: cambiano le condizioni, non il totale");
}
// ── simulazione lato server con KV finto: HR registra, Infloww importa, si paga ──
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const hash = (k) => { if (!store.has(k)) store.set(k, {}); return store.get(k); };
  let kvReads = 0;
  const kv = {
    async get(k) { if (k.startsWith("ops_kpi:monthly:")) kvReads++; return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v) { store.set(k, typeof v === "string" ? JSON.parse(v) : clone(v)); return "OK"; },
    async del(k) { store.delete(k); return 1; },
    async hset(k, obj) { Object.assign(hash(k), clone(obj)); return 1; },
    async hsetnx(k, f, v) { const h = hash(k); if (f in h) return 0; h[f] = v; return 1; },
    async hget(k, f) { return store.get(k)?.[f] ?? null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, f) { if (store.get(k)) delete store.get(k)[f]; return 1; },
    async lpush(k, v) { if (!store.has(k)) store.set(k, []); store.get(k).unshift(v); return 1; },
    async ltrim() { return "OK"; },
    async lrange(k, a, b) { return (store.get(k) || []).slice(a, b + 1); },
    async zscore(k, m) { return store.get(k)?.[m] ?? null; },
    async zrange(k) { return Object.keys(store.get(k) || {}).sort().reverse(); },
  };
  globalThis.__refFakeKv = kv;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__refFakeKv;", shortCircuit: true };
      if (specifier.startsWith("@/")) { const p = path.join(SRC, specifier.slice(2)); return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context); }
      return next(specifier, context);
    },
  });
  const L = await import("../src/lib/referral.js");
  const hr = { id: "u_hr", name: "HR Prova" };
  const NOW = Date.parse("2027-02-05T10:00:00Z");

  const giulia = await L.saveReferrer({ input: { name: "Giulia Bianchi", email: "Giulia@Example.com" }, actor: hr });
  await assert.rejects(L.saveReferrer({ input: { name: "Altra", email: "giulia@example.com" }, actor: hr }), /già un referente/);
  const luca = await L.saveRecruit({ input: { name: "Luca Verdi", referrerId: giulia.id, inflowwName: "Luca Verdi", interviewAt: "2026-10-20", trainingAt: "2026-10-27", trainingPassed: true, firstShiftAt: "2026-11-03" }, actor: hr });
  await assert.rejects(L.saveRecruit({ input: { name: "luca verdi", referrerId: giulia.id }, actor: hr }), /un solo referente/, "doppione rifiutato");
  await assert.rejects(L.saveRecruit({ input: { name: "Giulia Bianchi", referrerId: giulia.id }, actor: hr }), /sé stessi/);
  n += 3;

  // Infloww: novembre e dicembre importati (una riga per gruppo), gennaio no
  const h = hash("ops_kpi:imports");
  h["monthly:2026-11"] = Date.now() - 2000; h["monthly:2026-12"] = Date.now() - 1000;
  store.set("ops_kpi:monthly:2026-11", [{ employee: "Luca Verdi", sales: 6000 }, { employee: "Luca Verdi", sales: 2000 }, { employee: "Altro", sales: 99 }]);
  store.set("ops_kpi:monthly:2026-12", [{ employee: "luca verdi", sales: 6000 }]);
  // turni CreatorsPro già letti (mappa piccola fresca): 20 a novembre, 15 a dicembre
  const days = (m, k) => Array.from({ length: k }, (_, i) => `${m}-${String(i + 3).padStart(2, "0")}`);
  store.set("referral:shifts:2026-11", { builtAt: NOW, map: { "luca verdi": days("2026-11", 20) } });
  store.set("referral:shifts:2026-12", { builtAt: NOW, map: { "luca verdi": days("2026-12", 15) } });
  store.set("referral:shifts:2027-01", { builtAt: NOW, map: {} });
  store.set("referral:shifts:2027-02", { builtAt: NOW, map: {} });

  let st = await L.loadState({ now: NOW });
  const r = st.recruits[0];
  const m = Object.fromEntries(r.milestones.map((x) => [x.key.split(":").pop(), x]));
  eq([m.commission_1.salesUsd, m.commission_1.amountUsd, m.commission_1.month], [10000, 500, "2026-12"], "Infloww ripartito sui turni: nov intero + 5/15 di dic");
  eq([m.commission_2.status, m.commission_2.amountUsd], ["in_corso", 100], "35 turni su 50");
  eq([m.shifts_25.status, m.shifts_50.why], ["maturato", "35 turni su 50"], "turni letti da CreatorsPro");
  eq(m.commission_1.fxMissing, true, "senza cambio la provvigione resta in dollari");
  eq(st.toPay.length, 3, "primo turno + percentuale 1-25 + 25 turni");
  eq(st.fxMonths, ["2026-12"], "mesi a cui serve il cambio");
  ok(store.has("referral:sales:2026-11"), "mappa del mese salvata");

  // seconda lettura: niente ops_kpi (pesante) riletto
  const before = kvReads; await L.loadState({ now: NOW });
  const opsReads = kvReads - before;
  eq(opsReads, 0, "seconda lettura: ops_kpi (pesante) non riletto");

  // paga il primo turno, due volte no
  await L.markPaid(`${luca.id}:first_shift`, hr, { now: NOW });
  await assert.rejects(L.markPaid(`${luca.id}:first_shift`, hr, { now: NOW }), /non è da pagare|Già/);
  await assert.rejects(L.markPaid(`${luca.id}:shifts_50`, hr, { now: NOW }), /non è da pagare/);
  await assert.rejects(L.markPaid(`${luca.id}:commission_1`, hr, { now: NOW }), /Manca il cambio/);
  await assert.rejects(L.setFx("2026-11", "86", hr), /Cambio non valido/);
  n += 4;
  eq(await L.setFx("2026-12", "0,86", hr), 0.86);
  eq((await L.getFx())["2026-12"], 0.86);
  // export di novembre corretto dopo il pagamento della provvigione: l'importo pagato non cambia
  await L.markPaid(`${luca.id}:commission_1`, hr, { now: NOW });
  store.set("ops_kpi:monthly:2026-11", [{ employee: "Luca Verdi", sales: 1 }]); h["monthly:2026-11"] = NOW + 1;
  st = await L.loadState({ now: NOW + 2 });
  const c1 = st.recruits[0].milestones.find((x) => x.key.endsWith("commission_1"));
  eq([c1.status, c1.amountUsd], ["pagato", 500], "pagato = congelato");
  await assert.rejects(L.saveRecruit({ id: luca.id, input: { name: "Luca Verdi", referrerId: (await L.saveReferrer({ input: { name: "Marco" }, actor: hr })).id, trainingPassed: true }, actor: hr }), /già premi pagati/);
  await assert.rejects(L.deleteRecruit(luca.id, hr), /già pagati/);
  await assert.rejects(L.deleteReferrer(giulia.id, hr), /collegate/);
  n += 3;

  // storie
  const s = await L.saveStory({ input: { referrerId: giulia.id, agreedAt: "2026-10-01", publishedAt: ["2026-10-03", "2026-10-20"] }, actor: hr });
  st = await L.loadState({ now: NOW });
  ok(st.toPay.some((x) => x.key === `story:${s.id}`), "storie maturate da pagare");

  // vista del referente: abbinata per email verificata, poi per userId
  const none = await L.findReferrerForUser({ userId: "u_x", verifiedEmails: ["altro@example.com"] });
  eq(none, null, "email diversa: niente");
  const me = await L.findReferrerForUser({ userId: "u_giulia", verifiedEmails: ["GIULIA@example.com"] });
  eq(me?.id, giulia.id, "abbinata per email verificata");
  const again = await L.findReferrerForUser({ userId: "u_giulia", verifiedEmails: [] });
  eq(again?.id, giulia.id, "poi per userId");
  const dash = await L.referrerDashboard(me, { now: NOW });
  ok(dash.recruits.length === 1 && dash.stories.length === 1, "vede la sua persona e le sue storie");
  ok(!JSON.stringify(dash).includes("inflowwName") && !JSON.stringify(dash).includes("hrPersonId"), "niente dati interni");
  ok(dash.totals.pagato === 50 + 430, `pagato ${dash.totals.pagato}`);
  ok((await L.listAudit()).length > 5, "registro delle azioni");
  // badge HR: cache, svuotata a ogni modifica
  const ib = await L.getInbox({ now: NOW });
  ok(ib.count >= 1 && store.has("referral:inbox"), `badge HR (${ib.count}) in cache`);
  await L.setFx("2027-01", "0,9", hr);
  ok(!store.has("referral:inbox"), "una modifica svuota la cache del badge");
  ok((await L.referrerDashboard(me, { now: NOW })).payslips.length >= 1, "il referente vede le sue buste");
}

ok(R.version === "ref-3");

console.log(`referral: ${n} verifiche ok`);
