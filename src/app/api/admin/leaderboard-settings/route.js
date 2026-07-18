/**
 * /api/admin/leaderboard-settings
 *
 * Permette di leggere e salvare i settings della Leaderboard Operativa
 * (pesi KPI, soglie di normalizzazione, soglie tier) — replicando il foglio
 * "Settings" del Sheets HOC.
 *
 * Capability richiesta: SEED (admin only).
 *
 * GET  → ritorna { weights, thresholds, tiers, isCustom: bool }
 *        Se nessun override in KV, ritorna i default da config + isCustom: false.
 *
 * PUT  → salva (parzialmente o totalmente) i settings.
 *        Body JSON: { weights?, thresholds?, tiers? }
 *        Validazione:
 *          - weights: somma pesi per ogni mode deve fare 1.00 (tolleranza ±0.001)
 *          - thresholds: array di {multiplier, score} con multiplier crescente
 *          - tiers: array di 6 oggetti {label, min, max, color}, range 0-100 contigui
 *
 * KV keys:
 *   ops_kpi:settings:weights      → { withClockIn: {...}, withoutClockIn: {...} }
 *   ops_kpi:settings:thresholds   → [ { multiplier, score }, ... ]
 *   ops_kpi:settings:tiers        → [ { label, min, max, color }, ... ]
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import {
  KPI_WEIGHTS,
  SCORE_TIERS,
  NORMALIZATION_THRESHOLDS,
} from "@/lib/leaderboard-config";

const KV_WEIGHTS = "ops_kpi:settings:weights";
const KV_THRESHOLDS = "ops_kpi:settings:thresholds";
const KV_TIERS = "ops_kpi:settings:tiers";

/**
 * Carica settings da KV con fallback ai default.
 * Esportato così le altre API (operational) lo possono riusare.
 */
export async function loadSettings() {
  let weights = null;
  let thresholds = null;
  let tiers = null;
  try {
    weights = await kv.get(KV_WEIGHTS);
  } catch {}
  try {
    thresholds = await kv.get(KV_THRESHOLDS);
  } catch {}
  try {
    tiers = await kv.get(KV_TIERS);
  } catch {}

  return {
    weights: weights || KPI_WEIGHTS,
    thresholds: thresholds || NORMALIZATION_THRESHOLDS,
    tiers: tiers || SCORE_TIERS,
    isCustom: {
      weights: !!weights,
      thresholds: !!thresholds,
      tiers: !!tiers,
    },
  };
}

/* =================================================
 * Validators
 * ================================================= */

export function validateWeights(w) {
  if (!w || typeof w !== "object") return "weights deve essere un oggetto.";
  for (const mode of ["withClockIn", "withoutClockIn"]) {
    if (!w[mode] || typeof w[mode] !== "object") {
      return `Manca la modalità "${mode}".`;
    }
    const vals = Object.values(w[mode]);
    if (vals.some((v) => typeof v !== "number" || v < 0 || v > 1)) {
      return `Pesi della modalità "${mode}" devono essere numeri tra 0 e 1.`;
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      return `La somma dei pesi della modalità "${mode}" è ${sum.toFixed(4)}, deve essere 1.00.`;
    }
  }
  return null;
}

export function validateThresholds(t) {
  if (!Array.isArray(t)) return "thresholds deve essere un array.";
  if (t.length < 2) return "thresholds richiede almeno 2 elementi.";
  for (let i = 0; i < t.length; i++) {
    const item = t[i];
    if (!item || typeof item.multiplier !== "number" || typeof item.score !== "number") {
      return `Elemento #${i + 1}: serve { multiplier: number, score: number }.`;
    }
    if (item.score < 0 || item.score > 100) {
      return `Elemento #${i + 1}: score deve essere 0-100.`;
    }
    if (item.multiplier <= 0) {
      return `Elemento #${i + 1}: multiplier deve essere > 0.`;
    }
    if (i > 0 && item.multiplier <= t[i - 1].multiplier) {
      return `Elemento #${i + 1}: multiplier deve essere strettamente crescente.`;
    }
    if (i > 0 && item.score <= t[i - 1].score) {
      return `Elemento #${i + 1}: score deve essere strettamente crescente.`;
    }
  }
  return null;
}

export function validateTiers(t) {
  if (!Array.isArray(t)) return "tiers deve essere un array.";
  if (t.length < 2) return "tiers richiede almeno 2 elementi.";
  for (let i = 0; i < t.length; i++) {
    const item = t[i];
    if (!item || typeof item.label !== "string" || !item.label.trim()) {
      return `Elemento #${i + 1}: serve label (string non vuota).`;
    }
    if (typeof item.min !== "number" || typeof item.max !== "number") {
      return `Elemento #${i + 1}: serve min e max numerici.`;
    }
    if (item.min < 0 || item.max > 100 || item.min > item.max) {
      return `Elemento #${i + 1} (${item.label}): min/max fuori range 0-100 o min > max.`;
    }
    if (i > 0 && item.min <= t[i - 1].max) {
      return `Tier "${item.label}": il min deve essere > max del tier precedente per evitare overlap.`;
    }
  }
  if (t[0].min !== 0) return `Il primo tier deve avere min=0 (oggi: ${t[0].min}).`;
  if (t[t.length - 1].max !== 100) return `L'ultimo tier deve avere max=100 (oggi: ${t[t.length - 1].max}).`;
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
  const settings = await loadSettings();
  return Response.json(settings);
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

  const { weights, thresholds, tiers, action } = body || {};

  // Action "reset" — cancella gli override (fallback ai default)
  if (action === "reset") {
    try {
      await Promise.all([
        kv.del(KV_WEIGHTS),
        kv.del(KV_THRESHOLDS),
        kv.del(KV_TIERS),
      ]);
      return Response.json({ ok: true, action: "reset", message: "Settings ripristinati ai default." });
    } catch (e) {
      return Response.json(
        { error: "Errore durante il reset.", reason: String(e?.message || e) },
        { status: 500 }
      );
    }
  }

  // Validazioni (solo per i campi presenti)
  if (weights !== undefined) {
    const err = validateWeights(weights);
    if (err) return Response.json({ error: `Weights non valido: ${err}` }, { status: 400 });
  }
  if (thresholds !== undefined) {
    const err = validateThresholds(thresholds);
    if (err) return Response.json({ error: `Thresholds non valido: ${err}` }, { status: 400 });
  }
  if (tiers !== undefined) {
    const err = validateTiers(tiers);
    if (err) return Response.json({ error: `Tiers non valido: ${err}` }, { status: 400 });
  }

  // Salva (solo i campi presenti)
  try {
    const ops = [];
    if (weights !== undefined) ops.push(kv.set(KV_WEIGHTS, weights));
    if (thresholds !== undefined) ops.push(kv.set(KV_THRESHOLDS, thresholds));
    if (tiers !== undefined) ops.push(kv.set(KV_TIERS, tiers));
    await Promise.all(ops);
    const settings = await loadSettings();
    return Response.json({ ok: true, ...settings });
  } catch (e) {
    return Response.json(
      { error: "Errore durante il salvataggio.", reason: String(e?.message || e) },
      { status: 500 }
    );
  }
}
