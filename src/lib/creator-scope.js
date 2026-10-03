// Visibilità per creator (27/09/2026, decisione di Nicholas): ogni membro vede i dati delle SOLE creator
// che gli sono assegnate (all'invito o da Membri); con "tutte" vede la vista generale. Gli admin vedono tutto.
// Chi non ha creator assegnate non vede dati di vendita (default sicuro: niente dati di tutti per sbaglio).
//
// KV `member:creators:{userId}` = { all: true } | { all: false, creators: ["Fishball", …] } (+ updated_at, by)
// Fallback: `publicMetadata.creators` scritto sull'INVITO Clerk (passa all'utente alla registrazione),
// copiato in KV alla prima lettura.
// Una creator = la PERSONA (es. "Fishball"), che copre tutte le sue pagine ("Fishball - IT", "Fishball - EN").
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";
import { viewAsFor } from "@/lib/view-as";

const KEY = (userId) => `member:creators:${userId}`;

/** "Fishball - IT" → "Fishball". */
export const personOf = (alias) => String(alias || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();

export function cleanScope(raw) {
  if (raw?.all === true) return { all: true, creators: [] };
  const list = Array.isArray(raw?.creators) ? raw.creators : [];
  return { all: false, creators: [...new Set(list.map((c) => personOf(String(c).slice(0, 80))).filter(Boolean))].sort() };
}

/** Assegnazione salvata (senza considerare lo stato admin). null = mai assegnata. */
export async function getAssignedCreators(userId) {
  if (!userId) return null;
  const hit = await kv.get(KEY(userId)).catch(() => null);
  if (hit) return cleanScope(hit);
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    const meta = u?.publicMetadata?.creators;
    if (meta) {
      const s = cleanScope(meta === "*" ? { all: true } : { creators: meta });
      await kv.set(KEY(userId), { ...s, updated_at: Date.now(), by: "invito" }).catch(() => {});
      return s;
    }
  } catch { /* Clerk non raggiungibile: nessuna assegnazione */ }
  return null;
}

export async function setAssignedCreators(userId, raw, by) {
  const s = cleanScope(raw);
  await kv.set(KEY(userId), { ...s, updated_at: Date.now(), by: String(by || "").slice(0, 80) });
  return s;
}

/**
 * Cosa può vedere questo utente: { all, creators:Set, source }.
 * Admin → tutto. Altrimenti l'assegnazione; senza assegnazione → nulla.
 */
export async function getCreatorScope(userId) {
  if (await isUserIdAdmin(userId).catch(() => false)) return { all: true, creators: new Set(), source: "admin" };
  // "Vedi come <membro>" (03/10/2026): le creator di QUEL membro, non quelle di chi guarda — prima l'anteprima
  // leggeva l'assegnazione dell'admin (di solito nessuna) e mostrava pagine vuote che il membro non vede.
  const va = await viewAsFor(userId).catch(() => null);
  const a = await getAssignedCreators(va?.target || userId);
  if (!a) return { all: false, creators: new Set(), source: "none" };
  return { all: a.all, creators: new Set(a.creators), source: "assigned" };
}

/** La pagina/alias (o persona) rientra nelle creator visibili? */
export const allowsCreator = (scope, aliasOrPerson) => Boolean(scope?.all || (aliasOrPerson && scope?.creators?.has(personOf(aliasOrPerson))));

/** Riassunto da mandare al client (per dire "stai vedendo 3 creator"). */
export const scopeSummary = (scope) => ({ all: Boolean(scope?.all), creators: scope?.all ? [] : [...(scope?.creators || [])], source: scope?.source || "none" });

/**
 * Autorizzazione per le pagine "di squadra" (classifica vendite, creator, Action/Coaching Center):
 * serve la capability con scope team o all (gli operatori, scope own, restano fuori: hanno /me),
 * poi il filtro per creator. Ritorna az + `creatorScope`.
 */
export async function authorizeScoped(capability) {
  const { authorize } = await import("@/lib/rbac");
  const az = await authorize(capability);
  if (!az.ok) return az;
  if (az.scope !== "all" && az.scope !== "team") return { ok: false, status: 403, message: "Non hai il permesso per questa azione" };
  return { ...az, creatorScope: await getCreatorScope(az.userId) };
}

/** Creator principale (per venduto) di un operatore nella matrice del mese. */
export function principalAlias(matrix, employee) {
  let best = null, top = -1;
  for (const [alias, c] of Object.entries(matrix?.[employee] || {})) if ((c?.sales || 0) > top) { top = c.sales || 0; best = alias; }
  return best;
}

/** Per le azioni (POST): l'operatore è sotto una creator visibile a chi agisce? */
export async function canActOnEmployee(scope, employee, periodId) {
  if (scope?.all) return true;
  const { buildCreatorMatrix } = await import("@/lib/creator-aggregates");
  const { matrix } = await buildCreatorMatrix(periodId);
  return allowsCreator(scope, principalAlias(matrix, employee));
}

/** Mese corrente (UTC) "YYYY-MM": per decidere la creator principale di un operatore. */
export const currentPeriod = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/**
 * Scheda di UN operatore: chi guida una squadra (scope team|all) la apre se l'operatore lavora
 * soprattutto su una creator che vede. Ritorna az (ok/403) — gli operatori per sé stessi passano
 * dal ramo "own" delle singole route.
 */
export async function authorizeEmployee(capability, employee, periodId) {
  const az = await authorizeScoped(capability);
  if (!az.ok) return az;
  if (az.creatorScope.all) return az;
  if (employee && (await canActOnEmployee(az.creatorScope, employee, periodId || currentPeriod()))) return az;
  return { ok: false, status: 403, message: "Questo operatore non lavora sulle creator assegnate a te." };
}

/** Pagine con dati di TUTTA l'agenzia (liste, alert, payout…): serve la vista su tutte le creator. */
export async function authorizeAllCreators(capability) {
  const { authorizeAll } = await import("@/lib/rbac");
  const az = await authorizeAll(capability);
  if (!az.ok) return az;
  const scope = await getCreatorScope(az.userId);
  if (!scope.all) return { ok: false, status: 403, message: "Questa pagina mostra dati di tutte le creator: serve la vista su tutte (Membri → Creator visibili)." };
  return { ...az, creatorScope: scope };
}
