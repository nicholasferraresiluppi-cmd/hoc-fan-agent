// Logica pura (niente Node) dello strumento "Revenue e chat" per la vista "Le mie creator" e la
// coda "a chi scrivere adesso" (09/10/2026, dalla prova d'uso: il 26 dei fan in attesa era un
// numero, non un'azione). La usano pagina e API: una regola sola, scritta qui.

// "In attesa": ultimo messaggio del fan senza risposta, nelle ultime 24 ore (stessa definizione
// del riquadro, vedi chat-monitor/ui.js).
export const WAIT_WINDOW_H = 24;
export const SPENDER_MIN = 100; // $ negli ultimi 60 giorni per essere "chi spende"
export const NEW_SUB_DAYS = 7;
export const HOT_MIN = 6 * 60; // oltre 6 ore la conversazione è fredda

const daysSince = (ymd, now) => (ymd ? Math.max(0, Math.floor((now - Date.parse(`${ymd}T00:00:00Z`)) / 86400000)) : null);

/**
 * Coda ordinata per priorità, con la ragione scritta. Regola volutamente semplice e spiegabile:
 * prima chi ha speso tanto, poi chi ha già comprato, poi i nuovi abbonati della settimana, poi
 * gli altri; dentro ogni gruppo prima le conversazioni ancora calde (< 6 ore). Niente punteggi opachi.
 */
export function prioritizeQueue(queue, now = Date.now()) {
  return (queue || [])
    .filter((q) => q.last_fan_at && now - Date.parse(q.last_fan_at) <= WAIT_WINDOW_H * 3600_000)
    .map((q) => {
      const spent = Number(q.spent_60d) || 0;
      const d = daysSince(q.sub_date, now);
      let tier, reason;
      if (spent >= SPENDER_MIN) { tier = 0; reason = `ha speso $${Math.round(spent).toLocaleString("it-IT", { useGrouping: "always" })} in 60 giorni`; }
      else if (spent > 0) { tier = 1; reason = `ha già comprato ($${Math.round(spent)})`; }
      else if (d != null && d <= NEW_SUB_DAYS) { tier = 2; reason = d === 0 ? "nuovo abbonato di oggi" : `nuovo abbonato da ${d} ${d === 1 ? "giorno" : "giorni"}`; }
      else { tier = 3; reason = "non ha ancora comprato"; }
      return { ...q, tier, reason, wait_min: Math.round((now - Date.parse(q.last_fan_at)) / 60000) };
    })
    // Dentro il gruppo: prima chi aspetta da meno di 6 ore (conversazione ancora calda: oltre 6 ore la
    // latenza la conta già come non risposta), e tra questi chi aspetta da più tempo; poi i più vecchi.
    .sort((a, b) => a.tier - b.tier || (a.wait_min > HOT_MIN) - (b.wait_min > HOT_MIN) || (a.wait_min > HOT_MIN ? a.wait_min - b.wait_min : b.wait_min - a.wait_min));
}

/**
 * Turni di un paese al momento della lettura (la cache dei turni è di 5 minuti, "adesso" no):
 * chi è in turno, se ha timbrato, chi arriva al prossimo cambio.
 */
export function shiftStatus(list, now = Date.now()) {
  const L = (list || []).map((s) => ({ ...s, st: Date.parse(s.start), en: Date.parse(s.end) })).filter((s) => s.en > now);
  const current = L.filter((s) => s.st <= now);
  const nextStart = L.filter((s) => s.st > now).reduce((m, s) => Math.min(m, s.st), Infinity);
  const next = Number.isFinite(nextStart) ? L.filter((s) => s.st === nextStart) : [];
  const strip = (s) => ({ member: s.member, start: s.start, end: s.end, checked_in: s.checked_in });
  return {
    current: current.map(strip),
    next: next.map(strip),
    // turno iniziato da più di 10 minuti e nessuno ha timbrato l'entrata
    unchecked: current.length > 0 && current.every((s) => !s.checked_in && now - s.st > 10 * 60_000),
    empty: current.length === 0,
  };
}

/** Semaforo della creator per la vista d'insieme: la cosa peggiore decide il colore. */
export function creatorLight({ paceRatio, hasGoal = false, waitingSpenders, waitingOld, latMin, shift }) {
  const reasons = [];
  let level = 0; // 0 ok · 1 attenzione · 2 da guardare
  const bump = (l, r) => { level = Math.max(level, l); reasons.push({ level: l, text: r }); };
  if (shift?.unchecked) bump(2, "turno iniziato ma nessuno ha timbrato");
  else if (shift?.empty) bump(1, "nessuno di turno adesso");
  // Calibrato sulla prima prova con dati veri (09/10): con soglie più strette tutte e tre le creator
  // risultavano "da guardare", cioè il semaforo non distingueva più niente. Il rosso resta per ciò che
  // chiede di intervenire adesso: turno scoperto, risposte lente oggi, mese molto sotto il traguardo.
  if (waitingSpenders > 0) bump(1, `${waitingSpenders} ${waitingSpenders === 1 ? "fan che ha già comprato aspetta" : "fan che hanno già comprato aspettano"}`);
  else if (waitingOld > 0) bump(1, `${waitingOld} ${waitingOld === 1 ? "fan aspetta" : "fan aspettano"} da più di 2 ore`);
  if (latMin != null && latMin > 10) bump(latMin > 30 ? 2 : 1, `oggi si risponde in ${Math.round(latMin)} min`);
  if (paceRatio != null && paceRatio < 0.9) bump(paceRatio < 0.75 && hasGoal ? 2 : 1, hasGoal ? "il mese va sotto il ritmo del traguardo" : "il mese va sotto la media degli ultimi mesi");
  return { level, reasons: reasons.sort((a, b) => b.level - a.level) };
}

// Traguardo suggerito (09/10/2026, decisione di Nicholas): se per il mese non c'è un traguardo
// impostato, si propone l'incassato del mese precedente +10%. È una proposta, non un obiettivo
// deciso: in pagina si dice "suggerito" e quello messo a mano vince sempre.
export const SUGGESTED_GOAL_UPLIFT = 0.1;

const prevMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

/** Mese precedente +10% sui paesi indicati, arrotondato alle centinaia; null se il mese prima non ha dati. */
export function suggestedGoal(trend, countries, month) {
  if (!month || !trend?.length) return null;
  const pm = prevMonth(month);
  const set = new Set(countries);
  const days = new Set();
  let sum = 0;
  for (const t of trend) {
    if (!t.date?.startsWith(pm) || !set.has(t.country)) continue;
    sum += Number(t.daily_revenue) || 0;
    days.add(t.date);
  }
  // serve il mese precedente (quasi) intero, altrimenti la proposta sarebbe falsata
  const [y, m] = pm.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (!sum || days.size < dim - 2) return null;
  return Math.round((sum * (1 + SUGGESTED_GOAL_UPLIFT)) / 100) * 100;
}
