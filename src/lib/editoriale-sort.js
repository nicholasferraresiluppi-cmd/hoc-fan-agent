// Editoriale — smistamento del drive con l'AI (29/10/2026). Logica pura in editoriale-sort-core.js.
//
// Chiavi:
//   edit:sort:{ck}             HASH fileId → gruppo (chiave di SORT_CATEGORIES, o "nd" = non letto)
//   edit:sort:lock:{ck}        un passo alla volta per creator (60 s)
//   edit:sort:spend:{YYYY-MM}  spesa del mese in dollari (tetto EDIT_SORT_CAP_USD, def. 10 $)
//
// Il lavoro va A PASSI chiesti dal browser (ogni passo ≤ 48 file, 4 chiamate in parallelo da 12
// miniature): la pagina mostra i file che volano nei gruppi man mano che arrivano, e una funzione
// non supera mai il suo tempo. Chiudere la pagina ferma lo smistamento; riaprendola riparte da dove era.
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { smallThumb } from "@/lib/google-drive";
import { getFiles, appendLog } from "@/lib/editoriale-store";
import { costUSD } from "@/lib/sales-ai/core";
import {
  SORT_BATCH, SORT_PARALLEL, SORT_STEP_MAX, SORT_USD_PER_FILE, SORT_KEYS, sortPrompt, parseSortAnswer, duplicatesOf, pendingFiles,
} from "@/lib/editoriale-sort-core";

const LABELS = (ck) => `edit:sort:${ck}`;
const LOCK = (ck) => `edit:sort:lock:${ck}`;
const SPEND = () => `edit:sort:spend:${new Date().toISOString().slice(0, 7)}`;
const CAP_USD = () => Number(process.env.EDIT_SORT_CAP_USD) || 10;
const MODEL = () => process.env.EDIT_SORT_MODEL || "claude-haiku-4-5-20251001";
const PRICE_KEY = "claude-haiku-4-5";

export async function getLabels(ck) {
  return (await kv.hgetall(LABELS(ck))) || {};
}

export async function sortSpend() {
  return { spent: Number(await kv.get(SPEND())) || 0, cap: CAP_USD() };
}

/** Correzione a mano: file in un altro gruppo (o di nuovo da smistare con group = null). */
export async function setLabels(ck, ids, group) {
  ids = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean))].slice(0, 500);
  if (!ids.length) return { ok: false, errors: ["Nessun file"] };
  if (group == null) { await kv.hdel(LABELS(ck), ...ids); return { ok: true, labels: Object.fromEntries(ids.map((id) => [id, null])) }; }
  if (!SORT_KEYS.includes(group)) return { ok: false, errors: ["Gruppo sconosciuto"] };
  const doc = await getFiles(ck);
  const known = new Set((doc?.files || []).map((f) => f.id));
  const ok = ids.filter((id) => known.has(id));
  if (!ok.length) return { ok: false, status: 404, errors: ["File non trovati nel drive"] };
  const labels = Object.fromEntries(ok.map((id) => [id, group]));
  await kv.hset(LABELS(ck), labels);
  return { ok: true, labels };
}

/** Rimette tutto da smistare (i gruppi dell'AI si cancellano, il drive no). */
export async function resetLabels(ck, by) {
  await kv.del(LABELS(ck));
  await appendLog(ck, "Smistamento del drive azzerato", by);
  return { ok: true };
}

