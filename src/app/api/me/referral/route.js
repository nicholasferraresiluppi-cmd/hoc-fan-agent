/**
 * /api/me/referral — «Porta un amico», vista di chi ha portato qualcuno.
 * Solo i SUOI dati: il referente si trova dal server (userId già collegato o
 * email verificata dell'account), mai da un parametro del client.
 * Chi non è referente riceve le regole del programma e basta.
 *
 * POST (08/11/2026): il referente carica gli screen delle sue storie. Lo screen
 * della pubblicazione entra «da controllare» finché l'Area Partner non conferma;
 * lo screen dopo 24 ore lo legge l'AI. Le storie si cercano sempre tra le SUE.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { REFERRAL_RULES } from "@/lib/referral-core";
import { findReferrerForUser, referrerDashboard, attachShot } from "@/lib/referral";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lettura AI dello screen dopo 24 ore

async function me() {
  const { userId } = await auth();
  if (!userId) return { userId: null, ref: null, user: null };
  const user = await currentUser().catch(() => null);
  const verifiedEmails = (user?.emailAddresses || [])
    .filter((e) => e?.verification?.status === "verified")
    .map((e) => e.emailAddress);
  const ref = await findReferrerForUser({ userId, verifiedEmails });
  return { userId, ref, user };
}

export async function GET() {
  try {
    const { userId, ref } = await me();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    if (!ref) return Response.json({ linked: false, rules: REFERRAL_RULES });
    return Response.json({ linked: true, ...(await referrerDashboard(ref)) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, ref } = await me();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    if (!ref) return Response.json({ error: "Non risulti tra i referenti: chiedi all'Area Partner." }, { status: 403 });
    const rl = await checkRateLimit("referral_shot", userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const body = await request.json().catch(() => ({}));
    if (body.action !== "attachShot") return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    const out = await attachShot({ storyId: String(body.id || ""), n: body.n, kind: body.kind, data: body.data, contentType: body.contentType, by: { type: "referente", name: ref.name }, referrerId: ref.id });
    const i = out.item;
    return Response.json({ ok: true, item: { n: i.n, publishedAt: i.publishedAt, verified: i.verified, views: i.views, hasPub: Boolean(i.pubShot), hasViews: Boolean(i.viewsShot) } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
