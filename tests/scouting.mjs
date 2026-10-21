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
  classifyUrl, bestLink, linkWhere, highlightHint, linkOrHint, sigFromLink, signalWhat, parseHighlightRows, applyHighlightRead, hlRereadCandidates, whyLines, pickToday, parseInstagramLink, marketByGroup,
  knownBefore, signalOrigin, sameAsSuggestions,
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


// giro dei tag (15/10/2026): link nella bio dell'account taggato nella prima evidenza
const viaP = { h: "alice", url: "", hlLinks: [], hlVia: [{ h: "imieilinkzz", urls: ["http://getmysocial.com/alicelatsxo"] }] };
const lv = bestLink([viaP]);
eq([lv.where, lv.via, lv.strength], ["tag", "imieilinkzz", 1], "il link dell'account taggato conta, con chi l'ha portato");
eq(linkWhere(lv, { short: true }), "tramite @imieilinkzz", "etichetta corta");
ok(linkWhere(lv).includes("taggato nella prima storia in evidenza"), "frase lunga dice da dove viene");
eq(bestLink([{ ...viaP, hlVia: [{ h: "x", urls: ["https://onlyfans.com/a"] }], url: "https://linktr.ee/a" }]).where, "tag", "OnlyFans dietro il tag batte la pagina di link in bio");
eq(bestLink([{ ...viaP, hlVia: [{ h: "x", urls: [] }] }]), null, "tag senza link = nessun link, non inventato");
eq(bestLink([{ url: "", hlVia: [null] }]), null, "voci rotte ignorate");
ok(whyLines({ link: { label: "OnlyFans", strength: 3, where: "tag", via: "x" } })[0].includes("@x"), "il perché nomina l'account taggato");
eq(suggestLinks([{ h: "a", url: "", hlVia: [{ h: "t", urls: ["https://onlyfans.com/zed"] }] }, { h: "b", url: "https://onlyfans.com/zed" }], (h) => h).length, 1, "stesso link anche via tag propone il collegamento");

// link o tag nella prima evidenza = da guardare (16/10/2026, @aliiciottaa e @alicelatspreferita)
eq(classifyUrl("https://cutepage.me/aliiciottaa").label, "Pagina di link", "cutepage.me = pagina di link");
const aliiP = { h: "aliiciottaa", url: "", hlLinks: ["https://cutepage.me/aliiciottaa"], hlVia: [] };
eq(sigFromLink(linkOrHint([aliiP])), "debole", "pagina di link nella storia = da guardare");
const unk = linkOrHint([{ h: "x", url: "", hlLinks: ["https://sconosciuto.example/x"], hlVia: [] }]);
eq([unk.label, unk.strength, unk.where], ["Link", 1, "evidenza"], "link qualsiasi nella storia = da guardare, anche se non lo riconosciamo");
const tagOnly = linkOrHint([{ h: "alice", url: "", hlLinks: [], hlVia: [{ h: "imieilinkzz", urls: [] }] }]);
eq([tagOnly.tag, tagOnly.strength], ["imieilinkzz", 1], "tag senza link leggibile = da guardare");
ok(signalWhat(tagOnly).includes("tagga @imieilinkzz"), "il messaggio nomina il tag");
eq(linkOrHint([{ ...viaP }]).where, "tag", "il link dietro il tag vince sul solo tag");
eq(linkOrHint([{ h: "a", url: "https://onlyfans.com/a", hlLinks: ["https://x.example"], hlVia: [] }]).label, "OnlyFans", "il link forte vince sull'indizio");
eq(highlightHint([{ h: "a", url: "https://linktr.ee/a" }]), null, "il link in bio non è un indizio dell'evidenza");
eq(sigFromLink(linkOrHint([{ h: "a", url: "https://www.miosito.it" }])), "nessuno", "un sito in bio resta nessuno");
ok(signalWhat(null, { hlFailed: true }).includes("NON letta"), "evidenza non letta: detto, non confuso con niente trovato");
ok(signalWhat(null).startsWith("nessun link"), "niente trovato davvero");
const rowsSig = buildCreators([{ ...aliiP, sig: "nessuno", fol: 1 }, { h: "old", url: "", hlLinks: ["https://x.example"], sig: "nessuno", fol: 1 }], { creators: {} });
eq(rowsSig.map((r) => r.sig), ["debole", "nessuno"], "da guardare anche se letta prima della regola; la prima ricerca (senza hlVia) non cambia");
ok(whyLines({ sig: "debole", link: tagOnly })[0].includes("tagga @imieilinkzz"), "il perché dice del tag");

