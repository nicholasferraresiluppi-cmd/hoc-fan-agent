// Unit test — Radar creator: OnlyFans cercato su Google (funzioni pure). Esegui: node tests/scouting-webcheck.mjs
//
// Casi veri del 5/11/2026 (risultati Google ridotti a url/titolo/descrizione):
//   - trovata: la pagina cita il suo Instagram, o ha il suo stesso nome/indirizzo
//   - scartata: un nome di battesimo ("Amelia", "Paola") non basta mai
//   - il livello del radar sale ma non scende; una ricerca fallita non è "niente trovato"
import assert from "node:assert/strict";
import {
  webTokens, webStem, webQuery, webUserOf, matchWebResults, applyWebCheck, webCheckCandidates, parseGoogleItems,
  buildCreators, whyLines, linkWhere, DEFAULT_STAGE,
} from "../src/lib/scouting-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const r = (url, title, description = "") => ({ url, title, description });

// ---------- la ricerca ----------
eq(webTokens("carla.fitness_official"), ["carla", "fitness"], "le parole di rumore (official) fuori dalla ricerca");
eq(webQuery("soryu_geggy_cosplay"), "site:onlyfans.com soryu geggy cosplay", "ricerca a parole, non l'handle intero (con gli _ Google non trova)");
eq(webQuery("__.sara90.__"), "site:onlyfans.com sara90", "punti e trattini ai bordi tolti");
eq(webStem("biancaneveeeh"), webStem("biancanevehh"), "lettere ripetute non contano");
eq(webUserOf("https://onlyfans.com/2727886873/irenemarinaroo"), "irenemarinaroo", "pagina di un post → l'utente");
eq(webUserOf("https://onlyfans.com/Sara_YourDream"), "sara_yourdream", "utente in minuscolo");
eq(webUserOf("https://onlyfans.com/legal"), null, "pagine di servizio non sono profili");
eq(webUserOf("https://fapello.com/eugenia-bellomia/"), null, "siti di contenuti rubati mai");
eq(webUserOf("https://onlyfans.com/@francesca-tocca/media"), null, "pagine generate per un nome (/@…) non sono profili");
console.log("ricerca: ok");

// ---------- trovate ----------
let m = matchWebResults("soryu_geggy_cosplay", [
  r("https://onlyfans.com/soryugeggy", "Soryu_geggy_cosplay", "You can find all the contents on my profile. Subscription. Subscribe $15 per month. Subscription bundles."),
]);
eq([m.url, m.how, m.strength, m.price], ["https://onlyfans.com/soryugeggy", "titolo", 3, 15], "il caso che l'ha fatto nascere: titolo = handle, prezzo letto");

m = matchWebResults("__.sara90.__", [r("https://onlyfans.com/lasexyprof", "Sara", "Catania❤️ . https://www.instagram.com/__.sara90.__?igsh=cmNldG9w. More info. Subscription. Subscribe $10 per month.")]);
eq([m.user, m.how, m.price], ["lasexyprof", "ig", 10], "indirizzo diverso ma la pagina porta al suo Instagram");

m = matchWebResults("ylenia_debellis", [r("https://onlyfans.com/ylenia_only", "Ylenia_only", "Italia. https://instagram.com/ylenia_debellis?igshid=5lds22nqbs15.")]);
eq(m.how, "ig", "instagram.com/<handle> nella descrizione");

m = matchWebResults("carla.fitness_official", [
  r("https://onlyfans.com/pagespromotion", "Pages Promotion (FREE 6.5K)", "LEI È @CARLA.FITNESS.FREE E SE TI ABBONI…"),
  r("https://onlyfans.com/carla.fitness", "carla.fitpeach", "Hey, io sono carla"),
  r("https://onlyfans.com/carlaxxxpower", "Carla", ""),
]);
eq([m.user, m.how, m.strength], ["carla.fitness", "utente", 3], "indirizzo = handle senza 'official'; le pagine promo non contano");

m = matchWebResults("michela.masetti", [r("https://onlyfans.com/michela.masetti", "Michela Masetti", "Subscribe $19.90 per month.")]);
eq([m.how, m.strength, m.price], ["utente", 3, 19.9], "indirizzo e titolo col suo nome: certo");

m = matchWebResults("francescapropato", [r("https://onlyfans.com/u404821100", "Francesca Propato", "Benvenuto nel mio mondo segreto…")]);
eq([m.url, m.how], ["https://onlyfans.com/u404821100", "titolo"], "indirizzo a numeri, titolo col suo nome");

m = matchWebResults("sara_your_dream", [r("https://onlyfans.com/Sara_YourDream", "Sara", "Sara. @sara_yourdream. ✨ Your favorite temptation")]);
eq([m.user, m.how], ["sara_yourdream", "utente"], "stesso nome, separatori diversi");

