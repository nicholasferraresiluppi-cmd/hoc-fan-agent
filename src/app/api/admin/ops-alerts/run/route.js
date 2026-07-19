/**
 * POST /api/admin/ops-alerts/run — esegue i check e riconcilia lo store.
 * Auth (stesso pattern di /api/leaderboard/snapshot):
 *   1. header x-vercel-cron (Vercel Cron, vedi vercel.json)
 *   2. Authorization: Bearer CRON_SECRET (trigger manuale/script)
 *   3. fallback: sessione con capability SEED (bottone "Aggiorna ora" in UI)
 * GET delega a POST (Vercel Cron invoca in GET).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { runChecks } from "@/lib/ops-alerts";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 60;

// Auth cron centralizzata in lib/cron-auth (fix 20 lug 2026: i path cron sono
// ora pubblici nel middleware → l'header x-vercel-cron da solo non è più prova
// sufficiente quando CRON_SECRET è configurato).
const isAuthorized = (request) => isCronAuthorized(request);

export async function POST(request) {
  let trigger = "cron";
  if (!isAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
    trigger = "manual";
  }

  const summary = await runChecks({ trigger });
  return Response.json(summary);
}

export async function GET(request) {
  return POST(request);
}
