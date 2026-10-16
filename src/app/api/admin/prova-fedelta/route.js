/**
 * /api/admin/prova-fedelta — prova fedeltà su Martina Scavo (lib/prova-fedelta).
 * GET[?refresh=1]: lista dei fan del gruppo prova (NOMINATI) + misura dei due gruppi.
 *   Gate: chi guida una squadra (SCORES_VIEW team|all) E vede la creator della prova;
 *   ogni apertura finisce nel registro azioni (dati fan identificati, come la retention).
 *   I fan del gruppo controllo NON escono nominati: si misurano e basta.
 * POST { action: "start", start } | { action: "stop" }: solo admin (SEED).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { logAuditAction } from "@/lib/audit-log";
import { getProvaData, getConfig, startProva, stopProva, DEFAULT_CREATOR } from "@/lib/prova-fedelta";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const cfg = await getConfig();
  const name = cfg?.name || DEFAULT_CREATOR.name;
  if (!allowsCreator(az.creatorScope, name)) return Response.json({ error: `La prova è su ${name}, che non è tra le tue creator.` }, { status: 403 });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const seed = await authorize(CAPABILITIES.SEED);
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const data = await getProvaData({ force });
    const prova = data.fans.filter((f) => f.arm === "prova");
    await logAuditAction({ action: "prova-fedelta.view", target: name, by: az.userId, meta: { fans: prova.length } }).catch(() => {});
    return Response.json({
      config: data.config, phase: data.phase, computed_at: data.computed_at || null, computing: Boolean(data.computing),
      fans: prova, controlCount: data.fans.length - prova.length, metrics: data.metrics, canManage: seed.ok,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: "Solo un admin può avviare o fermare la prova" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "start") {
      const cfg = await startProva({ start: body.start, by: az.userId });
      await logAuditAction({ action: "prova-fedelta.start", target: cfg.name, by: az.userId, meta: { start: cfg.start } }).catch(() => {});
      return Response.json({ config: cfg });
    }
    if (body.action === "stop") {
      const cfg = await stopProva({ by: az.userId });
      await logAuditAction({ action: "prova-fedelta.stop", target: cfg.name, by: az.userId }).catch(() => {});
      return Response.json({ config: cfg });
    }
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Operazione non riuscita" }, { status: 400 });
  }
}
