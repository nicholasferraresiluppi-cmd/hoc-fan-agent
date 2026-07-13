import { kv } from "@vercel/kv";
import { fetchIntervals, fetchTimelineEvents, fetchWages, fetchWageDetail } from "./creatorspro-api";

/**
 * CM Cockpit (Fase 2a career ladder) — lib server-side.
 *
 * Due sorgenti dati (validate coi probe di lug 2026):
 *  - TIMELINE (`/v1/timeline/events`): struttura LIVE — turni programmati per
 *    creator con membro, paymentProfile (nome+cosellersCount) e check-in reali
 *    (checkin.endedAt null finché l'operatore lavora).
 *  - WAGE TAKES: i soldi — ingestione a BATCH lato CP (delta acquisto→wage
 *    mediana ~18 min, recupero a fine turno). Ogni vista che mostra venduto
 *    dichiara il timestamp dell'ultimo pull.
 *
 * KV:
 *  - `cm:sup:{id}`            → supervisione {id, cm_user_id, cm_name, window, operators[], status, opened_at, closed_at}
 *  - `cm:sup:active:{userId}` → id supervisione aperta del CM
 *  - `cm:sup:index`           → ZSET (member=id, score=opened_at ms) per storico/coverage
 *  - `cm:roster:{from}:{to}`  → cache roster timeline (60s)
 *  - `cm:thresholds:v1`       → cache bande+soglie dal mese wage più recente (6h)
 */

const ROSTER_TTL = 60;
const THRESHOLDS_TTL = 6 * 3600;
const TIMELINE_CONCURRENCY = 6;
const OVERRIDE_PCT = 0.03; // shadow — % proposta §10.3, da confermare board

/* ============================================================
 * Creator ids — da cp:intervals (refdata sync), fallback live
 * ============================================================ */

export async function getCreatorIds() {
  let intervals = await kv.get("cp:intervals");
  if (!Array.isArray(intervals) || intervals.length === 0) {
    try {
      intervals = await fetchIntervals();
    } catch {
      intervals = [];
    }
  }
  const ids = new Set();
  for (const itv of intervals || []) {
    for (const c of itv?.creators || []) {
      if (c?.creatorId != null) ids.add(String(c.creatorId));
    }
  }
  if (ids.size > 0) return [...ids];

  // Fallback: creator visti nei take del mese wage più recente in KV
  const { wages } = await latestWageMonth();
  for (const w of wages || []) {
    for (const s of w.shifts || []) {
      for (const t of s.takes || []) {
        if (t.creator_id != null) ids.add(String(t.creator_id));
      }
    }
  }
  return [...ids];
}

/* ============================================================
 * Roster timeline — chi è programmato/in turno nella finestra
 * ============================================================ */

