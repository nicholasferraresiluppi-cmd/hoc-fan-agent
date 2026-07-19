/**
 * Alert operativi — motore check + findings store (ADR: docs/ALERT_OPERATIVI.md).
 *
 * Pattern "issue tracker" (Sentry/Datadog), non notification feed:
 * - ogni alert è un oggetto stateful identificato da un FINGERPRINT
 * - un run che ritrova la stessa condizione AGGIORNA la riga (mai duplicati)
 * - la risoluzione è SOLO automatica: quando il check ripassa l'alert si
 *   chiude da solo — così la lista non può mentire
 * - lo stato (open → ack → resolved) è globale di team, non per-utente
 *
 * Chiavi KV:
 *   ops:alerts:{fingerprint}  oggetto alert (JSON)
 *   ops:alerts:index          SET dei fingerprint
 *   ops:alerts:last_run       esito ultimo run { at, trigger, checks, ... }
 *   ops:alerts:log            LIST eventi append-only (cap 500)
 */
import { kv } from "@vercel/kv";
import { buildOperatorsForCpLeaderboard, hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";
import { loadGroupCategories } from "@/app/api/admin/group-categories/route";
import { loadGroupLanguages } from "@/app/api/admin/group-languages/route";
import { detectLanguage } from "@/lib/leaderboard-calc";

const INDEX_KEY = "ops:alerts:index";
const LAST_RUN_KEY = "ops:alerts:last_run";
const LOG_KEY = "ops:alerts:log";
const LOG_CAP = 500;

// Soglie v1 — versionate qui, non sparse nei check.
// STALE_DAYS 8: cadenza attesa settimanale (import CSV e sync CP), +1 di grazia.
const STALE_DAYS = 8;
// Specchiano il filtro underperformers della leaderboard Sales CP
// (src/app/leaderboard/sales-cp/page.js — score ≤25 = tier Average boundary).
const UNDERPERF_SCORE_MAX = 25;
const UNDERPERF_MIN_SHIFTS = 5;
// fee-config è critical solo se scoperta la maggioranza dei creator del mese.
const FEE_UNCOVERED_CRITICAL = 0.5;
const RESOLVED_RETENTION_MS = 90 * 24 * 3600 * 1000;

const alertKey = (fp) => `ops:alerts:${fp}`;

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const daysAgo = (ts) => Math.floor((Date.now() - ts) / 86400000);

/* ------------------------------------------------------------------ */
/* Check registry — ogni check emette SOLO le condizioni fallite.      */
/* Contratto finding: { fingerprint, title, detail, value, cta }       */
/* ------------------------------------------------------------------ */

const CHECKS = [
  {
    id: "wage-gap",
    severity: "critical",
    label: "Wage mancanti nel sync CP",
    async run() {
      // Stessa fonte del banner storico dell'hub: cp:_meta.gap_check
      // (calcolato da finalizeSync in creatorspro-sync.js).
      const meta = await kv.get("cp:_meta");
      const gap = meta?.gap_check?.gap || 0;
      if (!(gap > 0)) return [];
      return [{
        fingerprint: `wage-gap:${meta.last_sync_period || "unknown"}`,
        title: `Wage mancanti nel sync ${meta.last_sync_period || ""}`.trim(),
        detail: `KV ${meta.gap_check.kv_count} vs CP API live ${meta.gap_check.cp_live_count}`,
        value: String(gap),
        cta: { href: "/admin/wage-audit", label: "Apri Wage Audit" },
      }];
    },
  },
  {
    id: "fee-config",
    severity: "critical",
    label: "Fee % non configurate (P&L)",
    async run() {
      // Stessa aggregazione di /api/admin/pnl-live: creator del mese = alias
      // con sales > 0 nelle wages CP; fee dalla mappa pnl:deal_fees.
      const period = currentMonthId();
      const [wagesCur, fees, meta] = await Promise.all([
        kv.get(`cp:wages:${period}`),
        kv.get("pnl:deal_fees"),
        kv.get("cp:_meta"),
      ]);
      let wages = wagesCur;
      let effPeriod = period;
      if ((!Array.isArray(wages) || wages.length === 0) && meta?.last_sync_period) {
        effPeriod = meta.last_sync_period;
        wages = await kv.get(`cp:wages:${effPeriod}`);
      }
      if (!Array.isArray(wages) || wages.length === 0) return [];
      const feeMap = fees && typeof fees === "object" ? fees : {};
      const salesByAlias = new Map();
      for (const w of wages) {
        for (const s of w.shifts || []) {
          // stessa logica per-shift di pnl-live: takes con alias, altrimenti
          // fallback sul totale shift se mono-creator
          const shiftSales = new Map();
          for (const t of s.takes || []) {
            if (!t.creator_alias) continue;
            shiftSales.set(t.creator_alias, (shiftSales.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
          }
          const aliasList = s.creator_aliases || [];
          if (shiftSales.size === 0 && aliasList.length <= 1 && aliasList[0]) {
            shiftSales.set(aliasList[0], Number(s.total_attributed) || 0);
          }
          for (const [a, v] of shiftSales.entries()) {
            salesByAlias.set(a, (salesByAlias.get(a) || 0) + v);
          }
        }
      }
      const aliases = [...salesByAlias.entries()].filter(([, v]) => v > 0).map(([a]) => a);
      if (aliases.length === 0) return [];
      const withFee = aliases.filter((a) => typeof feeMap[a] === "number").length;
      const uncovered = (aliases.length - withFee) / aliases.length;
      if (uncovered <= FEE_UNCOVERED_CRITICAL) return [];
      return [{
        fingerprint: "fee-config",
        title: "Fee % non configurate: P&L senza margine",
        detail: `${effPeriod} · margine calcolabile solo per i creator con fee impostata`,
        value: `${withFee}/${aliases.length} creator`,
        cta: { href: "/admin/pnl-live", label: "Apri P&L Live" },
      }];
    },
  },
  {
    id: "infloww-import-stale",
    severity: "warning",
    label: "Import Infloww fermo",
    async run() {
      const last = (await kv.zrange("ops_kpi:imports", 0, 0, { rev: true, withScores: true })) || [];
      // formato [member, score] — score = timestamp import (ms)
      const ts = Number(last[1]) || 0;
      if (!ts) return [];
      const age = daysAgo(ts);
      if (age < STALE_DAYS) return [];
      return [{
        fingerprint: "infloww-import-stale",
        title: "Import Infloww fermo",
        detail: `Ultimo import: ${String(last[0])}`,
        value: `${age} giorni fa`,
        cta: { href: "/admin/leaderboard-import", label: "Carica file" },
      }];
    },
  },
  {
    id: "underperformers",
    severity: "warning",
    label: "Operatori sotto soglia",
    async run() {
      // Replica del filtro della leaderboard Sales CP (stesso build + stesse
      // decorazioni, perché lo score v3 è percentile-based sulla coorte).
      const period = currentMonthId();
      if (!(await hasCpDataForPeriod(period))) return [];
      const [operatorsRaw, categories, langOverrides, manualExclusions] = await Promise.all([
        buildOperatorsForCpLeaderboard(period),
        loadGroupCategories(),
        loadGroupLanguages(),
        kv.get("leaderboard:exclusions"),
      ]);
      const exclusions = manualExclusions || {};
      const decorated = operatorsRaw
        .filter((op) => !exclusions[op.employee])
        .map((op) => {
          const lang = langOverrides?.[op.group] || detectLanguage(op.group);
          return { ...op, category: categories?.[op.group] || null, language: lang || null };
        });
      const { ranking } = await buildCpLeaderboard(decorated, period);
      const count = ranking.filter(
        (r) => r.score !== null && r.score > 0 && r.score <= UNDERPERF_SCORE_MAX
          && (r.cp_aggregates?.total_shifts || 0) >= UNDERPERF_MIN_SHIFTS
      ).length;
      if (count === 0) return [];
      return [{
        fingerprint: `underperformers:${period}`,
        title: "Operatori sotto soglia questo mese",
        detail: `Score CP v3 ≤ ${UNDERPERF_SCORE_MAX} con ≥ ${UNDERPERF_MIN_SHIFTS} shift`,
        value: String(count),
        cta: { href: "/admin/action-center", label: "Apri Action Center" },
      }];
    },
  },
  {
    id: "cp-sync-stale",
    severity: "warning",
    label: "Sync CP obsoleto",
    async run() {
      const meta = await kv.get("cp:_meta");
      const ts = meta?.last_sync_at || 0;
      if (!ts) return [];
      const age = daysAgo(ts);
      if (age < STALE_DAYS) return [];
      return [{
        fingerprint: "cp-sync-stale",
        title: "Sync CreatorsPro obsoleto",
        detail: `Ultimo sync: ${meta.last_sync_period || "?"}`,
        value: `${age} giorni fa`,
        cta: { href: "/admin/creatorspro-sync", label: "Apri sync CP" },
      }];
    },
  },
];

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

async function logEvent(action, fingerprint, meta = {}) {
  try {
    await kv.lpush(LOG_KEY, JSON.stringify({ action, fingerprint, at: Date.now(), meta }));
    await kv.ltrim(LOG_KEY, 0, LOG_CAP - 1);
  } catch (err) {
    console.error("ops-alerts log failed:", err?.message || err);
  }
}

export async function listAlerts() {
  const fps = (await kv.smembers(INDEX_KEY)) || [];
  if (fps.length === 0) return { alerts: [], last_run: await kv.get(LAST_RUN_KEY) };
  const raw = await kv.mget(...fps.map(alertKey));
  const alerts = raw.filter(Boolean);
  const sevRank = (a) => (a.severity === "critical" ? 0 : 1);
  const stRank = (a) => (a.status === "resolved" ? 1 : 0);
  alerts.sort((a, b) =>
    stRank(a) - stRank(b) || sevRank(a) - sevRank(b) || (b.lastSeen || 0) - (a.lastSeen || 0)
  );
  return { alerts, last_run: await kv.get(LAST_RUN_KEY) };
}

export async function ackAlert(fingerprint, { userId, name } = {}) {
  const alert = await kv.get(alertKey(fingerprint));
  if (!alert) return { ok: false, status: 404, message: "Alert non trovato" };
  if (alert.status !== "open") return { ok: false, status: 409, message: `Alert in stato ${alert.status}` };
  alert.status = "ack";
  alert.ackBy = name || userId || "?";
  alert.ackByUserId = userId || null;
  alert.ackAt = Date.now();
  await kv.set(alertKey(fingerprint), alert);
  await logEvent("acked", fingerprint, { by: alert.ackBy, userId });
  return { ok: true, alert };
}

/**
 * Esegue tutti i check e riconcilia lo store.
 * - condizione fallita e alert assente  → crea (open)
 * - condizione fallita e alert presente → aggiorna lastSeen/runCount/value
 * - alert aperto/ack il cui check è girato SENZA errori e non l'ha ri-emesso
 *   → auto-resolve (se il check è andato in errore NON risolve: assenza di
 *   segnale non è segnale di rientro)
 * - resolved più vecchi di 90 giorni → prune
 */
export async function runChecks({ trigger = "cron" } = {}) {
  const now = Date.now();
  const emitted = new Map(); // fingerprint → { finding, check }
  const checkResults = [];

  for (const check of CHECKS) {
    try {
      const findings = await check.run();
      for (const f of findings) emitted.set(f.fingerprint, { finding: f, check });
      checkResults.push({ id: check.id, ok: true, found: findings.length });
    } catch (err) {
      console.error(`ops-alerts check ${check.id} failed:`, err?.message || err);
      checkResults.push({ id: check.id, ok: false, error: String(err?.message || err) });
    }
  }
  const okCheckIds = new Set(checkResults.filter((c) => c.ok).map((c) => c.id));

  const fps = (await kv.smembers(INDEX_KEY)) || [];
  const existing = new Map();
  if (fps.length > 0) {
    const raw = await kv.mget(...fps.map(alertKey));
    fps.forEach((fp, i) => { if (raw[i]) existing.set(fp, raw[i]); });
  }

  let opened = 0, updated = 0, resolved = 0, pruned = 0;

  // upsert dei finding emessi
  for (const [fp, { finding, check }] of emitted.entries()) {
    const prev = existing.get(fp);
    if (prev && prev.status !== "resolved") {
      const next = {
        ...prev,
        title: finding.title, detail: finding.detail, value: finding.value, cta: finding.cta,
        lastSeen: now, runCount: (prev.runCount || 1) + 1,
      };
      await kv.set(alertKey(fp), next);
      updated += 1;
    } else {
      // nuovo, o ri-fallito dopo una risoluzione: riparte da open
      const next = {
        fingerprint: fp, checkId: check.id, severity: check.severity,
        title: finding.title, detail: finding.detail, value: finding.value, cta: finding.cta,
        status: "open", firstSeen: now, lastSeen: now, runCount: 1,
        ackBy: null, ackByUserId: null, ackAt: null, resolvedAt: null,
      };
      await kv.set(alertKey(fp), next);
      await kv.sadd(INDEX_KEY, fp);
      await logEvent(prev ? "reopened" : "created", fp, { value: finding.value });
      opened += 1;
    }
  }

  // auto-resolve + prune
  for (const [fp, alert] of existing.entries()) {
    if (alert.status === "resolved") {
      if ((alert.resolvedAt || 0) < now - RESOLVED_RETENTION_MS) {
        await kv.del(alertKey(fp));
        await kv.srem(INDEX_KEY, fp);
        pruned += 1;
      }
      continue;
    }
    if (!emitted.has(fp) && okCheckIds.has(alert.checkId)) {
      const next = { ...alert, status: "resolved", resolvedAt: now };
      await kv.set(alertKey(fp), next);
      await logEvent("resolved", fp, { after_runs: alert.runCount || 1 });
      resolved += 1;
    }
  }

  const summary = { at: now, trigger, checks: checkResults, opened, updated, resolved, pruned };
  await kv.set(LAST_RUN_KEY, summary);
  return summary;
}
