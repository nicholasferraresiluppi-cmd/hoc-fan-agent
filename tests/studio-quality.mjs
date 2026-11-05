// node tests/studio-quality.mjs — agente qualità dello Studio social.
import assert from "node:assert/strict";
import { frameTimes, runsOver, detectCuts, technicalVerdict, normalizeAgentAnswer, mergeAnswers, estimateQcCost, applyAgentToReviews, qcSchema, AI_CHECKS, HUMAN_ONLY_CHECKS, QC_MAX_FRAMES } from "../src/lib/studio-quality-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const goodTech = { width: 1080, height: 1920, duration: 18.4, audio: { present: true, peakDb: -3, rmsDb: -18 }, black: [], freeze: [] };

t("fotogrammi: frequenza, non numero fisso; più fitti con l'AI; prima/dopo i tagli; tetto", () => {
  const real = frameTimes(30);
  const ai = frameTimes(30, { ai: true });
  assert.ok(real.length >= 60 && real.length <= 65, `riprese vere ~ogni 0,5 s (${real.length})`);
  assert.ok(ai.length > real.length * 1.4, "con parti AI più fitti");
  assert.deepEqual(real.slice(0, 4), [0.1, 0.4, 0.7, 1.0]);
  assert.ok(real.every((x) => x < 30) && real.every((x, i) => i === 0 || x - real[i - 1] >= 0.08));
  const withCut = frameTimes(30, { cuts: [12.6] });
  assert.ok(withCut.includes(12.48) && withCut.includes(12.72), "prima e dopo il taglio");
  const long = frameTimes(90, { ai: true, cuts: [30, 60] });
  assert.equal(long.length, QC_MAX_FRAMES);
  assert.ok(long.includes(29.88) && long.includes(0.1), "oltre il tetto restano gancio e tagli");
  assert.deepEqual(frameTimes(0), []);
  assert.deepEqual(detectCuts([{ t: 1, diff: 5 }, { t: 3, diff: 40 }, { t: 3.25, diff: 35 }, { t: 8, diff: 30 }]), [3, 8]);
  // stima: un reel vero di 20 s con 4 riferimenti ~ mezzo dollaro o meno
  const est = estimateQcCost(frameTimes(20).length, 4);
  assert.ok(est > 0.2 && est < 0.7, `stima ${est}`);
});

t("unione delle parti: per voce vince la peggiore, note e secondi dei problemi", () => {
  const m = mergeAnswers([
    { voci: { anatomia: { esito: "ok", nota: "", secondi: [] }, testo: { esito: "dubbio", nota: "forse", secondi: [3] } }, sintesi: "Parte 1 ok" },
    { voci: { anatomia: { esito: "errore", nota: "sei dita", secondi: [14.2] }, testo: { esito: "ok", nota: "", secondi: [] } }, sintesi: "Mano a 0:14" },
  ], ["anatomia", "testo", "volto"]);
  assert.equal(m.voci.anatomia.esito, "errore"); assert.deepEqual(m.voci.anatomia.secondi, [14.2]); assert.equal(m.voci.anatomia.nota, "sei dita");
  assert.equal(m.voci.testo.esito, "dubbio");
  assert.equal(m.voci.volto.esito, "dubbio", "voce mai valutata = da guardare");
  assert.match(m.sintesi, /Mano/);
});

t("nero/fermi: solo tratti lunghi abbastanza; dissolvenza finale perdonata", () => {
  const s = (arr) => arr.map((on, i) => ({ t: i * 0.5, on }));
  assert.deepEqual(runsOver(s([0, 1, 1, 1, 0]), 1), [{ from: 0.5, to: 1.5 }]);
  assert.deepEqual(runsOver(s([0, 1, 1, 0]), 1), []);
  assert.deepEqual(runsOver(s([0, 0, 0, 1, 1]), 0.5, { endGrace: 0.6 }), []);
});

t("tecnico: ok, attenzione, blocca con i motivi in italiano", () => {
  assert.equal(technicalVerdict(goodTech).outcome, "ok");
  assert.equal(technicalVerdict({ ...goodTech, audio: { present: true, peakDb: 0, rmsDb: -18 } }).outcome, "attenzione");
  const bad = technicalVerdict({ ...goodTech, width: 1920, height: 1080, audio: { present: false }, freeze: [{ from: 3, to: 5 }] });
  assert.equal(bad.outcome, "blocca");
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems.join(), /verticale/);
  assert.equal(technicalVerdict(null).outcome, "blocca");
});