export async function getTimelineRoster({ startedAt, endedAt }) {
  const cacheKey = `cm:roster:${startedAt}:${endedAt}`;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  const ids = await getCreatorIds();
  const rows = [];
  for (let i = 0; i < ids.length; i += TIMELINE_CONCURRENCY) {
    const chunk = ids.slice(i, i + TIMELINE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (creatorId) => {
        try {
          return await fetchTimelineEvents({ creatorId, startedAt, endedAt });
        } catch {
          return [];
        }
      })
    );
    for (const events of results) {
      for (const ev of events || []) {
        const sh = ev?.shift;
        if (!sh?.member) continue; // slot senza assegnazione
        const checkins = Array.isArray(sh.checkin) ? sh.checkin : [];
        const last = checkins.length ? checkins[checkins.length - 1] : null;
        const cid = ev?.creators?.[0]?.creator?.id != null ? String(ev.creators[0].creator.id) : null;
        // Durata slot dal template interval del creator: le fasce dipendono
        // dal mercato (ITA 5h, ENG 6h) — mai assumere una durata fissa.
        const tpl = (ev?.interval?.creators || []).find((c) => String(c?.creatorId) === cid);
        let slotHours = null;
        let slotEndedAt = null;
        if (tpl?.startedAt && tpl?.endedAt) {
          const durMs = Date.parse(tpl.endedAt) - Date.parse(tpl.startedAt);
          if (durMs > 0 && durMs <= 24 * 3600 * 1000) {
            slotHours = Math.round(durMs / 360000) / 10;
            const startMs = Date.parse(ev.startedAt);
            if (startMs) slotEndedAt = new Date(startMs + durMs).toISOString();
          }
        }
        rows.push({
          event_id: ev.id,
          shift_id: sh.id,
          started_at: ev.startedAt,
          slot_ended_at: slotEndedAt,
          slot_hours: slotHours,
          interval: ev?.interval?.name || null,
          creator_id: cid,
          creator_alias: ev?.creators?.[0]?.creator?.alias || null,
          member_id: sh.member.id,
          member_name: `${sh.member.firstName || ""} ${sh.member.lastName || ""}`.trim(),
          payment_profile: sh.paymentProfile
            ? { id: sh.paymentProfile.id, name: sh.paymentProfile.name, cosellers_count: sh.paymentProfile.cosellersCount ?? null }
            : null,
          checkin: last ? { started_at: last.startedAt, ended_at: last.endedAt || null } : null,
        });
      }
    }
  }
  rows.sort((a, b) => (a.creator_alias || "").localeCompare(b.creator_alias || ""));
  await kv.set(cacheKey, rows, { ex: ROSTER_TTL });
  return rows;
}

/* ============================================================
 * Bande + soglie — stessa pipeline di threshold-study, dal mese
 * wage più recente in KV (mid = P50, top = P77, round $25)
 * ============================================================ */

function percentile(sortedVals, p) {
  if (sortedVals.length === 0) return null;
  const idx = Math.min(sortedVals.length - 1, Math.max(0, Math.ceil((p / 100) * sortedVals.length) - 1));
  return sortedVals[idx];
}
const round25 = (v) => (v == null ? null : Math.round(v / 25) * 25);

const BANDS = [
  { key: "30k", min: 15000, max: 40000 },
  { key: "50k", min: 40000, max: 62500 },
  { key: "75k", min: 62500, max: 87500 },
  { key: "100k", min: 87500, max: 112500 },
  { key: "125k", min: 112500, max: 137500 },
  { key: "150k", min: 137500, max: Infinity },
];

async function latestWageMonth() {
  const now = new Date();
  for (let back = 0; back < 8; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const pid = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const wages = await kv.get(`cp:wages:${pid}`);
    if (Array.isArray(wages) && wages.length > 0) return { period_id: pid, wages };
  }
  return { period_id: null, wages: [] };
}

