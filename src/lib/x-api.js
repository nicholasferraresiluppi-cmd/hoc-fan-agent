// Client minimo dell'API ufficiale di X (v2, a consumo) — solo LETTURA.
//
// Account sviluppatore «HOC Pro Research» (console.x.com, 25/10/2026), credito prepagato senza
// ricarica automatica: finito il credito le chiamate tornano 402 e ci si ferma, niente sorprese.
// Chiave in env `X_API_BEARER_TOKEN` (Vercel, solo Production). Prezzi in warmup-xrefs-core X_PRICE.
// Ogni post e ogni profilo in una risposta si paga a parte: le chiamate chiedono il minimo che serve.
import { X_USER_FIELDS, X_TWEET_FIELDS } from "@/lib/warmup-xrefs-core";

const BASE = "https://api.x.com/2";

export const xApiConfigured = () => Boolean(process.env.X_API_BEARER_TOKEN);

async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  const r = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}` }, cache: "no-store" });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) {
    const msg = body?.detail || body?.title || body?.errors?.[0]?.message || text.slice(0, 160);
    if (r.status === 402) throw new Error("API di X: credito finito — va ricaricato su console.x.com");
    if (r.status === 429) throw new Error("API di X: troppe richieste, si riprova tra qualche minuto");
    throw new Error(`API di X ${r.status}: ${msg}`);
  }
  return body || {};
}

const TWEET = { "tweet.fields": X_TWEET_FIELDS, expansions: "author_id,attachments.media_keys", "user.fields": X_USER_FIELDS, "media.fields": "type" };

/** Ricerca negli ultimi 7 giorni, ordinata per rilevanza (max 100 post). */
export const searchRecent = (query, max = 100) =>
  get("/tweets/search/recent", { query, max_results: Math.max(10, Math.min(100, max)), sort_order: "relevancy", ...TWEET });

/** Profili per handle (max 100 a chiamata). */
export const usersByUsernames = (handles) =>
  get("/users/by", { usernames: handles.slice(0, 100).join(","), "user.fields": X_USER_FIELDS });

/** Ultimi post di un utente, risposte comprese (servono per vedere come risponde); niente repost. */
export const userTimeline = (id, max = 60) =>
  get(`/users/${id}/tweets`, { max_results: Math.max(5, Math.min(100, max)), exclude: "retweets", ...TWEET });

/** Chi segue un utente (una pagina). */
export const userFollowing = (id, max = 150) =>
  get(`/users/${id}/following`, { max_results: Math.max(1, Math.min(1000, max)), "user.fields": X_USER_FIELDS });
