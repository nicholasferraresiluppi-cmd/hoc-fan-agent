// Unit test — Andamento per ora (lib/andamento-orario-core + -sql). Esegui: node tests/andamento-orario.mjs
// Copre le scelte facili da rompere: medie AL GIORNO (non totali), giorni della settimana contati nel periodo,
// finestre a cavallo della mezzanotte, massivi come parte dei messaggi (mai sommati due volte), operatori e
// messaggi assenti = nessun numero (non zero), oggi contro le sole settimane con dati, ora italiana e filtro
// organizzazione nelle query.
import assert from "node:assert/strict";
import {
  buildAndamento, buildToday, reading, bestWindow, uncoveredRun, weekdayCounts, daysBetween, normalizePeriod, romeNow, delta,
} from "../src/lib/andamento-orario-core.js";
import { txHourlySql, activityHourlySql, todaySql, idList } from "../src/lib/andamento-orario-sql.js";

let n = 0;
const t = (name, fn) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};
const ORG = "5598597c-7fab-4fe1-acb3-5358df7d9dc5";
const cur = { from: "2026-10-22", to: "2026-11-18" }; // 28 giorni, da giovedì a mercoledì
const prev = { from: "2026-09-24", to: "2026-10-21" };

// ── periodo e calendario ─────────────────────────────────────────────────────────
t("28 giorni = 4 volte ogni giorno della settimana", () => {
  assert.equal(daysBetween(cur.from, cur.to), 28);
  assert.deepEqual(Object.values(weekdayCounts(cur.from, cur.to)), [4, 4, 4, 4, 4, 4, 4]);
});
t("10 giorni: i giorni della settimana non sono pari", () => {
  const w = weekdayCounts("2026-11-09", "2026-11-18"); // lun 9 → mer 18
  assert.equal(w[2], 2); // lunedì
  assert.equal(w[5], 1); // giovedì
  assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 10);
});
t("periodo predefinito: 28 giorni fino a ieri in Italia, confronto subito prima", () => {
  const now = new Date("2026-11-19T22:30:00Z"); // 23:30 a Roma, ancora il 19
  const p = normalizePeriod({}, now);
  assert.deepEqual(p.cur, { from: "2026-10-22", to: "2026-11-18" });
  assert.deepEqual(p.prev, { from: "2026-09-24", to: "2026-10-21" });
});
t("dopo la mezzanotte italiana (ancora il giorno prima in UTC) ieri è già il giorno nuovo", () => {
  const now = new Date("2026-11-19T23:30:00Z"); // 00:30 del 20 a Roma
  assert.deepEqual(romeNow(now), { day: "2026-11-20", hour: 0 });
  assert.equal(normalizePeriod({}, now).cur.to, "2026-11-19");
});
t("ora legale: a luglio le 22 UTC sono la mezzanotte italiana", () => {
  assert.deepEqual(romeNow(new Date("2026-07-10T22:15:00Z")), { day: "2026-07-11", hour: 0 });
});
t("oggi o il futuro non entrano; periodo oltre il massimo tagliato; date invertite raddrizzate", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  assert.equal(normalizePeriod({ from: "2026-11-01", to: "2026-11-30" }, now).cur.to, "2026-11-18");
  const long = normalizePeriod({ from: "2025-01-01", to: "2026-11-18" }, now);
  assert.equal(daysBetween(long.cur.from, long.cur.to), 120);
  assert.deepEqual(normalizePeriod({ from: "2026-11-10", to: "2026-11-01" }, now).cur, { from: "2026-11-01", to: "2026-11-10" });
  assert.equal(normalizePeriod({ from: "boh", to: "x'; DROP" }, now).cur.to, "2026-11-18");
});

// ── finestre ─────────────────────────────────────────────────────────────────────
t("finestra d'oro a cavallo della mezzanotte", () => {
  const v = Array(24).fill(1);
  v[22] = 10; v[23] = 10; v[0] = 10; v[1] = 10;
  const w = bestWindow(v, 4);
  assert.equal(w.label, "22–2");
  assert.equal(w.sum, 40);
  assert.ok(Math.abs(w.share - 40 / 60) < 1e-9);
});
t("finestra più debole", () => {
  const v = Array(24).fill(5);
  v[4] = 0; v[5] = 0; v[6] = 0; v[7] = 0;
  assert.equal(bestWindow(v, 4, { min: true }).label, "4–8");
});
t("delta: base zero → nessuna variazione inventata", () => {
  assert.equal(delta(10, 0), null);
  assert.equal(delta(110, 100), 0.1);
});

