/**
 * /api/admin/social-accounts — CRUD account social di promozione creator (SEED).
 *
 * GET  → { items }
 * POST → crea un account { name, platform, handle?, proxyId?, status? }
 *        se proxyId è omesso, auto-assegna il proxy attivo con meno account.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listAccounts, createAccount } from "@/lib/social-accounts";
import { getProxy } from "@/lib/social-proxies";

export const runtime = "nodejs";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const items = await listAccounts();
  const proxyIds = [...new Set(items.map((a) => a.proxyId).filter(Boolean))];
  const proxies = Object.fromEntries(
    (await Promise.all(proxyIds.map((id) => getProxy(id)))).filter(Boolean).map((p) => [p.id, p])
  );

  const enriched = items.map((a) => ({ ...a, proxy: a.proxyId ? proxies[a.proxyId] || null : null }));
  return Response.json({ items: enriched });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await createAccount(body || {});
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true, account: result.account }, { status: 201 });
}
