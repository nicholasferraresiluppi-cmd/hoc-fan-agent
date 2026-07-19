/**
 * GET /api/admin/payout-tree?period_id=YYYY-MM[&operator=NOME]
 *
 * Albero payout (trasparenza comp v2): per un operatore, ogni turno del mese
 * con i take CP abbinati alle transazioni fan-level Infloww del ledger
 * (payout-ledger) + stato refund. Senza ?operator → elenco operatori del mese
 * con venduto, per scegliere chi drillare.
 *
 * L'abbinamento è DIREZIONALE (finestra turno + quadratura importi, mai
 * autoritativo: l'API non espone l'operatore sulla transazione) — la UI
 * dichiara la confidenza per ogni riga. Dati denaro di tutti gli operatori →
 * authorizeAll(SCORES_VIEW), stessa classe delle route leaderboard denaro.
 */
import { kv } from "@vercel/kv";
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { buildAliasIndex } from "@/lib/creator-match";
import { getLedgerMeta, getLedgerPeriods, getLedgerActivity, readLedgerTxns, readRefunds } from "@/lib/payout-ledger";
import { matchOperatorPeriod } from "@/lib/payout-match";

export const maxDuration = 30;

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  const operator = (url.searchParams.get("operator") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const [wages, ledgerMeta] = await Promise.all([
    kv.get(`cp:wages:${periodId}`),
    getLedgerMeta(periodId),
  ]);
  if (!Array.isArray(wages) || wages.length === 0) {
    return Response.json({ period_id: periodId, needs_sync: "cp" });
  }
  if (!ledgerMeta) {
    return Response.json({ period_id: periodId, needs_sync: "ledger" });
  }

  // ── Modalità elenco: operatori del mese ─────────────────────────────────
  if (!operator) {
    const byOp = new Map();
    for (const w of wages) {
      const name = w.member_name || "?";
      if (!byOp.has(name)) byOp.set(name, { operator: name, shifts: 0, takes: 0, takes_gross: 0, aliases: new Set() });
      const o = byOp.get(name);
      for (const s of w.shifts || []) {
        o.shifts++;
        for (const t of s.takes || []) {
          o.takes++;
          o.takes_gross += Number(t.amount) || 0;
          if (t.creator_alias) o.aliases.add(t.creator_alias);
        }
      }
    }
    const operators = [...byOp.values()]
      .map((o) => ({ ...o, takes_gross: Math.round(o.takes_gross * 100) / 100, aliases: o.aliases.size }))
      .sort((a, b) => b.takes_gross - a.takes_gross);
    return Response.json({ period_id: periodId, ledger: ledgerMeta, operators });
  }

  // ── Modalità albero: un operatore ───────────────────────────────────────
  const q = norm(operator);
  const wageRecords = wages.filter((w) => norm(w.member_name) === q);
  if (wageRecords.length === 0) {
    return Response.json({ error: `Nessuna wage per "${operator}" in ${periodId}` }, { status: 404 });
  }

  // Alias dell'operatore drillato (per scegliere quali ledger caricare)…
  const opAliases = new Set();
  for (const w of wageRecords) {
    for (const s of w.shifts || []) {
      for (const t of s.takes || []) if (t.creator_alias) opAliases.add(t.creator_alias);
      for (const a of s.creator_aliases || []) opAliases.add(a);
    }
  }
  // …ma l'indice si costruisce sul pool dell'INTERO mese (come reconcile):
  // con un pool parziale gli override globali non "bruciano" la creator e il
  // greedy può riassegnarla a un alias sbagliato dell'operatore.
  const monthAliases = new Set();
  for (const w of wages) {
    for (const s of w.shifts || []) {
      for (const t of s.takes || []) if (t.creator_alias) monthAliases.add(t.creator_alias);
      for (const a of s.creator_aliases || []) monthAliases.add(a);
    }
  }

  const [roster, overrides, ledgerPeriods] = await Promise.all([
    kv.get("infloww:creators"),
    kv.get("infloww:reconcile:overrides"),
    getLedgerPeriods(),
  ]);
  const rosterArr = roster || [];
  const { activeIds, grossById } = await getLedgerActivity(periodId, rosterArr.map((c) => c.id));
  const { byAlias, unmatched } = buildAliasIndex({
    aliases: [...monthAliases],
    inflowwCreators: rosterArr,
    overrides: overrides || {},
    activeIds,
    grossById,
  });

  const creatorIds = [...new Set([...opAliases].map((a) => byAlias.get(a)?.id).filter(Boolean))];
  const txnsByCreatorId = await readLedgerTxns(periodId, creatorIds);
  // Refund: possono arrivare mesi dopo la vendita → si cercano su TUTTI i
  // periodi sincronizzati dal periodo richiesto in poi.
  const refundPeriods = ledgerPeriods.filter((p) => p >= periodId);
  const refunds = await readRefunds(refundPeriods, creatorIds);
  const refundsByTid = new Map(refunds.filter((r) => r.tid).map((r) => [r.tid, r]));

  const tree = matchOperatorPeriod({ wageRecords, aliasIndex: byAlias, txnsByCreatorId, refundsByTid });

  return Response.json({
    period_id: periodId,
    operator: wageRecords[0].member_name,
    ledger: ledgerMeta,
    refund_periods_scanned: refundPeriods,
    alias_links: [...byAlias.entries()].filter(([alias]) => opAliases.has(alias)).map(([alias, l]) => ({ alias, infloww_name: l.name, via: l.via })),
    alias_unmatched: unmatched.filter((a) => opAliases.has(a)),
    ...tree,
  });
}
