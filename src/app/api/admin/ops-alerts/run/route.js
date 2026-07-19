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

export const maxDuration = 60;

function isAuthorized(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-vercel-cron");
  if (cronHeader) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader === `Bearer ${secret}`) return true;
  return false;
}

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
