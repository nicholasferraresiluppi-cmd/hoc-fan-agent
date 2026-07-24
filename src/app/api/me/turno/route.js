/**
 * GET /api/me/turno[?creator_id=…]
 *
 * Scheda-fan dell'operatore in turno (pilota copilot). Scope own by design:
 * l'identità e il turno sono risolti SERVER-SIDE dall'utente Clerk; il
 * parametro creator_id è accettato SOLO con scope "all" (admin/SM in demo).
 *
 * Gate: CAPABILITIES.COPILOT_PILOT — la pagina espone LTV dei fan, quindi
 * resta dietro capability finché il pilota non viene promosso (decisione
 * board su comp alignment ancora aperta). Si assegna ai piloti via ruoli
 * custom (/admin/ruoli-custom).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getMyShiftNow, getFanCards, getCreators, bigQueryConfigured } from "@/lib/me-turno";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ACCOUNTS = 3; // un turno copre di norma 1-2 account (IT/EN/ES)

export async function GET(request) {
  const az = await authorize(CAPABILITIES.COPILOT_PILOT);
  if (!az.ok) {
    return Response.json(
      { error: "Pagina in pilota: serve l'abilitazione copilot.pilot (chiedi a un admin)." },
      { status: az.status || 403 }
    );
  }
  if (!bigQueryConfigured()) {
    return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  }

  const who = await getMyShiftNow();
  const url = new URL(request.url);
  const requested = url.searchParams.get("creator_id");

  // Creator del turno attivo; override solo per scope "all" (demo/spot-check).
  let creatorIds = who.active?.creator_ids || [];
  let mode = who.active ? "turno" : "nessun_turno";
  if (requested && az.scope === "all") {
    const cid = parseInt(requested, 10);
    if (!Number.isInteger(cid)) return Response.json({ error: "creator_id non valido" }, { status: 400 });
    creatorIds = [cid];
    mode = "demo";
  }

  const hocCreators = await getCreators(); // lista tenant-scoped (nomi + volume)
  const nameById = new Map(hocCreators.map((c) => [String(c.creator_id), c.creator_name]));
  // difesa in profondità: si lavora solo su creator del tenant HOC
  creatorIds = creatorIds.filter((c) => nameById.has(String(c))).slice(0, MAX_ACCOUNTS);

  const groups = await Promise.all(
    creatorIds.map(async (cid) => ({
      creator_id: String(cid),
      creator_name: nameById.get(String(cid)) || `#${cid}`,
      rows: await getFanCards(cid),
    }))
  );

  return Response.json({
    employee: who.employee,
    linked: Boolean(who.employee),
    reason: who.reason,
    mode,
    shift: who.active || null,
    upcoming: who.upcoming || null,
    groups,
    // il selettore demo compare solo per chi ha scope all
    admin_creators: az.scope === "all" ? hocCreators : undefined,
    generated_at: new Date().toISOString(),
  });
}