m = matchWebResults("biancanevehh", [r("https://onlyfans.com/biancaneveeeh", "biancaneveeh", "italy. https://instagram.com/biancanevehh?igshid=YmMyMTA2M2Y=")]);
eq(m.how, "ig", "la prova più forte vince anche se l'indirizzo è simile");

m = matchWebResults("minuminula", [r("https://onlyfans.com/2830000000/chiaramente_ginger.free", "Post — OnlyFans", "Abbonati anche a @minuminula ❤️")]);
eq([m.how, m.strength, m.url, m.price], ["citata", 1, "https://onlyfans.com/2830000000/chiaramente_ginger.free", null], "primo giro: nominata nel post di un'altra → indizio, link al post");
m = matchWebResults("minuminula", [r("https://onlyfans.com/2830000001/minuminula", "Post — OnlyFans", "@minuminula · Sep 7")]);
eq(m.how, "ig", "un suo post vale come la sua pagina");
m = matchWebResults("minuminula", [r("https://onlyfans.com/2830000000/altra", "Post —", "@minuminula"), r("https://onlyfans.com/minuminula", "Minu", "")]);
eq([m.how, m.url], ["utente", "https://onlyfans.com/minuminula"], "la sua pagina vince sulla citazione");
m = matchWebResults("serenamotore", [r("https://onlyfans.com/laserenamotore", "Serena", "")]);
eq([m.how, m.strength], ["simile", 1], "indirizzo che contiene il suo nome: da guardare, non certo");
// giro completo 5/11: handle di una parola sola, titolo uguale su una pagina di un'altra → indizio
eq(matchWebResults("sssinister_", [r("https://onlyfans.com/sinisterdollz", "Sinister", "")])?.how, "simile", "una parola sola nel titolo non è una prova");
eq(matchWebResults("mysteria.ita", [r("https://onlyfans.com/u94299833", "Mysteria", "")])?.how, "titolo", "…ma con l'indirizzo a numeri sì");
eq(matchWebResults("michelle002841", [r("https://onlyfans.com/godessmichelle", "Michelle", "")]), null, "Michelle = nome di battesimo");
eq(matchWebResults("claariissa_", [r("https://onlyfans.com/clarissa.x", "Clarissa", "")]), null, "Clarissa = nome di battesimo");
eq(matchWebResults("giuliascarozza_", [r("https://onlyfans.com/giuliascarozzavip", "Giulia Scarozza Vip", "")])?.how, "titolo", "handle attaccato ma nome e cognome nel titolo: prova");
eq(matchWebResults("principessa.23", [r("https://onlyfans.com/principessaj", "Principessa", "")])?.how, "simile", "il numero nell'handle non è una seconda parola");
eq(matchWebResults("martina.rinaldii", [r("https://onlyfans.com/martinarin05", "Martina rinaldi", "")])?.how, "titolo", "nome e cognome nel titolo, indirizzo vicino");
console.log("trovate: ok");

// ---------- scartate ----------
eq(matchWebResults("_amelia_81", [r("https://onlyfans.com/ameliiia", "Amelia", ""), r("https://onlyfans.com/amyrose667", "Amelia Rose", "Amelia Rose. @amyrose667.")]), null, "un nome di battesimo non basta (caso vero)");
eq(matchWebResults("paola.codicerosso", [r("https://onlyfans.com/paola.only", "Paola ❤️", "Sono Paola")]), null, "stesso nome, persona diversa");
eq(matchWebResults("p_alessia7", [r("https://onlyfans.com/alessiaaa18", "Alessia OnlyFans", "")]), null, "handle corto: niente");
eq(matchWebResults("marinaroprivate", [r("https://onlyfans.com/noemyferretti", "Irene Marinaro", "Sono Irene")]), null, "titolo che contiene solo un pezzo non basta");
m = matchWebResults("giuliadelellis103", [r("https://onlyfans.com/hotgiulia_free", "Giulia De Lellis", "")]);
eq([m?.how, m?.strength], ["simile", 1], "il nome di una famosa su un indirizzo di un'altra: da guardare, mai certo (pagine false)");
eq(matchWebResults("giulia", [r("https://onlyfans.com/giulia", "Giulia", "")]), null, "handle di un nome solo: mai certo");
eq(matchWebResults("rosalba", [r("https://onlyfans.com/ross94alba", "Rosalba", "Hola mis amores, soy yo, Ross")]), null, "primo giro: @rosalba ≠ una Rosalba spagnola");
eq(matchWebResults("vittoria", [r("https://onlyfans.com/vittoriamonti", "Vittoria", "")]), null, "primo giro: @vittoria ≠ vittoriamonti");
eq(matchWebResults("rosalba", [r("https://onlyfans.com/x123", "Ro", "https://instagram.com/rosalba")])?.how, "ig", "anche col nome solo, la pagina che porta al suo Instagram vale");
eq(matchWebResults("francescatocca", [r("https://onlyfans.com/@francesca-tocca/media", "https://onlyfans.com/@francesca-tocca/media", "Nessuna informazione disponibile per questa pagina.")]), null, "primo giro: pagina /@… senza profilo dietro");
eq(matchWebResults("soryu_geggy_cosplay", []), null, "niente risultati → niente");
eq(matchWebResults("anna.rossi", [r("https://onlyfans.com/x", "Post — OnlyFans", "@anna.rossi.free ti aspetta")]), null, "@handle seguito da altro non è lei");
console.log("scartate: ok");

