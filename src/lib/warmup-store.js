// Warm-up dei profili social — archivio in KV (namespace `warmup:*`).
//
// Il profilo vero è l'account in Account social (`sup:account`, supervisor-store): username,
// piattaforma, creator, telefono, email, note vivono LÌ, una sola volta. Qui c'è solo lo stato
// del warm-up, diviso in pezzi piccoli così due persone che lavorano insieme non si cancellano
// a vicenda le spunte (nella console di prima l'intero profilo si riscriveva a ogni clic).
//
// Chiavi:
//   warmup:index            SET degli id (= id dell'account in Account social)
//   warmup:p:{id}           stato: inizio, piattaforma, bio, stato/segnalazione/cooldown, traguardi,
//                           dati settimanali, responsabile, archivio
//   warmup:d:{id}           HASH spunte e timer: "d|YYYY-MM-DD|taskId" → nome di chi l'ha fatta,
//                           "t|YYYY-MM-DD|taskId" → secondi col timer (si potano dopo 60 giorni)
//   warmup:log:{id}         LIST storico del profilo (cap 200)
//   warmup:activity         LIST registro di tutto (cap 2000)
//   warmup:pfp:{id}         foto profilo (JPEG 160 px in data URL), letta a parte
//   warmup:people           HASH userId → nome di chi ha aperto il warm-up (per scegliere il responsabile)
import { kv } from "@vercel/kv";
import { loadAll as loadSupervisor, upsert as supUpsert } from "@/lib/supervisor-store";
import { META_KEYS, SUP_PLATFORM_STATUS } from "@/lib/warmup-plan";
import { loadPublicSummaries } from "@/lib/warmup-metrics";
import { normalizeLinkUrl } from "@/lib/s4s-core";

const IDX = "warmup:index";
const P = (id) => `warmup:p:${id}`;
const D = (id) => `warmup:d:${id}`;
const L = (id) => `warmup:log:${id}`;
const PFP = (id) => `warmup:pfp:${id}`;
const ACT = "warmup:activity";
const PEOPLE = "warmup:people";
const LOG_CAP = 200, ACT_CAP = 2000, KEEP_DAYS = 60;

const s = (v) => (v == null ? "" : String(v).trim());
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_RE = /^[\w-]{1,40}$/;

