// GET/PATCH/DELETE su singolo draft.

import { requireContentAdmin } from "@/lib/content-pipeline/auth";

export async function GET(/* request, { params } */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: getDraft(id)
  return Response.json({ todo: "get draft" }, { status: 501 });
}

export async function PATCH(/* request, { params } */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: validare patch (body, mediaUrls) — solo se status === "pending"
  return Response.json({ todo: "patch draft" }, { status: 501 });
}

export async function DELETE(/* request, { params } */) {
  const gate = await requireContentAdmin();
  if (!gate.ok) return Response.json({ error: gate.message }, { status: gate.status });
  // TODO: deleteDraft + unscheduleDraft + logAudit
  return Response.json({ todo: "delete draft" }, { status: 501 });
}
