// Unit test — s4s-core (calendario S4S + lettura dei link). Esegui: node tests/s4s.mjs
// Fixture reali (13/10/2026): i link S4S delle 15 pagine dello Split Nicholas negli
// ultimi 180 giorni e i nomi delle pagine HOC (solo nomi pagina e aggregati, niente fan).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  circleRounds, roundStream, segmentSchedule, planSchedule, reconcilePlan, groupPages, nextActiveDay,
  langOf, baseName, linkNameFor, linkFormat, partnerLabel, buildAliasIndex, matchPartner,
  enrichResults, summarizeByPage, reciprocity, resultFor, lastExchange, whatsappText, dayLabel, weekday, addDays, isS4SLink,
} from "../src/lib/s4s-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ── Girone ──
for (const size of [2, 3, 4, 7, 8, 13]) {
  const ids = Array.from({ length: size }, (_, i) => i + 1);
  const rounds = circleRounds(ids);
  const pairs = rounds.flatMap((r) => r.pairs.map(([a, b]) => pk(a, b)));
  eq(pairs.length, (size * (size - 1)) / 2, `girone ${size}: tutte le coppie`);
  eq(new Set(pairs).size, pairs.length, `girone ${size}: nessuna coppia doppia`);
  for (const r of rounds) {
    const seen = [...r.pairs.flat(), ...(r.rest != null ? [r.rest] : [])].sort((a, b) => a - b);
    eq(seen, ids, `girone ${size}: ogni pagina una volta al giorno`);
  }
  if (size % 2) {
    const rests = rounds.map((r) => r.rest).sort((a, b) => a - b);
    eq(rests, ids, `girone ${size}: ognuna riposa una volta per giro`);
  }
}

// ── Confini tra giri: niente coppia ripetuta né doppio riposo (bug v0 su foglio) ──
for (const size of [5, 8, 13]) {
  const ids = Array.from({ length: size }, (_, i) => i + 1);
  const st = roundStream(ids, 42);
  const seq = Array.from({ length: (size % 2 ? size : size - 1) * 12 }, () => st.next());
  let pairClash = 0, restClash = 0;
  for (let i = 1; i < seq.length; i++) {
    const prev = new Set(seq[i - 1].pairs.map(([a, b]) => pk(a, b)));
    if (seq[i].pairs.some(([a, b]) => prev.has(pk(a, b)))) pairClash++;
    if (seq[i].rest != null && seq[i].rest === seq[i - 1].rest) restClash++;
  }
  eq(pairClash, 0, `stream ${size}: nessuna coppia due giorni di fila`);
  eq(restClash, 0, `stream ${size}: nessun riposo doppio`);
  const per = size % 2 ? size : size - 1;
  for (let c = 0; c < 12; c++) {
    const pairs = seq.slice(c * per, (c + 1) * per).flatMap((r) => r.pairs.map(([a, b]) => pk(a, b)));
    eq(new Set(pairs).size, (size * (size - 1)) / 2, `stream ${size} giro ${c}: completo`);
  }
}
// riproducibile
const s1 = roundStream([1, 2, 3, 4, 5], 7), s2 = roundStream([1, 2, 3, 4, 5], 7);
eq(Array.from({ length: 20 }, () => s1.next()), Array.from({ length: 20 }, () => s2.next()), "stesso seme → stesso calendario");

// ── Lingua e nomi ──
eq(langOf("Fishball - EN"), { lang: "en", guessed: false }, "EN dal suffisso");
eq(langOf("Eva Rizzoli - ENG"), { lang: "en", guessed: false }, "ENG → en");
eq(langOf("Anneli- EN").lang, "en", "suffisso senza spazio");
eq(langOf("Cubanita"), { lang: "it", guessed: true }, "senza suffisso → it, dichiarato come ipotesi");
eq(baseName("Rebecca Bardaro - IT"), "Rebecca Bardaro", "nome base");

