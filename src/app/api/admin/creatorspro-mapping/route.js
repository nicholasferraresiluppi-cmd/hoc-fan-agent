/**
 * /api/admin/creatorspro-mapping
 *
 * Gestione mapping member CreatorsPro ↔ employee Infloww.
 * Capability richiesta: SEED.
 *
 * GET           → { mapping: {cp_id: infloww_name}, members: [{id, firstName, lastName, username}], unmapped: [...] }
 * PUT body      → { cp_member_id, infloww_name } (vuoto/null per rimuovere)
 * POST body     → { mapping: {cp_id: name} } (bulk replace)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { setMemberMapping } from "@/lib/creatorspro-sync";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const [mapping, membersMap] = await Promise.all([
    kv.get("cp:member_mapping"),
    kv.get("cp:members"),
  ]);
  const m = mapping || {};
  const members = Object.values(membersMap || {});
  const unmapped = members.filter((mb) => !m[mb.id]);

  // Suggerimenti Infloww — leggi i nomi disponibili dal periodo più recente
  let inflowwNames = [];
  try {
    const periodsRaw = (await kv.zrange("ops_kpi:imports", 0, 0, { rev: true })) || [];
    if (periodsRaw.length > 0 && typeof periodsRaw[0] === "string") {
      const recs = (await kv.get(`ops_kpi:${periodsRaw[0]}`)) || [];
      const set = new Set();
      for (const r of recs) if (r.employee) set.add(r.employee.trim());
      inflowwNames = Array.from(set).sort();
    }
  } catch {}

  // v2: ritorno TUTTI gli unmapped (era limit 50). Per ~200 record è leggero.
  // Mantengo unmapped_sample come alias retrocompat per la UI vecchia.
  const sortedUnmapped = unmapped.sort((a, b) => (a.cp_name || "").localeCompare(b.cp_name || ""));
  return Response.json({
    mapping: m,
    members: members.sort((a, b) => `${a.firstName || ""} ${a.lastName || ""}`.localeCompare(`${b.firstName || ""} ${b.lastName || ""}`)),
    unmapped_count: unmapped.length,
    unmapped: sortedUnmapped,
    unmapped_sample: sortedUnmapped, // alias retrocompat
    infloww_names: inflowwNames,
  });
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { cp_member_id, infloww_name } = body || {};
  if (!cp_member_id) return Response.json({ error: "cp_member_id required" }, { status: 400 });

  const newMap = await setMemberMapping(cp_member_id, infloww_name || null);
  await logAuditAction({
    action: infloww_name ? "cp.mapping.set" : "cp.mapping.remove",
    target: cp_member_id,
    by: az.userId,
    meta: { infloww_name },
  });
  return Response.json({ ok: true, mapping: newMap });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { mapping } = body || {};
  if (!mapping || typeof mapping !== "object") {
    return Response.json({ error: "mapping object required" }, { status: 400 });
  }
  await kv.set("cp:member_mapping", mapping);
  await logAuditAction({
    action: "cp.mapping.bulk_set",
    target: `${Object.keys(mapping).length} entries`,
    by: az.userId,
  });
  return Response.json({ ok: true, mapping });
}
