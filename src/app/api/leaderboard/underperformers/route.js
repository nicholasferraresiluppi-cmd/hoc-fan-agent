/**
 * GET /api/leaderboard/underperformers
 *
 * Top N "operatori da cambiare": bottom score corrente filtrati per
 * cronicità (almeno minChronic dei lookback periodi precedenti erano
 * sotto tier "Average"). Aiuta a distinguere chi ha avuto un mese
 * storto da chi è cronicamente debole.
 *
 * Capability richiesta: SEED (admin-only). I dati sono sensibili —
 * vista per chi decide su ricambio team.
 *
 * Query params:
 *   ?period_type=monthly|weekly|quarterly  (default: monthly)
 *   ?period_id=2026-05                     (required)
 *   ?lookback=3                            (default 3, max 12)
 *   ?min_chronic=2                         (default 2)
 *   ?limit=10                              (default 10, max 50)
 *   ?language=eng|ita                      (opzionale, filtra per lingua del Group)
 *
 * Response:
 *   {
 *     period_type, period_id, lookback, min_chronic,
 *     underperformers: [
 *       { employee, group, language, score, tier, rank,
 *         chronic_count, lookback_total,
 *         history: [{period_id, score, tier}] }
 *     ]
 *   }
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { computeUnderperformers } from "@/lib/leaderboard-history";

const VALID_PERIOD_TYPES = ["monthly", "weekly", "quarterly"];
const VALID_LANGUAGES = ["eng", "ita"];
const IGNORED_KEY = "underperformers:ignored";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_type = url.searchParams.get("period_type") || "monthly";
  const period_id = url.searchParams.get("period_id");
  const lookback = Math.max(0, Math.min(12, parseInt(url.searchParams.get("lookback") || "3", 10)));
  const min_chronic = Math.max(0, Math.min(12, parseInt(url.searchParams.get("min_chronic") || "2", 10)));
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "10", 10)));
  const language = url.searchParams.get("language");

  if (!VALID_PERIOD_TYPES.includes(period_type)) {
    return Response.json({ error: `period_type must be one of: ${VALID_PERIOD_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!period_id) {
    return Response.json({ error: "period_id required" }, { status: 400 });
  }
  if (language && !VALID_LANGUAGES.includes(language)) {
    return Response.json({ error: `language must be one of: ${VALID_LANGUAGES.join(", ")}` }, { status: 400 });
  }

  const ignoredObj = (await kv.get(IGNORED_KEY)) || {};
  const ignoredSet = new Set(Object.keys(ignoredObj));

  const underperformers = await computeUnderperformers({
    periodType: period_type,
    currentPeriodId: period_id,
    lookback,
    minChronic: min_chronic,
    limit,
    languageFilter: language || null,
    ignoredSet,
  });

  return Response.json({
    period_type,
    period_id,
    lookback,
    min_chronic,
    language: language || null,
    count: underperformers.length,
    ignored_count: ignoredSet.size,
    underperformers,
  });
}
