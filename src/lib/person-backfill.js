/**
 * HOC Pro — Backfill dell'event-store persona dai dati esistenti.
 *
 * Trasforma i dati già in HOC Pro nella timeline persona (`person:*`). Nessun
 * dato inventato: solo ciò che esiste diventa evento. Ri-eseguibile (dedup
 * idempotente per id deterministico, vedi person-store). Decisione backfill =
 * TUTTE le fonti (ADR §8): employee_profile, certifications, qa-reviews,
 * coaching-sessions, disputes, action_center.
 *
 * Identità: personId = employeeId Infloww. I nomi non risolti nel roster NON
 * vengono scritti con id inventato — finiscono nel report `unresolved`.
 */
import { kv } from "@vercel/kv";
import { buildRosterIndex, resolveByName, writePersonEvents } from "./person-store";

const CERT_TIER = { 1: "base", 2: "expert", 3: "master" };
const ZCAP = 8000; // tetto difensivo per gli indici globali

function dateToMs(s) {
  if (!s) return null;
  const str = String(s);
  const t = Date.parse(str.length <= 10 ? `${str}T12:00:00Z` : str);
  return Number.isFinite(t) ? t : null;
}

/** Ultimi n mesi come "YYYY-MM" (per gli indici keyed-by-period senza indice). */
function recentPeriods(n = 18) {
  const now = new Date();
  const out = [];
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m--; if (m < 1) { m = 12; y--; }
  }
  return out;
}

// zrange withScores → coppie {member, score} robuste al formato flat.
function parseScored(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  if (raw.length && typeof raw[0] === "object" && raw[0] !== null && "member" in raw[0]) {
    for (const x of raw) out.push({ member: String(x.member), score: Number(x.score) });
    return out;
  }
  for (let i = 0; i < raw.length; i += 2) out.push({ member: String(raw[i]), score: Number(raw[i + 1]) });
  return out;
}

/**
 * Raccoglie tutti gli eventi dalle fonti. Ritorna { perPerson, unresolved,
 * bySource } senza scrivere nulla.
 */