export async function notePerson(userId, name) {
  if (!userId) return;
  try { await kv.hset(PEOPLE, { [userId]: name || userId }); } catch {}
}
export async function listPeople() {
  const h = (await kv.hgetall(PEOPLE)) || {};
  return Object.entries(h).map(([id, name]) => ({ id, name: String(name) })).sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function cutoffKey() {
  const d = new Date(Date.now() - KEEP_DAYS * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Tutto quello che serve alla pagina: profili (account + warm-up) con spunte e timer. */
export async function loadState() {
  const [ids, sup] = await Promise.all([kv.smembers(IDX), loadSupervisor()]);
  const accById = new Map(sup.accounts.map((a) => [a.id, a]));
  const devById = new Map(sup.devices.map((d) => [d.id, d]));
  const list = ids?.length ? ids : [];
  const recs = list.length ? await kv.mget(...list.map(P)) : [];
  const pipe = kv.pipeline();
  list.forEach((id) => pipe.hgetall(D(id)));
  const hashes = list.length ? await pipe.exec() : [];
  const old = cutoffKey();
  const prune = [];
  const profiles = [];
  list.forEach((id, i) => {
    const w = recs[i];
    if (!w) return;
    const acc = accById.get(id) || null;
    const progress = {}, timers = {};
    for (const [f, v] of Object.entries(hashes[i] || {})) {
      const [kind, day, task] = f.split("|");
      if (!day || !task) continue;
      if (day < old) { prune.push([id, f]); continue; }
      if (kind === "d") (progress[day] ||= {})[task] = true;
      else if (kind === "t") (timers[day] ||= {})[task] = Number(v) || 0;
    }
    const dev = acc?.deviceId ? devById.get(acc.deviceId) : null;
    profiles.push({
      ...w,
      id,
      username: acc ? "@" + acc.username : w.usernameFallback || "@?",
      creator: acc?.creator || "",
      email: acc?.email || "",
      notes: acc?.notes || "",
      device: dev?.name || "",
      deviceType: dev?.model || "",
      linkInBio: acc?.linkInBio || null,
      supMissing: !acc,
      progress, timers,
    });
  });
  // numeri pubblici letti in automatico (warmup-metrics): riassunto, non lo storico intero
  const pub = await loadPublicSummaries(profiles.map((p) => p.id), Object.fromEntries(profiles.map((p) => [p.id, p.platform]))).catch(() => ({}));
  for (const p of profiles) p.pub = pub[p.id] || null;
  if (prune.length) {
    const p2 = kv.pipeline();
    prune.forEach(([id, f]) => p2.hdel(D(id), f));
    p2.exec().catch(() => {});
  }
  const creators = [...new Set(sup.accounts.map((a) => a.creator).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
  const devices = sup.devices.map((d) => d.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  return { profiles, creators, devices };
}

async function getRec(id) {
  return (await kv.get(P(id))) || null;
}

export async function appendLog(id, texts, by, type, username) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
  if (!list.length) return;
  const ts = Date.now();
  const pipe = kv.pipeline();
  for (const text of list) {
    pipe.lpush(L(id), JSON.stringify({ ts, text, un: by?.name || "—" }));
    pipe.lpush(ACT, JSON.stringify({ ts, uid: by?.userId || null, un: by?.name || "—", type: type || "account", text: text + (username ? " — " + username : ""), id }));
  }
  pipe.ltrim(L(id), 0, LOG_CAP - 1);
  pipe.ltrim(ACT, 0, ACT_CAP - 1);
  await pipe.exec();
}
const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
export async function getLog(id) {
  return ((await kv.lrange(L(id), 0, LOG_CAP - 1)) || []).map(parse);
}
export async function getActivity() {
  return ((await kv.lrange(ACT, 0, ACT_CAP - 1)) || []).map(parse);
}

/** Telefono per nome (come lo scrive chi lavora): esiste già con un'altra grafia → quello; se no si crea. */
async function deviceIdFor(name, model, by) {
  const n = s(name);
  if (!n) return null;
  const sup = await loadSupervisor();
  const hit = sup.devices.find((d) => s(d.name).toLowerCase() === n.toLowerCase());
  if (hit) return hit.id;
  const r = await supUpsert("device", { fields: { name: n, model: s(model) || null } }, by);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.record.id;
}

const supPlatform = (p) => (p === "x" ? "twitter" : "instagram");

/**
 * Nuovo profilo in warm-up. Se l'account c'è già in Account social (stessa piattaforma e nome
 * utente) si aggancia quello, altrimenti lo si crea lì con creazione "In riscaldamento".
 */
export async function createProfile(input, by) {
  const platform = input.platform === "x" ? "x" : "ig";
  const username = s(input.username).replace(/^@+/, "");
  if (!username) return { ok: false, status: 400, errors: ["Serve almeno lo username"] };
  const sup = await loadSupervisor();
  const uname = username.toLowerCase();
  let acc = sup.accounts.find((a) => a.platform === supPlatform(platform) && a.username === uname);
  if (acc && (await kv.sismember(IDX, acc.id))) return { ok: false, status: 409, errors: ["Questo account è già nel warm-up"] };
  const deviceId = platform === "ig" ? await deviceIdFor(input.device, input.deviceType, by) : null;
  const fields = { username, platform: supPlatform(platform), creator: s(input.creator) || null, email: s(input.email) || null, notes: s(input.notes) || null };
  if (deviceId) fields.deviceId = deviceId;
  if (!acc) fields.creationStatus = "warming";
  const r = await supUpsert("account", { id: acc?.id || null, fields }, by);
  if (!r.ok) return r;
  acc = r.record;
  const now = Date.now();
  const rec = {
    id: acc.id, platform,
    createdAt: DAY_RE.test(s(input.createdAt)) ? s(input.createdAt) : new Date().toISOString().slice(0, 10),
    displayName: s(input.displayName), bio: String(input.bio || "").slice(0, 400), birthDate: s(input.birthDate),
    pfpType: s(input.pfpType) || null, hasPfp: false, trackingLink: normalizeLinkUrl(input.trackingLink) || null,
    owner: input.owner?.id ? { id: String(input.owner.id), name: s(input.owner.name) } : null,
    status: "verde", state: "online", stateHistory: [], stateSteps: {}, flag: null, flagHistory: [],
    pausedMs: 0, cooldownFrom: null, monitorUntil: null, milestones: {}, weekly: {},
    archived: null, usernameFallback: "@" + username,
    addedAt: now, addedBy: by?.name || "",
  };
  await kv.set(P(acc.id), rec);
  await kv.sadd(IDX, acc.id);
  if (input.pfp) await setPfp(acc.id, input.pfp);
  return { ok: true, id: acc.id };
}

/** Modifica dei dati: quelli dell'account vanno in Account social, il resto qui. */
export async function updateProfile(id, input, by) {
  const rec = await getRec(id);
  if (!rec) return { ok: false, status: 404, errors: ["Profilo non trovato"] };
  const fields = {};
  if (input.username !== undefined) fields.username = s(input.username).replace(/^@+/, "");
  for (const k of ["creator", "email", "notes"]) if (input[k] !== undefined) fields[k] = s(input[k]) || null;
  if (input.device !== undefined && rec.platform === "ig") fields.deviceId = await deviceIdFor(input.device, input.deviceType, by);
  if (Object.keys(fields).length) {
    const r = await supUpsert("account", { id, fields }, by);
    if (!r.ok) return r;
    if (fields.username) rec.usernameFallback = "@" + fields.username;
  }
  for (const k of ["displayName", "birthDate", "pfpType"]) if (input[k] !== undefined) rec[k] = s(input[k]) || (k === "pfpType" ? null : "");
  if (input.bio !== undefined) rec.bio = String(input.bio || "").slice(0, 400);
  if (input.trackingLink !== undefined) rec.trackingLink = normalizeLinkUrl(input.trackingLink) || null;
  if (DAY_RE.test(s(input.createdAt))) rec.createdAt = s(input.createdAt);
  await kv.set(P(id), rec);
  if (input.pfp) await setPfp(id, input.pfp);
  return { ok: true };
}

export async function setPfp(id, dataUrl) {
  const v = String(dataUrl || "");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(v) || v.length > 200_000) throw new Error("Foto non valida (troppo grande?)");
  await kv.set(PFP(id), v);
  const rec = await getRec(id);
  if (rec && !rec.hasPfp) { rec.hasPfp = true; await kv.set(P(id), rec); }
}
export async function getPfp(id) {
  return (await kv.get(PFP(id))) || null;
}

/** Una spunta (atomica: tocca solo il suo campo). */
export async function setTask(id, day, task, on, by) {
  if (!DAY_RE.test(day) || !TASK_RE.test(task)) return { ok: false, status: 400, errors: ["Task non valida"] };
  if (!(await kv.sismember(IDX, id))) return { ok: false, status: 404, errors: ["Profilo non trovato"] };
  if (on) await kv.hset(D(id), { [`d|${day}|${task}`]: by?.name || "—" });
  else await kv.hdel(D(id), `d|${day}|${task}`);
  return { ok: true };
}
/** Secondi fatti col timer (si tiene il massimo: due telefoni non si tolgono minuti a vicenda). */
export async function setTimer(id, day, task, sec) {
  if (!DAY_RE.test(day) || !TASK_RE.test(task)) return { ok: false, status: 400, errors: ["Task non valida"] };
  const f = `t|${day}|${task}`;
  const cur = Number(await kv.hget(D(id), f)) || 0;
  const v = Math.max(cur, Math.min(24 * 3600, Math.round(Number(sec) || 0)));
  await kv.hset(D(id), { [f]: v });
  return { ok: true };
}

/**
 * Aggiorna lo stato del warm-up (segnalazione, situazione, traguardi, dati settimanali…).
 * Si fondono solo i campi mandati; i dati settimanali settimana per settimana.
 * Se cambia la situazione la si riporta anche in Account social (stato piattaforma).
 */
export async function patchMeta(id, patch, by) {
  const rec = await getRec(id);
  if (!rec) return { ok: false, status: 404, errors: ["Profilo non trovato"] };
  const before = rec.state || "online";
  for (const k of META_KEYS) {
    if (!(k in (patch || {}))) continue;
    if (k === "weekly") rec.weekly = { ...(rec.weekly || {}), ...(patch.weekly || {}) };
    else rec[k] = patch[k];
  }
  rec.updatedAt = Date.now(); rec.updatedBy = by?.name || "";
  await kv.set(P(id), rec);
  const after = rec.state || "online";
  if (after !== before && SUP_PLATFORM_STATUS[after]) {
    await supUpsert("account", { id, fields: { platformStatus: SUP_PLATFORM_STATUS[after] } }, by).catch(() => {});
  }
  return { ok: true };
}

/** Archivio: il profilo esce dal warm-up ma tiene tutto (l'account in Account social resta com'è). */
export async function setArchived(id, on, by) {
  const rec = await getRec(id);
  if (!rec) return { ok: false, status: 404, errors: ["Profilo non trovato"] };
  rec.archived = on ? { at: Date.now(), by: by?.name || "" } : null;
  await kv.set(P(id), rec);
  return { ok: true };
}
/** Cancellazione definitiva del warm-up (solo dall'archivio). L'account in Account social resta. */
export async function purge(id) {
  const rec = await getRec(id);
  if (!rec) return { ok: false, status: 404, errors: ["Profilo non trovato"] };
  if (!rec.archived) return { ok: false, status: 409, errors: ["Si cancella solo un profilo già in archivio"] };
  await Promise.all([kv.del(P(id)), kv.del(D(id)), kv.del(L(id)), kv.del(PFP(id)), kv.srem(IDX, id)]);
  return { ok: true };
}

/**
 * Import una tantum dal backup JSON della console di prima («Backup completo in JSON»:
 * { profili, cartelle, persone, registro }). Ogni profilo aggancia o crea il suo account in
 * Account social; quelli già nel warm-up si saltano (si può rilanciare senza doppioni).
 * Il responsabile resta col nome ({id:null, name}): l'id HOC Pro lo assegna poi un admin.
 */
export async function importBackup(backup, by, { dryRun = true } = {}) {
  const profili = Array.isArray(backup?.profili) ? backup.profili : [];
  const persone = new Map((backup?.persone || []).map((u) => [u.id, u.name]));
  const report = { created: [], skipped: [], activity: 0 };
  for (const a of profili) {
    if (!a || a.kind === "folder" || !s(a.username)) continue;
    const platform = a.platform === "x" ? "x" : "ig";
    const username = s(a.username).replace(/^@+/, "");
    const sup = await loadSupervisor();
    const acc = sup.accounts.find((x) => x.platform === supPlatform(platform) && x.username === username.toLowerCase());
    if (acc && (await kv.sismember(IDX, acc.id))) { report.skipped.push({ username: "@" + username, reason: "già nel warm-up" }); continue; }
    report.created.push({ username: "@" + username, platform, creator: s(a.creator), days: Object.keys(a.progress || {}).length, log: (a.log || []).length, linked: Boolean(acc) });
    if (dryRun) continue;
    const deviceId = platform === "ig" ? await deviceIdFor(a.device, a.deviceType, by) : null;
    const fields = { username, platform: supPlatform(platform), creator: s(a.creator) || null, email: s(a.email) || null, notes: s(a.notes) || null };
    if (deviceId) fields.deviceId = deviceId;
    if (!acc) fields.creationStatus = "warming";
    const r = await supUpsert("account", { id: acc?.id || null, fields }, by);
    if (!r.ok) { report.created.pop(); report.skipped.push({ username: "@" + username, reason: r.errors.join("; ") }); continue; }
    const id = r.record.id;
    const ownerName = a.owner ? persone.get(a.owner) || a.ownerName || "" : "";
    const rec = {
      id, platform, createdAt: DAY_RE.test(s(a.createdAt)) ? s(a.createdAt) : new Date().toISOString().slice(0, 10),
      displayName: s(a.displayName), bio: String(a.bio || "").slice(0, 400), birthDate: s(a.birthDate), pfpType: s(a.pfpType) || null,
      hasPfp: false, owner: ownerName ? { id: null, name: ownerName } : null,
      status: a.status || "verde", state: a.state || "online", stateSince: a.stateSince || null, stateSteps: a.stateSteps || {},
      stateHistory: a.stateHistory || [], flag: a.flag || null, flagHistory: a.flagHistory || [], pausedMs: a.pausedMs || 0,
      cooldownFrom: a.cooldownFrom || null, monitorUntil: a.monitorUntil || null, milestones: a.milestones || {}, weekly: a.weekly || {},
      archived: a.deleted ? { at: a.deleted.at || Date.now(), by: a.deleted.by || "" } : null,
      usernameFallback: "@" + username, addedAt: Date.now(), addedBy: (by?.name || "") + " (import dalla console di prima)",
    };
    await importRecord(rec, a.progress || {}, a.timers || {}, (a.log || []).map((e) => ({ ts: e.ts, text: e.text, un: e.un || "—" })));
    if (a.pfp) { try { await setPfp(id, a.pfp); } catch {} }
  }
  const reg = (backup?.registro || []).map((e) => ({ ts: Number(e.ts) || 0, uid: null, un: e.un || "—", type: e.type || "account", text: String(e.text || "") })).filter((e) => e.ts).sort((x, y) => x.ts - y.ts);
  report.activity = reg.length;
  if (!dryRun && reg.length && report.created.length) await importActivity(reg);
  return report;
}

/** Import una tantum dal backup della console di prima (profili già convertiti dallo script). */
export async function importRecord(rec, progress = {}, timers = {}, log = []) {
  await kv.set(P(rec.id), rec);
  await kv.sadd(IDX, rec.id);
  const h = {};
  for (const [day, tasks] of Object.entries(progress)) for (const t of Object.keys(tasks || {})) if (tasks[t]) h[`d|${day}|${t}`] = "console di prima";
  for (const [day, tasks] of Object.entries(timers)) for (const [t, sec] of Object.entries(tasks || {})) h[`t|${day}|${t}`] = Number(sec) || 0;
  if (Object.keys(h).length) await kv.hset(D(rec.id), h);
  if (log.length) {
    await kv.del(L(rec.id));
    await kv.rpush(L(rec.id), ...log.slice(-LOG_CAP).reverse().map((e) => JSON.stringify(e)));
  }
}
export async function importActivity(entries) {
  if (!entries.length) return;
  await kv.rpush(ACT, ...entries.slice(-ACT_CAP).reverse().map((e) => JSON.stringify(e)));
}
