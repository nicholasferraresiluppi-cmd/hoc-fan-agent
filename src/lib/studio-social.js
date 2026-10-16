// Studio social — archivio su KV (16/10/2026). Logica in studio-social-core.js.
//
// Chiavi (namespace `studio:*`, letto solo da questa pagina):
//   studio:profiles              → { [id]: profilo }
//   studio:items:{profileId}     → { [itemId]: contenuto }
//   studio:check:{profileId}:{giorno} → { done: [indici], by, at }   (TTL 40 giorni)
//   studio:arcs:{profileId}      → { [arcId]: storia della settimana }  (Editoriale)
//
// Volumi piccoli (pochi profili, decine di contenuti a settimana): un documento per profilo,
// read-modify-write senza lock come la roadmap (utenti pochi; vince l'ultima scrittura).
import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { normalizeProfile, normalizeItem, canSchedule } from "@/lib/studio-social-core";
import { normalizeArc } from "@/lib/studio-editorial-core";

const PROFILES_KEY = "studio:profiles";
const itemsKey = (pid) => `studio:items:${pid}`;
const checkKey = (pid, day) => `studio:check:${pid}:${day}`;
const CHECK_TTL = 40 * 86400;

export async function listProfiles() {
  return Object.values((await kv.get(PROFILES_KEY)) || {});
}

export async function getProfile(id) {
  const all = (await kv.get(PROFILES_KEY)) || {};
  return all[id] || null;
}

export async function saveProfile(input, userId) {
  const all = (await kv.get(PROFILES_KEY)) || {};
  const prev = input?.id ? all[input.id] || null : null;
  const { ok, errors, profile } = normalizeProfile(input, prev);
  if (!ok) return { ok, errors };
  if (!prev && all[profile.id]) return { ok: false, errors: ["Esiste già un profilo con questo nome"] };
  const now = Date.now();
  profile.createdAt = prev?.createdAt || now;
  profile.createdBy = prev?.createdBy || userId || null;
  profile.updatedAt = now;
  profile.updatedBy = userId || null;
  all[profile.id] = profile;
  await kv.set(PROFILES_KEY, all);
  return { ok: true, profile };
}

export async function listItems(pid) {
  return Object.values((await kv.get(itemsKey(pid))) || {});
}

export async function saveItem(pid, input, userId) {
  const all = (await kv.get(itemsKey(pid))) || {};
  const prev = input?.id ? all[input.id] || null : null;
  const { ok, errors, item } = normalizeItem(input, prev);
  if (!ok) return { ok, errors };
  // "Programmato" (e oltre) solo se i revisori lo permettono: la regola vive qui, non solo in pagina.
  if (["programmato", "pubblicato"].includes(item.status) && !["programmato", "pubblicato"].includes(prev?.status)) {
    const gate = canSchedule(item);
    if (!gate.ok) return { ok: false, errors: [gate.reason] };
  }
  const now = Date.now();
  // Chi ha approvato resta scritto sul contenuto (l'approvazione è di una persona, non di un agente).
  if (item.status === "programmato" && prev?.status !== "programmato" && !prev?.approvedBy) {
    item.approvedBy = userId || null; item.approvedAt = now;
  } else {
    item.approvedBy = prev?.approvedBy || null; item.approvedAt = prev?.approvedAt || null;
  }
  item.id = item.id || randomUUID().slice(0, 12);
  item.createdAt = prev?.createdAt || now;
  item.createdBy = prev?.createdBy || userId || null;
  item.updatedAt = now;
  item.updatedBy = userId || null;
  if (item.status !== prev?.status) {
    item.statusLog = [...(prev?.statusLog || []), { status: item.status, at: now, by: userId || null }].slice(-30);
  } else {
    item.statusLog = prev?.statusLog || [];
  }
  all[item.id] = item;
  await kv.set(itemsKey(pid), all);
  return { ok: true, item };
}

export async function removeItem(pid, id) {
  const all = (await kv.get(itemsKey(pid))) || {};
  if (!all[id]) return false;
  delete all[id];
  await kv.set(itemsKey(pid), all);
  return true;
}

export async function getChecklist(pid, day) {
  return (await kv.get(checkKey(pid, day))) || { done: [] };
}

export async function toggleCheck(pid, day, index, done, userId) {
  const cur = await getChecklist(pid, day);
  const set = new Set(cur.done || []);
  if (done) set.add(index); else set.delete(index);
  const next = { done: [...set].sort((a, b) => a - b), by: userId || null, at: Date.now() };
  await kv.set(checkKey(pid, day), next, { ex: CHECK_TTL });
  return next;
}

// ── Editoriale: storie della settimana ──────────────────────────────────────
const arcsKey = (pid) => `studio:arcs:${pid}`;

export async function listArcs(pid) {
  return Object.values((await kv.get(arcsKey(pid))) || {}).sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));
}

export async function saveArc(pid, input, userId) {
  const all = (await kv.get(arcsKey(pid))) || {};
  const prev = input?.id ? all[input.id] || null : null;
  const { ok, errors, arc } = normalizeArc(input, prev);
  if (!ok) return { ok, errors };
  if (Object.values(all).some((a) => a.weekStart === arc.weekStart && a.id !== (prev?.id || arc.id))) return { ok: false, errors: ["Questa settimana ha già la sua storia"] };
  const now = Date.now();
  arc.id = arc.id || randomUUID().slice(0, 12);
  arc.createdAt = prev?.createdAt || now;
  arc.createdBy = prev?.createdBy || userId || null;
  arc.updatedAt = now;
  arc.updatedBy = userId || null;
  all[arc.id] = arc;
  await kv.set(arcsKey(pid), all);
  return { ok: true, arc };
}

export async function removeArc(pid, id) {
  const all = (await kv.get(arcsKey(pid))) || {};
  if (!all[id]) return false;
  delete all[id];
  await kv.set(arcsKey(pid), all);
  return true;
}
