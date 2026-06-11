/**
 * P&L live per creator (operativo, lato chat).
 *
 * GET /api/admin/pnl-live?period_id=YYYY-MM
 *   Per ogni creator del mese (da KV wages):
 *   - venduto (somma takes), costo operatori attribuito
 *   - fee% deal (config persistita in KV `pnl:deal_fees`, editabile da UI)
 *   - fee $ = venduto × fee% · margine = fee $ − costo operatori · margin %
 *   Funziona anche sul MESE CORRENTE (= live): basta che il sync sia girato.
 *   Include last_sync da cp:_meta per sapere quanto è fresco il dato.
 *
 * PUT body { alias, fee_pct }  (fee_pct 0..1 oppure null per rimuovere)
 *   Aggiorna la config fee. Audit-logged.
 *
 * CAVEAT (esposto anche in UI): è il P&L OPERATIVO della chat — include
 * solo il costo operatori. Marketing, AM, struttura ecc. restano nel
 * foglio Finance. Valuta: $ (CP), non € (Finance).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";

export const maxDuration = 30;
const FEES_KEY = "pnl:deal_fees";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const [wages, fees, meta] = await Promise.all([
    kv.get(`cp:wages:${periodId}`),
    kv.get(FEES_KEY),
    kv.get("cp:_meta"),
  ]);
  if (!Array.isArray(wages) || wages.length === 0) {
    return Response.json({
      error: `Nessuna wage in KV per ${periodId}. Sincronizza il mese (anche quello corrente: il P&L live si aggiorna a ogni sync).`,
    }, { status: 404 });
  }
  const feeMap = fees && typeof fees === "object" ? fees : {};

  // Aggregazione per alias: venduto (takes esatti) + costo operatori attribuito
  const byAlias = new Map();
  for (const w of wages) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const earnings = Number(s.total_earnings) || 0;
      const isMono = aliases.length <= 1;
      const salesByAlias = new Map();
      for (const t of takes) {
        if (!t.creator_alias) continue;
        salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      if (salesByAlias.size === 0 && isMono && aliases[0]) salesByAlias.set(aliases[0], salesTotal);
      for (const [alias, aliasSales] of salesByAlias.entries()) {
        if (!byAlias.has(alias)) byAlias.set(alias, { sales: 0, cost: 0, shifts: 0 });
        const agg = byAlias.get(alias);
        const share = salesTotal > 0 ? aliasSales / salesTotal : (isMono ? 1 : 0);
        agg.sales += aliasSales;
        agg.cost += earnings * share;
        agg.shifts += 1;
      }
    }
  }

  const rows = [...byAlias.entries()]
    .filter(([, a]) => a.sales > 0)
    .map(([alias, a]) => {
      const fee_pct = typeof feeMap[alias] === "number" ? feeMap[alias] : null;
      const fee_usd = fee_pct != null ? a.sales * fee_pct : null;
      const margin = fee_usd != null ? fee_usd - a.cost : null;
      return {
        alias,
        sales: Math.round(a.sales),
        cost_ops: Math.round(a.cost),
        cost_pct: a.sales > 0 ? Math.round((a.cost / a.sales) * 1000) / 1000 : null,
        fee_pct,
        fee_usd: fee_usd != null ? Math.round(fee_usd) : null,
        margin: margin != null ? Math.round(margin) : null,
        margin_pct: margin != null && a.sales > 0 ? Math.round((margin / a.sales) * 1000) / 1000 : null,
        shifts: a.shifts,
      };
    })
    .sort((x, y) => y.sales - x.sales);

  const withFee = rows.filter((r) => r.fee_pct != null);
  return Response.json({
    period_id: periodId,
    last_sync_at: meta?.last_sync_at ?? null,
    last_sync_period: meta?.last_sync_period ?? null,
    rows,
    totals: {
      sales: rows.reduce((s, r) => s + r.sales, 0),
      cost_ops: rows.reduce((s, r) => s + r.cost_ops, 0),
      fee_usd: withFee.reduce((s, r) => s + (r.fee_usd || 0), 0),
      margin: withFee.reduce((s, r) => s + (r.margin || 0), 0),
      fee_coverage: `${withFee.length}/${rows.length}`,
    },
  });
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const alias = (body?.alias || "").trim();
  let fee = body?.fee_pct;
  if (!alias) return Response.json({ error: "alias richiesto" }, { status: 400 });
  if (fee !== null && (typeof fee !== "number" || fee < 0 || fee > 1)) {
    return Response.json({ error: "fee_pct deve essere 0..1 oppure null" }, { status: 400 });
  }

  const fees = (await kv.get(FEES_KEY)) || {};
  const prev = fees[alias] ?? null;
  if (fee === null) delete fees[alias];
  else fees[alias] = fee;
  await kv.set(FEES_KEY, fees);
  await logAuditAction({
    action: "pnl.deal_fee.set",
    target: alias,
    by: az.userId,
    meta: { prev, next: fee },
  });
  return Response.json({ ok: true, alias, fee_pct: fee });
}
