/**
 * /api/candidate/[token]/score — valuta UNO scenario e avanza il progresso.
 *
 * Pubblico, self-guarding. Riusa evaluateScenarioTranscript (stesso motore degli
 * operatori) ma persiste SOLO nel namespace candidate:* (mai score_hist/session/
 * profilo/leghe). Al candidato NON torna lo score — solo se è finito e qual è lo
 * scenario successivo: il report è per HR, non per il candidato (evita gaming e
 * tiene la valutazione fuori dalla sua vista).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import {
  getAssessment,
  canInteract,
  currentScenarioId,
  recordScenarioResult,
  getTranscript,
} from "@/lib/candidate-assessments";
import { findScenarioById, evaluateScenarioTranscript } from "@/lib/academy-engine";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export async function POST(request, { params }) {
  const { token } = await params;
  const rec = await getAssessment(token);
  if (!rec) return Response.json({ error: "Link non valido." }, { status: 404 });
  if (!canInteract(rec)) {
    return Response.json({ error: rec.consentAt ? `Assessment ${rec.status}.` : "Prima accetta l'informativa." }, { status: 410 });
  }
  const rl = await checkRateLimit("candidate_eval", token);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body non valido." }, { status: 400 });
  }
  const { scenarioId } = body || {};

  if (scenarioId !== currentScenarioId(rec)) {
    return Response.json({ error: "Scenario fuori sequenza." }, { status: 409 });
  }
  const scenario = findScenarioById(scenarioId);
  if (!scenario) return Response.json({ error: "Scenario non trovato." }, { status: 400 });

  // Si valuta SOLO la conversazione salvata dal server, mai quella mandata dal
  // browser (che il candidato potrebbe riscrivere).
  const { messages } = await getTranscript(token, scenarioId);
  if (!messages.some((m) => m.role === "operator")) {
    return Response.json({ error: "Scrivi almeno un messaggio prima di concludere." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Servizio non disponibile." }, { status: 500 });

  let score;
  try {
    const client = new Anthropic({ apiKey });
    score = await evaluateScenarioTranscript({ client, scenario, creator: null, archetype: null, messages });
  } catch (error) {
    console.error("Candidate score error:", error);
    return Response.json({ error: "Errore nella valutazione. Riprova." }, { status: 500 });
  }

  const result = await recordScenarioResult(token, {
    scenarioId,
    scenarioTitle: scenario.title,
    score,
    messageCount: messages.length,
  });
  if (!result.ok) {
    return Response.json({ error: result.error || "Errore." }, { status: result.status || 500 });
  }

  const a = result.assessment;
  return Response.json({
    ok: true,
    done: result.done,
    progress: { index: a.progress.index, total: a.scenarioIds.length },
    nextScenarioId: currentScenarioId(a),
  });
}
