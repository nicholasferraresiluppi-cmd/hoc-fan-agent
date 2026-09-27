import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { computeSeniority } from "@/lib/seniority";
import { getUserLeague } from "@/lib/leagues";
import { getUserCertifications } from "@/lib/certifications";
import { emptyProfile } from "@/lib/operator-profile";

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
// POST disattivata (audit set 2026): accettava xp/stelle/skill dal browser
// senza controlli → chiunque poteva gonfiarsi il profilo. Nessuna UI la usa:
// il profilo si aggiorna SOLO lato server in /api/score, insieme al punteggio.
export async function POST() {
  return Response.json({ error: "Il profilo si aggiorna solo completando uno scenario." }, { status: 410 });
}
