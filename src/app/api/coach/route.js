/**
 * POST /api/coach
 *
 * Live coach: dato una bozza in preparazione dall'operatore + il contesto
 * della session (scenario, creator, stato fan), ritorna feedback in tempo
 * reale per migliorarla prima del send.
 *
 * Modalità (per ottimizzare costi):
 *   - mode: "rich"  → output completo: score + missing_markers + 3 alternative + skill breakdown
 *                     (usato al primo trigger su una bozza nuova)
 *   - mode: "light" → output ridotto: solo score + missing_markers
 *                     (usato per aggiornamenti su bozze già viste, riduce 60-70% dei token)
 *
 * Modello: Haiku 3.5 (latenza ~1-2s, costo basso).
 *
 * Body: { draft, scenarioId?, creatorId?, archetypeId?, fanState?, mode }
 */
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";
import { getCreatorById } from "@/lib/creator-personas";
import { getFanArchetypeById } from "@/lib/fan-archetypes";
import { getBenchmarkPatterns, getBenchmarkLabel } from "@/lib/fan-profiles";

function findScenarioById(scenarioId) {
  if (!scenarioId) return null;
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

    const body = await request.json();
    const draft = (body.draft || "").trim();
    if (!draft) {
      return Response.json({ error: "Bozza vuota." }, { status: 400 });
    }
    if (draft.length > 1000) {
      return Response.json({ error: "Bozza troppo lunga (max 1000 char)." }, { status: 400 });
    }

    const mode = body.mode === "rich" ? "rich" : "light";
    const scenario = findScenarioById(body.scenarioId);
    const creator = body.creatorId ? getCreatorById(body.creatorId) : null;
    const archetype = body.archetypeId ? getFanArchetypeById(body.archetypeId) : null;
    const fanState = body.fanState || null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key Anthropic non configurata sul server." }, { status: 500 });
    }

    // Benchmark stilistico — Terranova per Elisa/Gaja, Spagnuolo default
    const benchmarkKey = creator?.benchmarkOperator || "spagnuolo";
    const patterns = getBenchmarkPatterns(benchmarkKey);
    const benchmarkLabel = getBenchmarkLabel(benchmarkKey);
    const patternsBlock = Object.entries(patterns)
      .map(([k, p]) => `- ${p.name}: ${p.description}`)
      .join("\n");

    const creatorBlock = creator
      ? `\nCreator: ${creator.name} (${creator.archetype}). Tono: ${creator.shortDescription}\n`
      : "";

    const archetypeBlock = archetype
      ? `\nFan archetype: ${archetype.emoji} ${archetype.name} — bisogno: ${archetype.emotional_need}. Strategia: ${archetype.conversion_strategy}. Trappole: ${archetype.avoid}\n`
      : "";

    const stateBlock = fanState
      ? `\nStato emotivo fan attuale (0-10): interesse ${fanState.interest ?? "?"}, fiducia ${fanState.trust ?? "?"}, irritazione ${fanState.irritation ?? "?"}, attaccamento ${fanState.attachment ?? "?"}\n`
      : "";

    const scenarioBlock = scenario
      ? `\nScenario: "${scenario.title}" (difficoltà ${scenario.difficulty}/5). Obiettivo: ${scenario.goalForOperator}\n`
      : "";

    // Schema output diverso tra rich e light
    const outputSchema = mode === "rich"
      ? `{
  "score": <0-100, quanto la bozza è in stile benchmark>,
  "missing_markers": ["<marker mancante 1>", "<marker mancante 2>", ...],
  "alternatives": [
    {"variant": "conservativa", "text": "<bozza riformulata in stile benchmark, tono morbido>"},
    {"variant": "media", "text": "<bozza riformulata in stile benchmark, tono medio>"},
    {"variant": "audace", "text": "<bozza riformulata in stile benchmark, tono spinto>"}
  ],
  "skills": {
    "naturalezza": <0-100>,
    "esclusivita": <0-100>,
    "dipendenza": <0-100>,
    "conversione": <0-100>,
    "tono": <0-100>,
    "gestione_obiezioni": <0-100>
  },
  "tip": "<consiglio in 1 frase su come migliorare>"
}`
      : `{
  "score": <0-100, quanto la bozza è in stile benchmark>,
  "missing_markers": ["<marker mancante 1>", "<marker mancante 2>", ...],
  "tip": "<consiglio in 1 frase su come migliorare>"
}`;

    const systemPrompt = `Sei un coach AI per chat operator di OnlyFans/HOC. Valuti UNA SINGOLA bozza di messaggio (non l'intera conversazione) contro il benchmark stilistico atteso per la creator.
${creatorBlock}${archetypeBlock}${stateBlock}${scenarioBlock}
PATTERN STILISTICI DI RIFERIMENTO (benchmark: ${benchmarkLabel}):
${patternsBlock}

REGOLE DI VALUTAZIONE:
- Score 0-100: quanto la bozza usa concettualmente i pattern del benchmark sopra. Non penalizzare per mancanza di parole singole — valuta uso di concetti.
- Missing markers: 1-3 elementi concreti che mancano nella bozza per essere "in stampo". Esempi: "manca hook narrativo", "tono troppo formale per ${creator?.name || "questa creator"}", "no riferimento personale al fan", "manca cliffhanger".
${mode === "rich" ? '- Alternatives: 3 versioni riformulate della stessa bozza in stile benchmark. Tre tonalità: conservativa (sicura), media (bilanciata), audace (spinta). Ogni versione max 200 char.' : ''}
${mode === "rich" ? '- Skills: valutazione 0-100 sulle 6 dimensioni HOC, tarata per questa SINGOLA bozza.' : ''}
- Tip: 1 consiglio actionable in 1-2 frasi.

REGOLA ETICA: se la bozza propone tecniche di override su vincoli economici dichiarati dal fan (es. fan ha appena detto "non ho soldi" e operatore prova a forzare la vendita), il coach deve segnalare il problema in "missing_markers" o "tip" — non incoraggiarlo.

Rispondi SOLO con JSON valido, niente testo prima/dopo, niente backtick.

OUTPUT SCHEMA (mode: ${mode}):
${outputSchema}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-3-5-20241022",
      max_tokens: mode === "rich" ? 800 : 250,
      system: systemPrompt,
      messages: [{ role: "user", content: `Bozza dell'operatore da valutare:\n\n"${draft}"` }],
    });

    const raw = response.content[0].text;
    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Coach parse error:", e, "raw:", raw);
      return Response.json(
        { error: "Errore nel parsing della risposta del coach.", raw: raw.substring(0, 200) },
        { status: 500 }
      );
    }

    // Sanity defaults
    if (typeof parsed.score !== "number") parsed.score = 50;
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    if (!Array.isArray(parsed.missing_markers)) parsed.missing_markers = [];
    if (mode === "rich") {
      if (!Array.isArray(parsed.alternatives)) parsed.alternatives = [];
      if (!parsed.skills || typeof parsed.skills !== "object") parsed.skills = {};
    }
    parsed.mode = mode;
    parsed.benchmarkOperator = benchmarkKey;

    return Response.json(parsed);
  } catch (error) {
    console.error("Coach API error:", error);
    if (error?.status === 401) {
      return Response.json(
        { error: "API key Anthropic non valida." },
        { status: 500 }
      );
    }
    return Response.json(
      { error: "Errore nel coach. Riprova." },
      { status: 500 }
    );
  }
}
