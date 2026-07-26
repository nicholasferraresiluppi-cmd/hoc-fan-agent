import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES } from "@/lib/fan-profiles";
import { getCreatorById } from "@/lib/creator-personas";
import { getFanArchetypeById } from "@/lib/fan-archetypes";
import { findScenarioById, generateFanReply } from "@/lib/academy-engine";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { messages, fanProfileId, scenarioId, fanState, creatorId, archetypeId } = await request.json();
    const creator = creatorId ? getCreatorById(creatorId) : null;
    const archetype = archetypeId ? getFanArchetypeById(archetypeId) : null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "API key Anthropic non configurata sul server." },
        { status: 500 }
      );
    }

    let scenario = null;
    let fanProfile = null;
    if (scenarioId) {
      scenario = findScenarioById(scenarioId);
      if (!scenario) {
        return Response.json({ error: "Scenario non trovato." }, { status: 400 });
      }
    } else if (fanProfileId) {
      fanProfile = FAN_PROFILES.find((p) => p.id === fanProfileId);
      if (!fanProfile) {
        return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
      }
    } else {
      return Response.json(
        { error: "Devi specificare scenarioId o fanProfileId." },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });
    const { reply, fanState: newState } = await generateFanReply({
      client,
      scenario,
      fanProfile,
      creator,
      archetype,
      fanState,
      messages,
    });

    return Response.json({ reply, fanState: newState });
  } catch (error) {
    console.error("Chat API error:", error);
    if (error?.status === 401) {
      return Response.json(
        { error: "API key Anthropic non valida. Contatta l'admin." },
        { status: 500 }
      );
    }
    return Response.json(
      { error: "Errore nella generazione della risposta. Riprova." },
      { status: 500 }
    );
  }
}
