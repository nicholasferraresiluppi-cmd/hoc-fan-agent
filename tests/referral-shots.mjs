// Test del flusso server degli screen delle storie (08/11/2026): KV, Blob e AI finti.
// Esegui: node tests/referral-shots.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const FAKE_KV = pathToFileURL(path.resolve(process.cwd(), "tests/fakes/kv.mjs")).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "@vercel/kv") return { url: FAKE_KV, shortCircuit: true };
    if (spec === "@/lib/referral-shot-ai") return { url: "data:text/javascript,export async function readStoryInsights(){return globalThis.__ai()}", shortCircuit: true };
    if (spec.startsWith("@/")) { const p = path.join(SRC, spec.slice(2)); return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, ctx); }
    if (spec.startsWith(".") && !/\.(m?js|json)$/.test(spec)) { try { return next(`${spec}.js`, ctx); } catch {} }
    return next(spec, ctx);
  },
});
const blobs = new Map();
globalThis.__referralFakeBlob = {
  async put(p, bytes, o) { assert.equal(o.access, "private", "gli screen sono privati"); blobs.set(p, { bytes, type: o.contentType }); return { pathname: p }; },
  async del(p) { blobs.delete(p); },
  async get(p) { const b = blobs.get(p); return b ? { statusCode: 200, blob: { size: b.bytes.length }, stream: new Blob([b.bytes]).stream() } : null; },
};
globalThis.__ai = async () => ({ ok: true, views: 1240, accountsReached: 1183, replies: 9, linkClicks: 14, profileVisits: 21, note: null });

const R = await import(pathToFileURL(path.join(SRC, "lib/referral.js")).href);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const rejects = async (p, re, m) => { await assert.rejects(p, re, m); n++; };
const hr = { id: "u_hr", name: "Claudia" };
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");

const giulia = await R.saveReferrer({ input: { name: "Giulia Bianchi", email: "g@x.it", instagram: "@Giulia.B" }, actor: hr });
const marco = await R.saveReferrer({ input: { name: "Marco Rossi" }, actor: hr });
eq(giulia.instagram, "giulia.b", "profilo normalizzato al salvataggio");

