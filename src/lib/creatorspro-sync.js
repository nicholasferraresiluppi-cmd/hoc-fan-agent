/**
 * HOC Fan Agent — CreatorsPro sync orchestrator + storage.
 *
 * Coordina fetch + normalizzazione + scrittura su KV. Lo storage KV è:
 *   cp:wages:{period_id}       → array di wage normalizzati con shifts[]
 *   cp:members                  → mappa { cp_member_id: { id, firstName, lastName, username } }
 *   cp:groups                   → mappa { cp_group_id: { id, name, parentId } }
 *   cp:intervals                → array intervalli /timeline/intervals
 *   cp:member_mapping           → mappa { cp_member_id: employee_infloww_name }
 *   cp:_meta                    → { last_sync_at, last_sync_period, counts: { wages, members, ... } }
 *
 * period_id usa il formato HOC Fan Agent ("2026-04" per monthly).
 *
 * Sync flow:
 *   1. login
 *   2. fetch members + groups + intervals (overwrite KV)
 *   3. fetch all wages for period (paginate + detail per shifts)
 *   4. normalizza ogni wage in shape utile per la leaderboard
 *   5. tenta auto-mapping member↔employee Infloww (basato su nome)
 *   6. salva tutto in KV + aggiorna meta
 */
import { kv } from "@vercel/kv";
import {
  fetchMembers,
  fetchGroups,
  fetchIntervals,
  fetchAllWagesForPeriod,
  bucketizeIntervalFromHour,
} from "./creatorspro-api";

const TTL_WAGES = 90 * 24 * 3600; // 90 giorni
const TTL_REFDATA = 7 * 24 * 3600; // 7 giorni per members/groups/intervals

function monthBoundsIso(periodId) {
  // periodId = "YYYY-MM"
  const m = periodId.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`period_id invalido (atteso YYYY-MM): ${periodId}`);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

/**
 * Normalizza un wage CP nella shape che la leaderboard può consumare
 * senza dover sapere lo schema CP completo.
 */
function normalizeWage(wage) {
  const info = wage?.info || {};
  const shifts = Array.isArray(wage?.shifts) ? wage.shifts : [];
  const normalizedShifts = shifts.map((s) => ({
    id: s.id,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    worked_hours: s.workedHours || 0,
    total_attributed: s.totalAttributed || 0,
    total_earnings: s.totalEarnings || 0,
    interval_bucket: bucketizeIntervalFromHour(s.startedAt),
    creator_ids: (s.associatedCreators || []).map((c) => c.id).filter(Boolean),
    creator_aliases: (s.associatedCreators || []).map((c) => c.alias).filter(Boolean),
    takes_count: (s.takes || []).length,
  }));
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

/**
 * Auto-match member CP ↔ employee Infloww. Strategie in ordine:
 *   1. match esatto (firstName + " " + lastName) vs employee.trim()
 *   2. match case-insensitive
 *   3. match invertito (lastName firstName) — alcune agenzie scrivono cognome-nome
 * Restituisce { mapping: {cp_id: infloww_name}, unmatched_cp: [...] }
 */
async function autoMatchMembers(cpMembers) {
  // Recupera tutti i nomi Infloww da tutti i periodi disponibili
  const periodsRaw = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true })) || [];
  const monthlyPeriods = periodsRaw.filter((p) => typeof p === "string" && p.startsWith("monthly:")).slice(0, 6);
  const infwNames = new Set();
  for (const p of monthlyPeriods) {
    const periodId = p.replace("monthly:", "");
    const recs = await kv.get(`ops_kpi:monthly:${periodId}`);
    if (Array.isArray(recs)) {
      for (const r of recs) {
        if (r.employee && typeof r.employee === "string") {
          infwNames.add(r.employee.trim());
        }
      }
    }
  }
  const infwArr = Array.from(infwNames);
  const infwLower = new Map(infwArr.map((n) => [n.toLowerCase(), n]));

  // Preserva mapping esistenti
  const existing = (await kv.get("cp:member_mapping")) || {};
  const mapping = { ...existing };
  const unmatched = [];

  for (const m of cpMembers) {
    if (mapping[m.id]) continue; // già mappato manualmente
    const full = `${m.firstName || ""} ${m.lastName || ""}`.trim();
    const fullRev = `${m.lastName || ""} ${m.firstName || ""}`.trim();
    let hit = null;
    if (infwLower.has(full.toLowerCase())) hit = infwLower.get(full.toLowerCase());
    else if (infwLower.has(fullRev.toLowerCase())) hit = infwLower.get(fullRev.toLowerCase());
    if (hit) {
      mapping[m.id] = hit;
    } else {
      unmatched.push({ cp_id: m.id, cp_name: full, username: m.username });
    }
  }
  return { mapping, unmatched };
}

