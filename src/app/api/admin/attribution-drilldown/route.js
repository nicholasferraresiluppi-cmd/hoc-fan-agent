/**
 * GET /api/admin/attribution-drilldown?period_id=YYYY-MM&alias=<cp alias>
 *                                      [&infloww_id=...][&format=csv]
 *
 * DRILL-DOWN dei takes mancanti per una creator: trasforma "ha un buco"
 * in una lista NOMINALE per il recupero (backfill) — turno per turno,
 * operatore per operatore, con confronto giornaliero contro l'incasso
 * reale Infloww (se infloww_id fornito).
 *
 * Per ogni turno che coinvolge l'alias:
 *   - attribuito a LEI (takes suoi), attribuito ad ALTRE, NON attribuito
 *     (venduto turno − somma takes: la fetta che nessuno ha registrato)
 *   - stato: "senza takes" se a lei risulta $0 su un turno che ha venduto
 * Aggregati per operatore (chi non registra) e per giorno (quando).
 *
 * format=csv → CSV formato italiano (; + BOM + decimali con virgola) da
 * girare al team lead per il backfill in CP.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 30;
const r2 = (x) => Math.round(x * 100) / 100;

const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const romeTimeFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
function romeDay(x) { const d = new Date(x); return Number.isNaN(d.getTime()) ? null : romeDayFmt.format(d); }
function romeTime(x) { const d = new Date(x); return Number.isNaN(d.getTime()) ? "" : romeTimeFmt.format(d); }

// CSV italiano: ; come separatore, decimali con virgola, BOM per Excel IT.
const itNum = (n) => (n == null ? "" : String(r2(n)).replace(".", ","));
const csvCell = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  const alias = (url.searchParams.get("alias") || "").trim();
  const inflowwId = url.searchParams.get("infloww_id") || null;
  const format = url.searchParams.get("format") || "json";
  if (!/^\d{4}-\d{2}$/.test(periodId)) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  if (!alias) return Response.json({ error: "alias richiesto" }, { status: 400 });

  const wages = await kv.get(`cp:wages:${periodId}`);
  if (!Array.isArray(wages) || wages.length === 0) {
    return Response.json({ error: `Nessuna busta in archivio per ${periodId}: sincronizza il mese da Sync & Audit CP.` }, { status: 404 });
  }

  // ── Turni che coinvolgono l'alias ───────────────────────────────────
  const shifts = [];
  for (const w of wages) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const involved = aliases.includes(alias) || takes.some((t) => t.creator_alias === alias);
      if (!involved) continue;

      const total = Number(s.total_attributed) || 0;
      let mine = 0, others = 0;
      for (const t of takes) {
        const amt = Number(t.amount) || 0;
        if (t.creator_alias === alias) mine += amt;
        else others += amt;
      }
      const unattributed = Math.max(0, total - mine - others);
      shifts.push({
        day: s.started_at ? romeDay(s.started_at) : null,
        start: s.started_at ? romeTime(s.started_at) : "",
        end: s.ended_at ? romeTime(s.ended_at) : "",
        started_at: s.started_at || null,
        operator: w.member_name || "?",
        team: aliases.filter((a) => a !== alias),
        total_shift: r2(total),
        mine: r2(mine),
        others: r2(others),
        unattributed: r2(unattributed),
        no_takes: mine === 0 && total > 0,
      });
    }
  }
  shifts.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  // ── Aggregati per operatore: chi non registra ────────────────────────
  const byOp = new Map();
  for (const s of shifts) {
    const o = byOp.get(s.operator) || { operator: s.operator, shifts: 0, shifts_no_takes: 0, mine: 0, unattributed: 0 };
    o.shifts++; if (s.no_takes) o.shifts_no_takes++;
    o.mine += s.mine; o.unattributed += s.unattributed;
    byOp.set(s.operator, o);
  }
  const operators = [...byOp.values()]
    .map((o) => ({ ...o, mine: r2(o.mine), unattributed: r2(o.unattributed) }))
    .sort((a, b) => b.shifts_no_takes - a.shifts_no_takes || b.unattributed - a.unattributed);

  // ── Confronto giornaliero con Infloww (se collegata) ────────────────
  const byDay = new Map();
  for (const s of shifts) {
    if (!s.day) continue;
    const d = byDay.get(s.day) || { day: s.day, cp_mine: 0, shifts: 0, shifts_no_takes: 0 };
    d.cp_mine += s.mine; d.shifts++; if (s.no_takes) d.shifts_no_takes++;
    byDay.set(s.day, d);
  }
  let inflowwDaily = null;
  if (inflowwId) {
    const rec = await kv.get(`infloww:daily:${inflowwId}`);
    if (rec?.days) {
      inflowwDaily = {};
      for (const [d, v] of Object.entries(rec.days)) {
        if (d.startsWith(periodId)) inflowwDaily[d] = r2(v.gross);
      }
      for (const [d, gross] of Object.entries(inflowwDaily)) {
        const cur = byDay.get(d) || { day: d, cp_mine: 0, shifts: 0, shifts_no_takes: 0 };
        cur.infloww_gross = gross;
        byDay.set(d, cur);
      }
    }
  }
  const days = [...byDay.values()]
    .map((d) => ({
      ...d,
      cp_mine: r2(d.cp_mine),
      gap: d.infloww_gross != null ? r2(Math.max(0, d.infloww_gross - d.cp_mine)) : null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const totals = {
    shifts: shifts.length,
    shifts_no_takes: shifts.filter((s) => s.no_takes).length,
    attributed_mine: r2(shifts.reduce((s, x) => s + x.mine, 0)),
    unattributed_pool: r2(shifts.reduce((s, x) => s + x.unattributed, 0)),
    infloww_gross: inflowwDaily ? r2(Object.values(inflowwDaily).reduce((s, v) => s + v, 0)) : null,
  };

  // ── CSV per il team lead ─────────────────────────────────────────────
  if (format === "csv") {
    const header = ["Data", "Ora inizio", "Ora fine", "Operatore", "Team (altre creator)", "Venduto turno $", `Attribuito a ${alias} $`, "Attribuito ad altre $", "Non attribuito $", "Stato"];
    const lines = [header.join(";")];
    for (const s of shifts) {
      lines.push([
        csvCell(s.day), csvCell(s.start), csvCell(s.end), csvCell(s.operator), csvCell(s.team.join(" + ")),
        itNum(s.total_shift), itNum(s.mine), itNum(s.others), itNum(s.unattributed),
        s.no_takes ? "SENZA TAKES" : "ok",
      ].join(";"));
    }
    const body = "\uFEFF" + lines.join("\r\n");
    const fname = `takes-mancanti-${alias.replace(/[^\w-]+/g, "_")}-${periodId}.csv`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  }

  return Response.json({ period_id: periodId, alias, infloww_id: inflowwId, totals, days, operators, shifts });
}
