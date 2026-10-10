/**
 * Coerenza di un membro: ruolo, creator visibili e vista devono raccontare la stessa cosa (10/10/2026).
 *
 * Perché: le creator visibili RESTRINGONO un permesso che deve già arrivare dal ruolo (authorizeScoped
 * vuole scores.view con scope team|all, poi filtra per creator). Assegnare creator a chi non ha quel
 * permesso non apre niente, e nessuno se ne accorge: la persona vede pagine vuote e spesso non lo dice.
 * Logica pura: la usano Membri (avviso sulla riga) e, quando servirà, un alert operativo.
 */

const SALES_CAP = "scores.view";

/** Il ruolo apre i dati di vendita di altri? (stessa regola di authorizeScoped) */
export const opensSalesData = (caps) => ["team", "all"].includes(caps?.[SALES_CAP]);

/**
 * row: { admin, banned, creators: {all, creators[]}, caps, workspace }
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
  if (row.workspace === "sales" && !sales) {
    out.push({ code: "view-without-role", text: "La vista Sales Manager gli mette in menu strumenti che il suo ruolo non apre." });
  }
  return out;
}
