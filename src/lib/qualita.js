/**
 * Controllo qualità automatico (10/10/2026) — i tre controlli che trovano i problemi prima delle persone.
 *
 *  1. Coerenza (ogni notte, alert «access-coherence»): ruolo, creator e vista di ogni membro si contraddicono?
 *  2. Giro per persona (robot settimanale, scripts/qualita/giro.mjs): con i permessi di ogni membro reale
 *     («Vedi come») apre ogni voce del SUO menu e segna errori, accessi negati, pagine lente o vuote.
 *  3. Prova del compito (stesso robot): i lavori di ogni tipo di persona dall'inizio alla fine (lib/qualita-tasks).
 *
 * Nato dal caso Antonio Marucci: Membri diceva «nessun ruolo» mentre era Sales Manager dall'invito, e nessun
 * controllo per pagina poteva accorgersene. Regola: una persona riceve uno strumento quando i tre sono verdi.
 *
 * KV: qa:giro:last (ultimo rapporto completo) · qa:giro:runs (LIST riassunti, cap 30)
 */
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";
import { getUserRoles, getEffectiveCapabilities } from "@/lib/rbac";
import { isUserIdAdminRaw } from "@/lib/admin";
import { getAssignedCreators } from "@/lib/creator-scope";
import { peekSavedWorkspace } from "@/lib/workspace-store";
import { memberIssues } from "@/lib/member-coherence";
import { OPERATOR_PERSONAS, tasksFor } from "@/lib/qualita-tasks";

const LAST_KEY = "qa:giro:last";
const RUNS_KEY = "qa:giro:runs";
export const GIRO_STALE_DAYS = 8; // cadenza settimanale + 1 giorno di grazia
export const QA_ROBOT_EMAIL = "nferraresiluppi@gmail.com"; // account QA (admin) con cui gira il robot

/** Tutti i membri (utenti Clerk) con quello che serve a giudicarne gli accessi. */
export async function listMembers() {
  const cc = await clerkClient();
  const users = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const list = await cc.users.getUserList({ limit: 100, offset, orderBy: "-created_at" });
    const data = Array.isArray(list) ? list : list?.data || [];
    users.push(...data);
    if (data.length < 100) break;
  }
  return Promise.all(users.map(async (u) => {
    const [admin, roles, caps, creators, workspace] = await Promise.all([
      isUserIdAdminRaw(u.id).catch(() => false),
      getUserRoles(u.id).catch(() => []),
      getEffectiveCapabilities(u.id).catch(() => ({})),
      getAssignedCreators(u.id).catch(() => null),
      peekSavedWorkspace(u.id).catch(() => null),
    ]);
    return {
      userId: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id,
      email: u.emailAddresses?.[0]?.emailAddress || null,
      banned: Boolean(u.banned),
      lastSignInAt: u.lastSignInAt || null,
      admin: admin ? { sources: ["admin"] } : null,
      roles, caps, creators, workspace,
    };
  }));
}

/** Controllo 1: i membri con qualcosa da sistemare. */
export async function coherenceReport(members) {
  const list = members || (await listMembers());
  return list.map((m) => ({ userId: m.userId, name: m.name, issues: memberIssues(m) })).filter((m) => m.issues.length);
}

/** Le persone che il robot impersona, con i loro compiti. */
export async function giroPlan() {
  const members = await listMembers();
  const personas = [];
  // l'account QA stesso = la vista di un admin (tutti gli admin vedono le stesse cose)
  const qa = members.find((m) => (m.email || "").toLowerCase() === QA_ROBOT_EMAIL);
  personas.push({ key: "admin", label: "Admin", kind: "admin", viewAs: null, admin: true, creators: [] });
  for (const m of members) {
    if (m.admin || m.banned || (qa && m.userId === qa.userId)) continue;
    personas.push({ key: m.userId, label: m.name, viewAs: { userId: m.userId }, caps: m.caps, creators: m.creators?.all ? [] : m.creators?.creators || [] });
  }
  for (const name of OPERATOR_PERSONAS) personas.push({ key: `op:${name}`, label: `Operatore ${name}`, viewAs: { employee: name }, employee: name, creators: [] });
  return personas.map((p) => ({
    ...p,
    tasks: tasksFor(p).map((t) => ({
      ...t,
      steps: t.steps.map((s) => (s.expectText === "{creators}" ? { expectText: p.creators.length ? p.creators : [] } : s)),
    })),
  }));
}

const clip = (v, n) => String(v ?? "").slice(0, n);

/** Il robot consegna il rapporto: si tiene l'ultimo completo + lo storico dei riassunti. */
export async function saveGiroReport(raw) {
  const personas = (Array.isArray(raw?.personas) ? raw.personas : []).slice(0, 60).map((p) => ({
    key: clip(p.key, 120), label: clip(p.label, 120),
    pages: (Array.isArray(p.pages) ? p.pages : []).slice(0, 200).map((g) => ({
      href: clip(g.href, 200), label: clip(g.label, 120), status: ["ok", "warn", "fail"].includes(g.status) ? g.status : "fail",
      ms: Number(g.ms) || 0, problems: (Array.isArray(g.problems) ? g.problems : []).slice(0, 8).map((x) => clip(x, 300)),
    })),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).slice(0, 40).map((t) => ({
      id: clip(t.id, 60), title: clip(t.title, 160), ok: Boolean(t.ok), failedStep: t.failedStep == null ? null : Number(t.failedStep), problem: clip(t.problem, 400),
    })),
    error: p.error ? clip(p.error, 400) : null,
  }));
  const summary = summarize(personas);
  const report = { at: Date.now(), source: clip(raw?.source || "robot", 40), base: clip(raw?.base, 100), personas, summary };
  await kv.set(LAST_KEY, report);
  await kv.lpush(RUNS_KEY, JSON.stringify({ at: report.at, source: report.source, ...summary }));
  await kv.ltrim(RUNS_KEY, 0, 29);
  return report;
}

export function summarize(personas) {
  const pages = personas.flatMap((p) => p.pages);
  const tasks = personas.flatMap((p) => p.tasks);
  return {
    personas: personas.length,
    pages: pages.length, fail: pages.filter((g) => g.status === "fail").length, warn: pages.filter((g) => g.status === "warn").length,
    tasks: tasks.length, tasksFailed: tasks.filter((t) => !t.ok).length,
    personaErrors: personas.filter((p) => p.error).length,
  };
}

export async function getGiroReport() {
  const [last, runs] = await Promise.all([kv.get(LAST_KEY).catch(() => null), kv.lrange(RUNS_KEY, 0, 29).catch(() => [])]);
  return { last, runs: (runs || []).map((r) => (typeof r === "string" ? JSON.parse(r) : r)) };
}

/** Pronto per…: una persona è verde quando coerenza, giro e compiti sono tutti verdi. */
export function readiness(last, coherence) {
  const bad = new Map(coherence.map((c) => [c.userId, c.issues.length]));
  return (last?.personas || []).map((p) => {
    const fails = p.pages.filter((g) => g.status === "fail").length;
    const tasksFailed = p.tasks.filter((t) => !t.ok).length;
    const issues = bad.get(p.key) || 0;
    const ready = !p.error && !fails && !tasksFailed && !issues;
    return { key: p.key, label: p.label, ready, fails, warns: p.pages.filter((g) => g.status === "warn").length, tasksFailed, tasks: p.tasks.length, issues, error: p.error };
  });
}
