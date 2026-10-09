/**
 * /api/admin/hr/people/[id] — scheda persona (Centro HR, SEED).
 *
 * GET   → { person (CF solo mascherato), log, cleanup (flag di questa scheda) }
 * PATCH → modifica campi; salva in app, poi spinge su ClickUp SOLO i campi cambiati.
 *          Scheda archiviata → 409 (prima si ripristina).
 * Niente DELETE (03/10/2026): da procedura non si elimina mai una persona; chi va
 * via si segna "Uscita" (…/[id]/phase).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson, getLog, publicPerson, savePerson, listPeople, computeCleanup, hrSyncConfig, fieldOptions } from "@/lib/hr-people";
import { hrCryptoConfigured } from "@/lib/hr-crypto";
import { pendingUploadsFor } from "@/lib/hr-uploads";
import { after } from "next/server";
import { getStore, getLinks, getAttached, buildView, reconcilePerson } from "@/lib/hr-contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  const [log, people, options, incoming, cstore, clinks, cattached] = await Promise.all([getLog(id), listPeople(), fieldOptions(), pendingUploadsFor(id).catch(() => []), getStore().catch(() => null), getLinks().catch(() => ({})), getAttached().catch(() => ({}))]); // people = solo attive
  const cleanup = computeCleanup(people);
  const dupGroup = cleanup.duplicates.find((g) => g.ids.includes(id));
  const byId = Object.fromEntries(people.map((x) => [x.id, x]));
  const cfg = hrSyncConfig();
  // contratti Dropbox Sign (09/10/2026): stato calcolato ADESSO dalla mansione della scheda
  let contracts = null;
  if (cstore?.syncedAt && !p.archived) {
    const v = buildView(people, cstore, clinks, cattached);
    const st = v.persons[id];
    if (st) contracts = { syncedAt: v.syncedAt, status: st, list: st.contracts.map((cid) => v.contracts[cid]) };
  }
  return Response.json({
    contracts,
    person: publicPerson(p, { withCfMask: true }),
    log,
    flags: cleanup.byId[id] || [],
    duplicates: dupGroup ? { reasons: dupGroup.reasons, others: dupGroup.ids.filter((x) => x !== id).map((x) => ({ id: x, name: publicPerson(byId[x])?.name })) } : null,
    options,
    sync: { enabled: cfg.enabled },
    crypto: hrCryptoConfigured(),
    incoming, // file arrivati dal modulo e in coda verso ClickUp ("Documento in arrivo")
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
  // mansione cambiata → lo «Stato del contratto» si riallinea subito (anche su ClickUp), dopo la risposta
  if (res.changed?.includes("mansioni")) after(() => reconcilePerson(id).catch(() => {}));
  return Response.json({ ok: true, person: publicPerson(res.person, { withCfMask: true }), changed: res.changed, cfNote: res.cfNote, sync: res.sync });
}
