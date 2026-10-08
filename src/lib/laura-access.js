// Chi vede Revenue e Chat di una creator (strumento "Revenue e chat"): come le pagine di
// squadra — capability SCORES_VIEW con scope team o all, POI il filtro per creator: serve
// avere quella creator tra le assegnate (admin: tutte). Operatori → 403.
// (Nome storico del file: nato per sola Laura.)
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { LIVE_CREATORS, DEFAULT_CREATOR, getLiveCreator, seesCreator, publicCreator } from "@/lib/live-creators";

/** Autorizza su una creator (slug dalla query, default Laura). Ritorna az + creator + elenco visibile. */
export async function authorizeLiveCreator(slug) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return az;
  const visible = LIVE_CREATORS.filter((c) => seesCreator(az.creatorScope, c));
  const creator = getLiveCreator(slug || DEFAULT_CREATOR);
  if (!creator) return { ok: false, status: 400, message: "Creator non valida" };
  if (!seesCreator(az.creatorScope, creator)) {
    return { ok: false, status: 403, message: `${creator.name} non è tra le creator che ti sono assegnate`, visible: visible.map(publicCreator) };
  }
  return { ...az, creator, visible: visible.map(publicCreator) };
}
