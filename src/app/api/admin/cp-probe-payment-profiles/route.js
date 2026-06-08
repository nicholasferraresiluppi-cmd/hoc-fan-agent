/**
 * /api/admin/cp-probe-payment-profiles
 *
 * Tentativo automatico di scoprire l'endpoint CP per i "Profili pagamento"
 * dentro una creator. Nicholas vuole leggere via API quale profilo pagamento
 * è attivo per ogni operatore/creator, ma noi non sappiamo l'URL preciso.
 *
 * Strategia: prova una lista di endpoint REST plausibili, contro un groupId
 * (creator) reale preso dal primo group disponibile. Per ognuno torna:
 *   { path, status, ok, sample: <primi 600 char della response>, error? }
 *
 * Una volta scoperto l'endpoint buono, lo wrappiamo in creatorspro-api.js
 * e costruiamo /admin/payment-profiles.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchGroups } from "@/lib/creatorspro-api";

export const maxDuration = 60;

const DEFAULT_BASE = "https://api.houseofcreators.com";

// Token reuse: stessa logica della lib, riadattata locale al probe.
async function cpLogin() {
  const email = process.env.CREATORSPRO_BOT_EMAIL;
  const password = process.env.CREATORSPRO_BOT_PASSWORD;
  const baseUrl = process.env.CREATORSPRO_API_BASE_URL || DEFAULT_BASE;
  if (!email || !password) throw new Error("CP credentials missing");
  const res = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`CP login HTTP ${res.status}`);
  const j = await res.json();
  return { token: j?.data?.access_token, baseUrl };
}

async function tryPath(path, { token, baseUrl }) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return {
      path,
      status: res.status,
      ok: res.ok,
      content_type: res.headers.get("content-type") || null,
      sample: text.slice(0, 600),
      parsed_top_keys: parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed)
        : null,
      parsed_data_count: Array.isArray(parsed?.data) ? parsed.data.length : null,
      parsed_data_first_keys: Array.isArray(parsed?.data) && parsed.data[0] && typeof parsed.data[0] === "object"
        ? Object.keys(parsed.data[0])
        : null,
    };
  } catch (e) {
    return { path, status: null, ok: false, error: String(e?.message || e) };
  }
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  // Pesca un groupId reale per i path che richiedono :id
  let groups = [];
  try { groups = await fetchGroups(); } catch {}
  const firstGroup = groups[0];
  const groupId = firstGroup?.id;

  const auth = await cpLogin().catch((e) => ({ _err: String(e?.message || e) }));
  if (auth._err) return Response.json({ error: "Login CP fallito", reason: auth._err }, { status: 500 });

  // Lista path candidati: variazioni naming, gerarchie diverse
  const candidatesGlobal = [
    "/v1/sellers-wage/profiles",
    "/v1/sellers-wage/payment-profiles",
    "/v1/sellers-wage/wage-profiles",
    "/v1/sellers-wage/payment-plans",
    "/v1/sellers-wage/wage-plans",
    "/v1/sellers-wage/wage-templates",
    "/v1/sellers-wage/wage-scales",
    "/v1/sellers-wage/wage-tiers",
    "/v1/sellers-wage/tiers",
    "/v1/sellers-wage/scales",
    "/v1/sellers-wage/compensation-plans",
    "/v1/payment-profiles",
    "/v1/wage-profiles",
    "/v1/profiles",
  ];

  const candidatesPerGroup = groupId
    ? [
        `/v1/sellers-wage/groups/${groupId}`,
        `/v1/sellers-wage/groups/${groupId}/profiles`,
        `/v1/sellers-wage/groups/${groupId}/profile`,
        `/v1/sellers-wage/groups/${groupId}/payment-profiles`,
        `/v1/sellers-wage/groups/${groupId}/payment-profile`,
        `/v1/sellers-wage/groups/${groupId}/wage-profile`,
        `/v1/sellers-wage/groups/${groupId}/wage-profiles`,
        `/v1/sellers-wage/groups/${groupId}/scaling`,
        `/v1/sellers-wage/groups/${groupId}/tiers`,
        `/v1/sellers-wage/groups/${groupId}/members`,
        `/v1/sellers-wage/profiles/${groupId}`,
        `/v1/sellers-wage/payment-profiles/${groupId}`,
      ]
    : [];

  const all = [...candidatesGlobal, ...candidatesPerGroup];

  // Sequenziale per non martellare l'API
  const results = [];
  for (const path of all) {
    results.push(await tryPath(path, auth));
  }

  const successes = results.filter((r) => r.ok);
  const interesting = results.filter((r) => r.status && r.status !== 404 && r.status !== 405);

  return Response.json({
    group_used: firstGroup ? { id: firstGroup.id, name: firstGroup.name } : null,
    tried: all.length,
    success_count: successes.length,
    interesting_count: interesting.length,
    successes,
    interesting,
    all: results,
  });
}
