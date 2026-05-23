/**
 * GET /api/leaderboard/periods
 *
 * Ritorna gli ultimi N mesi con stato "syncato (con dati) / vuoto",
 * più il periodo più recente con dati effettivi.
 *
 * Usato da useSmartPeriod() per atterrare sul mese giusto al primo login.
 *
 * Auth: qualsiasi utente loggato (pattern come altri /api/leaderboard/*).
 *
 * Query params:
 *   ?last_n=24   (default 24, max 36)
 *
 * Response:
 *   {
 *     last_period_with_data: "YYYY-MM" | null,
 *     periods: [{ period_id, has_data, wages_count }]   // desc
 *   }
 */
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";

function lastMonthIds(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const lastN = Math.max(1, Math.min(36, parseInt(url.searchParams.get("last_n") || "24", 10)));
  const periodIds = lastMonthIds(lastN);

  const wagesArr = await Promise.all(periodIds.map((pid) => kv.get(`cp:wages:${pid}`)));

  const periods = periodIds.map((pid, i) => {
    const wages = Array.isArray(wagesArr[i]) ? wagesArr[i] : [];
    return { period_id: pid, has_data: wages.length > 0, wages_count: wages.length };
  });

  const lastWithData = periods.find((p) => p.has_data)?.period_id || null;

  return Response.json({ last_period_with_data: lastWithData, periods });
}
