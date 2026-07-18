import { kv } from "@vercel/kv";
import { loadSettings } from "@/app/api/admin/leaderboard-settings/route";

/**
 * Registro versionato della formula dello score operativo Infloww.
 *
 * Problema che risolve (gate 0b del benchmark, cfr docs/BENCHMARK_DEEP_STUDY.md e
 * docs/INFLOWW_SURFACE.md): lo score dei chatter alimenta i gate della career
 * ladder, ma i pesi/soglie/tier possono cambiare nel tempo (override runtime in
 * `ops_kpi:settings:*`). Se un mese è stato scorato con una formula e poi la
 * formula cambia, senza traccia non è più ricostruibile *con quale* formula quel
 * mese è stato valutato — e una correzione/appello (CAREER_LADDER §8.2) diventa
 * indifendibile. Qui congeliamo la formula effettiva al momento di ogni import.
 *
 * KV:
 *   ops_kpi:score_snapshot:{period_type}:{period_id} → snapshot (oggetto)
 *   ops_kpi:score_snapshots                          → ZSET (score=ts, member=`{pt}:{pid}`)
 *
 * Additivo e non bloccante: un errore qui NON deve mai far fallire un import.
 */

const SNAP_KEY = (pt, pid) => `ops_kpi:score_snapshot:${pt}:${pid}`;
const SNAP_INDEX = "ops_kpi:score_snapshots";

/**
 * Hash stabile e corto della formula (weights+thresholds+tiers), indipendente
 * dall'ordine delle chiavi. Serve solo come etichetta e per il confronto drift,
 * non per sicurezza — djb2, nessuna dipendenza crypto (edge-safe).
 */
export function configHash({ weights, thresholds, tiers }) {
  const stable = canonical({ weights, thresholds, tiers });
  let h = 5381;
  for (let i = 0; i < stable.length; i++) {
    h = ((h << 5) + h + stable.charCodeAt(i)) & 0xffffffff;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

/**
 * Congela la formula effettiva corrente per il periodo importato.
 * @param {{period_type:string, period_id:string, ts?:number, source?:string}} args
 * @returns {Promise<{ok:boolean, hash?:string, reason?:string}>}
 */
export async function snapshotScoreConfig({ period_type, period_id, ts, source = "import" }) {
  try {
    const settings = await loadSettings();
    const hash = configHash(settings);
    const capturedAt = ts || Date.now();
    const snapshot = {
      period_type,
      period_id,
      captured_at: capturedAt,
      captured_at_iso: new Date(capturedAt).toISOString(),
      source,
      hash,
      is_custom: settings.isCustom,
      weights: settings.weights,
      thresholds: settings.thresholds,
      tiers: settings.tiers,
    };
    await kv.set(SNAP_KEY(period_type, period_id), snapshot);
    await kv.zadd(SNAP_INDEX, { score: capturedAt, member: `${period_type}:${period_id}` });
    return { ok: true, hash };
  } catch (e) {
    // Non-bloccante per design: logghiamo e lasciamo proseguire l'import.
    console.error("snapshotScoreConfig error:", e);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Elenco degli snapshot per tipo di periodo, dal più recente al più vecchio,
 * con flag di drift: uno snapshot è "drifted" se la sua formula (hash) differisce
 * da quella del periodo cronologicamente precedente.
 * @param {{period_type?:string}} args
 */
export async function listScoreSnapshots({ period_type = "monthly" } = {}) {
  let members = [];
  try {
    // ZSET ordinato per timestamp crescente; filtriamo per tipo periodo.
    members = (await kv.zrange(SNAP_INDEX, 0, -1)) || [];
  } catch (e) {
    console.error("listScoreSnapshots zrange error:", e);
    return { period_type, snapshots: [], active_hash: null };
  }

  const wanted = members.filter((m) => String(m).startsWith(`${period_type}:`));
  const loaded = [];
  for (const m of wanted) {
    const [pt, ...rest] = String(m).split(":");
    const pid = rest.join(":");
    try {
      const snap = await kv.get(SNAP_KEY(pt, pid));
      if (snap) loaded.push(snap);
    } catch {}
  }

  // Ordina per period_id (etichetta comparabile: "2026-02" < "2026-03").
  loaded.sort((a, b) => String(a.period_id).localeCompare(String(b.period_id)));

  // Drift: confronto con il periodo precedente in ordine cronologico.
  const withDrift = loaded.map((snap, i) => {
    const prev = i > 0 ? loaded[i - 1] : null;
    const drift = prev ? prev.hash !== snap.hash : false;
    return {
      ...snap,
      drift_vs_prev: drift,
      prev_period_id: prev ? prev.period_id : null,
      prev_hash: prev ? prev.hash : null,
    };
  });

  // Più recente in cima per la vista.
  withDrift.reverse();
  const activeHash = configHash(await loadSettings());
  return { period_type, snapshots: withDrift, active_hash: activeHash };
}
