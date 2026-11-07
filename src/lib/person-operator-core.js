/**
 * Collegamento persona → operatore — logica PURA (07/11/2026).
 *
 * Perché: la scheda del CRM aveva solo nome e cognome, e ogni strumento che
 * doveva sapere «chi è questa persona su Infloww e CreatorsPro» si faceva il suo
 * abbinamento per nome (Porta un amico aveva la sua tendina Infloww). Ora il
 * collegamento si fa UNA volta, sulla scheda: nome Infloww (con l'employeeId del
 * roster ufficiale quando c'è). CreatorsPro arriva da lì con l'abbinamento che
 * esiste già (`cp:member_mapping`, membro CP → nome Infloww).
 *
 * Regole: un nome Infloww appartiene a UNA sola scheda; il suggerimento per nome
 * si propone solo se è univoco (stesso matcher di Squadra, `matchName`) e lo
 * conferma una persona — mai un abbinamento scritto da solo.
 * Il lato KV sta in person-operator.js; qui niente rete, provato da tests/person-operator.mjs.
 */
import { matchName } from "./squadra-core.js";

const s = (v) => (v == null ? "" : String(v)).trim();
// Chiave di un nome Infloww: maiuscole, accenti e spazi non contano, il resto sì.
// Non la nameKey di Squadra, che toglie HOC/ES/EN: su Infloww «Anna Russo» e
// «Anna Russo ES» sono due account, e il venduto si legge per account.
export const opKey = (v) => s(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");

/**
 * Elenco dei nomi Infloww tra cui scegliere: roster ufficiale (con employeeId)
 * unito ai nomi visti negli import mensili (chi non è più nel roster ma ha
 * venduto di recente). Un nome per persona, ordine alfabetico.
 * roster: [{ employeeId, employeeName }], kpiNames: ["Nome", …]
 * → [{ name, employeeId|null }]
 */
export function operatorCandidates(roster = [], kpiNames = []) {
  const byKey = new Map();
  for (const e of roster || []) {
    const name = s(e?.employeeName);
    if (name && !byKey.has(opKey(name))) byKey.set(opKey(name), { name, employeeId: e.employeeId ? String(e.employeeId) : null });
  }
  for (const n of kpiNames || []) {
    const name = s(n);
    if (name && !byKey.has(opKey(name))) byKey.set(opKey(name), { name, employeeId: null });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** Il candidato con quel nome (stesso nome a meno di maiuscole, accenti e spazi), o null. */
export function findCandidate(candidates = [], inflowwName) {
  const k = opKey(inflowwName);
  if (!k) return null;
  return candidates.find((c) => opKey(c.name) === k) || null;
}

/**
 * Valida un collegamento da salvare: il nome deve essere tra i candidati e non
 * già collegato a un'altra scheda. links: { personId: { inflowwName } }.
 * → { value: { inflowwName, employeeId } } | { error }
 */
export function validateOperatorLink({ personId, inflowwName, candidates = [], links = {}, names = {} }) {
  const name = s(inflowwName);
  if (!name) return { error: "Scegli il nome dell'operatore su Infloww" };
  const c = findCandidate(candidates, name);
  if (!c) return { error: `«${name}» non è tra gli operatori di Infloww: sceglilo dall'elenco` };
  const other = Object.entries(links || {}).find(([pid, l]) => pid !== personId && opKey(l?.inflowwName) === opKey(c.name));
  if (other) return { error: `«${c.name}» è già collegato alla scheda di ${names[other[0]] || "un'altra persona"}` };
  return { value: { inflowwName: c.name, employeeId: c.employeeId } };
}

/**
 * Suggerimento per una scheda non collegata: il nome Infloww che corrisponde a
 * nome e cognome SENZA ambiguità e non è già preso da un'altra scheda. null se
 * non c'è o se è ambiguo (due candidati possibili: non si sceglie a caso).
 */
export function suggestOperator(personName, candidates = [], links = {}) {
  const taken = new Set(Object.values(links || {}).map((l) => opKey(l?.inflowwName)).filter(Boolean));
  const free = candidates.filter((c) => !taken.has(opKey(c.name)));
  const hit = matchName(personName, free.map((c) => c.name));
  return hit ? free.find((c) => c.name === hit) || null : null;
}

/**
 * Membri CreatorsPro di un nome Infloww: quelli abbinati a mano
 * (`cp:member_mapping` membro → nome Infloww) e, se nessuno lo è, quelli il cui
 * nome su CP è uguale (è come li legge chi conta i turni). members: cp:members.
 * → { mapped: [nome CP], sameName: [nome CP] }
 */
export function cpMembersFor(inflowwName, mapping = {}, members = {}) {
  const k = opKey(inflowwName);
  const cpName = (id) => {
    const m = members?.[id];
    return [s(m?.firstName), s(m?.lastName)].filter(Boolean).join(" ") || s(m?.username) || String(id);
  };
  if (!k) return { mapped: [], sameName: [] };
  const mapped = Object.entries(mapping || {}).filter(([, n]) => opKey(n) === k).map(([id]) => cpName(id));
  const mappedIds = new Set(Object.keys(mapping || {}));
  const sameName = mapped.length ? [] : Object.keys(members || {}).filter((id) => !mappedIds.has(id) && opKey(cpName(id)) === k).map(cpName);
  return { mapped, sameName };
}