async function askAi(images) {
  const content = [{ type: "text", text: sortPrompt(images.length) }];
  images.forEach((im, i) => {
    content.push({ type: "text", text: `Immagine ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: im.type, data: im.b64 } });
  });
  const client = globalThis.__editSortFakeAi || new Anthropic();
  const msg = await client.messages.create({ model: MODEL(), max_tokens: 400, messages: [{ role: "user", content }] });
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { answer: parseSortAnswer(text, images.length), usd: costUSD(PRICE_KEY, msg.usage, { batch: false }) };
}

async function thumbB64(fileId) {
  try {
    const t = await smallThumb(fileId, 400);
    if (!t?.body?.length) return null;
    const type = /png/.test(t.type) ? "image/png" : /webp/.test(t.type) ? "image/webp" : /gif/.test(t.type) ? "image/gif" : "image/jpeg";
    return { type, b64: Buffer.from(t.body).toString("base64") };
  } catch { return null; }
}

/**
 * Un passo: prende fino a 48 file non smistati, li fa guardare all'AI e salva il gruppo.
 * Restituisce { labels: {id: gruppo} di questo passo, remaining, spent, cap }.
 */
export async function sortStep(ck, by, { retry = false } = {}) {
  const got = await kv.set(LOCK(ck), "1", { nx: true, ex: 60 });
  if (!got) return { ok: false, status: 409, errors: ["Lo smistamento sta già andando (anche da un'altra scheda)"] };
  try {
    const doc = await getFiles(ck);
    if (!doc?.files?.length) return { ok: false, errors: ["Il drive è vuoto o non è collegato"] };
    let labels = await getLabels(ck);
    if (retry) {
      // «Riprova i non letti»: tornano da smistare (una volta: se non si leggono di nuovo restano «non letti»)
      const nd = Object.keys(labels).filter((id) => labels[id] === "nd");
      if (nd.length) await kv.hdel(LABELS(ck), ...nd);
      labels = Object.fromEntries(Object.entries(labels).filter(([, v]) => v !== "nd"));
    }
    const dups = duplicatesOf(doc.files);
    const pending = pendingFiles(doc.files, labels, dups);
    const { spent, cap } = await sortSpend();
    if (!pending.length) return { ok: true, labels: {}, remaining: 0, spent, cap };
    const take = pending.slice(0, SORT_STEP_MAX);
    if (spent + take.length * SORT_USD_PER_FILE > cap) {
      return { ok: false, status: 402, errors: [`Tetto di spesa del mese raggiunto (${spent.toFixed(2)} $ su ${cap} $): lo smistamento riparte il mese prossimo o alzando EDIT_SORT_CAP_USD`] };
    }
    // miniature 8 alla volta (Drive)
    const thumbs = new Array(take.length);
    for (let i = 0; i < take.length; i += 8) {
      const part = await Promise.all(take.slice(i, i + 8).map((f) => thumbB64(f.id)));
      part.forEach((t, j) => { thumbs[i + j] = t; });
    }
    const out = {};
    const readable = take.map((f, i) => ({ f, t: thumbs[i] })).filter((x) => x.t);
    take.forEach((f, i) => { if (!thumbs[i]) out[f.id] = "nd"; }); // niente miniatura: non letto
    const batches = [];
    for (let i = 0; i < readable.length; i += SORT_BATCH) batches.push(readable.slice(i, i + SORT_BATCH));
    let usd = 0, aiError = null;
    for (let i = 0; i < batches.length; i += SORT_PARALLEL) {
      const res = await Promise.all(batches.slice(i, i + SORT_PARALLEL).map((b) => askAi(b.map((x) => x.t)).catch((e) => ({ error: e }))));
      res.forEach((r, j) => {
        const b = batches[i + j];
        if (r.error) { aiError ||= r.error; return; } // il gruppo resta da smistare: si riprova al passo dopo
        usd += r.usd;
        b.forEach((x, k) => { out[x.f.id] = r.answer[k] || "nd"; });
      });
    }
    if (Object.keys(out).length) await kv.hset(LABELS(ck), out);
    if (usd > 0) await kv.incrbyfloat(SPEND(), usd);
    if (aiError && !Object.keys(out).some((id) => out[id] !== "nd")) {
      const m = String(aiError?.message || "");
      const t = /credit balance/i.test(m) ? "Il credito AI è finito: va ricaricato nella console Anthropic."
        : aiError?.status === 429 || aiError?.status === 529 ? "L'AI è sovraccarica: riprova tra un minuto." : `L'AI non ha risposto: ${m.slice(0, 160)}`;
      return { ok: false, status: 503, errors: [t] };
    }
    const done = new Set(Object.keys(out));
    const remaining = pending.length - done.size;
    if (remaining === 0) {
      const nd = Object.values({ ...labels, ...out }).filter((v) => v === "nd").length;
      await appendLog(ck, `Drive smistato con l'AI: ${doc.files.length} file${dups.size ? `, ${dups.size} doppioni` : ""}${nd ? `, ${nd} non letti` : ""}`, by);
    }
    return { ok: true, labels: out, remaining, spent: spent + usd, cap };
  } finally {
    await kv.del(LOCK(ck)).catch(() => {});
  }
}
