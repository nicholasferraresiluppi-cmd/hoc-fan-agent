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
import { getWages } from "@/lib/cp-wages-store";
import { shiftsByCreator, creatorDrops, monthShrink, unmappedSales, dayHoles } from "@/lib/data-health-core";
import { getEndedCreators } from "@/lib/creators-ended";

const monthOffset = (id, n) => {
  const [y, m] = id.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

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

const h0 = (holes) => holes[0]?.median || 0;

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
      const [wagesCur, fees, meta, defaultFee] = await Promise.all([
        getWages(period),
        kv.get("pnl:deal_fees"),
        kv.get("cp:_meta"),
        kv.get("pnl:deal_fee_default"),
      ]);
      // con una fee standard impostata ogni creator ha una fee: niente buco
      if (typeof defaultFee === "number") return [];
      let wages = wagesCur;
      let effPeriod = period;
      if ((!Array.isArray(wages) || wages.length === 0) && meta?.last_sync_period) {
        effPeriod = meta.last_sync_period;
        wages = await getWages(effPeriod);
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
  {
    // Sanità dati (25/09/2026, caso Sparagno): la ricostruzione notturna non è
    // stata pubblicata perché molto più piccola della versione precedente.
    id: "cp-promotion-blocked",
    severity: "critical",
    label: "Sync CP non pubblicata",
    async run() {
      const meta = await kv.get("cp:_meta");
      if (meta?.promotion !== "blocked_shrink") return [];
      return [{
        fingerprint: `cp-promotion-blocked:${meta.last_sync_period}`,
        title: `Sync CreatorsPro di ${meta.last_sync_period} scartata: dati molto più scarsi del solito`,
        detail: `Ricostruite ${meta.staged_count} wage contro ${meta.counts?.wages_normalized} già pubblicate: si continua a mostrare la versione precedente. Probabile errore di scaricamento da CreatorsPro.`,
        value: String(meta.staged_count ?? "?"),
        cta: { href: "/admin/wage-audit", label: "Apri Sync & Audit CP" },
      }];
    },
  },
  {
    id: "cp-month-shrink",
    severity: "critical",
    label: "Mese CP incompleto",
    async run() {
      const cur = currentMonthId();
      const out = [];
      const pairs = [[monthOffset(cur, -1), monthOffset(cur, -2)]];
      if (new Date().getUTCDate() >= 7) pairs.unshift([cur, monthOffset(cur, -1)]);
      for (const [m, prevM] of pairs) {
        const [w, pw] = await Promise.all([getWages(m), getWages(prevM)]);
        const hit = monthShrink({ currentCount: (w || []).length, previousCount: (pw || []).length });
        if (!hit) continue;
        out.push({
          fingerprint: `cp-month-shrink:${m}`,
          title: `${m}: operatori pagati molto meno del mese prima`,
          detail: `${hit.currentCount} wage contro ${hit.previousCount} di ${prevM} (${Math.round(hit.ratio * 100)}%). Di solito è un sync incompleto, non un calo vero: controlla prima di usare i numeri del mese.`,
          value: `${Math.round(hit.ratio * 100)}%`,
          cta: { href: "/admin/wage-audit", label: "Verifica il mese" },
        });
      }
      return out;
    },
  },
  {
    id: "creator-activity-drop",
    severity: "warning",
    label: "Creator con turni crollati",
    async run() {
      const now = new Date();
      const cur = currentMonthId();
      const out = [];
      const checks = [{ m: monthOffset(cur, -1), prevM: monthOffset(cur, -2), isCurrentMonth: false }];
      if (now.getUTCDate() >= 7) checks.unshift({ m: cur, prevM: monthOffset(cur, -1), isCurrentMonth: true });
      for (const c of checks) {
        const [w, pw] = await Promise.all([getWages(c.m), getWages(c.prevM)]);
        if (!w?.length || !pw?.length) continue;
        const [y, mm] = c.m.split("-").map(Number);
        const drops = creatorDrops({
          current: shiftsByCreator(w), previous: shiftsByCreator(pw),
          isCurrentMonth: c.isCurrentMonth, dayOfMonth: now.getUTCDate(), daysInMonth: new Date(Date.UTC(y, mm, 0)).getUTCDate(),
        });
        // creator che hanno smesso (segnate da un admin) prima del mese: calo atteso
        const ended = await getEndedCreators();
        const monthStart = `${c.m}-01`;
        const real = drops.filter((d) => !(ended[d.creator]?.ended_on && ended[d.creator].ended_on < monthStart));
        if (!real.length) continue;
        drops.length = 0; drops.push(...real);
        out.push({
          fingerprint: `creator-activity-drop:${c.m}`,
          title: `${c.m}: ${drops.length} ${drops.length === 1 ? "creator ha" : "creator hanno"} molti meno turni del previsto`,
          detail: drops.slice(0, 6).map((d) => `${d.creator}: ${d.current} turni (attesi ~${d.expected})`).join(" · ") + ". Può essere reale (creator in pausa o che ha smesso: segnala in Alert → Creator terminate) o un buco di dati: guarda prima di usare quei numeri.",
          value: String(drops.length),
          cta: { href: "/leaderboard/creators", label: "Apri Creator" },
        });
      }
      return out;
    },
  },
  {
    // Giorni bucati nei dati CP (set 2026: luglio con 20-26/07 quasi a zero e 5
    // giorni mancanti, invisibile al controllo sul numero di wage). Mese in corso
    // (fino a 2 giorni fa) + i due precedenti.
    id: "cp-day-holes",
    severity: "critical",
    label: "Giorni mancanti nei dati CP",
    async run() {
      const cur = currentMonthId();
      const lastFull = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      const out = [];
      for (const m of [cur, monthOffset(cur, -1), monthOffset(cur, -2)]) {
        const w = await getWages(m);
        if (!w?.length) continue;
        const holes = dayHoles(w, m, { lastFullDay: m === cur ? lastFull : null });
        if (!holes.length) continue;
        out.push({
          fingerprint: `cp-day-holes:${m}`,
          title: `${m}: ${holes.length} ${holes.length === 1 ? "giorno" : "giorni"} con vendite CP quasi a zero`,
          detail: `${holes.slice(0, 8).map((h) => h.day.slice(8)).join(", ")} (sotto il 30% di un giorno tipico, $${h0(holes).toLocaleString("it-IT")}). Quasi sempre è una sincronizzazione incompleta: rilancia il sync del mese prima di usarne i numeri.`,
          value: String(holes.length),
          cta: { href: "/admin/wage-audit", label: "Verifica e ripara il mese" },
        });
      }
      return out;
    },
  },
  {
    // Ricavi agenzia Infloww (Revenue agency, Controllo dati CP) non aggiornati:
    // il sync era solo a bottone ed è rimasto fermo dall'8/07 al 26/09 senza che
    // nessuno se ne accorgesse (le pagine mostravano $0). Ora gira ogni notte:
    // questo controllo dice se la catena si è fermata. Severità per finding.
    id: "infloww-agency-stale",
    severity: "warning",
    label: "Ricavi Infloww non aggiornati",
    async run() {
      const meta = await kv.get("infloww:sync:meta").catch(() => null);
      const age = meta?.last_sync_at ? (Date.now() - meta.last_sync_at) / 86400000 : Infinity;
      if (age <= 3) return [];
      const days = Number.isFinite(age) ? Math.floor(age) : null;
      return [{
        fingerprint: "infloww-agency-stale",
        severity: age > 7 ? "critical" : "warning",
        title: days != null ? `Ricavi Infloww fermi da ${days} giorni` : "Ricavi Infloww mai sincronizzati",
        detail: `Revenue agency e Controllo dati CP leggono una copia dei ricavi Infloww che si aggiorna ogni notte. ${days != null ? `L'ultimo aggiornamento è del ${new Date(meta.last_sync_at).toLocaleDateString("it-IT")}` : "Non risulta nessun aggiornamento"}: finché non riparte quelle pagine mostrano numeri vecchi o a zero.${meta?.failed_creators?.length ? ` Ultimo giro: ${meta.failed_creators.length} creator non scaricate.` : ""}`,
        value: days != null ? `${days}g` : "mai",
        cta: { href: "/admin/infloww-agency", label: "Apri Revenue agency e rilancia" },
      }];
    },
  },
  {
    // Venduto di persone CP non collegate a un operatore: spariscono da tutte
    // le viste performance (set 2026: 168 persone, $126k = 7% del mese, visto
    // solo confrontando i totali di Sales CP / Creator / P&L).
    id: "cp-unmapped-sales",
    severity: "warning",
    label: "Venduto di persone non collegate",
    async run() {
      const cur = currentMonthId();
      const m = new Date().getUTCDate() >= 5 ? cur : monthOffset(cur, -1);
      const [w, mapping] = await Promise.all([getWages(m), kv.get("cp:member_mapping")]);
      if (!w?.length) return [];
      const u = unmappedSales(w, mapping);
      if (u.share < 0.02 && u.unmapped < 5000) return [];
      const pct = Math.round(u.share * 1000) / 10;
      return [{
        fingerprint: `cp-unmapped-sales:${m}`,
        severity: u.share >= 0.05 ? "critical" : "warning",
        title: `${m}: $${Math.round(u.unmapped).toLocaleString("it-IT")} di venduto da ${u.people.length} persone non collegate a un operatore`,
        detail: `${pct}% del venduto del mese non compare in Sales CP, Creator, Action e Coaching Center. I più grandi: ${u.people.slice(0, 5).map((p) => `${p.name} $${Math.round(p.sales).toLocaleString("it-IT")}`).join(" · ")}.`,
        value: `${pct}%`,
        cta: { href: "/admin/creatorspro-sync#collega", label: "Collega le persone" },
      }];
    },
  },
  {
    // Watchdog della catena notturna: dal 20/07 al 25/09/2026 i lavori smistati
    // dal dispatcher prendevano 401 dalla Deployment Protection Vercel e nessuno
    // se n'è accorto (il dispatcher scriveva "kicked"). Qui si guarda la PROVA
    // di esecuzione: il heartbeat dei figli, non l'esito dichiarato dal padre.
    id: "cron-chain-broken",
    severity: "critical",
    label: "Lavori notturni fermi",
    async run() {
      const dispatch = await kv.get("cron:heartbeat:dispatch");
      if (!dispatch?.at) return [];
      const children = ["cp-wages", "payout-ledger", "infloww-agency"];
      const beats = await Promise.all(children.map((c) => kv.get(`cron:heartbeat:${c}`).catch(() => null)));
      const stale = children.filter((c, i) => !beats[i]?.at || Date.now() - beats[i].at > 30 * 3600 * 1000);
      const failed = dispatch.failed_kicks || [];
      if (!stale.length && !failed.length) return [];
      return [{
        fingerprint: "cron-chain-broken",
        title: "Lavori notturni non partiti",
        detail: [stale.length ? `Senza esecuzione da oltre 30h: ${stale.join(", ")}` : null, failed.length ? `Kick falliti: ${failed.join(", ")}` : null].filter(Boolean).join(" · "),
        value: String(stale.length + failed.length),
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
        severity: finding.severity || check.severity,
        lastSeen: now, runCount: (prev.runCount || 1) + 1,
      };
      await kv.set(alertKey(fp), next);
      updated += 1;
    } else {
      // nuovo, o ri-fallito dopo una risoluzione: riparte da open
      const next = {
        fingerprint: fp, checkId: check.id, severity: finding.severity || check.severity,
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
