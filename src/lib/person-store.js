/**
 * HOC Pro — Write-path dell'event-store persona.
 *
 * Implementa la scrittura del modello dati definito in `person-events.js`
 * (schema puro) + il resolver identità nome→employeeId. Questo è il punto in
 * cui l'event-store diventa una modifica al modello dati KV (namespace nuovo
 * `person:*`) — vedi `docs/PERSON_EVENT_STORE.md` (ADR accettato 2026-07-20).
 *
 * Identità: personId = employeeId Infloww (decisione ADR §4). Le fonti keyed
 * by-name si risolvono via `infloww:roster:cache`; le certificazioni (keyed by
 * Clerk userId) via `user_employee:{userId}`.
 *
 * Idempotenza: ogni evento ha un `id` DETERMINISTICO derivato da
 * (type, at, source, chiavi-payload). Riscrivere lo stesso evento non lo
 * duplica → il backfill è ri-eseguibile senza effetti collaterali.
 */
import { kv } from "@vercel/kv";
import {
  personEventsKey, personStateKey, PERSON_INDEX_KEY,
  normalizeEvent, validateEvent, deriveState,
} from "./person-events";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// ── Identità ────────────────────────────────────────────────────────────────

/** Costruisce l'indice nome-normalizzato → employeeId dal roster Infloww. */
export async function buildRosterIndex() {
  const cache = await kv.get("infloww:roster:cache");
  const employees = (cache && Array.isArray(cache.employees)) ? cache.employees : [];
  const byName = new Map();
  const byId = new Map();
  for (const e of employees) {
    if (!e || e.employeeId == null) continue;
    const id = String(e.employeeId);
    byId.set(id, e.employeeName || id);
    if (e.employeeName) byName.set(norm(e.employeeName), id);
  }
  return { byName, byId, size: employees.length };
}

/** Risolve un nome operatore in employeeId (o null se non nel roster). */
export function resolveByName(rosterIndex, name) {
  return rosterIndex.byName.get(norm(name)) || null;
}

/** Risolve un Clerk userId in {employeeId, employeeName} via user_employee. */
export async function resolveByUserId(userId) {
  if (!userId) return null;
  const m = await kv.get(`user_employee:${userId}`);
  if (!m || m.employeeId == null) return null;
  return { employeeId: String(m.employeeId), employeeName: m.employeeName || null };
}

// ── Id deterministico dell'evento ───────────────────────────────────────────

function hash36(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Id stabile: stesso evento logico → stesso id (dedup del backfill). */
export function eventId(ev) {
  const p = ev.payload || {};
  const sig = [ev.type, ev.at, ev.source || "", p.period || "", p.creator || "", p.to || "", p.milestone || "", p.text ? hash36(String(p.text)) : ""].join("|");
  return `${ev.type}_${hash36(sig)}`;
}

// ── Scrittura ───────────────────────────────────────────────────────────────

/**
 * Merge idempotente di una lista di eventi su un personId. Legge gli eventi
 * esistenti, aggiunge solo quelli con id nuovo, riscrive una volta, ricalcola
 * e cachea la proiezione dello stato, aggiorna l'indice persone.
 * @returns {{ added: number, total: number, invalid: number }}
 */
export async function writePersonEvents(personId, rawEvents) {
  if (!personId) return { added: 0, total: 0, invalid: 0 };
  const pid = String(personId);
  const existing = (await kv.get(personEventsKey(pid))) || [];
  const seen = new Set(existing.map((e) => e.id));

  let added = 0, invalid = 0;
  const merged = [...existing];
  for (const raw of rawEvents) {
    const ev = normalizeEvent(raw);
    const v = validateEvent(ev);
    if (!v.ok) { invalid++; continue; }
    ev.id = ev.id || eventId(ev);
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    merged.push(ev);
    added++;
  }
  if (added === 0) return { added: 0, total: existing.length, invalid };

  merged.sort((a, b) => Number(a.at) - Number(b.at));
  await kv.set(personEventsKey(pid), merged);
  await kv.set(personStateKey(pid), { ...deriveState(merged), person_id: pid });
  await kv.sadd(PERSON_INDEX_KEY, pid);
  return { added, total: merged.length, invalid };
}

/** Append di un singolo evento (write online dalla UI, fase successiva). */
export async function appendPersonEvent(personId, rawEvent) {
  return writePersonEvents(personId, [rawEvent]);
}

// ── Lettura ─────────────────────────────────────────────────────────────────

export async function readPersonEvents(personId) {
  return (await kv.get(personEventsKey(String(personId)))) || [];
}

export async function getPersonState(personId) {
  const pid = String(personId);
  const cached = await kv.get(personStateKey(pid));
  if (cached) return cached;
  const events = await readPersonEvents(pid);
  return { ...deriveState(events), person_id: pid };
}

export async function listPersonIds() {
  return (await kv.smembers(PERSON_INDEX_KEY)) || [];
}
