/**
 * /api/admin/employee-profile
 *
 * CRUD profili anagrafici operatori (start_date + note).
 * Capability richiesta: SEED (admin-only).
 *
 * Storage KV: chiave `employee_profile:{employee_name}` → JSON
 *   {
 *     employee: "Mario Rossi",
 *     start_date: "2025-01-15",          // YYYY-MM-DD, ingresso in agency
 *     note: "Veterano, mentor per i nuovi",
 *     updated_by: "user_xxxx",
 *     updated_at: 1716100000000
 *   }
 *
 * Indice: `employee_profile:_index` (set di employee names) per liste e
 * UI admin senza dover scansionare tutte le chiavi.
 *
 * GET     (no params)            → lista completa di tutti i profili
 * GET     ?employee=NAME         → singolo profilo (404 se non esiste)
 * POST    body { employee, start_date, note? }  → upsert
 * DELETE  ?employee=NAME         → rimuove
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

const INDEX_KEY = "employee_profile:_index";
const profileKey = (name) => `employee_profile:${name}`;

function isValidDate(s) {
  if (!s || typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.getTime() < Date.now() + 86400000;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");

  if (employee) {
    const profile = await kv.get(profileKey(employee));
    if (!profile) return Response.json({ error: "profile not found", employee }, { status: 404 });
    return Response.json({ profile });
  }

  // List all
  const names = (await kv.smembers(INDEX_KEY)) || [];
  if (names.length === 0) return Response.json({ profiles: [], count: 0 });
  const rows = await Promise.all(names.map((n) => kv.get(profileKey(n))));
  const profiles = rows.filter(Boolean).sort((a, b) => (a.employee || "").localeCompare(b.employee || ""));
  return Response.json({ profiles, count: profiles.length });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { employee, start_date, note } = body || {};
  if (!employee || typeof employee !== "string" || !employee.trim()) {
    return Response.json({ error: "employee (string) required" }, { status: 400 });
  }
  if (start_date && !isValidDate(start_date)) {
    return Response.json({ error: "start_date must be YYYY-MM-DD and not in the future" }, { status: 400 });
  }

  const name = employee.trim();
  const profile = {
    employee: name,
    start_date: start_date || null,
    note: typeof note === "string" ? note.trim() : "",
    updated_by: az.userId,
    updated_at: Date.now(),
  };
  await kv.set(profileKey(name), profile);
  await kv.sadd(INDEX_KEY, name);

  return Response.json({ ok: true, profile });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  if (!employee) return Response.json({ error: "?employee=NAME required" }, { status: 400 });

  const exists = await kv.get(profileKey(employee));
  if (!exists) return Response.json({ error: "profile not found" }, { status: 404 });

  await kv.del(profileKey(employee));
  await kv.srem(INDEX_KEY, employee);
  return Response.json({ ok: true, removed: employee });
}
