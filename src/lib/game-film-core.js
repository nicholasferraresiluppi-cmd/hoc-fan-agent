// Game film — core PURO (niente import: testabile con node secco).
//
// Trasforma le feature per-(turno,fan) dei turni SINGOLI di un operatore nei
// MOMENTI del suo film: vinte (sequenze che hanno chiuso) e perse (occasioni
// scivolate), con l'accoppiamento persa→vinta gemella che è la parte formativa:
// "come potevi giocarla" non è un consiglio inventato, è la SUA chat riuscita
// più comparabile, messa accanto.
//
// Soglie CALIBRATE su dati reali (Simone Cherchi, 9 turni singoli, 3.401
// conversazioni, lug 2026): WIN ≥ $100 → 31 vinte; persa = fan ingaggiato
// (≥15 msg) + $0 + gioco PPV assente o timido (<$40) → 20 perse vere, di cui
// 14 senza NESSUN PPV proposto. Le soglie stanno qui, versionate: se cambiano,
// cambia la versione.
//
// POLICY: materiale didattico (coaching), non score/comp. I transcript portano
// testo fan → SOLO superficie SEED. Fan sempre pseudonimizzato a monte.

export const GAME_FILM_VERSION = "film-1-2026-07";

export const FILM_THRESHOLDS = {
  WIN_MIN_BOUGHT: 100, // $ nella finestra turno(+coda): sequenza chiusa
  LOSS_MIN_FAN_MSGS: 15, // fan ingaggiato: sotto, il silenzio non è una "persa"
  LOSS_LOW_PPV: 40, // sopra $0 ma mai un'offerta vera: gioco timido
  MIN_OP_MSGS: 3, // l'operatore deve aver davvero giocato la conversazione
};

/**
 * Classifica le conversazioni per-(turno,fan) in vinte e perse.
 * @param {Array<object>} rows [{shift_id,day,creator_id,user_id,fan_msgs,op_msgs,ppv_sent,max_ppv,bought,buys?}]
 * @param {object} [t] soglie override (test)
 * @returns {{wins:Array, losses:Array}} entrambe ordinate: vinte per $ desc, perse per ingaggio desc
 */
export function classifyMoments(rows, t = FILM_THRESHOLDS) {
  const wins = [];
  const losses = [];
  for (const r of rows || []) {
    if (!r || r.op_msgs == null) continue;
    const bought = Number(r.bought) || 0;
    const fanMsgs = Number(r.fan_msgs) || 0;
    const opMsgs = Number(r.op_msgs) || 0;
    const ppvSent = Number(r.ppv_sent) || 0;
    const maxPpv = r.max_ppv == null ? null : Number(r.max_ppv);

    if (bought >= t.WIN_MIN_BOUGHT && opMsgs >= t.MIN_OP_MSGS) {
      wins.push({ ...r, bought, kind: "win" });
      continue;
    }
    if (bought === 0 && fanMsgs >= t.LOSS_MIN_FAN_MSGS && opMsgs >= t.MIN_OP_MSGS) {
      // il gioco PPV: assente (mai proposto) o timido (mai un'offerta vera)
      const noPpv = ppvSent === 0;
      const lowPpv = ppvSent > 0 && (maxPpv == null || maxPpv < t.LOSS_LOW_PPV);
      if (noPpv || lowPpv) {
        losses.push({
          ...r,
          bought: 0,
          kind: "loss",
          reason: noPpv ? "mai_proposto" : "gioco_timido",
        });
      }
    }
  }
  wins.sort((a, b) => b.bought - a.bought);
  losses.sort((a, b) => (b.fan_msgs || 0) - (a.fan_msgs || 0));
  return { wins, losses };
}

/**
 * Per ogni persa trova la vinta GEMELLA: la chat riuscita più comparabile dello
 * stesso operatore — stesso creator prima di tutto (stesso contesto/pricing),
 * poi ingaggio del fan più vicino. Deterministica; una vinta può fare da
 * gemella a più perse (è il suo ruolo didattico).
 * Muta le perse in place aggiungendo `twin_key` (o null se nessuna vinta).
 * @returns {Array} le stesse losses (comodità)
 */
export function pairTwins(losses, wins) {
  const ws = Array.isArray(wins) ? wins : [];
  for (const loss of Array.isArray(losses) ? losses : []) {
    if (!ws.length) {
      loss.twin_key = null;
      continue;
    }
    const sameCreator = ws.filter((w) => w.creator_id === loss.creator_id);
    const pool = sameCreator.length ? sameCreator : ws;
    let best = null;
    let bestGap = Infinity;
    for (const w of pool) {
      const gap = Math.abs((w.fan_msgs || 0) - (loss.fan_msgs || 0));
      // pareggio di ingaggio → vince la vinta più grossa (più materiale didattico)
      if (gap < bestGap || (gap === bestGap && (w.bought || 0) > (best?.bought || 0))) {
        best = w;
        bestGap = gap;
      }
    }
    loss.twin_key = best ? momentKey(best) : null;
  }
  return losses;
}

/** Chiave stabile del momento (turno+fan): id di aggancio persa↔gemella e React key. */
export function momentKey(m) {
  return `${m.shift_id}:${m.user_id}`;
}

/**
 * Taglia un transcript al cap tenendo la parte che insegna.
 * - VINTA (anchorTs = ultimo acquisto): il pitch sta PRIMA della chiusura →
 *   tieni la coda pre-chiusura + pochi messaggi post (delivery/semina), come
 *   lo slice dei game tape.
 * - PERSA (niente anchor): tieni la CODA della conversazione — è lì che
 *   l'occasione si spegne.
 * @param {Array<{at:number}>} msgs ordinati per tempo asc
 */
export function trimTranscript(msgs, { cap = 60, anchorTs = null, postKeep = 6 } = {}) {
  const all = Array.isArray(msgs) ? msgs : [];
  if (all.length <= cap) return { messages: all, truncated: false };
  if (anchorTs != null) {
    const pre = all.filter((m) => m.at <= anchorTs);
    const postAll = all.filter((m) => m.at > anchorTs);
    const post = postAll.slice(0, postKeep);
    const preKeep = pre.slice(-(cap - post.length));
    // troncato se si è perso qualcosa da QUALSIASI lato (anche solo coda post-chiusura)
    return { messages: [...preKeep, ...post], truncated: pre.length > preKeep.length || postAll.length > post.length };
  }
  return { messages: all.slice(-cap), truncated: true };
}

/** Scala PPV dell'operatore dentro un transcript (prezzi proposti, in ordine). */
export function ppvLadder(msgs) {
  return (Array.isArray(msgs) ? msgs : [])
    .filter((m) => m && m.who === "op" && Number(m.price) > 0)
    .map((m) => Math.round(Number(m.price)));
}
