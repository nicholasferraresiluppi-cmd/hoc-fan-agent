/**
 * GET /api/me/signals
 *
 * Profilo-segnali PERSONALE dell'operatore + percorso di training suggerito.
 * È la cucitura tra la linea diagnostica (operator-signals.js #70) e quella di
 * allenamento (coaching-paths.js #73) portata al COCKPIT D'AZIONE dell'operatore
 * (/me/turno): un solo schermo per diagnostica → allena → agisci.
 *
 * Scope OWN by design: riusa il motore org-level (che nella vista d'insieme è
 * SEED/admin, perché espone tutti gli operatori) ma restituisce SOLO il profilo
 * dell'utente loggato — mai la distribuzione, mai gli altri operatori, mai il
 * percentile grezzo. Gate: COPILOT_PILOT (aperto a tutta HOC, scope own).
 *
 * Identità via lo STESSO resolver di /me/score e /profilo (override admin OPPURE
 * match email su roster/CP): questi segnali sono comportamentali e NON espongono
 * PII fan, quindi non serve il pilot-link esplicito — così la diagnostica
 * personale è self-serve. (L'override resta obbligatorio solo dove si mostrano
 * gli LTV fan, cioè le card di /api/me/turno.) Anti-spoof invariato: l'employee
 * lo risolve sempre il server dall'utente Clerk, mai il client.
 *
 * Niente di questa superficie entra negli score (policy dati-operatore: i
 * segnali informano il coaching, non la comp).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";
import { getOperatorSignalProfiles, bigQueryConfigured } from "@/lib/operator-signals";
import { recommendPathForGap } from "@/lib/coaching-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
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

  // Identità server-side (override admin o match email roster/CP), mai dal client.
  // Segnali comportamentali, nessuna PII fan → il match email basta (come /me/score).
  const who = await resolveEmployeeForUser();
  if (!who?.employee) {
    return Response.json({ linked: false, reason: who?.reason || "no_match" });
  }

  let all;
  try {
    // Cache org riscaldata dal cron dispatch: qui non si forza mai il ricalcolo.
    all = await getOperatorSignalProfiles();
  } catch {
    return Response.json({ error: "Profilo segnali non disponibile ora." }, { status: 503 });
  }

  const wanted = normalizeName(who.employee);
  const mine = (all?.profiles || []).find((p) => normalizeName(p.operator) === wanted);
  if (!mine) {
    // Nessun profilo: non ha ancora abbastanza turni a operatore SINGOLO
    // (in duo il warehouse non attribuisce chi ha scritto — copertura nota).
    return Response.json({ linked: true, profile: null, reason: "no_profile" });
  }

  // Percorso di training dal gap principale (stessa logica di #73, a read-time
  // così resta allineato al catalogo scenari corrente).
  const path = mine.top_gap ? recommendPathForGap(mine.top_gap.key) : null;

  // Scope own: SOLO il profilo dell'utente, metriche con valore + verdetto.
  // Si toglie il percentile grezzo (goodness) e la mediana org: all'operatore
  // basta "forte/ok/gap" sul suo dato — niente lettura da classifica-sorveglianza.
  const metrics = (mine.metrics || []).map((m) => ({
    key: m.key,
    label: m.label,
    display: m.display,
    verdict: m.verdict,
    caveat: m.caveat || null,
  }));

  return Response.json({
    linked: true,
    profile: {
      operator: mine.operator,
      shifts: mine.shifts,
      rev_per_h: mine.rev_per_h,
      top_gap: mine.top_gap, // {key,label,coaching} | null
      top_strength: mine.top_strength, // {key,label} | null
      metrics,
    },
    path, // {focus, categories, scenarios[]} | null
    version: all.version,
  });
}
