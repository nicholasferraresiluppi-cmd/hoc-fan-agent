// Attestato di benvenuto al primo accesso: lo legge solo il diretto interessato.
// Scritto quando l'account si collega all'invito operatore (lib/me).
import { auth } from "@clerk/nextjs/server";
import { composeWelcome, welcomeVars } from "@/lib/welcome-card";
import { getWelcomeTemplate, getPendingWelcome, clearPendingWelcome } from "@/lib/welcome-store";
import { isPreviewing } from "@/lib/view-as";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato" }, { status: 401 });
  if (await isPreviewing().catch(() => false)) return Response.json({ card: null });
  const pending = await getPendingWelcome(userId);
  if (!pending) return Response.json({ card: null });
  const { template } = await getWelcomeTemplate();
  const date = pending.invited_at ? new Date(pending.invited_at) : new Date();
  return Response.json({ card: composeWelcome(template, welcomeVars({ employee: pending.employee, creator: pending.creator, number: pending.number, date })) });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato" }, { status: 401 });
  if (await isPreviewing().catch(() => false)) return Response.json({ ok: true });
  await clearPendingWelcome(userId);
  return Response.json({ ok: true });
}
