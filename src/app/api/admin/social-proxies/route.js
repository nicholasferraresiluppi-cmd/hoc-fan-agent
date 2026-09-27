/**
 * /api/admin/social-proxies — CRUD proxy SOCKS5/HTTP per account social (SEED).
 *
 * GET  → { items, total } (filtri ?status= ?provider=, paginazione ?offset= ?limit=)
 * POST → crea un proxy { host, port, username?, password?, type, provider? }
 *
 * GATE: SEED (admin-only) — la superficie tratta credenziali (password proxy).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listProxies, createProxy } from "@/lib/social-proxies";
import { getAccountsByIds } from "@/lib/social-accounts";

export const runtime = "nodejs";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const provider = searchParams.get("provider") || undefined;
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));

  const { items, total } = await listProxies({ status, provider, offset, limit });

  const allAccountIds = [...new Set(items.flatMap((p) => p.accountIds))];
  const accounts = await getAccountsByIds(allAccountIds);
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const enriched = items.map((p) => ({
    ...p,
    accounts: p.accountIds.map((id) => accountById[id]).filter(Boolean),
  }));

  return Response.json({ items: enriched, total, offset, limit });
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

  const result = await createProxy(body || {});
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });
  return Response.json({ ok: true, proxy: result.proxy }, { status: 201 });
}
