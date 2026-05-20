/**
 * /api/admin/underperformers-ignored
 *
 * Whitelist (lista "ignora dal computo da-cambiare") di operatori che
 * NON sono da considerare nel pannello Action Center anche se hanno
 * basso score. Pensato per dire "no, questo è ok lasciarlo, fai
 * scorrere il prossimo bottom".
 *
 * DIFFERENZA con `leaderboard:exclusions`:
 *   - exclusions   → operatore SCOMPARE da TUTTA la leaderboard (mass, SM, non-chatter)
 *   - ignored      → operatore RESTA in leaderboard, scompare solo dal pannello "da cambiare"
 *
 * Capability richiesta: SEED (admin-only).
 *
 * Storage KV: chiave `underperformers:ignored` → JSON
 *   {
 *     "Mario Rossi": {
 *       ignored_by: "user_xxxx",
 *       ignored_at: 1716100000000,
 *       note: "Ok cosi, in valutazione interna"
 *     },
 *     ...
 *   }
 *
 * GET     → lista completa { ignored: {...}, count }
 * POST    body { employee, note? }  → upsert
 * DELETE  ?employee=NAME            → rimuove (l'operatore rientra nel computo)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";

const KEY = "underperformers:ignored";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const ignored = (await kv.get(KEY)) || {};
  return Response.json({ ignored, count: Object.keys(ignored).length });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { employee, note } = body || {};
  if (!employee || typeof employee !== "string" || !employee.trim()) {
    return Response.json({ error: "employee (string) required" }, { status: 400 });
  }

  const name = employee.trim();
  const ignored = (await kv.get(KEY)) || {};
  const prev = ignored[name] || null;
  ignored[name] = {
    ignored_by: az.userId,
    ignored_at: Date.now(),
    note: typeof note === "string" ? note.trim() : "",
  };
  await kv.set(KEY, ignored);

  await logAuditAction({
    action: prev ? "ignored.update" : "ignored.add",
    target: name,
    by: az.userId,
    meta: { note: ignored[name].note, previous: prev },
  });

  return Response.json({ ok: true, employee: name, entry: ignored[name], total: Object.keys(ignored).length });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  if (!employee) return Response.json({ error: "?employee=NAME required" }, { status: 400 });

  const ignored = (await kv.get(KEY)) || {};
  if (!(employee in ignored)) return Response.json({ error: "employee not in ignore list" }, { status: 404 });

  const removed = ignored[employee];
  delete ignored[employee];
  await kv.set(KEY, ignored);

  await logAuditAction({
    action: "ignored.remove",
    target: employee,
    by: az.userId,
    meta: { removed_entry: removed },
  });

  return Response.json({ ok: true, removed: employee, total: Object.keys(ignored).length });
}
