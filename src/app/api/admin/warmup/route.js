// Warm-up dei profili social — API (permesso social.manage: admin e ruoli Social / SMM).
//
// GET                    profili (account + warm-up) con spunte e timer, persone, chi sono io
// GET ?log={id}          storico di un profilo
// GET ?activity=1        registro di tutto (solo admin)
// GET ?pfp={id}          foto profilo (immagine)
// POST {action:"create", fields}                    nuovo profilo (aggancia o crea l'account in Account social)
// POST {action:"update", id, fields}                modifica i dati
// POST {action:"task",   id, day, task, on, label}  spunta / togli la spunta
// POST {action:"timer",  id, day, task, sec}        minuti fatti col timer
// POST {action:"meta",   id, patch, logs, type}     segnalazione, situazione, traguardi, dati settimanali
// POST {action:"archive"|"restore"|"purge", id}     archivio (solo admin)
// POST {action:"import", backup, dryRun}           backup JSON della console di prima (solo admin)
//
// Come nella console di prima, le regole del calendario si calcolano nel browser (lib/warmup-plan,
// giorni locali di chi lavora); qui si custodiscono i dati e i poteri: responsabile, chiusura del
// cooldown, archivio e registro restano agli admin.

export const runtime = "nodejs";
export const maxDuration = 300;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isUserIdAdmin } from "@/lib/admin";
import {
  loadState, listPeople, notePerson, getLog, getActivity, getPfp, appendLog,
  createProfile, updateProfile, setTask, setTimer, patchMeta, setArchived, purge, importBackup,
} from "@/lib/warmup-store";
import { kv } from "@vercel/kv";
import { refreshPublicMetrics, getRunState, apifyConfigured } from "@/lib/warmup-metrics";

const noStore = { headers: { "Cache-Control": "no-store" } };
const LOG_TYPES = new Set(["accesso", "account", "task", "flag", "traguardo", "utente", "profilo", "dati", "stato"]);

async function who(userId) {
  try {
    const u = await currentUser();
    return u?.fullName || u?.firstName || u?.primaryEmailAddress?.emailAddress || userId;
  } catch { return userId; }
}

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  const [name, admin] = await Promise.all([who(az.userId), isUserIdAdmin(az.userId).catch(() => false)]);
  return { by: { userId: az.userId, name }, admin };
}

export async function GET(request) {
  const g = await gate();
  if (g.err) return g.err;
  const sp = new URL(request.url).searchParams;
  if (sp.get("pfp")) {
    const v = await getPfp(sp.get("pfp"));
    const m = v && /^data:(image\/[a-z]+);base64,(.*)$/.exec(v);
    if (!m) return new Response(null, { status: 404 });
    return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=300" } });
  }
  if (sp.get("log")) return Response.json({ log: await getLog(sp.get("log")) }, noStore);
  if (sp.get("activity")) {
    if (!g.admin) return Response.json({ error: "Il registro lo vede solo un amministratore" }, { status: 403 });
    return Response.json({ activity: await getActivity() }, noStore);
  }
  await notePerson(g.by.userId, g.by.name);
  const [state, people, pubRun] = await Promise.all([loadState(), listPeople(), getRunState().catch(() => null)]);
  return Response.json({ ...state, people, pubRun: { ...(pubRun || {}), configured: apifyConfigured() }, me: { id: g.by.userId, name: g.by.name, admin: g.admin } }, noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const { by, admin } = g;
  const body = await request.json().catch(() => ({}));
  const fail = (r) => Response.json({ error: (r.errors || ["Errore"]).join("; ") }, { status: r.status || 400 });
  const onlyAdmin = (what) => Response.json({ error: `${what}: lo fa solo un amministratore` }, { status: 403 });
  const id = body.id ? String(body.id) : null;
  const logType = LOG_TYPES.has(body.type) ? body.type : "account";
  const logs = (Array.isArray(body.logs) ? body.logs : []).map((x) => String(x).slice(0, 400)).slice(0, 10);
  const uname = body.username ? String(body.username).slice(0, 80) : "";
  try {
    if (body.action === "create") {
      const f = body.fields || {};
      if (f.owner && !admin) delete f.owner;
      const r = await createProfile(f, by);
      if (!r.ok) return fail(r);
      await appendLog(r.id, ["Account registrato nella console", ...logs], by, "account", "@" + String(f.username || "").replace(/^@+/, ""));
      return Response.json({ ok: true, id: r.id });
    }
    if (body.action === "refreshPub") {
      if (!admin) return onlyAdmin("Rileggere i numeri pubblici");
      return Response.json({ result: await refreshPublicMetrics({ force: true }) });
    }
    if (body.action === "import") {
      if (!admin) return onlyAdmin("Importare dalla console di prima");
      const report = await importBackup(body.backup || {}, by, { dryRun: body.dryRun !== false });
      return Response.json({ report });
    }
    if (!id) return Response.json({ error: "Manca il profilo" }, { status: 400 });
    if (body.action === "update") {
      const r = await updateProfile(id, body.fields || {}, by);
      if (!r.ok) return fail(r);
      await appendLog(id, ["Dati del profilo aggiornati"], by, "profilo", uname);
      return Response.json({ ok: true });
    }
    if (body.action === "task") {
      const r = await setTask(id, String(body.day || ""), String(body.task || ""), Boolean(body.on), by);
      if (!r.ok) return fail(r);
      await appendLog(id, logs, by, "task", uname);
      return Response.json({ ok: true });
    }
    if (body.action === "timer") {
      const r = await setTimer(id, String(body.day || ""), String(body.task || ""), body.sec);
      return r.ok ? Response.json({ ok: true }) : fail(r);
    }
    if (body.action === "meta") {
      const patch = body.patch && typeof body.patch === "object" ? body.patch : {};
      if ("owner" in patch && !admin) return onlyAdmin("Assegnare il responsabile");
      if ("cooldownFrom" in patch && patch.cooldownFrom === null && !admin) {
        const cur = await kv.get(`warmup:p:${id}`);
        if (cur?.cooldownFrom) return onlyAdmin("Chiudere il cooldown");
      }
      const r = await patchMeta(id, patch, by);
      if (!r.ok) return fail(r);
      await appendLog(id, logs, by, logType, uname);
      return Response.json({ ok: true });
    }
    if (["archive", "restore", "purge"].includes(body.action)) {
      if (!admin) return onlyAdmin(body.action === "purge" ? "Cancellare un profilo" : "Archiviare un profilo");
      const r = body.action === "purge" ? await purge(id) : await setArchived(id, body.action === "archive", by);
      if (!r.ok) return fail(r);
      if (body.action === "purge") await appendLog(id, ["Warm-up del profilo cancellato definitivamente (l'account resta in Account social)"], by, "account", uname).then(() => kv.del(`warmup:log:${id}`));
      else await appendLog(id, [body.action === "archive" ? "Profilo eliminato e spostato in archivio" : "Profilo ripristinato dall'archivio"], by, "account", uname);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Errore" }, { status: 500 });
  }
}
