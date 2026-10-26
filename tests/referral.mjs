// Unit test — referral-core («Porta un collega»). Esegui: node tests/referral.mjs
import assert from "node:assert/strict";
import {
  REFERRAL_RULES as R, parseFx, shiftDatesFromWages, referralMonths, addMonths, monthEnd, validateRecruit, validateStory, validateReferrer,
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
{
  const a = referralMonths("2026-11-10");
  eq(a.month1, "2026-11", "primo turno entro il 15: mese 1 = quel mese");
  eq(a.salesMonths1, ["2026-11"]);
  const b = referralMonths("2026-11-20");
  eq(b.month1, "2026-12", "dopo il 15: mese 1 = il mese dopo");
  eq(b.salesMonths1, ["2026-11", "2026-12"], "i giorni di rodaggio si sommano al mese 1");
  eq(b.months, ["2026-12", "2027-01"], "mesi delle provvigioni");
  eq(referralMonths(null), null);
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

// ── percorso completo (Luca, primo turno il 3 novembre) ─────────────────────
const luca = { id: "rc1", name: "Luca", referrerId: "rf1", interviewAt: "2026-10-20", trainingAt: "2026-10-27", trainingPassed: true, firstShiftAt: "2026-11-03" };
const FX = { "2026-11": 0.86, "2026-12": 0.86, "2027-01": 0.86 };
// n turni a partire da un giorno (uno al giorno)
const turni = (n, from = "2026-11-03") => Array.from({ length: n }, (_, i) => { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
{
  // novembre in corso, nessun export ancora, turni non letti
  const m = byKey(recruitMilestones(luca, { today: "2026-11-10" }));
  eq(m.first_shift.status, "maturato", "primo turno dopo la formazione = 50€");
  eq(m.commission_1.status, "in_corso");
  eq([m.shifts_25.status, m.shifts_25.why], ["in_attesa", "Turni non ancora letti da CreatorsPro"]);
}
{
  // a febbraio: nov $8.000, dic $6.000; 60 turni fatti
  const sales = { "2026-11": 8000, "2026-12": 6000, "2027-01": 5000 };
  const ms = recruitMilestones(luca, { today: "2027-02-05", salesByMonth: sales, shiftDates: turni(60), fx: FX });
  const m = byKey(ms);
  eq(m.commission_1.amountUsd, 400, "5% di 8.000");
  eq(m.commission_1.amountEur, 344, "al cambio inserito 0,86");
  eq(m.commission_2.amountUsd, 150, "2,5% di 6.000");
  eq([m.shifts_25.status, m.shifts_50.status, m.shifts_75.status], ["maturato", "maturato", "in_attesa"]);
  eq(m.shifts_25.unlockedAt, "2026-11-27", "sbloccato il giorno del 25º turno");
  eq(m.shifts_75.why, "60 turni su 75");
  const t = summarize(ms);
  eq(t.maturato, 50 + 344 + 129 + 200, "totale maturato");
}
{
  // turni prima del primo turno segnato dall'HR non contano
  const m = byKey(recruitMilestones(luca, { today: "2027-02-05", shiftDates: [...turni(5, "2026-10-01"), ...turni(24)], fx: FX }));
  eq(m.shifts_25.why, "24 turni su 25");
}
{
  // cambio mancante: la provvigione resta in dollari, fuori dal totale in euro
  const ms = recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 8000, "2026-12": 6000 }, shiftDates: turni(10), fx: { "2026-11": 0.86 } });
  const m = byKey(ms);
  eq([m.commission_2.status, m.commission_2.amountEur, m.commission_2.fxMissing], ["maturato", null, true]);
  const t = summarize(ms);
  eq([t.maturato, t.senzaCambioUsd], [50 + 344, 150], "i dollari senza cambio a parte");
}
{
  // esce dopo 30 turni: 25 maturato, 50 e 75 persi; la provvigione sulle vendite fatte resta
  const ms = recruitMilestones({ ...luca, exitedAt: "2026-12-15" }, { today: "2027-02-05", salesByMonth: { "2026-11": 8000, "2026-12": 2000 }, shiftDates: turni(30), fx: FX });
  const m = byKey(ms);
  eq([m.shifts_25.status, m.shifts_50.status, m.shifts_75.status], ["maturato", "perso", "perso"]);
  eq(m.shifts_50.why, "Uscita dopo 30 turni");
  eq(m.commission_2.status, "maturato", "la provvigione sulle vendite fatte resta");
}
{
  // turni scritti a mano dall'HR vincono su CreatorsPro (data non nota)
  const m = byKey(recruitMilestones({ ...luca, shiftsManual: 52 }, { today: "2027-02-05", shiftDates: turni(3), fx: FX }));
  eq([m.shifts_50.status, m.shifts_50.unlockedAt, m.shifts_75.why], ["maturato", null, "52 turni su 75"]);
}
{
  // mese senza vendite = niente provvigione; mese non importato = in attesa, mai perso
  let m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 3000, "2026-12": 0 }, fx: FX }));
  eq(m.commission_2.status, "perso", "niente vendite = niente provvigione");
  m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 1000 }, fx: FX }));
  eq(m.commission_2.status, "in_attesa");
}
{
  const ms = recruitMilestones({ ...luca, trainingPassed: false, firstShiftAt: null }, { today: "2026-11-10" });
  ok(ms.every((x) => x.status === "perso"), "formazione non superata");
  const ms2 = recruitMilestones({ id: "x", name: "Ada", referrerId: "rf1" }, { today: "2026-11-10", shiftDates: turni(40) });
  ok(ms2.every((x) => x.status === "in_attesa"), "appena segnalata: i turni non contano prima del primo turno");
}
{
  // avvio tardivo: primo turno il 20/11, mese 1 = dicembre ma la provvigione conta anche novembre
  const late = { ...luca, firstShiftAt: "2026-11-20" };
  const m = byKey(recruitMilestones(late, { today: "2027-03-02", salesByMonth: { "2026-11": 1000, "2026-12": 7000, "2027-01": 5000 }, fx: FX }));
  eq(m.commission_1.salesUsd, 8000, "nov + dic");
  eq(m.commission_1.month, "2026-12");
  eq(m.commission_2.salesUsd, 5000, "gennaio");
}
{
  // pagato: importo congelato anche se il venduto cambia dopo (export corretto)
  const paid = { "rc1:commission_1": { amountEur: 344, amountUsd: 400, paidAt: "2026-12-05" } };
  const m = byKey(recruitMilestones(luca, { today: "2027-02-05", salesByMonth: { "2026-11": 9999, "2026-12": 1 }, fx: FX, paid }));
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
  // turni da CreatorsPro: nome dal mapping CP→Infloww, solo turni già iniziati, giorno di Roma
  const now = Date.parse("2026-11-10T12:00:00Z");
  const map = shiftDatesFromWages([
    { member_id: 7, member_name: "luca cp", shifts: [{ started_at: "2026-11-03T23:30:00Z" }, { started_at: "2026-11-20T10:00:00Z" }] },
    { member_id: 8, member_name: "Ada Neri", shifts: [{ started_at: "2026-11-04T10:00:00Z" }] },
  ], { 7: "Luca Verdi" }, now);
  eq(map, { "luca verdi": ["2026-11-04"], "ada neri": ["2026-11-04"] }, "23:30 UTC = giorno dopo a Roma; turno futuro escluso");
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

// ── la simulazione mostrata a Nicholas il 26/10 ($5k/mese, 75 turni) ─────────
{
  const sales = { "2026-11": 5000, "2026-12": 5000 };
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
  eq([m.commission_1.salesUsd, m.commission_1.amountUsd, m.commission_2.amountUsd], [8000, 400, 150], "venduto letto da Infloww");
  eq([m.shifts_25.status, m.shifts_50.why], ["maturato", "35 turni su 50"], "turni letti da CreatorsPro");
  eq(m.commission_1.fxMissing, true, "senza cambio la provvigione resta in dollari");
  eq(st.toPay.length, 4, "primo turno + 2 provvigioni + 25 turni");
  eq(st.fxMonths, ["2026-11", "2026-12"], "mesi a cui serve il cambio");
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
  eq(await L.setFx("2026-11", "0,86", hr), 0.86);
  eq((await L.getFx())["2026-11"], 0.86);
  // export di novembre corretto dopo il pagamento della provvigione: l'importo pagato non cambia
  await L.markPaid(`${luca.id}:commission_1`, hr, { now: NOW });
  store.set("ops_kpi:monthly:2026-11", [{ employee: "Luca Verdi", sales: 1 }]); h["monthly:2026-11"] = NOW + 1;
  st = await L.loadState({ now: NOW + 2 });
  const c1 = st.recruits[0].milestones.find((x) => x.key.endsWith("commission_1"));
  eq([c1.status, c1.amountUsd], ["pagato", 400], "pagato = congelato");
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
  ok(dash.totals.pagato === 50 + 344, `pagato ${dash.totals.pagato}`);
  ok((await L.listAudit()).length > 5, "registro delle azioni");
}

ok(R.version === "ref-2");

console.log(`referral: ${n} verifiche ok`);
