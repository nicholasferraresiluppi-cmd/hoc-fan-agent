/**
 * /api/admin/hr/people — elenco e creazione persone (Centro HR, SEED).
 *
 * GET  → { items (attive, senza CF), archived (schede archiviate), cleanup { byId, duplicates, junk } (solo attive), sync }
 * POST → crea una persona { ...campi } → salva in app e la porta su ClickUp
 *        (se la sync è accesa). La risposta dice com'è andata la sync.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listPeople, publicPerson, savePerson, computeCleanup, hrSyncConfig } from "@/lib/hr-people";
import { hrCryptoConfigured } from "@/lib/hr-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const all = await listPeople({ archived: "include" });
  // archiviate a parte: fuori da elenco, doppioni e statistiche
  const people = all.filter((p) => !p.archived);
  const cleanup = computeCleanup(people);
  const byName = (a, b) => a.name.localeCompare(b.name, "it");
  const items = people.map((p) => publicPerson(p)).sort(byName);
  const archived = all.filter((p) => p.archived).map((p) => publicPerson(p)).sort((a, b) => (b.archived?.at || 0) - (a.archived?.at || 0));
  const cfg = hrSyncConfig();
  return Response.json({ items, archived, cleanup, sync: { enabled: cfg.enabled, listId: cfg.listId, isRealList: cfg.isRealList }, crypto: hrCryptoConfigured() });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  const res = await savePerson({ input: body || {}, actor: az.userId, source: "app" });
  if (!res.ok) return Response.json({ error: res.errors.join(" ") }, { status: res.status });
  return Response.json({ ok: true, person: publicPerson(res.person), cfNote: res.cfNote, sync: res.sync }, { status: 201 });
}
