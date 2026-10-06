/**
 * Client ClickUp minimale per il Centro HR (solo server, 29/09/2026).
 *
 * Stessa chiave di citta-clickup.js (`CLICKUP_API_TOKEN`, header Authorization
 * senza "Bearer": è un token personale pk_…). La lista NON ha default:
 * `HR_CLICKUP_LIST_ID` mancante = sync spenta (mai puntare per sbaglio alla
 * lista reale 901212383318 durante la simulazione).
 *
 * Rate limit ClickUp: 100 richieste/minuto per token (piani base). Qui:
 * spaziatura minima tra chiamate dello stesso processo + retry su 429/5xx
 * rispettando X-RateLimit-Reset (al massimo 3 tentativi, attese brevi: siamo
 * in funzioni serverless da 60s).
 */
import { kv } from "@vercel/kv";

const API = "https://api.clickup.com/api/v2";
// Dal 03/10/2026 il CRM attivo è «✅ New CRM» (901222719267, ex lista di prova, ripartito da zero);
// 901212383318 è il CRM VECCHIO, tenuto come archivio: se la variabile punta lì la UI avvisa.
export const REAL_LIST_ID = "901212383318"; // CRM vecchio: solo per avvisare in UI, MAI come default
const FIELDS_TTL = 3600;
const MIN_SPACING_MS = 300;
const MAX_TRIES = 3;

export function hrSyncConfig() {
  const listId = String(process.env.HR_CLICKUP_LIST_ID || "").trim() || null;
  const token = Boolean(process.env.CLICKUP_API_TOKEN);
  return { listId, token, enabled: Boolean(listId && token), isRealList: listId === REAL_LIST_ID };
}

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ClickupError extends Error {
  constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
}

/**
 * Il task non esiste più (cancellato o mai esistito)? 404, oppure gli errori
 * "ITEM_…" con cui ClickUp risponde per un task che non trova. Un 401 generico
 * (token revocato, permessi) NON conta: archiviare tutte le schede per un token
 * scaduto sarebbe il guaio peggiore.
 */
export function isTaskGone(e) {
  if (!e) return false;
  if (e.status === 404) return true;
  return /^ITEM_/.test(String(e.code || ""));
}

async function cu(path, { method = "GET", json, form } = {}) {
  if (!process.env.CLICKUP_API_TOKEN) throw new ClickupError("CLICKUP_API_TOKEN non configurata", 0);
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const wait = lastCall + MIN_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          Authorization: process.env.CLICKUP_API_TOKEN,
          ...(json ? { "Content-Type": "application/json" } : {}),
        },
        body: json ? JSON.stringify(json) : form || undefined,
      });
    } catch (e) {
      lastErr = new ClickupError(`ClickUp non raggiungibile (${e?.message || "rete"})`, 0);
      await sleep(500 * attempt);
      continue;
    }
    if (res.ok) {
      const txt = await res.text();
      return txt ? JSON.parse(txt) : {};
    }
    const body = await res.text().catch(() => "");
    let detail = "";
    let code = null;
    try { const j = JSON.parse(body); detail = j?.err || ""; code = j?.ECODE || null; } catch {}
    lastErr = new ClickupError(`ClickUp ${res.status} su ${method} ${path.split("?")[0]}${detail ? `: ${detail}` : ""}`, res.status, code);
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const ms = reset ? Math.min(10_000, Math.max(1000, reset - Date.now())) : 2000 * attempt;
      await sleep(ms);
      continue;
    }
    if (res.status >= 500) { await sleep(700 * attempt); continue; }
    throw lastErr; // 4xx: inutile riprovare
  }
  throw lastErr;
}

// ── Lista e campi ────────────────────────────────────────────────────────────
/** Custom field della lista, cache KV 1h (i nomi si risolvono a runtime). */
export async function getListFields(listId, { force = false } = {}) {
  const key = `hr:clickup:fields:${listId}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit?.fields) return hit.fields;
  }
  const d = await cu(`/list/${listId}/field`);
  const fields = (d.fields || []).map((f) => ({ id: f.id, name: f.name, type: f.type, type_config: f.type_config || {} }));
  await kv.set(key, { at: Date.now(), fields }, { ex: FIELDS_TTL }).catch(() => {});
  return fields;
}

/** Persone che possono stare nel campo "Referent" (membri con accesso alla lista), cache KV 1h. */
export async function getListMembers(listId, { force = false } = {}) {
  const key = `hr:clickup:members:${listId}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit?.members) return hit.members;
  }
  const d = await cu(`/list/${listId}/member`);
  const members = (d.members || []).map((m) => ({ id: String(m.id), name: String(m.username || m.email || ""), email: String(m.email || "").toLowerCase() || null }))
    .filter((m) => m.id && m.name).sort((a, b) => a.name.localeCompare(b.name, "it"));
  await kv.set(key, { at: Date.now(), members }, { ex: FIELDS_TTL }).catch(() => {});
  return members;
}

