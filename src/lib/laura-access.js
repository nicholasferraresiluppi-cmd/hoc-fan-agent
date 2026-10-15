// Chi vede Revenue e Chat di una creator (strumento "Revenue e chat"): come le pagine di
// squadra — capability SCORES_VIEW con scope team o all, POI il filtro per creator: serve
// avere quella creator tra le assegnate (admin: tutte). Operatori → 403.
// (Nome storico del file: nato per sola Laura.)
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { seesCreator, publicCreator } from "@/lib/live-creators";
import { getLiveCreators } from "@/lib/live-creators-store";

/** Autorizza su una creator (slug dalla query; senza slug la prima che vede). Ritorna az + creator + elenco visibile. */
export async function authorizeLiveCreator(slug) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return az;
  const all = await getLiveCreators();
  const visible = all.filter((c) => seesCreator(az.creatorScope, c));
  const creator = slug ? all.find((c) => c.slug === slug) : visible[0];
  if (!creator) return slug ? { ok: false, status: 400, message: "Creator non valida" } : { ok: false, status: 403, message: "Nessuna creator assegnata", visible: [] };
  if (!seesCreator(az.creatorScope, creator)) {
    return { ok: false, status: 403, message: `${creator.name} non è tra le creator che ti sono assegnate`, visible: visible.map(publicCreator) };
  }
  return { ...az, creator, visible: visible.map(publicCreator) };
}
