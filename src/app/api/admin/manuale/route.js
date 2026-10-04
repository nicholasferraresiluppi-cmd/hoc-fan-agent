/**
 * /api/admin/manuale — Manuale vendite: documenti e prove.
 *
 * GET                      → elenco documenti (senza contenuto) + prove con le misure
 * POST {action:"prova", creatorId, nome, start}  → avvia una prova (direzione vendite)
 * POST {action:"misura", id}                     → misura subito base e settimane complete
 *
 * Gate: i documenti contengono estratti di chat reali e le prove numeri di vendita
 * di tutta la creator → authorizeAllCreators(SCORES_VIEW), come il sales manager AI.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeAllCreators } from "@/lib/creator-scope";
import { listDocs, listProve, createProva, measureProva } from "@/lib/manuale/store";
import { METRICHE } from "@/lib/manuale/prova-sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const [docs, prove] = await Promise.all([listDocs(), listProve()]);
  return Response.json({ docs, prove, metriche: METRICHE });
}

export async function POST(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  if (body.action === "prova") {
    const creatorId = String(body.creatorId || "").trim();
    const start = Date.parse(body.start || "");
    if (!/^\d{3,20}$/.test(creatorId) || !Number.isFinite(start)) return Response.json({ error: "Creator o data non validi" }, { status: 400 });
    if (start > Date.now() + 30 * 86400e3) return Response.json({ error: "Data troppo lontana" }, { status: 400 });
    const p = await createProva({ creatorId, nome: String(body.nome || "").slice(0, 80), startMs: start, by: az.userId || null });
    return Response.json({ prova: await measureProva(p.id) });
  }
  if (body.action === "misura") {
    if (!body.id) return Response.json({ error: "id mancante" }, { status: 400 });
    return Response.json({ prova: await measureProva(String(body.id)) });
  }
  return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
}
