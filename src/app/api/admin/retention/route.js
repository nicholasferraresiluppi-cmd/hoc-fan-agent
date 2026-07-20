/**
 * GET /api/admin/retention[?creator=CREATOR_ID]
 *
 * Lente di RETENTION per creator sul payout ledger (Livello 1 "CRM fan").
 * NON è un CRM fan operativo: analitica aggregata di management, fan
 * pseudonimizzati, nessuna azione sul fan (l'azione vive in Infloww/OF).
 * Dati denaro di tutti i creator → authorizeAll(SCORES_VIEW), stessa classe
 * di /admin/payout-tree. Vedi `src/lib/retention-calc.js` per il razionale.
 *
 * Modalità elenco (no ?creator): trend di fatturato per creator dai meta del
 * ledger (getLedgerActivity, letture leggere — niente chunk transazioni).
 * Modalità drill (?creator=ID): legge le transazioni + refund del creator su
 * tutti i periodi sincronizzati e calcola concentrazione/coorti/LTV/dormienti.
 */
import { kv } from "@vercel/kv";
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getLedgerPeriods, getLedgerActivity, getLedgerMeta, readLedgerTxns, readRefunds } from "@/lib/payout-ledger";
import { computeCreatorRetention } from "@/lib/retention-calc";

export const maxDuration = 30;

const c2d = (cents) => Math.round((cents || 0) / 100);

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const creatorId = (url.searchParams.get("creator") || "").trim();

  const [roster, periods] = await Promise.all([kv.get("infloww:creators"), getLedgerPeriods()]);
  const rosterArr = Array.isArray(roster) ? roster : [];
  if (periods.length === 0) {
    return Response.json({ periods: [], creators: [], needs_sync: "ledger" });
  }

  // ── Modalità drill: un creator ──────────────────────────────────────────
  if (creatorId) {
    const c = rosterArr.find((x) => String(x.id) === creatorId);
    const perPeriod = await Promise.all(periods.map((p) => readLedgerTxns(p, [creatorId])));
    const txns = [];
    for (const map of perPeriod) {
      const entry = map.get(creatorId);
      if (entry && Array.isArray(entry.txns)) txns.push(...entry.txns);
    }
    const refunds = await readRefunds(periods, [creatorId]);
    const retention = computeCreatorRetention(txns, refunds);

    return Response.json({
      creator: { id: creatorId, name: c?.name || creatorId, userName: c?.userName || "" },
      periods,
      ...retention,
    });
  }

  // ── Modalità elenco: trend per creator (letture leggere dai meta) ────────
  const ids = rosterArr.map((c) => String(c.id)).filter(Boolean);
  const activities = await Promise.all(periods.map((p) => getLedgerActivity(p, ids)));
  const nameById = new Map(rosterArr.map((c) => [String(c.id), { name: c.name || String(c.id), userName: c.userName || "" }]));

  const acc = new Map(); // id → { by_period:[], total_c }
  ids.forEach((id) => acc.set(id, { by_period: periods.map(() => 0), total_c: 0 }));
  activities.forEach((act, pIdx) => {
    for (const [id, gross_c] of Object.entries(act.grossById || {})) {
      const a = acc.get(String(id));
      if (!a) continue;
      a.by_period[pIdx] = gross_c || 0;
      a.total_c += gross_c || 0;
    }
  });

  const creators = ids
    .map((id) => {
      const a = acc.get(id);
      const activeIdx = a.by_period.map((g, i) => (g > 0 ? i : -1)).filter((i) => i >= 0);
      return {
        id,
        name: nameById.get(id)?.name || id,
        userName: nameById.get(id)?.userName || "",
        by_period: a.by_period.map((g) => c2d(g)),
        total_usd: c2d(a.total_c),
        active_periods: activeIdx.length,
        last_period: activeIdx.length ? periods[activeIdx[activeIdx.length - 1]] : null,
      };
    })
    .filter((c) => c.total_usd > 0)
    .sort((a, b) => b.total_usd - a.total_usd);

  // Header: totale mese più recente (dal meta di periodo, già aggregato).
  const lastMeta = await getLedgerMeta(periods[periods.length - 1]);

  return Response.json({
    periods,
    creators,
    last_period: periods[periods.length - 1],
    last_period_gross_usd: lastMeta?.totals ? c2d(lastMeta.totals.gross_c) : null,
  });
}
