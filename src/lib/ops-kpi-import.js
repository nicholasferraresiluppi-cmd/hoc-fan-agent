import { kv } from "@vercel/kv";
import { parseCsvRow } from "@/lib/leaderboard-calc";
import { CSV_COLUMN_MAP } from "@/lib/leaderboard-config";
import { snapshotScoreConfig } from "@/lib/score-config-snapshot";

/**
 * Import CSV Infloww (Employee statistics) → KV ops_kpi.
 * Logica condivisa tra la pagina admin (/api/admin/leaderboard-import) e
 * l'ingest headless del bridge (/api/ingest/infloww-csv). Stesso formato,
 * stesse chiavi KV: `ops_kpi:{period_type}:{period_id}` + ZSET `ops_kpi:imports`.
 */

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  function parseLine(line) {
    const result = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = !inQuote;
      else if (ch === "," && !inQuote) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  }
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = cols[j] !== undefined ? cols[j].trim() : ""; });
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * @returns {{ ok: boolean, status: number, body: object }}
 * mode "preview" → solo stats; mode "save" → scrive in KV.
 */
export async function importOpsKpiCsv({ csv, period_type, period_id, mode = "save" }) {
  if (!csv || typeof csv !== "string") return { ok: false, status: 400, body: { error: "Missing csv content." } };
  if (!["weekly", "monthly", "quarterly"].includes(period_type)) {
    return { ok: false, status: 400, body: { error: "period_type must be weekly|monthly|quarterly." } };
  }
  if (!period_id || typeof period_id !== "string") return { ok: false, status: 400, body: { error: "Missing period_id." } };

  const { headers, rows } = parseCsv(csv);
  if (rows.length === 0) return { ok: false, status: 400, body: { error: "CSV empty or no data rows." } };

  const expected = Object.keys(CSV_COLUMN_MAP);
  const missing = expected.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { ok: false, status: 400, body: { error: "CSV missing required Infloww columns.", missing_headers: missing, found_headers: headers } };
  }

  const records = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const parsed = parseCsvRow(rows[i]);
      if (!parsed.employee || !parsed.group) { errors.push({ row: i + 2, reason: "Missing employee or group." }); continue; }
      records.push(parsed);
    } catch (e) {
      errors.push({ row: i + 2, reason: String(e?.message || e) });
    }
  }

  const massCount = records.filter((r) => r.is_mass).length;
  const byGroup = {};
  for (const r of records) byGroup[r.group] = (byGroup[r.group] || 0) + 1;
  const dates = records.map((r) => r.date_range).filter(Boolean).sort();
  const stats = {
    totalRecords: records.length,
    massCount,
    eligibleCount: records.length - massCount,
    byGroup,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    errors,
    period_type,
    period_id,
  };

  if (mode === "preview") return { ok: true, status: 200, body: { ...stats, mode: "preview" } };

  const key = `ops_kpi:${period_type}:${period_id}`;
  await kv.set(key, records);
  const ts = Date.now();
  await kv.zadd("ops_kpi:imports", { score: ts, member: `${period_type}:${period_id}` });
  // Congela la formula score effettiva a questo import (drift detection, gate 0b).
  // Non-bloccante: uno snapshot fallito non deve invalidare un import riuscito.
  const snap = await snapshotScoreConfig({ period_type, period_id, ts, source: "ingest" });
  return { ok: true, status: 200, body: { ...stats, mode: "save", kv_key: key, saved_at: new Date(ts).toISOString(), score_config_hash: snap.hash || null } };
}
