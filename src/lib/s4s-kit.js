// S4S — kit promo per pagina (13/10/2026, punto 2 del ridisegno; decisione Nicholas: le foto
// stanno in HOC Pro). Foto in uno spazio PRIVATO (Vercel Blob, stesso store degli upload HR e
// delle foto dello scouting, cartella s4s/kit/), lette solo da /api/admin/s4s/kit/photo con
// controllo d'accesso. Il browser riduce la foto prima di mandarla (≤ 2000 px, JPEG).
//
// KV s4s:kit:{creatorId} = { photos:[{id, path, use, type, size, at, by}], text_post, text_mass, updated_at, updated_by }
import crypto from "crypto";
import { kv } from "@vercel/kv";
import { KIT_MAX_PHOTOS, KIT_TEXT_MAX, PHOTO_USES } from "@/lib/s4s-core";

const sdk = async () => globalThis.__s4sFakeBlob || (await import("@vercel/blob"));
export const blobReady = () => Boolean(globalThis.__s4sFakeBlob || process.env.BLOB_READ_WRITE_TOKEN);
const KEY = (cid) => `s4s:kit:${Number(cid)}`;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024; // già ridotta dal browser: di solito 200-800 KB
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const clean = (s) => String(s || "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, KIT_TEXT_MAX);

export async function getKit(cid) {
  const v = await kv.get(KEY(cid));
  return v && typeof v === "object" ? v : { photos: [], text_post: "", text_mass: "" };
}
export async function getKits(ids) {
  const list = [...new Set(ids.map(Number))];
  if (!list.length) return {};
  const vals = await kv.mget(...list.map(KEY));
  return Object.fromEntries(list.map((id, i) => [id, vals[i] && typeof vals[i] === "object" ? vals[i] : { photos: [], text_post: "", text_mass: "" }]));
}
const stamp = (kit, uid) => ({ ...kit, updated_at: new Date().toISOString(), updated_by: uid || null });

export async function saveKitText(cid, { text_post, text_mass }, uid) {
  const kit = await getKit(cid);
  const out = stamp({ ...kit, text_post: clean(text_post), text_mass: clean(text_mass) }, uid);
  await kv.set(KEY(cid), out);
  return out;
}

export async function addPhoto(cid, buf, type, uid) {
  if (!blobReady()) throw new Error("Spazio per le foto non configurato in questo ambiente");
  if (!PHOTO_TYPES.includes(type)) throw new Error("Formato non ammesso: solo JPG, PNG o WebP");
  if (!buf?.length || buf.length > PHOTO_MAX_BYTES) throw new Error("Foto troppo grande (massimo 4 MB dopo la riduzione)");
  const kit = await getKit(cid);
  if ((kit.photos || []).length >= KIT_MAX_PHOTOS) throw new Error(`Al massimo ${KIT_MAX_PHOTOS} foto: togline una prima`);
  const id = crypto.randomBytes(8).toString("hex");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `s4s/kit/${Number(cid)}/${id}.${ext}`;
  const { put } = await sdk();
  await put(path, buf, { access: "private", contentType: type, addRandomSuffix: false, allowOverwrite: false });
  const photo = { id, path, use: "both", type, size: buf.length, at: new Date().toISOString(), by: uid || null };
  // rilettura subito prima di scrivere: due caricamenti in parallelo non si cancellano a vicenda
  const fresh = await getKit(cid);
  const out = stamp({ ...fresh, photos: [...(fresh.photos || []), photo].slice(0, KIT_MAX_PHOTOS) }, uid);
  await kv.set(KEY(cid), out);
  return out;
}

export async function setPhotoUse(cid, id, use, uid) {
  if (!PHOTO_USES[use]) throw new Error("Uso non valido");
  const kit = await getKit(cid);
  if (!(kit.photos || []).some((p) => p.id === id)) throw new Error("Foto non trovata");
  const out = stamp({ ...kit, photos: kit.photos.map((p) => (p.id === id ? { ...p, use } : p)) }, uid);
  await kv.set(KEY(cid), out);
  return out;
}

export async function removePhoto(cid, id, uid) {
  const kit = await getKit(cid);
  const p = (kit.photos || []).find((x) => x.id === id);
  if (!p) return kit;
  const out = stamp({ ...kit, photos: kit.photos.filter((x) => x.id !== id) }, uid);
  await kv.set(KEY(cid), out);
  if (blobReady()) { const { del } = await sdk(); await del(p.path).catch(() => {}); }
  return out;
}

export async function readPhoto(cid, id) {
  if (!blobReady() || !/^[a-f0-9]{16}$/.test(String(id || ""))) return null;
  const kit = await getKit(cid);
  const p = (kit.photos || []).find((x) => x.id === id);
  if (!p) return null;
  const { get } = await sdk();
  const r = await get(p.path, { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { stream: r.stream, type: p.type || r.blob?.contentType || "image/jpeg", name: `${id}.${p.path.split(".").pop()}` };
}
