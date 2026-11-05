// Studio social — collegamento a Postiz (API pubblica, chiave POSTIZ_API_KEY solo lato server).
// Logica pura in studio-postiz-core.js.
//
//   studio:postiz:integrations   elenco canali di Postiz (cache 1 h)
//   Blob privato studio/{pid}/video/{itemId}/{nome}   il video controllato, quello che esce
//
// Limite Postiz: ~100 creazioni di post all'ora (cloud). Noi ne facciamo 1-2 al giorno.
import { kv } from "@vercel/kv";
import { buildPostizBody, pickIntegration, canPublishIg, stateToStatus } from "@/lib/studio-postiz-core";
import { romeLocalToMs } from "@/lib/studio-telegram-core";

const BASE = "https://api.postiz.com/public/v1";
const INTEGRATIONS = "studio:postiz:integrations";
const itemsKey = (pid) => `studio:items:${pid}`;
const sdk = async () => globalThis.__studioFakeBlob || (await import("@vercel/blob"));
export const postizConfigured = () => Boolean(process.env.POSTIZ_API_KEY || globalThis.__postizFakeFetch);

async function pz(path, { method = "GET", body, form } = {}) {
  const key = process.env.POSTIZ_API_KEY;
  if (!key && !globalThis.__postizFakeFetch) throw new Error("Postiz non configurato (POSTIZ_API_KEY)");
  const f = globalThis.__postizFakeFetch || fetch;
  const init = { method, headers: { Authorization: key || "fake" } };
  if (form) init.body = form;
  else if (body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const r = await f(`${BASE}${path}`, init);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* risposta non JSON */ }
  if (!r.ok) throw Object.assign(new Error(`Postiz: ${json?.message || json?.error || text.slice(0, 200) || r.status}`), { status: r.status });
  return json;
}

export async function listIntegrations({ fresh = false } = {}) {
  if (!fresh) { const c = await kv.get(INTEGRATIONS); if (c) return c; }
  const res = await pz("/integrations");
  const list = (Array.isArray(res) ? res : res?.integrations || []).map((i) => ({ id: i.id, name: i.name, profile: i.profile, identifier: i.identifier || i.providerIdentifier, disabled: !!i.disabled, picture: i.picture || null }));
  await kv.set(INTEGRATIONS, list, { ex: 3600 });
  return list;
}

/** Il video controllato diventa il video del contenuto (lo chiama la route di caricamento). */
export async function attachVideo(pid, itemId, { path, name, size, contentType }, by) {
  const all = (await kv.get(itemsKey(pid))) || {};
  const item = all[itemId];
  if (!item) return { ok: false, error: "Contenuto non trovato" };
  if (!String(path || "").startsWith(`studio/${pid}/video/${itemId}/`)) return { ok: false, error: "Percorso non valido" };
  if (["programmato", "pubblicato"].includes(item.status)) return { ok: false, error: "Il contenuto è già approvato: riportalo a «Da approvare» per cambiare video" };
  const old = item.video?.path;
  all[itemId] = { ...item, video: { path, name: String(name || "").slice(0, 120), size: Number(size) || null, contentType: contentType || "video/mp4", at: Date.now(), by: by || null }, updatedAt: Date.now() };
  await kv.set(itemsKey(pid), all);
  if (old && old !== path) { const { del } = await sdk(); await del(old).catch(() => {}); }
  return { ok: true, item: all[itemId] };
}

async function patchItem(pid, itemId, patch) {
  const all = (await kv.get(itemsKey(pid))) || {};
  if (!all[itemId]) return null;
  all[itemId] = { ...all[itemId], ...patch(all[itemId]) };
  await kv.set(itemsKey(pid), all);
  return all[itemId];
}

