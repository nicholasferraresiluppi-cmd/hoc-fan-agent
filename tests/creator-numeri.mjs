// Unit test — Scheda numeri della creator (funzioni pure). Esegui: node tests/creator-numeri.mjs
//
// Le decisioni facili da rompere per sbaglio:
//   - dal browser passano SOLO i campi noti (niente chiavi inventate, testi tagliati, scelte ammesse)
//   - per inviare bastano nome, un social, 18 anni e privacy: gli screenshot non sono obbligatori
//   - il link inviato o scaduto non accetta più scritture; il pathname del file lo decide il server
//   - ogni passo screenshot dichiara il periodo (uno screenshot senza periodo non si legge)
import assert from "node:assert/strict";
import {
  SHOT_STEPS, CONTENT_TYPES, sanitizeAnswers, missingForSubmit, linkState, stepDone, shotProgress, groupFiles,
  newUploadPathname, isUploadPathname, checkUploadRequest, sniffImage, MAX_FILES_PER_STEP, UPLOAD_MAX_BYTES, TEXT_FIELDS,
} from "../src/lib/creator-numeri-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("ogni passo ha periodo, titolo e capitolo", () => {
  for (const s of SHOT_STEPS) {
    assert.ok(s.period && s.title && s.chapter, s.id);
    assert.ok(Array.isArray(s.look) && s.look.length, s.id);
  }
  assert.equal(new Set(SHOT_STEPS.map((s) => s.id)).size, SHOT_STEPS.length);
});

t("i fan che spendono di più: due caricamenti separati, da sempre e 30 giorni", () => {
  const all = SHOT_STEPS.find((x) => x.id === "of_topfans");
  const last = SHOT_STEPS.find((x) => x.id === "of_topfans_30");
  assert.match(all.period, /sempre/i);
  assert.match(last.period, /30/);
  assert.ok(!all.optional && !last.optional, "nessuno dei due si salta senza segnarlo");
  assert.ok(SHOT_STEPS.indexOf(last) === SHOT_STEPS.indexOf(all) + 1, "uno dopo l'altro");
});

t("nuovi iscritti: 12 mesi e ultimi 30 giorni in due caricamenti separati", () => {
  const year = SHOT_STEPS.find((x) => x.id === "of_fans");
  const last = SHOT_STEPS.find((x) => x.id === "of_fans_30");
  assert.match(year.period, /12 mesi/);
  assert.match(last.period, /30/);
  assert.ok(!last.optional);
  assert.ok(SHOT_STEPS.indexOf(last) === SHOT_STEPS.indexOf(year) + 1, "uno dopo l'altro");
});

t("la reach della pagina è chiesta, nello stesso periodo dei fan", () => {
  const reach = SHOT_STEPS.find((x) => x.id === "of_reach");
  const fans = SHOT_STEPS.find((x) => x.id === "of_fans");
  assert.equal(reach.chapter, "pagina");
  assert.equal(reach.period, fans.period);
});

t("sanitize: solo campi noti, testo tagliato, scelte ammesse", () => {
  const out = sanitizeAnswers({
    stageName: "Giulia", hacker: "x", ig: "a".repeat(999), face: "Forse", platform: "OnlyFans",
    adult: "true", privacy: true, content: { nudo: "farei", lingerie: "boh", inventato: "si" },
    skip: { of_links: true, nonesiste: true }, earnBand: "Più di 25.000 $",
  });
  assert.equal(out.stageName, "Giulia");
  assert.equal(out.hacker, undefined);
  assert.equal(out.ig.length, TEXT_FIELDS.ig);
  assert.equal(out.face, undefined);
  assert.equal(out.platform, "OnlyFans");
  assert.equal(out.adult, undefined, "solo true booleano");
  assert.equal(out.privacy, true);
  assert.deepEqual(out.content, { nudo: "farei" });
  assert.deepEqual(out.skip, { of_links: true });
  assert.equal(out.earnBand, "Più di 25.000 $");
});

t("sanitize robusto a input assurdi", () => {
  assert.deepEqual(sanitizeAnswers(null), {});
  assert.deepEqual(sanitizeAnswers("ciao"), {});
  assert.deepEqual(sanitizeAnswers({ content: "x", skip: 3 }), {});
});

