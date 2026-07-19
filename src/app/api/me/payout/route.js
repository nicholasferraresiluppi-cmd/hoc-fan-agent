/**
 * GET /api/me/payout?period_id=YYYY-MM
 *
 * "Il mio compenso, spiegato" — scope own (docs/VISIBILITY_POLICY.md).
 * Breakdown per turno: venduto → scaglioni applicati (a cascata) → importo.
 * Il pagato (`total_earnings`) arriva già calcolato da CP; il breakdown per
 * fascia è ricostruito con la stessa formula validata in comp-exam
 * (src/lib/wage-calc.js) — serve a SPIEGARE il numero, non a sostituirlo.
 *
 * Identità risolta server-side; nessun parametro employee dal client.
 */
import { kv } from "@vercel/kv";
import { resolveEmployeeForUser, findLatestWagePeriod, findOwnRecord } from "@/lib/me";
import { calcCumulativeEarning } from "@/lib/wage-calc";

export async function GET(request) {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!who.employee) {
    return Response.json({ linked: false, reason: who.reason || "no_match" });
  }

  const { searchParams } = new URL(request.url);
  let periodId = searchParams.get("period_id");
  if (!periodId) periodId = await findLatestWagePeriod();
  if (!periodId) {
    return Response.json({ linked: true, employee: who.employee, period_id: null, reason: "no_periods" });
  }

  let wages = [];
  try {
    wages = (await kv.get(`cp:wages:${periodId}`)) || [];
  } catch {}
  const mine = findOwnRecord(wages, who.employee, "member_name");
  if (!mine) {
    return Response.json({ linked: true, employee: who.employee, period_id: periodId, reason: "not_in_period" });
  }

  const shifts = (mine.shifts || [])
    .map((s) => {
      const sold = Number(s.total_attributed) || 0;
      const calc = calcCumulativeEarning(sold, s.thresholds || []);
      return {
        started_at: s.started_at || null,
        ended_at: s.ended_at || null,
        worked_hours: s.worked_hours ?? null,
        creators: s.creator_aliases || [],
        sold,
        earned: Number(s.total_earnings) || 0,
        effective_pct: calc.effective_pct,
        profile: s.payment_profile ? { name: s.payment_profile.name, cosellers: s.payment_profile.cosellers_count ?? null } : null,
        thresholds: (s.thresholds || []).map((t) => ({ from: t.threshold ?? 0, pct: t.percentage ?? 0 })),
        breakdown: calc.breakdown,
      };
    })
    .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));

  return Response.json({
    linked: true,
    employee: who.employee,
    period_id: periodId,
    totals: {
      wage: Number(mine.total_wage) || 0,
      from_takes: Number(mine.total_earnings_from_takes) || 0,
      from_hours: Number(mine.total_earnings_from_hours) || 0,
      shifts: mine.total_worked_shifts ?? shifts.length,
      hours: mine.total_worked_hours ?? null,
    },
    shifts,
  });
}
