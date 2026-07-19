/**
 * /api/admin/roadmap
 *
 * Roadmap di prodotto di HOC Pro: le idee/feature future vivono qui invece
 * che come pagine placeholder in navigazione (regola anti-polverone, cfr
 * decision log 2026-07-10 "Potatura superficie" — il precedente Content
 * Pipeline ha mostrato che lo scaffolding in nav diventa rumore).
 * Capability richiesta: SEED (admin-only), lettura inclusa: il contenuto è
 * strategia interna di prodotto.
 *
 * Storage KV: chiave `roadmap:items` → oggetto JSON
 *   {
 *     "traffic-automation": {
 *       id: "traffic-automation",
 *       title: "Traffic automation (studio OnlyFlow)",
 *       desc: "1 riga di contesto",
 *       status: "now" | "next" | "later" | "parked",
 *       area: "Traffico",           // etichetta libera
 *       gate: "Decisione board …",  // opzionale: cosa la sblocca
 *       link: "https://…",          // opzionale: dossier/doc di dettaglio
 *       source: "Sessione 19/07",   // opzionale: da dove viene l'idea
 *       added_by, added_at, updated_at
 *     }, ...
 *   }
 *
 * GET    → { items, count }
 * POST   → upsert voce (body: { id?, title, desc?, status, area?, gate?, link?, source? })
 * DELETE → rimuove voce (query: ?id=...)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";

const KEY = "roadmap:items";
// Nota: niente export extra da un route.js (Next 14 accetta solo gli handler).
const ROADMAP_STATUSES = ["now", "next", "later", "parked"];

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  const items = (await kv.get(KEY)) || {};
  return Response.json({ items, count: Object.keys(items).length });
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

  const { title, status } = body || {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return Response.json({ error: "title (string) required" }, { status: 400 });
  }
  if (!ROADMAP_STATUSES.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${ROADMAP_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const id = (typeof body.id === "string" && body.id.trim()) || slugify(title);
  if (!id) {
    return Response.json({ error: "could not derive id from title" }, { status: 400 });
  }

  const items = (await kv.get(KEY)) || {};
  const prev = items[id] || null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  items[id] = {
    id,
    title: title.trim(),
    desc: str(body.desc),
    status,
    area: str(body.area),
    gate: str(body.gate),
    link: str(body.link),
    source: str(body.source),
    added_by: prev?.added_by || az.userId,
    added_at: prev?.added_at || Date.now(),
    updated_at: Date.now(),
  };
  await kv.set(KEY, items);

  await logAuditAction({
    action: prev ? "roadmap.update" : "roadmap.add",
    target: id,
    by: az.userId,
    meta: { title: items[id].title, status, previous_status: prev?.status || null },
  });

  return Response.json({ ok: true, item: items[id], total: Object.keys(items).length });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "?id=ID required" }, { status: 400 });
  }

  const items = (await kv.get(KEY)) || {};
  if (!(id in items)) {
    return Response.json({ error: "id not in roadmap" }, { status: 404 });
  }
  const removed = items[id];
  delete items[id];
  await kv.set(KEY, items);

  await logAuditAction({
    action: "roadmap.remove",
    target: id,
    by: az.userId,
    meta: { removed_title: removed?.title },
  });

  return Response.json({ ok: true, removed: id, total: Object.keys(items).length });
}
