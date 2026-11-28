// Atterraggio dopo il login: chi gestisce (vede i dati di tutta l'org: admin,
// sales manager, QA) va all'Hub; chi fa i turni (pilota) al suo turno; gli altri ai loro score.
// 28/11/2026: Academy ("/") e Da seguire sono pagine nascoste (lib/hidden-pages) → non si atterra più lì.
// Usato come fallbackRedirectUrl di <SignIn>/<SignUp> e dal middleware quando
// un utente non loggato apre la radice: un link profondo (es. /admin/sales-coaching)
// resta invece rispettato, perché Clerk usa il redirect_url quando c'è.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getScope, getUserRoles, CAPABILITIES } from "@/lib/rbac";
import { isUserIdAdmin } from "@/lib/admin";
import { restrictionFor } from "@/lib/restricted-roles";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  let dest = "/me/score";
  try {
    // ruolo ristretto (es. Social): direttamente sulla sua pagina
    const rx = restrictionFor({ admin: await isUserIdAdmin(userId), roles: await getUserRoles(userId) });
    if (rx) return NextResponse.redirect(new URL(rx.home, request.url));
    const sv = await getScope(userId, CAPABILITIES.SCORES_VIEW);
    if (sv === "all") dest = "/admin";
    // team lead: parte dal bilancio delle sue creator (Da seguire è nascosta)
    else if (sv === "team") dest = "/admin/bilancio";
    // operatrice del pilota: è venuta per il turno o i soldi, non per allenarsi (pannello 27/09)
    else if (await getScope(userId, CAPABILITIES.COPILOT_PILOT)) dest = "/me/turno";
  } catch {
    /* in dubbio, i propri score: è la pagina che tutti possono aprire */
  }
  return NextResponse.redirect(new URL(dest, request.url));
}
