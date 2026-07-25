/**
 * Academy · Engine condiviso del simulatore.
 *
 * Estrae la logica PURA (nessuna auth, nessuna persistenza) di generazione
 * della risposta-fan e di produzione dello `score` da /api/chat e /api/score,
 * così che le route OPERATORE (Clerk) e le route CANDIDATO (assessment
 * pre-hire, token pubblico) usino ESATTAMENTE lo stesso motore.
 *
 * Perché condiviso e non duplicato: lo scoring è governato/versionato (snapshot
 * a ogni import, drift detection) — due copie divergerebbero e falserebbero il
 * confronto operatore↔candidato che è il senso stesso dell'assessment. Una sola
 * fonte di verità (decision log 2026-07-18 governance formula score).
 *
 * Contratto: le route risolvono scenario/creator/archetype (findScenarioById,
 * getCreatorById, getFanArchetypeById) e passano gli oggetti già risolti; qui
 * si assume input valido. La persistenza (score_hist / session / profilo per
 * l'operatore; namespace candidate:* per il candidato) resta nelle route.
 */

import {
  FAN_PROFILES,
  getBenchmarkPatterns,
  getBenchmarkLabel,
} from "@/lib/fan-profiles";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";
import { pickExamples, formatExamplesForPrompt } from "@/lib/golden-examples";
import { formatCreatorPersonaForPrompt } from "@/lib/creator-personas";
import { formatFanArchetypeForPrompt } from "@/lib/fan-archetypes";
import { scoreTranscriptSignals } from "@/lib/academy-signal-scoring";

export function findScenarioById(scenarioId) {
  for (const category of TRAINING_SCENARIOS) {
    const found = category.scenarios?.find((s) => s.id === scenarioId);
    if (found) return found;
  }
  return null;
}

/* ============================================================
 * GENERAZIONE RISPOSTA FAN (era in /api/chat)
 * ============================================================ */

/**
 * V6.6 — blocco "CHI È LA TUA INTERLOCUTRICE" per il prompt del fan.
 */
function buildCreatorContextForFan(creator) {
  if (!creator) return "";
  const personaBlock = formatCreatorPersonaForPrompt(creator);
  return `\n\n--- CHI È LA TUA INTERLOCUTRICE (NON sei tu) ---
La persona con cui stai chattando in questa DM è **${creator.name}**, la creator. TU NON SEI ${creator.name}: tu sei il fan maschio descritto nel personaggio sopra. Quello che segue serve a farti riconoscere il tono di ${creator.name} quando ti scrive — NON è la tua voce da usare quando rispondi.

${personaBlock}

REGOLE STRETTE DI RUOLO (rispettale sempre, anche se l'operatore sbaglia un typo o scrive in modo confuso):
- Rispondi SEMPRE come il fan maschio. Mai come la creator.
- NON usare il vocabolario, le emoji o le frasi-firma della creator quando sei TU a scrivere ("amore mio", "ti aspettavo", 💗💗💗, ecc. sono parole che TI ASPETTI da lei, non tue).
- NON correggere i typo dell'operatore commentandoli ("tranquilla*", "tranquilla con la a"). Accetta le imperfezioni come naturali in una DM.
- Quando vuoi rivolgerti alla creator, chiamala col suo nome reale (${creator.name}) o con vocativi affettivi neutri ("amore", "tesoro", "bella"). NON inventare altri nomi e NON usare nomi maschili per lei.
- Se nello scenario sopra compaiono nomi di esempio (es. "Marco", "Luca"), quelli sono nomi di TERZI o tuoi (del fan), MAI dell'interlocutrice.
--- FINE CHI È LA TUA INTERLOCUTRICE ---\n`;
}

/**
 * Costruisce il system prompt del fan per uno scenario di training.
 */
function buildScenarioFanPrompt({ scenario, creator, archetype, currentState }) {
  const creatorContext = buildCreatorContextForFan(creator);
  const archetypeContext = archetype
    ? `\n\n--- FAN ARCHETYPE ---\n${formatFanArchetypeForPrompt(archetype)}\n--- FINE FAN ARCHETYPE ---\n`
    : "";

  return `${scenario.systemPromptForFan}${creatorContext}${archetypeContext}

CONTEXT: You are in an OnlyFans DM chat. The operator (managing the creator's account) is messaging you. You respond ONLY as the fan character described above. Never break character. Never reveal you're an AI. Keep replies short and natural like a real DM (usually 1-2 sentences, 30-50 chars). Come fan reale, rispondi con UN SOLO messaggio (raramente 2 se super eccitato/irritato). L'operatore invece può averti mandato più messaggi consecutivi (è normale su OF) — leggili tutti come un unico turno e rispondi nel complesso. If the operator offers paid content, simulate buying/refusing based on your character's mood and history. Respond in the same language the operator uses (primarily Italian for Italian fans).

REGOLA RUOLO (FONDAMENTALE): tu sei IL FAN. La persona dall'altra parte è la CREATOR (vedi blocco "CHI È LA TUA INTERLOCUTRICE" sopra se presente). NON scambiare i ruoli, anche se l'operatore commette typo, scrive frasi confuse, manda emoji ambigue o ti chiede chi sei. Se l'operatore ti chiede "chi sei?" o "come ti chiami?", rispondi col tuo nome di fan (quello dello scenario o della tua identità del fan) — MAI col nome della creator.

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
}

function buildLegacyFanPrompt(profile) {
  return `${profile.systemPrompt}

ISTRUZIONI AGGIUNTIVE:
- Sei in una chat di OnlyFans. L'operatore (che gestisce il profilo della creator) ti sta scrivendo.
- Tu rispondi SOLO come il fan. Non uscire MAI dal personaggio.
- Non dire MAI che sei un AI, un bot, o un simulatore.
- Rispondi in modo naturale, come una persona vera su una chat.
- I tuoi messaggi devono sembrare scritti da un ragazzo vero su OF.
- Se l'operatore ti propone un contenuto a pagamento, simula l'acquisto dicendo qualcosa come "ok lo prendo" o "vabbè mandamelo" — non servono link reali.
- Mantieni il tuo personaggio coerente per TUTTA la conversazione.
- REGOLA RUOLO: tu sei il FAN, non la creator. Anche se l'operatore scrive in modo confuso o sbaglia typo, NON correggerli al femminile come farebbe la creator e NON inventare nomi per la creator.`;
}

