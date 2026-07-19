import { auth, currentUser } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { rosterMatchForEmail, nameForEmployeeId } from "@/lib/infloww-roster";

/**
 * Risoluzione identità per la superficie operatore (scope own).
 *
 * Invariante di sicurezza (docs/VISIBILITY_POLICY.md): l'identità la risolve
 * SEMPRE il server dall'utente Clerk autenticato — le route /api/me/* non
 * accettano mai un employee dal client. Logica estratta da /api/me/employee
 * (che ora la riusa) così tutte le route own condividono lo stesso resolver.
 */

const USER_EMP_KEY = (userId) => `user_employee:${userId}`;

export function normalizeName(s) {
  return (s || "").toLowerCase().replace(/[\s._-]+/g, "");
}

/** Ultimo periodo mensile con wages CP non vuoti (scan 24 mesi). */
export async function findLatestWagePeriod() {
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const pid = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const wages = await kv.get(`cp:wages:${pid}`);
    if (Array.isArray(wages) && wages.length > 0) return pid;
  }
  return null;
}

/**
 * Risolve l'operatore dell'utente loggato.
 *
 * Ordine (dal 19 lug: ancoraggio all'API Infloww quando disponibile):
 *   1. Override admin — può essere { employeeId, employeeName } (ancora stabile,
 *      scelta dal roster) o una stringa nome (legacy). L'employeeId sopravvive a
 *      refusi/cambi nome; il nome resta la chiave di join col resto dell'app.
 *   2. Email → ROSTER Infloww ufficiale (MASS-filtrato) — nomi autoritativi + id.
 *   3. Email → matrice CP (fallback storico: copre chi è in CP ma non ancora nel
 *      roster, e i casi in cui l'API è giù). Non-bloccante per costruzione.
 *
 * Ritorna sempre `employee` (nome, contratto invariato per le superfici a valle)
 * + `employee_id` quando noto.
 * @returns {Promise<{userId, employee, employee_id?, source?, reason?, candidates?, email?}>}
 */
export async function resolveEmployeeForUser() {
  const { userId } = await auth();
  if (!userId) return { userId: null, employee: null, reason: "unauthenticated" };

  // 1. Override esplicito (gestito da admin)
  const override = await kv.get(USER_EMP_KEY(userId));
  if (override) {
    if (typeof override === "object" && override.employeeName) {
      // Ancora all'employeeId: se il nome nel roster è cambiato, preferisci quello fresco.
      let name = override.employeeName;
      if (override.employeeId) {
        const fresh = await nameForEmployeeId(override.employeeId).catch(() => null);
        if (fresh) name = fresh;
      }
      return { userId, employee: name, employee_id: override.employeeId || null, source: "override" };
    }
    return { userId, employee: String(override), source: "override" };
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || null;
  if (!email) return { userId, employee: null, email: null, reason: "no_email" };

  // 2. Roster Infloww ufficiale (MASS-filtrato). Non-bloccante: se vuoto, si scende al CP.
  try {
    const r = await rosterMatchForEmail(email);
    if (r && r.employeeName) {
      return { userId, employee: r.employeeName, employee_id: r.employeeId, source: `roster_${r.match || "match"}`, email };
    }
    if (r && r.ambiguous) {
      return { userId, employee: null, candidates: r.candidates.map((c) => c.employeeName), email, reason: "ambiguous", source: "roster" };
    }
  } catch {}

  // 3. Fallback: matrice CP (comportamento storico)
  const normLocal = normalizeName(email.split("@")[0] || "");
  const periodId = await findLatestWagePeriod();
  if (!periodId) return { userId, employee: null, email, reason: "no_cp_data" };

  const { operators } = await buildCreatorMatrix(periodId);
  const names = Object.keys(operators || {});

  // SOLO match esatto normalizzato: il matching per prefisso è vietato perché
  // l'identità gate-a dati privati (un prefisso mappava "nicholas.xxx" →
  // operatore "Nicholas"). Chi non matcha esatto va collegato da un admin.
  const exact = names.filter((n) => normalizeName(n) === normLocal);
  if (exact.length === 1) return { userId, employee: exact[0], source: "cp_email_match", email };
  if (exact.length > 1) return { userId, employee: null, candidates: exact, email, reason: "ambiguous" };

  return { userId, employee: null, email, reason: "no_match", period_id: periodId };
}

/**
 * Trova il record di un employee in una lista per nome normalizzato.
 * Ritorna null se non c'è match univoco (mai dati di altri per approssimazione).
 */
export function findOwnRecord(list, employee, nameField) {
  if (!Array.isArray(list) || !employee) return null;
  const target = normalizeName(employee);
  const matches = list.filter((r) => normalizeName(r?.[nameField]) === target);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Risolve il nome ESATTO lato Infloww (ops_kpi) di un employee risolto lato CP:
 * i due sistemi possono differire per case/spazi. Match normalizzato univoco
 * sull'ultimo periodo mensile importato; null se assente o ambiguo.
 */
export async function resolveInflowwName(employee) {
  if (!employee) return null;
  let periods = [];
  try {
    periods = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true })) || [];
  } catch {}
  const latestMonthly = periods.find((m) => String(m).startsWith("monthly:"));
  if (!latestMonthly) return null;
  const pid = String(latestMonthly).slice("monthly:".length);
  let records = [];
  try {
    records = (await kv.get(`ops_kpi:monthly:${pid}`)) || [];
  } catch {}
  const target = normalizeName(employee);
  const names = [...new Set(records.map((r) => r?.employee).filter(Boolean))];
  const matches = names.filter((n) => normalizeName(n) === target);
  return matches.length === 1 ? matches[0] : null;
}