// rilettura delle prime evidenze (16/10/2026): righe vere dell'attore
const hlRows = [
  { inputUsername: "aliiciottaa", accountStatus: "not_scanned", itemKind: "status" },
  { inputUsername: "aliiciottaa", accountStatus: "ok", itemKind: "highlight_tray", linkStickers: [], mentions: [] },
  { inputUsername: "aliiciottaa", accountStatus: "ok", itemKind: "highlight_item", linkStickers: [{ url: "https://cutepage.me/aliiciottaa" }], mentions: [] },
  { inputUsername: "alicelatspreferita", accountStatus: "ok", itemKind: "highlight_item", linkStickers: "[]", mentions: "[{'username': 'imieilinkzz', 'isPrivate': True}]" },
  { inputUsername: "mario", accountStatus: "no_highlights", itemKind: "status" },
  { inputUsername: "test", accountStatus: "private", itemKind: "status" },
  { inputUsername: "nonesiste", accountStatus: "not_found", itemKind: "status" },
  { inputUsername: "rotto", accountStatus: "error", retryable: true, itemKind: "status" },
];
const ph = parseHighlightRows(hlRows);
eq(ph.get("aliiciottaa"), { read: true, gone: false, retryable: false, urls: ["https://cutepage.me/aliiciottaa"], mentions: [] }, "link dello sticker letto, la riga not_scanned non conta");
eq(ph.get("alicelatspreferita").mentions, ["imieilinkzz"], "menzioni anche in formato testo");
eq([ph.get("mario").read, ph.get("mario").gone], [true, false], "senza evidenze = letta, non un errore");
eq([ph.get("test").read, ph.get("test").gone, ph.get("nonesiste").gone], [false, true, true], "privata o sparita: non leggibile, non si riprova");
eq([ph.get("rotto").read, ph.get("rotto").gone, ph.get("rotto").retryable], [false, false, true], "errore: non letta, da riprovare");
const hlBefore = { h: "alicelatspreferita", url: "", sig: "nessuno", hlLinks: ["https://vecchio.example"] };
const hlAfter = applyHighlightRead(hlBefore, { urls: [], mentions: ["imieilinkzz"] }, new Map([["imieilinkzz", { urls: ["http://getmysocial.com/alicelatsxo"], priv: true }]]), 5);
eq([hlAfter.sig, hlAfter.hlAt, hlAfter.hlLinks[0], hlAfter.hlVia[0].priv], ["debole", 5, "https://vecchio.example", true], "tag con link in bio: da guardare, i link vecchi restano");
eq(applyHighlightRead({ h: "x", sig: "forte", url: "https://onlyfans.com/x" }, { urls: [], mentions: [] }).sig, "forte", "una lettura vuota non abbassa mai il livello");
eq(applyHighlightRead({ h: "x", sig: "nessuno", url: "https://linktr.ee/x" }, { urls: [], mentions: [] }).sig, "nessuno", "la bio non conta per la rilettura (resta la classificazione della ricerca)");
const crmR = { creators: { "c1": { handles: ["vista"], stage: "interessante" } } };
const candP = [
  { h: "base", sig: "nessuno", fol: 1 }, { h: "segn", sig: "debole", src: "segnalata", fol: 1 },
  { h: "pagante", sig: "forte", fol: 1 }, { h: "nostra", sig: "nessuno", ours: true, fol: 1 },
  { h: "vista", sig: "nessuno", fol: 1 }, { h: "giaLetta", sig: "nessuno", hlAt: 1, fol: 1 },
  { h: "conTag", sig: "nessuno", hlVia: [], fol: 1 }, { h: "cancellata", sig: "nessuno", fol: 1 }, { h: "sparita", sig: "nessuno", missing: 2, fol: 1 },
];
eq(hlRereadCandidates(candP, crmR, new Set(["cancellata"])), ["segn", "base"], "da rileggere: da valutare, senza profilo a pagamento, mai lette coi tag; prima le segnalate");


