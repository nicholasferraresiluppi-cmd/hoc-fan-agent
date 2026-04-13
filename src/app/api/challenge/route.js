import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";

// Helper to generate challenge ID
function generateChallengeId() {
  return `challenge:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET — Recupera le sfide pendenti e recenti per l'utente
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const challengeIds = (await kv.lrange(`challenges:${userId}`, 0, -1)) || [];

    const challenges = [];
    for (const id of challengeIds) {
      const challenge = await kv.get(id);
      if (challenge) {
        challenges.push(challenge);
      }
    }

    return Response.json({ challenges });
  } catch (error) {
    console.error("Challenge GET error:", error);
    return Response.json(
      { error: "Errore nel recupero delle sfide." },
      { status: 500 }
    );
  }
}

// POST — Crea o accetta una sfida
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      return handleCreateChallenge(userId, body);
    } else if (action === "accept") {
      return handleAcceptChallenge(userId, body);
    } else {
      return Response.json(
        { error: "Azione non riconosciuta." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Challenge POST error:", error);
    return Response.json(
      { error: "Errore nell'elaborazione della sfida." },
      { status: 500 }
    );
  }
}

async function handleCreateChallenge(userId, body) {
  const { scenarioId, challengerScore, challengerName } = body;

  if (!scenarioId || typeof challengerScore !== "number" || !challengerName) {
    return Response.json(
      {
        error:
          "Dati incompleti. Richiesti: scenarioId, challengerScore, challengerName.",
      },
      { status: 400 }
    );
  }

  const challengeId = generateChallengeId();

  const challenge = {
    id: challengeId,
    createdBy: userId,
    createdByName: challengerName,
    scenarioId,
    challengerScore,
    status: "pending",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    opponentScore: null,
    opponentName: null,
    winner: null,
  };

  // Save challenge
  await kv.set(challengeId, challenge);

  // Add to challenger's challenge list
  await kv.lpush(`challenges:${userId}`, challengeId);

  return Response.json({
    success: true,
    challengeId: challengeId.replace("challenge:", ""),
    shareLink: `/challenge/${challengeId.replace("challenge:", "")}`,
  });
}

async function handleAcceptChallenge(userId, body) {
  const { challengeId, opponentScore, opponentName } = body;

  if (!challengeId || typeof opponentScore !== "number" || !opponentName) {
    return Response.json(
      {
        error:
          "Dati incompleti. Richiesti: challengeId, opponentScore, opponentName.",
      },
      { status: 400 }
    );
  }

  // Fetch the challenge
  const fullChallengeId = challengeId.includes("challenge:")
    ? challengeId
    : `challenge:${challengeId}`;

  const challenge = await kv.get(fullChallengeId);

  if (!challenge) {
    return Response.json({ error: "Sfida non trovata." }, { status: 404 });
  }

  if (challenge.status === "completed") {
    return Response.json(
      { error: "Sfida già completata." },
      { status: 400 }
    );
  }

  // Determine winner
  const winner =
    opponentScore > challenge.challengerScore
      ? "opponent"
      : opponentScore < challenge.challengerScore
        ? "challenger"
        : "tie";

  // Update challenge
  const updatedChallenge = {
    ...challenge,
    status: "completed",
    opponentScore,
    opponentName,
    winner,
    acceptedAt: new Date().toISOString(),
  };

  await kv.set(fullChallengeId, updatedChallenge);

  // Add to opponent's challenge list
  await kv.lpush(`challenges:${userId}`, fullChallengeId);

  // Update both profiles with XP bonus for winner
  const xpBonus = 150;

  if (winner === "challenger") {
    // Update challenger's profile
    const challengerProfile = await kv.get(`profile:${challenge.createdBy}`);
    if (challengerProfile) {
      challengerProfile.xp += xpBonus;
      challengerProfile.level = Math.floor(challengerProfile.xp / 500) + 1;
      challengerProfile.updatedAt = new Date().toISOString();
      await kv.set(`profile:${challenge.createdBy}`, challengerProfile);
    }
  } else if (winner === "opponent") {
    // Update opponent's (current user) profile
    const opponentProfile = await kv.get(`profile:${userId}`);
    if (opponentProfile) {
      opponentProfile.xp += xpBonus;
      opponentProfile.level = Math.floor(opponentProfile.xp / 500) + 1;
      opponentProfile.updatedAt = new Date().toISOString();
      await kv.set(`profile:${userId}`, opponentProfile);
    }
  }

  return Response.json({
    success: true,
    challenge: updatedChallenge,
    winner,
    xpBonusAwarded: winner !== "tie" ? xpBonus : 0,
  });
}
