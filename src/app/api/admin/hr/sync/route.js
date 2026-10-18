/**
 * /api/admin/hr/sync — stato e comandi della sincronizzazione con ClickUp (people.manage).
 *
 * GET  → configurazione (lista impostata? token? chiave CF?), webhook registrato,
 *        ultimo import, conflitti recenti, campi attesi vs presenti sulla lista.
 * POST { action: "import" }           → import completo adesso
 * POST { action: "pending_assign", items? } → assegnazioni in attesa (creator/fase/mansione per chi
 *        non ha ancora la scheda): con `items` sostituisce l'elenco e lo prova sulle schede esistenti
 * POST { action: "register_webhook" } → registra (o sostituisce) il webhook
 *        verso l'URL di produzione (APP_BASE_URL o il dominio custom), mai
 *        verso localhost: ClickUp deve poterlo raggiungere.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { realignCrmViews, lastViewsReport } from "@/lib/hr-views";
import { syncContractMilestones, milestoneStatus } from "@/lib/hr-contract-milestone";
import { stripContractLinks } from "@/lib/hr-block-cleanup";
import { getSyncStatus, importFromClickup, registerWebhook, showViewColumns, getPendingAssignments, setPendingAssignments } from "@/lib/hr-people";
import { internalOrigin } from "@/lib/cron-chain";
import { uploadQueueStatus } from "@/lib/hr-uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

function webhookEndpoint(request) {
  return `${internalOrigin(request)}/api/hr/clickup-webhook`;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const [status, uploads] = await Promise.all([getSyncStatus(), uploadQueueStatus().catch(() => null)]);
  return Response.json({ ...status, uploads, webhookEndpoint: webhookEndpoint(request), views: await lastViewsReport(), milestones: await milestoneStatus().catch(() => null) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { body = {}; }
  try {
    // vista e webhook toccano la configurazione di ClickUp: restano agli admin (18/10/2026)
    if ((body?.action === "view_columns" || body?.action === "register_webhook") && !(await authorize(CAPABILITIES.SEED)).ok) {
      return Response.json({ ok: false, error: "Serve un admin." }, { status: 403 });
    }
    // viste del CRM sui campi nuovi (18/10/2026): anteprima, poi apply (scrive su ClickUp: solo admin)
    if (body?.action === "views_realign") {
      const apply = body.apply === true;
      if (apply && !(await authorize(CAPABILITIES.SEED)).ok) return Response.json({ ok: false, error: "Serve un admin." }, { status: 403 });
      const r = await realignCrmViews({ apply, by: az.userId });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (body?.action === "strip_contract_link") {
      const r = await stripContractLinks({ budgetMs: 45_000 });
      return Response.json(r, { status: r.ok ? 200 : 409 });
    }
    if (body?.action === "contract_milestones") {
      const r = await syncContractMilestones({ by: az.userId });
      return Response.json(r, { status: r.ok ? 200 : 409 });
    }
    if (body?.action === "import") {
      const r = await importFromClickup({ mode: "import", by: az.userId });
      return Response.json(r, { status: r.ok || r.skipped ? 200 : r.busy ? 409 : 502 });
    }
    // colonne visibili in una vista ClickUp (es. «Mansione» nella vista «Persone»)
    if (body?.action === "view_columns") {
      const viewId = String(body.viewId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
      const names = (Array.isArray(body.fields) ? body.fields : []).map((x) => String(x).slice(0, 80)).slice(0, 20);
      if (!viewId || (!names.length && !(Array.isArray(body.hide) && body.hide.length))) return Response.json({ ok: false, error: "viewId e fields obbligatori." }, { status: 400 });
      const hide = (Array.isArray(body.hide) ? body.hide : []).map((x) => String(x).slice(0, 80)).slice(0, 20);
      const r = await showViewColumns(viewId, names, hide);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (body?.action === "pending_assign") {
      if (!Array.isArray(body.items)) return Response.json({ ok: true, pending: await getPendingAssignments() });
      return Response.json(await setPendingAssignments(body.items));
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
