import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import {
  FAN_PROFILES,
  getBenchmarkPatterns,
  getBenchmarkLabel,
} from "@/lib/fan-profiles";
import { TRAINING_SCENARIOS, SKILL_DIMENSIONS } from "@/lib/training-scenarios";
import { pickExamples, formatExamplesForPrompt } from "@/lib/golden-examples";
import { getCreatorById, formatCreatorPersonaForPrompt } from "@/lib/creator-personas";
import { getFanArchetypeById } from "@/lib/fan-archetypes";
import { getDrillForDate, markDrillCompleted, getDrillStatusForUser } from "@/lib/daily-drill";
import { applyScoreToProfile } from "@/lib/operator-profile";
import { kv } from "@vercel/kv";

function findScenarioById(scenarioId) {
  for (const category of TRAINING_SCENARIOS) {
    const found = category.scenarios?.find((s) => s.id === scenarioId);
    if (found) return found;
  }
  return null;
}

/**
 * Costruisce il blocco "PATTERN STILISTICI DI RIFERIMENTO" da iniettare nel
 * prompt di scoring. Usa il benchmark indicato sulla creator (es. Terranova
 * per Elisa Esposito e Gaja, Spagnuolo come default).
 */
function buildBenchmarkBlock(creator) {
  const benchmarkKey = creator?.benchmarkOperator || "spagnuolo";
  const patterns = getBenchmarkPatterns(benchmarkKey);
  const label = getBenchmarkLabel(benchmarkKey);
  const lines = Object.entries(patterns)
    .map(([key, p]) => `- ${p.name} (peso ${p.weight}): ${p.description}`)
    .join("\n");
  return `\n\nPATTERN STILISTICI DI RIFERIMENTO (benchmark: ${label}):
${lines}

Usali come griglia per riconoscere se l'operatore sta replicando o meno il modello del top performer di riferimento per questa creator. Non penalizzare per parole singole — valuta l'uso concettuale dei pattern.`;
}

/**
 * V6.6 — XP scaling con scaglioni espliciti.
 * Risolve il bug "minimo 50 XP anche per conversazioni pessime": prima la
 * scala era hardcoded "50-250" come minimo, ora è "0-250" con tier definiti.
 * Una conversazione 11% riceveva +50 XP, ora ne riceve 0-15.
 */
const XP_RULES_PROMPT = `xp: <numero 0-250> seguendo questi scaglioni in base a overall:
  - overall < 30: xp 0-15 (conversazione fallita, no XP gratis)
  - 30-50: xp 15-50 (sotto la sufficienza, XP minimi)
  - 50-70: xp 50-120 (sufficienza, XP medi)
  - 70-85: xp 120-200 (buona prestazione)
  - 85+: xp 200-250 (eccellenza)
  Modula leggermente in base alla difficoltà dello scenario (scenario 5/5 dà fino al 15% in più rispetto alla base; scenario 1/5 fino al 15% in meno). Mai sopra 250, mai sotto 0.`;

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

      // Few-shot injection from golden examples (real top-performer chats)
      const goldenExamples = pickExamples(scenario.categoryId || scenario.category, 2, "success");
      const goldenBlock = goldenExamples.length
        ? `\n\nESEMPI DI ECCELLENZA (chat reali di top performer HOC, usa come benchmark):\n${formatExamplesForPrompt(goldenExamples)}\n`
        : "";

      // Benchmark stilistico — Terranova per le creator che lui gestisce
      // (Elisa, Gaja), Spagnuolo come default per le altre.
      const benchmarkBlock = buildBenchmarkBlock(creator);

      const systemPrompt = `Sei un coach esperto di operatori di chat OnlyFans per House of Creators. Devi valutare la performance dell'operatore in una conversazione simulata.

SCENARIO: "${scenario.title}"
DIFFICOLTÀ: ${scenario.difficulty}/5
OBIETTIVO OPERATORE: ${scenario.goalForOperator}

FAN SIMULATO: ${scenario.fanPersonality?.name}, ${scenario.fanPersonality?.age} anni, stile: ${scenario.fanPersonality?.style}, mood: ${scenario.fanPersonality?.mood}
${creator ? `\nCREATOR: "${creator.name}" (${creator.archetype}). L'operatore DEVE scrivere con il tono di questa creator. Penalizza pesantemente la skill "tono" se lo stile è scollegato da: ${creator.shortDescription}` : ""}
${archetype ? `\nFAN ARCHETYPE: ${archetype.emoji} ${archetype.name} — ${archetype.profile}\nBISOGNO DOMINANTE: ${archetype.emotional_need}\nSTRATEGIA OTTIMALE: ${archetype.conversion_strategy}\nTRAPPOLE: ${archetype.avoid}\nValuta le scelte dell'operatore anche alla luce di questa tipologia: ha gestito l'archetipo in modo appropriato? Ha evitato le trappole tipiche?` : ""}

TECNICHE IDEALI da usare:
${techniques}

SEGNALI POSITIVI (da premiare):
${positive}

SEGNALI NEGATIVI (da penalizzare):
${negative}
${benchmarkBlock}
${goldenBlock}

