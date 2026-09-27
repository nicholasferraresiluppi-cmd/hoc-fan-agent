/**
 * /api/admin/social-accounts/[id] — dettaglio/modifica/eliminazione account social (SEED).
 *
 * GET    → { account } (con proxy risolto)
 * PUT    → aggiorna { name?, platform?, handle?, status?, proxyId? } — proxyId:null sgancia il proxy
 * DELETE → elimina l'account (ripulisce l'indice by-proxy)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getAccount, updateAccount, deleteAccount } from "@/lib/social-accounts";
import { getProxy } from "@/lib/social-proxies";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const account = await getAccount(params.id);
  if (!account) return Response.json({ error: "account non trovato" }, { status: 404 });
  const proxy = account.proxyId ? await getProxy(account.proxyId) : null;
  return Response.json({ account: { ...account, proxy } });
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

  const result = await updateAccount(params.id, body || {});
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true, account: result.account });
}

export async function DELETE(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const result = await deleteAccount(params.id);
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true });
}
