import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";

// GET — Recupera i top 20 operatori per XP
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    // Retrieve sorted set in descending order (highest XP first)
    const leaderboardData =
      (await kv.zrevrange("leaderboard", 0, 19, { withscores: true })) || [];

    // Transform data from [name, score, name, score...] to objects
    const leaderboard = [];
    for (let i = 0; i < leaderboardData.length; i += 2) {
      const name = leaderboardData[i];
      const xp = parseInt(leaderboardData[i + 1], 10);
      const level = Math.floor(xp / 500) + 1;

      leaderboard.push({
        rank: leaderboard.length + 1,
        name,
        xp,
        level,
      });
    }

    return Response.json({ leaderboard });
  } catch (error) {
    console.error("Leaderboard GET error:", error);
    return Response.json(
      { error: "Errore nel recupero della classifica.", leaderboard: [] },
      { status: 200 }
    );
  }
}

// POST — Aggiorna la voce della classifica
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { name, xp, level } = await request.json();

    if (!name || typeof xp !== "number") {
      return Response.json(
        { error: "Dati incompleti. Richiesti: name, xp." },
        { status: 400 }
      );
    }

    // Validate level calculation
    const calculatedLevel = Math.floor(xp / 500) + 1;
    if (level && level !== calculatedLevel) {
      return Response.json(
        { error: "Livello non corrisponde al calcolo XP." },
        { status: 400 }
      );
    }

    // Update sorted set (higher XP = higher score)
    await kv.zadd("leaderboard", {
      score: xp,
      member: name,
    });

    return Response.json({
      success: true,
      message: "Classifica aggiornata.",
      rank: null, // Will be calculated on GET
    });
  } catch (error) {
    console.error("Leaderboard POST error:", error);
    return Response.json(
      { error: "Errore nell'aggiornamento della classifica." },
      { status: 500 }
    );
  }
}
