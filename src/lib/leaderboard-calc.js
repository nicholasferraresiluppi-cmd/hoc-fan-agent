/**
 * HOC Fan Agent — Operational Leaderboard Calculations
 *
 * Funzioni pure per:
 *  - Parsing valori CSV Infloww (currency, percentuale, durata, ecc.)
 *  - Filtro account "Mass" (broadcast) dal calcolo
 *  - Aggregazione per group (team modella)
 *  - Normalizzazione 0-100 con soglie ±25%/±10%/0% sulla media del Group
 *  - Applicazione pesi → Score finale
 *  - Assegnazione tier (Critical/Weak/Average/Good/Strong/Elite)
 */

import {
  KPI_WEIGHTS,
  SCORE_TIERS,
  NORMALIZATION_THRESHOLDS,
  MASS_ACCOUNT_REGEX,
  CSV_COLUMN_MAP,
  DERIVED_KPIS,
} from "./leaderboard-config";

/* ======================================================================
 * VALUE PARSING — converte i raw value Infloww in numeri normalizzati
 * ====================================================================== */

/**
 * Parsa un valore di un export Infloww in base al tipo dichiarato in CSV_COLUMN_MAP.
 * Esempi:
 *   "$88977.92" + currency → 88977.92
 *   "30.34%" + percentage → 0.3034
 *   "11s" + duration → 11
 *   "0min" + duration_minutes → 0
 *   "-" + qualunque → null
 *   "Giulia,Alice,Elisa" + csv_list → ["Giulia", "Alice", "Elisa"]
 *   "2026-02-01 00:00:00 - 2026-02-01 23:59:59" + date_range → "2026-02-01"
 */
