// Unit test — Radar creator (funzioni pure). Esegui: node tests/scouting.mjs
//
// Le decisioni facili da rompere per sbaglio:
//   - la crescita si calcola solo con abbastanza storia (null ≠ 0%)
//   - un collegamento si PROPONE ma non si applica da solo; i link generici (linktr.ee nudo) non bastano
//   - fondere due schede non perde note e non fa tornare indietro la fase
//   - "cancella su richiesta" toglie l'account anche dalle proposte scartate
import assert from "node:assert/strict";
import {
  weekKey, normHandle, parseRefreshItem, appendHistory, growthPct, sumHistories,
  handleStem, linkKey, suggestLinks, buildCreators, stageCounts,
  creatorIdOf, setStage, addNote, setField, linkHandles, unlinkHandle, dismissSuggestion, forgetHandle,
  HISTORY_MAX, DEFAULT_STAGE, applyRefresh, scrubContacts,
  classifyUrl, bestLink, whyLines, pickToday, parseInstagramLink, marketByGroup,
} from "../src/lib/scouting-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// settimane ISO
eq(weekKey(new Date(Date.UTC(2026, 9, 9))), "2026-W41", "9 ott 2026 = W41");
eq(weekKey(new Date(Date.UTC(2027, 0, 1))), "2026-W53", "1 gen 2027 cade nell'ultima settimana del 2026");

// handle
eq(normHandle("https://instagram.com/Serena.Cab_/"), "serena.cab_", "url → handle minuscolo");
eq(normHandle("@foo"), "foo", "via la chiocciola");

// riga del giro settimanale
const it = parseRefreshItem({ Account: "https://instagram.com/abc", "Followers Count": "1200", "Median Views": "N/A", "External URL": "N/A", "Analysis Status": "analyzed" });
eq(it.fol, 1200, "follower numerici"); eq(it.medv, null, "N/A → null, non 0"); eq(it.url, "", "N/A → link vuoto");
eq(parseRefreshItem({ Account: "N/A" }), null, "riga senza account scartata");
eq(parseRefreshItem({ Account: "https://instagram.com/x", "Analysis Status": "not_analyzed" }), null, "non analizzato scartato");

// storico e crescita
let h = appendHistory([], "2026-W40", 1000, 50);
h = appendHistory(h, "2026-W41", 1100, 60);
h = appendHistory(h, "2026-W41", 1200, 70);
eq(h.length, 2, "la stessa settimana si sovrascrive"); eq(h[1][1], 1200, "vince l'ultima misura");
eq(growthPct(h, 1), 20, "+20% sulla settimana");
eq(growthPct(h, 4), null, "senza 5 misure la crescita a 4 settimane è null, non 0");
eq(growthPct([["2026-W40", null, 1]], 1), null, "follower mancanti ignorati");
let long = [];
for (let i = 0; i < HISTORY_MAX + 10; i++) long = appendHistory(long, `2026-W${String(i).padStart(3, "0")}`, i + 1, null);
eq(long.length, HISTORY_MAX, "storico tagliato al massimo");
eq(sumHistories([[["W1", 10, 1], ["W2", 20, 1]], [["W2", 5, 1]]]), [["W1", 10, null], ["W2", 25, null]], "somma per settimana");

// radici dei nomi e link
eq(handleStem("serena.incabina").first, "serena", "radice = primo pezzo");
eq(handleStem("debbie_cyber_back_up").joined, "debbiecyber", "via backup/up/underscore");
eq(linkKey("https://linktr.ee"), null, "linktr.ee nudo non identifica nessuno");
eq(linkKey("https://linktr.ee/Mia"), "linktr.ee/mia", "linktr.ee con nome sì");
eq(linkKey("https://t.me/+abc?x=1"), "t.me/+abc", "telegram con invito");
eq(linkKey("https://t.me/m/xyz123"), "t.me/xyz123", "t.me/m/<id>: il pezzo generico si salta");
eq(linkKey("https://whatsapp.com/channel/0029Vb"), "whatsapp.com/0029vb", "canale whatsapp = id del canale");
eq(linkKey("sarasfamurri.link/sarasfamurri"), "sarasfamurri.link", "dominio personale = il dominio");
eq(linkKey("https://open.spotify.com/track/123"), null, "una canzone non identifica una persona");
eq(linkKey("https://amzn.eu/d/abc"), null, "un prodotto Amazon nemmeno");

