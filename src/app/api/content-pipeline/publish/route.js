// POST { draftId } → publish on-demand (ignora publishAt, pubblica subito).
// Usato dalla UI quando si vuole pubblicare immediatamente senza aspettare il cron.

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function POST(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: getDraft + getCreator
  // TODO: decryptToken(creator.telegramBotTokenEnc)
  // TODO: telegram.sendMessage / sendPhoto / sendMediaGroup
  // TODO: updateDraft(status="published") + appendHistory + unscheduleDraft + logAudit
  // TODO: on failure → updateDraft(status="failed", publishError) + logAudit("draft.publish.fail")
  return Response.json({ todo: "publish draft" }, { status: 501 });
}