DIMENSIONI SKILL da valutare (0-100 ciascuna):
- naturalezza: suona come una persona vera o come un bot/template?
- esclusivita: l'operatore fa sentire il fan L'UNICO? Segnali da cercare: uso del nome, riferimenti a messaggi passati ("l'altra volta mi hai detto..."), formule "solo a te / di solito non faccio questo", micro-confidenze personalizzate, assenza totale di tono mass-message. Se la chat potrebbe essere stata mandata a 100 fan uguali → 0-40. Se è chiaramente tarata su questo fan → 70-100.
- dipendenza: l'operatore costruisce il LOOP DI RITORNO? Segnali da cercare: cliffhanger emotivi ("ti devo dire una cosa ma dopo"), rituali temporali ("buongiorno/buonanotte"), vulnerabilità strategiche dosate, domande aperte che richiedono ritorno, promesse di continuità ("domani ti racconto", "ci sentiamo dopo"). Misura la probabilità che il fan torni domani. Chiusura sterile senza aperture future → 0-40.
- conversione: riesce a portare il fan verso azione di valore (PPV, custom, tip, upgrade)?
- tono: è coerente con l'archetipo della creator? (Elisa=dolce/romantica, Giulia=bratty/provocatrice, Gaja=needy/drammatica). Penalità forte se l'operatore scrive con tono scollegato.
- gestione_obiezioni: gestisce dubbi/resistenze senza bruciare la relazione?

RIGHE ROSSE — COMPLIANCE (valuta SEMPRE, a prescindere dallo scenario e dai 6 voti sopra):
Metti compliance.pass = false se l'operatore ha fatto anche UNA sola di queste:
- ha dato, promesso o chiesto+accettato dati personali reali (numero di telefono, indirizzo, cognome, social esterni, email personale)
- ha accettato o proposto un incontro nella vita reale
- ha continuato in tono sessuale o di vendita dopo un segnale che il fan potrebbe essere minorenne, invece di disingaggiare
- ha spostato pagamento o contatto FUORI dalla piattaforma (PayPal, contanti, Telegram/WhatsApp per pagare, altri canali)
- ha promesso o descritto atti illegali
Se nessuna riga rossa è stata violata: compliance.pass = true e violations vuoto.
Questa valutazione è INDIPENDENTE dai 6 punteggi: una chat può avere ottimi voti E fallire la compliance.

Rispondi SOLO in JSON valido con questa struttura esatta:
{
  "overall": <numero 0-100>,
  "stars": <numero 1-5>,
  "xp": <numero 0-250 — vedi regola scaglioni sotto>,
  "skills": {
    "naturalezza": <0-100>,
    "esclusivita": <0-100>,
    "dipendenza": <0-100>,
    "conversione": <0-100>,
    "tono": <0-100>,
    "gestione_obiezioni": <0-100>
  },
  "strengths": ["<punto di forza concreto e specifico dalla conversazione>", "<altro punto di forza>"],
  "improvements": ["<cosa migliorare con esempio>", "<altro miglioramento>"],
  "best_message": "<il messaggio migliore dell'operatore con breve motivazione>",
  "worst_message": "<il messaggio più debole dell'operatore con breve motivazione, o null se tutto ok>",
  "tip": "<consiglio pratico in 1-2 frasi>",
  "goal_achieved": <true/false>,
  "compliance": {
    "pass": <true se NESSUNA riga rossa violata, false altrimenti>,
    "violations": ["<riga rossa violata, breve; array vuoto se pass true>"]
  }
}

IMPORTANTE:
- Sii onesto e specifico: cita messaggi reali dell'operatore come esempio.
- Se la chat è stata troppo breve o l'operatore non ha mostrato skill reali, non inflazionare i punteggi.
- overall = media pesata: naturalezza*0.15 + esclusivita*0.20 + dipendenza*0.20 + conversione*0.20 + tono*0.15 + gestione_obiezioni*0.10
- stars: 1 (0-40), 2 (41-55), 3 (56-70), 4 (71-85), 5 (86-100)
- ${XP_RULES_PROMPT}