export async function getThresholds() {
  const cached = await kv.get("cm:thresholds:v1");
  if (cached) return cached;

  const { period_id, wages } = await latestWageMonth();
  const aliasSales = new Map();
  const aliasShifts = new Map();
  for (const w of wages) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const isMono = aliases.length <= 1;
      for (const t of takes) {
        if (!t.creator_alias) continue;
        aliasSales.set(t.creator_alias, (aliasSales.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      if (takes.length === 0 && isMono && aliases[0]) {
        aliasSales.set(aliases[0], (aliasSales.get(aliases[0]) || 0) + salesTotal);
      }
      if (!isMono || !aliases[0]) continue;
      const pp = s.payment_profile;
      const cls = pp?.cosellers_count ?? (pp?.name ? (parseInt(pp.name, 10) || 1) : 1);
      if (!aliasShifts.has(aliases[0])) aliasShifts.set(aliases[0], []);
      aliasShifts.get(aliases[0]).push({ cls: Math.min(Math.max(cls, 1), 4), total: salesTotal });
    }
  }

  const aliasBand = {};
  for (const [alias, sales] of aliasSales.entries()) {
    if (sales < 15000) continue; // micro: fuori modello
    const band = BANDS.find((b) => sales >= b.min && sales < b.max)?.key || "150k";
    aliasBand[alias] = band;
  }

  const dist = new Map();
  for (const [alias, shifts] of aliasShifts.entries()) {
    const band = aliasBand[alias];
    if (!band) continue;
    for (const sh of shifts) {
      if (sh.total <= 0) continue;
      const key = `${band}|${sh.cls}`;
      if (!dist.has(key)) dist.set(key, []);
      dist.get(key).push(sh.total);
    }
  }
  const thresholds = {};
  for (const [key, vals] of dist.entries()) {
    const sorted = [...vals].sort((a, b) => a - b);
    thresholds[key] = { mid: round25(percentile(sorted, 50)), top: round25(percentile(sorted, 77)), shifts: sorted.length };
  }

  const out = { period_id, alias_band: aliasBand, thresholds };
  await kv.set("cm:thresholds:v1", out, { ex: THRESHOLDS_TTL });
  return out;
}

export function thresholdsFor(thr, creatorAlias, cosellersCount) {
  const band = thr?.alias_band?.[creatorAlias];
  if (!band) return null;
  const cls = Math.min(Math.max(cosellersCount || 1, 1), 4);
  return thr?.thresholds?.[`${band}|${cls}`] ? { band, cls, ...thr.thresholds[`${band}|${cls}`] } : { band, cls, mid: null, top: null };
}

/* ============================================================
 * Supervisioni — CRUD su KV
 * ============================================================ */

export async function getActiveSupervision(userId) {
  const id = await kv.get(`cm:sup:active:${userId}`);
  if (!id) return null;
  const sup = await kv.get(`cm:sup:${id}`);
  if (!sup || sup.status !== "open") {
    await kv.del(`cm:sup:active:${userId}`);
    return null;
  }
  return sup;
}

export async function openSupervision({ userId, cmName, window, operators }) {
  const existing = await getActiveSupervision(userId);
  if (existing) throw new Error("Hai già un turno di supervisione aperto. Chiudilo prima di aprirne un altro.");
  if (!Array.isArray(operators) || operators.length === 0) throw new Error("Seleziona almeno un operatore.");
  const openedAt = new Date().toISOString();
  const id = `${openedAt.slice(0, 10).replace(/-/g, "")}:${userId}:${openedAt.slice(11, 16).replace(":", "")}`;
  const sup = {
    id,
    cm_user_id: userId,
    cm_name: cmName || null,
    window, // { startedAt, endedAt }
    operators, // [{member_id, member_name, creator_id, creator_alias, shift_id, payment_profile, off_schedule}]
    status: "open",
    opened_at: openedAt,
    closed_at: null,
  };
  await kv.set(`cm:sup:${id}`, sup, { ex: 72 * 3600 });
  await kv.set(`cm:sup:active:${userId}`, id, { ex: 24 * 3600 });
  await kv.zadd("cm:sup:index", { score: Date.now(), member: id });
  return sup;
}

export async function closeSupervision({ userId, summary }) {
  const sup = await getActiveSupervision(userId);
  if (!sup) throw new Error("Nessun turno di supervisione aperto.");
  sup.status = "closed";
  sup.closed_at = new Date().toISOString();
  if (summary) sup.summary = summary; // snapshot venduto/override alla chiusura
  await kv.set(`cm:sup:${sup.id}`, sup, { ex: 90 * 24 * 3600 });
  await kv.del(`cm:sup:active:${userId}`);
  return sup;
}

/* ============================================================
 * Vista live — per gli operatori supervisionati: venduto turno
 * vs soglie + feed take + check profilo (timeline)
 * ============================================================ */

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = Date.parse(aStart) || 0;
  const ae = aEnd ? Date.parse(aEnd) : Infinity;
  const bs = Date.parse(bStart) || 0;
  const be = bEnd ? Date.parse(bEnd) : Infinity;
  return as < be && bs < ae;
}