t("risposta AI ripulita: voce mancante = da guardare, mai ok; secondi fuori video scartati", () => {
  const a = normalizeAgentAnswer({ voci: { anatomia: { esito: "ok", nota: "", secondi: [] }, testo: { esito: "boh", secondi: [3, 99, "x"] } } }, ["anatomia", "testo", "volto"], 18);
  assert.equal(a.voci.anatomia.esito, "ok");
  assert.equal(a.voci.testo.esito, "dubbio");
  assert.deepEqual(a.voci.testo.secondi, [3]);
  assert.equal(a.voci.volto.esito, "dubbio");
  const sch = qcSchema(AI_CHECKS);
  assert.deepEqual(sch.properties.voci.required, AI_CHECKS);
});

t("esito sulle revisioni: tecnico misurato, qualità spuntata ma MAI le voci umane né l'esito", () => {
  const keys = ["volto", "anatomia", "coerenza", "montaggio", "testo", "audio", "aggancio"];
  const answer = { voci: { volto: { esito: "ok" }, anatomia: { esito: "ok" }, coerenza: { esito: "ok" }, montaggio: { esito: "dubbio" }, testo: { esito: "errore", secondi: [4] }, aggancio: { esito: "ok" } } };
  const { reviews, errors } = applyAgentToReviews({}, { tech: goodTech, answer }, keys, 1);
  assert.equal(reviews.tecnico.outcome, "ok");
  assert.deepEqual(reviews.qualita.checks.sort(), ["anatomia", "coerenza"]);
  assert.equal(reviews.qualita.outcome, undefined);
  assert.deepEqual(errors, ["testo"]);
  for (const k of HUMAN_ONLY_CHECKS) assert.ok(!reviews.qualita.checks.includes(k));
  // una persona aveva già dato ok e spuntato: un errore toglie l'ok, una voce umana resta se non c'è errore
  const prev = { qualita: { outcome: "ok", checks: ["volto", "montaggio", "testo"] } };
  const r2 = applyAgentToReviews(prev, { tech: goodTech, answer }, keys, 1).reviews;
  assert.equal(r2.qualita.outcome, undefined);
  assert.ok(r2.qualita.checks.includes("volto") && r2.qualita.checks.includes("montaggio") && !r2.qualita.checks.includes("testo"));
});

console.log(`studio-quality: ${n} gruppi di asserzioni ok`);

