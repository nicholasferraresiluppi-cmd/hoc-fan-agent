// Chi è di turno adesso su una creator, e chi arriva dopo (strumento "Revenue e chat", 09/10/2026).
// Fonte: i turni di CreatorsPro replicati nel warehouse (postgres.public_events → shifts →
// members) + il check-in (public_checkins con ended_at NULL = entrato e non ancora uscito).
// Verificato a mano il 09/10 sulle tre creator di Antonio: turni da 5 ore, nomi e check-in
// coerenti. Query minuscola (~20 MB). Cache KV 5 minuti: il cambio turno è al minuto,
// ma 5 minuti di ritardo su "chi c'è" bastano a sapere a chi scrivere.

import { kv } from "@vercel/kv";
import { bqQuery } from "@/lib/bigquery-api";

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const KEY = (slug) => `live:shifts:v1:${slug}`;
const TTL_S = 5 * 60;

const iso = (v) => (v == null || v === "" ? null : /^[\d.]+(E\d+)?$/i.test(String(v)) ? new Date(Number(v) * 1000).toISOString() : String(v));

/** Turni che toccano [adesso, +14 ore], per paese dell'account. */
async function compute(creator) {
  const p = P();
  const acc = creator.accounts.map((a) => ({ id: Number(a.creator_id), country: String(a.country).replace(/[^A-Z]/g, "") }));
  const ids = acc.map((a) => a.id).filter(Number.isInteger);
  const { rows } = await bqQuery(`
    SELECT ec.creator_id, e.started_at, e.ended_at,
      TRIM(CONCAT(IFNULL(m.first_name, ''), ' ', IFNULL(m.last_name, ''))) AS member,
      EXISTS (SELECT 1 FROM \`${p}.postgres.public_checkins\` k WHERE k.shift_id = s.id AND k.started_at IS NOT NULL AND k.ended_at IS NULL) AS checked_in
    FROM \`${p}.postgres.public_events\` e
    JOIN \`${p}.postgres.public_events_creators\` ec ON ec.event_id = e.id
    JOIN \`${p}.postgres.public_shifts\` s ON s.event_id = e.id
    LEFT JOIN \`${p}.postgres.public_members\` m ON m.id = s.member_id
    WHERE e.ended_at > CURRENT_TIMESTAMP() AND e.started_at <= TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 14 HOUR)
      AND ec.creator_id IN (${ids.join(", ")})
    ORDER BY e.started_at`, { maxBytesBilled: 512 * 1024 * 1024 });
  const byCountry = {};
  for (const a of acc) byCountry[a.country] = [];
  const seen = new Set();
  for (const r of rows) {
    const country = acc.find((a) => a.id === Number(r.creator_id))?.country;
    if (!country || !r.member) continue;
    const s = { member: r.member, start: iso(r.started_at), end: iso(r.ended_at), checked_in: r.checked_in === true || r.checked_in === "true" };
    const k = `${country}|${s.member}|${s.start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    byCountry[country].push(s);
  }
  return { byCountry, updated_at: new Date().toISOString() };
}

export async function getLiveShifts(creator) {
  const cached = await kv.get(KEY(creator.slug)).catch(() => null);
  if (cached) return cached;
  const out = await compute(creator);
  await kv.set(KEY(creator.slug), out, { ex: TTL_S }).catch(() => {});
  return out;
}
