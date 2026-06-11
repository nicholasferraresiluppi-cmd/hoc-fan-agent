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
  fetchWageStubsForPages,
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

export function normalizeWage(wage) {
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
      // v4 / Fase B: payment profile applicato al TURNO (scoperto via shift-research:
      // il raw shift espone paymentProfile completo + thresholds snapshot scaglioni).
      // Abilita: nome profilo per turno, check % attesa vs reale, coerenza cosellers.
      payment_profile: s.paymentProfile ? {
        id: s.paymentProfile.id ?? null,
        name: s.paymentProfile.name ?? null,
        cosellers_count: s.paymentProfile.cosellersCount ?? null,
        hourly_rate: s.paymentProfile.hourlyRate ?? null,
      } : null,
      thresholds: Array.isArray(s.thresholds)
        ? s.thresholds.map((t) => ({
            threshold: t?.threshold ?? null,
            percentage: t?.percentage ?? null,
          }))
        : [],
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
        failed_pages: [],
      }, { ex: TTL_SYNC_STATE });
      await kv.set(`cp:wages:${periodId}`, [], { ex: TTL_WAGES });
    }
    // Fetch first page per scoprire pagination (con retry interno via fetchWageStubsForPages)
    const firstResult = await fetchWageStubsForPages({ startedAt, endedAt, pages: [pageOffset] });
    let pageCount = 1;
    let totalCount = 0;
    // fetchWageStubsForPages non ritorna pagination → la prendiamo con una micro-call fetchWages diretta
    // (solo se è la prima invocazione e dobbiamo scoprire pageCount)
    let stubsBatch = firstResult.stubs;
    const pageFailures = [...firstResult.failedPages];
    try {
      const first = await fetchWages({ startedAt, endedAt, page: pageOffset, limit: 25 });
      totalCount = first.pagination?.dataCount || 0;
      pageCount = first.pagination?.pageCount || 1;
      // Se sopra abbiamo fallito la pagina offset ma qui no, usiamo questi dati
      if (pageFailures.length > 0 && first.data) {
        pageFailures.length = 0;
        stubsBatch = [...first.data];
      }
    } catch {
      // Se anche questa chiamata fallisce, abbiamo già pageFailures tracciato
    }
    // Fetch pagine successive con retry tramite fetchWageStubsForPages
    const lastPage = Math.min(pageCount, pageOffset + pagesLimit - 1);
    if (lastPage > pageOffset) {
      const pages = [];
      for (let p = pageOffset + 1; p <= lastPage; p++) pages.push(p);
      const restResult = await fetchWageStubsForPages({ startedAt, endedAt, pages });
      stubsBatch.push(...restResult.stubs);
      pageFailures.push(...restResult.failedPages);
    }
    // Append a state
    const state = (await kv.get(`cp:sync:state:${periodId}`)) || { stubs: [], total: 0, started_at: Date.now(), failed_pages: [] };
    const idxStubs = stubsBatch.map((w) => ({
      id: w?.info?.id, member_id: w?.info?.memberId, member_name: w?.info?.memberName, status: w?.info?.status,
    })).filter((s) => s.id);
    const newStubs = [...(state.stubs || []), ...idxStubs];
    const newFailedPages = [...(state.failed_pages || []), ...pageFailures];
    const nextPage = lastPage + 1;
    const prepareDone = nextPage > pageCount;
    await kv.set(`cp:sync:state:${periodId}`, {
      ...state,
      stubs: newStubs,
      total: newStubs.length,
      raw_total: totalCount,
      page_count: pageCount,
      prepare_done: prepareDone,
      failed_pages: newFailedPages,
    }, { ex: TTL_SYNC_STATE });
    return {
      total: newStubs.length,
      raw_total: totalCount,
      page_count: pageCount,
      current_page: lastPage,
      next_page: prepareDone ? null : nextPage,
      failed_pages: newFailedPages,
      done: prepareDone,
    };
  }

  // Modalità classica (one-shot) — ora con retry interno
  const { stubs, totalCount, pageCount, failedPages } = await fetchAllWageStubs({ startedAt, endedAt });
  const idxStubs = stubs.map((w) => ({
    id: w?.info?.id, member_id: w?.info?.memberId, member_name: w?.info?.memberName, status: w?.info?.status,
  })).filter((s) => s.id);
  await kv.set(`cp:sync:state:${periodId}`, {
    stubs: idxStubs, total: idxStubs.length, raw_total: totalCount, page_count: pageCount,
    started_at: Date.now(), prepare_done: true, failed_pages: failedPages,
  }, { ex: TTL_SYNC_STATE });
  await kv.set(`cp:wages:${periodId}`, [], { ex: TTL_WAGES });
  return { total: idxStubs.length, raw_total: totalCount, failed_pages: failedPages, done: true };
}

/**
 * Retry mirato: ri-pesca SOLO le pagine fallite del prepare precedente,
 * e appende i nuovi stub allo state. Da chiamare dopo che lo state ha
 * `failed_pages.length > 0` se vuoi recuperare i record persi.
 */