/**
 * Sync entrypoint — chiamato dal route admin.
 *
 * @param {object} opts
 * @param {string} opts.periodId  es. "2026-04"
 * @param {function} [opts.onProgress]  ({phase, current, total, message})
 */
export async function syncPeriod({ periodId, onProgress = () => {} }) {
  const startTs = Date.now();
  const { startedAt, endedAt } = monthBoundsIso(periodId);

  // 1. Reference data
  onProgress({ phase: "refdata", message: "fetching members/groups/intervals" });
  const [members, groups, intervals] = await Promise.all([
    fetchMembers(),
    fetchGroups(),
    fetchIntervals(),
  ]);

  const membersMap = {};
  for (const m of members) {
    membersMap[m.id] = {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      username: m.username,
    };
  }
  // Groups può essere hierarchical: appiattisco
  const groupsMap = {};
  function flattenGroups(arr, parentId = null) {
    for (const g of arr || []) {
      groupsMap[g.id] = { id: g.id, name: g.name, parentId };
      if (Array.isArray(g.childrens)) flattenGroups(g.childrens, g.id);
    }
  }
  flattenGroups(groups);

  await kv.set("cp:members", membersMap, { ex: TTL_REFDATA });
  await kv.set("cp:groups", groupsMap, { ex: TTL_REFDATA });
  await kv.set("cp:intervals", intervals, { ex: TTL_REFDATA });

  // 2. Wages with shifts
  onProgress({ phase: "wages", message: `fetching wages for ${periodId}` });
  const { wages: rawWages, count: rawCount } = await fetchAllWagesForPeriod({
    startedAt, endedAt,
    onProgress: (p) => onProgress({ phase: p.phase, current: p.current, total: p.total }),
  });

  const normalized = rawWages
    .filter((w) => !w?._error && w?.info?.id)
    .map(normalizeWage);

  await kv.set(`cp:wages:${periodId}`, normalized, { ex: TTL_WAGES });

  // 3. Auto-match member ↔ infloww employee
  onProgress({ phase: "matching", message: "auto-match members" });
  const { mapping, unmatched } = await autoMatchMembers(members);
  await kv.set("cp:member_mapping", mapping);

  // 4. Meta
  const meta = {
    last_sync_at: Date.now(),
    last_sync_period: periodId,
    duration_ms: Date.now() - startTs,
    counts: {
      members: members.length,
      groups: Object.keys(groupsMap).length,
      intervals: intervals.length,
      wages_raw: rawCount,
      wages_normalized: normalized.length,
      shifts_total: normalized.reduce((a, w) => a + (w.shifts?.length || 0), 0),
      mapping_total: Object.keys(mapping).length,
      mapping_unmatched: unmatched.length,
    },
  };
  await kv.set("cp:_meta", meta);

  return { meta, unmatched_sample: unmatched.slice(0, 20) };
}

/**
 * Recupera lo status corrente del sync (senza ri-fetchare).
 */
export async function getSyncStatus() {
  const [meta, mapping, members] = await Promise.all([
    kv.get("cp:_meta"),
    kv.get("cp:member_mapping"),
    kv.get("cp:members"),
  ]);
  return {
    meta: meta || null,
    mapping_count: Object.keys(mapping || {}).length,
    members_count: Object.keys(members || {}).length,
  };
}

/**
 * Mapping override manuale (admin).
 */
export async function setMemberMapping(cpMemberId, inflowwName) {
  if (!cpMemberId) throw new Error("cpMemberId required");
  const current = (await kv.get("cp:member_mapping")) || {};
  if (!inflowwName) {
    delete current[cpMemberId];
  } else {
    current[cpMemberId] = inflowwName.trim();
  }
  await kv.set("cp:member_mapping", current);
  return current;
}
