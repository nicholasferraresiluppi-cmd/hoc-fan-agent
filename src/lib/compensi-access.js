/**
 * Accesso alla Contabilità (15/10/2026, Nicholas): "la vede solo chi ha il ruolo
 * contabilità — neanche gli admin — e quel ruolo lo può dare solo Nicholas".
 *
 * Per questo NON è una capability RBAC: in rbac.js l'admin riceve tutte le
 * capability a scope "all", quindi qualsiasi capability la vedrebbero anche gli
 * admin. Qui l'admin non conta nulla:
 *  - TITOLARI = env HOC_ACCOUNTING_OWNER_IDS (userId Clerk, separati da virgola).
 *    Solo chi può cambiare le variabili su Vercel può diventare titolare. Sono gli
 *    unici che danno e tolgono l'accesso.
 *  - MEMBRI = elenco dato dai titolari, salvato CIFRATO con la chiave della
 *    contabilità (chi può scrivere nel KV non può aggiungersi da solo: senza
 *    chiave non produce un elenco valido).
 *  - "Vedi come…" attivo → niente accesso (l'anteprima serve a guardare l'app con
 *    gli occhi di un altro: non deve aprire una porta che l'altro non ha).
 *  - opzionale HOC_ACCOUNTING_REQUIRE_MFA=1: serve la verifica in due passaggi.
 *  - senza ACCOUNTING_ENCRYPTION_KEY la sezione è chiusa per tutti (fail closed).
 * Ogni lettura e scrittura finisce nel registro cifrato `acct:audit`.
 */
import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { viewAsFor } from "@/lib/view-as";
import { accountingCryptoConfigured, sealJson, openJson } from "@/lib/compensi-crypto";

const P = process.env.ACCOUNTING_KV_PREFIX || "acct"; // vedi compensi.js
const K_MEMBERS = `${P}:access`;
const K_AUDIT = `${P}:audit`;
const AUDIT_CAP = 2000;

export function accountingOwnerIds() {
  return (process.env.HOC_ACCOUNTING_OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
}
export const isAccountingOwner = (userId) => Boolean(userId) && accountingOwnerIds().includes(userId);

export async function listMembers() {
  if (!accountingCryptoConfigured()) return [];
  const raw = await kv.get(K_MEMBERS);
  if (!raw) return [];
  try { return openJson(raw, K_MEMBERS).members || []; } catch { return []; } // manomesso → nessuno
}

async function saveMembers(members) {
  await kv.set(K_MEMBERS, sealJson({ members }, K_MEMBERS));
}

/** Ha accesso? (titolare o membro). Non guarda MAI lo status admin. */
export async function hasAccountingAccess(userId) {
  if (!userId || !accountingCryptoConfigured()) return false;
  if (isAccountingOwner(userId)) return true;
  return (await listMembers()).some((m) => m.userId === userId);
}

async function mfaOk(userId) {
  if (process.env.HOC_ACCOUNTING_REQUIRE_MFA !== "1") return true;
  try {
    const u = await (await clerkClient()).users.getUser(userId);
    return Boolean(u?.twoFactorEnabled);
  } catch { return false; }
}

/**
 * Da chiamare in OGNI route della contabilità.
 * @returns {{ ok: true, userId, owner } | { ok: false, response }}
 */
export async function requireAccounting({ action = "read", ownerOnly = false } = {}) {
  const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) });
  const { userId } = await auth();
  if (!userId) return deny(401, "Sessione scaduta o assente.");
  if (!accountingCryptoConfigured()) return deny(503, "Contabilità non configurata (chiave di cifratura mancante).");
  if (await viewAsFor(userId).catch(() => null)) return deny(403, "Contabilità non disponibile in modalità «Vedi come».");
  const owner = isAccountingOwner(userId);
  if (ownerOnly ? !owner : !(await hasAccountingAccess(userId))) {
    await audit(userId, "accesso negato", { action }).catch(() => {});
    return deny(403, "Non hai accesso alla contabilità.");
  }
  if (!(await mfaOk(userId))) return deny(403, "Per la contabilità serve la verifica in due passaggi sul tuo account.");
  return { ok: true, userId, owner };
}

export async function grantAccess({ targetUserId, by }) {
  if (!/^user_[A-Za-z0-9]+$/.test(targetUserId || "")) throw new Error("userId non valido");
  const members = await listMembers();
  if (members.some((m) => m.userId === targetUserId) || isAccountingOwner(targetUserId)) return members;
  let name = null;
  try {
    const u = await (await clerkClient()).users.getUser(targetUserId);
    name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || null;
  } catch { throw new Error("Utente non trovato"); }
  const next = [...members, { userId: targetUserId, name, grantedAt: Date.now(), grantedBy: by }];
  await saveMembers(next);
  await audit(by, "accesso dato", { to: targetUserId, name });
  return next;
}

export async function revokeAccess({ targetUserId, by }) {
  const members = await listMembers();
  const next = members.filter((m) => m.userId !== targetUserId);
  await saveMembers(next);
  await audit(by, "accesso tolto", { to: targetUserId });
  return next;
}

export async function audit(userId, what, extra = {}) {
  if (!accountingCryptoConfigured()) return;
  await kv.lpush(K_AUDIT, sealJson({ at: Date.now(), userId, what, ...extra }, K_AUDIT));
  await kv.ltrim(K_AUDIT, 0, AUDIT_CAP - 1);
}

export async function readAudit(limit = 200) {
  const raw = (await kv.lrange(K_AUDIT, 0, limit - 1)) || [];
  return raw.map((r) => { try { return openJson(r, K_AUDIT); } catch { return { at: null, what: "voce illeggibile" }; } });
}
