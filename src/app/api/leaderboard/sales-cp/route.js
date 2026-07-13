/**
 * GET /api/leaderboard/sales-cp
 *
 * Leaderboard "Sales CP": score 0-100 calcolato sui KPI CreatorsPro
 * (sales/shift, sales/hour, volume, consistency, margin).
 *
 * Affianca dati Infloww come INFORMATIVI (non entrano nello score).
 *
 * Query params:
 *   ?period_id=YYYY-MM            (required, monthly only)
 *   ?language=eng|ita|none        (opzionale)
 *   ?category=Big|Medium|Small|Uncategorized
 *   ?group=GROUP_NAME             (opzionale)
 *   ?include_no_cp=1              (default 1 — mostra anche operatori senza CP data in fondo)
 *
 * Response:
 *   { ranking[], groupMeansCp, total, eligible_total, no_cp_count,
 *     cp_available, agency_stats, categories, language_counts, category_counts }
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { kv } from "@vercel/kv";
import { buildOperatorsForCpLeaderboard, hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";
import { loadGroupLanguages } from "@/app/api/admin/group-languages/route";
import { detectLanguage } from "@/lib/leaderboard-calc";

const VALID_CATEGORIES = ["Big", "Medium", "Small", "Uncategorized"];
const VALID_LANGUAGES = ["eng", "ita", "none"];

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  const language_filter = url.searchParams.get("language");
  const category_filter = url.searchParams.get("category");
  const group_filter = url.searchParams.get("group");
  const include_no_cp = url.searchParams.get("include_no_cp") !== "0"; // default true

  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }
  if (category_filter && !VALID_CATEGORIES.includes(category_filter)) {
    return Response.json({ error: `category invalid: ${category_filter}` }, { status: 400 });
  }
  if (language_filter && !VALID_LANGUAGES.includes(language_filter)) {
    return Response.json({ error: `language invalid: ${language_filter}` }, { status: 400 });
  }

  const cpAvailable = await hasCpDataForPeriod(period_id);
  if (!cpAvailable) {
    return Response.json({
      error: `Nessun dato CP sincronizzato per ${period_id}. Vai a /admin/creatorspro-sync per sincronizzare.`,
      period_id, ranking: [], cp_available: false,
    }, { status: 404 });
  }

  // Carica operators + arricchimento Group categoria/lingua
  const [operatorsRaw, categories, langOverrides, manualExclusions] = await Promise.all([
    buildOperatorsForCpLeaderboard(period_id),
    loadGroupCategories(),
    loadGroupLanguages(),
    kv.get("leaderboard:exclusions"),
  ]);

  // Decora ogni operator con language (override > regex), category, e filtra esclusi manuali
  const exclusions = manualExclusions || {};
  const decorated = operatorsRaw
    .filter((op) => !exclusions[op.employee]) // escludi denylist
    .map((op) => {
      const lang = langOverrides?.[op.group] || detectLanguage(op.group);
      return { ...op, category: categories?.[op.group] || null, language: lang || null };
    });

  // Build score (v3: deriva da creator-matrix con percentile blending)
  const { ranking: scored, groupMeansCp } = await buildCpLeaderboard(decorated, period_id);

  // Filtri di vista (post-score per non perdere counts globali)
  let view = scored;
  if (group_filter) view = view.filter((o) => o.group === group_filter);
  if (category_filter === "Uncategorized") view = view.filter((o) => !o.category);
  else if (category_filter) view = view.filter((o) => o.category === category_filter);
  if (language_filter === "none") view = view.filter((o) => !o.language);
  else if (language_filter) view = view.filter((o) => o.language === language_filter);

  // Re-rank dopo filtri
  let rank = 1;
  for (const r of view) {
    if (r.score !== null && r.score > 0) r.rank = rank++;
    else r.rank = null;
  }

  // Counts globali (su scored pre-filtri di vista) per pill bar
  const allEligible = scored.filter((r) => r.score !== null && r.score > 0);
  const langCounts = { eng: 0, ita: 0, unknown: 0 };
  for (const r of allEligible) {
    if (r.language === "eng") langCounts.eng += 1;
    else if (r.language === "ita") langCounts.ita += 1;
    else langCounts.unknown += 1;
  }
  const catCounts = { Big: 0, Medium: 0, Small: 0, Uncategorized: 0 };
  for (const r of allEligible) {
    if (r.category && catCounts[r.category] !== undefined) catCounts[r.category] += 1;
    else catCounts.Uncategorized += 1;
  }

  // Optional: rimuovi no-CP operators dal ranking visibile
  if (!include_no_cp) view = view.filter((r) => r.has_cp_data);

  // Stats agency
  const eligibleView = view.filter((r) => r.score !== null && r.score > 0);
  const avgScore = eligibleView.length > 0
    ? eligibleView.reduce((s, r) => s + r.score, 0) / eligibleView.length
    : 0;
  const tierCounts = {};
  for (const r of eligibleView) if (r.tier) tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
  const totalCpSales = eligibleView.reduce((s, r) => s + (r.cp_aggregates?.total_sales || 0), 0);
  const totalCpShifts = eligibleView.reduce((s, r) => s + (r.cp_aggregates?.total_shifts || 0), 0);

  // Lista groups per dropdown (solo da operatori CP eligible)
  const eligibleGroups = new Set();
  for (const r of scored) if (r.group && r.has_cp_data) eligibleGroups.add(r.group);

  return Response.json({
    period_id,
    cp_available: true,
    ranking: view,
    groupMeansCp,
    groups: Array.from(eligibleGroups).sort(),
    total: view.length,
    eligible_total: eligibleView.length,
    no_cp_count: scored.filter((r) => !r.has_cp_data).length,
    avg_score: Math.round(avgScore * 10) / 10,
    elite_count: tierCounts["Elite"] || 0,
    strong_count: tierCounts["Strong"] || 0,
    tier_counts: tierCounts,
    category_counts: catCounts,
    language_counts: langCounts,
    agency: {
      total_sales: Math.round(totalCpSales),
      total_shifts: totalCpShifts,
      avg_sales_per_shift: totalCpShifts > 0 ? Math.round((totalCpSales / totalCpShifts) * 100) / 100 : 0,
    },
  });
}