// chi l'aveva già trovata (21/10/2026): segnalazione di un account già nel radar
{
  const D = (d) => Date.UTC(2026, 9, d, 10);
  const radar = { h: "sassa.santo", src: "profili simili", firstSeen: D(9), sig: "debole" };
  const crmC = { stage: "scartata", reviewedAt: D(12), reviewedBy: "Claudia", notes: [{ at: D(15), by: "Giulia", text: "Segnalata da Giulia: reel virale" }, { at: D(16), by: "x", text: "nota qualsiasi" }] };
  const k = knownBefore(radar, crmC);
  eq([k.how, k.by, k.signals, k.lastSignal.by, k.stage, k.reviewedBy], ["profili simili", null, 1, "Giulia", "scartata", "Claudia"], "fatti noti prima della segnalazione");
  eq(knownBefore(null, crmC), null, "non nel radar = null");
  const o = signalOrigin({ status: "gia_nel_radar", at: D(22), by: "Nicholas", known: k }, { me: "nicholas" });
  eq([o.kind, o.who, o.title], ["gia", "radar", "L'aveva già trovata il radar"], "trovata dal radar");
  ok(o.line.includes("cercando tra i profili collegati") && o.line.includes("scartata da Claudia") && o.line.includes("segnalata un'altra volta"), `riga: ${o.line}`);
  const mineK = knownBefore({ h: "a", src: "segnalata", by: "Nicholas Ferraresi Luppi", firstSeen: D(17) }, { notes: [{ at: D(17), by: "Nicholas Ferraresi Luppi", text: "Segnalata da Nicholas Ferraresi Luppi" }] });
  const o2 = signalOrigin({ status: "gia_nel_radar", at: D(22), by: "Nicholas Ferraresi Luppi", known: mineK }, { me: "Nicholas Ferraresi Luppi" });
  eq([o2.who, o2.title], ["persona", "L'avevi già segnalata tu"], "già segnalata da me");
  ok(o2.line.includes("non ancora valutata") && !o2.line.includes("altra volta"), "la prima segnalazione non conta come «un'altra volta»");
  eq(signalOrigin({ status: "nuova", by: "Nicholas" }, { me: "Nicholas" }).title, "Trovata da te", "nuova = trovata da chi segnala");
  eq(signalOrigin({ status: "nuova", by: "Giulia" }, { me: "Nicholas" }).title, "Trovata da Giulia", "nuova di un altro");
  const subito = signalOrigin({ status: "in_lettura", pre: { h: "a", known: k } }, { me: "Nicholas" });
  eq([subito.kind, subito.title], ["lettura", "L'aveva già trovata il radar"], "chi l'aveva trovata si sa SUBITO, prima della verifica");
  eq(o.short, "Trovata dal radar il 9 ott · scartata da Claudia il 12 ott", "riga corta dell'elenco");
  eq(signalOrigin({ status: "in_lettura", pre: { h: "a", known: null } }).title, "Non è nel radar", "subito: nuova");
  // segnalazioni di prima del 21/10 (senza `known`): dal profilo, solo se c'era già prima
  const old = signalOrigin({ status: "gia_nel_radar", at: D(17), by: "Nicholas" }, { me: "Nicholas", profile: radar });
  eq(old.title, "L'aveva già trovata il radar", "segnalazione vecchia: origine dal profilo");
  eq(signalOrigin({ status: "errore", msg: "boom" }).kind, "errore", "errore");
  // stessa persona: stesso link in bio
  const ps = [{ h: "mara.back", url: "https://onlyfans.com/maraxx" }, { h: "mara.main", url: "https://onlyfans.com/maraxx" }, { h: "altra", url: "" }];
  eq(sameAsSuggestions(ps, { creators: {} }, "mara.back").map((x) => x.h), ["mara.main"], "proposta: stessa persona di un altro account");
  eq(sameAsSuggestions(ps, { creators: {}, dismissed: ["mara.back|mara.main"] }, "mara.back"), [], "proposta scartata non torna");
}

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
  assert.equal(hookLine({ sig: "forte", fmt: "altro: valuta il mio outfit" }), "Ha un format che si ripete: valuta il mio outfit.");
  console.log("foto profilo + gancio: ok");
}

