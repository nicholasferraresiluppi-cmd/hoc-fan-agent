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
 *
 * v9: buildLeaderboard ora ritorna { ranking, groupAverages } così la UI
 *     può mostrare la media del Group accanto al KPI dell'operatore.
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

export function parseInflowwValue(raw, type) {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (s === "" || s === "-" || s === "n/a" || s.toLowerCase() === "null") return null;

  switch (type) {
    case "string":
      return s;

    case "csv_list":
      return s.split(",").map((c) => c.replace(/\(Deleted\)\s*$/i, "").trim()).filter(Boolean);

    case "date_range": {
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    }

    case "integer": {
      const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
      return isNaN(n) ? null : n;
    }

    case "float": {
      const n = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
      return isNaN(n) ? null : n;
    }

    case "currency": {
      const cleaned = String(raw).replace(/[$,€£\s]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }

    case "percentage": {
      const cleaned = String(raw).replace(/[%\s]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n / 100;
    }

    case "duration": {
      const str = String(raw).toLowerCase();
      let total = 0;
      const hMatch = str.match(/(\d+)\s*h/);
      const mMatch = str.match(/(\d+)\s*m(?!s)/);
      const sMatch = str.match(/(\d+)\s*s/);
      if (hMatch) total += parseInt(hMatch[1]) * 3600;
      if (mMatch) total += parseInt(mMatch[1]) * 60;
      if (sMatch) total += parseInt(sMatch[1]);
      return total > 0 ? total : null;
    }

    case "duration_minutes": {
      const str = String(raw).toLowerCase();
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

export function parseCsvRow(rawRow) {
  const out = {};
  for (const [csvHeader, mapping] of Object.entries(CSV_COLUMN_MAP)) {
    const v = rawRow[csvHeader];
    out[mapping.key] = parseInflowwValue(v, mapping.type);
  }
  for (const [key, calc] of Object.entries(DERIVED_KPIS)) {
    out[key] = calc(out);
  }
  out.is_mass = isMassAccount(out.employee || "");
  return out;
}

/* ======================================================================
 * MASS ACCOUNT FILTER
 * ====================================================================== */

export function isMassAccount(employeeName) {
  if (!employeeName || typeof employeeName !== "string") return false;
  return MASS_ACCOUNT_REGEX.test(employeeName);
}

/* ======================================================================
 * AGGREGATION & SCORING
 * ====================================================================== */

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
    out.golden_ratio = b.direct_messages_sent > 0 ? b.direct_ppvs_sent / b.direct_messages_sent : 0;
    out.unlock_rate = b.direct_ppvs_sent > 0 ? b.ppvs_unlocked / b.direct_ppvs_sent : 0;
    out.fan_cvr = b.fans_chatted > 0 ? b.fans_who_spent_money / b.fans_chatted : 0;
    out.avg_earnings_per_paying_fan = b.fans_who_spent_money > 0 ? b.sales / b.fans_who_spent_money : 0;
    out.avg_revenue_per_fan = b.fans_chatted > 0 ? b.sales / b.fans_chatted : 0;
    out.avg_length_of_conversation = b.direct_messages_sent > 0 ? b.character_count / b.direct_messages_sent : 0;
    out.input_per_message = out.avg_length_of_conversation;
    out.sales_per_hour = b.clocked_hours_minutes > 0 ? b.sales / (b.clocked_hours_minutes / 60) : 0;
    out.messages_sent_per_hour = b.clocked_hours_minutes > 0 ? b.direct_messages_sent / (b.clocked_hours_minutes / 60) : 0;
    return out;
  });
}

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
    out[group] = { _count: members.length };
    for (const k of kpiKeys) {
      const vals = members.map((m) => m[k]).filter((v) => typeof v === "number" && v > 0);
      out[group][k] = vals.length > 0
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : 0;
    }
  }
  return out;
}

export function normalizeKpi(value, mean) {
  if (typeof value !== "number" || value <= 0) return 0;
  if (typeof mean !== "number" || mean <= 0) return 0;
  for (const t of NORMALIZATION_THRESHOLDS) {
    if (value < mean * t.multiplier) return t.score;
  }
  return 100;
}

export function calculateScores(records, mode = "withoutClockIn") {
  const weights = KPI_WEIGHTS[mode];
  if (!weights) {
    throw new Error(`Unknown mode: ${mode}. Use "withClockIn" or "withoutClockIn".`);
  }
  const groupAvg = calculateGroupAverages(records);

  const scored = records.map((r) => {
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
      group_means: groupMeans,
    };
  });

  return { scored, groupAverages: groupAvg };
}

export function assignTier(score) {
  if (typeof score !== "number") return null;
  for (const t of SCORE_TIERS) {
    if (score >= t.min && score <= t.max) return t.label;
  }
  return null;
}

export function tierColor(tierLabel) {
  const t = SCORE_TIERS.find((x) => x.label === tierLabel);
  return t ? t.color : "#6B7080";
}

/**
 * Pipeline completa.
 * v9: ritorna { ranking, groupAverages } invece del solo array.
 */
export function buildLeaderboard(rawDailyRecords, mode = "withoutClockIn") {
  const aggregated = aggregateByEmployeeGroup(rawDailyRecords);
  const { scored, groupAverages } = calculateScores(aggregated, mode);
  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  let rank = 1;
  for (const r of scored) {
    if (r.score !== null) {
      r.rank = rank++;
    } else {
      r.rank = null;
    }
  }
  return { ranking: scored, groupAverages };
}
