// Google Calendar, solo OCCUPATO/LIBERO (27/09/2026) — per "è in call o posso chiamarlo?" negli
// uffici della città. Legge SOLO la disponibilità (scope calendar.freebusy): niente titoli,
// partecipanti o contenuti degli eventi, e nessuno storico salvato (cache di 2 minuti).
//
// Auth: lo stesso service account di BigQuery (BIGQUERY_SA_KEY, o GOOGLE_CALENDAR_SA_KEY se si
// vuole separarlo) con delega a livello di dominio, che l'amministratore del Workspace concede
// al client id del service account per il solo scope qui sotto. Si agisce "come"
// GOOGLE_CALENDAR_SUBJECT (un utente del dominio): vede la disponibilità dei colleghi come la
// vedrebbe lui aprendo Calendar. Senza queste due cose la funzione dice "non collegato".
import crypto from "crypto";
import { kv } from "@vercel/kv";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
const CACHE_S = 120;

function sa() {
  const raw = process.env.GOOGLE_CALENDAR_SA_KEY || process.env.BIGQUERY_SA_KEY;
  if (!raw || !process.env.GOOGLE_CALENDAR_SUBJECT) return null;
  try {
    const t = raw.trim();
    const j = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}
export const calendarConfigured = () => Boolean(sa());

const b64u = (x) => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
let tok = { token: null, exp: 0 };
async function token() {
  if (tok.token && tok.exp > Date.now() + 30_000) return tok.token;
  const k = sa();
  const iat = Math.floor(Date.now() / 1000);
  const input = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: k.client_email, sub: process.env.GOOGLE_CALENDAR_SUBJECT, scope: SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }))}`;
  const sig = crypto.createSign("RSA-SHA256").update(input).sign(k.private_key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const r = await fetch(TOKEN_URI, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${sig}` }) });
  const d = await r.json().catch(() => ({}));
  // unauthorized_client = la delega nel Workspace non è ancora stata concessa
  if (!r.ok) throw new Error(d?.error === "unauthorized_client" ? "Delega Google Workspace non ancora concessa" : `Google auth ${r.status}`);
  tok = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return tok.token;
}

/**
 * Stato di adesso per ogni email: { [email]: { busy: bool, until: ms|null, next: ms|null } }.
 * `until` = fine dell'impegno in corso; `next` = inizio del prossimo entro la finestra (oggi).
 * Email sconosciute o calendari non visibili → assenti dal risultato (mai "libero" inventato).
 */
export async function freeBusyNow(emails, now = Date.now()) {
  const list = [...new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e)))].slice(0, 80);
  if (!list.length || !calendarConfigured()) return {};
  const ck = `citta:fb:${crypto.createHash("sha1").update(list.sort().join(",")).digest("hex").slice(0, 16)}`;
  const hit = await kv.get(ck).catch(() => null);
  if (hit && now - hit.at < CACHE_S * 1000) return hit.out;
  const end = now + 10 * 3600 * 1000;
  const bearer = await token();
  // Google risponde "tooManyCalendarsRequested" oltre 20 calendari per richiesta: gruppi da 20
  const groups = [];
  for (let i = 0; i < list.length; i += 20) groups.push(list.slice(i, i + 20));
  const replies = await Promise.all(groups.map(async (g) => {
    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: new Date(now).toISOString(), timeMax: new Date(end).toISOString(), items: g.map((id) => ({ id })) }),
    });
    if (!r.ok) throw new Error(`Google Calendar ${r.status}`);
    return (await r.json()).calendars || {};
  }));
  const out = {};
  for (const [email, c] of replies.flatMap((x) => Object.entries(x))) {
    if (c.errors?.length) continue;
    const slots = (c.busy || []).map((b) => [Date.parse(b.start), Date.parse(b.end)]).filter(([s, e]) => e > now).sort((a, b) => a[0] - b[0]);
    const cur = slots.find(([s, e]) => s <= now && e > now);
    let until = cur ? cur[1] : null;
    if (cur) for (const [s, e] of slots) if (s <= until && e > until) until = e; // impegni attaccati
    const next = slots.find(([s]) => s > (until || now));
    out[email.toLowerCase()] = { busy: Boolean(cur), until, next: next ? next[0] : null };
  }
  await kv.set(ck, { at: now, out }, { ex: CACHE_S * 2 }).catch(() => {});
  return out;
}