/** Manda a Postiz il video controllato, programmato all'ora di Roma scelta. */
export async function publishToInstagram(pid, profile, itemId, { publishAtLocal } = {}, by) {
  const item = ((await kv.get(itemsKey(pid))) || {})[itemId];
  const whenMs = romeLocalToMs(publishAtLocal || item?.publishAtLocal);
  const gate = canPublishIg(item, whenMs);
  if (!gate.ok) return { ok: false, status: 400, error: gate.reason };
  const integ = pickIntegration(await listIntegrations(), profile.handle) || pickIntegration(await listIntegrations({ fresh: true }), profile.handle);
  if (!integ) return { ok: false, status: 400, error: `@${profile.handle} non è collegato su Postiz` };
  try {
    // il video dallo spazio privato a Postiz (multipart: il nostro spazio non è pubblico)
    const { get } = await sdk();
    const r = await get(item.video.path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error("Il video controllato non si trova più: rifai il controllo");
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([buf], { type: item.video.contentType || "video/mp4" }), item.video.name || "reel.mp4");
    const media = await pz("/upload", { method: "POST", form });
    const created = await pz("/posts", { method: "POST", body: buildPostizBody({ integrationId: integ.id, item, whenMs, media }) });
    const first = Array.isArray(created) ? created[0] : created;
    const postId = first?.postId || first?.id || first?.posts?.[0]?.id || null;
    const saved = await patchItem(pid, itemId, () => ({
      publishAtLocal, postiz: { postId, group: first?.group || null, state: "QUEUE", scheduledFor: whenMs, integrationId: integ.id, at: Date.now(), by: by || null, error: null },
    }));
    return { ok: true, item: saved };
  } catch (e) {
    const saved = await patchItem(pid, itemId, (it) => ({ postiz: { ...(it.postiz || {}), state: "ERROR", error: String(e.message || e).slice(0, 300), at: Date.now() } }));
    return { ok: false, status: e.status && e.status < 500 ? 400 : 502, error: e.message, item: saved };
  }
}

/** Toglie il post da Postiz (quando il contenuto torna indietro dalla coda). */
export async function unpublishFromInstagram(pid, itemId) {
  const item = ((await kv.get(itemsKey(pid))) || {})[itemId];
  const postId = item?.postiz?.postId;
  if (!postId || item.postiz.state === "PUBLISHED") return { ok: true, skipped: true };
  await pz(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" }).catch((e) => { if (e.status !== 404) throw e; });
  await patchItem(pid, itemId, () => ({ postiz: null }));
  return { ok: true };
}

/** Allinea lo stato dei post programmati (dal cron): pubblicato con link, o errore. */
export async function syncInstagramStates(profiles) {
  if (!postizConfigured()) return { checked: 0 };
  const pending = [];
  for (const p of profiles) {
    for (const it of Object.values((await kv.get(itemsKey(p.id))) || {})) {
      if (it.postiz?.postId && it.postiz.state === "QUEUE") pending.push({ pid: p.id, it });
    }
  }
  if (!pending.length) return { checked: 0 };
  const from = Math.min(...pending.map((x) => x.it.postiz.scheduledFor)) - 86400e3;
  const to = Math.max(...pending.map((x) => x.it.postiz.scheduledFor)) + 86400e3;
  const res = await pz(`/posts?startDate=${encodeURIComponent(new Date(from).toISOString())}&endDate=${encodeURIComponent(new Date(to).toISOString())}`);
  const posts = Array.isArray(res) ? res : res?.posts || [];
  let updated = 0;
  for (const { pid, it } of pending) {
    const p = posts.find((x) => x.id === it.postiz.postId || (it.postiz.group && x.group === it.postiz.group));
    if (!p || p.state === "QUEUE" || p.state === "DRAFT") continue;
    await patchItem(pid, it.id, (cur) => ({
      postiz: { ...cur.postiz, state: p.state, releaseURL: p.releaseURL || null, error: p.error || null, syncedAt: Date.now() },
      ...(stateToStatus(p.state) === "pubblicato" ? { status: "pubblicato", publishedAt: Date.parse(p.publishDate) || Date.now() } : {}),
    }));
    updated++;
  }
  return { checked: pending.length, updated };
}
