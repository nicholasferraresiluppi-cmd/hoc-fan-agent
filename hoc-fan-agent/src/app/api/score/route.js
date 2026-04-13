import Anthropic from "@anthropic-ai/sdk";
import { FAN_PROFILES, ANDREA_PATTERNS, CBS_DIMENSIONS } from "@/lib/fan-profiles";

export async function POST(request) {
  try {
    const { messages, fanProfileId, apiKey } = await request.json();

    if (!apiKey) {
      return Response.json({ error: "API key mancante." }, { status: 400 });
    }

    const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
    if (!profile) {
      return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    // Formatta la conversazione per l'analisi
    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "operator" ? "OPERATORE" : "FAN";
        return `[${role}]: ${msg.content}`;
      })
      .join("\n");

    const patternsDescription = Object.entries(ANDREA_PATTERNS)
      .map(([key, p]) => `- ${p.name}: ${p.description}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `Sei un analista esperto di performance per operatori di chatting su OnlyFans.
Devi valutare la performance di un operatore in una conversazione simulata con un fan.

Il fan simulato era di tipo: "${profile.name}" — ${profile.description}
Difficoltà: ${profile.difficulty}/5

I 5 PATTERN DI VENDITA DI RIFERIMENTO (dal miglior operatore, Andrea Spagnuolo):
${patternsDescription}

SISTEMA DI SCORING C/B/S:
- CLOSER (0-100): Capacità di portare la conversazione alla vendita in modo naturale
- BUILDER (0-100): Capacità di costruire rapporto emotivo e fidelizzare il fan
- SPAMMER (0-100): Tendenza a usare messaggi generici/ripetitivi (punteggio da MINIMIZZARE)

Rispondi SEMPRE in formato JSON valido con questa struttura esatta:
{
  "closer": <numero 0-100>,
  "builder": <numero 0-100>,
  "spammer": <numero 0-100>,
  "overall": <numero 0-100>,
  "profile_label": "<Closer|Builder|Spammer|Hybrid Closer-Builder|Equilibrato>",
  "patterns_used": [
    {"pattern": "<nome pattern>", "used": <true/false>, "effectiveness": "<alta/media/bassa/non usato>", "example": "<messaggio specifico dell'operatore che dimostra l'uso>"}
  ],
  "strengths": ["<punto di forza 1>", "<punto di forza 2>"],
  "weaknesses": ["<punto debole 1>", "<punto debole 2>"],
  "tip": "<consiglio pratico specifico per migliorare, massimo 2 frasi>",
  "sale_achieved": <true/false>,
  "fan_retained": <true/false>
}

CRITERI DI VALUTAZIONE:
- Se l'operatore ha ottenuto una vendita con un fan difficile → Closer alto
- Se l'operatore ha costruito rapporto genuino → Builder alto
- Se l'operatore ha usato messaggi generici o non ha reagito al contesto → Spammer alto
- Overall = media pesata: (Closer × 0.4 + Builder × 0.4 + (100 - Spammer) × 0.2)
- Valuta la DIFFICOLTÀ del fan: ottenere una vendita con il Fan a Rischio Cancellazione vale molto più che con il Fan Affezionato

NOTA: rispondi SOLO con il JSON, nessun testo prima o dopo.`,
      messages: [
        {
          role: "user",
          content: `Ecco la conversazione completa da valutare:\n\n${conversationText}`,
        },
      ],
    });

    const scoreText = response.content[0].text;

    // Prova a parsare il JSON, gestendo eventuali markdown wrapper
    let score;
    try {
      const cleaned = scoreText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      score = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Score parse error:", parseError, "Raw:", scoreText);
      return Response.json(
        { error: "Errore nel parsing della valutazione." },
        { status: 500 }
      );
    }

    return Response.json({ score });
  } catch (error) {
    console.error("Score API error:", error);
    return Response.json(
      { error: "Errore nella valutazione. Riprova." },
      { status: 500 }
    );
  }
}