// --- aggiornamento parziale (giro foto): chi non è nel run non conta un "mancato"
{
  const { applyPartialRefresh } = await import("../src/lib/scouting-core.js");
  const pic = "https://scontent.cdninstagram.com/x.jpg?oe=6A000000";
  const r = applyPartialRefresh([{ h: "a", fol: 1 }, { h: "b", fol: 2 }], [{ Account: "a", "Followers Count": 5, "Profile Picture": pic }]);
  assert.equal(r.profiles[0].fol, 5);
  assert.equal(r.profiles[0].pic, pic);
  assert.equal(r.profiles[1].missing, undefined, "b non era nel run: resta com'era");
  assert.equal(r.updated, 1); assert.equal(r.pics, 1);
  console.log("aggiornamento parziale: ok");
}

// --- agenzie mappate a mano (10/10/2026)
{
  const { setField, buildCreators, agencies } = await import("../src/lib/scouting-core.js");
  let crm = setField({ creators: {} }, "h:a", "agency", "  Agenzia Rossa ");
  crm = setField(crm, "h:b", "agency", "agenzia rossa");
  crm = setField(crm, "h:c", "agency", "Indipendente");
  const cs = buildCreators([{ h: "a", sig: "forte" }, { h: "b" }, { h: "c" }, { h: "d" }], crm);
  assert.equal(cs.find((c) => c.handles[0] === "a").agency, "Agenzia Rossa");
  const ag = agencies(cs);
  assert.deepEqual(ag.map((x) => [x.name, x.n, x.paid]), [["Agenzia Rossa", 2, 1], ["Indipendente", 1, 0]], "stessa agenzia scritta in modo diverso = una; Indipendente in fondo");
  assert.throws(() => setField(crm, "h:a", "bio", "x"));
  console.log("agenzie: ok");
}

// --- coda Valuta (13/10/2026)
{
  const { review, unreview, reviewQueue, buildCreators } = await import("../src/lib/scouting-core.js");
  let crm = review({ creators: {} }, "h:a", "vista", "N");
  assert.equal(crm.creators["h:a"].stage, "da_valutare", "vista non cambia la fase");
  assert.ok(crm.creators["h:a"].reviewedAt);
  crm = review(crm, "h:b", "interessante", "N");
  assert.equal(crm.creators["h:b"].stage, "interessante");
  const cs = buildCreators([{ h: "a", sig: "forte" }, { h: "b", sig: "forte" }, { h: "c", sig: "forte" }, { h: "d", sig: "nessuno" }], crm);
  assert.deepEqual(reviewQueue(cs).map((c) => c.handles[0]), ["c"], "fuori le già valutate");
  assert.deepEqual(reviewQueue(cs, { scope: "all" }).map((c) => c.handles[0]).sort(), ["c", "d"]);
  crm = unreview(crm, "h:b");
  assert.equal(crm.creators["h:b"].stage, "da_valutare"); assert.equal(crm.creators["h:b"].reviewedAt, undefined);
  assert.throws(() => review(crm, "h:x", "firmata"));
  console.log("coda valuta: ok");
}

// --- catena dei seguiti: folAt/fing arrivano sulla creator (14/10/2026)
{
  const { buildCreators } = await import("../src/lib/scouting-core.js");
  const cs = buildCreators([{ h: "a", sig: "forte", folAt: 5, fing: 120 }, { h: "b", sig: "forte" }], { creators: {} });
  assert.equal(cs.find((c) => c.handles[0] === "a").folAt, 5);
  assert.equal(cs.find((c) => c.handles[0] === "a").fing, 120);
  assert.equal(cs.find((c) => c.handles[0] === "b").folAt, null);
  console.log("catena seguiti: ok");
}

