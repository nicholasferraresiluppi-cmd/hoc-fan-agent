/**
 * GET /api/me/referral — «Porta un collega», vista di chi ha portato qualcuno.
 * Solo i SUOI dati: il referente si trova dal server (userId già collegato o
 * email verificata dell'account), mai da un parametro del client.
 * Chi non è referente riceve le regole del programma e basta.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { REFERRAL_RULES } from "@/lib/referral-core";
import { findReferrerForUser, referrerDashboard } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
  try {
    const me = await currentUser().catch(() => null);
    const verifiedEmails = (me?.emailAddresses || [])
      .filter((e) => e?.verification?.status === "verified")
      .map((e) => e.emailAddress);
    const ref = await findReferrerForUser({ userId, verifiedEmails });
    if (!ref) return Response.json({ linked: false, rules: REFERRAL_RULES });
    return Response.json({ linked: true, ...(await referrerDashboard(ref)) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
