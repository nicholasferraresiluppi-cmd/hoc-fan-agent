/**
 * /api/admin/hr/people/[id] — scheda persona (Centro HR, SEED).
 *
 * GET   → { person (CF solo mascherato), log, cleanup (flag di questa scheda) }
 * PATCH → modifica campi; salva in app, poi spinge su ClickUp SOLO i campi cambiati.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson, getLog, publicPerson, savePerson, listPeople, computeCleanup, hrSyncConfig, fieldOptions } from "@/lib/hr-people";
import { hrCryptoConfigured } from "@/lib/hr-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  const [log, people, options] = await Promise.all([getLog(id), listPeople(), fieldOptions()]);
  const cleanup = computeCleanup(people);
  const dupGroup = cleanup.duplicates.find((g) => g.ids.includes(id));
  const byId = Object.fromEntries(people.map((x) => [x.id, x]));
  const cfg = hrSyncConfig();
  return Response.json({
    person: publicPerson(p, { withCfMask: true }),
    log,
    flags: cleanup.byId[id] || [],
    duplicates: dupGroup ? { reasons: dupGroup.reasons, others: dupGroup.ids.filter((x) => x !== id).map((x) => ({ id: x, name: publicPerson(byId[x])?.name })) } : null,
    options,
    sync: { enabled: cfg.enabled },
    crypto: hrCryptoConfigured(),
  });
}

export async function PATCH(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  const res = await savePerson({ id, input: body || {}, actor: az.userId, source: "app" });
  if (!res.ok) return Response.json({ error: res.errors.join(" ") }, { status: res.status });
  return Response.json({ ok: true, person: publicPerson(res.person, { withCfMask: true }), changed: res.changed, cfNote: res.cfNote, sync: res.sync });
}
