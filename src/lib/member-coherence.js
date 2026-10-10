/**
 * Coerenza di un membro: ruolo, creator visibili e vista devono raccontare la stessa cosa (10/10/2026).
 *
 * Perché: le creator visibili RESTRINGONO un permesso che deve già arrivare dal ruolo (authorizeScoped
 * vuole scores.view con scope team|all, poi filtra per creator). Assegnare creator a chi non ha quel
 * permesso non apre niente, e nessuno se ne accorge: la persona vede pagine vuote e spesso non lo dice.
 * Stessa cosa per la vista: mette in menu strumenti che il ruolo poi nega.
 * Logica pura: la usano Membri (avviso sulla riga), l'alert notturno «access-coherence» e /admin/qualita.
 */
import { canSee } from "./nav-access.js";
import { WORKSPACES, defaultWorkspace } from "./workspaces.js";

const SALES_CAP = "scores.view";

/** Il ruolo apre i dati di vendita di altri? (stessa regola di authorizeScoped) */
export const opensSalesData = (caps) => ["team", "all"].includes(caps?.[SALES_CAP]);

/** Vista effettiva: la scelta salvata, altrimenti quella del ruolo. */
export const effectiveWorkspace = (row) => row?.workspace || defaultWorkspace({ admin: Boolean(row?.admin), roles: row?.roles });

/**
 * row: { admin, banned, creators: {all, creators[]}, caps, roles, workspace }
 * → [{ code, text }] — vuoto se tutto torna.
 */
export function memberIssues(row) {
  if (!row || row.admin || row.banned) return [];
  const out = [];
  const sales = opensSalesData(row.caps);
  const hasCreators = Boolean(row.creators?.all || row.creators?.creators?.length);
  if (hasCreators && !sales) {
    out.push({ code: "creators-without-role", text: "Ha delle creator assegnate, ma nessun ruolo che apra i dati di vendita: le pagine di vendita gli arrivano vuote. Serve un ruolo (es. Sales Manager)." });
  }
  if (sales && !hasCreators) {
    out.push({ code: "role-without-creators", text: "Il ruolo apre i dati di vendita, ma non ha creator assegnate: non vedrà numeri finché non gliene dai." });
  }
  // Il menu nasconde da sé le voci che il ruolo nega (Sidebar → canSee). Il problema è una vista
  // che resta quasi vuota: vuol dire che non è la vista giusta per quel ruolo.
  const ws = WORKSPACES[effectiveWorkspace(row)];
  if (ws) {
    const caps = { ...(row.caps || {}), ...(row.creators?.all ? { "creators.all": "all" } : {}) };
    const items = ws.sections.flatMap((s) => s.items);
    const visible = items.filter((i) => canSee(i.href, caps, false));
    if (visible.length * 2 < items.length) {
      out.push({ code: "view-mostly-empty", text: `La vista ${ws.label} gli mostra solo ${visible.length} strumenti su ${items.length}: le altre voci il suo ruolo non le apre, quindi non è la vista giusta (o manca un ruolo).` });
    }
  }
  return out;
}
