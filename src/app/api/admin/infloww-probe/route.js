/**
 * GET /api/admin/infloww-probe
 *
 * Discovery della connessione Infloww API (beta). Prova gli endpoint /v1/*
 * con Authorization + x-oid (da env), riporta status + shape per ognuno.
 * Read-only, limit basso. Throwaway come cp-probe / social-probe.
 *
 * /v1/employees è confermato dalla doc; gli altri path seguono il pattern
 * /v1/<resource> — il probe verifica quali rispondono.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwProbe } from "@/lib/infloww-api";

export const maxDuration = 60;

const CANDIDATES = [
  { path: "/v1/employees", label: "Employees (anagrafica operatori)" },
  { path: "/v1/employee-assigned-creators", label: "Employee assigned creators" },
  { path: "/v1/connected-creators", label: "Connected creators" },
  { path: "/v1/transactions", label: "Transactions (revenue)" },
  { path: "/v1/refunds", label: "Refunds/chargeback" },
  { path: "/v1/tracking-links", label: "Tracking/trial/promo links" },
  { path: "/v1/automated-messages", label: "Automated messages" },
  { path: "/v1/priority-mass-messages", label: "Priority mass messages" },
];

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  // env check esplicito prima di sprecare chiamate
  const missing = [];
  if (!process.env.INFLOWW_API_KEY) missing.push("INFLOWW_API_KEY");
  if (!process.env.INFLOWW_OID) missing.push("INFLOWW_OID");
  if (missing.length) {
    return Response.json({
      error: `Env mancanti: ${missing.join(", ")}. Aggiungili in Vercel e ri-deploya.`,
      base_url: "https://openapi.infloww.com",
    }, { status: 428 });
  }

  const results = [];
  for (const c of CANDIDATES) {
    const r = await inflowwProbe(c.path, { limit: 3 });
    results.push({ ...c, ...r });
  }
  const hits = results.filter((r) => r.ok);
  return Response.json({
    base_url: "https://openapi.infloww.com",
    auth: "header Authorization=<key> + x-oid=<oid>",
    summary: hits.length
      ? `${hits.length}/${CANDIDATES.length} endpoint rispondono. Vedi item_keys per capire quali dati arrivano.`
      : "Nessun endpoint risponde: controlla che key + oid siano corretti e la key non scaduta/revocata.",
    working: hits.map((h) => h.path),
    results,
  });
}
