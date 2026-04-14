import { kv } from "@vercel/kv";
import { TRAINING_SCENARIOS, QUICK_CHALLENGES } from "@/lib/training-scenarios";

/**
 * Daily drill.
 *
 * Ogni giorno tutti gli operatori ricevono un drill deterministico: 1 scenario
 * pescato dall'elenco + 1 quick challenge. Deterministico su data (stesso per
 * tutti gli operatori nello stesso giorno) = utile per confronto interno.
 *
 * Tier rules:
 *   - junior  -> obbligatorio (gate soft sull'avvio di altri scenari)
 *   - senior  -> opzionale (promemoria non bloccante)
 *   - master  -> opzionale (promemoria non bloccante)
 *
 * Stato completamento: KV `drill:{userId}:{YYYY-MM-DD}` = { completedAt, scenarioId, quickId, score }
 */

export function todayKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Hash semplice deterministico
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function flattenScenarios() {
  const out = [];
  for (const cat of TRAINING_SCENARIOS || []) {
    for (const sc of cat.scenarios || []) {
      out.push({ ...sc, categoryId: cat.categoryId });
    }
  }
  return out;
}

export function getDrillForDate(dateKey = todayKey()) {
  const all = flattenScenarios();
  if (!all.length) return null;
  const h = hashStr(dateKey);
  const scenario = all[h % all.length];
  const quickPool = QUICK_CHALLENGES || [];
  const quick = quickPool.length ? quickPool[h % quickPool.length] : null;
  return {
    dateKey,
    scenario: scenario ? { id: scenario.id, title: scenario.title, categoryId: scenario.categoryId, difficulty: scenario.difficulty } : null,
    quick: quick ? { id: quick.id, prompt: quick.prompt || quick.title } : null,
  };
}

export async function getDrillStatusForUser(userId, dateKey = todayKey()) {
  if (!userId) return { dateKey, completed: false };
  const rec = await kv.get(`drill:${userId}:${dateKey}`);
  return {
    dateKey,
    completed: !!rec?.completedAt,
    record: rec || null,
  };
}

export async function markDrillCompleted(userId, payload = {}, dateKey = todayKey()) {
  if (!userId) return null;
  const rec = {
    userId,
    dateKey,
    completedAt: Date.now(),
    scenarioId: payload.scenarioId || null,
    quickId: payload.quickId || null,
    score: payload.score ?? null,
  };
  await kv.set(`drill:${userId}:${dateKey}`, rec);
  await kv.zadd(`drill:user:${userId}`, { score: Date.now(), member: dateKey });
  return rec;
}

/**
 * Calcola lo streak: quanti giorni consecutivi (incluso oggi o ieri) l'utente
 * ha completato il drill.
 */
export async function getDrillStreak(userId) {
  if (!userId) return 0;
  const keys = (await kv.zrange(`drill:user:${userId}`, 0, 100, { rev: true })) || [];
  if (!keys.length) return 0;
  // keys = dateKey (YYYY-MM-DD)
  const set = new Set(keys);
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 100; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const k = todayKey(d);
    if (set.has(k)) streak++;
    else break;
  }
  return streak;
}

export function isDrillMandatory(tier) {
  return tier === "junior" || !tier;
}
