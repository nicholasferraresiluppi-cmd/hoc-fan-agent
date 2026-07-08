/**
 * GET /api/admin/social-probe
 *
 * DISCOVERY one-shot per l'integrazione nativa (opzione B) dei dati social
 * CreatorsPro. Il MCP (mcp.creatorspro.com) nasconde i path REST: questo
 * probe testa path candidati per scoprire (1) su che host vivono i dati
 * social, (2) se le credenziali bot esistenti bastano, (3) la shape reale.
 *
 * Read-only, solo GET. Riusa le credenziali CP già in prod (CREATORSPRO_BOT_*).
 * Throwaway come /admin/cp-probe — non va in navigazione.
 *
 * Param opzionale: ?base=https://api.creatorspro.com per testare un host
 * alternativo (senza auth, dato che il token bot vale solo sull'host wage).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { probeGet } from "@/lib/creatorspro-api";

export const maxDuration = 60;

// Path candidati derivati dai nomi tool MCP (social_metrics_get_*).
// Convenzioni REST varie → ne proviamo diverse, riportiamo cosa risponde.
const CANDIDATE_PATHS = [
  "/v1/social-metrics/talents",
  "/v1/social-metrics/overview/talents",
  "/v1/social-metrics/overview-by-talent",
  "/v1/social-metrics/accounts",
  "/v1/talents",
  "/v1/social/talents",
  "/v1/metrics/talents",
  "/v1/social-metrics/onlyfans",
  "/v1/social-metrics/instagram",
  "/v1/tracking-links",
];

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const baseOverride = url.searchParams.get("base") || null;
  const noAuth = url.searchParams.get("noauth") === "1";

  const results = [];
  for (const path of CANDIDATE_PATHS) {
    const r = await probeGet(path, { baseOverride, noAuth });
    let sampleShape = null;
    if (r.ok && r.sample) {
      // riassunto della shape, non il payload intero
      const d = r.sample?.data ?? r.sample;
      if (Array.isArray(d)) sampleShape = { type: "array", len: d.length, firstKeys: d[0] ? Object.keys(d[0]).slice(0, 12) : [] };
      else if (d && typeof d === "object") sampleShape = { type: "object", keys: Object.keys(d).slice(0, 15) };
    }
    results.push({
      path,
      status: r.status,
      ok: r.ok,
      error: r.error || (r.ok ? undefined : (typeof r.sample?.message === "string" ? r.sample.message : undefined)),
      sample_shape: sampleShape,
    });
  }

  const hits = results.filter((r) => r.ok);
  return Response.json({
    host_tested: baseOverride || "api.creatorspro.com (default bot host)",
    auth: noAuth ? "none" : "bot token",
    summary: hits.length > 0
      ? `${hits.length} endpoint social raggiungibili con le credenziali attuali → integrazione B fattibile su questo host`
      : "Nessun endpoint social raggiungibile qui. Il social vive su un altro host o richiede un token separato — serve la base URL + credenziali da te.",
    hits: hits.map((h) => h.path),
    results,
  });
}
