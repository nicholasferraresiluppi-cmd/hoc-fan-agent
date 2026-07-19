import { kv } from "@vercel/kv";
import { inflowwPaged } from "@/lib/infloww-api";
import { isMassAccount } from "@/lib/leaderboard-calc";

// Locale per evitare import circolare con me.js (che importa questo modulo).
// Identica a normalizeName in me.js — se cambia una, cambiare l'altra.
const normalizeName = (s) => (s || "").toLowerCase().replace(/[\s._-]+/g, "");

/**
 * Roster ufficiale degli operatori da Infloww (/v1/employees).
 *
 * Perché esiste: fino a luglio 2026 il mapping utente→operatore si basava solo
 * sul matching per NOME contro i dati CP/CSV (fonte dei mismatch, cfr
 * /admin/debug-mapping). Ora che l'API ufficiale risponde, il roster dà la lista
 * AUTORITATIVA dei nomi Infloww + un employeeId STABILE — ancora robusta per il
 * collegamento, che sopravvive a refusi e cambi nome.
 *
 * Regola MASS (Nicholas, 19 lug): il roster include gli account "<nome> MASS"
 * (mass-messaging, non chatter) → esclusi via isMassAccount(), come già fa la
 * leaderboard. Esclusi anche gli account cancellati.
 *
 * Non-bloccante: se l'API/env manca, ritorna roster vuoto e i chiamanti fanno
 * fallback alle fonti CP esistenti. Cache KV per non martellare l'API (rate
 * limit 1000 QPM/agency); il roster cambia di rado.
 *
 * KV: infloww:roster:cache → { fetched_at, employees: [{employeeId, employeeName}] }
 */

const CACHE_KEY = "infloww:roster:cache";
const TTL_SEC = 6 * 3600; // 6h

function isActive(e) {
  if (!e) return false;
  if (e.deletedTime) return false;
  const st = String(e.status || "").toUpperCase();
  return st !== "DELETED" && st !== "REMOVED";
}

/** Roster attivo, MASS-filtrato. { employees, from_cache, error? } */
export async function getRoster({ refresh = false } = {}) {
  if (!refresh) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached?.employees) return { employees: cached.employees, from_cache: true, fetched_at: cached.fetched_at };
    } catch {}
  }

  let raw = [];
  try {
    const { items } = await inflowwPaged("/v1/employees", { limit: 100, maxItems: 5000 });
    raw = items || [];
  } catch (e) {
    // API/env assente o errore: non-bloccante.
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached?.employees) return { employees: cached.employees, from_cache: true, stale: true, error: String(e?.message || e) };
    } catch {}
    return { employees: [], from_cache: false, error: String(e?.message || e) };
  }

  const employees = raw
    .filter((e) => isActive(e) && e.employeeName && !isMassAccount(e.employeeName))
    .map((e) => ({ employeeId: String(e.employeeId), employeeName: e.employeeName }));

  const payload = { fetched_at: Date.now(), employees };
  try {
    await kv.set(CACHE_KEY, payload, { ex: TTL_SEC });
  } catch {}
  return { employees, from_cache: false, fetched_at: payload.fetched_at };
}

/**
 * Match di un'email (local-part normalizzata) contro il roster, SOLO ESATTO.
 *
 * Il matching per prefisso è VIETATO qui: l'identità gate-a dati privati
 * (VISIBILITY_POLICY), e un prefisso mappa erroneamente (es. email
 * "nicholas.xxx" → operatore "Nicholas"). Se l'esatto non c'è, ritorna null e
 * la decisione passa a un admin via override ancorato all'employeeId — un atto
 * umano deliberato, non un'approssimazione.
 */
export async function rosterMatchForEmail(email) {
  if (!email) return null;
  const { employees } = await getRoster();
  if (!employees.length) return null;
  const normLocal = normalizeName(email.split("@")[0] || "");
  if (!normLocal) return null;

  const exact = employees.filter((e) => normalizeName(e.employeeName) === normLocal);
  if (exact.length === 1) return { ...exact[0], match: "exact" };
  if (exact.length > 1) return { ambiguous: true, candidates: exact.slice(0, 5) };
  return null;
}

/** employeeId → nome (dal roster), o null. */
export async function nameForEmployeeId(employeeId) {
  if (!employeeId) return null;
  const { employees } = await getRoster();
  const hit = employees.find((e) => e.employeeId === String(employeeId));
  return hit ? hit.employeeName : null;
}
