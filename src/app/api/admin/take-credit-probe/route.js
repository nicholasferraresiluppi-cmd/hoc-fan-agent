/**
 * GET /api/admin/take-credit-probe?period_id=YYYY-MM&creator_id=<id>[&alias=]
 *
 * ANALISI della sezione Take Credit di CP (endpoint scoperto lug 2026:
 * /v1/take-credit/transactions, bot-accessibile): per una creator e un mese,
 * classifica le transazioni in PRESE (qualcuno ha preso il credito) vs
 * LIBERE (nessuno le ha reclamate) e somma gli importi. Serve a spiegare i
 * buchi di attribuzione: "il venduto c'è, i takes no" → quanti $ sono
 * rimasti liberi, quando, di che tipo.
 *
 * Difensivo sui parametri (API non documentata): prova il filtro creatorId
 * server-side e verifica sui risultati; se ignorato, filtra client-side.
 * Niente PII fan nella risposta (solo importi/date/tipi aggregati).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { probeGet } from "@/lib/creatorspro-api";

export const maxDuration = 60;
const r2 = (x) => Math.round(x * 100) / 100;

const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const romeDay = (x) => { const d = new Date(x); return Number.isNaN(d.getTime()) ? null : romeDayFmt.format(d); };

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  const creatorId = url.searchParams.get("creator_id") || "";
  const alias = url.searchParams.get("alias") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId) || !creatorId) {
    return Response.json({ error: "period_id YYYY-MM e creator_id richiesti" }, { status: 400 });
  }

  const monthStart = `${periodId}-01`;
  const [y, m] = periodId.split("-").map(Number);
  const monthEnd = `${periodId}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  // Discovery RIGOROSA del filtro creator: la UI di CP filtra per creator,
  // quindi l'API lo supporta — va trovato il nome giusto del parametro.
  // Verifica: (a) la pagina non filtrata contiene ANCHE altri creator (controllo
  // che il filtro cambi davvero il risultato), (b) col parametro attivo TUTTE
  // le righe appartengono al creator richiesto e non è vuoto.
  const rowsOf = (r) => Array.isArray(r?.sample?.data) ? r.sample.data : (Array.isArray(r?.sample) ? r.sample : []);
  const baseline = await probeGet(`/v1/take-credit/transactions`, { query: { limit: 20, page: 1 } });
  const baseRows = rowsOf(baseline);
  const baselineMixed = baseRows.some((t) => String(t?.creator?.id ?? "") !== String(creatorId));

  const creatorParams = ["creatorIds", "creatorIds[]", "creators", "creators[]", "creatorId", "creator", "fansiteIds", "fansiteIds[]", "fansiteId"];
  let mode = "nessuno (filtro client-side)", useQ = {};
  for (const p of creatorParams) {
    const r = await probeGet(`/v1/take-credit/transactions`, { query: { [p]: creatorId, limit: 20, page: 1 } });
    if (!r.ok) continue;
    const rows = rowsOf(r);
    if (rows.length > 0 && rows.every((t) => String(t?.creator?.id ?? "") === String(creatorId)) && baselineMixed) {
      mode = p; useQ = { [p]: creatorId };
      break;
    }
  }

  // Discovery filtro PERIODO (la UI ha "Period"): valida chiedendo solo fino
  // al 3 del mese → se la riga più recente è ≤ giorno 3, il parametro agisce.
  const probeEnd = `${periodId}-03`;
  const datePairs = [
    ["startedAt", "endedAt"], ["startDate", "endDate"], ["from", "to"], ["dateFrom", "dateTo"], ["start", "end"],
  ];
  let dateMode = null, dateQ = {};
  for (const [a, b] of datePairs) {
    const r = await probeGet(`/v1/take-credit/transactions`, {
      query: { ...useQ, [a]: `${monthStart}T00:00:00.000Z`, [b]: `${probeEnd}T23:59:59.999Z`, limit: 20, page: 1 },
    });
    if (!r.ok) continue;
    const rows = rowsOf(r);
    if (rows.length === 0) continue;
    const newest = rows.map((t) => romeDay(t?.createdAt)).filter(Boolean).sort().pop();
    if (newest && newest <= probeEnd) { dateMode = `${a}/${b}`; dateQ = { [a]: `${monthStart}T00:00:00.000Z` }; dateQ._endKey = b; break; }
  }

  // Pagina e aggrega. Con filtri server-side il mese intero è ~10-30 pagine.
  const agg = {
    n_total: 0, n_taken: 0, n_free: 0,
    amount_total: 0, amount_taken: 0, amount_free: 0,
    by_type_free: {}, by_day_free: {},
    sample_take_fields: null, free_all: [],
  };
  let pages = 0, stop = false, scanned = 0, oldestSeen = null, newestSeen = null;
  const MAXP = 60;
  const pageQ = { ...useQ };
  if (dateMode) { const endKey = dateQ._endKey; pageQ[Object.keys(dateQ)[0]] = dateQ[Object.keys(dateQ)[0]]; pageQ[endKey] = `${monthEnd}T23:59:59.999Z`; }
  while (pages < MAXP && !stop) {
    const r = await probeGet(`/v1/take-credit/transactions`, { query: { ...pageQ, limit: 100, page: pages + 1 } });
    if (!r.ok) break;
    const rows = Array.isArray(r.sample?.data) ? r.sample.data : (Array.isArray(r.sample) ? r.sample : []);
    if (rows.length === 0) break;
    pages++;
    let allOlder = true;
    for (const t of rows) {
      scanned++;
      const day = t?.createdAt ? romeDay(t.createdAt) : null;
      if (day) {
        if (!oldestSeen || day < oldestSeen) oldestSeen = day;
        if (!newestSeen || day > newestSeen) newestSeen = day;
      }
      if (String(t?.creator?.id ?? "") !== String(creatorId)) continue;
      if (!day || day < monthStart || day > monthEnd) { if (day && day >= monthStart) allOlder = false; continue; }
      allOlder = false;
      const amt = Number(t?.amount) || 0;
      const takesArr = Array.isArray(t?.takes) ? t.takes : [];
      const isTaken = Boolean(t?.taken) || takesArr.length > 0;
      agg.n_total++; agg.amount_total += amt;
      if (isTaken) { agg.n_taken++; agg.amount_taken += amt; }
      else {
        agg.n_free++; agg.amount_free += amt;
        const ty = t?.type || "?";
        agg.by_type_free[ty] = r2((agg.by_type_free[ty] || 0) + amt);
        agg.by_day_free[day] = r2((agg.by_day_free[day] || 0) + amt);
        agg.free_all.push({ day, amount: amt, type: t?.type || null });
      }
      if (!agg.sample_take_fields && takesArr[0]) agg.sample_take_fields = Object.keys(takesArr[0]);
    }
    // euristica di stop: se la pagina è interamente più vecchia del mese (lista
    // presumibilmente in ordine desc), le successive lo saranno ancora di più.
    if (allOlder && oldestSeen && oldestSeen < monthStart) stop = true;
  }

  // Le TRANSAZIONI SINGOLE più grosse rimaste libere: gli aggregati per
  // tipo/giorno sono SOMME e non vanno mai raccontati come movimenti singoli.
  const topFree = [...agg.free_all].sort((a, b) => b.amount - a.amount).slice(0, 10);

  return Response.json({
    period_id: periodId, creator_id: creatorId, alias: alias || null,
    filter_creator: mode, filter_periodo: dateMode || "nessuno (client-side)",
    pages_scanned: pages, rows_scanned: scanned,
    date_range_seen: { oldest: oldestSeen, newest: newestSeen },
    summary: {
      transazioni: agg.n_total,
      prese: agg.n_taken,
      libere: agg.n_free,
      importo_totale: r2(agg.amount_total),
      importo_preso: r2(agg.amount_taken),
      importo_libero: r2(agg.amount_free),
      pct_libero: agg.amount_total > 0 ? r2(agg.amount_free / agg.amount_total * 100) : null,
    },
    libere_per_tipo_SOMME: agg.by_type_free,
    libere_per_giorno_SOMME: agg.by_day_free,
    top_transazioni_libere_singole: topFree,
    take_fields: agg.sample_take_fields,
  });
}