t("per inviare: nome, un social, 18 anni, privacy", () => {
  const base = { stageName: "Giulia", tiktok: "@g", adult: true, privacy: true };
  assert.deepEqual(missingForSubmit(base), []);
  assert.deepEqual(missingForSubmit({ ...base, stageName: "  " }).map((m) => m.key), ["stageName"]);
  assert.deepEqual(missingForSubmit({ ...base, tiktok: "" }).map((m) => m.key), ["ig"]);
  assert.deepEqual(missingForSubmit({ ...base, adult: undefined }).map((m) => m.key), ["adult"]);
  assert.equal(missingForSubmit({}).length, 4);
});

t("stato del link", () => {
  const now = 1_000_000;
  const tok = "a".repeat(32);
  assert.equal(linkState(null, now), "invalid");
  assert.equal(linkState({ token: "corto" }, now), "invalid");
  assert.equal(linkState({ token: tok, expiresAt: now + 1 }, now), "open");
  assert.equal(linkState({ token: tok, expiresAt: now - 1 }, now), "expired");
  assert.equal(linkState({ token: tok, expiresAt: now - 1, submittedAt: 5 }, now), "submitted");
});

t("avanzamento: file o «non ce l'ho»; senza pagina i passi OnlyFans non contano", () => {
  const files = groupFiles([{ step: "of_earnings", at: 2 }, { step: "of_earnings", at: 1 }, { step: "boh", at: 3 }]);
  assert.equal(files.of_earnings.length, 2);
  assert.equal(files.of_earnings[0].at, 1);
  assert.equal(files.boh, undefined);
  assert.ok(stepDone("of_earnings", files, {}));
  assert.ok(stepDone("of_links", files, { of_links: true }));
  assert.ok(!stepDone("of_fans", files, {}));
  const all = shotProgress(files, { of_links: true }, "OnlyFans");
  assert.equal(all.total, SHOT_STEPS.filter((s) => !s.optional).length);
  assert.equal(all.done, 2);
  const none = shotProgress(files, {}, "Non ho ancora una pagina");
  assert.equal(none.total, SHOT_STEPS.filter((s) => !s.optional && s.chapter !== "pagina").length);
});

t("pathname deciso dal server", () => {
  const hex = "0123456789abcdef0123456789abcdef";
  assert.equal(newUploadPathname(hex, "image/png"), `creator-numeri/${hex}.png`);
  assert.equal(newUploadPathname(hex, "application/pdf"), null);
  assert.equal(newUploadPathname("../x", "image/png"), null);
  assert.ok(isUploadPathname(`creator-numeri/${hex}.jpg`));
  assert.ok(!isUploadPathname(`hr-upload/${hex}.jpg`));
  assert.ok(!isUploadPathname(`creator-numeri/../${hex}.jpg`));
});

t("richiesta di caricamento", () => {
  assert.equal(checkUploadRequest({ step: "of_fans", contentType: "image/jpeg", size: 1000 }), null);
  assert.equal(checkUploadRequest({ step: "x", contentType: "image/jpeg", size: 1000 }).status, 400);
  assert.equal(checkUploadRequest({ step: "of_fans", contentType: "image/gif", size: 1000 }).status, 415);
  assert.equal(checkUploadRequest({ step: "of_fans", contentType: "image/png", size: UPLOAD_MAX_BYTES + 1 }).status, 413);
  assert.equal(checkUploadRequest({ step: "of_fans", contentType: "image/png", size: 0 }).status, 400);
  assert.equal(checkUploadRequest({ step: "of_fans", contentType: "image/png", size: 10 }, MAX_FILES_PER_STEP).status, 429);
});

t("tipo vero dai primi byte", () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).type, "image/jpeg");
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])).type, "image/png");
  assert.equal(sniffImage(Buffer.from("%PDF-1.4")), null);
  assert.equal(sniffImage(null), null);
});

t("contenuti: id unici", () => {
  assert.equal(new Set(CONTENT_TYPES.map((c) => c.id)).size, CONTENT_TYPES.length);
});

console.log(`creator-numeri: ${n} gruppi di test ok`);
