/**
 * POST /api/score-help
 *
 * Q&A interattivo sulla logica dello score CP v3. Pensato per essere
 * usato dalla pagina /welcome/score-friendly tramite il componente
 * <InlineQA>. Riceve una domanda libera dell'utente + l'identificativo
 * della sezione del tutorial in cui si trova, e ritorna una risposta
 * breve in italiano corporate.
 *
 * Body: { question: string, section?: string }
 * Response: { answer: string }
 *
 * Auth: utente loggato (qualsiasi capability).
 * Modello: Claude Haiku 4.5 (latenza bassa, costo basso, qualità ok per
 * spiegazioni didattiche di 100-200 parole).
 */
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 600;

// Conoscenza completa della logica score CP v3 — context riusato per ogni
// risposta. Mantiene il modello on-topic ed evita allucinazioni.
const SCORE_SYSTEM_PROMPT = `Sei l'assistente Score Helper di HOC Pro. Rispondi a domande di colleghi in House of Creators (agenzia OnlyFans) che stanno imparando come funziona lo Score Sales CP v3.

REGOLE DI RISPOSTA:
- Italiano professionale, registro corporate. Niente slang. Niente "fa schifo", "rotto", "schifoso". Usa: "performance basse", "rendimento contenuto", "andamento inferiore alle attese".
- Risposta breve: max 150-200 parole. Vai dritto al punto.
- Concreta: se la domanda lo permette, fai un esempio numerico (operatore X, creator Y, $Z).
- Se la domanda è ambigua o fuori scope (es. domande non sullo score), chiedi cortesemente di riformularla o invita a contattare il team.
- Non inventare numeri o pesi diversi dal sistema reale. Se non sai, dillo.
- Niente bullet eccessivi (max 3-4 punti). Preferisci paragrafi brevi.

CONOSCENZA DELLO SCORE (sistema reale):

DOMANDA CHE LO SCORE RISPONDE: "L'operatore è bravo, considerando dove lavora?"

STEP 1 — Per ogni coppia (operatore × creator) calcolo 2 KPI:
1. sales/shift: $ totali venduti / numero turni su quella creator
2. consistency: 1 − (deviazione standard / media) sui sales dei singoli turni. Valore 0-1, dove 1 = perfettamente costante (orologio svizzero), 0 = molto altalenante.

STEP 2 — Trasformo sales/shift in 2 percentili:
- percentile_vs_creator: posizione tra TUTTI gli operatori che lavorano sulla stessa creator
- percentile_vs_agency: posizione tra TUTTI gli operatori dell'agenzia nel mese
Un percentile è una posizione in classifica 0-100. Esempio: 90 = sei meglio del 90% degli altri.

STEP 3 — Blend dei due percentili:
SPS_blended = 0.7 × percentile_vs_creator + 0.3 × percentile_vs_agency
Il 70/30 serve a evitare di promuovere come "Elite" un operatore che è solo "meno peggio" su un team debole, dando ancora priorità al confronto coi pari diretti.

STEP 4 — Score finale per coppia:
score(op, creator) = 0.85 × SPS_blended + 0.15 × (consistency × 100)
85% sales, 15% consistency. Le ore extra NON entrano.

STEP 5 — Minimo 3 shift sulla creator per essere valutati. Sotto → score = "—" (campione troppo piccolo).

STEP 6 — TIER assegnato dallo score finale:
- ≥90 ELITE (top 10%)
- ≥75 STRONG (top 25%)
- ≥50 GOOD (top 50%)
- ≥25 AVERAGE (top 75%)
- ≥10 WEAK (top 90%)
- <10 CRITICAL (bottom 10%)

STEP 7 — Score AGGREGATO operatore (quello che si vede in pagina Sales CP) =
media pesata su sales dei suoi score per ogni creator:
score_op = Σ (score_op_creator × sales_op_creator) / sales_totali_op
Le creator dove l'operatore vende di più contano di più.

FILOSOFIA: non puoi essere Elite a Sales CP se sei mediocre sulle creator dove generi la maggior parte del fatturato.
`;

let anthropicClient = null;
function getClient() {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurato");
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const question = String(body?.question || "").trim();
  const section = String(body?.section || "").trim();
  if (!question) return Response.json({ error: "question richiesta" }, { status: 400 });
  if (question.length > 500) return Response.json({ error: "Domanda troppo lunga (max 500 caratteri)" }, { status: 400 });

  const contextHint = section ? `\n\nL'utente sta leggendo la sezione: "${section}". Tieni in considerazione il contesto.` : "";

  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SCORE_SYSTEM_PROMPT + contextHint,
      messages: [{ role: "user", content: question }],
    });
    const answer = (resp.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!answer) return Response.json({ error: "Risposta vuota dal modello, riprova" }, { status: 502 });
    return Response.json({
      answer,
      _meta: {
        model: MODEL,
        input_tokens: resp.usage?.input_tokens,
        output_tokens: resp.usage?.output_tokens,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[score-help] error", e?.message || e);
    return Response.json({ error: `Errore AI: ${e?.message || e}` }, { status: 500 });
  }
}
