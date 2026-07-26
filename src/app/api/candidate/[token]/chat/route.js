/**
 * /api/candidate/[token]/chat — un turno del fan simulato per il candidato.
 *
 * Pubblico, self-guarding: valida token attivo + che lo scenario richiesto sia
 * quello ATTESO al passo corrente (niente uso di scenari fuori sequenza).
 * Riusa lo stesso motore degli operatori (generateFanReply). Creator/archetype
 * nulli in V1 (suite creator-agnostica, uguale per tutti = fairness).
 */
export const runtime = "nodejs";
export const maxDuration = 30;

import Anthropic from "@anthropic-ai/sdk";
import { getAssessment, isActionable, currentScenarioId } from "@/lib/candidate-assessments";
import { findScenarioById, generateFanReply } from "@/lib/academy-engine";

export async function POST(request, { params }) {
  const rec = await getAssessment(params?.token);
  if (!rec) return Response.json({ error: "Link non valido." }, { status: 404 });
  if (!isActionable(rec)) return Response.json({ error: `Assessment ${rec.status}.` }, { status: 410 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body non valido." }, { status: 400 });
  }
  const { scenarioId, messages, fanState } = body || {};

  if (scenarioId !== currentScenarioId(rec)) {
    return Response.json({ error: "Scenario fuori sequenza." }, { status: 409 });
  }
  const scenario = findScenarioById(scenarioId);
  if (!scenario) return Response.json({ error: "Scenario non trovato." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Servizio non disponibile." }, { status: 500 });

  try {
    const client = new Anthropic({ apiKey });
    const { reply, fanState: newState } = await generateFanReply({
      client,
      scenario,
      creator: null,
      archetype: null,
      fanState,
      messages,
    });
    return Response.json({ reply, fanState: newState });
  } catch (error) {
    console.error("Candidate chat error:", error);
    return Response.json({ error: "Errore nella risposta. Riprova." }, { status: 500 });
  }
}
