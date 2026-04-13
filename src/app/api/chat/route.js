import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES } from "@/lib/fan-profiles";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";

function findScenarioById(scenarioId) {
  for (const category of TRAINING_SCENARIOS) {
    const found = category.scenarios?.find((s) => s.id === scenarioId);
    if (found) return found;
  }
  return null;
}

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { messages, fanProfileId, scenarioId } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "API key Anthropic non configurata sul server." },
        { status: 500 }
      );
    }

    let systemPrompt;
    if (scenarioId) {
      const scenario = findScenarioById(scenarioId);
      if (!scenario) {
        return Response.json({ error: "Scenario non trovato." }, { status: 400 });
      }
      systemPrompt = `${scenario.systemPromptForFan}

CONTEXT: You are in an OnlyFans DM chat. The operator (managing the creator's account) is messaging you. You respond ONLY as the fan character described above. Never break character. Never reveal you're an AI. Keep replies short and natural like a real DM (usually 1-3 sentences). If the operator offers paid content, simulate buying/refusing based on your character's mood and history. Respond in the same language the operator uses (primarily Italian for Italian fans).`;
    } else if (fanProfileId) {
      const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
      if (!profile) {
        return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
      }
      systemPrompt = `${profile.systemPrompt}

ISTRUZIONI AGGIUNTIVE:
- Sei in una chat di OnlyFans. L'operatore (che gestisce il profilo della creator) ti sta scrivendo.
- Tu rispondi SOLO come il fan. Non uscire MAI dal personaggio.
- Non dire MAI che sei un AI, un bot, o un simulatore.
- Rispondi in modo naturale, come una persona vera su una chat.
- I tuoi messaggi devono sembrare scritti da un ragazzo vero su OF.
- Se l'operatore ti propone un contenuto a pagamento, simula l'acquisto dicendo qualcosa come "ok lo prendo" o "vabbè mandamelo" — non servono link reali.
- Mantieni il tuo personaggio coerente per TUTTA la conversazione.`;
    } else {
      return Response.json(
        { error: "Devi specificare scenarioId o fanProfileId." },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    const claudeMessages = messages.map((msg) => ({
      role: msg.role === "operator" ? "user" : "assistant",
      content: msg.content,
    }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const fanReply = response.content[0].text;

    return Response.json({ reply: fanReply });
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
