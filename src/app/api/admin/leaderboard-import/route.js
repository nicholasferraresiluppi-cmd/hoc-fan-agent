/**
 * POST /api/admin/leaderboard-import
 *
 * Importa un CSV Infloww nella leaderboard operativa.
 * Capability richiesta: SEED (admin-only). Sicurezza forte perché questi
 * dati alimentano direttamente la leaderboard pubblica.
 *
 * Body (JSON): {
 *   csv: string              — contenuto del file CSV (header + righe)
 *   period_type: string      — "weekly" | "monthly" | "quarterly"
 *   period_id: string        — es. "2026-02" (monthly) | "2026-W05" (weekly) | "2026-Q1"
 *   mode: string             — "preview" | "save"  (preview ritorna stats senza salvare)
 * }
 *
 * Response (preview o save):
 *   {
 *     totalRecords, massCount, eligibleCount,
 *     byGroup: { groupName: count, ... },
 *     dateRange: { from, to },
 *     errors: []   // righe non parsabili
 *   }
 *
 * Storage in KV (solo mode=save):
 *   ops_kpi:{period_type}:{period_id} → array di record giornalieri normalizzati
 *   ops_kpi:imports → ZSET (score=timestamp, member=`{period_type}:{period_id}`)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { parseCsvRow, isMassAccount } from "@/lib/leaderboard-calc";
import { CSV_COLUMN_MAP } from "@/lib/leaderboard-config";

/**
 * Parser CSV minimale che supporta valori quoted (per gestire virgole dentro
 * stringhe come "Giulia,Alice,Elisa"). Per CSV semplici di Infloww basta.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line) {
    const result = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = cols[j] !== undefined ? cols[j].trim() : "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { csv, period_type, period_id, mode = "preview" } = body || {};

  // Validazione
  if (!csv || typeof csv !== "string") {
    return Response.json({ error: "Missing csv content." }, { status: 400 });
  }
  if (!["weekly", "monthly", "quarterly"].includes(period_type)) {
    return Response.json(
      { error: "period_type must be one of: weekly, monthly, quarterly." },
      { status: 400 }
    );
  }
  if (!period_id || typeof period_id !== "string") {
    return Response.json({ error: "Missing period_id." }, { status: 400 });
  }

  // Parse CSV
  const { headers, rows } = parseCsv(csv);
  if (rows.length === 0) {
    return Response.json({ error: "CSV is empty or has no data rows." }, { status: 400 });
  }

  // Verifica che gli header attesi ci siano
  const expectedHeaders = Object.keys(CSV_COLUMN_MAP);
  const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return Response.json(
      {
        error: "CSV is missing required Infloww columns.",
        missing_headers: missingHeaders,
        found_headers: headers,
      },
      { status: 400 }
    );
  }

  // Parse ogni riga
  const records = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const parsed = parseCsvRow(rows[i]);
      if (!parsed.employee || !parsed.group) {
        errors.push({ row: i + 2, reason: "Missing employee or group." });
        continue;
      }
      records.push(parsed);
    } catch (e) {
      errors.push({ row: i + 2, reason: String(e?.message || e) });
    }
  }

  // Statistiche
  const massCount = records.filter((r) => r.is_mass).length;
  const eligibleCount = records.length - massCount;
  const byGroup = {};
  for (const r of records) {
    byGroup[r.group] = (byGroup[r.group] || 0) + 1;
  }
  const dates = records.map((r) => r.date_range).filter(Boolean).sort();
  const dateRange = dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null;

  const stats = {
    totalRecords: records.length,
    massCount,
    eligibleCount,
    byGroup,
    dateRange,
    errors,
    period_type,
    period_id,
  };

  // Preview mode: ritorna solo statistiche
  if (mode === "preview") {
    return Response.json({ ...stats, mode: "preview" });
  }

  // Save mode: salva in KV
  if (mode === "save") {
    try {
      const key = `ops_kpi:${period_type}:${period_id}`;
      await kv.set(key, records);
      const timestamp = Date.now();
      await kv.zadd("ops_kpi:imports", {
        score: timestamp,
        member: `${period_type}:${period_id}`,
      });
      return Response.json({
        ...stats,
        mode: "save",
        kv_key: key,
        saved_at: new Date(timestamp).toISOString(),
      });
    } catch (e) {
      console.error("Leaderboard import KV save error:", e);
      return Response.json(
        { error: "Failed to save data to storage.", reason: String(e?.message || e) },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Invalid mode. Use 'preview' or 'save'." }, { status: 400 });
}

/**
 * GET /api/admin/leaderboard-import — lista degli import effettuati.
 */
export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  try {
    const imports = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true, withScores: true })) || [];
    // imports è un array piatto [member, score, member, score...] in modalità withScores
    const list = [];
    for (let i = 0; i < imports.length; i += 2) {
      list.push({
        period: imports[i],
        timestamp: imports[i + 1],
        date: new Date(imports[i + 1]).toISOString(),
      });
    }
    return Response.json({ imports: list });
  } catch (e) {
    return Response.json({ imports: [], error: String(e?.message || e) }, { status: 200 });
  }
}

/**
 * DELETE /api/admin/leaderboard-import?period=monthly:2026-05
 *
 * Rimuove un import: cancella sia l'entry dal registro `ops_kpi:imports`
 * che i dati effettivi `ops_kpi:{type}:{id}`.
 *
 * Capability: SEED (admin-only).
 */
export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  if (!period || !/^(monthly|weekly|quarterly):/.test(period)) {
    return Response.json({ error: "?period=monthly|weekly|quarterly:ID richiesto" }, { status: 400 });
  }

  // period es. "monthly:2026-05" → data key "ops_kpi:monthly:2026-05"
  const [periodType, periodId] = period.split(":");
  const dataKey = `ops_kpi:${periodType}:${periodId}`;

  try {
    // Conta prima per logging
    const data = await kv.get(dataKey);
    const recordCount = Array.isArray(data) ? data.length : 0;

    // 1. Rimuovi dal registro imports
    await kv.zrem("ops_kpi:imports", period);
    // 2. Cancella i dati effettivi
    await kv.del(dataKey);

    return Response.json({
      ok: true,
      removed: period,
      records_deleted: recordCount,
    });
  } catch (e) {
    return Response.json({ error: `Errore eliminazione: ${e?.message || e}` }, { status: 500 });
  }
}
