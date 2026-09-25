// Atterraggio dopo il login: chi gestisce (vede i dati di tutta l'org: admin,
// sales manager, QA) va all'Hub, gli operatori all'Academy ("/").
// Usato come fallbackRedirectUrl di <SignIn>/<SignUp> e dal middleware quando
// un utente non loggato apre la radice: un link profondo (es. /admin/sales-coaching)
// resta invece rispettato, perché Clerk usa il redirect_url quando c'è.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getScope, CAPABILITIES } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  let dest = "/";
  try {
    if ((await getScope(userId, CAPABILITIES.SCORES_VIEW)) === "all") dest = "/admin";
  } catch {
    /* in dubbio, Academy: è la pagina che tutti possono aprire */
  }
  return NextResponse.redirect(new URL(dest, request.url));
}
