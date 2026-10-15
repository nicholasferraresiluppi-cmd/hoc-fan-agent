/**
 * /api/contabilita/split/dati?m=YYYY-MM — PROPOSTA di revenue e costo chatter del mese per team,
 * da precompilare (si può sempre correggere a mano):
 *  - revenue $ = `attributed_transactions.net` del warehouse (netta della quota OnlyFans) sulle
 *    pagine del team (`creatorIds`). Su agosto 2026 coincide col foglio di Nicholas entro ~1-2%.
 *  - chatter $ = compenso operatori CreatorsPro attribuito per alias (`cpAliases`, pnl-aggregate).
 *    Su agosto è PIÙ BASSO del foglio (1-34% a seconda della creator): stima, da verificare.
 * Non scrive nulla: il browser mette i numeri nel mese e l'utente salva.
 */
import { requireAccounting } from "@/lib/compensi-access";
import { getSplitConfig } from "@/lib/split";
import { isMonthId } from "@/lib/compensi-core";
import { runOnSource } from "@/lib/analisi-vendite";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getWages } from "@/lib/cp-wages-store";
import { aggregateWagesByAlias } from "@/lib/pnl-aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const NS = { "Cache-Control": "no-store" };

export async function GET(request) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return Response.json({ error: "mese non valido" }, { status: 400, headers: NS });
  const { teams } = await getSplitConfig();
  const [y, mm] = m.split("-").map(Number);
  const from = `${m}-01`;
  const to = `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
  const today = new Date().toISOString().slice(0, 10);
  const partial = to >= today;
  const notes = [];

  const revenue = {};
  const ids = [...new Set(teams.flatMap((t) => t.creatorIds || []))];
  if (ids.length && bigQueryConfigured()) {
    try {
      const { rows } = await runOnSource((refs) => [`SELECT creator_id, SUM(net) AS net FROM \`${refs.attributed}\` WHERE creator_id IN (${ids.join(",")}) AND calendar_date BETWEEN DATE '${from}' AND DATE '${to}' GROUP BY 1`]);
      const byId = new Map(rows[0].map((r) => [Number(r.creator_id), Number(r.net) || 0]));
      for (const t of teams) if (t.creatorIds?.length) revenue[t.id] = Math.round(t.creatorIds.reduce((s, i) => s + (byId.get(i) || 0), 0) * 100) / 100;
    } catch (e) { notes.push(`Revenue dal warehouse non disponibile: ${e.message}`); }
  } else notes.push("Nessuna pagina OnlyFans collegata ai team o warehouse non configurato.");

  const chatter = {};
  try {
    const wages = await getWages(m);
    if (!wages?.length) notes.push(`Wage CreatorsPro di ${m} non sincronizzate: costo chatter da inserire a mano.`);
    else {
      const by = aggregateWagesByAlias(wages);
      for (const t of teams) if (t.cpAliases?.length) chatter[t.id] = Math.round(t.cpAliases.reduce((s, a) => s + (by.get(a)?.cost || 0), 0) * 100) / 100;
    }
  } catch (e) { notes.push(`Wage CreatorsPro non leggibili: ${e.message}`); }

  if (partial) notes.push("Mese in corso: i numeri sono parziali, fino a oggi.");
  return Response.json({ month: m, partial, revenue, chatter, notes }, { headers: NS });
}
