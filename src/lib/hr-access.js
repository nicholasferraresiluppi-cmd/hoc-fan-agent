// Uscita collegata all'accesso (03/10/2026, prova d'uso HR: "segno l'uscita e la persona continua ad
// avere accesso all'app"). Dalle email della scheda HR trova l'account HOC Pro (Clerk) e il suo team.
// Solo lettura: non sospende niente da solo — l'accesso si toglie da Membri e ruoli, con una persona che decide.
import { clerkClient } from "@clerk/nextjs/server";
import { getUserTeam } from "@/lib/rbac";

const emailsOf = (fields) => [fields?.companyEmail, fields?.personalEmail]
  .flat().filter(Boolean).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@"));

/** [{ userId, name, email, banned, team }] degli account HOC Pro con le email della persona. */
export async function accessForPerson(fields) {
  const emails = [...new Set(emailsOf(fields))];
  if (!emails.length) return { emails, members: [] };
  const cc = await clerkClient();
  const res = await cc.users.getUserList({ emailAddress: emails, limit: 10 });
  const users = Array.isArray(res) ? res : res?.data || [];
  const members = await Promise.all(users.map(async (u) => ({
    userId: u.id,
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || null,
    email: u.emailAddresses?.find((e) => emails.includes(e.emailAddress.toLowerCase()))?.emailAddress || u.emailAddresses?.[0]?.emailAddress || null,
    banned: Boolean(u.banned),
    team: await getUserTeam(u.id).catch(() => null),
  })));
  return { emails, members };
}
