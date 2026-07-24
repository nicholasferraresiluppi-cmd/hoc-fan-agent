// Infloww ingest — API (SEED). Il client parsa l'export e calcola i segnali; qui
// si accumulano solo gli AGGREGATI per operatore (nessun messaggio grezzo, nessun
// PII fan transita). Coaching, non score/comp.

export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getInflowwStore, upsertInflowwProfiles, removeInflowwProfile, clearInflowwStore, storeToList } from "@/lib/infloww-ingest";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const store = await getInflowwStore();
  return Response.json({ version: store.version, count: store.count, updated_at: store.updated_at, profiles: storeToList(store) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON mancante" }, { status: 400 });
  }
  const profiles = body?.profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return Response.json({ error: "Nessun profilo nel payload" }, { status: 400 });
  }
  if (profiles.length > 500) {
    return Response.json({ error: "Troppi profili in un solo upload (max 500)" }, { status: 400 });
  }
  try {
    const { store, applied } = await upsertInflowwProfiles(profiles, body?.meta || {});
    return Response.json({ applied, count: store.count, updated_at: store.updated_at, profiles: storeToList(store) });
  } catch (e) {
    return Response.json({ error: e.message || "Ingest fallito" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* opzionale */
  }
  // Svuotamento totale solo con flag esplicito (niente sentinella "*" che
  // collide con un eventuale operatore chiamato "*"); traccia l'audit.
  const store = body?.all === true ? await clearInflowwStore() : body?.operator ? await removeInflowwProfile(body.operator) : null;
  if (!store) return Response.json({ error: "Specifica operator, oppure all:true per svuotare" }, { status: 400 });
  return Response.json({ count: store.count, profiles: storeToList(store) });
}
