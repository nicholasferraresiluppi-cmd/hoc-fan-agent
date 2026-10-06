/**
 * /api/admin/hr/sync — stato e comandi della sincronizzazione con ClickUp (SEED).
 *
 * GET  → configurazione (lista impostata? token? chiave CF?), webhook registrato,
 *        ultimo import, conflitti recenti, campi attesi vs presenti sulla lista.
 * POST { action: "import" }           → import completo adesso
 * POST { action: "register_webhook" } → registra (o sostituisce) il webhook
 *        verso l'URL di produzione (APP_BASE_URL o il dominio custom), mai
 *        verso localhost: ClickUp deve poterlo raggiungere.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getSyncStatus, importFromClickup, registerWebhook, showViewColumns } from "@/lib/hr-people";
import { internalOrigin } from "@/lib/cron-chain";
import { uploadQueueStatus } from "@/lib/hr-uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

function webhookEndpoint(request) {
  return `${internalOrigin(request)}/api/hr/clickup-webhook`;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const [status, uploads] = await Promise.all([getSyncStatus(), uploadQueueStatus().catch(() => null)]);
  return Response.json({ ...status, uploads, webhookEndpoint: webhookEndpoint(request) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { body = {}; }
  try {
    if (body?.action === "import") {
      const r = await importFromClickup({ mode: "import", by: az.userId });
      return Response.json(r, { status: r.ok || r.skipped ? 200 : r.busy ? 409 : 502 });
    }
    // colonne visibili in una vista ClickUp (es. «Mansione» nella vista «Persone»)
    if (body?.action === "view_columns") {
      const viewId = String(body.viewId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
      const names = (Array.isArray(body.fields) ? body.fields : []).map((x) => String(x).slice(0, 80)).slice(0, 20);
      if (!viewId || !names.length) return Response.json({ ok: false, error: "viewId e fields obbligatori." }, { status: 400 });
      const r = await showViewColumns(viewId, names);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (body?.action === "register_webhook") {
      const endpoint = webhookEndpoint(request);
      if (/localhost|127\.0\.0\.1|\[::1\]/.test(endpoint)) {
        return Response.json({ ok: false, error: "Da locale ClickUp non può raggiungere il webhook: registralo dalla produzione o imposta APP_BASE_URL." }, { status: 400 });
      }
      const r = await registerWebhook({ endpoint, actor: az.userId });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Errore ClickUp." }, { status: 502 });
  }
  return Response.json({ error: "Azione sconosciuta." }, { status: 400 });
}
