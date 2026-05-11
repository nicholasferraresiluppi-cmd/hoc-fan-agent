// POST { draftId, publishAt } → marca draft come "approved" + scheduleDraft.
// publishAt è un timestamp ms (UI: SchedulePicker datetime-local convertito).
// Se publishAt è omesso/passato, pubblica al prossimo tick cron.

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function POST(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: validate { draftId, publishAt }
  // TODO: updateDraft(draftId, { status: "approved", publishAt, authorId })
  // TODO: scheduleDraft(draftId, publishAt)
  // TODO: logAudit("draft.approve")
  return Response.json({ todo: "approve draft" }, { status: 501 });
}