// ── Segmento: giorni, gruppi, gruppo da 2 settimanale ──
const pages = [
  ...["A - IT", "B - IT", "C - IT", "D - IT", "E - IT"].map((name, i) => ({ id: i + 1, name })),
  { id: 10, name: "X - EN" }, { id: 11, name: "Y - EN" },
];
const groups = groupPages(pages);
eq(groups, { it: [1, 2, 3, 4, 5], en: [10, 11] }, "gruppi per lingua");
eq(groupPages(pages, { paused: [3], langOverride: { 5: "en" } }), { it: [1, 2, 4], en: [5, 10, 11] }, "pausa e lingua corretta a mano");
const seg = { from: "2026-10-15", weekdays: [1, 2, 4], groups, seed: 1 };
const sched = segmentSchedule(seg, "2026-11-15");
ok(sched.every((d) => [1, 2, 4].includes(weekday(d.day))), "solo i giorni scelti");
eq(sched[0].day, "2026-10-15", "parte dal giorno indicato");
const enDays = sched.filter((d) => d.groups.en);
const weeks = new Set(enDays.map((d) => addDays(d.day, -((weekday(d.day) + 6) % 7))));
eq(weeks.size, enDays.length, "gruppo da 2: al massimo uno scambio a settimana");
ok(enDays.length >= 4, "gruppo da 2: scambia ogni settimana");
ok(sched.every((d) => d.groups.it.pairs.length === 2 && d.groups.it.rest.length === 1), "IT dispari: 2 scambi + 1 riposo al giorno");
// stessa creator in due pagine dello stesso gruppo → non si abbinano
const same = segmentSchedule({ ...seg, groups: { it: [1, 2, 3, 4] } }, "2026-12-31", { sameBase: (a, b) => pk(a, b) === "1|2" });
ok(same.every((d) => !d.groups.it.pairs.some(([a, b]) => pk(a, b) === "1|2")), "stessa creator mai abbinata a sé");

// ── Riconciliazione: lo storico non si sposta ──
const today = "2026-10-20"; // martedì
let r1 = reconcilePlan(null, { splitId: "s", groups, weekdays: [1, 2, 4], start: "2026-10-15", today });
ok(r1.changed && r1.plan.segments.length === 1, "primo segmento creato");
const r2 = reconcilePlan(r1.plan, { splitId: "s", groups, weekdays: [1, 2, 4], today });
ok(!r2.changed, "niente cambi → niente scritture");
const before = planSchedule(r1.plan, "2026-10-15", "2026-10-20");
const r3 = reconcilePlan(r1.plan, { splitId: "s", groups: { ...groups, it: [1, 2, 3, 4, 5, 6] }, weekdays: [1, 2, 4], today });
ok(r3.changed && r3.plan.segments.length === 2, "pagina nuova → segmento nuovo");
eq(r3.plan.segments[1].from, "2026-10-22", "il segmento nuovo parte dal prossimo giorno di S4S, non oggi");
eq(planSchedule(r3.plan, "2026-10-15", "2026-10-20"), before, "i giorni passati e oggi non cambiano");
ok(planSchedule(r3.plan, "2026-10-22", "2026-10-22")[0].groups.it.pairs.length === 3, "dal 22 le pagine IT sono 6");
// cambio prima che il segmento nuovo parta → lo sostituisce, non ne accoda un altro
const r4 = reconcilePlan(r3.plan, { splitId: "s", groups: { ...groups, it: [1, 2, 3, 4, 5, 6, 7] }, weekdays: [1, 2, 4], today });
eq(r4.plan.segments.length, 2, "segmento non ancora partito: sostituito");
eq(nextActiveDay([1, 2, 4], "2026-10-15"), "2026-10-19", "prossimo giorno attivo dopo giovedì = lunedì");

// ── Link ──
eq(linkNameFor("Giulia Amici - IT", "2026-10-15"), "S4S Giulia Amici 15/10", "nome link standard");
ok(isS4SLink("SFS_rebecca") && isS4SLink("POST HOME S4S VITTORIA") && !isS4SLink("Tiktok bio"), "riconosce i link S4S");
eq(linkFormat("S4S Fish Mass"), "massa", "formato massa");
eq(linkFormat("S4S Fish Home"), "post", "formato post");
eq(linkFormat("s4s laura tg 23/07"), "telegram", "formato telegram");
eq(linkFormat("SFS_rebecca"), null, "formato non dichiarato");
eq(partnerLabel("S4S Fish Mass 13/07"), "Fish", "partner dal nome");
eq(partnerLabel("SFS_christinabertevello"), "christinabertevello", "partner incollato");
eq(partnerLabel("SFS_AleSparagno"), "Ale Sparagno", "camelCase separato");

