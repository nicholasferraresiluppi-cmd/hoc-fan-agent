import { kv } from "@vercel/kv";
import { KEYS } from "./kv-keys";

// Audit log append-only per le azioni sul modulo content-pipeline.
// Storage: LIST KV content:audit:log (LPUSH + LTRIM a MAX_ENTRIES).

const MAX_ENTRIES = 5000;

export async function logAudit({ actorUserId, action, target, meta } = {}) {
  if (!action) return;
  const entry = {
    ts: Date.now(),
    actorUserId: actorUserId || null,
    action,
    target: target || null,
    meta: meta || null,
  };
  try {
    await kv.lpush(KEYS.auditLog, JSON.stringify(entry));
    await kv.ltrim(KEYS.auditLog, 0, MAX_ENTRIES - 1);
  } catch (e) {
    console.warn("logAudit failed:", e?.message);
  }
}

export async function listAudit(limit = 100) {
  const raw = await kv.lrange(KEYS.auditLog, 0, Math.max(0, limit - 1));
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

export { MAX_ENTRIES };