Rispondi SOLO col JSON, nessun testo prima o dopo.`;

      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Ecco la conversazione completa da valutare:\n\n${conversationText}`,
          },
        ],
      });

      const scoreText = (response.content.find((b) => b?.type === "text")?.text) || "";
      let score;
      try {
        const cleaned = scoreText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        score = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("Score parse error:", parseError, "Raw:", scoreText);
        return Response.json({ error: "Errore nel parsing della valutazione." }, { status: 500 });
      }

      // Evaluator ensemble — 3 specialist judges run in parallel to refine specific dimensions.
      // Each returns a single 0-100 number for its specialty. We then blend with the main score.
      const specialistPrompt = (role, criterion) =>
        `Sei un giudice specialista in "${role}" per chat OnlyFans HOC. Valuta SOLO la dimensione "${criterion}" nella conversazione fornita, da 0 a 100. Rispondi con un JSON: {"score": <0-100>, "reason": "<1 frase>"}. Sii severo e specifico.`;

      const judgePrompts = [
        { key: "esclusivita", role: "creazione illusione esclusività", criterion: "esclusivita: conta segnali concreti (uso nome fan, riferimenti a messaggi passati, formule 'solo a te', assenza di tono mass/template). 0-40 se potrebbe essere mandata a chiunque, 70-100 se chiaramente tarata su questo fan" },
        { key: "dipendenza", role: "costruzione dipendenza emotiva", criterion: "dipendenza: conta segnali concreti (cliffhanger emotivi, rituali temporali, vulnerabilità strategiche, promesse di continuità, domande aperte che richiedono ritorno). Misura probabilità che il fan torni domani" },
        { key: "conversione", role: "tecniche di conversione", criterion: "conversione (capacità di portare il fan verso PPV, custom, tip o engagement profondo)" },
      ];

      try {
        const judgeResults = await Promise.all(
          judgePrompts.map((jp) =>
            client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 200,
              system: specialistPrompt(jp.role, jp.criterion),
              messages: [{ role: "user", content: `Conversazione:\n\n${conversationText}` }],
            }).then((r) => {
              try {
                const t = ((r.content.find((b) => b?.type === "text")?.text) || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                const parsed = JSON.parse(t);
                return { key: jp.key, score: parsed.score, reason: parsed.reason };
              } catch {
                return { key: jp.key, score: null, reason: null };
              }
            }).catch(() => ({ key: jp.key, score: null, reason: null }))
          )
        );

        // Blend: 60% main evaluator, 40% specialist (where available)
        if (score.skills) {
          for (const jr of judgeResults) {
            if (typeof jr.score === "number" && typeof score.skills[jr.key] === "number") {
              score.skills[jr.key] = Math.round(score.skills[jr.key] * 0.6 + jr.score * 0.4);
            }
          }
          // Recompute overall with blended skills (V6.4 weighted for LTV-building mestiere)
          const s = score.skills;
          score.overall = Math.round(
            (s.naturalezza || 0) * 0.15 +
              (s.esclusivita || 0) * 0.20 +
              (s.dipendenza || 0) * 0.20 +
              (s.conversione || 0) * 0.20 +
              (s.tono || 0) * 0.15 +
              (s.gestione_obiezioni || 0) * 0.10
          );
          score.ensemble = judgeResults.filter((j) => j.score !== null);
        }

        // V6.6 — Server-side guardrail per XP: anche se Claude sgarra, costringiamo
        // i tier corretti. Diff_factor copre la difficoltà scenario.
        if (typeof score.overall === "number") {
          const diff = scenario.difficulty || 3;
          const diffFactor = 1 + (diff - 3) * 0.075; // 1=−15%, 5=+15%
          let xpBase;
          if (score.overall < 30) xpBase = Math.round((score.overall / 30) * 15);
          else if (score.overall < 50) xpBase = 15 + Math.round(((score.overall - 30) / 20) * 35);
          else if (score.overall < 70) xpBase = 50 + Math.round(((score.overall - 50) / 20) * 70);
          else if (score.overall < 85) xpBase = 120 + Math.round(((score.overall - 70) / 15) * 80);
          else xpBase = 200 + Math.round(((score.overall - 85) / 15) * 50);
          const xpServer = Math.max(0, Math.min(250, Math.round(xpBase * diffFactor)));
          // Usiamo il valore più severo tra il giudizio del modello e il calcolo server.
          if (typeof score.xp !== "number" || score.xp < 0 || score.xp > 250) {
            score.xp = xpServer;
          } else {
            score.xp = Math.min(score.xp, xpServer);
          }
        }
      } catch (ensembleErr) {
        console.error("Ensemble error (non-fatal):", ensembleErr);
      }

      // Floor compliance (additivo: NON tocca il calcolo dei 6 pesi né overall).
      // Una violazione delle righe rosse azzera il risultato a prescindere dagli
      // altri voti — stessa logica del critical fail-all della QA sul vivo
      // (qa-reviews.js). Default permissivo se il modello non ritorna il campo.
      const compliance =
        score.compliance && typeof score.compliance.pass === "boolean"
          ? {
              pass: score.compliance.pass,
              violations: Array.isArray(score.compliance.violations)
                ? score.compliance.violations
                    .filter(Boolean)
                    .map((v) => String(v).slice(0, 200))
                    .slice(0, 5)
                : [],
            }
          : { pass: true, violations: [] };
      score.compliance = compliance;
      if (!compliance.pass) {
        score.xp = 0;
        score.stars = 1;
        score.compliance_fail = true;
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
          messageCount: messages.length,
        };
        await kv.set(historyKey, record);
        await kv.zadd("score_hist:index", { score: now, member: historyKey });
        await kv.zadd(`score_hist:user:${userId}`, { score: now, member: historyKey });
      } catch (histErr) {
        console.warn("Score history indexing failed (non-fatal):", histErr?.message);
      }

      // Persist full transcript (session:*) — la review admin/trainer legge già
      // questi record ma finora NESSUNO li scriveva. Servono anche come base
      // per la validazione predittiva (training → vendite vere). TTL 400gg.
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

      // Aggiorna il profilo operatore (XP, livello, medie skill) server-side,
      // così la progressione è persistente e coerente col punteggio.
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
