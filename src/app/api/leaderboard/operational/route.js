/**
 * GET /api/leaderboard/operational
 *
 * Restituisce la leaderboard operativa calcolata dai dati Infloww importati.
 * Visibilità: TUTTI gli operatori autenticati. È materiale pubblico al team.
 *
 * Query params:
 *   ?period_type=monthly|weekly|quarterly  (required)
 *   ?period_id=2026-02 ecc.                 (required)
 *   ?clock_in=yes|no                        (default: no)
 *   ?group=GROUP_NAME                       (opzionale, filtra per group)
 *   ?category=Big|Medium|Small              (opzionale, filtra per categoria Group)
 *   ?language=eng|ita                       (opzionale, filtra per lingua del Group)
 *   ?include_excluded=1                     (opzionale, mostra gli esclusi — solo per audit)
 *   ?include_zero=1                         (opzionale, mostra anche score=0)
 *
 * v11: aggiunto filtro categoria Group. Ogni record include r.category basato
 *      sulla mappa salvata in ops_kpi:group_categories.
 * v12: aggiunto filtro language (ENG/ITA dedotto dal nome Group) + denylist
 *      manuale operatori (KV `leaderboard:exclusions`). Score=0 e operatori
 *      esclusi (mass/manual/non_chatter/data_quality/no_group_data) sono
 *      nascosti per default; usa include_excluded=1 e include_zero=1 per
 *      vederli (es. pagina audit /admin/leaderboard-exclusions).
 * v13: aggregati per creator (sales/purch totali del profilo) + creator_impact
 *      per ogni operatore (share_eur, share_pct, estimated:true per multi-creator).
 *      I totali per creator sono calcolati su TUTTI gli operatori eligible del
 *      periodo (ignorando i filtri di vista) per non far cambiare la % col filtro.
 */
import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { buildLeaderboard } from "@/lib/leaderboard-calc";
import { loadSettings } from "@/app/api/admin/leaderboard-settings/route";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";

const VALID_CATEGORIES = ["Big", "Medium", "Small"];
const VALID_LANGUAGES = ["eng", "ita"];
const EXCLUSIONS_KEY = "leaderboard:exclusions";

/**
 * Calcola aggregati per creator (sales totali + purch totali) distribuendo
 * equamente le metriche di ogni operatore tra i suoi creators[].
 * Es. operatore O con sales=$1500 e creators=["Bianca","Giulia","Sara"]
 *     → contribuisce $500 a Bianca, $500 a Giulia, $500 a Sara.
 * Per operatori mono-creator il contributo è 100% delle loro sales su quel creator.
 *
 * La somma di tutti i contributi su ogni creator NON è esatta nel mondo reale
 * (un chatter può concentrare 90% del fatturato su un singolo creator), ma è
 * la migliore stima possibile dato che Infloww non fornisce il breakdown
 * operatore×creator. Per gli operatori mono-creator (estimated:false) il
 * dato è esatto.
 */
function buildCreatorAggregates(eligibleRecords) {
  const agg = {};
  for (const op of eligibleRecords) {
    const creators = Array.isArray(op.creators) ? op.creators.filter(Boolean) : [];
    if (creators.length === 0) continue;
    const sharePerCreator = (op.sales || 0) / creators.length;
    const purchSharePerCreator = (op.ppvs_unlocked || 0) / creators.length;
    for (const creator of creators) {
      if (!agg[creator]) {
        agg[creator] = { total_sales: 0, total_purch: 0, contributors: 0, top_operator: null, _top_share: 0 };
      }
      agg[creator].total_sales += sharePerCreator;
      agg[creator].total_purch += purchSharePerCreator;
      agg[creator].contributors += 1;
      if (sharePerCreator > agg[creator]._top_share) {
        agg[creator]._top_share = sharePerCreator;
        agg[creator].top_operator = op.employee;
      }
    }
  }
  // Pulizia: arrotonda e rimuovi _top_share interno
  for (const c of Object.keys(agg)) {
    agg[c].total_sales = Math.round(agg[c].total_sales);
    agg[c].total_purch = Math.round(agg[c].total_purch);
    delete agg[c]._top_share;
  }
  return agg;
}