// ── vista completa su righe finte ────────────────────────────────────────────────
const tx = [
  // cur: alle 23 $2.800 in 28 giorni = $100 al giorno; di cui massivi 560 e chat 1.680, mance 560
  { k: "h", per: "cur", h: 23, kind: "chat", net: 1680, tx: 56 },
  { k: "h", per: "cur", h: 23, kind: "mass", net: 560, tx: 28 },
  { k: "h", per: "cur", h: 23, kind: "tip", net: 560, tx: 14 },
  { k: "h", per: "cur", h: 10, kind: "chat", net: 280, tx: 14 },
  { k: "h", per: "prev", h: 23, kind: "chat", net: 1400, tx: 50 },
  { k: "h", per: "prev", h: 10, kind: "chat", net: 560, tx: 20 },
  { k: "hp", per: "cur", h: 23, payers: 84 },
  { k: "dh", per: "cur", h: 23, dow: 2, net: 800 }, // lunedì: 4 lunedì → $200
  { k: "ch", per: "cur", h: 23, creator_id: 1, net: 2000 },
  { k: "ch", per: "cur", h: 23, creator_id: 2, net: 800 },
  { k: "ch", per: "cur", h: 10, creator_id: 3, net: 280 },
  { k: "tot", per: "cur", net: 3080, tx: 112, payers: 90 },
  { k: "tot", per: "prev", net: 1960, tx: 70, payers: 60 },
];
const act = [
  { k: "msg", per: "cur", h: 23, fan_msgs: 2800, fan_writers: 560, page_msgs: 5600, ppv_sent: 280 },
  { k: "msg", per: "cur", h: 10, fan_msgs: 1400, fan_writers: 280, page_msgs: 2800, ppv_sent: 140 },
  { k: "subs", per: "cur", h: 23, new_subs: 56 },
  { k: "subs", per: "prev", h: 23, new_subs: 28 },
  { k: "staff", per: "cur", h: 23, dow: 2, staff_hours: 40 },
  { k: "staff", per: "cur", h: 23, dow: 3, staff_hours: 16 },
  { k: "staff", per: "cur", h: 10, dow: 3, staff_hours: 28 },
];
const names = { 1: "Gaja - IT", 2: "Gaja - EN", 3: "Alice" };
const personOf = (a) => a.replace(/\s*-\s*[A-Z]{2}\s*$/, "");
const meta = { cur, prev, chatTo: "2026-11-18", names, personOf };
const d = buildAndamento({ tx, act }, meta);
const h23 = d.hours[23];

t("incasso orario = media al giorno, confronto sui giorni del periodo prima", () => {
  assert.equal(h23.net, 100);
  assert.equal(h23.net_prev, 50);
  assert.equal(h23.delta, 1);
  assert.equal(d.totals.net_day, 110);
  assert.equal(d.totals.net, 3080);
});
t("massivi dentro i messaggi: le voci sommano all'incasso, nessun doppio conteggio", () => {
  const sum = Object.values(h23.kinds).reduce((a, b) => a + b, 0);
  assert.equal(sum, h23.net);
  assert.equal(h23.kinds.mass, 20);
  assert.equal(h23.kinds.chat, 60);
  assert.deepEqual(d.kinds.map((k) => k.key), ["chat", "mass", "tip"]); // voci senza incasso non mostrate
});
t("acquisti, fan che pagano e spesa media al giorno", () => {
  assert.equal(h23.tx, 3.5);
  assert.equal(h23.payers, 3);
  assert.equal(h23.ticket, 28.57);
});
t("settimana: divide per quante volte cade quel giorno", () => {
  const lun = d.week.find((w) => w.label === "Lunedì");
  assert.equal(lun.net[23], 200);
  assert.equal(lun.staff[23], 10);
  assert.equal(d.week[0].label, "Lunedì");
  assert.equal(d.week[6].label, "Domenica");
});
t("operatori: media al giorno, incasso e messaggi per operatore", () => {
  assert.equal(h23.staff, 2);
  assert.equal(h23.net_per_staff, 50);
  assert.equal(h23.fan_msgs, 100);
  assert.equal(h23.fan_msgs_per_staff, 50);
  assert.equal(d.hours[10].staff, 1);
  assert.equal(d.hours[3].net_per_staff, null); // nessuno in turno → nessun numero, non zero
});
t("ora quasi scoperta (meno di mezzo operatore): niente rapporti per operatore, frase sulle ore scoperte", () => {
  // alle 3-4: 1 ora di turno in 28 giorni (0,04 in media) ma i fan scrivono e comprano
  const act2 = [...act,
    { k: "msg", per: "cur", h: 3, fan_msgs: 2800 }, { k: "msg", per: "cur", h: 4, fan_msgs: 1400 },
    { k: "staff", per: "cur", h: 3, dow: 2, staff_hours: 1 }];
  const tx2 = [...tx, { k: "h", per: "cur", h: 3, kind: "chat", net: 1400, tx: 10 }];
  const x = buildAndamento({ tx: tx2, act: act2 }, meta);
  assert.equal(x.hours[3].staff, 0.04);
  assert.equal(x.hours[3].fan_msgs_per_staff, null);
  assert.equal(x.hours[3].net_per_staff, null);
  assert.equal(x.hours[3].uncovered, true);
  const run = uncoveredRun(x.hours);
  assert.equal(run.from, 3);
  assert.equal(run.len, 2);
  assert.ok(reading(x).some((s) => /^Dalle 3 alle 5 le pagine sono quasi scoperte \(quasi mai qualcuno in turno\) mentre i fan mandano 150 messaggi e entrano \$50 al giorno\.$/.test(s)), reading(x).join("\n"));
});
t("ore scoperte a cavallo della mezzanotte: un tratto solo", () => {
  const hrs = Array.from({ length: 24 }, (_, h) => ({ h, uncovered: h >= 22 || h < 2, fan_msgs: 10, net: 1, staff: h >= 22 || h < 2 ? 0 : 3 }));
  const run = uncoveredRun(hrs);
  assert.deepEqual([run.from, run.len], [22, 4]);
  assert.equal(uncoveredRun(hrs.map((h) => ({ ...h, uncovered: false }))), null);
});
t("nuovi abbonati con confronto", () => {
  assert.equal(h23.new_subs, 2);
  assert.equal(h23.new_subs_prev, 1);
});
t("persone: IT ed EN della stessa creator unite, ordinate per incasso", () => {
  assert.equal(d.creators[0].person, "Gaja");
  assert.deepEqual(d.creators[0].ids, [1, 2]);
  assert.equal(d.creators[0].net, 100);
  assert.equal(d.creators[0].peak_hour, 23);
  assert.equal(d.creators[0].shares.sera, 1);
  assert.equal(d.creators[1].person, "Alice");
});
t("fasce: quota e variazione", () => {
  const sera = d.bands.find((b) => b.key === "sera");
  assert.equal(sera.net, 100);
  assert.ok(Math.abs(sera.share - 100 / 110) < 1e-9);
  const mattina = d.bands.find((b) => b.key === "mattina");
  assert.equal(mattina.delta, -0.5);
});

