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

  // Prova filtro server-side; verifica sull'esito. Param names ignoti → tentativi.
  const paramTrials = [
    { name: "creatorId", q: { creatorId } },
    { name: "creator", q: { creator: creatorId } },
    { name: "nessuno (filtro client-side)", q: {} },
  ];
  let mode = null, useQ = {};
  for (const trial of paramTrials) {
    const r = await probeGet(`/v1/take-credit/transactions`, { query: { ...trial.q, limit: 20, page: 1 } });
    if (!r.ok) continue;
    const rows = Array.isArray(r.sample?.data) ? r.sample.data : (Array.isArray(r.sample) ? r.sample : []);
    if (rows.length === 0) { mode = trial.name; useQ = trial.q; break; }
    const allMatch = rows.every((t) => String(t?.creator?.id ?? "") === String(creatorId));
    if (trial.q.creatorId || trial.q.creator) {
      if (allMatch) { mode = trial.name; useQ = trial.q; break; }
    } else { mode = trial.name; useQ = trial.q; break; }
  }
  if (mode == null) return Response.json({ error: "endpoint take-credit non risponde" }, { status: 502 });

  // Pagina e aggrega. Ordine sconosciuto → cap pagine + filtro data client-side.
  const agg = {
    n_total: 0, n_taken: 0, n_free: 0,
    amount_total: 0, amount_taken: 0, amount_free: 0,
    by_type_free: {}, by_day_free: {},
    sample_take_fields: null, sample_free: [],
  };
  let pages = 0, stop = false, scanned = 0, oldestSeen = null, newestSeen = null;
  const MAXP = 60;
  while (pages < MAXP && !stop) {
    const r = await probeGet(`/v1/take-credit/transactions`, { query: { ...useQ, limit: 100, page: pages + 1 } });
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
        if (agg.sample_free.length < 8) agg.sample_free.push({ day, amount: amt, type: t?.type || null, status: t?.status || null });
      }
      if (!agg.sample_take_fields && takesArr[0]) agg.sample_take_fields = Object.keys(takesArr[0]);
    }
    // euristica di stop: se la pagina è interamente più vecchia del mese (lista
    // presumibilmente in ordine desc), le successive lo saranno ancora di più.
    if (allOlder && oldestSeen && oldestSeen < monthStart) stop = true;
  }

  return Response.json({
    period_id: periodId, creator_id: creatorId, alias: alias || null,
    filter_mode: mode, pages_scanned: pages, rows_scanned: scanned,
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
    libere_per_tipo: agg.by_type_free,
    libere_per_giorno: agg.by_day_free,
    sample_libere: agg.sample_free,
    take_fields: agg.sample_take_fields,
  });
}
