import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES, ANDREA_PATTERNS } from "@/lib/fan-profiles";
import { TRAINING_SCENARIOS, SKILL_DIMENSIONS } from "@/lib/training-scenarios";

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
      return Response.json({ error: "API key non configurata sul server." }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "operator" ? "OPERATORE" : "FAN";
        return `[${role}]: ${msg.content}`;
      })
      .join("\n");

    // Scenario-based scoring (new training flow)
    if (scenarioId) {
      const scenario = findScenarioById(scenarioId);
      if (!scenario) {
        return Response.json({ error: "Scenario non trovato." }, { status: 400 });
      }

      const positive = (scenario.scoringCriteria?.positiveSignals || []).map((s) => `- ${s}`).join("\n");
      const negative = (scenario.scoringCriteria?.negativeSignals || []).map((s) => `- ${s}`).join("\n");
      const techniques = (scenario.idealTechniques || []).map((t) => `- ${t}`).join("\n");

      const systemPrompt = `Sei un coach esperto di operatori di chat OnlyFans per House of Creators. Devi valutare la performance dell'operatore in una conversazione simulata.

SCENARIO: "${scenario.title}"
DIFFICOLTÀ: ${scenario.difficulty}/5
OBIETTIVO OPERATORE: ${scenario.goalForOperator}

FAN SIMULATO: ${scenario.fanPersonality?.name}, ${scenario.fanPersonality?.age} anni, stile: ${scenario.fanPersonality?.style}, mood: ${scenario.fanPersonality?.mood}

TECNICHE IDEALI da usare:
${techniques}

SEGNALI POSITIVI (da premiare):
${positive}

SEGNALI NEGATIVI (da penalizzare):
${negative}

DIMENSIONI SKILL da valutare (0-100 ciascuna):
- naturalezza: suona come una persona vera o come un bot?
- conversione: riesce a portare il fan verso un'azione di valore (engagement, vendita, fidelizzazione)?
- gestione_obiezioni: come gestisce dubbi/resistenze del fan?
- retention: il fan è più o meno probabile che resti attivo dopo questa chat?
- tono: il tono è coerente con l'identità della creator e con il fan?

Rispondi SOLO in JSON valido con questa struttura esatta:
{
  "overall": <numero 0-100>,
  "stars": <numero 1-5>,
  "xp": <numero 50-250 proporzionale al punteggio e alla difficoltà>,
  "skills": {
    "naturalezza": <0-100>,
    "conversione": <0-100>,
    "gestione_obiezioni": <0-100>,
    "retention": <0-100>,
    "tono": <0-100>
  },
  "strengths": ["<punto di forza concreto e specifico dalla conversazione>", "<altro punto di forza>"],
  "improvements": ["<cosa migliorare con esempio>", "<altro miglioramento>"],
  "best_message": "<il messaggio migliore dell'operatore con breve motivazione>",
  "worst_message": "<il messaggio più debole dell'operatore con breve motivazione, o null se tutto ok>",
  "tip": "<consiglio pratico in 1-2 frasi>",
  "goal_achieved": <true/false>
}

IMPORTANTE:
- Sii onesto e specifico: cita messaggi reali dell'operatore come esempio.
- Se la chat è stata troppo breve o l'operatore non ha mostrato skill reali, non inflazionare i punteggi.
- overall = media pesata: naturalezza*0.25 + conversione*0.25 + gestione_obiezioni*0.15 + retention*0.2 + tono*0.15
- stars: 1 (0-40), 2 (41-55), 3 (56-70), 4 (71-85), 5 (86-100)
- xp: scala in base a overall e difficoltà scenario

Rispondi SOLO col JSON, nessun testo prima o dopo.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Ecco la conversazione completa da valutare:\n\n${conversationText}`,
          },
        ],
      });

      const scoreText = response.content[0].text;
      let score;
      try {
        const cleaned = scoreText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        score = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("Score parse error:", parseError, "Raw:", scoreText);
        return Response.json({ error: "Errore nel parsing della valutazione." }, { status: 500 });
      }

      return Response.json({ score });
    }

    // Legacy fan-profile-based scoring
    if (fanProfileId) {
      const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
      if (!profile) {
        return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
      }

      const patternsDescription = Object.entries(ANDREA_PATTERNS)
        .map(([key, p]) => `- ${p.name}: ${p.description}`)
        .join("\n");

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `Sei un analista esperto di performance per operatori di chatting su OnlyFans.
Valuta la performance in una conversazione simulata con un fan.

Fan: "${profile.name}" — ${profile.description}
Difficoltà: ${profile.difficulty}/5

PATTERN DI RIFERIMENTO:
${patternsDescription}

Rispondi SOLO in JSON valido:
{
  "closer": <0-100>,
  "builder": <0-100>,
  "spammer": <0-100>,
  "overall": <0-100>,
  "profile_label": "<Closer|Builder|Spammer|Hybrid|Equilibrato>",
  "patterns_used": [{"pattern": "<nome>", "used": <true/false>, "effectiveness": "<alta/media/bassa/non usato>", "example": "<msg>"}],
  "strengths": ["<pt1>", "<pt2>"],
  "weaknesses": ["<pt1>", "<pt2>"],
  "tip": "<consiglio>",
  "sale_achieved": <true/false>,
  "fan_retained": <true/false>
}`,
        messages: [{ role: "user", content: `Conversazione:\n\n${conversationText}` }],
      });

      const scoreText = response.content[0].text;
      let score;
      try {
        const cleaned = scoreText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        score = JSON.parse(cleaned);
      } catch (e) {
        return Response.json({ error: "Errore nel parsing." }, { status: 500 });
      }
      return Response.json({ score });
    }

    return Response.json({ error: "Devi specificare scenarioId o fanProfileId." }, { status: 400 });
  } catch (error) {
    console.error("Score API error:", error);
    return Response.json({ error: "Errore nella valutazione. Riprova." }, { status: 500 });
  }
}
