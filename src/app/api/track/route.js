// Registra l'apertura di una pagina (chiamata da AppShell a ogni cambio pagina).
// Solo utenti loggati; nessun contenuto, solo (persona, pagina, giorno).
import { auth } from "@clerk/nextjs/server";
import { recordView, recordEvents } from "@/lib/usage";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 204 });
  let body = null;
  try { body = JSON.parse(await request.text()); } catch {}
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : null;
  if (path) await recordView(userId, path).catch(() => {});
  if (Array.isArray(body?.events)) await recordEvents(body.events).catch(() => {});
  return new Response(null, { status: 204 });
}
