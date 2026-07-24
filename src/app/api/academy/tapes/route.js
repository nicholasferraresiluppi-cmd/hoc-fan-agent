// Game tape Academy — lettura operatore: SOLO tape pubblicati, fan pseudonimizzato,
// user_id strippato. Auth-only by design (materiale didattico, come il playbook):
// gli importi mostrati sono le singole vendite esemplari scelte in curatela, non
// dati di compenso/score di operatori.

export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { listTapes, stripTape } from "@/lib/academy-tapes";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
  const tapes = await listTapes({ publishedOnly: true, limit: 60 });
  return Response.json({ tapes: tapes.map(stripTape) });
}
