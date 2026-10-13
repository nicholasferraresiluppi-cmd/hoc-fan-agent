// Atterraggio dopo il login: chi gestisce (vede i dati di tutta l'org: admin,
// sales manager, QA) va all'Hub; chi fa i turni (pilota) al suo turno; gli altri all'Academy ("/").
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
  let dest = "/";
  try {
    // ruolo ristretto (es. Social): direttamente sulla sua pagina
    const rx = restrictionFor({ admin: await isUserIdAdmin(userId), roles: await getUserRoles(userId) });
    if (rx) return NextResponse.redirect(new URL(rx.home, request.url));
    const sv = await getScope(userId, CAPABILITIES.SCORES_VIEW);
    if (sv === "all") dest = "/admin";
    // team lead: parte da chi seguire nella sua squadra
    else if (sv === "team") dest = "/admin/settimana";
    // operatrice del pilota: è venuta per il turno o i soldi, non per allenarsi (pannello 27/09)
    else if (await getScope(userId, CAPABILITIES.COPILOT_PILOT)) dest = "/me/turno";
  } catch {
    /* in dubbio, Academy: è la pagina che tutti possono aprire */
  }
  return NextResponse.redirect(new URL(dest, request.url));
}
