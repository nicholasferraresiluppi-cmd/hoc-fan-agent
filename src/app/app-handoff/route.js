// App iOS "HOC Pro" (10/10/2026): accesso da Safari e ritorno nell'app già collegati.
// Google non permette il login dentro una WKWebView, quindi l'app apre questa pagina in una
// sessione di Safari (ASWebAuthenticationSession). Se l'utente non è collegato, il middleware lo
// manda al login (anche con Google); poi qui si crea un SIGN-IN TOKEN Clerk monouso a 2 minuti e
// si rimanda a hocpro://auth?ticket=…: l'app lo consuma caricando /sign-in?__clerk_ticket=….
// Il token vale per l'utente GIÀ autenticato in questa sessione: non dà accessi in più. Con
// ASWebAuthenticationSession il ritorno arriva solo alla sessione che l'ha aperta.
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Accesso necessario.", { status: 401 });
  const client = await clerkClient();
  const t = await client.signInTokens.createSignInToken({ userId, expiresInSeconds: 120 });
  return new Response(null, { status: 302, headers: { Location: `hocpro://auth?ticket=${encodeURIComponent(t.token)}`, "Cache-Control": "no-store" } });
}