async function operatorLive(op, window, thr) {
  const base = {
    ...op,
    venduto: null,
    takes: [],
    thresholds: null,
    excess: 0,
    wage_shift_found: false,
  };
  if (op.off_schedule || !op.member_id) return base; // fuori programma: niente pull CP

  try {
    const list = await fetchWages({ ...currentMonthRange(), page: 1, limit: 5, memberId: op.member_id });
    const stub = (list?.data || [])[0];
    if (!stub) return base;
    const detail = await fetchWageDetail(stub?.info?.id ?? stub?.id);
    // turno wage che interseca la finestra di supervisione, stesso creator se noto
    const shifts = (detail?.shifts || []).filter((s) => overlaps(s.startedAt, s.endedAt, window.startedAt, window.endedAt));
    const match =
      shifts.find((s) => (s.associatedCreators || []).some((c) => String(c.id) === String(op.creator_id))) || shifts[0];
    if (!match) return base;

    const takes = (Array.isArray(match.takes) ? match.takes : [])
      .map((t) => {
        const tx = t.transaction || null;
        return {
          amount: tx ? Number(tx.amount) || 0 : Number(t.amount) || 0,
          type: tx?.type || t.type || null,
          created_at: t.createdAt || null,
          transaction_at: tx?.createdAt || null,
        };
      })
      .filter((t) => t.amount > 0)
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));

    const venduto = Number(match.totalAttributed) || takes.reduce((s, t) => s + t.amount, 0);
    const cls = op.payment_profile?.cosellers_count ?? null;
    const thresholds = op.creator_alias ? thresholdsFor(thr, op.creator_alias, cls) : null;
    const excess = thresholds?.top != null ? Math.max(0, venduto - thresholds.top) : 0;

    return { ...base, venduto, takes: takes.slice(0, 10), thresholds, excess, wage_shift_found: true };
  } catch {
    return base;
  }
}

export async function getLiveView(sup) {
  const thr = await getThresholds();
  const pulledAt = new Date().toISOString();

  // 1. Venduto/take per operatore (pull mirato CP, sequenziale a coppie)
  const ops = [];
  for (let i = 0; i < sup.operators.length; i += 2) {
    const chunk = sup.operators.slice(i, i + 2);
    const rows = await Promise.all(chunk.map((op) => operatorLive(op, sup.window, thr)));
    ops.push(...rows);
  }

  // 2. Check-in + coerenza profilo dalla timeline (roster della finestra)
  let roster = [];
  try {
    roster = await getTimelineRoster({ startedAt: sup.window.startedAt, endedAt: sup.window.endedAt });
  } catch {
    roster = [];
  }
  const byShift = new Map(roster.map((r) => [r.shift_id, r]));
  const activeByCreator = new Map();
  for (const r of roster) {
    if (r.checkin && !r.checkin.ended_at && r.creator_id) {
      activeByCreator.set(r.creator_id, (activeByCreator.get(r.creator_id) || 0) + 1);
    }
  }
  for (const op of ops) {
    const t = op.shift_id ? byShift.get(op.shift_id) : null;
    op.checkin = t?.checkin || null;
    const declared = op.payment_profile?.cosellers_count ?? null;
    const actual = op.creator_id ? activeByCreator.get(String(op.creator_id)) || null : null;
    op.profile_mismatch =
      declared != null && actual != null && actual !== declared
        ? { declared, actual }
        : null;
  }

  // 3. Override shadow (§10.3: % dell'eccedenza sopra soglia top)
  const excessTotal = ops.reduce((s, o) => s + (o.excess || 0), 0);
  return {
    supervision: sup,
    pulled_at: pulledAt,
    thresholds_period: thr.period_id,
    operators: ops,
    earnings: {
      fixed_eur: 28,
      override_pct: OVERRIDE_PCT * 100,
      excess_total: Math.round(excessTotal * 100) / 100,
      override_shadow_usd: Math.round(excessTotal * OVERRIDE_PCT * 100) / 100,
      shadow: true,
    },
  };
}