t("senza turni né messaggi: colonne vuote, nessuna frase sul presidio", () => {
  const x = buildAndamento({ tx, act: [] }, meta);
  assert.equal(x.has.staff, false);
  assert.equal(x.has.chat, false);
  assert.equal(x.hours[23].staff, null);
  assert.equal(x.hours[23].fan_msgs, null);
  assert.equal(x.hours[23].new_subs, 0);
  assert.ok(!reading(x).some((s) => /operatore/.test(s)));
});
t("messaggi non ancora arrivati per il periodo (finisce dopo chatTo): si divide per i giorni che ci sono", () => {
  const x = buildAndamento({ tx, act }, { ...meta, chatTo: "2026-11-11" }); // 21 giorni di messaggi
  assert.equal(x.range.chatDays, 21);
  assert.equal(x.hours[23].fan_msgs, Math.round((2800 / 21) * 100) / 100);
});

// ── oggi ─────────────────────────────────────────────────────────────────────────
t("oggi: solo ore concluse, media delle sole settimane con dati", () => {
  const rows = [
    { ago: 0, h: 0, net: 100 }, { ago: 0, h: 1, net: 100 }, { ago: 0, h: 2, net: 999 }, // ora 2 in corso
    { ago: 7, h: 0, net: 150 }, { ago: 7, h: 1, net: 150 },
    { ago: 14, h: 0, net: 50 }, { ago: 14, h: 1, net: 50 },
    // 21 e 28: nessun dato (pagina nuova) → non abbassano la media
  ];
  const td = buildToday(rows, { todayDay: "2026-11-19", nowHour: 2 });
  assert.equal(td.weeks, 2);
  assert.equal(td.weekday, "giovedì");
  assert.equal(td.cum_today, 200);
  assert.equal(td.cum_typical, 200);
  assert.equal(td.delta, 0);
  assert.equal(td.in_progress, 999);
  assert.equal(td.hours[3].today, null);
  assert.equal(td.stale, false); // senza riga di freschezza non si inventa un allarme
});
t("oggi: flusso dal vivo fermo → confronto fino all'ultima ora arrivata per intero, e lo dice", () => {
  const rows = [
    { ago: 0, h: 18, net: 100 }, { ago: 0, h: 19, net: 100 }, { ago: 0, h: 20, net: 10 },
    { ago: 7, h: 18, net: 100 }, { ago: 7, h: 19, net: 100 }, { ago: 7, h: 20, net: 100 },
    { ago: -1, last_at: "2026-11-19T19:52:07Z" }, // 20:52 a Roma
  ];
  const now = new Date("2026-11-19T20:19:00Z"); // 21:19 a Roma: fermo da 27 minuti
  const td = buildToday(rows, { todayDay: "2026-11-19", nowHour: 21, now });
  assert.equal(td.stale, true);
  assert.equal(td.stale_minutes, 27);
  assert.equal(td.done_hours, 20); // l'ora 20 (arrivata fino alle 20:52) non entra nel confronto
  assert.equal(td.cum_today, 200);
  assert.equal(td.cum_typical, 200);
  const r = reading({ ...d, today: td });
  assert.ok(r.some((s) => /ferme da 27 minuti \(ultima registrata alle 20:52\)/.test(s)), r.join("\n"));
  // flusso fresco: si confronta fino all'ora in corso
  const fresh = buildToday(rows, { todayDay: "2026-11-19", nowHour: 21, now: new Date("2026-11-19T19:55:00Z") });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.done_hours, 21);
});
t("oggi a mezzanotte: nessun confronto, nessuna frase", () => {
  const td = buildToday([{ ago: 7, h: 0, net: 10 }], { todayDay: "2026-11-19", nowHour: 0 });
  assert.equal(td.done_hours, 0);
  assert.ok(!reading({ ...d, today: td }).some((s) => s.startsWith("Oggi")));
});

