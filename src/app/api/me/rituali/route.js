/**
 * /api/me/rituali — modulo personale "rituali" (CRAWL v1). docs/RITUALI_PERSONALI.md
 *
 * GET  ?date=YYYY-MM-DD  → { config, today:{date,done}, adherence, streak, traits }
 * POST { date, habitId, done? } → toggle abitudine del giorno, ricomputa e ritorna
 *
 * Identità risolta SERVER-SIDE (userId Clerk). Gate admin (feature board/personale).
 * Dati chiavati per userId: mai dati di altri, mai employee HOC.
 */
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { isUserIdAdmin } from "@/lib/admin";
import {
  logKey, yearMonthOf, isValidDateISO,
  loadConfig, loadLogWindow, computeAdherence, computeStreak, computeTraits,
} from "@/lib/rituali";

const WINDOW_LOAD_DAYS = 35;

function serverTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function gate() {
  const { userId } = await auth();
  if (!userId) return { error: Response.json({ error: "Non autenticato." }, { status: 401 }) };
  if (!(await isUserIdAdmin(userId))) {
    return { error: Response.json({ error: "Riservato." }, { status: 403 }) };
  }
  return { userId };
}

async function freshState(userId, config, date) {
  const map = await loadLogWindow(userId, date, WINDOW_LOAD_DAYS);
  return {
    today: { date, done: map[date] || [] },
    adherence: computeAdherence(map, config, date, 30),
    streak: computeStreak(map, date),
    traits: computeTraits(map, config, date, 30),
  };
}

export async function GET(request) {
  const g = await gate();
  if (g.error) return g.error;

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const date = isValidDateISO(dateParam) ? dateParam : serverTodayISO();

  const config = await loadConfig(g.userId);
  const state = await freshState(g.userId, config, date);
  return Response.json({ config, ...state });
}

export async function POST(request) {
  const g = await gate();
  if (g.error) return g.error;

  let body = {};
  try { body = await request.json(); } catch {}
  const date = body.date;
  if (!isValidDateISO(date)) {
    return Response.json({ error: "Data non valida." }, { status: 400 });
  }

  const config = await loadConfig(g.userId);
  const habitIds = new Set(config.habits.map((h) => h.id));
  if (!habitIds.has(body.habitId)) {
    return Response.json({ error: "Abitudine sconosciuta." }, { status: 400 });
  }

  const bucketKey = logKey(g.userId, yearMonthOf(date));
  let bucket = null;
  try { bucket = await kv.get(bucketKey); } catch {}
  if (!bucket || typeof bucket !== "object") bucket = {};

  const set = new Set(Array.isArray(bucket[date]?.done) ? bucket[date].done : []);
  const want = body.done !== undefined ? !!body.done : !set.has(body.habitId);
  if (want) set.add(body.habitId);
  else set.delete(body.habitId);
  bucket[date] = { done: [...set], ts: new Date().toISOString() };

  try {
    await kv.set(bucketKey, bucket);
  } catch {
    return Response.json({ error: "Salvataggio fallito." }, { status: 500 });
  }

  const state = await freshState(g.userId, config, date);
  return Response.json({ ok: true, ...state });
}
