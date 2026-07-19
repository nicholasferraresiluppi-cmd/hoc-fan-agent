/**
 * GET /api/admin/refund-impact?period_id=YYYY-MM
 *
 * Refund impact report (trasparenza comp v2): tutti i chargeback/refund
 * REGISTRATI nel mese (vista cassa) e, per ognuno, se la vendita originale
 * era stata attribuita a un operatore in CP → stima della comp pagata su
 * denaro poi restituito ai fan. È il numero che il comp v1 non vede: il KV
 * wages viene sovrascritto a ogni sync e nessuno sottrae i reverse.
 *
 * Attribuzione: la vendita originale si cerca nelle wage CP del MESE DEL
 * PAGAMENTO (paymentTime del refund), per finestra turno + importo esatto —
 * stessa logica del match engine, stessa natura direzionale. La stima comp
 * usa l'effective_pct del turno (media scaglioni), marcata come ~STIMA.
 */
import { kv } from "@vercel/kv";
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { buildAliasIndex } from "@/lib/creator-match";
import { getLedgerMeta, getLedgerPeriods, getLedgerActivity, readRefunds, romePeriod, periodBounds } from "@/lib/payout-ledger";
import { calcCumulativeEarning } from "@/lib/wage-calc";

export const maxDuration = 60;