// ── Abbinamento partner su dati veri ──
const orgNames = JSON.parse(readFileSync(new URL("./fixtures/s4s-org-names.json", import.meta.url)));
const idx = buildAliasIndex(orgNames);
const M = (link, exclude) => matchPartner(link, idx, { exclude });
eq(M("S4S Fish Mass", "Martina Scavo"), "Fishball", "fish → Fishball");
eq(M("S4S Cuba Post", "Martina Scavo"), "Cubanita", "cuba → Cubanita");
eq(M("POST SFS MARTYSCAVO", "Cubanita"), "Martina Scavo", "martyscavo → Martina Scavo");
eq(M("SFS_christinabertevello", "Anastasia Policardi"), "Christina Bertevello", "nome incollato");
eq(M("SFS_michelamucciante", "Anastasia Policardi"), "Michela Mucciante", "nome incollato 2");
eq(M("SFS_AleSparagno", "Camilla Stelluti"), "Alessandra Sparagno", "cognome");
eq(M("SFS Martina Scavo", "Federica Pacela"), "Martina Scavo", "nome completo");
eq(M("SFS_anastasia", "Christina Bertevello"), "Anastasia Policardi", "nome unico");
eq(M("S4S Elisa", "Giulia Amici"), null, "Elisa ambigua (Vimercati / Esposito / Berrettini) → non si indovina");
eq(M("s4s Elisa V", "Federica Pacela"), "Elisa Vimercati", "Elisa V → Vimercati");
eq(M("SFS Elisa Esposito TG", "Giulia Ottorini"), "Elisa Esposito", "Elisa Esposito, fuori split");
eq(M("S4S Camilla", "Martina Scavo"), null, "Camilla ambigua (Stelluti / Araujo) → non si indovina");


// ── Risultati su dati veri ──
const rows = JSON.parse(readFileSync(new URL("./fixtures/s4s-links.json", import.meta.url)));
const names = { 1000000358: "Martina Scavo - IT", 160294962: "Fishball - IT", 173440612: "Elisa Vimercati - IT", 1000000408: "Cubanita", 13220686: "Federica Pacela - IT" };
const res = enrichResults(rows, names, idx);
ok(res.every((r) => r.subs >= 0 && r.first_day.length === 10), "righe normalizzate");
const camilla = res.find((r) => r.link_name === "S4S Camilla");
eq(camilla.partner, null, "senza alias manuale Camilla resta da assegnare");
eq(camilla.label_key, "camilla", "chiave alias");
const res2 = enrichResults(rows, names, idx, { camilla: "Camilla Stelluti" });
eq(res2.find((r) => r.link_name === "S4S Camilla").partner, "Camilla Stelluti", "alias manuale applicato");
eq(res2.find((r) => r.link_name === "S4S Camilla").partner_source, "manuale", "fonte dichiarata");
eq(enrichResults(rows, names, idx, { "fish": null }).find((r) => r.link_name === "S4S Fish Mass" && r.creator_id === 1000000358).partner, null, "alias manuale può anche dire 'nessuno'");
const fishMass = res.find((r) => r.link_name === "S4S Fish Mass" && r.creator_id === 1000000358);
eq(fishMass.mature_subs, 274, "abbonati maturi");
ok(Math.abs(fishMass.net30_per_sub - fishMass.net30 / 274) < 1e-9, "$/abbonato a 30 giorni");
const young = res.find((r) => r.link_name === "SFS CAMILLA");
eq(young.net30, null, "link troppo giovane: niente spesa a 30 giorni (non 0)");
eq(young.net30_per_sub, null, "link troppo giovane: niente $/abbonato");
const pages2 = [{ id: 1000000358, name: "Martina Scavo - IT" }, { id: 160294962, name: "Fishball - IT" }, { id: 1000000408, name: "Cubanita" }];
const rec = reciprocity(res, pages2);
const fm = rec.find((e) => e.a === "Fishball" && e.b === "Martina Scavo");
eq([fm.to_a, fm.to_b], [25, 401], "reciprocità Fishball ⇄ Martina (dati veri)");
const byPage = summarizeByPage(res);
eq(byPage.find((p) => p.creator_id === 1000000358).best.partner, "Camilla", "miglior scambio di Martina");
// scambio pianificato → risultato
const fake = [{ creator_id: 1, partner: "Giulia Amici", first_day: "2026-10-16", subs: 40, link_name: "S4S Giulia Amici 15/10" }];
eq(resultFor(fake, 1, "Giulia Amici - IT", "2026-10-15"), { subs: 40, links: ["S4S Giulia Amici 15/10"] }, "risultato agganciato al giorno");
eq(resultFor(fake, 1, "Giulia Amici - IT", "2026-10-29"), null, "fuori finestra → niente");
eq(lastExchange(fake, 1, "Giulia Amici", "2026-11-30"), { day: "2026-10-16", subs: 40 }, "ultimo scambio");
// testo WhatsApp
const txt = whatsappText({ day: "2026-10-15", groups: { it: { pairs: [[1, 2]], rest: [3] } } }, { 1: "Giulia Amici - IT", 2: "Stormy - IT", 3: "Cubanita" });
ok(txt.includes("giovedì 15 ottobre") && txt.includes("link su Giulia Amici: S4S Stormy 15/10") && txt.includes("Riposa: Cubanita"), "testo WhatsApp");
eq(dayLabel("2026-10-19"), "lunedì 19 ottobre", "etichetta giorno");

