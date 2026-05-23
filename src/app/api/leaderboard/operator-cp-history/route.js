/**
 * GET /api/leaderboard/operator-cp-history
 *
 * Storia di un operatore basata interamente su CreatorsPro:
 *   - tenure_months_cp: numero di mesi tra il primo mese in cui appare in
 *     cp:wages e oggi (fonte primaria, sostituisce il dato Infloww-derivato)
 *   - ltv_cp: somma di total_sales su tutti i mesi sync'd
 *   - history: per ogni mese sincronizzato (max last_n), score CP + sales +
 *     shifts dall'operatore (estratti dai matrix v3 retrocalcolati on-demand)
 *
 * Query params:
 *   ?employee=NAME          (required)
 *   ?last_n=12              (default 12, max 24)
 *
 * Performance: la prima chiamata "scalda" la cache di buildCreatorMatrix
 * per N periodi. Le chiamate successive sono istantanee (cache in-memory
 * per process). Calcoli serializzati per non esplodere KV concurrency.
 *
 * Auth: qualsiasi utente loggato.
 */
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";

function lastMonthIds(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthsBetween(startId, endId) {
  if (!startId || !endId) return null;
  const [sy, sm] = startId.split("-").map(Number);
  const [ey, em] = endId.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  const lastN = Math.max(1, Math.min(24, parseInt(url.searchParams.get("last_n") || "12", 10)));
  if (!employee) return Response.json({ error: "employee required" }, { status: 400 });

  const periodIds = lastMonthIds(lastN);

  // 1. Quali mesi hanno dati CP (parallelo, leggero)
  const wagesCheck = await Promise.all(periodIds.map((pid) => kv.get(`cp:wages:${pid}`)));
  const syncedPeriods = periodIds.filter((_, i) => Array.isArray(wagesCheck[i]) && wagesCheck[i].length > 0);

  if (syncedPeriods.length === 0) {
    return Response.json({
      employee,
      history: [],
      tenure_months_cp: null,
      ltv_cp_eur: null,
      first_seen_period: null,
      last_seen_period: null,
      reason: "no_cp_data",
    });
  }

  // 2. Per ogni mese sync'd, estrai il dato dell'operatore dal matrix
  // Serializziamo per evitare di triggerare 12 matrix build paralleli (heavy su KV)
  const history = [];
  let ltv = 0;
  let firstSeen = null;
  let lastSeen = null;
  for (const pid of syncedPeriods.slice().reverse()) { // dal più vecchio al più recente
    const { matrix, operators } = await buildCreatorMatrix(pid);
    const op = operators?.[employee];
    const cells = matrix?.[employee] || {};
    const totalSales = Object.values(cells).reduce((s, c) => s + (c.sales || 0), 0);
    const totalShifts = Object.values(cells).reduce((s, c) => s + (c.shifts || 0), 0);
    if (totalSales <= 0 && (op?.score == null)) continue; // nessuna attività in questo mese
    if (!firstSeen) firstSeen = pid;
    lastSeen = pid;
    ltv += totalSales;
    history.push({
      period_id: pid,
      score: op?.score ?? null,
      tier: op?.tier ?? null,
      total_sales: Math.round(totalSales),
      total_shifts: Math.round(totalShifts * 10) / 10,
      reliable_creators: op?.reliable_creators_count ?? 0,
    });
  }

  // 3. Tenure: dal primo mese visto fino a oggi (inclusi mesi senza attività)
  const todayMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const tenure_months_cp = firstSeen ? monthsBetween(firstSeen, todayMonth) : null;

  return Response.json({
    employee,
    history,
    tenure_months_cp,
    ltv_cp_eur: Math.round(ltv),
    first_seen_period: firstSeen,
    last_seen_period: lastSeen,
    periods_count: history.length,
    looked_back: syncedPeriods.length,
  });
}
