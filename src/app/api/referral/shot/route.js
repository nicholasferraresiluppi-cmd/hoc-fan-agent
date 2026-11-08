/**
 * GET /api/referral/shot?id=<storia>&n=<1|2>&kind=<pub|views> — uno screen delle storie
 * di «Porta un amico» (08/11/2026). I file sono PRIVATI su Vercel Blob: si vedono solo
 * da qui. Li vede l'Area Partner (referral.manage) o il referente che le ha pubblicate.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readShot, findReferrerForUser } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return new Response("Non autenticato", { status: 401 });
  const u = new URL(request.url);
  const kind = u.searchParams.get("kind") === "views" ? "views" : "pub";
  const shot = await readShot({ storyId: String(u.searchParams.get("id") || ""), n: u.searchParams.get("n"), kind }).catch(() => null);
  if (!shot) return new Response("Screen non trovato", { status: 404 });
  const az = await authorize(CAPABILITIES.REFERRAL_MANAGE);
  if (!az.ok) {
    const me = await currentUser().catch(() => null);
    const emails = (me?.emailAddresses || []).filter((e) => e?.verification?.status === "verified").map((e) => e.emailAddress);
    const ref = await findReferrerForUser({ userId, verifiedEmails: emails });
    if (!ref || ref.id !== shot.referrerId) return new Response("Screen non trovato", { status: 404 });
  }
  return new Response(shot.bytes, { headers: { "Content-Type": shot.contentType, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
}
