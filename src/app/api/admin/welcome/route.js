// Attestato di benvenuto: modello modificabile + prova d'invio a sé stessi.
// Stesso permesso degli inviti (USERS_INVITE): chi invita decide cosa arriva.
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES, auditAccess } from "@/lib/rbac";
import { DEFAULT_WELCOME, composeWelcome, welcomeVars, welcomeEmailHtml, welcomeEmailText } from "@/lib/welcome-card";
import { getWelcomeTemplate, saveWelcomeTemplate, resetWelcomeTemplate, mailStatus, sendMail } from "@/lib/welcome-store";
import { internalOrigin } from "@/lib/cron-chain";

export async function GET() {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const t = await getWelcomeTemplate();
  const m = mailStatus();
  return Response.json({ ...t, default: DEFAULT_WELCOME, mail: { ready: m.ready, reason: m.reason } });
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const me = await currentUser().catch(() => null);
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || null;
  const template = body?.reset ? await resetWelcomeTemplate() : await saveWelcomeTemplate(body?.template || {}, { userId: az.userId, name });
  await auditAccess(az.userId, body?.reset ? "welcome_template_reset" : "welcome_template_save", {});
  return Response.json({ ok: true, template });
}

// Prova: l'attestato arriva alla casella di chi è loggato (mai a terzi da qui)
export async function POST(request) {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const me = await currentUser().catch(() => null);
  const primary = me?.emailAddresses?.find((e) => e.id === me.primaryEmailAddressId);
  if (!primary?.emailAddress) return Response.json({ error: "Il tuo account non ha un'email principale" }, { status: 400 });
  const { template } = body?.template ? { template: body.template } : await getWelcomeTemplate();
  const card = composeWelcome(template, welcomeVars({ employee: body?.sample || "Mario Rossi", creator: "Creator di esempio", number: 1 }));
  try {
    await sendMail({ to: primary.emailAddress, subject: `[Prova] ${card.subject}`, html: welcomeEmailHtml(card, `${internalOrigin(request)}/`), text: welcomeEmailText(card, `${internalOrigin(request)}/`) });
    return Response.json({ ok: true, to: primary.emailAddress });
  } catch (e) {
    return Response.json({ error: `Email di prova non partita: ${e.message}` }, { status: 502 });
  }
}
