/**
 * GET  /api/admin/analisi-vendite/perche?creators=1,2&from=&to=   → lettura già fatta (o null)
 * POST /api/admin/analisi-vendite/perche {creators, from, to, refresh}  → legge le chat con l'AI
 *
 * Stesso accesso di Analisi vendite (ANALYTICS_VIEW + solo creator visibili all'utente).
 * La POST usa l'AI (costo, tetto mensile in lib/analisi-perche): parte solo da un clic.
 */
import { auth } from "@clerk/nextjs/server";
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { visibleCreators } from "@/lib/analisi-vendite";
import { getCachedPerche, runPerche } from "@/lib/analisi-perche";

export const runtime = "nodejs";
export const maxDuration = 120;

async function scoped(asked) {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return { error: Response.json({ error: az.message }, { status: az.status }) };
  if (!bigQueryConfigured()) return { error: Response.json({ error: "BigQuery non configurato" }, { status: 503 }) };
  const visible = new Set((await visibleCreators(az.creatorScope)).map((c) => c.id));
  const ids = asked.map(Number).filter((id) => visible.has(id));
  if (!ids.length || ids.length !== asked.length) return { error: Response.json({ error: "Creator non visibile per te" }, { status: 403 }) };
  return { ids };
}

const parseIds = (v) => String(v || "").split(",").map(Number).filter(Boolean);

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const s = await scoped(parseIds(sp.get("creators")));
  if (s.error) return s.error;
  const hit = await getCachedPerche(s.ids, { from: sp.get("from"), to: sp.get("to") });
  return Response.json({ result: hit });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const s = await scoped(parseIds(Array.isArray(body.creators) ? body.creators.join(",") : body.creators));
  if (s.error) return s.error;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI non configurata" }, { status: 503 });
  try {
    const { userId } = await auth();
    const result = await runPerche(s.ids, { from: body.from, to: body.to }, { force: body.refresh === true, by: userId || null });
    if (result.status === "busy") return Response.json({ busy: true }, { status: 202 });
    return Response.json({ result });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: e.status || 500 });
  }
}
