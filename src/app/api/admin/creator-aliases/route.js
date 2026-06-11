/**
 * GET /api/admin/creator-aliases?period_id=YYYY-MM
 *
 * Lista degli alias creator DISTINTI presenti nei dati wage del mese (KV),
 * con conteggio turni. Per autocomplete nei tool comp (calendar, research).
 * Fonte: takes/creator_aliases — gli stessi nomi che il matching usa davvero,
 * quindi zero rischio di typo-mismatch.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 30;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const wages = (await kv.get(`cp:wages:${periodId}`)) || [];
  const counts = new Map();
  for (const w of Array.isArray(wages) ? wages : []) {
    for (const s of w.shifts || []) {
      const seen = new Set();
      for (const a of s.creator_aliases || []) seen.add(a);
      for (const t of s.takes || []) if (t.creator_alias) seen.add(t.creator_alias);
      for (const a of seen) counts.set(a, (counts.get(a) || 0) + 1);
    }
  }
  const aliases = [...counts.entries()]
    .map(([alias, shifts]) => ({ alias, shifts }))
    .sort((a, b) => b.shifts - a.shifts);

  return Response.json({ period_id: periodId, count: aliases.length, aliases });
}