console.log(`ok ${n} asserzioni`);

// ── Link incollati ──
import { normalizeLinkUrl, handleFromUrl, sideKey, sideStatus } from "../src/lib/s4s-core.js";
let m2 = 0;
const eq2 = (a, b, msg) => { assert.deepEqual(a, b, msg); m2++; };
eq2(normalizeLinkUrl("https://onlyfans.com/martyscavo/c24"), "onlyfans.com/martyscavo/c24", "url base");
eq2(normalizeLinkUrl("onlyfans.com/MartyScavo/c24/"), "onlyfans.com/martyscavo/c24", "senza schema, maiuscole, barra finale");
eq2(normalizeLinkUrl("https://www.onlyfans.com/u570022653/c11?ref=x"), "onlyfans.com/u570022653/c11", "www e query");
eq2(normalizeLinkUrl("https://onlyfans.com/martyscavo"), null, "profilo senza campagna → no");
eq2(normalizeLinkUrl("https://evil.com/onlyfans.com/a/c1"), null, "altro dominio → no");
eq2(handleFromUrl("https://onlyfans.com/fishballsgg/c251"), "fishballsgg", "handle");
eq2(sideKey("2026-10-15", 1, 2), "2026-10-15|1|2", "chiave");
const T = "2026-10-15";
eq2(sideStatus({ day: "2026-10-20", today: T }).code, "futuro", "futuro senza link");
eq2(sideStatus({ day: T, today: T }).code, "da-fare", "oggi senza link");
eq2(sideStatus({ day: "2026-10-13", today: T }).code, "mancante", "passato senza link");
eq2(sideStatus({ day: T, today: T, url: "x" }).code, "pronto", "incollato senza dati");
eq2(sideStatus({ day: T, today: T, url: "x", stat: { clicks: 40, subs: 0 } }), { code: "pubblicato", label: "pubblicato · 40 click" }, "click senza abbonati");
eq2(sideStatus({ day: T, today: T, url: "x", stat: { clicks: 40, subs: 12 } }).code, "misurato", "abbonati");
eq2(sideStatus({ day: "2026-10-13", today: T, result: { subs: 5 } }).code, "misurato", "trovato per nome");
console.log(`ok ${m2} asserzioni sui link incollati`);
