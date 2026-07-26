import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { FAN_PROFILES, getBenchmarkPatterns } from "@/lib/fan-profiles";
import { getCreatorById } from "@/lib/creator-personas";
import { getFanArchetypeById } from "@/lib/fan-archetypes";
import { getDrillForDate, markDrillCompleted, getDrillStatusForUser } from "@/lib/daily-drill";
import { applyScoreToProfile } from "@/lib/operator-profile";
import { findScenarioById, evaluateScenarioTranscript } from "@/lib/academy-engine";
import { recordActivationEvent, EVENT } from "@/lib/activation";
import { kv } from "@vercel/kv";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }

    const { messages, fanProfileId, scenarioId, creatorId, archetypeId } = await request.json();
    const creator = creatorId ? getCreatorById(creatorId) : null;
    const archetype = archetypeId ? getFanArchetypeById(archetypeId) : null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key non configurata sul server." }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    // Scenario-based scoring (new training flow) — motore condiviso con le route candidato.
    if (scenarioId) {
      const scenario = findScenarioById(scenarioId);
      if (!scenario) {
        return Response.json({ error: "Scenario non trovato." }, { status: 400 });
      }

      let score;
      try {
        score = await evaluateScenarioTranscript({ client, scenario, creator, archetype, messages });
      } catch (evalErr) {
        if (evalErr?.code === "SCORE_PARSE") {
          return Response.json({ error: "Errore nel parsing della valutazione." }, { status: 500 });
        }
        throw evalErr;
      }

      // Timestamp condiviso tra score history, transcript e profilo.
      const now = Date.now();

      // Index score history for SM dashboard (non-fatal if KV not configured)
      try {
        const historyKey = `score_hist:${userId}:${now}`;
        const record = {
          userId,
          timestamp: now,
          scenarioId,
          scenarioTitle: scenario.title,
          categoryId: scenario.categoryId || scenario.category,
          creatorId: creatorId || null,
          creatorName: creator?.name || null,
          benchmarkOperator: creator?.benchmarkOperator || "spagnuolo",
          overall: score.overall,
          skills: score.skills,
          stars: score.stars,
          xp: score.xp,
          compliance: score.compliance,
          signals: score.signals || null,
          messageCount: messages.length,
        };
        await kv.set(historyKey, record);
        await kv.zadd("score_hist:index", { score: now, member: historyKey });
        await kv.zadd(`score_hist:user:${userId}`, { score: now, member: historyKey });
      } catch (histErr) {
        console.warn("Score history indexing failed (non-fatal):", histErr?.message);
      }

      // Strumentazione activation (non-fatale): scenario completato → il gap-match
      // (categoryId ∈ categorie del gap) si calcola a read-time nella vista admin.
      try {
        await recordActivationEvent(userId, EVENT.SCENARIO_COMPLETED, {
          scenarioId,
          categoryId: scenario.categoryId || scenario.category || null,
          overall: score.overall,
        });
      } catch (actErr) {
        console.warn("Activation event failed (non-fatal):", actErr?.message);
      }

      // Persist full transcript (session:*) — la review admin/trainer legge già
      // questi record. Servono anche come base per la validazione predittiva
      // (training → vendite vere). TTL 400gg.
      try {
        const sessionId = `${userId}_${now}`;
        const sessionRecord = {
          id: sessionId,
          userId,
          mode: "scenario",
          scenarioId,
          scenarioTitle: scenario.title,
          categoryId: scenario.categoryId || scenario.category,
          creatorId: creatorId || null,
          creatorName: creator?.name || null,
          archetypeId: archetypeId || null,
          fanName: archetype?.name || scenario.fanPersonality?.name || null,
          messages,
          messageCount: messages.length,
          score,
          timestamp: now,
          createdAt: new Date(now).toISOString(),
        };
        await kv.set(`session:${sessionId}`, sessionRecord, { ex: 60 * 60 * 24 * 400 });
        await kv.lpush("sessions:all", sessionId);
        await kv.ltrim("sessions:all", 0, 4999);
      } catch (sessErr) {
        console.warn("Session transcript persist failed (non-fatal):", sessErr?.message);
      }

      // Aggiorna il profilo operatore (XP, livello, medie skill) server-side.
      try {
        await applyScoreToProfile(userId, {
          scenarioId,
          skills: score.skills,
          xp: score.xp,
          stars: score.stars,
        });
      } catch (profErr) {
        console.warn("Profile update failed (non-fatal):", profErr?.message);
      }

      // Daily drill auto-complete: se lo scenario appena completato è il drill del giorno
      try {
        const drill = getDrillForDate();
        if (drill?.scenario?.id === scenarioId) {
          const status = await getDrillStatusForUser(userId);
          if (!status.completed) {
            await markDrillCompleted(userId, { scenarioId, score: score.overall });
          }
        }
      } catch (dErr) {
        console.warn("Daily drill autocomplete failed (non-fatal):", dErr?.message);
      }

      return Response.json({ score });
    }

    // Legacy fan-profile-based scoring
    if (fanProfileId) {
      const profile = FAN_PROFILES.find((p) => p.id === fanProfileId);
      if (!profile) {
        return Response.json({ error: "Profilo fan non trovato." }, { status: 400 });
      }

      const conversationText = messages
        .map((msg) => {
          const role = msg.role === "operator" ? "OPERATORE" : "FAN";
          return `[${role}]: ${msg.content}`;
        })
        .join("\n");

      // Legacy path non ha creator → usa il default Spagnuolo via helper.
      const legacyPatterns = getBenchmarkPatterns("spagnuolo");
      const patternsDescription = Object.entries(legacyPatterns)
        .map(([key, p]) => `- ${p.name}: ${p.description}`)
        .join("\n");

      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 3000,
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

      const scoreText = (response.content.find((b) => b?.type === "text")?.text) || "";
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
