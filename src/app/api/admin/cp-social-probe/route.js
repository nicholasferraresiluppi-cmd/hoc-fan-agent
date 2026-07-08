/**
 * GET /api/admin/cp-social-probe?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * DISCOVERY throwaway del modulo Social Analytics CP (terza fonte revenue).
 * Ritorna forma E VALORI reali (admin-only, dati aziendali) per calibrare:
 *   - talents: conteggio + primi 3 grezzi (id, name, creators)
 *   - overview timeframe: totals + primi 8 talent grezzi
 * Serve a rispondere: unità ($/cent), netto o lordo, granularità account,
 * paginazione (51 talent, limit 50 → 2 pagine?).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchSocialTalents, fetchSocialTalentRevenue } from "@/lib/creatorspro-api";

export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const start = url.searchParams.get("start") || "2026-07-01";
  const end = url.searchParams.get("end") || "2026-07-07";
  const startDate = `${start}T00:00:00.000Z`;
  const endDate = `${end}T23:59:59.999Z`;

  const out = { window: { startDate, endDate } };

  try {
    const t = await fetchSocialTalents();
    const list = Array.isArray(t?.data) ? t.data : (Array.isArray(t) ? t : []);
    out.talents = {
      count: list.length,
      top_keys: Object.keys(t || {}).slice(0, 8),
      sample: list.slice(0, 3),
    };
  } catch (e) { out.talents = { error: String(e?.message || e).slice(0, 180) }; }

  try {
    const r = await fetchSocialTalentRevenue({ startDate, endDate, page: 1, limit: 100 });
    const talents = r?.talents || r?.data?.talents || [];
    out.overview = {
      top_keys: Object.keys(r || {}).slice(0, 10),
      totals: r?.totals ?? r?.data?.totals ?? null,
      talents_count: Array.isArray(talents) ? talents.length : null,
      sample: Array.isArray(talents) ? talents.slice(0, 8) : talents,
    };
  } catch (e) { out.overview = { error: String(e?.message || e).slice(0, 180) }; }

  return Response.json(out);
}