// ── Percorso intero: KV, spazio foto e AI finti (nessuna rete, nessuna spesa) ──
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  globalThis.__qcFakeKv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v, o = {}) { if (o?.nx && store.has(k)) return null; store.set(k, clone(v)); return "OK"; },
    async del(...ks) { for (const k of ks.flat()) store.delete(k); return 1; },
    async incrbyfloat(k, by) { const v = Number(store.get(k) || 0) + by; store.set(k, v); return v; },
    async hgetall() { return null; }, async smembers() { return []; },
  };
  const blobs = new Map();
  globalThis.__studioFakeBlob = {
    async put(p, buf, o) { blobs.set(p, { buf, type: o.contentType }); return {}; },
    async get(p) { const b = blobs.get(p); return b ? { statusCode: 200, stream: new Response(b.buf).body } : null; },
    async del(ps) { for (const p of [].concat(ps)) blobs.delete(p); },
  };
  let lastReq = null;
  globalThis.__studioFakeAnthropic = { messages: { create: async (req) => {
    lastReq = req;
    const voci = Object.fromEntries(req.output_config.format.schema.properties.voci.required.map((k) => [k, { esito: k === "testo" ? "errore" : "ok", nota: k === "testo" ? "Refuso «cafè»" : "", secondi: k === "testo" ? [2.5] : [] }]));
    return { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 30000, output_tokens: 1500 }, content: [{ type: "text", text: JSON.stringify({ voci, testo_letto: "0:02 MARCO, SONO LE 3", sintesi: "Controlla il refuso a 0:02." }) }] };
  } } };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__qcFakeKv;", shortCircuit: true };
      if (specifier === "@/lib/s4s") return { url: "data:text/javascript,export const getNames = async () => ({});", shortCircuit: true };
      if (specifier === "@/lib/creator-scope") return { url: "data:text/javascript,export const personOf = (a) => String(a || '');", shortCircuit: true };
      if (specifier.startsWith("@/")) {
        const p = path.join(SRC, specifier.slice(2));
        return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context);
      }
      return next(specifier, context);
    },
  });
  const Q = await import("../src/lib/studio-quality.js");
  const T = await import("../src/lib/studio-telegram.js");
  let m = 0;
  const ok = (c, msg) => { assert.ok(c, msg); m++; };
  const PID = "instagram-prova";
  store.set("studio:profiles", { [PID]: { id: PID, handle: "prova", creator: "Prova", identity: { personaggio: "Ragazza di Milano" } } });
  store.set(`studio:items:${PID}`, { it1: { id: "it1", title: "Beccato #1", status: "da_approvare", reviews: { conformita: { outcome: "ok" }, voce: { outcome: "ok" } }, script: "MARCO, SONO LE 3" } });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
  const ref = await T.addPhoto(PID, jpg, "image/jpeg", "u1");
  await T.saveTgConfig(PID, { referencePhotoIds: [ref.id, "inesistente"] }, "u1");
  ok((await T.getTgConfig(PID)).referencePhotoIds.length === 1, "solo foto vere come riferimento");

  const frame = (t) => ({ t, dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` });
  const times = Array.from({ length: 45 }, (_, i) => Math.round(i * 0.4 * 100) / 100);
  const frames = times.map(frame);
  const RUN = "abcdef123456";
  ok(!(await Q.addFrames(PID, "it1", "bad", frames)).ok, "giro non valido rifiutato");
  ok(!(await Q.addFrames(PID, "it1", RUN, [{ t: 1, dataUrl: "data:image/png;base64,AAAA" }])).ok, "fotogrammi non jpeg rifiutati");
  ok((await Q.addFrames(PID, "it1", RUN, frames.slice(0, 20))).count === 20, "primo pacchetto");
  ok((await Q.addFrames(PID, "it1", RUN, frames.slice(20))).count === 45, "secondo pacchetto");
  ok(!(await Q.runQualityCheck(PID, "it1", { runId: "000000000000", tech: goodTech }, "u1")).ok, "giro inesistente");

  const calls = [];
  const realCreate = globalThis.__studioFakeAnthropic.messages.create;
  globalThis.__studioFakeAnthropic.messages.create = async (req) => { calls.push(req); return realCreate(req); };
  const res = await Q.runQualityCheck(PID, "it1", { runId: RUN, tech: goodTech }, "u1");
  ok(res.ok, "controllo eseguito");
  ok(calls.length === 3, "45 fotogrammi = 3 chiamate da massimo 20");
  ok(calls.every((c) => c.messages[0].content.filter((x) => x.type === "image").length <= 21), "ogni chiamata: riferimento + al più 20 fotogrammi");
  ok(calls.filter((c) => c.output_config.format.schema.properties.voci.required.includes("aggancio")).length === 1, "il gancio si giudica solo nella prima parte");
  ok(res.item.reviews.tecnico.outcome === "ok" && !res.item.reviews.qualita.outcome, "tecnico scritto, qualità senza esito");
  ok(res.item.reviews.qualita.checks.includes("anatomia") && !res.item.reviews.qualita.checks.includes("volto") && !res.item.reviews.qualita.checks.includes("testo"), "spuntate solo le voci giuste");
  ok(res.errors.includes("testo") && res.item.aiReview.frames.length === 45 && res.item.aiReview.calls === 3, "errore segnalato, 45 fotogrammi");
  ok(Math.abs((await Q.qcSpend()).spent - 3 * (30000 * 4 + 1500 * 20) / 1e6) < 1e-9, "spesa contata su tutte le chiamate");
  const firstPaths = res.item.aiReview.frames.map((f) => f.path);
  ok(await Q.readQcFrame(PID, "it1", 0), "fotogramma leggibile per la tavola");

  // secondo giro: i fotogrammi vecchi spariscono
  const RUN2 = "abcdef654321";
  await Q.addFrames(PID, "it1", RUN2, frames.slice(0, 10));
  const res2 = await Q.runQualityCheck(PID, "it1", { runId: RUN2, tech: goodTech }, "u1");
  ok(res2.ok && firstPaths.every((p) => !blobs.has(p)), "fotogrammi del giro prima cancellati");

  // un contenuto già programmato non si ricontrolla; tetto di spesa
  const items = store.get(`studio:items:${PID}`); items.it1.status = "programmato"; store.set(`studio:items:${PID}`, items);
  ok((await Q.addFrames(PID, "it1", "aaaaaa111111", frames.slice(0, 5))).status === 409, "programmato: niente controllo");
  items.it1.status = "da_approvare"; store.set(`studio:items:${PID}`, items);
  await Q.addFrames(PID, "it1", "aaaaaa222222", frames.slice(0, 5));
  process.env.STUDIO_QC_CAP_USD = "0.2";
  ok((await Q.runQualityCheck(PID, "it1", { runId: "aaaaaa222222", tech: goodTech }, "u1")).status === 429, "tetto di spesa del mese");
  console.log(`studio-quality (percorso intero): ${m} verifiche ok`);
}
