/**
 * HOC Fan Agent — CreatorsPro sync orchestrator (v2 incrementale).
 *
 * v2: split in 2 fasi separate per stare sotto Vercel Hobby 60s limit.
 *
 *  - syncRefdata()                    : members + groups + intervals (rapido)
 *  - prepareSync({periodId})          : fetch lista stub + salva index su KV
 *  - syncWageBatch({periodId, offset, batchSize}) : detail di un chunk + append KV
 *  - finalizeSync({periodId})         : auto-match + scrive meta + audit
 *
 * Il client UI (admin page) orchestra: refdata → prepare → loop batch → finalize.
 *
 * Storage KV (invariato):
 *   cp:wages:{period_id}   → array wage normalizzati con shifts[]
 *   cp:members, cp:groups, cp:intervals, cp:member_mapping, cp:_meta
 *
 * Stato sync in corso:
 *   cp:sync:state:{period_id} → { stubs: [{id, member_id, ...}], total, started_at }
 */
import { kv } from "@vercel/kv";
import {
  fetchMembers,
  fetchGroups,
  fetchIntervals,
  fetchAllWageStubs,
  fetchWageDetailBatch,
  fetchWages,
  bucketizeIntervalFromHour,
} from "./creatorspro-api";

const TTL_WAGES = 90 * 24 * 3600;
const TTL_REFDATA = 7 * 24 * 3600;
const TTL_SYNC_STATE = 6 * 3600; // 6 ore — un sync deve completarsi entro

function monthBoundsIso(periodId) {
  const m = periodId.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`period_id invalido (atteso YYYY-MM): ${periodId}`);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

