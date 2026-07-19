import { kv } from "@vercel/kv";

/**
 * Contestazioni (dispute) su score/compensi — implementa CAREER_LADDER §8.2
 * e VISIBILITY_POLICY (riga "Dispute"): l'operatore contesta un numero tramite
 * un oggetto strutturato, mai via chat; la risoluzione è registrata e, se
 * accolta, innesca la correzione TRACCIATA (mai silenziosa).
 *
 * KV:
 *   dispute:{id}            → oggetto
 *   disputes:all            → ZSET (score=created_at) — coda admin
 *   disputes:emp:{employee} → set di id — lista own
 *
 * Stati: open → accepted | partial | rejected (chiusi, mai cancellati: audit).
 */

const DKEY = (id) => `dispute:${id}`;
const INDEX = "disputes:all";
const EMP_INDEX = (employee) => `disputes:emp:${employee}`;

export const DISPUTE_TYPES = ["score", "compenso", "altro"];
export const OPEN_STATUS = "open";
export const CLOSED_STATUSES = ["accepted", "partial", "rejected"];
export const SLA_DAYS = 10; // proposta §8.2: 10 giorni lavorativi (qui: solari, marcato in UI)

export async function createDispute({ employee, userId, type, periodId, metric, message }) {
  const ts = Date.now();
  const dispute = {
    id: `dp${ts.toString(36)}`,
    employee,
    user_id: userId,
    type,
    period_id: periodId || null,
    metric: metric || null,
    message: String(message || "").slice(0, 1000),
    status: OPEN_STATUS,
    created_at: ts,
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
  };
  await kv.set(DKEY(dispute.id), dispute);
  await kv.zadd(INDEX, { score: ts, member: dispute.id });
  await kv.sadd(EMP_INDEX(employee), dispute.id);
  return dispute;
}

export async function getDispute(id) {
  if (!id) return null;
  try {
    return (await kv.get(DKEY(id))) || null;
  } catch {
    return null;
  }
}

export async function saveDispute(dispute) {
  await kv.set(DKEY(dispute.id), dispute);
  return dispute;
}

/** Lista own: solo le contestazioni dell'employee indicato (per la superficie operatore). */
export async function listDisputesForEmployee(employee) {
  let ids = [];
  try {
    ids = (await kv.smembers(EMP_INDEX(employee))) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const d = await getDispute(id);
    if (d) out.push(d);
  }
  out.sort((a, b) => b.created_at - a.created_at);
  return out;
}

/** Coda completa (admin/SM): più recenti prima; filtro stato opzionale. */
export async function listAllDisputes({ status = null, limit = 200 } = {}) {
  let ids = [];
  try {
    ids = (await kv.zrange(INDEX, 0, limit - 1, { rev: true })) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const d = await getDispute(id);
    if (d && (!status || d.status === status)) out.push(d);
  }
  return out;
}
