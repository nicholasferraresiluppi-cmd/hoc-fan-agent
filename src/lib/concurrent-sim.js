/**
 * Sim a chat concorrenti — il "punto di degrado".
 *
 * La skill vera del chatter OFM è reggere PIÙ fan insieme senza che la qualità
 * crolli. Nessun tool OFM la misura; il simulatore single-chat nemmeno. Qui
 * l'operatore gestisce N conversazioni in parallelo e alla fine ognuna viene
 * valutata con lo stesso scorer del single-sim: la differenza tra la chat
 * gestita meglio e quella lasciata indietro è il segnale di degrado.
 *
 * Modulo PURO (nessun kv/network): logica testabile, riusabile client + server.
 */

// Sopra questa soglia una chat è "retta a qualità piena".
export const QUALITY_BAR = 60;
// Spread (best-worst) entro cui consideriamo la qualità "tenuta".
const SPREAD_STABLE = 12;
const SPREAD_SLIPPING = 25;

/**
 * @param {Array<{overall:number, compliance_fail?:boolean, archetypeName?:string,
 *   messageCount?:number}>} results — un elemento per conversazione valutata.
 * @returns riepilogo + verdetto, o null se nessuna conversazione valutabile.
 */
export function analyzeConcurrentSession(results) {
  const scored = (results || []).filter((r) => r && typeof r.overall === "number");
  if (!scored.length) return null;

  const overalls = scored.map((r) => r.overall);
  const avg = Math.round(overalls.reduce((a, b) => a + b, 0) / scored.length);
  const best = Math.max(...overalls);
  const worst = Math.min(...overalls);
  const spread = best - worst;

  const heldWell = scored.filter((r) => r.overall >= QUALITY_BAR && !r.compliance_fail).length;
  const complianceFails = scored.filter((r) => r.compliance_fail).length;

  let verdict;
  if (complianceFails > 0) {
    verdict = {
      key: "compliance",
      tone: "bad",
      label: `Violazione compliance su ${complianceFails} chat su ${scored.length}`,
      detail: "Sotto pressione hai superato una riga rossa: è il fallimento più grave, a prescindere dalla capacità.",
    };
  } else if (spread <= SPREAD_STABLE && avg >= QUALITY_BAR) {
    verdict = {
      key: "stable",
      tone: "good",
      label: `Reggi ${scored.length} chat a qualità piena`,
      detail: "La qualità tiene su tutte le conversazioni: distribuisci bene l'attenzione.",
    };
  } else if (spread <= SPREAD_SLIPPING) {
    verdict = {
      key: "slipping",
      tone: "warn",
      label: `Tieni ${heldWell} chat su ${scored.length} — la qualità inizia a calare`,
      detail: "Reggi la pressione ma con un divario: qualche fan riceve una versione più debole di te.",
    };
  } else {
    verdict = {
      key: "dropping",
      tone: "bad",
      label: `Solo ${heldWell} chat su ${scored.length} regge`,
      detail: "Distribuendo l'attenzione la qualità crolla: è il tuo punto di degrado su questo numero di chat.",
    };
  }

  return { count: scored.length, avg, best, worst, spread, heldWell, complianceFails, verdict };
}