export function parseInflowwValue(raw, type) {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (s === "" || s === "-" || s === "n/a" || s.toLowerCase() === "null") return null;

  switch (type) {
    case "string":
      return s;

    case "csv_list":
      // "Giulia,Alice,Elisa(Deleted)" → ["Giulia", "Alice", "Elisa"]
      return s.split(",").map((c) => c.replace(/\(Deleted\)\s*$/i, "").trim()).filter(Boolean);

    case "date_range":
      // "2026-02-01 00:00:00 - 2026-02-01 23:59:59" → "2026-02-01"
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;

    case "integer": {
      const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
      return isNaN(n) ? null : n;
    }

    case "float": {
      const n = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
      return isNaN(n) ? null : n;
    }

    case "currency": {
      // "$88977.92" → 88977.92  |  "$1,335.00" → 1335.00
      const cleaned = String(raw).replace(/[$,€£\s]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }

    case "percentage": {
      // "30.34%" → 0.3034
      const cleaned = String(raw).replace(/[%\s]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n / 100;
    }

    case "duration": {
      // "11s" → 11 (secondi); "1m 30s" → 90
      const str = String(raw).toLowerCase();
      let total = 0;
      const hMatch = str.match(/(\d+)\s*h/);
      const mMatch = str.match(/(\d+)\s*m(?!s)/); // m ma non ms
      const sMatch = str.match(/(\d+)\s*s/);
      if (hMatch) total += parseInt(hMatch[1]) * 3600;
      if (mMatch) total += parseInt(mMatch[1]) * 60;
      if (sMatch) total += parseInt(sMatch[1]);
      return total > 0 ? total : null;
    }

    case "duration_minutes": {
      // "146,00" → 146 (clocked hours formato Sheets) | "0min" → 0 | "5h 30m" → 330
      const str = String(raw).toLowerCase();
      // Caso decimale con virgola: "146,00" o "146.00" → 146 minuti
      if (/^\d+[.,]?\d*$/.test(str.replace(/\s/g, ""))) {
        return parseFloat(str.replace(",", "."));
      }
      let total = 0;
      const hMatch = str.match(/(\d+)\s*h/);
      const mMatch = str.match(/(\d+)\s*m/);
      if (hMatch) total += parseInt(hMatch[1]) * 60;
      if (mMatch) total += parseInt(mMatch[1]);
      return total > 0 ? total : 0;
    }

    default:
      return raw;
  }
}

/**
 * Trasforma una riga raw del CSV (oggetto con header come chiave) in un record
 * normalizzato secondo CSV_COLUMN_MAP. Aggiunge anche i KPI derivati.
 */
export function parseCsvRow(rawRow) {
  const out = {};
  for (const [csvHeader, mapping] of Object.entries(CSV_COLUMN_MAP)) {
    const v = rawRow[csvHeader];
    out[mapping.key] = parseInflowwValue(v, mapping.type);
  }
  // Calcola KPI derivati
  for (const [key, calc] of Object.entries(DERIVED_KPIS)) {
    out[key] = calc(out);
  }
  // Flag account mass
  out.is_mass = isMassAccount(out.employee || "");
  return out;
}

/* ======================================================================
 * MASS ACCOUNT FILTER
 * ====================================================================== */

/**
 * Determina se un nome operatore è un account "mass message" (broadcast)
 * da escludere dal calcolo Score della leaderboard operativa.
 */
export function isMassAccount(employeeName) {
  if (!employeeName || typeof employeeName !== "string") return false;
  return MASS_ACCOUNT_REGEX.test(employeeName);
}

/* ======================================================================
 * AGGREGATION & SCORING
 * ====================================================================== */

/**
 * Aggrega più giorni di dati in un singolo record per (employee, group).
 * Somma le metriche di volume, ricalcola le medie/percentuali.
 *
 * Input: array di record già parsati (output di parseCsvRow), tutti dello
 *        stesso periodo desiderato.
 * Output: array di record aggregati, uno per (employee, group).
 */
export function aggregateByEmployeeGroup(records) {
  const buckets = new Map();
  for (const r of records) {
    const key = `${r.employee}|${r.group}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        employee: r.employee,
        group: r.group,
        email: r.email,
        creators: new Set(),
        is_mass: r.is_mass,
        // Volumi sommabili
        sales: 0,
        ppv_sales: 0,
        tips: 0,
        direct_message_sales: 0,
        direct_messages_sent: 0,
        direct_ppvs_sent: 0,
        ppvs_unlocked: 0,
        fans_chatted: 0,
        fans_who_spent_money: 0,
        character_count: 0,
        clocked_hours_minutes: 0,
        // Per ricalcolo medie pesate
        _golden_sum: 0,
        _unlock_sum: 0,
        _fan_cvr_sum: 0,
        _avg_earnings_sum: 0,
        _days: 0,
      });
    }
    const b = buckets.get(key);
    if (Array.isArray(r.creators)) r.creators.forEach((c) => b.creators.add(c));
    b.sales += r.sales || 0;
    b.ppv_sales += r.ppv_sales || 0;
    b.tips += r.tips || 0;
    b.direct_message_sales += r.direct_message_sales || 0;
    b.direct_messages_sent += r.direct_messages_sent || 0;
    b.direct_ppvs_sent += r.direct_ppvs_sent || 0;
    b.ppvs_unlocked += r.ppvs_unlocked || 0;
    b.fans_chatted += r.fans_chatted || 0;
    b.fans_who_spent_money += r.fans_who_spent_money || 0;
    b.character_count += r.character_count || 0;
    b.clocked_hours_minutes += r.clocked_hours_minutes || 0;
    b._days += 1;
  }
  // Calcola KPI aggregati corretti
  return Array.from(buckets.values()).map((b) => {
    const out = {
      employee: b.employee,
      group: b.group,
      email: b.email,
      creators: Array.from(b.creators),
      is_mass: b.is_mass,
      days: b._days,
      sales: b.sales,
      ppv_sales: b.ppv_sales,
      tips: b.tips,
      direct_message_sales: b.direct_message_sales,
      direct_messages_sent: b.direct_messages_sent,
      direct_ppvs_sent: b.direct_ppvs_sent,
      ppvs_unlocked: b.ppvs_unlocked,
      fans_chatted: b.fans_chatted,
      fans_who_spent_money: b.fans_who_spent_money,
      character_count: b.character_count,
      clocked_hours_minutes: b.clocked_hours_minutes,
    };
    // KPI ricalcolati sull'aggregato
    out.golden_ratio = b.direct_messages_sent > 0 ? b.direct_ppvs_sent / b.direct_messages_sent : 0;
    out.unlock_rate = b.direct_ppvs_sent > 0 ? b.ppvs_unlocked / b.direct_ppvs_sent : 0;
    out.fan_cvr = b.fans_chatted > 0 ? b.fans_who_spent_money / b.fans_chatted : 0;
    out.avg_earnings_per_paying_fan = b.fans_who_spent_money > 0
      ? b.sales / b.fans_who_spent_money
      : 0;
    out.avg_revenue_per_fan = b.fans_chatted > 0 ? b.sales / b.fans_chatted : 0;
    out.avg_length_of_conversation = b.direct_messages_sent > 0
      ? b.character_count / b.direct_messages_sent
      : 0;
    out.input_per_message = out.avg_length_of_conversation;
    out.sales_per_hour = b.clocked_hours_minutes > 0
      ? b.sales / (b.clocked_hours_minutes / 60)
      : 0;
    out.messages_sent_per_hour = b.clocked_hours_minutes > 0
      ? b.direct_messages_sent / (b.clocked_hours_minutes / 60)
      : 0;
    return out;
  });
}

/**
 * Per ogni Group presente nei record, calcola la media di ogni KPI di efficienza.
 * Esclude gli account is_mass dal calcolo (per non sporcare le medie).
 *
 * Output: { groupName: { fan_cvr: 0.085, unlock_rate: 0.42, ... }, ... }
 */
export function calculateGroupAverages(records) {
  const eligible = records.filter((r) => !r.is_mass);
  const byGroup = new Map();
  for (const r of eligible) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const out = {};
  const kpiKeys = [
    "fan_cvr", "unlock_rate", "avg_earnings_per_paying_fan", "golden_ratio",
    "sales_per_hour", "avg_revenue_per_fan", "avg_length_of_conversation",
    "input_per_message", "messages_sent_per_hour",
  ];
  for (const [group, members] of byGroup.entries()) {
    out[group] = {};
    for (const k of kpiKeys) {
      const vals = members.map((m) => m[k]).filter((v) => typeof v === "number" && v > 0);
      out[group][k] = vals.length > 0
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : 0;
    }
  }
  return out;
}

/**
 * Normalizza un valore KPI di un singolo operatore in punti 0-100, dato
 * il valore di riferimento (la media del proprio Group per quel KPI).
 *
 * Soglie applicate: ±25%, ±10%, 0% rispetto alla media. Vedi NORMALIZATION_THRESHOLDS.
 */
export function normalizeKpi(value, mean) {
  if (typeof value !== "number" || value <= 0) return 0;
  if (typeof mean !== "number" || mean <= 0) return 0;
  for (const t of NORMALIZATION_THRESHOLDS) {
    if (value < mean * t.multiplier) return t.score;
  }
  return 100;
}

/**
 * Calcola lo Score finale 0-100 per ogni operatore × group.
 * Usa la media del proprio Group come riferimento.
 */
export function calculateScores(records, mode = "withoutClockIn") {
  const weights = KPI_WEIGHTS[mode];
  if (!weights) {
    throw new Error(`Unknown mode: ${mode}. Use "withClockIn" or "withoutClockIn".`);
  }
  const groupAvg = calculateGroupAverages(records);

  return records.map((r) => {
    if (r.is_mass) {
      return { ...r, score: null, tier: null, _excluded_reason: "mass_account" };
    }
    const groupMeans = groupAvg[r.group];
    if (!groupMeans) {
      return { ...r, score: 0, tier: assignTier(0), _excluded_reason: "no_group_data" };
    }
    let score = 0;
    const points = {};
    for (const [kpi, weight] of Object.entries(weights)) {
      const norm = normalizeKpi(r[kpi], groupMeans[kpi]);
      points[kpi] = norm;
      score += norm * weight;
    }
    score = Math.round(score * 100) / 100;
    return {
      ...r,
      score,
      tier: assignTier(score),
      points_breakdown: points,
    };
  });
}

/**
 * Restituisce il tier (Critical/Weak/Average/Good/Strong/Elite) per uno Score 0-100.
 */
export function assignTier(score) {
  if (typeof score !== "number") return null;
  for (const t of SCORE_TIERS) {
    if (score >= t.min && score <= t.max) return t.label;
  }
  return null;
}

/**
 * Restituisce il color del tier (per UI).
 */
export function tierColor(tierLabel) {
  const t = SCORE_TIERS.find((x) => x.label === tierLabel);
  return t ? t.color : "#6B7080";
}

/**
 * Pipeline completa: dato un array di record giornalieri parsati e un mode,
 * ritorna il ranking finale ordinato per Score discendente.
 *
 * Step:
 *   1. Aggrega per (employee, group) sommando i giorni del periodo
 *   2. Calcola Score per ognuno usando media del Group
 *   3. Ordina per Score desc (mass account in fondo, score=null)
 *   4. Assegna rank 1, 2, 3...
 */
export function buildLeaderboard(rawDailyRecords, mode = "withoutClockIn") {
  const aggregated = aggregateByEmployeeGroup(rawDailyRecords);
  const scored = calculateScores(aggregated, mode);
  // Sort: prima quelli con score (desc), poi i mass account in fondo
  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  // Assegna rank (esclude mass)
  let rank = 1;
  for (const r of scored) {
    if (r.score !== null) {
      r.rank = rank++;
    } else {
      r.rank = null;
    }
  }
  return scored;
}
