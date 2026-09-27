/**
 * /api/admin/social-proxies/[id] — dettaglio/modifica/eliminazione proxy (SEED).
 *
 * GET    → { proxy }
 * PUT    → aggiorna { host?, port?, username?, password?, type?, provider? }
 * DELETE → blocca se assegnato ad almeno un account ATTIVO
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProxy, updateProxy, deleteProxy } from "@/lib/social-proxies";
import { getAccountsByIds } from "@/lib/social-accounts";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const proxy = await getProxy(params.id);
  if (!proxy) return Response.json({ error: "proxy non trovato" }, { status: 404 });
  const accounts = await getAccountsByIds(proxy.accountIds);
  return Response.json({ proxy: { ...proxy, accounts } });
}

export async function PUT(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await updateProxy(params.id, body || {});
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true, proxy: result.proxy });
}

export async function DELETE(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const result = await deleteProxy(params.id);
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true });
}