// proposte
const profiles = [
  { h: "serena.cab_", url: "https://serena.example.com/vip", nic: "camionista 54 anni" },
  { h: "serena.incabina", url: "", nic: "camionista 54 anni, persona narrativa" },
  { h: "martina.rossi", url: "", nic: "fitness Roma" },
  { h: "martina.bianchi", url: "", nic: "cosplay anime" },
  { h: "song1", url: "https://open.spotify.com/track/1" },
  { h: "song2", url: "https://open.spotify.com/track/1" },
  { h: "debbie_cyber_", url: "https://t.me/+xyz" },
  { h: "debbie_cyber_back_up", url: "https://t.me/+xyz", bio: "account principale @debbie_cyber_" },
  { h: "mario", url: "https://linktr.ee" },
  { h: "luigi", url: "https://linktr.ee" },
];
let crm = { creators: {}, dismissed: [] };
let sug = suggestLinks(profiles, (x) => creatorIdOf(crm, x));
ok(sug.some((s) => s.a === "debbie_cyber_" && s.b === "debbie_cyber_back_up" && s.strength === 3), "stesso telegram → proposta forte");
ok(sug.some((s) => s.a === "serena.cab_" && s.b === "serena.incabina"), "stesso nome di battesimo + stessa nicchia → proposta");
ok(!sug.some((s) => s.a.startsWith("martina") && s.b.startsWith("martina")), "stesso nome di battesimo ma nicchie diverse → niente");
ok(!sug.some((s) => s.a.startsWith("song")), "stessa canzone di Spotify → niente");
ok(!sug.some((s) => [s.a, s.b].includes("mario")), "linktr.ee nudo non collega sconosciuti");
eq(new Set(sug.map((s) => `${s.a}|${s.b}`)).size, sug.length, "nessuna coppia doppia");

// fasi, note, fusione
const P = [
  { h: "serena.cab_", fol: 38000, medv: 5000, sig: "forte", fmt: "ruolo o mestiere", u: 5, hist: [["2026-W40", 30000, 1], ["2026-W41", 38000, 1]] },
  { h: "serena.incabina", fol: 30000, medv: 9000, sig: "debole", fmt: "nessuno", u: 4, hist: [["2026-W40", 30000, 1], ["2026-W41", 30000, 1]] },
];
let rows = buildCreators(P, crm);
eq(rows.length, 2, "senza collegamenti: una creator per account");
ok(rows.every((r) => r.stage === DEFAULT_STAGE), "fase di partenza");
crm = setStage(crm, "h:serena.incabina", "interessante", "nicholas");
crm = addNote(crm, "h:serena.incabina", "rete di account", "nicholas");
crm = linkHandles(crm, "serena.cab_", "serena.incabina");
const id = creatorIdOf(crm, "serena.incabina");
eq(id, creatorIdOf(crm, "serena.cab_"), "dopo il collegamento stessa creator");
eq(crm.creators[id].stage, "interessante", "la fase più avanzata sopravvive alla fusione");
eq(crm.creators[id].notes.length, 1, "la nota sopravvive alla fusione");
rows = buildCreators(P, crm);
eq(rows.length, 1, "una scheda sola"); eq(rows[0].fol, 68000, "follower sommati");
eq(rows[0].medv, 9000, "view = il migliore degli account"); eq(rows[0].sig, "forte", "segnale = il più forte");
eq(rows[0].g1, 13.3, "crescita sulla somma degli storici (60k→68k)");
eq(stageCounts(rows).interessante, 1, "conteggio per fase");
eq(Object.keys(stageCounts([])).length, 6, "tutte le fasi anche a zero");
sug = suggestLinks(profiles, (x) => creatorIdOf(crm, x));
ok(!sug.some((s) => s.a === "serena.cab_" && s.b === "serena.incabina"), "già collegati → niente proposta");
crm = unlinkHandle(crm, "serena.incabina");
eq(creatorIdOf(crm, "serena.incabina"), "h:serena.incabina", "staccato torna da solo");
eq(crm.creators[id].handles, ["serena.cab_"], "l'altra scheda resta");
crm = setField(crm, id, "name", "Serena camionista");
eq(crm.creators[id].name, "Serena camionista", "nome della scheda");
assert.throws(() => setField(crm, id, "stage", "x")); n++;
assert.throws(() => setStage(crm, id, "boh")); n++;
assert.throws(() => addNote(crm, id, "   ")); n++;

