/**
 * /api/admin/citta/persone — anagrafica del team progetto della città (ruolo, costo, accordo,
 * palazzi). GET = elenco (persone viste in ClickUp + schede); POST {person} salva, {delete:key} toglie.
 * SEED: i costi delle persone sono dati riservati.
 */
import { kv } from "@vercel/kv";
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { TEAMS_KEY } from "@/lib/citta-clickup";
import { ROLES, SPARK_AREAS, getPeople, savePerson, deletePerson, directory } from "@/lib/citta-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function towers() {
  const comp = await kv.get("citta:comp");
  return [...(comp?.projects || []).map((p) => p.n), "Azienda"];
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const [teams, people, tw] = await Promise.all([kv.get(TEAMS_KEY), getPeople(), towers()]);
  const dir = directory(teams, people, tw.filter((t) => t !== "Azienda"));
  const hidden = Object.entries(people).filter(([, c]) => c.hidden).map(([key, c]) => ({ key, name: c.name, email: c.email }));
  dir.sort((a, b) => Number(Boolean(b.card?.role)) - Number(Boolean(a.card?.role)) || Object.keys(b.clickup).length - Object.keys(a.clickup).length || a.name.localeCompare(b.name));
  return Response.json({ people: dir, hidden, roles: ROLES, sparkAreas: SPARK_AREAS, towers: tw, clickupAt: teams?.at || null });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  try {
    if (body?.delete) { await deletePerson(String(body.delete).slice(0, 140)); return Response.json({ ok: true }); }
    const me = await currentUser().catch(() => null);
    const by = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "admin";
    return Response.json({ ok: true, ...(await savePerson(body?.person || {}, await towers(), by)) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
