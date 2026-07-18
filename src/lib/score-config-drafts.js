import { kv } from "@vercel/kv";
import { buildLeaderboard } from "@/lib/leaderboard-calc";
import { listAvailablePeriods } from "@/lib/leaderboard-history";
import { loadSettings } from "@/app/api/admin/leaderboard-settings/route";
import { configHash } from "@/lib/score-config-snapshot";

/**
 * Bozze della formula score operativo Infloww con backtest e publish esplicito.
 * (Backlog benchmark #6 — governance cambi score in prodotto: pattern Ambition
 * pre-save simulation + Everstage Time Machine, cfr docs/BENCHMARK_DEEP_STUDY.md.)
 *
 * Design ADDITIVO, il path di scoring live non cambia:
 *   - la formula ATTIVA resta in `ops_kpi:settings:*` (letta da loadSettings come oggi);
 *   - le bozze vivono in un registro separato (pattern custom_roles di rbac.js);
 *   - il backtest replay-a i periodi storici reali con la bozza SENZA toccare nulla;
 *   - publish = scrittura esplicita della bozza nelle chiavi attive + archiviazione
 *     della formula precedente. Forward-only: i periodi già importati restano scorati
 *     con la formula del loro snapshot (ops_kpi:score_snapshot:*, gate 0b).
 *
 * KV:
 *   ops_kpi:score_draft:{id}   → oggetto bozza
 *   ops_kpi:score_drafts:all   → set degli id
 */

const DRAFT_KEY = (id) => `ops_kpi:score_draft:${id}`;
const DRAFT_INDEX = "ops_kpi:score_drafts:all";

const ACTIVE_KEYS = {
  weights: "ops_kpi:settings:weights",
  thresholds: "ops_kpi:settings:thresholds",
  tiers: "ops_kpi:settings:tiers",
};

export async function listDrafts() {
  let ids = [];
  try {
    ids = (await kv.smembers(DRAFT_INDEX)) || [];
  } catch {
    return [];
  }
  const drafts = [];
  for (const id of ids) {
    try {
      const d = await kv.get(DRAFT_KEY(id));
      if (d) drafts.push(d);
    } catch {}
  }
  // Più recenti in cima; le pubblicate/archiviate dopo le bozze attive.
  const rank = { draft: 0, published: 1, archived: 2 };
  drafts.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || (b.updated_at || 0) - (a.updated_at || 0));
  return drafts;
}

export async function getDraft(id) {
  if (!id) return null;
  try {
    return (await kv.get(DRAFT_KEY(id))) || null;
  } catch {
    return null;
  }
}

export async function saveDraft(draft) {
  await kv.set(DRAFT_KEY(draft.id), draft);
  await kv.sadd(DRAFT_INDEX, draft.id);
  return draft;
}

export async function deleteDraft(id) {
  await kv.del(DRAFT_KEY(id));
  await kv.srem(DRAFT_INDEX, id);
}

/** Crea una bozza copiando la formula attiva corrente (o un'altra bozza). */
export async function createDraft({ name, note = "", fromDraftId = null, createdBy = "" }) {
  let base;
  if (fromDraftId) {
    const src = await getDraft(fromDraftId);
    if (!src) throw new Error(`Bozza sorgente "${fromDraftId}" non trovata.`);
    base = { weights: src.weights, thresholds: src.thresholds, tiers: src.tiers };
  } else {
    const active = await loadSettings();
    base = { weights: active.weights, thresholds: active.thresholds, tiers: active.tiers };
  }
  const ts = Date.now();
  const draft = {
    id: `d${ts.toString(36)}`,
    name: name || `Bozza ${new Date(ts).toLocaleDateString("it-IT")}`,
    note,
    status: "draft",
    created_at: ts,
    updated_at: ts,
    created_by: createdBy,
    weights: base.weights,
    thresholds: base.thresholds,
    tiers: base.tiers,
    backtest: null,
  };
  return saveDraft(draft);
}

/**
 * Backtest: replay dei periodi storici reali con la formula della bozza,
 * confrontata con la formula attiva. Sola lettura, nessuna scrittura su settings.
 */
