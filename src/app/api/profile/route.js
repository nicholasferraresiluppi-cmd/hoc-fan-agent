import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { computeSeniority } from "@/lib/seniority";
import { getUserLeague } from "@/lib/leagues";
import { getUserCertifications } from "@/lib/certifications";
import { emptyProfile, applyScoreToProfile } from "@/lib/operator-profile";

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
    let certifications = [];
    try {
      certifications = await getUserCertifications(userId);
    } catch (e) {
      console.warn("getUserCertifications failed:", e?.message);
    }

    if (!profile) {
      return Response.json({
        ...emptyProfile(userId),
        seniority,
        league,
        certifications,
      });
    }

    return Response.json({ ...profile, seniority, league, certifications });
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

    // Nota: la persistenza primaria del profilo avviene ora server-side in
    // /api/score (atomica col punteggio). Questa POST resta come endpoint di
    // scrittura diretta e accetta sia il formato nuovo ({skills}) che il
    // vecchio ({scores}); nessuna dimensione obbligatoria (schema evolutivo).
    const body = await request.json();
    const skills = body.skills || body.scores || {};
    const xp =
      typeof body.xp === "number"
        ? body.xp
        : typeof body.xpEarned === "number"
        ? body.xpEarned
        : 0;

    const profile = await applyScoreToProfile(userId, {
      scenarioId: body.scenarioId || null,
      skills,
      xp,
      stars: typeof body.stars === "number" ? body.stars : 0,
    });

    return Response.json({ success: true, profile });
  } catch (error) {
    console.error("Profile POST error:", error);
    return Response.json(
      { error: "Errore nell'aggiornamento del profilo." },
      { status: 500 }
    );
  }
}
