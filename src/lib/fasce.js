/**
 * Fasce e turni — lettura dati e calcolo notturno (22/10/2026).
 * La logica sta in fasce-core.js (puro, testato); qui solo I/O su KV.
 *
 * Gira nella stessa funzione notturna della Squadra (/api/cron/squadra), subito
 * dopo: legge gli stessi 3 mesi di wage CP, che a quel punto sono già nella copia
 * in memoria di cp-wages-store (si scarica solo il manifest, niente banda in più —
 * incidente Upstash del 04/10). La pagina legge SOLO `fasce:data:{versione}`.
 */
import { kv } from "@vercel/kv";
import { getWages } from "@/lib/cp-wages-store";
import { FASCE_VERSION, toPieces, buildFasce } from "@/lib/fasce-core";
import { currentMonthRome } from "@/lib/squadra";
import { shiftMonth } from "@/lib/squadra-core";

const DATA_KEY = `fasce:data:${FASCE_VERSION}`;
const LOCK_KEY = "fasce:lock";
export const STALE_AFTER_H = 30;

function shiftsFromWages(wages, names) {
  const out = [];
  for (const w of wages || []) {
    for (const s of w.shifts || []) {
      if (!s?.id) continue;
      const ids = Array.isArray(s.creator_ids) ? s.creator_ids : [];
      ids.forEach((cid, i) => {
        const al = s.creator_aliases?.[i];
        if (al && !names[String(cid)]) names[String(cid)] = al;
      });
      out.push({
        id: s.id,
        member_id: w.member_id,
        member_name: w.member_name,
        started_at: s.started_at,
        worked_hours: s.worked_hours,
        total_attributed: s.total_attributed,
        creator_ids: ids,
        cosellers: s.payment_profile?.cosellers_count ?? null,
      });
    }
  }
  return out;
}

export async function computeFasce({ now = Date.now() } = {}) {
  const cur = currentMonthRome(now);
  const months = [shiftMonth(cur, -2), shiftMonth(cur, -1), cur];
  const names = {};
  const shifts = [];
  for (const m of months) shifts.push(...shiftsFromWages((await getWages(m)) || [], names));
  const doc = buildFasce(toPieces(shifts), { now, names });
  const out = {
    ...doc,
    generated_at: new Date(now).toISOString(),
    window: { from: `${months[0]}-01`, months },
    counts: { shifts: shifts.length, pages: doc.pages.length, operators: doc.operators.length },
  };
  await kv.set(DATA_KEY, out, { ex: 4 * 24 * 3600 });
  return out;
}

/** Calcolo con lock: null se un altro lo sta già facendo. */
export async function computeFasceOnce(opts) {
  const got = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: 180 });
  if (!got) return null;
  try {
    return await computeFasce(opts);
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

export const getFasceData = () => kv.get(DATA_KEY);
export const isFasceComputing = async () => Boolean(await kv.get(LOCK_KEY));
export function isFasceStale(doc, now = Date.now()) {
  return !doc?.generated_at || now - Date.parse(doc.generated_at) > STALE_AFTER_H * 3600 * 1000;
}