export async function runBacktest({ draft, period_type = "monthly", mode = "withoutClockIn", limit = 6 }) {
  const active = await loadSettings();
  const draftSettings = { weights: draft.weights, thresholds: draft.thresholds, tiers: draft.tiers };

  let exclusions = {};
  try {
    exclusions = (await kv.get("leaderboard:exclusions")) || {};
  } catch {}

  const periodIds = ((await listAvailablePeriods(period_type)) || []).slice(0, limit);
  const periods = [];

  for (const pid of periodIds) {
    let records = [];
    try {
      records = (await kv.get(`ops_kpi:${period_type}:${pid}`)) || [];
    } catch {}
    if (!records.length) continue;

    const cur = buildLeaderboard(records, mode, active, exclusions);
    const prop = buildLeaderboard(records, mode, draftSettings, exclusions);

    // score === null ⇒ escluso (manuale o mass account); score 0 resta in classifica.
    const curScored = cur.ranking.filter((r) => r.score !== null);
    const propScored = prop.ranking.filter((r) => r.score !== null);

    const tierCount = (rows, tiers) => {
      const counts = {};
      for (const t of tiers) counts[t.label] = 0;
      for (const r of rows) {
        const t = tiers.find((x) => r.score >= x.min && r.score <= x.max);
        if (t) counts[t.label] = (counts[t.label] || 0) + 1;
      }
      return counts;
    };

    const propByName = new Map(propScored.map((r) => [r.employee, r]));
    const deltas = [];
    for (const r of curScored) {
      const p = propByName.get(r.employee);
      if (!p) continue;
      deltas.push({ employee: r.employee, group: r.group, from: r.score, to: p.score, delta: p.score - r.score });
    }
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const meanDelta = deltas.length ? deltas.reduce((s, d) => s + d.delta, 0) / deltas.length : 0;

    const topN = (rows) => rows.slice(0, 10).map((r) => r.employee);
    const curTop = topN(curScored);
    const propTop = topN(propScored);
    const top10Changes = curTop.filter((e) => !propTop.includes(e)).length;

    periods.push({
      period_id: pid,
      eligible: curScored.length,
      tier_counts_current: tierCount(curScored, active.tiers),
      tier_counts_proposed: tierCount(propScored, draft.tiers),
      mean_delta: Number(meanDelta.toFixed(2)),
      top10_changes: top10Changes,
      top_movers: deltas.slice(0, 5).map((d) => ({ ...d, from: Number(d.from.toFixed(1)), to: Number(d.to.toFixed(1)), delta: Number(d.delta.toFixed(1)) })),
    });
  }

  return {
    run_at: Date.now(),
    period_type,
    mode,
    active_hash: configHash(active),
    draft_hash: configHash(draftSettings),
    same_as_active: configHash(active) === configHash(draftSettings),
    periods,
  };
}

/**
 * Publish: la bozza diventa la formula attiva. Archivia prima la formula corrente
 * come entry del registro (audit), poi scrive le chiavi `ops_kpi:settings:*`.
 * Da chiamare SOLO con conferma esplicita dell'admin (gestita dalla route).
 */
export async function publishDraft(id, { publishedBy = "" } = {}) {
  const draft = await getDraft(id);
  if (!draft) throw new Error(`Bozza "${id}" non trovata.`);
  if (draft.status !== "draft") throw new Error(`La bozza è in stato "${draft.status}", solo le bozze attive si pubblicano.`);

  // 1. Archivia la formula attiva corrente come entry di registro (audit trail).
  const active = await loadSettings();
  const ts = Date.now();
  const archived = {
    id: `a${ts.toString(36)}`,
    name: `Formula attiva fino al ${new Date(ts).toLocaleDateString("it-IT")}`,
    note: `Archiviata automaticamente al publish di "${draft.name}" (${draft.id}).`,
    status: "archived",
    created_at: ts,
    updated_at: ts,
    created_by: publishedBy,
    weights: active.weights,
    thresholds: active.thresholds,
    tiers: active.tiers,
    backtest: null,
  };
  await saveDraft(archived);

  // 2. La bozza diventa la formula attiva (stesse chiavi del PUT settings).
  await Promise.all([
    kv.set(ACTIVE_KEYS.weights, draft.weights),
    kv.set(ACTIVE_KEYS.thresholds, draft.thresholds),
    kv.set(ACTIVE_KEYS.tiers, draft.tiers),
  ]);

  // 3. Stato bozza → published.
  const published = { ...draft, status: "published", published_at: ts, published_by: publishedBy, updated_at: ts };
  await saveDraft(published);

  return { published, archived_id: archived.id, hash: configHash(draft) };
}
