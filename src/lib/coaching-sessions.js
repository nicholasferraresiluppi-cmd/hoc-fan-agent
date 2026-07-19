import { kv } from "@vercel/kv";

/**
 * Sessioni di coaching come oggetto strutturato (backlog benchmark #3):
 * un comportamento per sessione, evidenze allegate, impegni con scadenza,
 * acknowledgement dell'operatore + diritto di replica (pattern Observe.AI /
 * MaestroQA dual sign-off — paper trail a due voci, non note libere).
 *
 * A differenza della QA (§8.1), il coaching E' il mestiere del team lead:
 * creare sessioni richiede scope team o all (l'operatore riceve solo le sue).
 *
 * Lifecycle: sent → acknowledged (l'operatore conferma di aver letto, può
 * aggiungere una replica) → closed (il coach chiude al follow-up).
 * Le sessioni non si cancellano (audit).
 *
 * KV:
 *   coaching:session:{id}   → oggetto
 *   coaching:sessions:all   → ZSET (score=created_at)
 *   coaching:sessions:emp:{name} → set di id
 */

const SKEY = (id) => `coaching:session:${id}`;
const INDEX = "coaching:sessions:all";
const EMP_INDEX = (employee) => `coaching:sessions:emp:${employee}`;

export const COACHING_STATUSES = ["sent", "acknowledged", "closed"];

export async function createSession({ employee, coachId, topic, evidence, commitments, notes, followUpDate }) {
  if (!topic || String(topic).trim().length < 5) {
    throw new Error("topic richiesto: UN comportamento concreto su cui si lavora.");
  }
  const ts = Date.now();
  const session = {
    id: `cs${ts.toString(36)}`,
    employee,
    coach_id: coachId,
    topic: String(topic).slice(0, 200),
    evidence: (Array.isArray(evidence) ? evidence : [])
      .map((e) => String(e).slice(0, 300))
      .filter(Boolean)
      .slice(0, 10),
    commitments: (Array.isArray(commitments) ? commitments : [])
      .map((c) => ({ label: String(c?.label || c || "").slice(0, 200), due_date: c?.due_date || null }))
      .filter((c) => c.label)
      .slice(0, 10),
    notes: String(notes || "").slice(0, 1000),
    follow_up_date: followUpDate || null,
    status: "sent",
    created_at: ts,
    acknowledged_at: null,
    reply_note: null,
    reply_at: null,
    closed_at: null,
    closed_by: null,
    closing_note: null,
  };
  await kv.set(SKEY(session.id), session);
  await kv.zadd(INDEX, { score: ts, member: session.id });
  await kv.sadd(EMP_INDEX(employee), session.id);
  return session;
}

export async function getSession(id) {
  if (!id) return null;
  try {
    return (await kv.get(SKEY(id))) || null;
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  await kv.set(SKEY(session.id), session);
  return session;
}

export async function listSessionsForEmployee(employee) {
  let ids = [];
  try {
    ids = (await kv.smembers(EMP_INDEX(employee))) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const s = await getSession(id);
    if (s) out.push(s);
  }
  out.sort((a, b) => b.created_at - a.created_at);
  return out;
}

export async function listAllSessions({ limit = 300 } = {}) {
  let ids = [];
  try {
    ids = (await kv.zrange(INDEX, 0, limit - 1, { rev: true })) || [];
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const s = await getSession(id);
    if (s) out.push(s);
  }
  return out;
}
