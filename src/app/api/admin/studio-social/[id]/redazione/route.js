// La redazione video di un profilo (permesso social.manage): giri registrati, la squadra e il percorso
// dal montaggio al reel che rende. Solo lettura: i giri si registrano con scripts/studio-giro.mjs.
export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfile } from "@/lib/studio-social";
import { getBanco } from "@/lib/studio-banco";
import { getEsitiData, getLinks } from "@/lib/studio-esiti";
import { buildOutcomes } from "@/lib/studio-esiti-core";
import { getGiri } from "@/lib/studio-giri";
import { TEAM, teamTotals, funnel, teamWork } from "@/lib/studio-giri-core";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return Response.json({ error: "Profilo non trovato" }, { status: 404 });

  const [giri, banco] = await Promise.all([getGiri(id), getBanco(id).catch(() => null)]);
  const rows = banco?.rows || [];
  // le misure solo dalla cache di «Cosa ha funzionato» se c'è già: qui non si fa partire una lettura del magazzino
  let esiti = [];
  if (profile.platform === "instagram") {
    const [data, links] = await Promise.all([getEsitiData(id, profile.handle, { cacheOnly: true }), getLinks(id)]);
    const bancoById = Object.fromEntries(rows.map((r) => [r.id, { title: r.title, path: r.path }]));
    esiti = buildOutcomes({ reels: data.reels || [], accountDays: data.accountDays || {}, links, banco: bancoById, lastDay: data.lastDay });
  }
  const inp = { giri, banco: rows, esiti };
  return Response.json({ team: TEAM, work: teamWork(inp), totals: teamTotals(giri), funnel: funnel(inp), giri }, { headers: { "Cache-Control": "no-store" } });
}
