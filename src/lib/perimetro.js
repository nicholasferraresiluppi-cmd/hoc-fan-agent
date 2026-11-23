/**
 * Perimetro del personale — lettura (23/11/2026). Logica in perimetro-core.js.
 *
 * Fonti: lo split (`sales:splits`, gestito da /admin/creator-split) e la cache notturna della
 * Squadra (`squadra:data:*`, ore per creator degli ultimi 3 mesi). Entrambe piccole: nessuna
 * lettura di wage CP o warehouse all'apertura di una pagina (incidente banda Upstash 04/10).
 *
 * Uso nelle route:
 *   const per = await getPerimetro();
 *   rows = keepOurs(rows, per.inRoster, (r) => r.employee);
 *
 * Se manca lo split o la Squadra non è ancora calcolata il perimetro è «aperto» (ok:false):
 * si mostra tutto piuttosto che pagine vuote, e la risposta lo dichiara (`perimetro.ok`).
 */
import { listSplits } from "@/lib/sales-coaching";
import { getSquadraData } from "@/lib/squadra";
import { buildRoster, makeInRoster, keepOurs } from "@/lib/perimetro-core";

const TTL_MS = 5 * 60 * 1000;
let mem = null; // { at, value }

const OPEN = { ok: false, inRoster: () => true, size: null, split: null };

export async function getPerimetro({ force = false } = {}) {
  if (!force && mem && Date.now() - mem.at < TTL_MS) return mem.value;
  let value = OPEN;
  try {
    const [splits, squadra] = await Promise.all([listSplits(), getSquadraData()]);
    const split = splits?.[0] || null; // oggi uno solo: «Split Nicholas»
    if (split?.creator_ids?.length && squadra?.rows?.length) {
      const people = buildRoster(squadra.rows, split.creator_ids);
      if (people.length) {
        value = {
          ok: true,
          inRoster: makeInRoster(people),
          size: people.length,
          split: { id: split.id, name: split.name, creator_ids: split.creator_ids.map(Number) },
          people,
        };
      }
    }
  } catch {
    value = OPEN;
  }
  mem = { at: Date.now(), value };
  return value;
}

/** Riassunto da mettere nelle risposte API: la pagina può dire «solo personale dello split». */
export const perimetroInfo = (per) => ({ ok: Boolean(per?.ok), split: per?.split?.name || null, size: per?.size ?? null });

export { keepOurs };
