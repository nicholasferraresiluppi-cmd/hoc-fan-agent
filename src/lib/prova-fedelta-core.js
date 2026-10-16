/**
 * Prova fedeltà (16/10/2026) — logica pura: chi è nel gruppo prova, cosa fare oggi, la misura.
 *
 * Perché esiste (studio del 16/10 sul warehouse, doc «Come nascono i fan che spendono»):
 * chi spende quasi tutto nella prima settimana resta cliente nel 2% dei casi, chi distribuisce
 * la spesa nel 30-36%; il futuro big spender è un fan che TORNA a comprare in giorni diversi;
 * il potenziale lo vediamo ma lo spremiamo (84%), coltivarlo lo fa quasi nessuno (5%).
 * Su Martina Scavo il 77% dei fan da 100 $+ spende oltre il 90% nella prima settimana.
 *
 * Disegno: i fan nuovi e caldi sono divisi A CASO in due gruppi (hash fisso di user_id + sale):
 * il gruppo «prova» riceve il nuovo trattamento, il gruppo «controllo» quello di sempre.
 * Gli operatori vedono solo la lista del gruppo prova; il controllo si misura e basta.
 * Misura: chi compra ancora dopo la prima settimana (8-30 e 8-60 giorni) e la spesa a 60 giorni,
 * per vedere se la prima sera più leggera si recupera dopo.
 */
export const ENROLL_WEEKS = 6;
export const FOLLOW_DAYS = 60;
const DAY = 86400e3;

/** FNV-1a 32 bit: stessa divisione a ogni calcolo, nessun archivio da tenere. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const armOf = (userId, salt) => (hash32(`${salt}:${userId}`) % 2 === 0 ? "prova" : "controllo");

export const isFlagged = (f) => Number(f.sp7) >= 100 && Number(f.bd7) >= 2;
const ts = (v) => (v ? Date.parse(v) : null);

/** Cosa fare oggi con un fan del gruppo prova: azioni in ordine di priorità (la prima è quella da fare). */
export function todoFor(f, now = Date.now()) {
  const t0 = ts(f.t0), fanLast = ts(f.fan_last), ourLast = ts(f.our_last), free = ts(f.our_free_last);
  const age = (now - t0) / DAY;
  const out = [];
  if (fanLast && (!ourLast || fanLast > ourLast) && now - fanLast < 2 * DAY) out.push({ key: "risposta", prio: 1, text: "Ha scritto e aspetta una risposta." });
  if (Number(f.buys24) >= 3 || Number(f.ppv24) >= 4) out.push({ key: "basta-oggi", prio: 2, text: "Oggi ha già comprato o ricevuto tanto: chiudi con un appuntamento per domani, niente altre proposte." });
  else if (age < 2) out.push({ key: "caldo", prio: 3, text: "Appena arrivato e caldo: scena entro un'ora, al massimo 2-3 proposte stasera, poi un appuntamento per domani." });
  if (age >= 7 && (!free || now - free > 3 * DAY) && fanLast && now - fanLast < 30 * DAY) out.push({ key: "personale", prio: 4, text: "Messaggio personale senza vendita: riprendi qualcosa che ti ha raccontato." });
  return out.sort((a, b) => a.prio - b.prio);
}

/** Stato della prova a una data: raccolta fan, solo seguito, conclusa. */
export function phaseOf(config, now = Date.now()) {
  if (!config?.start) return { key: "non-avviata" };
  const start = Date.parse(config.start), weeks = config.weeks || ENROLL_WEEKS;
  const enrollEnd = start + weeks * 7 * DAY, end = enrollEnd + FOLLOW_DAYS * DAY;
  if (config.stopped_at) return { key: "fermata", start, enrollEnd, end };
  if (now < start) return { key: "in-partenza", start, enrollEnd, end };
  if (now < enrollEnd) return { key: "raccolta", start, enrollEnd, end, day: Math.floor((now - start) / DAY) + 1, days: weeks * 7 };
  if (now < end) return { key: "seguito", start, enrollEnd, end };
  return { key: "conclusa", start, enrollEnd, end };
}

/** Fan della prova: solo chi è arrivato nella finestra di raccolta, con gruppo e azioni. */
export function shapeFans(rows, config, now = Date.now()) {
  const ph = phaseOf(config, now);
  if (!ph.start) return [];
  return rows
    .filter((r) => ts(r.t0) >= ph.start && ts(r.t0) < ph.enrollEnd)
    .map((r) => {
      const f = {
        userId: String(r.user_id), name: r.name || "", username: r.username || "", t0: r.t0,
        sub: r.sub_on === true || r.sub_on === "true" ? (r.expired === true || r.expired === "true" ? "scaduto" : "attivo") : "non noto",
        fan48: Number(r.fan48) || 0, fanAll: Number(r.fan_all) || 0, fan_last: r.fan_last, our_last: r.our_last, our_free_last: r.our_free_last,
        ppv24: Number(r.ppv24) || 0, sp7: Number(r.sp7) || 0, bd7: Number(r.bd7) || 0, buyDaysAfterD1: Number(r.buy_days_after_d1) || 0,
        sp8_30: Number(r.sp8_30) || 0, sp8_60: Number(r.sp8_60) || 0, sp60: Number(r.sp60) || 0, spAll: Number(r.sp_all) || 0,
        buys24: Number(r.buys24) || 0, last_buy: r.last_buy || null,
      };
      f.arm = armOf(f.userId, config.salt);
      f.flagged = isFlagged(f);
      f.ageDays = Math.floor((now - ts(f.t0)) / DAY);
      f.todo = f.arm === "prova" ? todoFor(f, now) : [];
      return f;
    });
}

const share = (list, pred) => (list.length ? list.filter(pred).length / list.length : null);
const mean = (list, get) => (list.length ? list.reduce((s, x) => s + get(x), 0) / list.length : null);

/** Differenza tra due quote: z del test a due proporzioni (|z| ≥ 2 ≈ difficilmente il caso). */
export function twoPropZ(p1, n1, p2, n2) {
  if (!n1 || !n2 || p1 === null || p2 === null) return null;
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (p1 - p2) / se : null;
}

/** Misura per gruppo. Ogni numero solo sui fan abbastanza «vecchi» da averlo maturato. */
export function measure(fans) {
  const arm = (a) => fans.filter((f) => f.arm === a);
  const block = (list) => {
    const d7 = list.filter((f) => f.ageDays >= 7), d30 = list.filter((f) => f.ageDays >= 30), d60 = list.filter((f) => f.ageDays >= 60);
    return {
      fans: list.length, flagged: list.filter((f) => f.flagged).length,
      n7: d7.length, sp7: mean(d7, (f) => f.sp7), backAfterD1: share(d7, (f) => f.buyDaysAfterD1 > 0),
      n30: d30.length, still8_30: share(d30, (f) => f.sp8_30 > 0),
      n60: d60.length, still8_60: share(d60, (f) => f.sp8_60 > 0), sp60: mean(d60, (f) => f.sp60), big500: share(d60, (f) => f.sp60 >= 500),
    };
  };
  const p = block(arm("prova")), c = block(arm("controllo"));
  return {
    prova: p, controllo: c,
    z: {
      backAfterD1: twoPropZ(p.backAfterD1, p.n7, c.backAfterD1, c.n7),
      still8_30: twoPropZ(p.still8_30, p.n30, c.still8_30, c.n30),
      still8_60: twoPropZ(p.still8_60, p.n60, c.still8_60, c.n60),
    },
  };
}