/**
 * Genera la risposta del fan simulato per un turno.
 * Assume scenario o fanProfile GIÀ risolto (le route validano ed emettono 400).
 *
 * @returns {Promise<{reply:string, fanState:object}>}
 */
export async function generateFanReply({ client, scenario, fanProfile, creator, archetype, fanState, messages }) {
  // Stato emotivo del fan: interest/trust/irritation/attachment (0-10) tra i turni.
  const currentState = {
    interest: 5,
    trust: 5,
    irritation: 0,
    attachment: 3,
    ...(fanState || {}),
  };

  let systemPrompt;
  if (scenario) {
    systemPrompt = buildScenarioFanPrompt({ scenario, creator, archetype, currentState });
  } else {
    systemPrompt = buildLegacyFanPrompt(fanProfile);
  }

  // Map to Claude format, then merge consecutive same-role messages
  // (operator often sends 2-3 msgs in a row on OnlyFans — 57% of turns per Infloww data)
  const mapped = (messages || []).map((msg) => ({
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
    model: "claude-sonnet-5",
    max_tokens: 500,
    system: systemPrompt,
    messages: claudeMessages,
  });

  // Estrai il primo blocco di testo in modo difensivo: i modelli nuovi
  // possono anteporre blocchi non-testo (es. thinking).
  const rawReply = (response.content.find((b) => b?.type === "text")?.text) || "";

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

  return { reply: fanReply, fanState: newState };
}

/* ============================================================
 * VALUTAZIONE TRANSCRIPT (era in /api/score, ramo scenario)
 * ============================================================ */

/**
 * V6.6 — XP scaling con scaglioni espliciti.
 */
const XP_RULES_PROMPT = `xp: <numero 0-250> seguendo questi scaglioni in base a overall:
  - overall < 30: xp 0-15 (conversazione fallita, no XP gratis)
  - 30-50: xp 15-50 (sotto la sufficienza, XP minimi)
  - 50-70: xp 50-120 (sufficienza, XP medi)
  - 70-85: xp 120-200 (buona prestazione)
  - 85+: xp 200-250 (eccellenza)
  Modula leggermente in base alla difficoltà dello scenario (scenario 5/5 dà fino al 15% in più rispetto alla base; scenario 1/5 fino al 15% in meno). Mai sopra 250, mai sotto 0.`;

/**
 * Costruisce il blocco "PATTERN STILISTICI DI RIFERIMENTO" (benchmark creator).
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
 * Valuta un transcript scenario-based e restituisce l'oggetto `score` completo
 * (main evaluator + ensemble di 3 giudici specialisti + guardrail XP + floor
 * compliance + signals). NON persiste nulla.
 *
 * @param {object} args
 * @param {boolean} [args.includeGolden=true] few-shot da chat reali di top
 *   performer (solo prompt, mai in output). Le route candidato lo tengono true:
 *   gli esempi sono anonimizzati e non compaiono nel report.
 * @returns {Promise<object>} score
 */
export async function evaluateScenarioTranscript({ client, scenario, creator, archetype, messages, includeGolden = true }) {
  const conversationText = (messages || [])
    .map((msg) => {
      const role = msg.role === "operator" ? "OPERATORE" : "FAN";
      return `[${role}]: ${msg.content}`;
    })
    .join("\n");

  const positive = (scenario.scoringCriteria?.positiveSignals || []).map((s) => `- ${s}`).join("\n");
  const negative = (scenario.scoringCriteria?.negativeSignals || []).map((s) => `- ${s}`).join("\n");
  const techniques = (scenario.idealTechniques || []).map((t) => `- ${t}`).join("\n");

  const goldenExamples = includeGolden ? pickExamples(scenario.categoryId || scenario.category, 2, "success") : [];
  const goldenBlock = goldenExamples.length
    ? `\n\nESEMPI DI ECCELLENZA (chat reali di top performer HOC, usa come benchmark):\n${formatExamplesForPrompt(goldenExamples)}\n`
    : "";

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
    const err = new Error("Errore nel parsing della valutazione.");
    err.code = "SCORE_PARSE";
    throw err;
  }

  // Evaluator ensemble — 3 specialist judges run in parallel to refine specific dimensions.
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

    // V6.6 — Server-side guardrail per XP.
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

  // Signals (Tier 3): check DETERMINISTICO additivo. NON tocca overall/xp/stars.
  try {
    score.signals = scoreTranscriptSignals(messages);
  } catch (sigErr) {
    console.warn("Signal scoring failed (non-fatal):", sigErr?.message);
  }

  return score;
}
