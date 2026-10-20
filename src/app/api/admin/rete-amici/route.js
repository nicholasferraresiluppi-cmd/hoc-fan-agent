/**
 * Rete amici (lib/rete-amici) — quanti iscritti porta la sezione «Amici» dei profili OnlyFans.
 * GET [?refresh=1]      → collegamenti + misura (iscritti e spesa di tutte le pagine → authorizeAll(SCORES_VIEW))
 * GET ?q=nome           → ricerca pagine per il modulo "aggiungi"
 * POST { action: "add", host_id, target_id, since?, note? } | { action: "close", id, until? } | { action: "since", id, since }
 *   → SEED (admin): la mappa decide cosa si misura per tutti.
 */
import { authorize, authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { searchPages } from "@/lib/live-creators-store";
import { personOfPage, countryOfPage } from "@/lib/live-creators";
import { getRete, addLink, closeLink, setSince } from "@/lib/rete-amici";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const url = new URL(request.url);
  try {
    const q = url.searchParams.get("q");
    if (q != null) {
      const pages = await searchPages(q);
      return Response.json({
        results: pages.filter((p) => !p.deleted).map((p) => ({
          id: p.id, name: personOfPage(p), country: countryOfPage(p), username: p.username || null, net30: p.net30,
        })),
      });
    }
    const force = url.searchParams.get("refresh") === "1";
    return Response.json(await getRete({ force }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "add") return Response.json({ ok: true, link: await addLink(body, az.userId) });
    if (body.action === "close") return Response.json({ ok: true, link: await closeLink(String(body.id || ""), body.until || null, az.userId) });
    if (body.action === "since") return Response.json({ ok: true, link: await setSince(String(body.id || ""), body.since || null, az.userId) });
    return Response.json({ error: "Azione non valida" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio non riuscito" }, { status: 400 });
  }
}
