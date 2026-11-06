// Cosa ha funzionato di un profilo (permesso social.manage).
//
// GET                         reel usciti con le misure, collegamento ai video del Banco, per formato (&refresh=1 rilegge il magazzino)
// POST { code, fileId }       collega il reel al video del Banco (fileId null = scollega)
export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { getProfile } from "@/lib/studio-social";
import { getBanco, hasFile } from "@/lib/studio-banco";
import { getEsitiData, getLinks, setLink } from "@/lib/studio-esiti";
import { buildOutcomes, byFormat, toLink, MIN_BASE, MIN_FORMAT, BASE_REELS, SHOW_DAYS } from "@/lib/studio-esiti-core";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  if (profile.platform !== "instagram") return Response.json({ unsupported: true }, noStore);
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  const [data, links, banco] = await Promise.all([getEsitiData(id, profile.handle, { force }), getLinks(id), getBanco(id).catch(() => null)]);
  const bancoById = Object.fromEntries((banco?.rows || []).map((r) => [r.id, { title: r.title, path: r.path, state: r.state }]));
  const outcomes = buildOutcomes({ reels: data.reels || [], accountDays: data.accountDays || {}, links, banco: bancoById, lastDay: data.lastDay });
  const linked = new Set(Object.values(links).map((l) => l.fileId));
  return Response.json({
    at: data.at || null, lastDay: data.lastDay || null, error: data.error || null, computing: Boolean(data.computing),
    found: Boolean(data.platformId), handle: profile.handle,
    outcomes, formats: byFormat(outcomes),
    toLink: banco?.folder ? toLink(outcomes, banco.folder.at) : 0,
    banco: (banco?.rows || []).map((r) => ({ id: r.id, title: r.title, path: r.path, state: r.state, linked: linked.has(r.id) })),
    rules: { minBase: MIN_BASE, minFormat: MIN_FORMAT, baseReels: BASE_REELS, showDays: SHOW_DAYS },
  }, noStore);
}

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  if (!(await getProfile(id))) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  const fileId = body?.fileId ? String(body.fileId) : null;
  if (fileId && !(await hasFile(id, fileId))) return Response.json({ error: "Video non trovato nel Banco" }, { status: 400 });
  const res = await setLink(id, body?.code, fileId, az.userId);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  await logAuditAction({ action: "studio.esiti.link", target: id, by: az.userId, meta: { code: body.code, fileId } });
  return Response.json(res, noStore);
}