// scartate e cancellazione
crm = dismissSuggestion(crm, "debbie_cyber_back_up", "debbie_cyber_");
sug = suggestLinks(profiles, (x) => creatorIdOf(crm, x), new Set(crm.dismissed));
ok(!sug.some((s) => s.a === "debbie_cyber_"), "proposta scartata non torna");
crm = forgetHandle(crm, "debbie_cyber_");
ok(!crm.dismissed.some((k) => k.includes("debbie_cyber_|") || k.endsWith("|debbie_cyber_")), "cancellata anche dalle scartate");
crm = setStage(crm, "h:mario", "scartata");
crm = forgetHandle(crm, "mario");
ok(!crm.creators["h:mario"], "cancellata la scheda di un solo account");

// giro settimanale: righe nel formato vero dell'attore Apify (verificato il 9/10/2026)
const before = [
  { h: "serena.cab_", fol: 38000, medv: 5000, hist: [["2026-W41", 38000, 5000]], sig: "forte", nota: "x" },
  { h: "sparita", fol: 900, medv: 100, hist: [["2026-W41", 900, 100]] },
];
const items = [
  { Account: "https://instagram.com/serena.cab_", "Followers Count": 41000, "Median Views": 6100, "Views.Followers Ratio": 14.9, "External URL": "https://serenaferri.com", Biography: "camionista", "Analysis Status": "analyzed" },
  { Account: "N/A", "Analysis Status": "not_analyzed", "Why Not Analyzed": "budget" },
];
const res = applyRefresh(before, items, new Date(Date.UTC(2026, 9, 16)));
eq(res.updated, 1, "un account aggiornato"); eq(res.missing, 1, "uno mancante");
const sc = res.profiles.find((p) => p.h === "serena.cab_");
eq(sc.fol, 41000, "follower nuovi"); eq(sc.hist.length, 2, "storico allungato di una settimana"); eq(sc.hist[1][0], "2026-W42", "settimana giusta");
eq(sc.sig, "forte", "il giudizio della ricerca resta"); eq(growthPct(sc.hist, 1), 7.9, "crescita calcolata dal giro");
const gone = res.profiles.find((p) => p.h === "sparita");
eq(gone.fol, 900, "chi manca tiene gli ultimi numeri"); eq(gone.missing, 1, "e conta un mancato");
eq(applyRefresh(res.profiles, [], new Date(Date.UTC(2026, 9, 23))).profiles.find((p) => p.h === "sparita").missing, 2, "i mancati si sommano");

// contatti tolti dalla bio, handle tenuti
eq(scrubContacts("chat 📞 +39 333 123 4567 info: anna.rossi@gmail.com seguimi @anna_privata"), "chat 📞 info: seguimi @anna_privata", "via telefono ed email, resta l'handle");
eq(scrubContacts("classe 1998 · 1,70"), "classe 1998 · 1,70", "anni e altezza non sono telefoni");
eq(parseRefreshItem({ Account: "https://instagram.com/x_y", Biography: "wa 3331234567", "Analysis Status": "analyzed" }).bio, "wa", "il giro settimanale pulisce la bio");

