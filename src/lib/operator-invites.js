// "Porta gli operatori nell'app" (25/09/2026): inviti in blocco agli operatori
// attivi + collegamento automatico account ↔ nome operatore al primo accesso.
//
// Perché: le pagine personali (/me/*) erano pronte ma quasi nessun operatore
// aveva un account; e il collegamento via email (resolver) vale solo sui domini
// aziendali, mentre gli operatori usano email personali (gmail…).
//
// Sicurezza del collegamento: all'invito si registra `invite_employee:{email}`
// → nome operatore. Al primo accesso, se l'email PRIMARIA VERIFICATA dell'utente
// è quella invitata, si scrive l'override `user_employee:{userId}` (lo stesso
// che imposta un admin a mano). La prova di possesso dell'email la dà Clerk
// (il link d'invito arriva solo a quella casella). Mai dal client.
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";
import { listAvailablePeriods } from "@/lib/leaderboard-history";
import { createInvitation, listInvitations } from "@/lib/invitations";

export const INVITE_EMP_KEY = (email) => `invite_employee:${String(email || "").trim().toLowerCase()}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Operatori dell'ultimo mese Infloww importato, con email, esclusi i dismessi e i MASS. */
async function latestOperators() {
  const periods = (await listAvailablePeriods("monthly")) || [];
  for (const pid of periods.slice(0, 2)) {
    const recs = (await kv.get(`ops_kpi:monthly:${pid}`)) || [];
    if (!recs.length) continue;
    const byName = new Map();
    for (const r of recs) {
      if (r.is_mass || !r.employee) continue;
      if (/dismess/i.test(r.group || "")) continue;
      const email = String(r.email || "").trim().toLowerCase();
      const cur = byName.get(r.employee) || { employee: r.employee, email: null, sales: 0 };
      if (EMAIL_RE.test(email)) cur.email = cur.email || email;
      cur.sales += Number(r.sales) || 0;
      byName.set(r.employee, cur);
    }
    return { period_id: pid, operators: [...byName.values()] };
  }
  return { period_id: null, operators: [] };
}

/** Elenco con stato: account già attivo / invito in attesa / pronto / senza email. */
export async function listInvitableOperators() {
  const { period_id, operators } = await latestOperators();
  const emails = operators.map((o) => o.email).filter(Boolean);
  const cc = await clerkClient();
  const withAccount = new Set();
  for (let i = 0; i < emails.length; i += 100) {
    const res = await cc.users.getUserList({ emailAddress: emails.slice(i, i + 100), limit: 100 });
    for (const u of (Array.isArray(res) ? res : res?.data || [])) for (const e of u.emailAddresses || []) withAccount.add(String(e.emailAddress).toLowerCase());
  }
  const { pending } = await listInvitations().catch(() => ({ pending: [] }));
  const invited = new Set((pending || []).map((p) => String(p.email).toLowerCase()));
  const rows = operators.map((o) => ({
    ...o,
    status: !o.email ? "no_email" : withAccount.has(o.email) ? "has_account" : invited.has(o.email) ? "invited" : "ready",
  })).sort((a, b) => b.sales - a.sales);
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { period_id, total: rows.length, counts: { ready: count("ready"), invited: count("invited"), has_account: count("has_account"), no_email: count("no_email") }, operators: rows };
}

/** Invita gli operatori scelti (per email) come "operatore" e registra il collegamento. */
export async function inviteOperators({ emails, inviterId, inviterName, origin }) {
  const { operators } = await latestOperators();
  const byEmail = new Map(operators.filter((o) => o.email).map((o) => [o.email, o]));
  const results = [];
  for (const raw of (emails || []).slice(0, 60)) {
    const email = String(raw || "").trim().toLowerCase();
    const op = byEmail.get(email);
    if (!op) { results.push({ email, ok: false, error: "non è tra gli operatori dell'ultimo mese" }); continue; }
    try {
      await kv.set(INVITE_EMP_KEY(email), { employeeName: op.employee, invited_at: Date.now(), by: inviterId });
      await createInvitation({ email, roles: ["operator"], inviterId, inviterName, origin });
      results.push({ email, employee: op.employee, ok: true });
    } catch (e) {
      results.push({ email, employee: op.employee, ok: false, error: e?.errors?.[0]?.message || e.message || "errore" });
    }
  }
  return results;
}