// storie senza ok: il referente non carica
const st0 = await R.saveStory({ input: { referrerId: giulia.id, sentAt: "2026-11-04" }, actor: hr });
await rejects(R.attachShot({ storyId: st0.id, n: 1, kind: "pub", data: jpg, contentType: "image/jpeg", by: { type: "referente", name: "Giulia" }, referrerId: giulia.id }), /ok dell'Area Partner/);

const st = await R.saveStory({ id: st0.id, input: { referrerId: giulia.id, sentAt: "2026-11-04", agreedAt: "2026-11-05", items: [{ n: 1, proposal: "2" }, { n: 2 }] }, actor: hr });
// un altro referente non tocca queste storie
await rejects(R.attachShot({ storyId: st.id, n: 1, kind: "pub", data: jpg, contentType: "image/jpeg", by: { type: "referente", name: "Marco" }, referrerId: marco.id }), /non trovate/);
// formati e numeri di storia
await rejects(R.attachShot({ storyId: st.id, n: 3, kind: "pub", data: jpg, contentType: "image/jpeg", by: { type: "referente" }, referrerId: giulia.id }), /Storia non valida/);
await rejects(R.attachShot({ storyId: st.id, n: 1, kind: "pub", data: jpg, contentType: "application/pdf", by: { type: "referente" }, referrerId: giulia.id }), /foto/);
// screen 24 ore prima della storia: no
await rejects(R.attachShot({ storyId: st.id, n: 1, kind: "views", data: jpg, contentType: "image/jpeg", by: { type: "referente" }, referrerId: giulia.id }), /Prima carica lo screen/);

// il referente carica la storia 1: da controllare, non conta
const a1 = await R.attachShot({ storyId: st.id, n: 1, kind: "pub", data: jpg, contentType: "image/jpeg", by: { type: "referente", name: "Giulia" }, referrerId: giulia.id });
eq([a1.item.verified, Boolean(a1.item.pubShot), a1.item.proposal], [null, true, "2"], "da controllare, la proposta resta");
ok(/^\d{4}-\d{2}-\d{2}$/.test(a1.item.publishedAt), "data di pubblicazione = giorno del caricamento");
eq(a1.story.publishedAt, [], "non conta finché non è confermata");
let s1 = (await R.loadState()).stories.find((x) => x.id === st.id);
eq([s1.stage.key, s1.milestone.published, s1.milestone.toCheck], ["da_verificare", 0, 1]);

// screen dopo 24 ore: l'AI propone le visualizzazioni
const v1 = await R.attachShot({ storyId: st.id, n: 1, kind: "views", data: jpg, contentType: "image/jpeg", by: { type: "referente", name: "Giulia" }, referrerId: giulia.id });
eq([v1.item.views, v1.item.viewsBy, v1.item.ai.linkClicks], [1240, "ai", 14]);

// l'Area Partner conferma
const ver = await R.verifyStoryItem({ id: st.id, n: 1, ok: true, actor: hr });
eq(ver.publishedAt.length, 1, "confermata: ora conta");
// confermata: il referente non la sostituisce più
await rejects(R.attachShot({ storyId: st.id, n: 1, kind: "pub", data: jpg, contentType: "image/jpeg", by: { type: "referente" }, referrerId: giulia.id }), /già confermata/);

// la seconda la segna l'Area Partner a mano: conta subito, il premio matura
const pub1 = ver.items.find((i) => i.n === 1).publishedAt;
await R.saveStory({ id: st.id, input: { referrerId: giulia.id, sentAt: "2026-11-04", agreedAt: "2026-11-05", items: [{ n: 1, proposal: "2", publishedAt: pub1, views: "1240", verified: true }, { n: 2, publishedAt: pub1, verified: true }] }, actor: hr });
s1 = (await R.loadState()).stories.find((x) => x.id === st.id);
eq([s1.milestone.status, s1.milestone.published], ["maturato", 2], "due confermate: 50 € da pagare");
const it1 = s1.items.find((i) => i.n === 1);
eq([Boolean(it1.pubShot), Boolean(it1.viewsShot), it1.viewsBy, it1.ai?.views], [true, true, "ai", 1240], "il salvataggio dal modulo non perde screen e lettura AI");

// l'Area Partner corregge a mano le visualizzazioni: vince il suo numero, anche su un nuovo screen
await R.saveStory({ id: st.id, input: { referrerId: giulia.id, sentAt: "2026-11-04", agreedAt: "2026-11-05", items: [{ n: 1, proposal: "2", publishedAt: pub1, views: "1300", verified: true }, { n: 2, publishedAt: pub1, verified: true }] }, actor: hr });
const v2 = await R.attachShot({ storyId: st.id, n: 1, kind: "views", data: jpg, contentType: "image/jpeg", by: { type: "hr", name: "Claudia" } });
eq([v2.item.views, v2.item.viewsBy], [1300, "hr"]);
eq(blobs.size, 2, "lo screen sostituito si cancella (restano storia 1 e il nuovo 24 ore)");

// lettura dello screen: i byte tornano, con il referente proprietario
const shot = await R.readShot({ storyId: st.id, n: 1, kind: "pub" });
eq([shot.bytes.length, shot.referrerId], [8, giulia.id]);
eq(await R.readShot({ storyId: st.id, n: 2, kind: "pub" }), null, "nessuno screen: null");

// pagina del referente: righe senza percorsi dei file
const dash = await R.referrerDashboard(giulia);
const items = dash.stories[0].items;
eq(Object.keys(items[0]).sort(), ["hasPub", "hasViews", "n", "proposal", "publishedAt", "verified", "views"]);
ok(!JSON.stringify(dash).includes("referral-shots/"), "nessun percorso di file verso il referente");

// cambiando profilo Instagram il controllo di prima si azzera
await R.saveReferrer({ id: giulia.id, input: { name: "Giulia Bianchi", email: "g@x.it", instagram: "giulia.b" }, actor: hr });
const st2 = (await R.loadState()).referrers.find((x) => x.id === giulia.id);
eq(st2.instagram, "giulia.b");

console.log(`referral-shots: ${n} verifiche ok`);
