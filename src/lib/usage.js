/**
 * Analytics d'uso — storage KV. Logica e report in usage-core.js.
 *
 *   usage:d:{YYYY-MM-DD}   HASH  "{userId}\t{pagina}" → aperture   (TTL 400g)
 *   usage:x:{YYYY-MM-DD}   HASH  segnali d'esperienza (vedi ux-client.js), aggregati per pagina:
 *       "c\t{pagina}\t{elemento}\t{fold|zona}" → clic
 *       "r\t{pagina}\t{elemento}"               → rage click
 *       "e\t{pagina}\t{messaggio}"              → errori JS
 *       "s\t{pagina}\tsum" / "s\t{pagina}\tn"   → profondità di scorrimento (somma %, n)
 *       "l\t{pagina}\tsum" / "l\t{pagina}\tn"   → tempo di caricamento (somma ms, n)
 *
 * Una HINCRBY per pagina aperta: costo trascurabile, nessun dato personale oltre
 * (chi, quale pagina, che giorno).
 */
import { kv } from "@vercel/kv";
import { dayId, lastDays, matchRoute } from "@/lib/usage-core";
import ROUTES from "@/lib/app-routes.generated.json";

const TTL = 400 * 24 * 3600;
const key = (d) => `usage:d:${d}`;

export async function recordView(userId, path) {
  const page = matchRoute(path, ROUTES);
  if (!userId || !page) return { ok: false };
  const d = dayId(Date.now());
  const n = await kv.hincrby(key(d), `${userId}\t${page}`, 1);
  if (n === 1) await kv.expire(key(d), TTL);
  return { ok: true, page };
}

export async function getUsageDays(n = 60) {
  const ds = lastDays(n);
  const rows = await Promise.all(ds.map((d) => kv.hgetall(key(d)).catch(() => null)));
  return Object.fromEntries(ds.map((d, i) => [d, rows[i] || {}]));
}

const xkey = (d) => `usage:x:${d}`;
const safe = (v, n = 40) => String(v ?? "").replace(/[\t\n\r]/g, " ").slice(0, n);

/** Segnali d'esperienza (batch ≤20). Nessun userId: sono aggregati per pagina. */
export async function recordEvents(events) {
  if (!Array.isArray(events)) return;
  const d = dayId(Date.now());
  const incs = {};
  const inc = (f, v = 1) => { incs[f] = (incs[f] || 0) + v; };
  for (const e of events.slice(0, 20)) {
    const page = matchRoute(String(e?.path || ""), ROUTES);
    if (!page) continue;
    if (e.type === "click") {
      const pos = /^(subito|scorrendo)\|(alto|metà-alta|metà-bassa|fondo)$/.test(e.pos) ? e.pos : "?|?";
      inc(`c\t${page}\t${safe(e.label)}\t${pos}`);
    } else if (e.type === "rage") inc(`r\t${page}\t${safe(e.label)}`);
    else if (e.type === "error") inc(`e\t${page}\t${safe(e.label)}`);
    else if (e.type === "scroll" && Number.isFinite(e.pct)) { inc(`s\t${page}\tsum`, Math.max(0, Math.min(100, Math.round(e.pct)))); inc(`s\t${page}\tn`); }
    else if (e.type === "load" && Number.isFinite(e.ms) && e.ms < 120000) { inc(`l\t${page}\tsum`, Math.round(e.ms)); inc(`l\t${page}\tn`); }
  }
  const entries = Object.entries(incs);
  if (!entries.length) return;
  await Promise.all(entries.map(([f, v]) => kv.hincrby(xkey(d), f, v)));
  await kv.expire(xkey(d), TTL);
}

export async function getUxDays(n = 30) {
  const ds = lastDays(n);
  const rows = await Promise.all(ds.map((d) => kv.hgetall(xkey(d)).catch(() => null)));
  return Object.fromEntries(ds.map((d, i) => [d, rows[i] || {}]));
}
