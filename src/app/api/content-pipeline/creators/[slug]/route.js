import { requireContentAdmin } from "@/lib/content-pipeline/auth";
import { getCreator, saveCreator, deleteCreator } from "@/lib/content-pipeline/store";
import { encryptToken } from "@/lib/content-pipeline/crypto";
import { verifyToken } from "@/lib/content-pipeline/telegram";
import { logAudit } from "@/lib/content-pipeline/audit";

function publicize(creator) {
  if (!creator) return null;
  const { telegramBotTokenEnc, ...safe } = creator;
  return { ...safe, hasToken: !!telegramBotTokenEnc };
}

export async function GET(_request, { params }) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  const c = await getCreator(params.slug);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ creator: publicize(c) });
}

export async function PATCH(request, { params }) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });

  const cur = await getCreator(params.slug);
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const patch = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName;
  if (typeof body.telegramChannelId === "string") patch.telegramChannelId = body.telegramChannelId;
  if (typeof body.persona === "string") patch.persona = body.persona;
  if (typeof body.anthropicModel === "string" || body.anthropicModel === null) {
    patch.anthropicModel = body.anthropicModel || null;
  }

  let botUsername;
  if (typeof body.telegramBotToken === "string" && body.telegramBotToken.length > 0) {
    const verify = await verifyToken(body.telegramBotToken);
    if (!verify.ok) {
      return Response.json({ error: `invalid bot token: ${verify.error}` }, { status: 400 });
    }
    try {
      patch.telegramBotTokenEnc = encryptToken(body.telegramBotToken);
    } catch (e) {
      return Response.json({ error: `encrypt failed: ${e.message}` }, { status: 500 });
    }
    botUsername = verify.botUsername;
  }

  const next = await saveCreator({ ...cur, ...patch });

  await logAudit({
    actorUserId: gate.userId,
    action: "creator.update",
    target: params.slug,
    meta: { fields: Object.keys(patch), botUsername },
  });

  return Response.json({ creator: publicize(next) });
}

export async function DELETE(_request, { params }) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });

  const cur = await getCreator(params.slug);
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });

  await deleteCreator(params.slug);
  await logAudit({ actorUserId: gate.userId, action: "creator.delete", target: params.slug });
  return Response.json({ ok: true });
}