/**
 * Decora un record con creator_impact e top_creator.
 * creator_impact: array ordinato per share_eur desc, ciascun elemento ha
 *   { creator, share_eur, share_pct, total_creator_sales, total_creator_purch, estimated }.
 * top_creator: shortcut per la card (creator con share_eur più alto).
 */
function decorateCreatorImpact(op, aggregates) {
  const creators = Array.isArray(op.creators) ? op.creators.filter(Boolean) : [];
  if (creators.length === 0) return { ...op, creator_impact: [], top_creator: null };
  const isMono = creators.length === 1;
  const sharePerCreator = (op.sales || 0) / creators.length;
  const purchSharePerCreator = (op.ppvs_unlocked || 0) / creators.length;
  const impact = creators
    .map((creator) => {
      const ag = aggregates[creator];
      const total = ag?.total_sales || 0;
      return {
        creator,
        share_eur: Math.round(sharePerCreator),
        share_purch: Math.round(purchSharePerCreator),
        share_pct: total > 0 ? Math.round((sharePerCreator / total) * 1000) / 10 : 0,
        total_creator_sales: ag?.total_sales || 0,
        total_creator_purch: ag?.total_purch || 0,
        estimated: !isMono,
      };
    })
    .sort((a, b) => b.share_eur - a.share_eur);
  const top = impact[0];
  return {
    ...op,
    creator_impact: impact,
    top_creator: top
      ? { creator: top.creator, share_pct: top.share_pct, share_eur: top.share_eur, estimated: top.estimated }
      : null,
  };
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  const url = new URL(request.url);
  const period_type = url.searchParams.get("period_type");
  const period_id = url.searchParams.get("period_id");
  const clock_in = url.searchParams.get("clock_in") === "yes";
  const group_filter = url.searchParams.get("group");
  const category_filter = url.searchParams.get("category");
  const language_filter = url.searchParams.get("language");
  const include_excluded = url.searchParams.get("include_excluded") === "1";
  const include_zero = url.searchParams.get("include_zero") === "1";

  if (!period_type || !["weekly", "monthly", "quarterly"].includes(period_type)) {
    return Response.json(
      { error: "period_type must be weekly|monthly|quarterly" },
      { status: 400 }
    );
  }
  if (!period_id) {
    return Response.json({ error: "period_id required" }, { status: 400 });
  }
  if (category_filter && !VALID_CATEGORIES.includes(category_filter)) {
    return Response.json(
      { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }
  if (language_filter && !VALID_LANGUAGES.includes(language_filter)) {
    return Response.json(
      { error: `language must be one of: ${VALID_LANGUAGES.join(", ")}` },
      { status: 400 }
    );
  }

  // Carica i dati dal KV
  const key = `ops_kpi:${period_type}:${period_id}`;
  const records = await kv.get(key);
  if (!records || !Array.isArray(records) || records.length === 0) {
    return Response.json(
      {
        error: `Nessun dato disponibile per ${period_type}:${period_id}. Importa prima un CSV.`,
        period_type,
        period_id,
        ranking: [],
        groups: [],
        groupAverages: {},
        categories: {},
        creatorAggregates: {},
      },
      { status: 404 }
    );
  }

  // Carica settings dinamici, categorie Group e denylist manuale in parallelo
  let settings;
  let categories = {};
  let manualExclusions = {};
  try {
    const [loaded, cats, excl] = await Promise.all([
      loadSettings(),
      loadGroupCategories(),
      kv.get(EXCLUSIONS_KEY),
    ]);
    settings = {
      weights: loaded.weights,
      thresholds: loaded.thresholds,
      tiers: loaded.tiers,
    };
    categories = cats || {};
    manualExclusions = excl || {};
  } catch (e) {
    console.error("loadSettings/categories/exclusions error, falling back to defaults:", e);
    settings = {};
    categories = {};
    manualExclusions = {};
  }

  // Calcola la leaderboard
  const mode = clock_in ? "withClockIn" : "withoutClockIn";
  let ranking;
  let groupAverages;
  try {
    const result = buildLeaderboard(records, mode, settings, manualExclusions);
    ranking = result.ranking;
    groupAverages = result.groupAverages;
  } catch (e) {
    console.error("buildLeaderboard error:", e);
    return Response.json(
      { error: "Errore nel calcolo della leaderboard.", reason: String(e?.message || e) },
      { status: 500 }
    );
  }

  // Calcola creator aggregates su TUTTI gli eligible (pre-filtri di vista).
  // Così la % impatto resta stabile anche cambiando filtri Group/Categoria/Lingua.
  const eligibleForAggregates = ranking.filter((r) => !r._excluded_reason && r.score !== null && r.score > 0);
  const creatorAggregates = buildCreatorAggregates(eligibleForAggregates);

  // Decora ogni record con la categoria del proprio Group + creator_impact
  ranking = ranking.map((r) => decorateCreatorImpact({ ...r, category: categories[r.group] || null }, creatorAggregates));

  // Filtro per group (se richiesto)
  if (group_filter) {
    ranking = ranking.filter((r) => r.group === group_filter);
  }

  // Filtro per categoria (se richiesto)
  if (category_filter) {
    ranking = ranking.filter((r) => r.category === category_filter);
  }

  // Filtro per lingua (se richiesto)
  if (language_filter) {
    ranking = ranking.filter((r) => r.language === language_filter);
  }

  // Visibilità di default: nascondi esclusi e score=0.
  // Per la pagina audit /admin/leaderboard-exclusions usa include_excluded=1 + include_zero=1.
  if (!include_excluded) {
    ranking = ranking.filter((r) => !r._excluded_reason);
  }
  if (!include_zero) {
    ranking = ranking.filter((r) => r.score === null || r.score > 0);
  }

  // Re-rank dopo filtri (se almeno uno è applicato)
  if (group_filter || category_filter || language_filter || !include_excluded || !include_zero) {
    let rank = 1;
    for (const r of ranking) {
      if (r.score !== null && r.score > 0) r.rank = rank++;
      else r.rank = null;
    }
  }

  // Lista group disponibili per dropdown — solo group con almeno 1 operatore non-mass
  const eligibleGroups = new Set();
  for (const r of records) {
    if (r.group && !r.is_mass) eligibleGroups.add(r.group);
  }
  const groups = Array.from(eligibleGroups).sort();

  // Conta mass esclusi
  const massExcluded = records.filter((r) => r.is_mass).length;

  // Statistiche di overview — calcolate sui visibili (eligible)
  const eligibleRanking = ranking.filter((r) => r.score !== null && r.score > 0);
  const avgScore = eligibleRanking.length > 0
    ? eligibleRanking.reduce((sum, r) => sum + r.score, 0) / eligibleRanking.length
    : 0;
  const tierCounts = {};
  for (const r of eligibleRanking) {
    if (r.tier) tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
  }
  const categoryCounts = { Big: 0, Medium: 0, Small: 0, Uncategorized: 0 };
  for (const r of eligibleRanking) {
    if (r.category && categoryCounts[r.category] !== undefined) categoryCounts[r.category] += 1;
    else categoryCounts.Uncategorized += 1;
  }

  // Counts per lingua su tutti i record (utile per UI)
  const languageCounts = { eng: 0, ita: 0, unknown: 0 };
  for (const r of eligibleRanking) {
    if (r.language === "eng") languageCounts.eng += 1;
    else if (r.language === "ita") languageCounts.ita += 1;
    else languageCounts.unknown += 1;
  }

  // Manual exclusions stats (utile per audit page)
  const manualExclusionCount = Object.keys(manualExclusions).length;

  return Response.json({
    period_type,
    period_id,
    clock_in_mode: clock_in,
    ranking,
    groups,
    groupAverages,
    categories,
    creatorAggregates,
    total: ranking.length,
    eligible_total: eligibleRanking.length,
    mass_excluded: massExcluded,
    manual_excluded: manualExclusionCount,
    avg_score: Math.round(avgScore * 10) / 10,
    elite_count: tierCounts["Elite"] || 0,
    strong_count: tierCounts["Strong"] || 0,
    tier_counts: tierCounts,
    category_counts: categoryCounts,
    language_counts: languageCounts,
    creators_count: Object.keys(creatorAggregates).length,
    tiers: settings.tiers,
  });
}
