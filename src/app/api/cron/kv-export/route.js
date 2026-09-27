/**
 * Esportazione del database (Vercel KV) per il backup notturno (25/09/2026).
 *
 * PERCHÉ: ruoli, fee, split, esperimenti, decisioni HR, storico score vivono
 * SOLO qui, senza copia. Un errore (o una chiave cancellata) = dati persi.
 * Un job GitHub Actions (repo privato hoc-pro-backups) chiama questa route ogni
 * notte, pagina per pagina, cifra il risultato e lo conserva 90 giorni.
 *
 * Si ESCLUDE solo ciò che si ricostruisce da solo (cache, contatori di limite,
 * dati scaricabili di nuovo dalle fonti): vedi SKIP.
 *
 * Auth: SOLO Bearer CRON_SECRET (route pubblica nel middleware, niente sessione).
 * GET ?cursor=<n>  → { keys: { [key]: { type, ttl, value } }, next_cursor, done }
 */
import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 60;
const PAGE = 250;
const SKIP = [/^rl:/, /^mfa:ok:/, /^bq:pq/, /^cp:wagechunk:/, /^cp:wages:/, /^infloww:txns:/, /^infloww:refunds:/, /^sales:coach:/, /^academy:signals/, /^operator:signals/, /^operator:progress/, /^creator:difficulty/];

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cursor = new URL(request.url).searchParams.get("cursor") || "0";
  const [next, rawKeys] = await kv.scan(cursor, { count: PAGE });
  const keys = rawKeys.filter((k) => !SKIP.some((re) => re.test(k)));
  const out = {};
  if (keys.length) {
    const p1 = kv.pipeline();
    for (const k of keys) { p1.type(k); p1.ttl(k); }
    const meta = await p1.exec();
    const p2 = kv.pipeline();
    keys.forEach((k, i) => {
      const t = meta[i * 2];
      if (t === "string") p2.get(k);
      else if (t === "hash") p2.hgetall(k);
      else if (t === "set") p2.smembers(k);
      else if (t === "zset") p2.zrange(k, 0, -1, { withScores: true });
      else if (t === "list") p2.lrange(k, 0, -1);
      else p2.exists(k);
    });
    const vals = await p2.exec();
    keys.forEach((k, i) => { out[k] = { type: meta[i * 2], ttl: meta[i * 2 + 1], value: vals[i] }; });
  }
  const nc = String(next);
  return Response.json({ keys: out, next_cursor: nc, done: nc === "0", skipped: rawKeys.length - keys.length });
}