// ---------- sul profilo ----------
const base = { h: "soryu_geggy_cosplay", fol: 731043, sig: "nessuno", url: "", hlLinks: [], hlVia: [], firstSeen: 1 };
const found = matchWebResults("soryu_geggy_cosplay", [r("https://onlyfans.com/soryugeggy", "Soryu_geggy_cosplay", "Subscribe $15 per month.")]);
let p = applyWebCheck(base, found, { q: "site:onlyfans.com soryu geggy cosplay", now: 1000 });
eq([p.sig, p.web.url, p.web.at, p.web.q], ["forte", "https://onlyfans.com/soryugeggy", 1000, "site:onlyfans.com soryu geggy cosplay"], "trovata → forte, con la prova salvata");
p = applyWebCheck({ ...base, sig: "forte" }, null, { q: "x", now: 2000 });
eq([p.sig, p.web], ["forte", { q: "x", at: 2000 }], "niente trovato non toglie un forte deciso prima");
p = applyWebCheck(base, { url: "https://onlyfans.com/laserenamotore", user: "laserenamotore", strength: 1, how: "simile" }, { q: "x" });
eq(p.sig, "debole", "simile → da guardare");

const [c] = buildCreators([applyWebCheck(base, found, { q: "q" })], { creators: {} });
eq([c.sig, c.link.where, c.link.url], ["forte", "web", "https://onlyfans.com/soryugeggy"], "la scheda mostra il link trovato su Google");
ok(whyLines(c).some((w) => w.includes("cercando su Google") && w.includes("stesso nome")), "il perché dice come è stata trovata");
eq(linkWhere(c.link, { short: true }), "da Google", "etichetta corta");
const withBio = buildCreators([{ ...applyWebCheck(base, found, { q: "q" }), url: "https://t.me/+abcdefgh" }], { creators: {} })[0];
eq(withBio.link.where, "bio", "a parità di forza vince il link che ha messo lei");
console.log("profilo: ok");

// ---------- chi cercare ----------
const now = 200 * 86400000;
const P = [
  { h: "grande_creator", fol: 500000, sig: "nessuno" },
  { h: "piccola_creator", fol: 3000, sig: "debole" },
  { h: "gia_forte", fol: 900000, sig: "forte" },
  { h: "nostra_creator", fol: 800000, sig: "nessuno", ours: true },
  { h: "cercata_ieri", fol: 700000, sig: "nessuno", web: { at: now - 86400000 } },
  { h: "cercata_mesi_fa", fol: 600000, sig: "nessuno", web: { at: now - 100 * 86400000 } },
  { h: "sparita_creator", fol: 400000, sig: "nessuno", missing: true },
  { h: "ab", fol: 999999, sig: "nessuno" },
  { h: "valutata_creator", fol: 650000, sig: "nessuno" },
].map((x) => ({ url: "", hlLinks: [], hlVia: [], ...x }));
const crm = { creators: { v: { handles: ["valutata_creator"], stage: "contattata" } } };
eq(webCheckCandidates(P, crm, new Set(["piccola_creator"]), { now }), ["cercata_mesi_fa", "grande_creator"], "solo da valutare, non nostre, non forti, non cercate da poco, nome cercabile; prima le più seguite");
ok(DEFAULT_STAGE === "da_valutare", "fase di partenza");
console.log("candidati: ok");

// ---------- righe dell'attore ----------
const parsed = parseGoogleItems([
  { searchQuery: { term: "site:onlyfans.com a" }, organicResults: [{ url: "https://onlyfans.com/a", title: "A", description: "d", position: 1 }] },
  { searchQuery: { term: "site:onlyfans.com b" }, "#error": true, organicResults: [] },
  { searchQuery: { term: "site:onlyfans.com c" }, organicResults: [] },
]);
eq([...parsed.keys()], ["site:onlyfans.com a", "site:onlyfans.com c"], "una ricerca fallita resta fuori (si riprova), una vuota è 'niente trovato'");
eq(parsed.get("site:onlyfans.com a"), [{ url: "https://onlyfans.com/a", title: "A", description: "d" }], "solo i campi che servono");
console.log("righe: ok");

console.log(`\n${n} asserzioni ok`);
