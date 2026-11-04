/**
 * GET /api/admin/creator-ai → studi sulle creator AI (KV `creator-ai:studi`).
 * I dati non stanno nel codice: si caricano nel KV a ogni nuovo studio, senza deploy.
 * Accesso: solo titolare (lib/creator-ai-access).
 */
import { kv } from "@vercel/kv";
import { requireCreatorAi } from "@/lib/creator-ai-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await requireCreatorAi();
  if (!az.ok) return az.response;
  const data = await kv.get("creator-ai:studi");
  return Response.json(data || { studi: [], italia: null }, { headers: { "Cache-Control": "no-store" } });
}
