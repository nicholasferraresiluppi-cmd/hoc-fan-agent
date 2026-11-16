// Radar salary — ricerche su Instagram (Apify), lanciate dalla pagina (16/11/2026).
//   GET                       → ultime ricerche
//   GET ?id=…                 → stato di una ricerca (se è finita, i candidati)
//   POST { kind, q }          → lancia una ricerca ("parola" | "seguiti")
//   POST { id, read: [h…] }   → legge i numeri di alcuni candidati (follower, view mediane, link)
// Tetto di spesa mensile in salary-radar-core (MONTHLY_CAP_USD), controllato dal server.
import { authorizeSalaryRadar, fail } from "../auth";
import { getSearches, pollSearch, startSearch, readCandidates, getStore, loadOurRows } from "@/lib/salary-radar";
import { normHandle } from "@/lib/salary-radar-core";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function knownHandles() {
  const store = await getStore();
  const wh = await loadOurRows(store.talents).catch(() => null);
  return new Set([...(wh?.rows || []).map((r) => normHandle(r.u)), ...Object.keys(store.accounts)]);
}

export async function GET(request) {
  const az = await authorizeSalaryRadar();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) return Response.json({ search: await pollSearch(id, await knownHandles()) });
    const list = await getSearches();
    return Response.json({ searches: list.map(({ cands, ...s }) => ({ ...s, n: (cands || []).length })) });
  } catch (e) { return fail(e); }
}

export async function POST(request) {
  const az = await authorizeSalaryRadar();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    const rl = await checkRateLimit("scouting_signal", az.userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
    if (body.id && Array.isArray(body.read)) return Response.json({ search: await readCandidates(body.id, body.read) });
    return Response.json({ search: await startSearch({ kind: body.kind, q: body.q, by: String(body.by || "").slice(0, 80) || null }) });
  } catch (e) { return fail(e); }
}
