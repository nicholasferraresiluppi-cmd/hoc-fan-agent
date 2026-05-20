/**
 * /api/admin/leaderboard-exclusions
 *
 * Gestione denylist manuale operatori per la leaderboard operativa.
 * Capability richiesta: SEED (admin-only).
 *
 * Storage KV: chiave `leaderboard:exclusions` → oggetto JSON
 *   {
 *     "Mario Rossi": {
 *       reason: "non_chatter" | "manual" | "data_quality",
 *       note: "SM, non opera in chat",
 *       added_by: "user_xxxx",
 *       added_at: 1716100000000
 *     },
 *     ...
 *   }
 *
 * GET     → lista esclusioni
 * POST    → aggiunge/aggiorna esclusione (body: { employee, reason, note? })
 * DELETE  → rimuove esclusione (query: ?employee=NAME)
 *
 * Nota: account "Mass" non vanno qui — sono filtrati automaticamente via
 * MASS_ACCOUNT_REGEX in leaderboard-config.js.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { MANUAL_EXCLUSION_REASONS } from "@/lib/leaderboard-config";
import { logAuditAction } from "@/lib/audit-log";

const KEY = "leaderboard:exclusions";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  const exclusions = (await kv.get(KEY)) || {};
  return Response.json({
    exclusions,
    count: Object.keys(exclusions).length,
    valid_reasons: MANUAL_EXCLUSION_REASONS,
  });
}

export async function POST(request) {
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

  const { employee, reason, note } = body || {};
  if (!employee || typeof employee !== "string" || !employee.trim()) {
    return Response.json({ error: "employee (string) required" }, { status: 400 });
  }
  if (!MANUAL_EXCLUSION_REASONS.includes(reason)) {
    return Response.json(
      { error: `reason must be one of: ${MANUAL_EXCLUSION_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  const name = employee.trim();
  const exclusions = (await kv.get(KEY)) || {};
  const prev = exclusions[name] || null;
  exclusions[name] = {
    reason,
    note: typeof note === "string" ? note.trim() : "",
    added_by: az.userId,
    added_at: Date.now(),
  };
  await kv.set(KEY, exclusions);

  await logAuditAction({
    action: prev ? "exclusion.update" : "exclusion.add",
    target: name,
    by: az.userId,
    meta: { reason, note: exclusions[name].note, previous: prev },
  });

  return Response.json({
    ok: true,
    employee: name,
    entry: exclusions[name],
    total: Object.keys(exclusions).length,
  });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  if (!employee) {
    return Response.json({ error: "?employee=NAME required" }, { status: 400 });
  }

  const exclusions = (await kv.get(KEY)) || {};
  if (!(employee in exclusions)) {
    return Response.json({ error: "employee not in exclusions list" }, { status: 404 });
  }
  const removed = exclusions[employee];
  delete exclusions[employee];
  await kv.set(KEY, exclusions);

  await logAuditAction({
    action: "exclusion.remove",
    target: employee,
    by: az.userId,
    meta: { removed_entry: removed },
  });

  return Response.json({
    ok: true,
    removed: employee,
    total: Object.keys(exclusions).length,
  });
}
