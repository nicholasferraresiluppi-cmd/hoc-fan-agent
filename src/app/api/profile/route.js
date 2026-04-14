import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { computeSeniority } from "@/lib/seniority";
import { getUserLeague } from "@/lib/leagues";

// Default profile structure
const defaultProfile = {
  userId: "",
  operatorName: "",
  level: 1,
  xp: 0,
  skillDimensions: {
    naturalezza: { average: 0, count: 0 },
    conversione: { average: 0, count: 0 },
    gestione_obiezioni: { average: 0, count: 0 },
    retention: { average: 0, count: 0 },
    tono: { average: 0, count: 0 },
  },
  recentActivity: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// GET — Recupera il profilo dell'operatore
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const profile = await kv.get(`profile:${userId}`);
    let seniority = null;
    let league = null;
    try {
      seniority = await computeSeniority(userId);
    } catch (e) {
      console.warn("computeSeniority failed:", e?.message);
    }
    try {
      league = await getUserLeague(userId);
    } catch (e) {
      console.warn("getUserLeague failed:", e?.message);
    }

    if (!profile) {
      const newProfile = {
        ...defaultProfile,
        userId,
        seniority,
        league,
      };
      return Response.json(newProfile);
    }

    return Response.json({ ...profile, seniority, league });
  } catch (error) {
    console.error("Profile GET error:", error);
    return Response.json(
      { error: "Errore nel recupero del profilo." },
      { status: 500 }
    );
  }
}

// POST — Aggiorna il profilo dopo il completamento di uno scenario
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { scenarioId, scores, xpEarned, stars } = await request.json();

    // Validation
    if (
      !scenarioId ||
      !scores ||
      typeof xpEarned !== "number" ||
      typeof stars !== "number"
    ) {
      return Response.json(
        {
          error:
            "Dati incompleti. Richiesti: scenarioId, scores, xpEarned, stars.",
        },
        { status: 400 }
      );
    }

    const requiredDimensions = [
      "naturalezza",
      "conversione",
      "gestione_obiezioni",
      "retention",
      "tono",
    ];
    for (const dimension of requiredDimensions) {
      if (typeof scores[dimension] !== "number") {
        return Response.json(
          { error: `Score mancante per la dimensione: ${dimension}` },
          { status: 400 }
        );
      }
    }

    let profile = await kv.get(`profile:${userId}`);

    if (!profile) {
      profile = {
        ...defaultProfile,
        userId,
      };
    }

    // Update skill dimensions with weighted averages (30% new, 70% historical)
    for (const dimension of requiredDimensions) {
      const current = profile.skillDimensions[dimension];
      const newScore = scores[dimension];

      if (current.count === 0) {
        // First score
        current.average = newScore;
        current.count = 1;
      } else {
        // Weighted average: 70% historical, 30% new
        current.average =
          current.average * 0.7 + newScore * 0.3;
        current.count += 1;
      }
    }

    // Update XP and calculate level
    profile.xp += xpEarned;
    profile.level = Math.floor(profile.xp / 500) + 1;

    // Add to recent activity (max 20 items)
    const activity = {
      scenarioId,
      scores,
      xpEarned,
      stars,
      timestamp: new Date().toISOString(),
    };

    profile.recentActivity.unshift(activity);
    if (profile.recentActivity.length > 20) {
      profile.recentActivity = profile.recentActivity.slice(0, 20);
    }

    profile.updatedAt = new Date().toISOString();

    // Save to KV
    await kv.set(`profile:${userId}`, profile);

    return Response.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Profile POST error:", error);
    return Response.json(
      { error: "Errore nell'aggiornamento del profilo." },
      { status: 500 }
    );
  }
}
