// Unit test — Richieste alla modella (funzioni pure). Esegui: node tests/richieste.mjs
//
// Le decisioni facili da rompere per sbaglio:
//   - lo stato della ripresa si CALCOLA da file e giudizi (mai un campo scritto a mano)
//   - al massimo MAX_REDO «da rifare» per ripresa; si giudica solo ciò che è arrivato dopo l'ultimo giudizio
//   - il browser non decide mai id, file di riferimento e note vocali; una ripresa con file non si toglie
//   - il pathname lo decide il server; il contenuto vero deve combaciare col tipo dichiarato
//   - la scadenza si legge in italiano e in ora italiana
import assert from "node:assert/strict";
import {
  shotState, requestState, reviewAllowed, canUpload, takeRemovable, isLate, linkState, expiresFor, deadlineText,
  sanitizeRequest, removedShotsWithTakes, newUploadPathname, isUploadPathname, kindOfPathname, checkUploadRequest,
  sniffMedia, sniffMatches, guessType, whatsappText, publicShots, slugify, MAX_REDO, MAX_SHOTS, MAX_TAKES_PER_SHOT,
  MAX_BYTES, LINK_GRACE_DAYS, DAY_MS,
} from "../src/lib/richieste-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const HEX = "a".repeat(32);
const take = (shotId, at, extra = {}) => ({ kind: "take", shotId, at, pathname: `richieste/take/${String(at).padStart(32, "0").slice(-32)}.mp4`, contentType: "video/mp4", size: 1000, ...extra });

t("ripresa senza file: da girare", () => {
  assert.equal(shotState([], []), "da_girare");
});
t("file senza giudizio: da guardare", () => {
  assert.equal(shotState([take("s1", 10)], []), "da_vedere");
});
t("approvata se l'ultimo giudizio è ok e non è arrivato altro", () => {
  assert.equal(shotState([take("s1", 10)], [{ verdict: "ok", at: 20 }]), "approvata");
});
t("da rifare se l'ultimo giudizio lo chiede e lei non ha ancora ricaricato", () => {
  assert.equal(shotState([take("s1", 10)], [{ verdict: "redo", at: 20 }]), "da_rifare");
});
t("dopo un «da rifare» il file nuovo torna da guardare", () => {
  assert.equal(shotState([take("s1", 10), take("s1", 30)], [{ verdict: "redo", at: 20 }]), "da_vedere");
});
t("l'ordine dei giudizi conta il tempo, non la posizione nell'array", () => {
  assert.equal(shotState([take("s1", 10)], [{ verdict: "ok", at: 50 }, { verdict: "redo", at: 20 }]), "approvata");
});

t("si giudica solo ciò che è da guardare", () => {
  assert.equal(reviewAllowed("da_girare", "ok").ok, false);
  assert.equal(reviewAllowed("approvata", "redo").ok, false);
  assert.equal(reviewAllowed("da_vedere", "ok").ok, true);
  assert.equal(reviewAllowed("da_vedere", "boh").ok, false);
});
t(`al massimo ${MAX_REDO} «da rifare» per ripresa, l'approvazione resta sempre possibile`, () => {
  const two = [{ verdict: "redo", at: 1 }, { verdict: "redo", at: 2 }];
  assert.equal(reviewAllowed("da_vedere", "redo", two.slice(0, 1)).ok, true);
  assert.equal(reviewAllowed("da_vedere", "redo", two).ok, false);
  assert.match(reviewAllowed("da_vedere", "redo", two).error, /2 volte/);
  assert.equal(reviewAllowed("da_vedere", "ok", two).ok, true);
});

t("caricamento: chiuso se approvata, tetto di file per ripresa", () => {
  assert.equal(canUpload("approvata", 0).ok, false);
  assert.equal(canUpload("da_rifare", 1).ok, true);
  assert.equal(canUpload("da_vedere", MAX_TAKES_PER_SHOT).ok, false);
});
t("un file si toglie solo finché nessuno l'ha giudicato", () => {
  assert.equal(takeRemovable({ at: 10 }, []), true);
  assert.equal(takeRemovable({ at: 10 }, [{ verdict: "redo", at: 20 }]), false);
  assert.equal(takeRemovable({ at: 30 }, [{ verdict: "redo", at: 20 }]), true);
});

