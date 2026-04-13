import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { QUICK_CHALLENGES } from "@/lib/training-scenarios";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { challengeId, operatorResponse } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key non configurata." }, { status: 500 });
    }

    if (!operatorResponse || !operatorResponse.trim()) {
      return Response.json({ error: "Risposta vuota." }, { status: 400 });
    }

    const challenge = (QUICK_CHALLENGES || []).find((c) => c.id === challengeId);
    if (!challenge) {
      return Response.json({ error: "Sfida non trovata." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const hints = (challenge.idealResponseHints || []).map((h) => `- ${h}`).join("\n");
    const systemPrompt = `Sei un coach esperto di operatori chat OnlyFans per House of Creators. Devi valutare UNA singola risposta dell'operatore in un micro-scenario di training (stile flashcard).

SITUAZIONE: ${challenge.situation}

MESSAGGIO DEL FAN: "${challenge.fanMessage}"

HINTS DI RISPOSTA IDEALE:
${hints}

Rispondi SOLO in JSON valido:
{
  "stars": <1-5>,
  "score": <0-100>,
  "good": "<cosa ha fatto bene, 1 frase concreta>",
  "improve": "<cosa può migliorare, 1 frase concreta>",
  "examples": ["<esempio di risposta ottima>", "<altro esempio alternativo>", "<terzo esempio>"]
}

CRITERI:
- 5 stelle: risposta eccellente, naturale, incorpora tecniche avanzate
- 4: buona, con piccoli margini di miglioramento
- 3: accettabile ma generica
- 2: debole, errori comuni (spam-like, troppo aggressiva, impersonale)
- 1: gravi errori (rompe rapport, sembra bot, spinge vendita troppo presto)

Sii onesto. Non inflazionare il punteggio. Cita parole specifiche dalla risposta.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Risposta dell'operatore da valutare:\n"${operatorResponse}"`,
        },
      ],
    });

    const text = response.content[0].text;
    let evaluation;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      evaluation = JSON.parse(cleaned);
    } catch (e) {
      console.error("Quick challenge parse error:", e, "Raw:", text);
      return Response.json({ error: "Errore nel parsing valutazione." }, { status: 500 });
    }

    return Response.json({ evaluation });
  } catch (error) {
    console.error("Quick challenge API error:", error);
    return Response.json({ error: "Errore nella valutazione. Riprova." }, { status: 500 });
  }
}
