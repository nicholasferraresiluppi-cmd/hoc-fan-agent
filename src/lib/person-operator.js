/**
 * Collegamento persona → operatore, lato server (07/11/2026). Logica pura in
 * person-operator-core.js.
 *
 * KV: `hr:operator-links` HASH personId → { inflowwName, employeeId, at, by }.
 * Fuori dalla scheda (`hr:person:{id}`) di proposito: la scheda si sincronizza
 * con ClickUp e la riscrivono webhook e riconciliazione; il collegamento è solo
 * di HOC Pro e così non entra mai in quella partita. Ogni modifica finisce
 * anche nello storico della scheda.
 *
 * Chi lo legge: Porta un amico (turni da CreatorsPro, venduto da Infloww, uscita).
 * Gli altri strumenti che oggi abbinano per nome possono leggere da qui.
 */
import { kv } from "@vercel/kv";
import { operatorCandidates, validateOperatorLink, suggestOperator, cpMembersFor, opKey } from "@/lib/person-operator-core";
import { fullName } from "@/lib/hr-people-core";

const LINKS = "hr:operator-links";

function parse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** { personId: { inflowwName, employeeId, at, by } } */
export async function getOperatorLinks() {
  const h = (await kv.hgetall(LINKS).catch(() => null)) || {};
  const out = {};
  for (const [id, v] of Object.entries(h)) { const o = parse(v); if (o?.inflowwName) out[id] = o; }
  return out;
}

/** Nomi Infloww tra cui scegliere: roster ufficiale + nomi degli ultimi import mensili. */
export async function getOperatorCandidates() {
  const [{ getRoster }, { listInflowwNames }] = await Promise.all([import("@/lib/infloww-roster"), import("@/lib/infloww-month-sales")]);
  const [roster, kpi] = await Promise.all([getRoster().catch(() => ({ employees: [] })), listInflowwNames().catch(() => [])]);
  return operatorCandidates(roster.employees || [], kpi);
}

/** Cosa mostrare sulla scheda: collegamento, suggerimento, CreatorsPro, elenco. */
export async function operatorView(person) {
  const [links, candidates, mapping, members] = await Promise.all([
    getOperatorLinks(), getOperatorCandidates(), kv.get("cp:member_mapping").catch(() => null), kv.get("cp:members").catch(() => null),
  ]);
  const link = links[person.id] || null;
  return {
    link,
    suggestion: link ? null : suggestOperator(fullName(person.fields), candidates, links),
    cp: link ? cpMembersFor(link.inflowwName, mapping || {}, members || {}) : null,
    // nomi già presi da altre schede: non si propongono
    candidates: candidates.filter((c) => !Object.entries(links).some(([pid, l]) => pid !== person.id && l.inflowwName === c.name)),
  };
}

export async function setOperatorLink(person, inflowwName, actor) {
  const [links, candidates] = await Promise.all([getOperatorLinks(), getOperatorCandidates()]);
  const others = Object.keys(links).filter((id) => id !== person.id);
  const names = {};
  if (others.length) {
    const { getPerson } = await import("@/lib/hr-people");
    const owner = others.find((id) => opKey(links[id].inflowwName) === opKey(inflowwName));
    if (owner) names[owner] = fullName((await getPerson(owner).catch(() => null))?.fields) || null;
  }
  const v = validateOperatorLink({ personId: person.id, inflowwName, candidates, links, names });
  if (v.error) throw new Error(v.error);
  const prev = links[person.id] || null;
  const rec = { ...v.value, at: Date.now(), by: actor?.name || actor?.id || null };
  await kv.hset(LINKS, { [person.id]: JSON.stringify(rec) });
  await logChange(person.id, actor, prev?.inflowwName || null, rec.inflowwName);
  return rec;
}

export async function clearOperatorLink(person, actor) {
  const links = await getOperatorLinks();
  const prev = links[person.id];
  if (!prev) return null;
  await kv.hdel(LINKS, person.id);
  await logChange(person.id, actor, prev.inflowwName, null);
  return null;
}

async function logChange(personId, actor, from, to) {
  try {
    const { appendLog } = await import("@/lib/hr-people");
    await appendLog(personId, [{ at: Date.now(), by: actor?.id || actor?.name || null, source: "app", action: "operator_link", field: null, from, to }]);
  } catch {}
}
