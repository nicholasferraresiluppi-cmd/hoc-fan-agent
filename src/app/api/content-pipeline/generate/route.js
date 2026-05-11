// POST { creatorSlug, brief } → genera un draft con Anthropic, salva come "pending".

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function POST(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: getCreator(slug) → persona + model
  // TODO: generateDraft({ persona, brief, model })
  // TODO: createDraft(status="pending") + logAudit("draft.generate")
  return Response.json({ todo: "generate draft" }, { status: 501 });
}
