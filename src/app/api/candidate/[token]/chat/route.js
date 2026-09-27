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
import {
  getAssessment, canInteract, currentScenarioId,
  getTranscript, saveTranscript, MAX_OPERATOR_TURNS, MAX_MESSAGE_CHARS,
} from "@/lib/candidate-assessments";
import { findScenarioById, generateFanReply } from "@/lib/academy-engine";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

const SEED_CUE =
  "[Inizia la conversazione con il tuo primo messaggio da fan, come descritto nel tuo personaggio.]";

// Il client manda la sua history per comodità, ma il server ne usa SOLO
// l'ultimo messaggio dell'operatore: la conversazione vera è quella salvata
// qui (vedi getTranscript). Il primo turno (history vuota) è lo spunto che fa
// aprire il fan: non entra nel transcript.
export async function POST(request, { params }) {
  const { token } = await params;
  const rec = await getAssessment(token);
  if (!rec) return Response.json({ error: "Link non valido." }, { status: 404 });
  if (!canInteract(rec)) {
    return Response.json({ error: rec.consentAt ? `Assessment ${rec.status}.` : "Prima accetta l'informativa." }, { status: 410 });
  }
  const rl = await checkRateLimit("candidate_chat", token);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body non valido." }, { status: 400 });
  }
  const { scenarioId, messages } = body || {};

  if (scenarioId !== currentScenarioId(rec)) {
    return Response.json({ error: "Scenario fuori sequenza." }, { status: 409 });
  }
  const scenario = findScenarioById(scenarioId);
  if (!scenario) return Response.json({ error: "Scenario non trovato." }, { status: 400 });

  const last = Array.isArray(messages) ? messages[messages.length - 1] : null;
  if (!last || last.role !== "operator" || typeof last.content !== "string" || !last.content.trim()) {
    return Response.json({ error: "Messaggio non valido." }, { status: 400 });
  }
  if (last.content.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: `Messaggio troppo lungo (max ${MAX_MESSAGE_CHARS} caratteri).` }, { status: 400 });
  }

  const tx = await getTranscript(token, scenarioId);
  // Richiesta di apertura = history di 1 messaggio (lo spunto). Se lo scenario
  // è già iniziato (pagina ricaricata) si RIPRENDE la conversazione salvata,
  // senza chiamare il modello e senza aggiungere nulla.
  const openingRequest = messages.length === 1;
  if (openingRequest && tx.messages.length > 0) {
    const lastFan = [...tx.messages].reverse().find((m) => m.role === "fan");
    return Response.json({ reply: lastFan?.content || "", fanState: tx.fanState, transcript: tx.messages, resumed: true });
  }
  const opening = tx.messages.length === 0;
  // stesso tetto che il candidato vede a schermo (scenario.maxMessages)
  if (!opening && tx.operatorTurns >= Math.min(MAX_OPERATOR_TURNS, scenario.maxMessages || 8)) {
    return Response.json({ error: "Hai raggiunto il numero massimo di messaggi per questo scenario: concludi e passa al successivo." }, { status: 429 });
  }
  // lo spunto d'apertura è fisso lato server: il client non sceglie il prompt
  const operatorMsg = { role: "operator", content: opening ? SEED_CUE : last.content.trim() };
  const history = opening ? [operatorMsg] : [...tx.messages, operatorMsg];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Servizio non disponibile." }, { status: 500 });

  try {
    const client = new Anthropic({ apiKey });
    const { reply, fanState: newState } = await generateFanReply({
      client,
      scenario,
      creator: null,
      archetype: null,
      fanState: tx.fanState,
      messages: history,
    });
    const fanMsg = { role: "fan", content: reply };
    await saveTranscript(token, scenarioId, {
      messages: opening ? [fanMsg] : [...history, fanMsg],
      fanState: newState,
      operatorTurns: opening ? 0 : tx.operatorTurns + 1,
    });
    return Response.json({ reply, fanState: newState });
  } catch (error) {
    console.error("Candidate chat error:", error);
    return Response.json({ error: "Errore nella risposta. Riprova." }, { status: 500 });
  }
}
