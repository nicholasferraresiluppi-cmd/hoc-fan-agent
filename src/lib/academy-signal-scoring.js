// Academy · Signal scoring del simulatore (Tier 3).
//
// Traduce l'evidenza warehouse (memory academy-tier2-signals-evidence / superficie
// /admin/academy-signals) in un check DETERMINISTICO sul transcript di training:
// quanto la conversazione dell'operatore si allinea ai comportamenti che DA NOI
// monetizzano davvero.
//
// ONESTÀ (vincolo di design):
//   - Il simulatore è SOLO testo: niente prezzi né tempi. I segnali più forti
//     (prezzo PPV +0,41, cadenza PPV +0,30) NON sono misurabili qui → dichiarati
//     "si allena sul vivo", non finti.
//   - L'unico segnale validato misurabile sul testo è il TASSO DI DOMANDE, che
//     correla NEGATIVAMENTE col venduto/ora (−0,10, 22/30 creator): nel chatting
//     si conduce, non si intervista. È l'unico che scoriamo.
//   - I comportamenti NEUTRI nei nostri dati (lunghezza msg, talk ratio) sono
//     mostrati come "nessun segnale" per NON alimentare il mito che contino.
//   - ADDITIVO: non tocca overall/xp/stars/ladder del punteggio LLM (governance
//     dello score: niente riscrittura retroattiva delle classifiche). È una lente
//     di coaching versionata, non un cutoff.

export const SIGNAL_SCORING_VERSION = "sigscore-1-2026-07";

// Soglie di coaching derivate dall'evidenza (non contrattuali).
const Q_GOOD = 0.2; // ≤20% messaggi-domanda = conduce bene
const Q_WATCH = 0.35; // 20–35% = attenzione; >35% = intervista troppo
const MIN_OP_MSGS = 5; // sotto questa soglia la conversazione è troppo corta per un segnale affidabile

const isQuestion = (t) => /\?/.test(t || "");
const wordCount = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Mappa il tasso di domande in un punteggio 0-100 (più basso il tasso, meglio è).
function questionScore(rate) {
  if (rate <= Q_GOOD) return Math.round(clamp(80 + (1 - rate / Q_GOOD) * 20, 80, 100));
  if (rate <= Q_WATCH) return Math.round(clamp(40 + ((Q_WATCH - rate) / (Q_WATCH - Q_GOOD)) * 40, 40, 80));
  return Math.round(clamp(40 * (1 - (rate - Q_WATCH) / (1 - Q_WATCH)), 0, 40));
}

/**
 * @param {Array<{role:string, content:string}>} messages transcript del simulatore
 * @returns {object} scheda signals deterministica (vedi shape sotto)
 */
export function scoreTranscriptSignals(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const ops = list.filter((m) => m && m.role === "operator" && typeof m.content === "string" && m.content.trim());
  const fans = list.filter((m) => m && m.role === "fan" && typeof m.content === "string");

  const opCount = ops.length;
  const enough = opCount >= MIN_OP_MSGS;

  const questions = ops.filter((m) => isQuestion(m.content)).length;
  const questionRate = opCount ? questions / opCount : null;

  const opWords = ops.reduce((a, m) => a + wordCount(m.content), 0);
  const fanWords = fans.reduce((a, m) => a + wordCount(m.content), 0);
  const talkRatio = opWords + fanWords ? opWords / (opWords + fanWords) : null;
  const wordsPerMsg = opCount ? opWords / opCount : null;

  let qScore = null;
  let qVerdict = null;
  if (enough && questionRate != null) {
    qScore = questionScore(questionRate);
    qVerdict = questionRate <= Q_GOOD ? "ok" : questionRate <= Q_WATCH ? "watch" : "off";
  }

  // Le metriche numeriche si mostrano SOLO con dati sufficienti: sotto la soglia
  // di affidabilità non esponiamo percentuali grezze (coerenza col contratto di
  // onestà — niente numero preciso sotto un headline "troppo breve"). `value` è
  // il dato strutturato (o null), `display` la stringa già formattata per la UI.
  const pct = (x) => (x == null ? null : Math.round(x * 100));
  const qPct = enough ? pct(questionRate) : null;
  const wpm = enough && wordsPerMsg != null ? Math.round(wordsPerMsg) : null;
  const talkPct = enough ? pct(talkRatio) : null;

  const signals = [
    {
      key: "question_discipline",
      label: "Conduci, non intervistare",
      status: enough ? "scored" : "insufficient",
      value: qPct,
      display: qPct == null ? null : `${qPct}% domande`,
      verdict: qVerdict,
      score: qScore,
      evidence:
        "Dai nostri dati il tasso di domande correla negativamente col venduto/ora (−0,10, 22/30 creator): chi propone e conduce vende più di chi intervista.",
    },
    {
      key: "message_length",
      label: "Lunghezza dei messaggi",
      status: "neutral",
      value: wpm,
      display: wpm == null ? null : `${wpm} parole/msg`,
      verdict: null,
      score: null,
      evidence: "Nei nostri dati la lunghezza dei messaggi non correla col venduto: non è lì che si fa la differenza.",
    },
    {
      key: "talk_balance",
      label: "Equilibrio di parola",
      status: "neutral",
      value: talkPct,
      display: talkPct == null ? null : `${talkPct}% parole tue`,
      verdict: null,
      score: null,
      evidence: "Il talk ratio non è predittivo nei nostri dati: parlare di più o di meno, di per sé, non sposta il venduto.",
    },
    {
      key: "pricing_cadence",
      label: "Prezzo e cadenza dei PPV",
      status: "on_the_job",
      value: null,
      display: null,
      verdict: null,
      score: null,
      evidence:
        "I segnali più forti (prezzo PPV +0,41, cadenza PPV +0,30) si allenano sul vivo: il simulatore testuale non modella i contenuti a pagamento.",
    },
  ];

  const headline = !enough
    ? "Conversazione troppo breve per un segnale affidabile"
    : qVerdict === "ok"
      ? "Conduci bene: proponi più di quanto intervisti"
      : qVerdict === "watch"
        ? "Occhio: stai facendo parecchie domande"
        : "Stai intervistando il fan — conduci di più, proponi";

  return {
    version: SIGNAL_SCORING_VERSION,
    enough_data: enough,
    op_messages: opCount,
    // Allineamento = SOLO il segnale validato e misurabile (nessun composito finto).
    alignment: enough ? qScore : null,
    headline,
    signals,
  };
}
