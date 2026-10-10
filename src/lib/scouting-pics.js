// Radar creator — foto profilo SALVATE (10/10/2026, decisione Nicholas: i link di Instagram
// scadono dopo ~4,5 giorni). Si tiene solo la miniatura che Instagram dà già piccola, in uno
// spazio PRIVATO (Vercel Blob, stesso store degli upload HR, cartella scouting/pics/), letta solo
// da /api/admin/scouting/pic/[h] (SEED). Cancellazione su richiesta: la foto va via con i dati.
import { livePic, normHandle } from "@/lib/scouting-core";
import { blobConfigured } from "@/lib/hr-blob";

const sdk = async () => await import("@vercel/blob");
const MAX_BYTES = 400 * 1024;
export const picPath = (h) => `scouting/pics/${h}.jpg`;

async function fetchPic(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_BYTES ? { buf, type } : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Salva le foto ancora valide dei profili indicati (o di tutti) che non ne hanno una salvata
 * più recente del link. Limite di tempo: quello che resta si fa al giro dopo.
 * Restituisce i profili aggiornati (picKey, picAt) e i conteggi.
 */
export async function savePics(profiles, { only = null, budgetMs = 40000, concurrency = 8 } = {}) {
  if (!blobConfigured()) return { profiles, saved: 0, skipped: "no-blob" };
  const want = only ? new Set(only) : null;
  const todo = profiles.filter((p) => (!want || want.has(p.h)) && livePic(p.pic) && !(p.picAt && p.picSrc === p.pic));
  const { put } = await sdk();
  const deadline = Date.now() + budgetMs;
  const done = new Map();
  let i = 0;
  async function worker() {
    while (i < todo.length && Date.now() < deadline) {
      const p = todo[i++];
      const got = await fetchPic(p.pic);
      if (!got) continue;
      await put(picPath(p.h), got.buf, { access: "private", contentType: got.type, allowOverwrite: true, addRandomSuffix: false });
      done.set(p.h, { picKey: picPath(p.h), picAt: Date.now(), picSrc: p.pic });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { profiles: profiles.map((p) => (done.has(p.h) ? { ...p, ...done.get(p.h) } : p)), saved: done.size, left: todo.length - done.size };
}

/** Byte della foto salvata, o null. */
export async function readPic(h) {
  const hh = normHandle(h);
  if (!hh || !blobConfigured()) return null;
  const { get } = await sdk();
  const r = await get(picPath(hh), { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { stream: r.stream, type: r.blob?.contentType || "image/jpeg" };
}

export async function deletePic(h) {
  const hh = normHandle(h);
  if (!hh || !blobConfigured()) return;
  const { del } = await sdk();
  await del(picPath(hh)).catch(() => {});
}
