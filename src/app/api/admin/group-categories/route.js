/**
 * /api/admin/group-categories
 *
 * Permette di assegnare ogni Group a una categoria Big / Medium / Small.
 * Usato come filtro nella Leaderboard Operativa (vista). Lo Score di ogni
 * operatore continua a essere calcolato sulla media del proprio Group
 * specifico — la categoria è solo un filtro di vista (opzione A).
 *
 * Capability richiesta: SEED (admin only).
 *
 * GET → ritorna {
 *   assignments: { group: "Big"|"Medium"|"Small" },   // override manuali da KV
 *   suggestions: { group: "Big"|"Medium"|"Small" },   // calcolati on-the-fly dai dati ultimo periodo
 *   stats: { group: { paying_fans, sales, operators_count } },
 *   reference_period: "monthly:2026-03",
 * }
 *
 * PUT → body { assignments: { group: cat } } salva in KV.
 *       Oppure { action: "reset" } cancella tutte le assignments.
 *       Oppure { action: "apply_suggestions" } prende le suggestions correnti
 *       e le salva come assignments.
 *
 * KV keys:
 *   ops_kpi:group_categories  →  { groupName: "Big"|"Medium"|"Small", ... }
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

const KV_CATEGORIES = "ops_kpi:group_categories";
const KV_IMPORTS_ZSET = "ops_kpi:imports";

const VALID_CATEGORIES = ["Big", "Medium", "Small"];

/**
 * Carica le category assignments dal KV.
 * Esportato per riuso da altre route.
 */
export async function loadGroupCategories() {
  try {
    const data = await kv.get(KV_CATEGORIES);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * Calcola group stats sull'ultimo periodo importato.
 * Ritorna { stats, suggestions, period }.
 */
async function computeStatsAndSuggestions() {
  // Trova l'ultimo period importato
  let lastPeriod = null;
  try {
    const list = await kv.zrange(KV_IMPORTS_ZSET, 0, 0, { rev: true });
    if (list && list.length > 0) lastPeriod = list[0];
  } catch {}

  if (!lastPeriod) {
    return { stats: {}, suggestions: {}, period: null };
  }

  const records = await kv.get(`ops_kpi:${lastPeriod}`);
  if (!records || !Array.isArray(records)) {
    return { stats: {}, suggestions: {}, period: lastPeriod };
  }

  const stats = {};
  for (const r of records) {
    if (!r.group || r.is_mass) continue;
    if (!stats[r.group]) {
      stats[r.group] = { paying_fans: 0, sales: 0, operators: new Set(), records: 0 };
    }
    stats[r.group].paying_fans += r.fans_who_spent_money || 0;
    stats[r.group].sales += r.sales || 0;
    if (r.employee) stats[r.group].operators.add(r.employee);
    stats[r.group].records += 1;
  }

  // Converte Set in count
  const flatStats = {};
  for (const [g, s] of Object.entries(stats)) {
    flatStats[g] = {
      paying_fans: s.paying_fans,
      sales: Math.round(s.sales * 100) / 100,
      operators_count: s.operators.size,
      records: s.records,
    };
  }

  // Calcola suggestions per tertili sul paying_fans (più rappresentativo del volume reale)
  const suggestions = {};
  const groupsByFans = Object.entries(flatStats)
    .sort((a, b) => b[1].paying_fans - a[1].paying_fans);
  const total = groupsByFans.length;
  if (total > 0) {
    const bigCount = Math.max(1, Math.ceil(total / 3));
    const mediumCount = Math.max(1, Math.ceil(total / 3));
    groupsByFans.forEach(([g], i) => {
      if (i < bigCount) suggestions[g] = "Big";
      else if (i < bigCount + mediumCount) suggestions[g] = "Medium";
      else suggestions[g] = "Small";
    });
  }

  return { stats: flatStats, suggestions, period: lastPeriod };
}

/* =================================================
 * Validators
 * ================================================= */

function validateAssignments(a) {
  if (!a || typeof a !== "object") return "assignments deve essere un oggetto.";
  for (const [g, cat] of Object.entries(a)) {
    if (typeof g !== "string" || !g.trim()) return `Group invalido: "${g}".`;
    if (!VALID_CATEGORIES.includes(cat)) {
      return `Categoria "${cat}" per "${g}" non valida. Accettate: ${VALID_CATEGORIES.join(", ")}.`;
    }
  }
  return null;
}

/* =================================================
 * Handlers
 * ================================================= */

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  const [assignments, computed] = await Promise.all([
    loadGroupCategories(),
    computeStatsAndSuggestions(),
  ]);
  return Response.json({
    assignments,
    suggestions: computed.suggestions,
    stats: computed.stats,
    reference_period: computed.period,
  });
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { assignments, action } = body || {};

  // Reset: cancella tutte le assignments
  if (action === "reset") {
    try {
      await kv.del(KV_CATEGORIES);
      return Response.json({
        ok: true,
        action: "reset",
        message: "Categorie ripristinate (nessun override).",
      });
    } catch (e) {
      return Response.json(
        { error: "Errore durante il reset.", reason: String(e?.message || e) },
        { status: 500 }
      );
    }
  }

  // Applica suggerimenti correnti come override
  if (action === "apply_suggestions") {
    try {
      const computed = await computeStatsAndSuggestions();
      if (!computed.suggestions || Object.keys(computed.suggestions).length === 0) {
        return Response.json(
          { error: "Nessun dato disponibile per calcolare i suggerimenti. Importa prima un CSV." },
          { status: 400 }
        );
      }
      await kv.set(KV_CATEGORIES, computed.suggestions);
      const updated = await loadGroupCategories();
      return Response.json({
        ok: true,
        action: "apply_suggestions",
        message: `Applicate categorie suggerite a ${Object.keys(computed.suggestions).length} Group.`,
        assignments: updated,
      });
    } catch (e) {
      return Response.json(
        { error: "Errore durante l'applicazione.", reason: String(e?.message || e) },
        { status: 500 }
      );
    }
  }

  // Salva assignments custom
  if (assignments !== undefined) {
    const err = validateAssignments(assignments);
    if (err) {
      return Response.json({ error: err }, { status: 400 });
    }
    try {
      await kv.set(KV_CATEGORIES, assignments);
      return Response.json({ ok: true, assignments });
    } catch (e) {
      return Response.json(
        { error: "Errore durante il salvataggio.", reason: String(e?.message || e) },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Body deve includere assignments o action." }, { status: 400 });
}
