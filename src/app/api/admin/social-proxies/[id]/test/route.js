/**
 * /api/admin/social-proxies/[id]/test — testa la connessione di un proxy (SEED).
 * POST → dialoga col proxy, verifica l'IP pubblico, registra latenza/esito.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProxyWithSecret, recordProxyTest } from "@/lib/social-proxies";
import { testProxyConnection } from "@/lib/social-proxy-test";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const proxy = await getProxyWithSecret(params.id);
  if (!proxy) return Response.json({ error: "proxy non trovato" }, { status: 404 });

  const outcome = await testProxyConnection(proxy);
  const result = await recordProxyTest(params.id, outcome);
  if (!result.ok) return Response.json({ error: result.errors.join("; ") }, { status: result.status });

  return Response.json({ ok: true, proxy: result.proxy, test: outcome });
}
