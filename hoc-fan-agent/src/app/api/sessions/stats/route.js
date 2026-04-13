import { kv } from "@vercel/kv";

// GET — Recupera stats aggregate (tutti gli operatori o uno specifico)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get("operator");

    if (operator) {
      // Stats di un operatore specifico
      const stats = (await kv.get(`stats:${operator}`)) || null;
      return Response.json({ stats });
    }

    // Ranking di tutti gli operatori
    const sessionIds = (await kv.lrange("sessions:all", 0, -1)) || [];

    // Raccogli tutti gli operatori unici
    const operatorNames = new Set();
    for (const id of sessionIds) {
      const session = await kv.get(`session:${id}`);
      if (session) {
        operatorNames.add(session.operatorName);
      }
    }

    // Recupera stats per ogni operatore
    const ranking = [];
    for (const name of operatorNames) {
      const stats = await kv.get(`stats:${name}`);
      if (stats) {
        ranking.push({ operatorName: name, ...stats });
      }
    }

    // Ordina per overall score (migliore prima)
    ranking.sort((a, b) => b.avgOverall - a.avgOverall);

    return Response.json({ ranking });
  } catch (error) {
    console.error("Stats GET error:", error);
    return Response.json({ ranking: [], error: "KV non configurato." }, { status: 200 });
  }
}
