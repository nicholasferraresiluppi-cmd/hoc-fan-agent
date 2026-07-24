// Infloww ingestion — segnali per operatore dall'export Message Dashboard.
//
// PERCHÉ: il warehouse ha la conversazione intera ma NON l'umano che ha scritto
// (sender_id = account creator). L'export Message Dashboard di Infloww invece
// attribuisce ogni messaggio al SENDER (l'operatore) → copre ANCHE i turni in duo,
// che è il buco di copertura di operator-signals.js (solo turni singoli).
//
// Schema export reale (verificato 24 lug 2026, foglio "Message Dashboard", 12 col):
//   Sender | Creator | Fans Message | Creator Message | Sent time | Sent date |
//   Replay time | Price | Purchased | Source | Status | Sent to
//   - Sender = operatore umano; Sent to = "username (uNNNNN)" → user_id del fan
//   - Creator Message = testo in HTML <p>…</p>; Price = PPV; Source = Employee/…
//   - orari in UTC+1 (l'allineamento al warehouse è offset costante, vedi match)
//
// ONESTÀ DI SCOPO: questo export ha i messaggi ma NON le ore lavorate → da solo
// dà in modo affidabile solo i segnali COUNT-based: tasso domande e prezzo medio
// PPV (+ quota PPV). La cadenza-per-ora richiede le ore (Clocked Hours export o
// finestre turno del warehouse) e NON si calcola qui. Stessi segnali validati di
// operator-signals.js, dove misurabili.

export const INFLOWW_HEADERS_REQUIRED = ["Sender", "Creator Message", "Price", "Sent to"];

export function stripHtml(t) {
  return String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// "alfio (u440235841)" → 440235841
export function extractFanUid(sentTo) {
  const m = /u(\d+)\)?\s*$/.exec(String(sentTo || "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Calcola i segnali per operatore da righe già parsate dell'export.
 * @param {Array<object>} rows righe con chiavi header dell'export (Sender, "Creator Message", Price, Source, ...)
 * @param {object} [opts]
 * @param {number} [opts.minMsgs=200] soglia messaggi per profilare un operatore
 * @returns {{version:string, operators:number, rows_seen:number, profiles:Array}}
 */
export function computeInflowwOperatorSignals(rows, { minMsgs = 200 } = {}) {
  const byOp = new Map();
  let seen = 0;
  for (const r of rows || []) {
    if (!r) continue;
    seen++;
    const op = String(r["Sender"] || "").trim();
    if (!op) continue;
    // solo messaggi scritti dall'operatore (non mass/automated)
    const source = String(r["Source"] || "").toLowerCase();
    if (source && source !== "employee") continue;
    const text = stripHtml(r["Creator Message"]);
    const price = Number(r["Price"]) || 0;
    if (!text && price <= 0) continue; // riga vuota non-PPV: salta

    const a = byOp.get(op) || { op, msgs: 0, questions: 0, ppv: 0, ppvAmount: 0 };
    a.msgs++;
    if (text.includes("?")) a.questions++;
    if (price > 0) {
      a.ppv++;
      a.ppvAmount += price;
    }
    byOp.set(op, a);
  }

  const profiles = [];
  for (const a of byOp.values()) {
    if (a.msgs < minMsgs) continue;
    profiles.push({
      operator: a.op,
      msgs: a.msgs,
      question_rate: a.msgs ? +(a.questions / a.msgs).toFixed(4) : null,
      avg_ppv_price: a.ppv ? +(a.ppvAmount / a.ppv).toFixed(2) : null,
      ppv_share: a.msgs ? +(a.ppv / a.msgs).toFixed(4) : null, // quota di messaggi che sono PPV
    });
  }
  profiles.sort((x, y) => y.msgs - x.msgs);
  return { version: "infloww-sig-1-2026-07", operators: profiles.length, rows_seen: seen, profiles };
}
