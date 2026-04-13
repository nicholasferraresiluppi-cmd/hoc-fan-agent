import Anthropic from "@anthropic-ai/sdk";
import { FAN_PROFILES } from "@/lib/fan-profiles";

export async function POST(request) {
  try {
    const { messages, fanProfileId, apiKey } = await request.json();

    if (!apiKey) {
      return Response.json(
        { error: "API key mancante. Inseriscila nelle impostazioni." },
        { status: 400 }
      );
    }

    const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
    if (!profile) {
      return Response.json(
        { error: "Profilo fan non trovato." },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Costruisci la conversazione per Claude
    // L'operatore parla come "assistant" dal punto di vista del fan (Claude),
    // e il fan (Claude) risponde come "assistant"
    // Invertiamo i ruoli: i messaggi dell'operatore sono "user" per Claude
    const claudeMessages = messages.map((msg) => ({
      role: msg.role === "operator" ? "user" : "assistant",
      content: msg.content,
    }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: `${profile.systemPrompt}

ISTRUZIONI AGGIUNTIVE:
- Sei in una chat di OnlyFans. L'operatore (che gestisce il profilo della creator) ti sta scrivendo.
- Tu rispondi SOLO come il fan. Non uscire MAI dal personaggio.
- Non dire MAI che sei un AI, un bot, o un simulatore.
- Rispondi in modo naturale, come una persona vera su una chat.
- I tuoi messaggi devono sembrare scritti da un ragazzo vero su OF.
- Se l'operatore ti propone un contenuto a pagamento, simula l'acquisto dicendo qualcosa come "ok lo prendo" o "vabbè mandamelo" — non servono link reali.
- Mantieni il tuo personaggio coerente per TUTTA la conversazione.`,
      messages: claudeMessages,
    });

    const fanReply = response.content[0].text;

    return Response.json({ reply: fanReply });
  } catch (error) {
    console.error("Chat API error:", error);

    if (error?.status === 401) {
      return Response.json(
        { error: "API key non valida. Controlla la chiave inserita." },
        { status: 401 }
      );
    }

    return Response.json(
      { error: "Errore nella generazione della risposta. Riprova." },
      { status: 500 }
    );
  }
}