function normalizeWage(wage) {
  const info = wage?.info || {};
  const shifts = Array.isArray(wage?.shifts) ? wage.shifts : [];
  const normalizedShifts = shifts.map((s) => {
    const rawTakes = Array.isArray(s.takes) ? s.takes : [];
    // v3 / Opzione A: salviamo i takes con creator_alias + amount per attribuzione
    // ESATTA per creator (sostituisce lo split equo 50/50 sui shift multi-creator).
    // Teniamo solo i campi essenziali per limitare il payload KV.
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
      takes, // [{amount, type, creator_alias, creator_id, status}] — per attribuzione esatta
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

/**
 * Step 1: sync reference data (members, groups, intervals). Veloce.
 */
export async function syncRefdata() {
  const [members, groups, intervals] = await Promise.all([
    fetchMembers(),
    fetchGroups(),
    fetchIntervals(),
  ]);
  const membersMap = {};
  for (const m of members) {
    membersMap[m.id] = { id: m.id, firstName: m.firstName, lastName: m.lastName, username: m.username };
  }
  const groupsMap = {};
  function flatten(arr, parentId = null) {
    for (const g of arr || []) {
      groupsMap[g.id] = { id: g.id, name: g.name, parentId };
      if (Array.isArray(g.childrens)) flatten(g.childrens, g.id);
    }
  }
  flatten(groups);
  await kv.set("cp:members", membersMap, { ex: TTL_REFDATA });
  await kv.set("cp:groups", groupsMap, { ex: TTL_REFDATA });
  await kv.set("cp:intervals", intervals, { ex: TTL_REFDATA });
  return {
    members: members.length,
    groups: Object.keys(groupsMap).length,
    intervals: intervals.length,
  };
}

/**
 * Step 2: prepare — fetcha la lista wage stub e salva l'indice in KV.
 * Supporta modalità incrementale per stare sotto 60s di Vercel Hobby:
 *
 *   prepareSync({periodId})                          → fetch tutto in una chiamata (rischio timeout)
 *   prepareSync({periodId, pageOffset, pagesLimit})  → fetch solo N pagine, ritorna next_page_offset
 *
 * Quando pageOffset > 0 fa append all'indice esistente.
 */
export async function prepareSync({ periodId, pageOffset = null, pagesLimit = null }) {
  const { startedAt, endedAt } = monthBoundsIso(periodId);

  // Modalità incrementale: chunk di pagine alla volta
  if (pageOffset !== null && pagesLimit !== null) {
    // Su prima chiamata (pageOffset=1) reset
    if (pageOffset === 1) {
      await kv.set(`cp:sync:state:${periodId}`, {
        stubs: [],
        total: 0,
        raw_total: null,
        started_at: Date.now(),
        prepare_done: false,
      }, { ex: TTL_SYNC_STATE });
      await kv.set(`cp:wages:${periodId}`, [], { ex: TTL_WAGES });
    }
    // Fetch first page per scoprire pagination
    const first = await fetchWages({ startedAt, endedAt, page: pageOffset, limit: 25 });
    const totalCount = first.pagination?.dataCount || 0;
    const pageCount = first.pagination?.pageCount || 1;
    const stubsBatch = [...(first.data || [])];
    // Fetch pagine successive in parallelo fino a pagesLimit
    const lastPage = Math.min(pageCount, pageOffset + pagesLimit - 1);
    if (lastPage > pageOffset) {
      const pages = [];
      for (let p = pageOffset + 1; p <= lastPage; p++) pages.push(p);
      const CONCURRENCY = 5;
      for (let i = 0; i < pages.length; i += CONCURRENCY) {
        const slice = pages.slice(i, i + CONCURRENCY);
        const results = await Promise.all(slice.map((p) =>
          fetchWages({ startedAt, endedAt, page: p, limit: 25 }).catch((e) => ({ data: [], _err: String(e?.message || e) }))
        ));
        for (const r of results) if (r?.data) stubsBatch.push(...r.data);
      }
    }
    // Append a state
    const state = (await kv.get(`cp:sync:state:${periodId}`)) || { stubs: [], total: 0, started_at: Date.now() };
    const idxStubs = stubsBatch.map((w) => ({
      id: w?.info?.id, member_id: w?.info?.memberId, member_name: w?.info?.memberName, status: w?.info?.status,
    })).filter((s) => s.id);
    const newStubs = [...(state.stubs || []), ...idxStubs];
    const nextPage = lastPage + 1;
    const prepareDone = nextPage > pageCount;
    await kv.set(`cp:sync:state:${periodId}`, {
      ...state,
      stubs: newStubs,
      total: newStubs.length,
      raw_total: totalCount,
      page_count: pageCount,
      prepare_done: prepareDone,
    }, { ex: TTL_SYNC_STATE });
    return {
      total: newStubs.length,
      raw_total: totalCount,
      page_count: pageCount,
      current_page: lastPage,
      next_page: prepareDone ? null : nextPage,
      done: prepareDone,
    };
  }

  // Modalità classica (one-shot)
  const { stubs, totalCount } = await fetchAllWageStubs({ startedAt, endedAt });
  const idxStubs = stubs.map((w) => ({
    id: w?.info?.id, member_id: w?.info?.memberId, member_name: w?.info?.memberName, status: w?.info?.status,
  })).filter((s) => s.id);
  await kv.set(`cp:sync:state:${periodId}`, {
    stubs: idxStubs, total: idxStubs.length, raw_total: totalCount, started_at: Date.now(), prepare_done: true,
  }, { ex: TTL_SYNC_STATE });
  await kv.set(`cp:wages:${periodId}`, [], { ex: TTL_WAGES });
  return { total: idxStubs.length, raw_total: totalCount, done: true };
}

/**
 * Step 3 (loop): sync di un batch di wage detail. Salva append su cp:wages:{periodId}.
 * Ritorna progress + flag done.
 */
export async function syncWageBatch({ periodId, offset = 0, batchSize = 50 }) {
  const state = await kv.get(`cp:sync:state:${periodId}`);
  if (!state || !Array.isArray(state.stubs)) {
    throw new Error(`Nessuno stato sync per ${periodId}. Chiama prima prepareSync.`);
  }
  const { stubs, total } = state;
  if (offset >= total) {
    return { done: true, processed: total, total, next_offset: total };
  }
  const sliceStubs = stubs.slice(offset, offset + batchSize);
  const ids = sliceStubs.map((s) => s.id).filter(Boolean);
  const details = await fetchWageDetailBatch(ids);
  const normalized = details
    .filter((w) => !w?._error && w?.info?.id)
    .map(normalizeWage);

  // Append a cp:wages:{periodId}
  const existing = (await kv.get(`cp:wages:${periodId}`)) || [];
  const merged = [...existing, ...normalized];
  await kv.set(`cp:wages:${periodId}`, merged, { ex: TTL_WAGES });

  const newOffset = offset + sliceStubs.length;
  return {
    done: newOffset >= total,
    processed: newOffset,
    total,
    next_offset: newOffset,
    batch_normalized: normalized.length,
    batch_errors: details.filter((d) => d?._error).length,
  };
}

/**
 * Step 4: finalize — auto-match members, scrive meta, cleanup state.
 */
export async function finalizeSync({ periodId }) {
  const [state, wages, members] = await Promise.all([
    kv.get(`cp:sync:state:${periodId}`),
    kv.get(`cp:wages:${periodId}`),
    kv.get("cp:members"),
  ]);
  if (!state) throw new Error(`Stato sync mancante per ${periodId}`);
  const cpMembers = Object.values(members || {});

  // Auto-match
  const periodsRaw = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true })) || [];
  const monthlyPeriods = periodsRaw.filter((p) => typeof p === "string" && p.startsWith("monthly:")).slice(0, 6);
  const infwNames = new Set();
  for (const p of monthlyPeriods) {
    const pid = p.replace("monthly:", "");
    const recs = await kv.get(`ops_kpi:monthly:${pid}`);
    if (Array.isArray(recs)) {
      for (const r of recs) if (r.employee && typeof r.employee === "string") infwNames.add(r.employee.trim());
    }
  }
  const infwLower = new Map(Array.from(infwNames).map((n) => [n.toLowerCase(), n]));
  const existingMapping = (await kv.get("cp:member_mapping")) || {};
  const mapping = { ...existingMapping };
  const unmatched = [];
  for (const m of cpMembers) {
    if (mapping[m.id]) continue;
    const full = `${m.firstName || ""} ${m.lastName || ""}`.trim();
    const fullRev = `${m.lastName || ""} ${m.firstName || ""}`.trim();
    let hit = null;
    if (infwLower.has(full.toLowerCase())) hit = infwLower.get(full.toLowerCase());
    else if (infwLower.has(fullRev.toLowerCase())) hit = infwLower.get(fullRev.toLowerCase());
    if (hit) mapping[m.id] = hit;
    else unmatched.push({ cp_id: m.id, cp_name: full, username: m.username });
  }
  await kv.set("cp:member_mapping", mapping);

  const wagesArr = Array.isArray(wages) ? wages : [];
  const meta = {
    last_sync_at: Date.now(),
    last_sync_period: periodId,
    duration_ms: Date.now() - state.started_at,
    counts: {
      members: cpMembers.length,
      groups: Object.keys((await kv.get("cp:groups")) || {}).length,
      intervals: ((await kv.get("cp:intervals")) || []).length,
      wages_raw: state.raw_total || wagesArr.length,
      wages_normalized: wagesArr.length,
      shifts_total: wagesArr.reduce((a, w) => a + (w.shifts?.length || 0), 0),
      mapping_total: Object.keys(mapping).length,
      mapping_unmatched: unmatched.length,
    },
  };
  await kv.set("cp:_meta", meta);
  await kv.del(`cp:sync:state:${periodId}`);

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

export async function setMemberMapping(cpMemberId, inflowwName) {
  if (!cpMemberId) throw new Error("cpMemberId required");
  const current = (await kv.get("cp:member_mapping")) || {};
  if (!inflowwName) delete current[cpMemberId];
  else current[cpMemberId] = inflowwName.trim();
  await kv.set("cp:member_mapping", current);
  return current;
}
