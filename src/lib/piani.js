// Piani di lavoro — store KV e controlli automatici (logica pura in piani-core.js).
//
//   piani:index      SET degli id
//   piani:p:{id}     definizione del piano (JSON normalizzato)
//   piani:s:{id}     HASH voce → stato {done:{at,by}, answer, answerBy, answerAt}
//
// Le voci automatiche leggono i dati che l'app ha già (Radar, editoriale, warm-up, segnalazioni):
// un controllo che fallisce torna «dato non disponibile» e non chiude la voce — mai un falso «fatto».
import { kv } from "@vercel/kv";
import { normalizePlan, evaluatePlan, coveredDays } from "@/lib/piani-core";
import { listProfiles as radarProfiles } from "@/lib/clip-radar";
import { listItems } from "@/lib/editoriale-store";
import { creatorKey } from "@/lib/editoriale-core";
import { loadState as warmupState } from "@/lib/warmup-store";
import { listFeedback } from "@/lib/feedback";
import { weekKey } from "@/lib/warmup-plan";

const IDX = "piani:index";
const P = (id) => `piani:p:${id}`;
const S = (id) => `piani:s:${id}`;
const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);

/** Giorno di oggi a Roma (le scadenze sono giorni di calendario italiani). */
export function romeToday(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(now));
}

export async function savePlan(input) {
  const r = normalizePlan(input);
  if (!r.ok) return r;
  await kv.set(P(r.plan.id), r.plan);
  await kv.sadd(IDX, r.plan.id);
  return r;
}

export async function getPlan(id) {
  const v = await kv.get(P(id));
  return v ? parse(v) : null;
}

export async function listPlans() {
  const ids = (await kv.smembers(IDX)) || [];
  if (!ids.length) return [];
  const raw = await kv.mget(...ids.map(P));
  return raw.filter(Boolean).map(parse).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
}

async function getState(id) {
  const h = (await kv.hgetall(S(id))) || {};
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, parse(v)]));
}

/** Spunta / risposta su una voce. `patch` = {done:boolean} o {answer:string}. */
export async function setItem(planId, itemId, patch, by) {
  const plan = await getPlan(planId);
  const item = plan?.phases.flatMap((p) => p.items).find((i) => i.id === itemId);
  if (!item) return { ok: false, status: 404, errors: ["Voce non trovata"] };
  const prev = parse(await kv.hget(S(planId), itemId)) || {};
  const next = { ...prev };
  if ("done" in patch) next.done = patch.done ? { at: Date.now(), by: by?.name || "" } : null;
  if ("answer" in patch) {
    next.answer = String(patch.answer || "").trim().slice(0, 2000);
    next.answerBy = by?.name || "";
    next.answerAt = Date.now();
  }
  await kv.hset(S(planId), { [itemId]: JSON.stringify(next) });
  return { ok: true };
}

// ── controlli automatici ─────────────────────────────────────────────────────

async function sources(plan, wanted) {
  const need = (t) => wanted.has(t);
  const startMs = plan.start ? Date.parse(plan.start + "T00:00:00+01:00") : 0;
  const out = { startMs };
  const jobs = [];
  if (need("radar_profiles")) jobs.push(radarProfiles().then((v) => { out.radar = v; }));
  if (need("radar_saved")) jobs.push(kv.hgetall("clipradar:saved").then((v) => { out.saved = Object.values(v || {}).map(parse); }));
  if (need("feedback_open")) jobs.push(listFeedback(1000).then((v) => { out.feedback = v; }));
  if (need("editoriale_items") || need("autopub") || need("calendar_days") || need("weekly_data")) {
    jobs.push((async () => {
      const st = await warmupState();
      out.profiles = st.profiles.filter((p) => !p.archived);
      const ig = out.profiles.filter((p) => p.platform !== "x" && p.creator);
      const cks = [...new Set(ig.map((p) => creatorKey(p.creator)).filter(Boolean))];
      out.igProfiles = ig;
      out.items = (await Promise.all(cks.map((ck) => listItems(ck).catch(() => [])))).flat();
    })());
  }
  await Promise.allSettled(jobs);
  return out;
}

function check(auto, src, today) {
  const min = Number(auto.min) || 1;
  switch (auto.type) {
    case "radar_profiles": {
      if (!src.radar) return null;
      const n = src.radar.filter((p) => !p.ours && (!auto.country || p.country === auto.country)).length;
      return { ok: n >= min, value: n, target: min, label: `${n} su ${min}` };
    }
    case "radar_saved": {
      if (!src.saved) return null;
      const n = src.saved.filter((x) => (x?.at || 0) >= src.startMs).length;
      return { ok: n >= min, value: n, target: min, label: `${n} su ${min} dall'inizio del piano` };
    }
    case "editoriale_items": {
      if (!src.items) return null;
      const n = src.items.filter((it) => (!auto.kind || it.type === auto.kind) && (it.createdAt || 0) >= src.startMs).length;
      return { ok: n >= min, value: n, target: min, label: `${n} su ${min} dall'inizio del piano` };
    }
    case "autopub": {
      if (!src.items) return null;
      const n = src.items.filter((it) => it.autoPub && (it.autoPub.at || 0) >= src.startMs).length;
      return { ok: n >= min, value: n, target: min, label: n === 1 ? "1 trovato sul profilo" : n ? `${n} trovati sul profilo` : "nessuno ancora" };
    }
    case "calendar_days": {
      if (!src.items || !src.igProfiles) return null;
      const days = Number(auto.days) || 7;
      if (!src.igProfiles.length) return { ok: false, value: 0, target: days, label: "nessun profilo Instagram attivo" };
      const per = src.igProfiles.map((p) => {
        const ds = src.items.filter((it) => it.slot?.profileId === p.id && (it.status === "pronto" || it.status === "pubblicato")).map((it) => it.slot.date);
        return { u: p.username, n: coveredDays(ds, today) };
      });
      const worst = Math.min(...per.map((x) => x.n));
      return { ok: worst >= days, value: worst, target: days, label: per.map((x) => `${x.u} ${x.n}/${days} giorni`).join(" · ") };
    }
    case "weekly_data": {
      if (!src.profiles) return null;
      const keys = new Set([weekKey(new Date()), weekKey(new Date(Date.now() - 7 * 86400000))]);
      const act = src.profiles;
      const n = act.filter((p) => Object.keys(p.weekly || {}).some((k) => keys.has(k))).length;
      return { ok: act.length > 0 && n === act.length, value: n, target: act.length, label: `${n} profili su ${act.length}` };
    }
    case "feedback_open": {
      if (!src.feedback) return null;
      const open = src.feedback.filter((f) => f.status !== "done" && (!auto.kind || f.kind === auto.kind) && (!auto.page || String(f.page || "").startsWith(auto.page)) && (f.at || 0) >= src.startMs);
      return { ok: open.length === 0, value: open.length, target: 0, label: open.length ? `${open.length} aperte` : "nessuna aperta" };
    }
    default: return null;
  }
}

/** Piano valutato (definizione + spunte + controlli automatici). */
export async function loadEvaluated(id, now = Date.now()) {
  const plan = await getPlan(id);
  if (!plan) return null;
  const today = romeToday(now);
  const autoItems = plan.phases.flatMap((p) => p.items).filter((i) => i.auto);
  const [state, src] = await Promise.all([getState(id), sources(plan, new Set(autoItems.map((i) => i.auto.type)))]);
  const autos = {};
  for (const it of autoItems) {
    try { autos[it.id] = check(it.auto, src, today) || undefined; } catch { autos[it.id] = undefined; }
  }
  return { ...evaluatePlan(plan, state, autos, today), today };
}
