import { prioritizeQueue, shiftStatus, creatorLight } from "../src/lib/live-priority.js";
const now = Date.parse("2026-10-09T09:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
const q = prioritizeQueue([
  { user_id: "a", last_fan_at: ago(5), spent_60d: 0, sub_date: "2026-10-09" },
  { user_id: "b", last_fan_at: ago(3), spent_60d: 250 },
  { user_id: "c", last_fan_at: ago(60), spent_60d: 20 },
  { user_id: "d", last_fan_at: ago(30 * 60), spent_60d: 999 },
  { user_id: "e", last_fan_at: ago(90), spent_60d: 0, sub_date: "2026-09-01" },
  { user_id: "f", last_fan_at: ago(10), spent_60d: 300 },
], now);
console.assert(q.map((x) => x.user_id).join("") === "fbcae", q.map((x) => x.user_id).join(""));
console.assert(q[0].reason === "ha speso $300 in 60 giorni", q[0].reason);
console.assert(q[3].reason === "nuovo abbonato di oggi");
const sh = shiftStatus([
  { member: "Irma", start: "2026-10-09T05:00:00Z", end: "2026-10-09T10:00:00Z", checked_in: true },
  { member: "Luca", start: "2026-10-09T10:00:00Z", end: "2026-10-09T15:00:00Z", checked_in: false },
], now);
console.assert(sh.current[0].member === "Irma" && sh.next[0].member === "Luca" && !sh.unchecked && !sh.empty);
const sh2 = shiftStatus([{ member: "Luca", start: "2026-10-09T08:30:00Z", end: "2026-10-09T13:00:00Z", checked_in: false }], now);
console.assert(sh2.unchecked === true);
const sh3 = shiftStatus([{ member: "Luca", start: "2026-10-09T08:55:00Z", end: "2026-10-09T13:00:00Z", checked_in: false }], now);
console.assert(sh3.unchecked === false, "grace 10 min");
console.assert(shiftStatus([], now).empty === true);
const l = creatorLight({ paceRatio: 1.05, waitingSpenders: 0, waitingOld: 0, latMin: 2, shift: sh });
console.assert(l.level === 0 && !l.reasons.length);
const l2 = creatorLight({ paceRatio: 0.7, waitingSpenders: 2, waitingOld: 1, latMin: 2, shift: sh2 });
console.assert(l2.level === 2 && l2.reasons.length === 3, JSON.stringify(l2));
console.log("ok");
const q2 = prioritizeQueue([
  { user_id: "old", last_fan_at: ago(20 * 60), spent_60d: 500 },
  { user_id: "hot", last_fan_at: ago(30), spent_60d: 500 },
  { user_id: "hot2", last_fan_at: ago(90), spent_60d: 500 },
], now);
console.assert(q2.map((x) => x.user_id).join(",") === "hot2,hot,old", q2.map((x) => x.user_id).join(","));
const l3 = creatorLight({ paceRatio: 0.6, waitingSpenders: 3, waitingOld: 3, latMin: 1, shift: sh });
console.assert(l3.level === 1, "senza traguardo e con chat ok: attenzione, non rosso");
console.log("ok2");
import { suggestedGoal } from "../src/lib/live-priority.js";
const tr = [];
for (let d = 1; d <= 30; d++) { tr.push({ date: `2026-09-${String(d).padStart(2, "0")}`, country: "IT", daily_revenue: 1000 }); tr.push({ date: `2026-09-${String(d).padStart(2, "0")}`, country: "EN", daily_revenue: 100 }); }
console.assert(suggestedGoal(tr, ["IT"], "2026-10") === 33000, suggestedGoal(tr, ["IT"], "2026-10"));
console.assert(suggestedGoal(tr, ["IT", "EN"], "2026-10") === 36300);
console.assert(suggestedGoal(tr.slice(0, 20), ["IT"], "2026-10") === null, "mese precedente incompleto");
console.assert(suggestedGoal(tr, ["IT"], "2026-12") === null);
console.log("ok3");
