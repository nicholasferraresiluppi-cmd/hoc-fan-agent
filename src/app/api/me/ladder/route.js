/**
 * GET /api/me/ladder
 *
 * "Il mio percorso" — scope own (docs/VISIBILITY_POLICY.md).
 * Valuta i gate di performance della career ladder (docs/CAREER_LADDER.md §4)
 * sullo storico score Infloww dell'operatore e mostra a che punto è.
 *
 * Onestà dichiarata nel payload: i gate hanno anche componenti non ancora
 * tracciate a sistema (tenure formale, QA, mentoring, certificazioni) — quelle
 * sono marcate "not_tracked" e il livello formale arriverà col piazzamento
 * data-driven (decisione #5 della ladder). Qui si mostra SOLO la parte
 * performance, per dare visibilità del criterio, non un verdetto di promozione.
 *
 * Identità risolta server-side. La ladder è pubblicata: i criteri sono
 * leggibili da ogni operatore (ladder trasparente, principio 7 della ladder).
 */
import { resolveEmployeeForUser, resolveInflowwName } from "@/lib/me";
import { loadHistoryForEmployee } from "@/lib/leaderboard-history";
import { listReviewsForEmployee, qaStatusForGate } from "@/lib/qa-reviews";

const TIER_ORDER = ["Critical", "Weak", "Average", "Good", "Strong", "Elite"];
const rank = (tier) => TIER_ORDER.indexOf(tier);

/** Valuta "tier >= minTier in almeno needed degli ultimi window mesi valutabili". */
function evalGate(history, { minTier, needed, window, noCritical = false }) {
  const usable = history.filter((h) => h.tier).slice(0, window); // history è desc
  const hits = usable.filter((h) => rank(h.tier) >= rank(minTier)).length;
  const criticals = usable.filter((h) => h.tier === "Critical").length;
  const months = usable.map((h) => ({ period_id: h.period_id, tier: h.tier, counts: rank(h.tier) >= rank(minTier) }));
  const evaluable = usable.length >= Math.min(needed, window);
  const passedPerf = evaluable && hits >= needed && (!noCritical || criticals === 0);
  return {
    requirement: `tier ≥ ${minTier} in ${needed} degli ultimi ${window} mesi${noCritical ? ", nessun mese Critical" : ""}`,
    evaluable,
    months_available: usable.length,
    hits,
    needed,
    window,
    criticals,
    performance_met: passedPerf,
    months,
  };
}

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!who.employee) {
    return Response.json({ linked: false, reason: who.reason || "no_match" });
  }

  // Il nome CP e quello Infloww possono differire: risolviamo il nome esatto
  // lato Infloww prima di leggere lo storico (match esatto nella lib).
  const inflowwName = (await resolveInflowwName(who.employee)) || who.employee;
  let history = [];
  try {
    const h = await loadHistoryForEmployee({ employee: inflowwName, periodType: "monthly", limit: 12 });
    // I gate valutano gli ULTIMI mesi di CALENDARIO: ordina per period_id desc
    // (la lib segue l'ordine di import, non cronologico).
    history = (h || [])
      .map((x) => ({ period_id: x.period_id, score: x.score, tier: x.tier }))
      .sort((a, b) => String(b.period_id).localeCompare(String(a.period_id)));
  } catch {}

  if (!history.length) {
    return Response.json({ linked: true, employee: who.employee, reason: "no_history" });
  }

  // QA reale (§8.1) quando esistono review; senza review resta "non tracciato".
  let qa3 = null;
  let qa6 = null;
  try {
    const reviews = await listReviewsForEmployee(who.employee);
    qa3 = qaStatusForGate(reviews, { windowMonths: 3 });
    qa6 = qaStatusForGate(reviews, { windowMonths: 6 });
  } catch {}
  const qaReq = (qs, label) =>
    qs
      ? {
          label,
          status: qs.frozen_by_compliance ? "compliance_fail" : qs.pass ? "met" : "not_met",
          detail: `${qs.passes}/${qs.reviews} review pass negli ultimi ${qs.window_months} mesi${qs.compliance_fails ? ` · ${qs.compliance_fails} fail compliance` : ""}`,
        }
      : { label, status: "not_tracked" };

  // Gate performance dalla ladder v0.5 §4 (solo componente performance).
  const gates = [
    {
      id: "L1_L2",
      label: "Sales Operator I → II",
      time_floor: "≥ 6 mesi in L1",
      performance: evalGate(history, { minTier: "Average", needed: 3, window: 4, noCritical: true }),
      other_requirements: [
        qaReq(qa3, "QA trimestrale pass"),
        { label: "Certificazioni base complete", status: "check_academy" },
        { label: "Time floor (tenure nel livello)", status: "not_tracked" },
      ],
    },
    {
      id: "L2_L3",
      label: "Sales Operator II → III (Senior)",
      time_floor: "≥ 10 mesi in L2",
      performance: evalGate(history, { minTier: "Good", needed: 4, window: 6 }),
      other_requirements: [
        qaReq(qa6, "QA pass, zero violazioni compliance 6 mesi"),
        { label: "Mentoring di ≥ 2 nuovi ingressi", status: "not_tracked" },
        { label: "Time floor (tenure nel livello)", status: "not_tracked" },
      ],
    },
  ];

  return Response.json({
    linked: true,
    employee: who.employee,
    current: history[0] || null,
    history,
    gates,
    formal_level: null, // arriverà col piazzamento data-driven (ladder, decisione #5)
    note: "Qui vedi la componente performance dei gate. Tenure, QA e mentoring saranno tracciati a sistema nelle prossime fasi; il livello formale sarà assegnato col piazzamento data-driven sugli ultimi 6 mesi.",
  });
}