// --- test Elisa (17/10/2026): link che da soli non dicono niente, aperti dal server
{
  const { classifyUrl, probeVerdict, probeKind, probedOrClassified, probeUrlsOf, probeCandidates, applyProbes, buildCreators, whyLines, attentionScore } = await import("../src/lib/scouting-core.js");
  // WhatsApp: canale = diretto come Telegram, numero = da guardare
  assert.equal(classifyUrl("https://whatsapp.com/channel/0029Va").label, "Canale WhatsApp");
  assert.equal(classifyUrl("https://whatsapp.com/channel/0029Va").strength, 2);
  assert.equal(classifyUrl("https://wa.me/393331234567").strength, 1);
  assert.equal(classifyUrl("https://cliickto.me/elisaaesp").label, "Pagina di link");
  // codice delle pagine vere (ridotto): cliickto.me di Elisa, iambabye.com di Elena Maraga, elisaesposito.com
  assert.equal(probeVerdict('<img src="https://assets.linkscale.to/icons/onlyfans/onlyfans-1.webp">').label, "OnlyFans");
  assert.equal(probeVerdict('<a id="onlyfans" href="/go?k=of" class="link">').strength, 3);
  assert.equal(probeVerdict('<img src="https://minisoft-cdn.pages.dev/sw/images/of.svg">').label, "OnlyFans");
  assert.equal(probeVerdict('{"url":"https:\\/\\/onlyfans.com\\/sara_x"}').label, "OnlyFans", "indirizzo vero, anche nel JSON con le barre");
  assert.equal(probeVerdict('<a href="https://onlyfans.com/legal/terms">'), null, "le pagine legali non sono un profilo");
  // la sola parola non basta (Linktree, TikTok e i giornali la contengono per tutti)
  assert.equal(probeVerdict('<script>var types=["onlyfans","telegram","18+"]</script>'), null);
  // Telegram e WhatsApp contano solo sulle pagine di link, non su un sito qualsiasi
  assert.equal(probeVerdict('<a href="https://t.me/ilfattoquotidiano">'), null, "il canale del giornale");
  assert.deepEqual(probeVerdict('<a href="https://t.me/saracanale">', { linkPage: true }).strength, 1, "canale pubblico = indizio");
  assert.equal(probeVerdict('<a href="https://t.me/+AbCdEf12">', { linkPage: true }).label, "Telegram privato");
  assert.equal(probeVerdict('<a href="https://t.me/share/url?u=x">', { linkPage: true }), null, "pulsante condividi");
  assert.equal(probeVerdict("<p>Benvenuti nel mio sito di gioielli</p>"), null);
  // cosa si apre: pagine di link e siti propri sì; social, giornali e link già parlanti no
  assert.deepEqual(probeKind("https://cliickto.me/elisaaesp"), { linkPage: true });
  assert.deepEqual(probeKind("https://elisaesposito.com"), { linkPage: false });
  assert.equal(probeKind("https://www.tiktok.com/@x"), null);
  assert.equal(probeKind("https://www.corriere.it/scuola/x"), null);
  assert.equal(probeKind("https://onlyfans.com/x"), null);
  // il risultato aperto vince sull'etichetta del sito
  const elisa = { h: "eli.espositoo", fol: 708000, sig: "nessuno", hlLinks: ["https://cliickto.me/elisaaesp"], hlVia: [] };
  assert.deepEqual(probeUrlsOf(elisa), ["https://cliickto.me/elisaaesp"]);
  const after = applyProbes(elisa, { "https://cliickto.me/elisaaesp": { label: "OnlyFans", strength: 3, hits: ["OnlyFans", "Telegram"] } }, 1000);
  assert.equal(after.sig, "forte", "Elisa: da nessun segnale a profilo a pagamento");
  assert.equal(probedOrClassified(after, "https://cliickto.me/elisaaesp").label, "OnlyFans dentro cliickto.me");
  assert.deepEqual(probeUrlsOf(after, { now: 1000 + 86400000 }), [], "non si riapre prima di 30 giorni");
  // una pagina che non dice niente non abbassa mai il livello e non crea un forte
  const deb = applyProbes({ h: "x", sig: "debole", url: "https://miosito.it" }, { "https://miosito.it": null }, 1);
  assert.equal(deb.sig, "debole");
  // una pagina che non si è aperta si riprova dopo 7 giorni, non 30
  const blk = applyProbes({ h: "w", sig: "nessuno", url: "https://linktr.ee/w" }, { "https://linktr.ee/w": { err: true } }, 0);
  assert.equal(blk.sig, "nessuno");
  assert.deepEqual(probeUrlsOf(blk, { now: 6 * 86400000 }), []);
  assert.deepEqual(probeUrlsOf(blk, { now: 8 * 86400000 }), ["https://linktr.ee/w"]);
  // link già parlanti o generici non si aprono; i forti non sono candidati
  assert.deepEqual(probeUrlsOf({ h: "y", url: "https://onlyfans.com/y", hlLinks: ["https://open.spotify.com/a"] }), []);
  assert.equal(probeCandidates([{ h: "z", sig: "forte", url: "https://miosito.it" }]).length, 0);
  assert.equal(probeCandidates([{ h: "a", fol: 10, url: "https://a.it" }, { h: "b", fol: 99, url: "https://b.it" }])[0].h, "b", "prima i più seguiti");
  // notorietà: famosa + OnlyFans sui giornali pesa e si dice in parole
  const [c] = buildCreators([{ ...after, press: { n: 7, of: true, top: [{ title: "La prof del corsivo su OnlyFans", url: "https://www.fanpage.it/x", site: "fanpage.it" }], at: 5 } }], { creators: {} });
  assert.equal(c.press.n, 7);
  ok(whyLines(c).some((w) => w.includes("Famosa fuori da OnlyFans")), "il perché cita i giornali");
  const [plain] = buildCreators([{ ...after }], { creators: {} });
  ok(attentionScore(c) > attentionScore(plain) + 4, "la notorietà sposta la creator in alto");
  console.log("test Elisa (pagine aperte + giornali): ok");
}