const rec = (over = {}) => ({ token: HEX, shots: [{ id: "00000001" }, { id: "00000002" }], reviews: {}, ...over });
t("stato richiesta: pronta → mandata → aperta → in corso → consegnata → approvata", () => {
  assert.equal(requestState(rec(), []).state, "pronta");
  assert.equal(requestState(rec({ sentAt: 1 }), []).state, "inviata");
  assert.equal(requestState(rec({ sentAt: 1, openedAt: 2 }), []).state, "vista");
  assert.equal(requestState(rec({ openedAt: 2 }), [take("00000001", 5)]).state, "in_corso");
  const all = [take("00000001", 5), take("00000002", 6)];
  const r = requestState(rec(), all);
  assert.equal(r.state, "consegnata");
  assert.equal(r.delivered, 2);
  const ok = { "00000001": [{ verdict: "ok", at: 9 }], "00000002": [{ verdict: "ok", at: 9 }] };
  assert.equal(requestState(rec({ reviews: ok }), all).state, "approvata");
});
t("una ripresa da rifare fa «da rifare» tutta la richiesta", () => {
  const all = [take("00000001", 5), take("00000002", 6)];
  const r = requestState(rec({ reviews: { "00000001": [{ verdict: "redo", at: 9 }] } }), all);
  assert.equal(r.state, "da_rifare");
  assert.equal(r.counts.da_rifare, 1);
});
t("le riprese di un'altra ripresa non contano", () => {
  const r = requestState(rec(), [take("ffffffff", 5)]);
  assert.equal(r.state, "pronta");
  assert.equal(r.delivered, 0);
});
t("in ritardo: scadenza passata e non tutto caricato", () => {
  assert.equal(isLate({ deadline: 100 }, "in_corso", 200), true);
  assert.equal(isLate({ deadline: 100 }, "consegnata", 200), false);
  assert.equal(isLate({ deadline: 300 }, "in_corso", 200), false);
});
t("link: aperto fino a 21 giorni dopo la scadenza", () => {
  assert.equal(expiresFor(1000), 1000 + LINK_GRACE_DAYS * DAY_MS);
  assert.equal(linkState({ token: HEX, expiresAt: 500 }, 400), "open");
  assert.equal(linkState({ token: HEX, expiresAt: 500 }, 600), "expired");
  assert.equal(linkState({ token: "x", expiresAt: 500 }, 400), "invalid");
  assert.equal(linkState(null), "invalid");
});

// 26/11/2026 è un giovedì; ora italiana = UTC+1 in inverno
const NOW = Date.parse("2026-11-26T09:00:00Z");
t("scadenza: oggi, domani, giorno lungo con i giorni che mancano, in ora italiana", () => {
  assert.equal(deadlineText(Date.parse("2026-11-26T17:00:00Z"), NOW).text, "entro oggi alle 18:00");
  assert.equal(deadlineText(Date.parse("2026-11-27T17:00:00Z"), NOW).text, "entro domani alle 18:00");
  const fri = deadlineText(Date.parse("2026-11-28T17:00:00Z"), NOW);
  assert.equal(fri.text, "entro sabato 28 novembre alle 18:00");
  assert.equal(fri.left, "mancano 2 giorni");
  // le 23:30 italiane sono già il giorno dopo in UTC: conta il giorno italiano
  assert.equal(deadlineText(Date.parse("2026-11-26T22:30:00Z"), NOW).text, "entro oggi alle 23:30");
});
t("scadenza passata: ore se è di oggi, giorni se prima", () => {
  assert.equal(deadlineText(Date.parse("2026-11-26T06:00:00Z"), NOW).text, "scaduta da 3 ore");
  assert.equal(deadlineText(Date.parse("2026-11-24T17:00:00Z"), NOW).text, "scaduta da 2 giorni");
  assert.equal(deadlineText(Date.parse("2026-11-26T08:30:00Z"), NOW).text, "scaduta da poco");
  assert.equal(deadlineText(0, NOW).text, "senza scadenza");
});

