/**
 * GET /api/admin/presenze-discord?view=days|day|person|range&day=YYYY-MM-DD&id=<discord id>&days=N
 * Presenze in vocale sul server Discord, lette dal bot presenze (lib/presenze-discord).
 * Accesso: solo le persone abilitate (lib/presenze-access), mai in «Vedi come».
 */
import { requirePresenze } from "@/lib/presenze-access";
import { fetchPresenze, presenzeConfigured } from "@/lib/presenze-discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const az = await requirePresenze();
  if (!az.ok) return az.response;
  const headers = { "Cache-Control": "no-store" };
  if (!presenzeConfigured()) return Response.json({ error: "Collegamento al bot presenze non configurato (HOC_PRESENZE_API_URL / HOC_PRESENZE_API_SECRET)." }, { status: 503, headers });
  const sp = new URL(req.url).searchParams;
  try {
    const data = await fetchPresenze(sp.get("view") || "day", { day: sp.get("day") || undefined, id: sp.get("id") || undefined, days: sp.get("days") || undefined });
    return Response.json(data, { headers });
  } catch (e) {
    return Response.json({ error: e.message || "Errore nel leggere le presenze." }, { status: e.status || 500, headers });
  }
}
