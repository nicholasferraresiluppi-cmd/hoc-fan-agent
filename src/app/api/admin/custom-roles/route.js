import { authorize, CAPABILITIES, listCustomRoles, saveCustomRole, deleteCustomRole, SCOPES } from "@/lib/rbac";

// GET — lista custom roles + metadata capability
export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const roles = await listCustomRoles();
  return Response.json({
    roles,
    capabilities: Object.values(CAPABILITIES),
    scopes: SCOPES,
  });
}

// POST — create or update custom role
export async function POST(request) {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const body = await request.json();
    if (!body?.id || !body?.name) {
      return Response.json({ error: "id e name richiesti" }, { status: 400 });
    }
    const saved = await saveCustomRole(body);
    return Response.json({ ok: true, role: saved });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}

// DELETE — ?id=...
export async function DELETE(request) {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteCustomRole(id);
  return Response.json({ ok: true });
}