// --- scritture sovrapposte (17/10/2026): si salva la differenza, non la lista intera
{
  const { diffProfiles, applyProfileDiff } = await import("../src/lib/scouting-core.js");
  const before = [{ h: "a", sig: "nessuno" }, { h: "b", fol: 1 }];
  const mine = [{ h: "a", sig: "forte" }, { h: "b", fol: 1 }, { h: "nuova", fol: 5 }]; // la segnalazione
  const meanwhile = [{ h: "a", sig: "nessuno", press: { n: 3 } }, { h: "b", fol: 2 }, { h: "x", fol: 9 }]; // scritto da altri nel frattempo
  const out = applyProfileDiff(meanwhile, diffProfiles(before, mine));
  assert.deepEqual(out.find((p) => p.h === "a"), { h: "a", sig: "forte", press: { n: 3 } }, "si tengono entrambe le modifiche");
  assert.equal(out.find((p) => p.h === "b").fol, 2, "un campo non toccato da me resta quello nuovo");
  ok(out.some((p) => p.h === "x") && out.some((p) => p.h === "nuova"), "nessun profilo perso, l'aggiunto c'è");
  const del = applyProfileDiff(meanwhile, diffProfiles(before, [{ h: "b", fol: 1 }]));
  ok(!del.some((p) => p.h === "a"), "una cancellazione resta cancellazione");
  const unset = applyProfileDiff([{ h: "a", sig: "x", tmp: 1 }], diffProfiles([{ h: "a", sig: "x", tmp: 1 }], [{ h: "a", sig: "x" }]));
  ok(!("tmp" in unset[0]), "un campo tolto si toglie");
  console.log("scritture sovrapposte: ok");
}
