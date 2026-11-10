/**
 * GET /api/me/publisher — la pagina del publisher su X: SOLO le sue buste.
 * Il publisher si riconosce dal server per email VERIFICATA dell'account, mai da un parametro
 * del client. I fan escono in codice (niente nome, username o id), niente fee, niente altri.
 */
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { viewAsFor } from "@/lib/view-as";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getMyPublisher } from "@/lib/publisher-x";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!bigQueryConfigured()) return Response.json({ error: "Dati non disponibili" }, { status: 503 });
  try {
    // 10/11: con «Vedi come» su un publisher l'admin vede la pagina con i dati di QUELLA persona
    // (prima vedeva i propri e risultava «non collegato»). Solo admin veri, sola lettura: lib/view-as.
    const va = await viewAsFor(userId);
    const me = va?.target
      ? await (await clerkClient()).users.getUser(va.target).catch(() => null)
      : await currentUser().catch(() => null);
    const verifiedEmails = (me?.emailAddresses || []).filter((e) => e?.verification?.status === "verified").map((e) => e.emailAddress);
    return Response.json(await getMyPublisher(verifiedEmails), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}
