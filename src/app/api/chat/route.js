import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES } from "@/lib/fan-profiles";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";
import { getCreatorById, formatCreatorPersonaForPrompt } from "@/lib/creator-personas";
import { getFanArchetypeById, formatFanArchetypeForPrompt } from "@/lib/fan-archetypes";

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

    const { messages, fanProfileId, scenarioId, fanState, creatorId, archetypeId } = await request.json();
    const creator = creatorId ? getCreatorById(creatorId) : null;
    const creatorContext = creator ? `\n\n--- CREATOR CONTEXT ---\n${formatCreatorPersonaForPrompt(creator)}\n--- FINE CREATOR CONTEXT ---\n` : "";
    const archetype = archetypeId ? getFanArchetypeById(archetypeId) : null;
    const archetypeContext = archetype ? `\n\n--- FAN ARCHETYPE ---\n${formatFanArchetypeForPrompt(archetype)}\n--- FINE FAN ARCHETYPE ---\n` : "";

    // Fan emotional state: tracks interest/trust/irritation/attachment (0-10) across turns.
    // attachment = quanto il fan sente il gancio emotivo della creator (illusione esclusività + dipendenza).
    const currentState = {
      interest: 5,
      trust: 5,
      irritation: 0,
      attachment: 3,
      ...(fanState || {}),
    };

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
      systemPrompt = `${scenario.systemPromptForFan}${creatorContext}${archetypeContext}

CONTEXT: You are in an OnlyFans DM chat. The operator (managing the creator's account) is messaging you. You respond ONLY as the fan character described above. Never break character. Never reveal you're an AI. Keep replies short and natural like a real DM (usually 1-2 sentences, 30-50 chars). Come fan reale, rispondi con UN SOLO messaggio (raramente 2 se super eccitato/irritato). L'operatore invece può averti mandato più messaggi consecutivi (è normale su OF) — leggili tutti come un unico turno e rispondi nel complesso. If the operator offers paid content, simulate buying/refusing based on your character's mood and history. Respond in the same language the operator uses (primarily Italian for Italian fans).

STATO EMOTIVO ATTUALE (0-10):
- interesse: ${currentState.interest} (più alto = più coinvolto nella chat)
- fiducia: ${currentState.trust} (più alto = più disposto a spendere/aprirsi)
- irritazione: ${currentState.irritation} (più alto = più probabile ghost/risposte brevi/chiusura)
- attaccamento: ${currentState.attachment} (più alto = più difficile staccarsi, più probabile tornare domani. Sale se l'operatore usa il gancio emotivo della creator — esclusività, riferimenti personali, cliffhanger, rituali — scende se tratta il fan come uno qualsiasi / tono mass/template)

Il tuo comportamento deve riflettere questo stato:
- Se irritazione ≥ 7 → risposte fredde, brevi, potresti ghostare.
- Se interesse ≥ 8 e fiducia ≥ 7 → sei molto ricettivo.
- Se attaccamento ≥ 7 → mostri segnali di dipendenza (riferimenti al "solo tu", chiedi quando torna, saluti affettivi). Se attaccamento ≤ 3 → tono distaccato, trattamento transazionale, risposte brevi e generiche.

REGOLA CHIAVE per l'attaccamento: sale quando l'operatore (1) usa il tuo nome o ricorda cose che hai scritto prima, (2) usa formule di esclusività ("solo a te", "di solito non..."), (3) apre cliffhanger emotivi, (4) mostra vulnerabilità strategica, (5) crea rituali ("buongiorno", "prima di dormire"). Scende quando suona template/mass ("ciao amore come stai?" generico), non ti riconosce, è solo transazionale.

Dopo la tua risposta, includi SEMPRE in fondo (su nuova riga) un blocco JSON con lo stato aggiornato in base all'ultimo messaggio dell'operatore:
<STATE>{"interest": <0-10>, "trust": <0-10>, "irritation": <0-10>, "attachment": <0-10>, "note": "<cosa ha causato il cambio, 1 frase>"}</STATE>

Esempio:
"Mmh interessante... dimmi di più 😏
<STATE>{\\"interest\\": 7, \\"trust\\": 6, \\"irritation\\": 1, \\"attachment\\": 5, \\"note\\": \\"ha usato il mio nome e ha fatto riferimento a quello che avevo detto ieri\\"}</STATE>"`;
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

    // Map to Claude format, then merge consecutive same-role messages
    // (operator often sends 2-3 msgs in a row on OnlyFans — 57% of turns per Infloww data)
    const mapped = messages.map((msg) => ({
      role: msg.role === "operator" ? "user" : "assistant",
      content: msg.content,
    }));
    const claudeMessages = [];
    for (const m of mapped) {
      const last = claudeMessages[claudeMessages.length - 1];
      if (last && last.role === m.role) {
        last.content = `${last.content}\n${m.content}`;
      } else {
        claudeMessages.push({ ...m });
      }
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const rawReply = response.content[0].text;

    // Extract optional <STATE>{...}</STATE> block for emotional state tracking
    let fanReply = rawReply;
    let newState = currentState;
    const stateMatch = rawReply.match(/<STATE>([\s\S]*?)<\/STATE>/);
    if (stateMatch) {
      try {
        const parsed = JSON.parse(stateMatch[1].trim());
        newState = {
          interest: Math.max(0, Math.min(10, parsed.interest ?? currentState.interest)),
          trust: Math.max(0, Math.min(10, parsed.trust ?? currentState.trust)),
          irritation: Math.max(0, Math.min(10, parsed.irritation ?? currentState.irritation)),
          attachment: Math.max(0, Math.min(10, parsed.attachment ?? currentState.attachment)),
          note: parsed.note || "",
        };
      } catch (e) {
        // Ignore parse errors; keep existing state
      }
      fanReply = rawReply.replace(/<STATE>[\s\S]*?<\/STATE>/, "").trim();
    }

    return Response.json({ reply: fanReply, fanState: newState });
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
