import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES, ANDREA_PATTERNS } from "@/lib/fan-profiles";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { messages, fanProfileId, lastOperatorMessage } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !lastOperatorMessage) {
      return Response.json({ error: "Dati mancanti." }, { status: 400 });
    }

    const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
    if (!profile) {
      return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const recentMessages = messages.slice(-6);
    const conversationContext = recentMessages
      .map((msg) => `[${msg.role === "operator" ? "OPERATORE" : "FAN"}]: ${msg.content}`)
      .join("\n");

    const patternsDescription = Object.entries(ANDREA_PATTERNS)
      .map(([key, p]) => `- ${p.name}: ${p.description}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-3-5-20241022",
      max_tokens: 300,
      system: `Sei un coach esperto di operatori chatting OnlyFans. Valuta SOLO l'ultimo messaggio dell'operatore nel contesto della conversazione.

Fan type: "${profile.name}" (difficoltà ${profile.difficulty}/5)

Pattern di riferimento (Andrea Spagnuolo):
${patternsDescription}

Rispondi SOLO in JSON:
{
  "signal": "green" | "yellow" | "red",
  "score_delta": <numero da -10 a +10>,
  "tip": "<consiglio in massimo 15 parole, in italiano>",
  "pattern_detected": "<nome pattern usato o null>"
}

CRITERI:
- GREEN: messaggio efficace, usa pattern giusti, reazione naturale al contesto
- YELLOW: messaggio ok ma generico, poteva fare di meglio, opportunità persa
- RED: errore tattico (vendita aggressiva, messaggio copia-incolla, ignora il fan, cede troppo)

Rispondi SOLO col JSON.`,
      messages: [
        {
          role: "user",
          content: `Contesto conversazione:\n${conversationContext}\n\nUltimo messaggio operatore da valutare:\n"${lastOperatorMessage}"`,
        },
      ],
    });

    const feedbackText = response.content[0].text;

    let feedback;
    try {
      const cleaned = feedbackText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      feedback = JSON.parse(cleaned);
    } catch (parseError) {
      feedback = { signal: "yellow", score_delta: 0, tip: "Continua così", pattern_detected: null };
    }

    return Response.json({ feedback });
  } catch (error) {
    console.error("Feedback API error:", error);
    return Response.json(
      { feedback: { signal: "yellow", score_delta: 0, tip: "Continua così", pattern_detected: null } },
      { status: 200 }
    );
  }
}
