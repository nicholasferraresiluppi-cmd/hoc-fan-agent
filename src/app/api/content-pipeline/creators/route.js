import { requireContentAdmin } from "@/lib/content-pipeline/auth";
import { listCreators, getCreator, saveCreator } from "@/lib/content-pipeline/store";
import { encryptToken } from "@/lib/content-pipeline/crypto";
import { verifyToken } from "@/lib/content-pipeline/telegram";
import { logAudit } from "@/lib/content-pipeline/audit";

// Strip del token cifrato prima di rispondere al client.
function publicize(creator) {
  if (!creator) return null;
  const { telegramBotTokenEnc, ...safe } = creator;
  return { ...safe, hasToken: !!telegramBotTokenEnc };
}

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export async function GET() {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  const creators = await listCreators();
  return Response.json({ creators: creators.map(publicize) });
}

export async function POST(request) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    slug,
    displayName,
    telegramChannelId,
    telegramBotToken,
    persona,
    anthropicModel,
  } = body || {};

  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      { error: "slug must match /^[a-z0-9-]{2,40}$/" },
      { status: 400 }
    );
  }
  if (!displayName || !telegramChannelId || !telegramBotToken) {
    return Response.json(
      { error: "displayName, telegramChannelId, telegramBotToken required" },
      { status: 400 }
    );
  }
  if (await getCreator(slug)) {
    return Response.json({ error: "slug already exists" }, { status: 409 });
  }

  const verify = await verifyToken(telegramBotToken);
  if (!verify.ok) {
    return Response.json({ error: `invalid bot token: ${verify.error}` }, { status: 400 });
  }

  let telegramBotTokenEnc;
  try {
    telegramBotTokenEnc = encryptToken(telegramBotToken);
  } catch (e) {
    return Response.json({ error: `encrypt failed: ${e.message}` }, { status: 500 });
  }

  const saved = await saveCreator({
    slug,
    displayName,
    telegramChannelId,
    telegramBotTokenEnc,
    persona: typeof persona === "string" ? persona : "",
    anthropicModel: typeof anthropicModel === "string" && anthropicModel ? anthropicModel : null,
  });

  await logAudit({
    actorUserId: gate.userId,
    action: "creator.create",
    target: slug,
    meta: { botUsername: verify.botUsername },
  });

  return Response.json({ creator: publicize(saved) }, { status: 201 });
}
