// Ispirazioni X — API (permesso social.manage, come il Warm-up).
//
// GET                                   reference, conteggi per stato, «cosa fanno le migliori», ultimi giri
// POST {action:"discover", niche?}      cerca nuove reference (Apify, ~0,16 $ a giro; max 4 giri al giorno)
// POST {action:"analyze", keys?}        legge gli ultimi 40 post (default: le tenute senza numeri o vecchi)
// POST {action:"status", key, status}   tieni / scarta / da valutare
// POST {action:"note", key, note?, niches?}
// POST {action:"add", handle}           aggiunge a mano una reference già nota (nasce «tenuta»)

export const runtime = "nodejs";
export const maxDuration = 300;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getXrefs, discover, analyze, setStatus, setNote, addManual } from "@/lib/warmup-xrefs";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  let name = az.userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || name; } catch {}
  return { by: { userId: az.userId, name } };
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  return Response.json(await getXrefs(), noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const b = await request.json().catch(() => ({}));
  try {
    if (b.action === "discover") return Response.json({ result: await discover({ niche: b.niche ? String(b.niche).slice(0, 40) : null, by: g.by }) });
    if (b.action === "analyze") return Response.json({ result: await analyze({ keys: Array.isArray(b.keys) ? b.keys.slice(0, 30) : null, by: g.by }) });
    if (b.action === "status") return Response.json({ ref: await setStatus(b.key, b.status, g.by) });
    if (b.action === "note") return Response.json({ ref: await setNote(b.key, b.note, b.niches) });
    if (b.action === "add") return Response.json({ ref: await addManual(b.handle, g.by) });
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Errore" }, { status: 400 });
  }
}
