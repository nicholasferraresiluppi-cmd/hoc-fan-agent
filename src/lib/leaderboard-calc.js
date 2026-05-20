/**
 * HOC Fan Agent — Operational Leaderboard Calculations
 *
 * v10: tutte le funzioni di score accettano settings opzionali
 *      ({ weights, thresholds, tiers }). Se mancano usano i default da config.
 *      Questo permette alla pagina admin di sovrascrivere i pesi/soglie/tier
 *      via KV senza modificare il codice.
 *
 * v11: aggiunto detectLanguage() per ricavare ENG/ITA dal nome del Group,
 *      e supporto a manualExclusions (denylist KV editabile da admin) in
 *      buildLeaderboard / calculateScores.
 */

import {
  KPI_WEIGHTS as DEFAULT_KPI_WEIGHTS,
  SCORE_TIERS as DEFAULT_SCORE_TIERS,
  NORMALIZATION_THRESHOLDS as DEFAULT_NORMALIZATION_THRESHOLDS,
  MASS_ACCOUNT_REGEX,
  LANGUAGE_REGEX,
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
 * LANGUAGE DETECTION — ricava "eng" | "ita" | null dal nome del Group.
 * Convenzione HOC: il nome del Group contiene il marker (es. "Team Bianca ENG").
 * Se cambi la convenzione, modifica LANGUAGE_REGEX in leaderboard-config.js.
 * ====================================================================== */

export function detectLanguage(groupName) {
  if (!groupName || typeof groupName !== "string") return null;
  if (LANGUAGE_REGEX.eng.test(groupName)) return "eng";
  if (LANGUAGE_REGEX.ita.test(groupName)) return "ita";
  return null;
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
      language: detectLanguage(b.group),
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

/**
 * Normalizza in punti 0-100 confrontando con la media del Group.
 * v10: thresholds passati come parametro (default a config).
 */
export function normalizeKpi(value, mean, thresholds = DEFAULT_NORMALIZATION_THRESHOLDS) {
  if (typeof value !== "number" || value <= 0) return 0;
  if (typeof mean !== "number" || mean <= 0) return 0;
  for (const t of thresholds) {
    if (value < mean * t.multiplier) return t.score;
  }
  return 100;
}

/**
 * Calcola Score 0-100 per ogni operatore × group.
 * v10: settings = { weights?, thresholds?, tiers? } sovrascrive i default.
 * v11: manualExclusions = { employeeName: { reason, ... } } marca esclusi manualmente.
 */
export function calculateScores(records, mode = "withoutClockIn", settings = {}, manualExclusions = {}) {
  const weightsByMode = settings.weights || DEFAULT_KPI_WEIGHTS;
  const thresholds = settings.thresholds || DEFAULT_NORMALIZATION_THRESHOLDS;
  const tiers = settings.tiers || DEFAULT_SCORE_TIERS;

  const weights = weightsByMode[mode];
  if (!weights) {
    throw new Error(`Unknown mode: ${mode}. Use "withClockIn" or "withoutClockIn".`);
  }
  const groupAvg = calculateGroupAverages(records);

  const scored = records.map((r) => {
    const manual = r.employee ? manualExclusions[r.employee] : null;
    if (manual) {
      return { ...r, score: null, tier: null, _excluded_reason: manual.reason || "manual", _exclusion_note: manual.note || null };
    }
    if (r.is_mass) {
      return { ...r, score: null, tier: null, _excluded_reason: "mass_account" };
    }
    const groupMeans = groupAvg[r.group];
    if (!groupMeans) {
      return { ...r, score: 0, tier: assignTier(0, tiers), _excluded_reason: "no_group_data" };
    }
    // v11: marca come "inattivo" gli operatori con tutti i KPI di volume a zero.
    // Sono operatori che esistono nei dati ma non hanno operato nel periodo
    // (es. fan_chatted=0 + sales=0 + messaggi=0). Li distinguiamo da chi
    // ha operato ma ha tutti i KPI di efficienza sotto media (score basso ma >0).
    const totalActivity = (r.direct_messages_sent || 0) + (r.fans_chatted || 0) + (r.sales || 0);
    if (totalActivity === 0) {
      return { ...r, score: 0, tier: assignTier(0, tiers), _inactive: true };
    }
    let score = 0;
    const points = {};
    for (const [kpi, weight] of Object.entries(weights)) {
      const norm = normalizeKpi(r[kpi], groupMeans[kpi], thresholds);
      points[kpi] = norm;
      score += norm * weight;
    }
    score = Math.round(score * 100) / 100;
    return {
      ...r,
      score,
      tier: assignTier(score, tiers),
      points_breakdown: points,
      group_means: groupMeans,
    };
  });

  return { scored, groupAverages: groupAvg };
}

/**
 * Tier assignato dato lo score.
 * v10: tiers passati come parametro.
 */
export function assignTier(score, tiers = DEFAULT_SCORE_TIERS) {
  if (typeof score !== "number") return null;
  for (const t of tiers) {
    if (score >= t.min && score <= t.max) return t.label;
  }
  return null;
}

export function tierColor(tierLabel, tiers = DEFAULT_SCORE_TIERS) {
  const t = tiers.find((x) => x.label === tierLabel);
  return t ? t.color : "#6B7080";
}

/**
 * Pipeline completa.
 * v10: settings opzionali — passa { weights, thresholds, tiers } da KV.
 * v11: manualExclusions opzionale — passa { employeeName: { reason, ... } } da KV.
 */
export function buildLeaderboard(rawDailyRecords, mode = "withoutClockIn", settings = {}, manualExclusions = {}) {
  const aggregated = aggregateByEmployeeGroup(rawDailyRecords);
  const { scored, groupAverages } = calculateScores(aggregated, mode, settings, manualExclusions);
  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  let rank = 1;
  for (const r of scored) {
    if (r.score !== null && r.score > 0) {
      r.rank = rank++;
    } else {
      r.rank = null;
    }
  }
  return { ranking: scored, groupAverages };
}
