/**
 * Percorso dei nuovi iscritti (14/11/2026) — l'identikit di come entra e spende un fan nuovo.
 *
 * Richiesta arrivata dal team: «quando si iscrivono, dopo quanto spendono la prima volta e
 * quanti $, quanto restano fermi dopo la prima spesa, dopo quanto tornano e con quanto».
 * Per ogni pagina dello split (ITA ed ENG separate: fan diversi) e per mese d'iscrizione:
 *   - nuovo iscritto = la PRIMA iscrizione di quel fan a quella pagina (in HOC). Chi si era già
 *     iscritto in passato e torna non conta: è un ritorno, non un ingresso;
 *   - spesa = messaggi a pagamento, mance, post a pagamento. L'abbonamento (e il rinnovo) è
 *     l'ingresso, non una spesa: sulle pagine a pagamento non conta come «prima spesa»;
 *   - giro di acquisti = acquisti a meno di 6 ore l'uno dall'altro (misurato: il grosso dei
 *     riacquisti cade entro 2 ore — è la stessa serata, non un ritorno);
 *   - ogni passo si guarda per 30 giorni (1ª spesa entro 30 gg dall'iscrizione; ritorno entro
 *     30 gg dalla fine del giro prima) e si conta SOLO chi è stato osservato abbastanza, così
 *     i mesi recenti non escono più veloci del vero.
 * Solo aggregati (nessun fan nominato), sempre filtrato sull'organizzazione HOC.
 * Costo misurato: ~0,65 GB per tutto lo split (6 mesi); cache KV giornaliera.
 */
import { kv } from "@vercel/kv";
import { HOC_ORGANIZATION_ID, bqQuery, bqProjects } from "@/lib/bigquery-api";
import { splitPages } from "@/lib/retention-split";
import { journeySql, shapeJourney, GIRO_GAP_HOURS, STAGE_DAYS, MONTHS, FIRST_HOURS_EDGES, AMOUNT_EDGES, PAUSE_HOURS_EDGES } from "@/lib/percorso-iscritti-sql";

export const JOURNEY_VERSION = "percorso-1";
const MAX_BYTES = 4 * 1024 ** 3;

export async function computeJourney() {
  const pages = await splitPages();
  const base = {
    version: JOURNEY_VERSION, computed_at: Date.now(),
    rules: { giroGapHours: GIRO_GAP_HOURS, stageDays: STAGE_DAYS, months: MONTHS, firstHoursEdges: FIRST_HOURS_EDGES, amountEdges: AMOUNT_EDGES, pauseHoursEdges: PAUSE_HOURS_EDGES },
  };
  if (!pages.length) return { ...base, pages: [], months: [], main: {}, hour: {}, dow: {}, link: {} };
  const { dataProject } = bqProjects();
  const t = { subs: `${dataProject}.onlyfans.subscriptions_intervals`, attributed: `${dataProject}.onlyfans.attributed_transactions` };
  const { rows } = await bqQuery(journeySql(t, pages.map((p) => p.creator_id), HOC_ORGANIZATION_ID), { maxBytesBilled: MAX_BYTES });
  return { ...base, ...shapeJourney(rows, pages) };
}

const cacheKey = () => `percorso:iscritti:${JOURNEY_VERSION}:${new Date().toISOString().slice(0, 10)}`;

/** Una volta al giorno (i mesi passati non cambiano, quello in corso si muove piano): cache KV 26h. */
export async function getJourney({ force = false } = {}) {
  if (!force) {
    const hit = await kv.get(cacheKey()).catch(() => null);
    if (hit) return { ...hit, cached: true };
  }
  const fresh = await computeJourney();
  await kv.set(cacheKey(), fresh, { ex: 26 * 3600 }).catch(() => {});
  return fresh;
}
