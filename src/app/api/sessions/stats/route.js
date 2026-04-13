import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";

export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const operator = searchParams.get("operator");

    if (operator) {
      const stats = (await kv.get(`stats:${operator}`)) || null;
      return Response.json({ stats });
    }

    const sessionIds = (await kv.lrange("sessions:all", 0, -1)) || [];

    const operatorNames = new Set();
    for (const id of sessionIds) {
      const session = await kv.get(`session:${id}`);
      if (session) {
        operatorNames.add(session.operatorName);
      }
    }

    const ranking = [];
    for (const name of operatorNames) {
      const stats = await kv.get(`stats:${name}`);
      if (stats) {
        ranking.push({ operatorName: name, ...stats });
      }
    }

    ranking.sort((a, b) => b.avgOverall - a.avgOverall);

    return Response.json({ ranking });
  } catch (error) {
    console.error("Stats GET error:", error);
    return Response.json({ ranking: [], error: "KV non configurato." }, { status: 200 });
  }
}
