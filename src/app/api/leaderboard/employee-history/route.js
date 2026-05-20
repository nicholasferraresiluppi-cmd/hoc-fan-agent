/**
 * GET /api/leaderboard/employee-history
 *
 * Storico cross-period di un singolo operatore + profilo anagrafico
 * (start_date, LTV, tempo in agency).
 *
 * Visibilità: tutti gli operatori autenticati. La "carta giocatore"
 * stile FIFA è motivante e va vista da chiunque.
 *
 * Query params:
 *   ?employee=NAME              (required)
 *   ?period_type=monthly|weekly|quarterly  (default: monthly)
 *
 * Response:
 *   {
 *     employee, period_type,
 *     profile: { start_date?, note?, tenure_months? } | null,
 *     ltv: { ltv_eur, total_purch, periods_count, first_seen, last_seen },
 *     history: [ { period_id, score, tier, rank, sales, ppvs_unlocked, ... } ]
 *   }
 *
 * NB: "tenure_months" è derivato da start_date se presente, altrimenti
 * dal primo period_id visto in KV (fallback approssimato, segnalato da
 * `tenure_inferred: true`).
 */
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { loadHistoryForEmployee, computeEmployeeLTV } from "@/lib/leaderboard-history";

const VALID_PERIOD_TYPES = ["monthly", "weekly", "quarterly"];

/**
 * Stima mesi da una data ISO (YYYY-MM-DD) a oggi. Approx 30.44 giorni.
 */
function monthsSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44) * 10) / 10);
}

/**
 * Fallback tenure dal primo period_id visto in storico (per monthly).
 * Es. first_seen = "2025-01" → ~16 mesi al 2026-05.
 */
function monthsBetweenPeriodIds(firstPeriod, periodType) {
  if (!firstPeriod) return null;
  if (periodType === "monthly") {
    const m = firstPeriod.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const start = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, 1));
    return Math.max(0, Math.round((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44) * 10) / 10);
  }
  // Per weekly/quarterly fallback meno preciso, ma in genere si chiede monthly
  return null;
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  const period_type = url.searchParams.get("period_type") || "monthly";

  if (!employee) return Response.json({ error: "employee required" }, { status: 400 });
  if (!VALID_PERIOD_TYPES.includes(period_type)) {
    return Response.json({ error: `period_type must be one of: ${VALID_PERIOD_TYPES.join(", ")}` }, { status: 400 });
  }

  const [history, ltv, profile] = await Promise.all([
    loadHistoryForEmployee({ employee, periodType: period_type }),
    computeEmployeeLTV({ employee, periodType: period_type }),
    kv.get(`employee_profile:${employee}`),
  ]);

  if (history.length === 0 && !profile) {
    return Response.json(
      { error: "Nessun dato disponibile per questo operatore.", employee, period_type, history: [], ltv, profile: null },
      { status: 404 }
    );
  }

  // Tenure calc
  let tenure_months = null;
  let tenure_inferred = false;
  if (profile?.start_date) {
    tenure_months = monthsSince(profile.start_date);
  } else if (ltv.first_seen) {
    tenure_months = monthsBetweenPeriodIds(ltv.first_seen, period_type);
    tenure_inferred = true;
  }

  return Response.json({
    employee,
    period_type,
    profile: profile || null,
    tenure_months,
    tenure_inferred,
    ltv,
    history,
  });
}
