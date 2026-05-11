// POST { draftId, reason } → marca draft come "rejected".

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function POST(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: updateDraft(draftId, { status: "rejected", rejectReason })
  // TODO: unscheduleDraft (nel caso fosse già schedulato)
  // TODO: logAudit("draft.reject")
  return Response.json({ todo: "reject draft" }, { status: 501 });
}
