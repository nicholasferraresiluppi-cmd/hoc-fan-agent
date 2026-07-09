/**
 * GET /api/admin/cp-wage-raw-probe?period_id=YYYY-MM&member=<substring nome>
 *
 * DIAGNOSTICO throwaway: pesca la wage GREZZA di un operatore da CP (non
 * dal KV normalizzato) e mostra i takes così come arrivano dall'API — per
 * verificare se i purch esistono nel dato grezzo con la creator separabile
 * (ipotesi Nicholas) e il normalizzatore li perde, oppure se mancano alla
 * fonte. Confronta anche takes_count grezzo vs takes sopravvissuti al
 * filtro `creator_alias && amount > 0` di normalizeWage.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchMembers, fetchWages, fetchWageDetail } from "@/lib/creatorspro-api";

export const maxDuration = 60;

function monthBounds(periodId) {
  const [y, m] = periodId.split("-").map(Number);
  return {
    startedAt: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    endedAt: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString(),
  };
}

// Riassunto di un take GREZZO: tutte le chiavi + dove vive l'info creator.
function summarizeTake(t) {
  return {
    keys: Object.keys(t || {}),
    amount: t?.amount ?? null,
    type: t?.type ?? null,
    status: t?.status ?? null,
    creator_field: t?.creator ? { keys: Object.keys(t.creator), alias: t.creator.alias ?? null, id: t.creator.id ?? null, name: t.creator.name ?? null } : null,
    creatorAlias: t?.creatorAlias ?? null,
    creatorId: t?.creatorId ?? null,
    // altri campi che potrebbero contenere la creator
    other_hints: Object.fromEntries(Object.entries(t || {}).filter(([k, v]) =>
      /creator|fansite|talent|model/i.test(k) && !["creator", "creatorAlias", "creatorId"].includes(k)
    ).map(([k, v]) => [k, typeof v === "object" && v ? Object.keys(v) : v])),
  };
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  const memberQ = (url.searchParams.get("member") || "").trim().toLowerCase();
  if (!/^\d{4}-\d{2}$/.test(periodId) || !memberQ) {
    return Response.json({ error: "period_id YYYY-MM e member richiesti" }, { status: 400 });
  }

  const members = await fetchMembers();
  const memberList = members?.data || members || [];
  const fullName = (mm) => `${mm.firstName || ""} ${mm.lastName || ""} ${mm.username || ""}`.toLowerCase();
  const member = (Array.isArray(memberList) ? memberList : []).find((mm) => fullName(mm).includes(memberQ));
  if (!member) return Response.json({ error: `Membro '${memberQ}' non trovato (${Array.isArray(memberList) ? memberList.length : 0} membri)` }, { status: 404 });
  member.name = `${member.firstName || ""} ${member.lastName || ""}`.trim();

  const { startedAt, endedAt } = monthBounds(periodId);
  const wagesResp = await fetchWages({ startedAt, endedAt, memberId: member.id, page: 1, limit: 5 });
  const stubs = wagesResp?.data || wagesResp || [];
  const stub = (Array.isArray(stubs) ? stubs : [])[0];
  if (!stub) return Response.json({ error: "Nessuna wage per questo membro nel periodo", member: { id: member.id, name: member.name } }, { status: 404 });

  const detail = await fetchWageDetail(stub.info?.id || stub.id);
  const wage = detail?.data || detail || {};
  const shifts = Array.isArray(wage.shifts) ? wage.shifts : [];

  // Statistica takes su TUTTI i turni della wage
  let totTakes = 0, takesConCreator = 0, takesSenzaCreator = 0, amountSenzaCreator = 0;
  for (const s of shifts) {
    for (const t of s.takes || []) {
      totTakes++;
      const alias = t?.creator?.alias || t?.creatorAlias || null;
      if (alias) takesConCreator++;
      else { takesSenzaCreator++; amountSenzaCreator += Number(t?.amount) || 0; }
    }
  }

  // Dettaglio dei primi 3 turni: shape reale
  const sample = shifts.slice(0, 3).map((s) => ({
    startedAt: s.startedAt,
    totalAttributed: s.totalAttributed,
    associatedCreators: (s.associatedCreators || []).map((c) => ({ keys: Object.keys(c || {}), alias: c?.alias ?? null, id: c?.id ?? null })),
    shift_keys: Object.keys(s || {}),
    takes_count: (s.takes || []).length,
    first_takes: (s.takes || []).slice(0, 4).map(summarizeTake),
  }));

  return Response.json({
    member: { id: member.id, name: member.name || member.memberName },
    wage_id: stub.info?.id || stub.id,
    period: periodId,
    shifts_total: shifts.length,
    takes_stats: {
      totali: totTakes,
      con_creator: takesConCreator,
      senza_creator: takesSenzaCreator,
      importo_senza_creator: Math.round(amountSenzaCreator * 100) / 100,
    },
    sample_shifts: sample,
  });
}
