/**
 * /api/admin/coaching-center
 *
 * Backend del pannello "Coaching Center" — gestisce i percorsi di coaching
 * per operatori Weak/Average con margini di crescita (parallelo all'Action Center
 * che invece gestisce le sostituzioni Critical).
 *
 * Capability richiesta: SEED (admin-only). In futuro potremmo aprire a sales_manager.
 *
 * Storage KV: chiave `coaching_center:assignments:{period_id}` → JSON
 *   {
 *     "Mario Rossi": {
 *       assigned_at: 1716100000000,
 *       assigned_by: "user_xxxx",
 *       status: "suggested" | "assigned" | "completed" | "rejected",
 *       training_category_id: "le-basi-della-chat",
 *       owner: "Team Lead name" | null,
 *       deadline: "2026-06-30" | null,
 *       note: ""
 *     }
 *   }
 *
 * GET    ?period_id=YYYY-MM             → ritorna candidati + assignments + filter counts
 * POST   body { period_id, employee, action, training_category_id?, owner?, deadline?, note? }
 *         → upsert (action="assign" | "complete" | "reject" | "set_note")
 * DELETE ?period_id=YYYY-MM&employee=N → rimuove entry
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCoachingCandidates } from "@/lib/coaching-center";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";
import { loadGroupLanguages } from "@/app/api/admin/group-languages/route";
import { detectLanguage } from "@/lib/leaderboard-calc";

const ASSIGN_KEY = (periodId) => `coaching_center:assignments:${periodId}`;

const VALID_ACTIONS = ["assign", "complete", "reject", "set_note"];
const VALID_STATUS = ["suggested", "assigned", "completed", "rejected"];

function isValidPeriod(p) { return typeof p === "string" && /^\d{4}-\d{2}$/.test(p); }

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });

  const cpAvail = await hasCpDataForPeriod(period_id);
  if (!cpAvail) {
    return Response.json({
      error: `Nessun dato CP sincronizzato per ${period_id}. Sync prima da /admin/creatorspro-sync.`,
      cp_available: false, candidates: [], assignments: {},
    }, { status: 404 });
  }

  // Carica Infloww scores se disponibili (per pattern detection)
  let inflowwScoreByEmployee = new Map();
  try {
    const infwUrl = new URL(request.url);
    infwUrl.pathname = "/api/leaderboard/operational";
    infwUrl.searchParams.set("period_type", "monthly");
    infwUrl.searchParams.set("period_id", period_id);
    // chiamata interna evitata: pattern detection lavora anche senza Infloww
  } catch {}

  const [assignments, candidates, categories, langOverrides] = await Promise.all([
    kv.get(ASSIGN_KEY(period_id)),
    buildCoachingCandidates(period_id, { inflowwScoreByEmployee }),
    loadGroupCategories(),
    loadGroupLanguages(),
  ]);
  const assignmentsObj = assignments || {};

  // Decora candidati con language/category dedotto dal group principale
  const decorated = candidates.map((c) => {
    const lang = langOverrides?.[c.top_creator] || detectLanguage(c.top_creator || "");
    return {
      ...c,
      group: c.top_creator,
      category: categories?.[c.top_creator] || null,
      language: lang || null,
      assignment: assignmentsObj[c.employee] || null,
    };
  });

  // Filter counts (lang / tier / group / pattern)
  const counts = { lang: {}, tier: {}, group: {}, pattern: {} };
  for (const c of decorated) {
    if (c.assignment?.status === "completed" || c.assignment?.status === "rejected") continue;
    counts.lang[c.language || "unknown"] = (counts.lang[c.language || "unknown"] || 0) + 1;
    if (c.tier) counts.tier[c.tier] = (counts.tier[c.tier] || 0) + 1;
    if (c.group) counts.group[c.group] = (counts.group[c.group] || 0) + 1;
    counts.pattern[c.pattern] = (counts.pattern[c.pattern] || 0) + 1;
  }

  return Response.json({
    cp_available: true,
    period_id,
    candidates: decorated,
    assignments: assignmentsObj,
    counts,
    total: decorated.length,
  });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }

  const { period_id, employee, action, training_category_id, owner, deadline, note, status } = body || {};
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee) return Response.json({ error: "employee required" }, { status: 400 });
  if (!VALID_ACTIONS.includes(action)) return Response.json({ error: `action invalid (${VALID_ACTIONS.join("|")})` }, { status: 400 });

  const key = ASSIGN_KEY(period_id);
  const assignments = (await kv.get(key)) || {};
  const existing = assignments[employee] || {};

  let next = { ...existing };
  if (action === "assign") {
    if (!training_category_id) return Response.json({ error: "training_category_id required for assign" }, { status: 400 });
    next = {
      ...next,
      assigned_at: existing.assigned_at || Date.now(),
      assigned_by: az.userId,
      status: "assigned",
      training_category_id,
      owner: owner || null,
      deadline: deadline || null,
      note: note ?? existing.note ?? "",
    };
  } else if (action === "complete") {
    next = { ...next, status: "completed", completed_at: Date.now(), completed_by: az.userId, note: note ?? existing.note ?? "" };
  } else if (action === "reject") {
    next = { ...next, status: "rejected", rejected_at: Date.now(), rejected_by: az.userId, note: note ?? existing.note ?? "" };
  } else if (action === "set_note") {
    next = { ...next, note: note ?? "" };
  }

  // override esplicito di status (es. dropdown UI)
  if (status && VALID_STATUS.includes(status)) {
    next.status = status;
  }

  assignments[employee] = next;
  await kv.set(key, assignments);

  await logAuditAction({
    actor: az.userId,
    action: `coaching.${action}`,
    target: employee,
    meta: { period_id, training_category_id, owner, deadline },
  }).catch(() => {});

  return Response.json({ ok: true, employee, assignment: next });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  const employee = url.searchParams.get("employee");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee) return Response.json({ error: "employee required" }, { status: 400 });

  const key = ASSIGN_KEY(period_id);
  const assignments = (await kv.get(key)) || {};
  delete assignments[employee];
  await kv.set(key, assignments);

  await logAuditAction({
    actor: az.userId,
    action: "coaching.delete",
    target: employee,
    meta: { period_id },
  }).catch(() => {});

  return Response.json({ ok: true, employee });
}