/** Lista (nome, status), cache KV 1h. */
export async function getListInfo(listId, { force = false } = {}) {
  const key = `hr:clickup:list:${listId}`;
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit?.id) return hit;
  }
  const d = await cu(`/list/${listId}`);
  const info = {
    id: String(d.id), name: d.name || "", spaceId: d.space?.id ? String(d.space.id) : null,
    statuses: (d.statuses || []).map((st) => ({ status: st.status, type: st.type, orderindex: st.orderindex })),
    at: Date.now(),
  };
  await kv.set(key, info, { ex: FIELDS_TTL }).catch(() => {});
  return info;
}

/** Tutti i task della lista, con custom field (100 per pagina). */
export async function listAllTasks(listId, { maxPages = 50 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await cu(`/list/${listId}/task?page=${page}&include_closed=true&subtasks=false&archived=false`);
    out.push(...(d.tasks || []));
    if (d.last_page || !(d.tasks || []).length) break;
  }
  return out;
}

export const getTask = (taskId) => cu(`/task/${encodeURIComponent(taskId)}`);
export const createTask = (listId, payload) => cu(`/list/${listId}/task`, { method: "POST", json: payload });
export const updateTask = (taskId, payload) => cu(`/task/${encodeURIComponent(taskId)}`, { method: "PUT", json: payload });
export const setField = (taskId, fieldId, body) => cu(`/task/${encodeURIComponent(taskId)}/field/${fieldId}`, { method: "POST", json: body });
export const removeField = (taskId, fieldId) => cu(`/task/${encodeURIComponent(taskId)}/field/${fieldId}`, { method: "DELETE" });
// Niente deleteTask (03/10/2026): da procedura HOC Pro non cancella mai un task HR.

/** Allegato al task (multipart, campo "attachment"). Il file non passa da KV. */
export async function uploadAttachment(taskId, { filename, bytes, contentType }) {
  const form = new FormData();
  form.append("attachment", new Blob([bytes], { type: contentType }), filename);
  return cu(`/task/${encodeURIComponent(taskId)}/attachment`, { method: "POST", form });
}

// ── Workspace e webhook ──────────────────────────────────────────────────────
/** Team (workspace) id: env HR_CLICKUP_TEAM_ID, altrimenti l'unico visibile al token. */
export async function resolveTeamId() {
  const env = String(process.env.HR_CLICKUP_TEAM_ID || "").trim();
  if (env) return env;
  const d = await cu(`/team`);
  const teams = d.teams || [];
  if (teams.length === 1) return String(teams[0].id);
  if (!teams.length) throw new ClickupError("Il token non vede nessun workspace ClickUp", 0);
  throw new ClickupError(`Il token vede ${teams.length} workspace: imposta HR_CLICKUP_TEAM_ID`, 0);
}

// taskStatusUpdated (03/10/2026): lo stato del task porta la fase della persona. Un webhook
// registrato prima non lo riceve: va registrato di nuovo da /admin/hr/sync.
export const HR_WEBHOOK_EVENTS = ["taskCreated", "taskUpdated", "taskStatusUpdated", "taskDeleted"];

export async function createWebhook(teamId, { endpoint, listId }) {
  return cu(`/team/${teamId}/webhook`, { method: "POST", json: { endpoint, events: HR_WEBHOOK_EVENTS, list_id: Number(listId) || listId } });
}
export const deleteWebhook = (webhookId) => cu(`/webhook/${webhookId}`, { method: "DELETE" });
/** Una vista ClickUp (colonne comprese) e il suo aggiornamento (PUT vuole la vista intera). */
export async function getView(viewId) {
  const r = await cu(`/view/${encodeURIComponent(viewId)}`);
  return r?.view || r;
}
export const updateView = (viewId, view) => cu(`/view/${encodeURIComponent(viewId)}`, { method: "PUT", json: view });

/** Webhook del workspace, ognuno con `health: { status: "active"|"failing"|"suspended", fail_count }`. */
export async function listWebhooks(teamId) {
  const r = await cu(`/team/${teamId}/webhook`);
  return r?.webhooks || [];
}
