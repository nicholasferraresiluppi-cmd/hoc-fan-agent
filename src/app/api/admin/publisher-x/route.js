/**
 * /api/admin/publisher-x — conto dei publisher su X (lib/publisher-x).
 * GET ?month=YYYY-MM[&refresh=1] → conto del mese (buste CHIUSE nel mese).
 *   Admin (SEED): tutto — link X, regole, fee, margine, persone.
 *   HR (people.manage): solo quanto si deve a ogni publisher — niente fee, margine, nomi dei fan.
 * PUT { config, rev } → salva abbinamenti, regole, persone (SEED).
 * POST { action: "invite", publisher } → invita il publisher col solo ruolo «Publisher» (SEED).
 */
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { logAuditAction } from "@/lib/audit-log";
import { internalOrigin } from "@/lib/cron-chain";
import { getOverview, saveConfig, invitePublisher, ConflictError } from "@/lib/publisher-x";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  let view = "full";
  let az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    const hr = await authorize(CAPABILITIES.PEOPLE_MANAGE);
    if (!hr.ok || hr.scope !== "all") return Response.json({ error: az.message }, { status: az.status });
    az = hr;
    view = "payout";
  }
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  try {
    const force = view === "full" && url.searchParams.get("refresh") === "1";
    return Response.json(await getOverview(month, { force, view }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: /mese/.test(e.message || "") ? 400 : 500 });
  }
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => null);
  if (!body?.config) return Response.json({ error: "config mancante" }, { status: 400 });
  try {
    const doc = await saveConfig(body.config, { by: az.userId, expectRev: body.rev ?? null });
    await logAuditAction({ action: "publisher-x.config", target: "pubx:config", by: az.userId, meta: { rev: doc.rev, links: doc.links.length } }).catch(() => {});
    return Response.json({ ok: true, config: doc });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio non riuscito" }, { status: e instanceof ConflictError ? 409 : 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => null);
  if (body?.action !== "invite" || !body.publisher) return Response.json({ error: "azione non valida" }, { status: 400 });
  try {
    const me = await currentUser().catch(() => null);
    const actor = { id: az.userId, name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.emailAddresses?.[0]?.emailAddress || az.userId };
    const res = await invitePublisher(String(body.publisher), actor, internalOrigin(request));
    await logAuditAction({ action: "publisher-x.invite", target: String(body.publisher), by: az.userId }).catch(() => {});
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message || "Invito non riuscito" }, { status: 400 });
  }
}
