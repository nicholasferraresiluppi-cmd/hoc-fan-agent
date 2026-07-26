// Carte-lezione Academy — lettura operatore. Auth-only by design (materiale
// didattico, come playbook e game tape): contenuti curati e pseudonimizzati,
// nessun dato di compenso/score. Servite via API e mai importate in client
// component: i chunk statici Next sono pubblici, questa route è il gate.

export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { listLessonCards, getLessonCard } from "@/lib/lesson-cards";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const card = getLessonCard(id);
    if (!card) return Response.json({ error: "Lezione non trovata." }, { status: 404 });
    return Response.json({ card });
  }
  return Response.json({ cards: listLessonCards() });
}
