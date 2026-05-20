/**
 * HOC Fan Agent — Audit log helpers (leaderboard actions).
 *
 * Log circolare (capped 200) di azioni admin sulla leaderboard:
 * esclusioni aggiunte/rimosse, ignorati aggiunti/rimossi, override lingua,
 * categorizzazioni, ecc. Per audit/forensic quando "chi ha rimosso X?".
 *
 * Storage: lista KV `audit:leaderboard-actions` (LPUSH + LTRIM 0 199).
 * Ogni entry è JSON-stringificato.
 */
import { kv } from "@vercel/kv";

const KEY = "audit:leaderboard-actions";
const CAP = 200;

/**
 * @param {object} entry
 * @param {string} entry.action  - es. "exclusion.add", "exclusion.remove",
 *                                 "ignored.add", "ignored.remove", "language.set"
 * @param {string} entry.target  - es. employee name o group name
 * @param {string} entry.by      - userId Clerk
 * @param {object} [entry.meta]  - dati extra (reason, note, vecchio valore...)
 */
export async function logAuditAction({ action, target, by, meta = {} }) {
  try {
    const e = { action, target, by, at: Date.now(), meta };
    await kv.lpush(KEY, JSON.stringify(e));
    await kv.ltrim(KEY, 0, CAP - 1);
  } catch (err) {
    // Non-fatale: il log fallito non deve rompere l'azione admin.
    console.error("audit log push failed:", err?.message || err);
  }
}

/**
 * Ritorna le ultime `limit` azioni (default 50, max 200).
 */
export async function getAuditLog({ limit = 50 } = {}) {
  try {
    const l = Math.min(CAP, Math.max(1, limit));
    const items = (await kv.lrange(KEY, 0, l - 1)) || [];
    return items
      .map((s) => {
        try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