const SLACK_MS = 5 * 60000;
const r2 = (x) => Math.round(x * 100) / 100;
const toCents = (usd) => Math.round((Number(usd) || 0) * 100);
const shiftPeriod = (pp, delta) => {
  const [y, m] = pp.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** effective_pct del turno: scaglioni cumulativi se presenti, altrimenti rapporto reale. */
function shiftEffPct(shift) {
  const salesTotal = Number(shift.total_attributed) || (shift.takes || []).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const ths = Array.isArray(shift.thresholds) ? shift.thresholds.filter((t) => t.percentage != null) : [];
  if (ths.length > 0 && salesTotal > 0) {
    const { effective_pct } = calcCumulativeEarning(salesTotal, ths);
    if (effective_pct != null) return effective_pct;
  }
  // Fallback senza thresholds: total_earnings include la QUOTA ORARIA →
  // scorporala, altrimenti la % effettiva (e quindi il leak) è gonfiata.
  const earnings = Number(shift.total_earnings) || 0;
  const hourly = (Number(shift.payment_profile?.hourly_rate) || 0) * (Number(shift.worked_hours) || 0);
  const commission = Math.max(0, earnings - hourly);
  return salesTotal > 0 ? commission / salesTotal : null;
}

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const [ledgerMeta, roster, overrides] = await Promise.all([
    getLedgerMeta(periodId),
    kv.get("infloww:creators"),
    kv.get("infloww:reconcile:overrides"),
  ]);
  if (!ledgerMeta) return Response.json({ period_id: periodId, needs_sync: "ledger" });

  const rosterArr = roster || [];
  const creatorName = new Map(rosterArr.map((c) => [c.id, c.name]));
  const refunds = await readRefunds([periodId], rosterArr.map((c) => c.id));

  // Refund raggruppati per MESE DEL PAGAMENTO: l'attribuzione all'operatore
  // vive nelle wage CP di quel mese, non del mese del refund.
  const byPayPeriod = new Map();
  for (const r of refunds) {
    const pp = r.pt ? romePeriod(r.pt) : periodId;
    if (!byPayPeriod.has(pp)) byPayPeriod.set(pp, []);
    byPayPeriod.get(pp).push(r);
  }

  const rows = [];
  const wagesMissing = [];
  const ledgerPeriods = await getLedgerPeriods();
  for (const [payPeriod, list] of [...byPayPeriod.entries()].sort()) {
    const wages = await kv.get(`cp:wages:${payPeriod}`);
    if (!Array.isArray(wages) || wages.length === 0) {
      wagesMissing.push(payPeriod);
      for (const r of list) {
        rows.push({
          creator_id: r.creator_id, creator_name: creatorName.get(r.creator_id) || "?",
          fan_id: r.fid, amount_usd: r2(r.amt / 100), transaction_type: r.tt,
          paid_at: r.pt, refunded_at: r.rt, payment_period: payPeriod,
          status: "wages_missing",
        });
      }
      continue;
    }
    // Determinismo del consumo: refund in ordine di pagamento.
    list.sort((a, b) => (a.pt || 0) - (b.pt || 0));

    // Turni a cavallo del confine mese: il turno che contiene il pagamento può
    // vivere nel wage CP del mese adiacente (turni notturni + skew UTC/Rome
    // dei confini) → se un refund cade entro 12h dal confine, scansiona anche
    // le wage adiacenti. Nessun falso positivo: il test finestra+importo
    // seleziona comunque solo turni che contengono il pagamento.
    let scanWages = wages;
    try {
      const { startIso, endIso } = periodBounds(payPeriod);
      const pStart = Date.parse(startIso), pEnd = Date.parse(endIso);
      const H12 = 12 * 3600000;
      const needPrev = list.some((r) => r.pt && r.pt - pStart < H12);
      const needNext = list.some((r) => r.pt && pEnd - r.pt < H12);
      if (needPrev) {
        const wPrev = await kv.get(`cp:wages:${shiftPeriod(payPeriod, -1)}`);
        if (Array.isArray(wPrev)) scanWages = [...wPrev, ...scanWages];
      }
      if (needNext) {
        const wNext = await kv.get(`cp:wages:${shiftPeriod(payPeriod, 1)}`);
        if (Array.isArray(wNext)) scanWages = [...scanWages, ...wNext];
      }
    } catch { /* confini non calcolabili: si scansiona solo il mese */ }

    // Un take già attribuito a un refund non può coprirne un altro: pool di
    // consumo condiviso tra i refund del payPeriod (speculare a payout-match).
    const consumedTakes = new Set();

    // Indice alias del mese di pagamento → creatorId, poi invertito. Il greedy
    // matcha solo le creator ATTIVE nel periodo (parità con reconcile), quando
    // il ledger del payPeriod esiste.
    const aliases = new Set();
    for (const w of scanWages) for (const s of w.shifts || []) {
      for (const t of s.takes || []) if (t.creator_alias) aliases.add(t.creator_alias);
      for (const a of s.creator_aliases || []) aliases.add(a);
    }
    const act = ledgerPeriods.includes(payPeriod)
      ? await getLedgerActivity(payPeriod, rosterArr.map((c) => c.id))
      : { activeIds: null, grossById: {} };
    const { byAlias } = buildAliasIndex({
      aliases: [...aliases], inflowwCreators: rosterArr, overrides: overrides || {},
      activeIds: act.activeIds, grossById: act.grossById,
    });
    const aliasesByCreator = new Map();
    for (const [alias, l] of byAlias.entries()) {
      if (!aliasesByCreator.has(l.id)) aliasesByCreator.set(l.id, new Set());
      aliasesByCreator.get(l.id).add(alias);
    }

    for (const r of list) {
      const creatorAliases = aliasesByCreator.get(r.creator_id);
      const base = {
        creator_id: r.creator_id, creator_name: creatorName.get(r.creator_id) || "?",
        fan_id: r.fid, amount_usd: r2(r.amt / 100), transaction_type: r.tt,
        paid_at: r.pt, refunded_at: r.rt, payment_period: payPeriod,
      };
      if (!creatorAliases || creatorAliases.size === 0) {
        rows.push({ ...base, status: "unattributed", reason: "creator_not_in_cp" });
        continue;
      }
      // Cerca i take pagati su questa vendita: turno la cui finestra contiene
      // il pagamento + importo pieno OPPURE quota 1/k (turni a k coseller: CP
      // splitta la vendita, ogni coseller ha un take da gross/k — vedi
      // payout-match.js). Sul refund la comp persa è la SOMMA delle quote.
      const full = [], shares = [];
      for (const w of scanWages) {
        for (const s of w.shifts || []) {
          const startMs = Date.parse(s.started_at) - SLACK_MS;
          const endRaw = Date.parse(s.ended_at);
          const endMs = (Number.isFinite(endRaw) ? endRaw : Date.now()) + SLACK_MS;
          if (!(r.pt >= startMs && r.pt <= endMs)) continue;
          const k = Number(s.payment_profile?.cosellers_count) || 1;
          for (const t of s.takes || []) {
            if (consumedTakes.has(t)) continue;
            if (!creatorAliases.has(t.creator_alias)) continue;
            const c = toCents(t.amount);
            if (c === r.amt) full.push({ operator: w.member_name || "?", shift: s, take: t });
            else if (k > 1 && Math.abs(c * k - r.amt) <= k - 1) shares.push({ operator: w.member_name || "?", shift: s, take: t });
          }
        }
      }
      // Una transazione a k coseller genera ESATTAMENTE k take (uno per
      // coseller, ognuno gross/k): dedupe per operatore e cap a k, altrimenti
      // i take gemelli dello stesso importo (comuni: $5, $10) gonfiano la
      // stima (osservato lug 2026: leak al 27% del rimborsato vs 10-15% degli
      // scaglioni prima di questo cap). Pattern di split diversi (k=2 vs k=3)
      // non possono coesistere sulla stessa transazione: si sceglie il gruppo
      // più corroborato (quota di coseller trovati sul k atteso).
      let candidates;
      if (shares.length > 0) {
        const byK = new Map();
        for (const c of shares) {
          const ck = Number(c.shift?.payment_profile?.cosellers_count) || 1;
          if (!byK.has(ck)) byK.set(ck, []);
          byK.get(ck).push(c);
        }
        let best = null, bestScore = -1;
        for (const [ck, group] of byK.entries()) {
          const seenOp = new Set(), dedup = [];
          for (const c of group) {
            if (seenOp.has(c.operator)) continue;
            seenOp.add(c.operator);
            dedup.push(c);
          }
          const capped = dedup.slice(0, Math.max(1, ck));
          const score = capped.length / ck + capped.length / 100;
          if (score > bestScore) { bestScore = score; best = capped; }
        }
        candidates = best || [];
      } else {
        candidates = full.slice(0, 1);
      }
      if (candidates.length === 0) {
        rows.push({ ...base, status: "unattributed", reason: "no_take_match" });
        continue;
      }
      for (const c of candidates) consumedTakes.add(c.take);
      // Quote coseller: ogni candidato è stato pagato sulla propria frazione →
      // leak = Σ take × eff del suo turno. Importo pieno: un solo venditore
      // reale → se i candidati sono più d'uno è ambiguo (si stima sul primo).
      let leak = 0, effShown = null;
      const opLeaks = [];
      if (shares.length > 0) {
        for (const c of candidates) {
          const eff = shiftEffPct(c.shift);
          const li = eff != null ? (Number(c.take.amount) || 0) * eff : 0;
          leak += li;
          opLeaks.push({ operator: c.operator, refunded_share_usd: r2(Number(c.take.amount) || 0), leak_usd: r2(li) });
        }
        effShown = null;
      } else {
        const eff = shiftEffPct(candidates[0].shift);
        effShown = eff;
        if (eff != null) leak = (r.amt / 100) * eff;
        opLeaks.push({ operator: candidates[0].operator, refunded_share_usd: r2(r.amt / 100), leak_usd: r2(leak) });
      }
      const operators = [...new Set(candidates.map((c) => c.operator))];
      // Ambiguo = esistono OPERATORI DIVERSI, non attribuiti, che avrebbero
      // potuto coprire il refund (full o quota): i take gemelli dello STESSO
      // operatore non contano (è ambiguo solo QUALE take, non il leak).
      const extraOps = [...new Set([...shares, ...full].map((c) => c.operator))].filter((o) => !operators.includes(o));
      const ambiguous = extraOps.length > 0;
      rows.push({
        ...base,
        status: "attributed",
        operator: operators[0],
        operators_all: operators.length > 1 ? operators : undefined,
        ambiguous_with: ambiguous ? extraOps : undefined,
        shared_between: shares.length > 0 && operators.length > 1 ? operators.length : undefined,
        shift_id: candidates[0].shift.id,
        shift_started_at: candidates[0].shift.started_at,
        eff_pct: effShown != null ? Math.round(effShown * 10000) / 10000 : null,
        comp_leak_usd: r2(leak),
        op_leaks: opLeaks,
      });
    }
  }

  rows.sort((a, b) => (b.rt || 0) - (a.rt || 0));

  const attributed = rows.filter((r) => r.status === "attributed");
  // Per-operatore: dalle quote (op_leaks), non dalla riga — nei turni coseller
  // il rimborso è splittato tra più operatori.
  const byOperator = new Map();
  for (const r of attributed) {
    for (const ol of r.op_leaks || []) {
      if (!byOperator.has(ol.operator)) byOperator.set(ol.operator, { operator: ol.operator, count: 0, refunded_usd: 0, comp_leak_usd: 0 });
      const o = byOperator.get(ol.operator);
      o.count++; o.refunded_usd += ol.refunded_share_usd || 0; o.comp_leak_usd += ol.leak_usd || 0;
    }
  }
  const byCreator = new Map();
  for (const r of rows) {
    if (!byCreator.has(r.creator_id)) byCreator.set(r.creator_id, { creator_id: r.creator_id, creator_name: r.creator_name, count: 0, refunded_usd: 0, attributed: 0 });
    const c = byCreator.get(r.creator_id);
    c.count++; c.refunded_usd += r.amount_usd;
    if (r.status === "attributed") c.attributed++;
  }

  return Response.json({
    period_id: periodId,
    ledger: ledgerMeta,
    totals: {
      refunds: rows.length,
      refunded_usd: r2(rows.reduce((a, r) => a + r.amount_usd, 0)),
      attributed: attributed.length,
      attributed_usd: r2(attributed.reduce((a, r) => a + r.amount_usd, 0)),
      comp_leak_usd: r2(attributed.reduce((a, r) => a + (r.comp_leak_usd || 0), 0)),
      ambiguous: attributed.filter((r) => r.ambiguous_with).length,
      unattributed: rows.filter((r) => r.status === "unattributed").length,
      wages_missing: rows.filter((r) => r.status === "wages_missing").length,
    },
    wages_missing_periods: wagesMissing,
    by_operator: [...byOperator.values()].map((o) => ({ ...o, refunded_usd: r2(o.refunded_usd), comp_leak_usd: r2(o.comp_leak_usd) })).sort((a, b) => b.comp_leak_usd - a.comp_leak_usd),
    by_creator: [...byCreator.values()].map((c) => ({ ...c, refunded_usd: r2(c.refunded_usd) })).sort((a, b) => b.refunded_usd - a.refunded_usd),
    rows,
  });
}