export async function retryFailedPages({ periodId }) {
  const state = await kv.get(`cp:sync:state:${periodId}`);
  if (!state) throw new Error(`Nessuno stato sync per ${periodId}`);
  const failed = state.failed_pages || [];
  if (failed.length === 0) return { retried: 0, recovered: 0, still_failed: [] };

  const { startedAt, endedAt } = monthBoundsIso(periodId);
  const pages = failed.map((f) => f.page);
  const { stubs, failedPages: stillFailed } = await fetchWageStubsForPages({ startedAt, endedAt, pages });
  const idxStubs = stubs.map((w) => ({
    id: w?.info?.id, member_id: w?.info?.memberId, member_name: w?.info?.memberName, status: w?.info?.status,
  })).filter((s) => s.id);
  // Dedupe vs existing stubs
  const existingIds = new Set((state.stubs || []).map((s) => s.id));
  const newStubs = idxStubs.filter((s) => !existingIds.has(s.id));
  const updatedStubs = [...(state.stubs || []), ...newStubs];
  await kv.set(`cp:sync:state:${periodId}`, {
    ...state,
    stubs: updatedStubs,
    total: updatedStubs.length,
    failed_pages: stillFailed,
  }, { ex: TTL_SYNC_STATE });
  return { retried: pages.length, recovered: newStubs.length, still_failed: stillFailed };
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
  const failedDetails = details.filter((d) => d?._error).map((d) => ({ id: d._id, error: d._error }));

  // Append a cp:wages:{periodId}
  const existing = (await kv.get(`cp:wages:${periodId}`)) || [];
  const merged = [...existing, ...normalized];
  await kv.set(`cp:wages:${periodId}`, merged, { ex: TTL_WAGES });

  // Persist failed detail ids in state (per retry mirato eventuale)
  if (failedDetails.length > 0) {
    const updatedState = (await kv.get(`cp:sync:state:${periodId}`)) || state;
    const existingFailed = updatedState.failed_details || [];
    await kv.set(`cp:sync:state:${periodId}`, {
      ...updatedState,
      failed_details: [...existingFailed, ...failedDetails],
    }, { ex: TTL_SYNC_STATE });
  }

  const newOffset = offset + sliceStubs.length;
  return {
    done: newOffset >= total,
    processed: newOffset,
    total,
    next_offset: newOffset,
    batch_normalized: normalized.length,
    batch_errors: failedDetails.length,
    failed_detail_ids_sample: failedDetails.slice(0, 5).map((f) => f.id),
  };
}

/**
 * Retry mirato dei wage detail falliti (raccolti durante syncWageBatch).
 * Riprova ognuno con backoff e appende i normalizzati a cp:wages.
 */
export async function retryFailedDetails({ periodId }) {
  const state = await kv.get(`cp:sync:state:${periodId}`);
  if (!state) throw new Error(`Nessuno stato sync per ${periodId}`);
  const failed = state.failed_details || [];
  if (failed.length === 0) return { retried: 0, recovered: 0, still_failed: [] };

  const ids = failed.map((f) => f.id);
  const details = await fetchWageDetailBatch(ids);
  const normalized = details
    .filter((w) => !w?._error && w?.info?.id)
    .map(normalizeWage);
  const stillFailed = details.filter((d) => d?._error).map((d) => ({ id: d._id, error: d._error }));

  const existing = (await kv.get(`cp:wages:${periodId}`)) || [];
  // Dedupe by wage id
  const existingIds = new Set(existing.map((w) => w.id));
  const newWages = normalized.filter((w) => !existingIds.has(w.id));
  const merged = [...existing, ...newWages];
  await kv.set(`cp:wages:${periodId}`, merged, { ex: TTL_WAGES });

  await kv.set(`cp:sync:state:${periodId}`, {
    ...state,
    failed_details: stillFailed,
  }, { ex: TTL_SYNC_STATE });

  return { retried: ids.length, recovered: newWages.length, still_failed: stillFailed };
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
  const failedPages = state.failed_pages || [];
  const failedDetails = state.failed_details || [];

  // Post-sync audit: chiama CP API live e confronta total con quanto abbiamo in KV.
  // Se gap > 0 = il sync ha perso wage. Salva in meta.gap_check così il Hub
  // può alertare l'utente subito. NB: chiamata best-effort, se fallisce non blocca.
  let gapCheck = null;
  try {
    const { fetchWages } = await import("./creatorspro-api");
    const probe = await fetchWages({ startedAt, endedAt, page: 1, limit: 1 });
    const cpLiveCount = probe?.pagination?.dataCount ?? null;
    if (cpLiveCount != null) {
      const gap = Math.max(0, cpLiveCount - wagesArr.length);
      gapCheck = {
        cp_live_count: cpLiveCount,
        kv_count: wagesArr.length,
        gap,
        is_complete: gap === 0,
        checked_at: Date.now(),
      };
    }
  } catch (e) {
    gapCheck = { error: String(e?.message || e), checked_at: Date.now() };
  }

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
      failed_pages: failedPages.length,
      failed_details: failedDetails.length,
    },
    failed_pages_sample: failedPages.slice(0, 5),
    failed_details_sample: failedDetails.slice(0, 5),
    has_warnings: failedPages.length > 0 || failedDetails.length > 0 || (gapCheck?.gap > 0),
    gap_check: gapCheck,
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
