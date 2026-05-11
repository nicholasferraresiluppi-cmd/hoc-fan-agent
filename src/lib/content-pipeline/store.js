import { kv } from "@vercel/kv";
import { KEYS, DRAFT_STATUS } from "./kv-keys";

// Layer CRUD su Vercel KV per il modulo content-pipeline.
//
// IMPORTANTE: questo layer NON cifra/decifra i token. Chi chiama saveCreator deve
// passare telegramBotTokenEnc già cifrato. Le API GET sono responsabili dello strip
// di telegramBotTokenEnc prima di rispondere.

// === Creators ===

export async function listCreators() {
  const slugs = (await kv.smembers(KEYS.creatorsSet)) || [];
  if (!slugs.length) return [];
  const rows = await Promise.all(slugs.map((s) => kv.get(KEYS.creator(s))));
  return rows.filter(Boolean);
}

export async function getCreator(slug) {
  if (!slug) return null;
  return (await kv.get(KEYS.creator(slug))) || null;
}

export async function saveCreator(creator) {
  if (!creator?.slug) throw new Error("creator.slug required");
  const now = Date.now();
  const existing = await getCreator(creator.slug);
  const merged = {
    ...existing,
    ...creator,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await kv.set(KEYS.creator(creator.slug), merged);
  await kv.sadd(KEYS.creatorsSet, creator.slug);
  return merged;
}

export async function deleteCreator(slug) {
  if (!slug) return;
  await kv.del(KEYS.creator(slug));
  await kv.srem(KEYS.creatorsSet, slug);
}

// === Drafts ===

export async function createDraft(draft) {
  if (!draft?.id) throw new Error("draft.id required");
  if (!draft.creatorSlug) throw new Error("draft.creatorSlug required");
  const now = Date.now();
  const full = {
    status: DRAFT_STATUS.PENDING,
    mediaUrls: [],
    ...draft,
    createdAt: now,
    updatedAt: now,
  };
  await kv.set(KEYS.draft(full.id), full);
  await kv.sadd(KEYS.draftsByCreator(full.creatorSlug), full.id);
  await kv.sadd(KEYS.draftsByStatus(full.status), full.id);
  return full;
}

export async function getDraft(id) {
  if (!id) return null;
  return (await kv.get(KEYS.draft(id))) || null;
}

export async function updateDraft(id, patch) {
  const cur = await getDraft(id);
  if (!cur) throw new Error(`draft ${id} not found`);
  const prevStatus = cur.status;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await kv.set(KEYS.draft(id), next);
  if (patch.status && patch.status !== prevStatus) {
    await kv.srem(KEYS.draftsByStatus(prevStatus), id);
    await kv.sadd(KEYS.draftsByStatus(next.status), id);
  }
  return next;
}

export async function deleteDraft(id) {
  const cur = await getDraft(id);
  if (!cur) return;
  await kv.del(KEYS.draft(id));
  await kv.srem(KEYS.draftsByCreator(cur.creatorSlug), id);
  await kv.srem(KEYS.draftsByStatus(cur.status), id);
}

export async function listDraftsByCreator(slug) {
  if (!slug) return [];
  const ids = (await kv.smembers(KEYS.draftsByCreator(slug))) || [];
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((i) => kv.get(KEYS.draft(i))));
  return rows.filter(Boolean);
}

export async function listDraftsByStatus(status) {
  const ids = (await kv.smembers(KEYS.draftsByStatus(status))) || [];
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((i) => kv.get(KEYS.draft(i))));
  return rows.filter(Boolean);
}

// === Scheduling (Redis ZSET) ===

export async function scheduleDraft(draftId, publishAtTs) {
  if (!draftId) throw new Error("draftId required");
  if (typeof publishAtTs !== "number" || !Number.isFinite(publishAtTs)) {
    throw new Error("publishAtTs must be a finite number (ms timestamp)");
  }
  await kv.zadd(KEYS.scheduledZset, { score: publishAtTs, member: draftId });
}

export async function unscheduleDraft(draftId) {
  if (!draftId) return;
  await kv.zrem(KEYS.scheduledZset, draftId);
}

export async function listDuePending(nowTs = Date.now()) {
  const ids = await kv.zrange(KEYS.scheduledZset, 0, nowTs, { byScore: true });
  return ids || [];
}

// === History (LIST capped) ===

const MAX_HISTORY_PER_CREATOR = 1000;

export async function appendHistory(slug, entry) {
  if (!slug || !entry) return;
  await kv.lpush(KEYS.history(slug), JSON.stringify(entry));
  await kv.ltrim(KEYS.history(slug), 0, MAX_HISTORY_PER_CREATOR - 1);
}

export async function listHistory(slug, limit = 100) {
  if (!slug) return [];
  const raw = await kv.lrange(KEYS.history(slug), 0, Math.max(0, limit - 1));
  return (raw || [])
    .map((r) => {
      try {
        return typeof r === "string" ? JSON.parse(r) : r;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
