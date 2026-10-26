/**
 * /api/admin/referral — «Porta un collega», lato HR (permesso referral.manage:
 * admin + People Partner). Vede tutto il programma e scrive: referenti, persone
 * portate, storie, pagamenti. Logica in lib/referral(.js|-core.js).
 */
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { internalOrigin } from "@/lib/cron-chain";
import {
  loadState, crmSuggestions, listInflowwNames, listAudit,
  saveReferrer, deleteReferrer, saveRecruit, deleteRecruit, saveStory, deleteStory,
  markPaid, unmarkPaid, inviteReferrer, setFx,
} from "@/lib/referral";

export const dynamic = "force-dynamic";

async function actorOf(az) {
  const me = await currentUser().catch(() => null);
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.emailAddresses?.[0]?.emailAddress || az.userId;
  return { id: az.userId, name };
}

export async function GET() {
  const az = await authorize(CAPABILITIES.REFERRAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const state = await loadState();
    const [suggestions, inflowwNames, auditLog] = await Promise.all([crmSuggestions(state.recruits), listInflowwNames(), listAudit(40)]);
    return Response.json({ ...state, suggestions, inflowwNames, audit: auditLog });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

const ACTIONS = {
  saveReferrer: (b, actor) => saveReferrer({ id: b.id || null, input: b.data || {}, actor }),
  deleteReferrer: (b, actor) => deleteReferrer(b.id, actor),
  saveRecruit: (b, actor) => saveRecruit({ id: b.id || null, input: b.data || {}, actor }),
  deleteRecruit: (b, actor) => deleteRecruit(b.id, actor),
  saveStory: (b, actor) => saveStory({ id: b.id || null, input: b.data || {}, actor }),
  deleteStory: (b, actor) => deleteStory(b.id, actor),
  markPaid: (b, actor) => markPaid(String(b.key || ""), actor),
  unmarkPaid: (b, actor) => unmarkPaid(String(b.key || ""), actor),
  setFx: (b, actor) => setFx(String(b.month || ""), b.rate, actor),
};

export async function POST(request) {
  const az = await authorize(CAPABILITIES.REFERRAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const actor = await actorOf(az);
  try {
    if (body.action === "invite") {
      return Response.json(await inviteReferrer(body.id, actor, internalOrigin(request)));
    }
    const fn = ACTIONS[body.action];
    if (!fn) return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    const result = await fn(body, actor);
    return Response.json({ ok: true, result: result ?? null });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
