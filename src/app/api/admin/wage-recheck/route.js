/**
 * POST /api/admin/wage-recheck
 *
 * Per un operatore specifico, chiama CP API LIVE per cercare wage records
 * nel periodo e, se trova, scarica i detail + appende a cp:wages:{period_id}.
 *
 * Usato dal pulsante "🔍 Recheck" accanto a ogni nome "no CP data" nella
 * tabella Sales CP. Soluzione caso-per-caso senza dover fare full re-sync.
 *
 * Body: { period_id, employee } o { period_id, cp_member_id }
 * Response: {
 *   ok, employee, cp_member_id,
 *   live_wages_count, fetched_details, added_to_kv,
 *   total_shifts_added, was_already_present
 * }
 *
 * Capability: SEED (admin-only).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { fetchWages, fetchWageDetailBatch, bucketizeIntervalFromHour } from "@/lib/creatorspro-api";

const TTL_WAGES = 90 * 24 * 3600;

function monthBoundsIso(periodId) {
  const m = periodId.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`period_id invalido (atteso YYYY-MM): ${periodId}`);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return {
    startedAt: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString(),
    endedAt: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString(),
  };
}

// Normalizza un wage detail allo schema cp:wages: (allineato a creatorspro-sync.js)
function normalizeWage(wage) {
  const info = wage?.info || {};
  const shifts = Array.isArray(wage?.shifts) ? wage.shifts : [];
  const normalizedShifts = shifts.map((s) => {
    const rawTakes = Array.isArray(s.takes) ? s.takes : [];
    const takes = rawTakes.map((t) => ({
      amount: typeof t.amount === "number" ? t.amount : (Number(t.amount) || 0),
      type: t.type || null,
      creator_alias: t.creator?.alias || t.creatorAlias || null,
      creator_id: t.creator?.id || t.creatorId || null,
      status: t.status || null,
    })).filter((t) => t.creator_alias && t.amount > 0);
    return {
      id: s.id,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      worked_hours: s.workedHours || 0,
      total_attributed: s.totalAttributed || 0,
      total_earnings: s.totalEarnings || 0,
      interval_bucket: bucketizeIntervalFromHour(s.startedAt),
      creator_ids: (s.associatedCreators || []).map((c) => c.id).filter(Boolean),
      creator_aliases: (s.associatedCreators || []).map((c) => c.alias).filter(Boolean),
      takes_count: rawTakes.length,
      takes,
    };
  });
  return {
    id: info.id,
    member_id: info.memberId,
    member_name: info.memberName,
    member_username: info.memberUsername,
    status: info.status,
    started_at: info.startedAt,
    ended_at: info.endedAt,
    total_worked_shifts: info.totalWorkedShifts || 0,
    total_worked_hours: info.totalWorkedHours || 0,
    total_attributed_from_takes: info.totalAttributedFromTakes || 0,
    total_earnings_from_takes: info.totalEarningsFromTakes || 0,
    total_earnings_from_hours: info.totalEarningsFromHours || 0,
    total_wage: info.totalWage || 0,
    shifts: normalizedShifts,
  };
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { period_id, employee, cp_member_id: cpIdInput } = body || {};
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  }
  if (!employee && !cpIdInput) {
    return Response.json({ error: "employee o cp_member_id required" }, { status: 400 });
  }

  // Step 1: risolvi cp_member_id
  let cpMemberId = cpIdInput;
  let resolvedEmployee = employee;
  if (!cpMemberId) {
    const mapping = (await kv.get("cp:member_mapping")) || {};
    // Reverse lookup: trova cp_member_id mappato esattamente all'employee name
    for (const [cpId, inflowwName] of Object.entries(mapping)) {
      if (inflowwName === employee) { cpMemberId = cpId; break; }
    }
    if (!cpMemberId) {
      return Response.json({
        ok: false,
        error: `Nessun cp_member_id mappato all'employee "${employee}". Vai a /admin/creatorspro-sync per mappare.`,
      }, { status: 404 });
    }
  }
  if (!resolvedEmployee) {
    const mapping = (await kv.get("cp:member_mapping")) || {};
    resolvedEmployee = mapping[cpMemberId] || cpMemberId;
  }

  // Step 2: chiama CP API live per quel member_id nel periodo
  const { startedAt, endedAt } = monthBoundsIso(period_id);
  let liveWages = [];
  try {
    // Itera tutte le pagine se il member ha più di 25 wages (raro ma possibile)
    let page = 1;
    let pageCount = 1;
    do {
      const r = await fetchWages({ startedAt, endedAt, memberId: cpMemberId, page, limit: 25 });
      liveWages.push(...(r?.data || []));
      pageCount = r?.pagination?.pageCount || 1;
      page++;
    } while (page <= pageCount);
  } catch (e) {
    return Response.json({
      ok: false,
      error: `Errore chiamando CP API per ${cpMemberId}: ${e?.message || e}`,
      cp_member_id: cpMemberId,
    }, { status: 502 });
  }

  if (liveWages.length === 0) {
    return Response.json({
      ok: true,
      cp_member_id: cpMemberId,
      employee: resolvedEmployee,
      live_wages_count: 0,
      added_to_kv: 0,
      message: `CP API non ritorna alcuna wage per ${resolvedEmployee} (${cpMemberId}) nel periodo ${period_id}. L'operatore probabilmente non ha lavorato in CP quel mese.`,
    });
  }

  // Step 3: fetch detail di ogni wage trovata
  const wageIds = liveWages.map((w) => w?.info?.id).filter(Boolean);
  const details = await fetchWageDetailBatch(wageIds);
  const normalized = details
    .filter((w) => !w?._error && w?.info?.id)
    .map(normalizeWage);
  const failedDetails = details.filter((d) => d?._error).length;

  // Step 4: appende a cp:wages:{period_id} con DEDUPE per wage.id
  const existing = (await kv.get(`cp:wages:${period_id}`)) || [];
  const existingIds = new Set(existing.map((w) => w.id));
  const newWages = normalized.filter((w) => !existingIds.has(w.id));
  const wasAlreadyPresent = normalized.length > 0 && newWages.length === 0;
  const merged = [...existing, ...newWages];
  if (newWages.length > 0) {
    await kv.set(`cp:wages:${period_id}`, merged, { ex: TTL_WAGES });
  }

  const totalShiftsAdded = newWages.reduce((s, w) => s + (w.shifts?.length || 0), 0);

  await logAuditAction({
    action: "creatorspro.wage-recheck",
    target: resolvedEmployee,
    by: az.userId,
    meta: { period_id, cp_member_id: cpMemberId, found_live: liveWages.length, added: newWages.length, total_shifts_added: totalShiftsAdded },
  });

  return Response.json({
    ok: true,
    cp_member_id: cpMemberId,
    employee: resolvedEmployee,
    live_wages_count: liveWages.length,
    fetched_details: normalized.length,
    failed_details: failedDetails,
    added_to_kv: newWages.length,
    total_shifts_added: totalShiftsAdded,
    was_already_present: wasAlreadyPresent,
    message: wasAlreadyPresent
      ? `${resolvedEmployee} era GIÀ presente in KV (nessuna nuova wage aggiunta).`
      : newWages.length > 0
        ? `✓ Trovate ${liveWages.length} wage live in CP, aggiunte ${newWages.length} (totale ${totalShiftsAdded} shift) a cp:wages:${period_id}.`
        : `Wage trovate ma 0 aggiunte (probabilmente fetch detail tutti falliti).`,
  });
}