// dove porta un link
eq(classifyUrl("https://t.me/+AbCd"), { label: "Telegram privato", strength: 3 }, "invito Telegram = privato");
eq(classifyUrl("t.me/canale").label, "Telegram", "canale Telegram pubblico");
eq(classifyUrl("https://onlyfans.com/x").strength, 3, "OnlyFans");
eq(classifyUrl("https://linktr.ee/x").label, "Pagina di link", "linktree");
eq(classifyUrl("http://sfamurri.link/sara").label, "Pagina di link", "dominio .link = pagina di link");
eq(classifyUrl("https://www.miosito.it").strength, 0, "sito qualsiasi non è un indizio");
eq(classifyUrl("https://open.spotify.com/x"), null, "spotify non dice niente");
eq(bestLink([{ url: "https://linktr.ee/a", hlLinks: ["https://t.me/+x"] }]).where, "evidenza", "vince il link più parlante, dalle evidenze");
// segnalazioni: link di Instagram
eq(parseInstagramLink("https://www.instagram.com/reel/DaNB2I_i6jA/?igsh=x"), { code: "DaNB2I_i6jA" }, "reel → codice");
eq(parseInstagramLink("https://instagram.com/Lagnometta?igsh=1"), { handle: "lagnometta" }, "profilo → account");
eq(parseInstagramLink("guarda @lagnometta"), null, "testo con @ in mezzo non è un link");
eq(parseInstagramLink("@lagnometta"), { handle: "lagnometta" }, "solo @account");
eq(parseInstagramLink("https://example.com/x"), null, "non Instagram");
// perché guardarla e da guardare oggi
const cA = { id: "h:a", name: "@a", handles: ["a"], sig: "forte", fmt: "ruolo o mestiere", u: 4, g4: 8, medv: 30000, fol: 50000, stage: "da_valutare", link: { label: "Telegram privato", where: "evidenza", strength: 3 }, firstSeen: Date.now() };
const cB = { ...cA, id: "h:b", handles: ["b"], fmt: "nessuno", u: 1, g4: null, link: null, firstSeen: 0 };
const cC = { ...cA, id: "h:c", handles: ["c"], stage: "interessante" };
const why = whyLines(cA);
ok(why[0].includes("ruolo o mestiere") && why.some((w) => w.includes("prima storia in evidenza")) && why.some((w) => w.includes("+8")), "il perché viene dai fatti");
eq(pickToday([cB, cA, cC]).map((c) => c.id), ["h:a", "h:b"], "da guardare: prima chi ha più fatti, mai chi è già valutata");
eq(marketByGroup([{ g: "X", sig: "forte" }, { g: "X", sig: "nessuno" }])[0], { g: "X", n: 2, paid: 1, pct: 50 }, "mercato per nicchia");

console.log(`scouting: ${n} asserzioni ok`);

// --- foto profilo (link a tempo di Instagram) e gancio della riga, 10/10/2026
{
  const { igPicUrl, picExpiry, livePic, hookLine, attentionScore } = await import("../src/lib/scouting-core.js");
  const exp = Math.floor(Date.UTC(2026, 9, 14) / 1000).toString(16);
  const u = `https://scontent-fco2-1.cdninstagram.com/v/t51.2885-19/x.jpg?stp=dst&oe=${exp}&_nc_sid=1`;
  assert.equal(igPicUrl(u), u);
  assert.equal(igPicUrl("https://evil.example.com/x.jpg"), null);
  assert.equal(igPicUrl("http://scontent.cdninstagram.com/x.jpg"), null);
  assert.equal(picExpiry(u), parseInt(exp, 16) * 1000);
  assert.equal(livePic(u, Date.UTC(2026, 9, 10)), u);
  assert.equal(livePic(u, Date.UTC(2026, 9, 15)), null);
  assert.equal(livePic("https://scontent.cdninstagram.com/x.jpg", Date.UTC(2026, 9, 10)), null, "senza scadenza non si rischia un'immagine rotta");
  assert.equal(hookLine({ sig: "forte", fmt: "personaggi ricorrenti" }), "Ha un format che si ripete: personaggi ricorrenti.");
  assert.equal(hookLine({ sig: "forte", fmt: "nessuno" }), null, "il profilo a pagamento è già nel chip, non nel gancio");
  assert.ok(attentionScore({ sig: "forte", fmt: "x", u: 4 }) > attentionScore({ sig: "nessuno" }));
  const { applyRefresh } = await import("../src/lib/scouting-core.js");
  const r = applyRefresh([{ h: "anna" }], [{ Account: "anna", "Followers Count": 10, "Profile Picture": u }]);
  assert.equal(r.profiles[0].pic, u);
  console.log("foto profilo + gancio: ok");
}
