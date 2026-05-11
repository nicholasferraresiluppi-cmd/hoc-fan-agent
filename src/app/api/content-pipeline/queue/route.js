// GET → lista draft (filtro ?creator=&status=), POST → crea draft manuale.

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function GET(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: parse query ?creator=&status=, intersect dei due SET, mget dei draft
  return Response.json({ todo: "list drafts" }, { status: 501 });
}

export async function POST(/* request */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: validate body { creatorSlug, body, mediaUrls? } + createDraft(status=pending)
  return Response.json({ todo: "create draft" }, { status: 501 });
}