// ── lettura in parole ────────────────────────────────────────────────────────────
t("lettura: ore d'oro e fasce che si spostano, coi numeri", () => {
  const r = reading(d);
  assert.match(r[0], /Le ore d'oro sono le 20–0/); // a parità vince la prima finestra che contiene le 23
  // spostamenti sotto i $100 al giorno: né «cresce/cala» né «non cambia» (sarebbe falso)
  assert.ok(!r.some((s) => /cresce|cala|non cambia/.test(s)));
  const big = buildAndamento({ tx: tx.map((x) => ({ ...x, net: x.net == null ? x.net : x.net * 100 })), act }, meta);
  const rb = reading(big);
  assert.ok(rb.some((s) => /la sera cresce del 100% \(\$5\.000 → \$10\.000 al giorno\)/.test(s) && /la mattina cala del 50%/.test(s)), rb.join("\n"));
});
t("lettura: forma invariata detta solo se nessuna fascia si sposta del 10%", () => {
  const same = tx.map((x) => (x.per === "prev" && x.k === "h" ? { ...x, net: x.h === 23 ? 2800 : 280 } : x));
  assert.ok(reading(buildAndamento({ tx: same, act }, meta)).some((s) => /non cambia/.test(s)));
});
t("lettura: niente incasso, niente frasi", () => {
  assert.deepEqual(reading(buildAndamento({}, meta)), []);
});

// ── query ────────────────────────────────────────────────────────────────────────
const refs = { attributed: "p.onlyfans.attributed_transactions", mass: "p.onlyfans.mass_transactions", chat: "p.onlyfans.chat", organicSubs: "p.onlyfans.organic_subscriptions", shifts: "p.onlyfans.cache_members" };
const a = { ids: [3, 1, 1, "x", -2], org: ORG, cur, prev, chatTo: "2026-11-18", today: "2026-11-19" };
t("query: ora italiana, filtro organizzazione su ogni tabella, id puliti", () => {
  for (const sql of [txHourlySql(refs, a), activityHourlySql(refs, a), todaySql(refs, a)]) {
    assert.match(sql, /Europe\/Rome/);
    assert.match(sql, /creator_id IN \(3,1\)/);
    const tables = (sql.match(/FROM `/g) || []).length;
    const orgs = (sql.match(new RegExp(`organization_id = '${ORG}'`, "g")) || []).length;
    assert.equal(orgs, tables, "ogni tabella letta è filtrata per organizzazione");
  }
});
t("query: transazioni CDC deduplicate, massivi solo per etichettare", () => {
  const sql = txHourlySql(refs, a);
  assert.match(sql, /QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY id ORDER BY updated_at DESC\) = 1/);
  assert.match(sql, /LEFT JOIN m USING \(id\)/);
});
t("query: turni solo dei chatter, ore-persona distinte", () => {
  const sql = activityHourlySql(refs, a);
  assert.match(sql, /LIKE '%Chatter%'/);
  assert.match(sql, /SELECT DISTINCT member_id, hh/);
});
t("query: rifiuta date, organizzazione e liste non valide", () => {
  assert.throws(() => txHourlySql(refs, { ...a, cur: { from: "2026-10-01'; --", to: "2026-11-18" } }));
  assert.throws(() => txHourlySql(refs, { ...a, org: "x' OR 1=1" }));
  assert.throws(() => idList(["a", 0, -1]));
});

console.log(`andamento-orario: ${n} test ok`);
