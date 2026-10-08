// Chi vede le pagine di Laura (Revenue Laura, Laura Chat Monitor): come le pagine
// di squadra — capability SCORES_VIEW con scope team o all, POI il filtro per
// creator: serve avere Laura tra le creator assegnate (admin: tutto). Operatori → 403.
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";

// Laura in CreatorsPro/Infloww compare come "Laura", "Laura ENG", "Laura Sommaruga - IT"…:
// basta che una creator assegnata sia una "Laura".
export const seesLaura = (scope) => Boolean(scope?.all || [...(scope?.creators || [])].some((c) => /^laura\b/i.test(String(c).trim())));

export async function authorizeLaura() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return az;
  if (!seesLaura(az.creatorScope)) return { ok: false, status: 403, message: "Laura non è tra le creator che ti sono assegnate" };
  return az;
}
