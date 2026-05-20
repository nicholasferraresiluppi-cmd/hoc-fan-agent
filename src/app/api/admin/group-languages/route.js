/**
 * /api/admin/group-languages
 *
 * Permette di assegnare manualmente la lingua (eng/ita) di ogni Group,
 * override della detection automatica via regex (LANGUAGE_REGEX su nome
 * Group in leaderboard-config.js).
 *
 * La detection regex resta il default: "Team Bianca ITA" → ita.
 * L'override serve quando il nome Group NON contiene il marker (es. solo
 * "Bianca", "Camilla", ecc.) o quando vuoi forzare diversamente.
 *
 * Capability richiesta: SEED (admin only).
 *
 * GET → {
 *   overrides: { groupName: "eng"|"ita" },
 *   auto: { groupName: "eng"|"ita"|null },  // ciò che la regex rileva
 *   effective: { groupName: "eng"|"ita"|null },  // override > auto
 *   groups: [groupName, ...]                 // ordinato alfabetico
 * }
 *
 * PUT body:
 *   { overrides: { group: "eng"|"ita" } }  → upsert (sostituisce overrides totali)
 *   { action: "reset" }                     → cancella tutti gli override
 *   { action: "set", group, language }      → upsert singolo (language null = rimuove)
 *
 * KV: chiave `group_languages` → { groupName: "eng"|"ita" }
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { detectLanguage } from "@/lib/leaderboard-calc";

const KV_KEY = "group_languages";
const KV_IMPORTS_ZSET = "ops_kpi:imports";

const VALID_LANGUAGES = ["eng", "ita"];

/**
 * Carica gli override dal KV. Esportato per riuso da operational route.
 */
export async function loadGroupLanguages() {
  try {
    const data = await kv.get(KV_KEY);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * Lista di tutti i Group eligible (non-mass) dall'ultimo periodo importato.
 */
async function listAllGroups() {
  let lastPeriod = null;
  try {
    const list = await kv.zrange(KV_IMPORTS_ZSET, 0, 0, { rev: true });
    if (list && list.length > 0) lastPeriod = list[0];
  } catch {}
  if (!lastPeriod) return [];

  const records = await kv.get(`ops_kpi:${lastPeriod}`);
  if (!records || !Array.isArray(records)) return [];

  const set = new Set();
  for (const r of records) {
    if (r.group && !r.is_mass) set.add(r.group);
  }
  return Array.from(set).sort();
}

function validateOverrides(o) {
  if (!o || typeof o !== "object") return "overrides deve essere un oggetto.";
  for (const [g, lang] of Object.entries(o)) {
    if (typeof g !== "string" || !g.trim()) return `Group invalido: "${g}".`;
    if (!VALID_LANGUAGES.includes(lang)) {
      return `Lingua "${lang}" per "${g}" non valida. Accettate: ${VALID_LANGUAGES.join(", ")}.`;
    }
  }
  return null;
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const [overrides, groups] = await Promise.all([loadGroupLanguages(), listAllGroups()]);
  const auto = {};
  const effective = {};
  for (const g of groups) {
    const a = detectLanguage(g);
    auto[g] = a;
    effective[g] = overrides[g] || a;
  }
  return Response.json({ overrides, auto, effective, groups });
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { overrides, action, group, language } = body || {};

  if (action === "reset") {
    await kv.del(KV_KEY);
    return Response.json({ ok: true, action: "reset", message: "Override lingua cancellati." });
  }

  if (action === "set") {
    if (!group || typeof group !== "string" || !group.trim()) {
      return Response.json({ error: "group required" }, { status: 400 });
    }
    const current = await loadGroupLanguages();
    if (language === null || language === undefined || language === "") {
      delete current[group];
    } else if (!VALID_LANGUAGES.includes(language)) {
      return Response.json({ error: `language must be one of: ${VALID_LANGUAGES.join(", ")} or null to remove` }, { status: 400 });
    } else {
      current[group] = language;
    }
    await kv.set(KV_KEY, current);
    return Response.json({ ok: true, action: "set", group, language: language || null, overrides: current });
  }

  if (overrides !== undefined) {
    const err = validateOverrides(overrides);
    if (err) return Response.json({ error: err }, { status: 400 });
    await kv.set(KV_KEY, overrides);
    return Response.json({ ok: true, overrides });
  }

  return Response.json({ error: "Body deve includere overrides o action (reset|set)." }, { status: 400 });
}