let seq = 0;
const newId = () => (++seq).toString(16).padStart(8, "0");
const base = { creator: { name: "Giulia Amici" }, title: "Reel settimana 48", deadline: NOW + 2 * DAY_MS, shots: [{ title: "Aggancio" }] };
t("sanitize: campi obbligatori e messaggi in italiano", () => {
  const { errors } = sanitizeRequest({}, { newId, now: NOW });
  assert.ok(errors.some((e) => /creator/.test(e)));
  assert.ok(errors.some((e) => /titolo/.test(e)));
  assert.ok(errors.some((e) => /scadenza/.test(e)));
  assert.ok(errors.some((e) => /almeno una ripresa/.test(e)));
});
t("sanitize: richiesta valida, slug dal nome, testi tagliati, id nuovi", () => {
  const { data, errors } = sanitizeRequest({ ...base, hacker: 1, shots: [{ title: "x".repeat(500), refLink: "https://instagram.com/reel/abc", id: "deadbeef" }] }, { newId, now: NOW });
  assert.deepEqual(errors, []);
  assert.equal(data.creator.slug, "giulia-amici");
  assert.equal(data.hacker, undefined);
  assert.equal(data.shots[0].title.length, 90);
  assert.notEqual(data.shots[0].id, "deadbeef", "un id inventato dal browser non passa");
  assert.equal(data.shots[0].refLink, "https://instagram.com/reel/abc");
});
t("sanitize: link di riferimento non web rifiutato", () => {
  const { errors } = sanitizeRequest({ ...base, shots: [{ title: "a", refLink: "javascript:alert(1)" }] }, { newId, now: NOW });
  assert.ok(errors.some((e) => /indirizzo web/.test(e)));
});
t("sanitize: scadenza passata rifiutata alla creazione, ammessa nelle modifiche", () => {
  const past = { ...base, deadline: NOW - DAY_MS };
  assert.ok(sanitizeRequest(past, { newId, now: NOW }).errors.some((e) => /passata/.test(e)));
  const existing = { shots: [] };
  assert.deepEqual(sanitizeRequest(past, { newId, now: NOW, existing }).errors, []);
});
t(`sanitize: al massimo ${MAX_SHOTS} riprese`, () => {
  const many = Array.from({ length: MAX_SHOTS + 3 }, (_, i) => ({ title: `r${i}` }));
  const { data, errors } = sanitizeRequest({ ...base, shots: many }, { newId, now: NOW });
  assert.equal(data.shots.length, MAX_SHOTS);
  assert.ok(errors.length);
});
t("sanitize: id, riferimento e nota vocale restano quelli salvati", () => {
  const existing = { shots: [{ id: "0000abcd", title: "a", ref: { pathname: "richieste/ref/x.mp4" }, voice: { pathname: "richieste/voce/y.m4a" } }] };
  const { data } = sanitizeRequest({ ...base, shots: [{ id: "0000abcd", title: "b", ref: { pathname: "richieste/ref/HACK.mp4" } }] }, { newId, now: NOW, existing });
  assert.equal(data.shots[0].id, "0000abcd");
  assert.equal(data.shots[0].title, "b");
  assert.equal(data.shots[0].ref.pathname, "richieste/ref/x.mp4");
  assert.equal(data.shots[0].voice.pathname, "richieste/voce/y.m4a");
});
t("sanitize: lo stesso id due volte diventa due riprese distinte", () => {
  const existing = { shots: [{ id: "0000abcd", title: "a" }] };
  const { data } = sanitizeRequest({ ...base, shots: [{ id: "0000abcd", title: "a" }, { id: "0000abcd", title: "b" }] }, { newId, now: NOW, existing });
  assert.notEqual(data.shots[0].id, data.shots[1].id);
});
t("una ripresa con file della modella non si può togliere", () => {
  const existing = { shots: [{ id: "00000001" }, { id: "00000002" }] };
  const out = removedShotsWithTakes(existing, [{ id: "00000002" }], [take("00000001", 5)]);
  assert.deepEqual(out.map((s) => s.id), ["00000001"]);
  assert.deepEqual(removedShotsWithTakes(existing, [{ id: "00000002" }], []), []);
});