export async function collectEvents() {
  const roster = await buildRosterIndex();
  const perPerson = new Map();     // employeeId → { name, events: [] }
  const unresolved = new Map();    // nameNorm → { name, count }
  const bySource = {};
  const bump = (s, k = 1) => { bySource[s] = (bySource[s] || 0) + k; };

  const push = (employeeId, name, ev, src) => {
    if (!employeeId) {
      const key = String(name || "?");
      const u = unresolved.get(key) || { name: key, count: 0 };
      u.count++; unresolved.set(key, u);
      return;
    }
    if (!perPerson.has(employeeId)) perPerson.set(employeeId, { name, events: [] });
    perPerson.get(employeeId).events.push(ev);
    bump(src);
  };

  // 1. employee_profile → hire + note
  const names = (await kv.smembers("employee_profile:_index")) || [];
  const profiles = names.length ? await kv.mget(...names.map((n) => `employee_profile:${n}`)) : [];
  names.forEach((name, i) => {
    const p = profiles[i]; if (!p) return;
    const eid = resolveByName(roster, p.employee || name);
    const hireAt = dateToMs(p.start_date);
    if (hireAt) push(eid, p.employee || name, { type: "hire", at: hireAt, source: "employee_profile", payload: { role: "Sales Operator" } }, "employee_profile.hire");
    if (p.note && p.updated_at) push(eid, p.employee || name, { type: "note", at: Number(p.updated_at), by: p.updated_by || null, source: "employee_profile", payload: { text: p.note } }, "employee_profile.note");
  });

  // 2. certifications (cert:index withScores; risoluzione userId→employeeId batch)
  const certScored = parseScored(await kv.zrange("cert:index", 0, -1, { withScores: true })).slice(0, ZCAP);
  const certUserIds = [...new Set(certScored.map((c) => c.member.split(":")[0]).filter(Boolean))];
  const userMaps = certUserIds.length ? await kv.mget(...certUserIds.map((u) => `user_employee:${u}`)) : [];
  const userToEid = new Map();
  certUserIds.forEach((u, i) => { const m = userMaps[i]; if (m && m.employeeId != null) userToEid.set(u, { employeeId: String(m.employeeId), employeeName: m.employeeName || null }); });
  for (const c of certScored) {
    const [userId, creatorId, level] = c.member.split(":");
    const r = userToEid.get(userId);
    push(r?.employeeId || null, r?.employeeName || userId, { type: "certification", at: c.score, source: "certifications", payload: { creator: String(creatorId), tier: CERT_TIER[Number(level)] || "base" } }, "certifications");
  }

  // 3. qa-reviews (indice globale → record)
  const qaIds = ((await kv.zrange("qa:reviews:all", 0, -1)) || []).slice(0, ZCAP);
  const qa = qaIds.length ? await kv.mget(...qaIds.map((id) => `qa:review:${id}`)) : [];
  for (const r of qa) {
    if (!r || !r.employee || !r.created_at) continue;
    const eid = resolveByName(roster, r.employee);
    push(eid, r.employee, { type: "qa_review", at: Number(r.created_at), by: r.reviewer_id || null, source: "qa-reviews", payload: { period: r.period_id || null, avg: r.avg ?? null, pass: !!r.pass } }, "qa-reviews");
  }

  // 4. coaching-sessions
  const csIds = ((await kv.zrange("coaching:sessions:all", 0, -1)) || []).slice(0, ZCAP);
  const cs = csIds.length ? await kv.mget(...csIds.map((id) => `coaching:session:${id}`)) : [];
  for (const s of cs) {
    if (!s || !s.employee || !s.created_at) continue;
    const eid = resolveByName(roster, s.employee);
    push(eid, s.employee, { type: "coaching_session", at: Number(s.created_at), by: s.coach_id || null, source: "coaching-sessions", payload: { by: s.coach_id || "coach" } }, "coaching-sessions");
  }

  // 5. disputes → opened (+ resolved)
  const dpIds = ((await kv.zrange("disputes:all", 0, -1)) || []).slice(0, ZCAP);
  const dps = dpIds.length ? await kv.mget(...dpIds.map((id) => `dispute:${id}`)) : [];
  for (const d of dps) {
    if (!d || !d.employee || !d.created_at) continue;
    const eid = resolveByName(roster, d.employee);
    push(eid, d.employee, { type: "dispute_opened", at: Number(d.created_at), by: d.user_id || null, source: "disputes", payload: { period: d.period_id || "-", metric: d.metric || d.type || "-" } }, "disputes");
    if (d.status && d.status !== "open" && d.resolved_at) {
      push(eid, d.employee, { type: "dispute_resolved", at: Number(d.resolved_at), by: d.resolved_by || null, source: "disputes", payload: { period: d.period_id || "-", outcome: d.status } }, "disputes");
    }
  }

  // 6. action_center → hr_action (scansione periodi recenti, no indice dedicato)
  const periods = recentPeriods(18);
  const swaps = await kv.mget(...periods.map((p) => `action_center:swaps:${p}`));
  periods.forEach((period, i) => {
    const container = swaps[i];
    if (!container || typeof container !== "object") return;
    for (const [name, entry] of Object.entries(container)) {
      if (!entry || !entry.marked_at) continue;
      const eid = resolveByName(roster, name);
      push(eid, name, { type: "hr_action", at: Number(entry.marked_at), by: entry.marked_by || null, source: "action-center", payload: { kind: "underperformer", status: entry.status || "marked" } }, "action-center");
    }
  });

  return { perPerson, unresolved, bySource, rosterSize: roster.size };
}

/**
 * Esegue il backfill. dryRun=true → solo report, nessuna scrittura.
 * @returns report { dryRun, roster_size, persons, events_total, by_source,
 *   by_type, unresolved: [{name,count}], written?: {...} }
 */
export async function runBackfill({ dryRun = true } = {}) {
  const { perPerson, unresolved, bySource, rosterSize } = await collectEvents();

  const byType = {};
  let eventsTotal = 0;
  for (const { events } of perPerson.values()) {
    for (const e of events) { byType[e.type] = (byType[e.type] || 0) + 1; eventsTotal++; }
  }

  const report = {
    dryRun,
    roster_size: rosterSize,
    persons: perPerson.size,
    events_total: eventsTotal,
    by_source: bySource,
    by_type: byType,
    unresolved: [...unresolved.values()].sort((a, b) => b.count - a.count).slice(0, 40),
    unresolved_count: unresolved.size,
  };

  if (dryRun) {
    // Campione: la persona con più eventi, timeline abbreviata.
    let sample = null, max = -1;
    for (const [pid, { name, events }] of perPerson.entries()) {
      if (events.length > max) { max = events.length; sample = { person_id: pid, name, events: [...events].sort((a, b) => a.at - b.at).slice(0, 12).map((e) => ({ type: e.type, at: e.at, source: e.source })) }; }
    }
    report.sample = sample;
    return report;
  }

  // Scrittura reale (idempotente).
  let added = 0, invalid = 0;
  for (const [pid, { events }] of perPerson.entries()) {
    const res = await writePersonEvents(pid, events);
    added += res.added; invalid += res.invalid;
  }
  report.written = { added, invalid, persons: perPerson.size };
  return report;
}