t("pathname: lo decide il server, per tipo e uso", () => {
  const p = newUploadPathname(HEX, "take", "video/quicktime");
  assert.equal(p, `richieste/take/${HEX}.mov`);
  assert.equal(isUploadPathname(p), true);
  assert.equal(kindOfPathname(p), "take");
  assert.equal(newUploadPathname(HEX, "take", "audio/mp4"), null, "un audio non è una ripresa");
  assert.equal(newUploadPathname("corto", "take", "video/mp4"), null);
  assert.equal(isUploadPathname("richieste/take/../../x.mp4"), false);
  assert.equal(isUploadPathname(`creator-numeri/${HEX}.jpg`), false);
});
t("controlli di caricamento: tipi per uso e tetti di peso", () => {
  assert.equal(checkUploadRequest({ kind: "take", contentType: "video/mp4", size: 10 }), null);
  assert.equal(checkUploadRequest({ kind: "take", contentType: "application/pdf", size: 10 }).status, 415);
  assert.equal(checkUploadRequest({ kind: "voce", contentType: "audio/webm", size: MAX_BYTES.voce + 1 }).status, 413);
  assert.equal(checkUploadRequest({ kind: "take", contentType: "video/mp4", size: 0 }).status, 400);
  assert.equal(checkUploadRequest({ kind: "altro", contentType: "video/mp4", size: 1 }).status, 400);
});
t("tipo del file dal nome quando il telefono non lo dice", () => {
  assert.equal(guessType("IMG_0001.MOV", ""), "video/quicktime");
  assert.equal(guessType("a.mp4", "video/mp4; codecs=avc1"), "video/mp4");
  assert.equal(guessType("x.exe", ""), "");
});

const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
t("contenuto vero: video, foto, audio riconosciuti dai primi byte", () => {
  assert.equal(sniffMedia(bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 0, 0])), "video");
  assert.equal(sniffMedia(bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 0, 0])), "video");
  assert.equal(sniffMedia(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0])), "photo");
  assert.equal(sniffMedia(bytes([0, 0, 0, 0x18], "ftypM4A ", [0, 0, 0, 0])), "audio");
  assert.equal(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF\0\0\0\0\0")), "photo");
  assert.equal(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3], "\0\0\0\0\0\0\0\0")), "webm");
  assert.equal(sniffMedia(bytes("%PDF-1.7 abcdef")), null);
  assert.equal(sniffMedia(bytes("ab")), null);
});
t("il contenuto deve combaciare col tipo dichiarato", () => {
  assert.equal(sniffMatches("video", "video/quicktime"), true);
  assert.equal(sniffMatches("photo", "video/mp4"), false, "una foto travestita da video no");
  assert.equal(sniffMatches("webm", "audio/webm"), true);
  assert.equal(sniffMatches("webm", "video/mp4"), false);
  assert.equal(sniffMatches(null, "video/mp4"), false);
  // trovato provando dal vivo (26/11): la nota vocale registrata dal browser è un MP4 generico
  assert.equal(sniffMatches("video", "audio/mp4"), true);
  assert.equal(sniffMatches("audio", "video/mp4"), false);
});

t("messaggio WhatsApp: nome, numero di riprese, scadenza e link", () => {
  const txt = whatsappText({ creator: { name: "Giulia Amici" }, title: "Reel 48", deadline: Date.parse("2026-11-27T17:00:00Z"), shots: [{}, {}, {}] }, "https://x/richiesta/abc", NOW);
  assert.match(txt, /^Ciao Giulia!/);
  assert.match(txt, /3 riprese/);
  assert.match(txt, /entro domani alle 18:00/);
  assert.match(txt, /https:\/\/x\/richiesta\/abc$/);
  assert.doesNotMatch(txt, /responsabile|board|soci/i);
});
t("vista della modella: niente dati interni, nota di rifacimento solo quando serve", () => {
  const r = { token: HEX, createdBy: "user_123", shots: [{ id: "00000001", title: "A", what: "w", ref: { pathname: "richieste/ref/a.mp4", contentType: "video/mp4" } }], reviews: { "00000001": [{ verdict: "redo", note: "più luce", at: 20, by: "user_123" }] } };
  const [s] = publicShots(r, [take("00000001", 10)]);
  assert.equal(s.state, "da_rifare");
  assert.equal(s.redoNote, "più luce");
  assert.equal(s.ref.family, "video");
  assert.equal(s.takes[0].removable, false);
  assert.equal(JSON.stringify(s).includes("user_123"), false);
  const [s2] = publicShots({ ...r, reviews: {} }, []);
  assert.equal(s2.redoNote, "");
  assert.equal(s2.upload.ok, true);
});
t("slug senza accenti", () => {
  assert.equal(slugify("Élisa Espòsito"), "elisa-esposito");
});

console.log(`richieste: ${n} test ok`);
