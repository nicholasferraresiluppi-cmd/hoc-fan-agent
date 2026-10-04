/**
 * /api/cron/controllori — Controllo delle uscite (Sede, 04/10/2026).
 *
 * Ogni mattina, DOPO i lavori della notte, controlla che il RISULTATO di ogni
 * ufficio senza controllore sia credibile (non vuoto, non vecchio, non crollato,
 * non in contraddizione con lo studio su cui si basa il coaching). Scrive l'esito
 * per ufficio in `sede:ctrl:{id}` (letto dalla Sede) e apre/chiude gli alert con
 * un giro PARZIALE del motore alert (solo il check "uscite-sospette": gli altri
 * alert non vengono toccati).
 *
 * Perché un cron suo e non un passo del centralino: i lavori notturni partono a
 * catena e in parallelo (citta, sales AI in batch…), il centralino non sa quando
 * finiscono. Alle 07:30 (05:30 UTC) sono finiti. Eccezione deliberata alla regola
 * "un solo cron", come la coda HR: progetto su Vercel Pro, un giro al giorno.
 *
 * Auth: Bearer CRON_SECRET oppure sessione SEED (prova a mano).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { CONTROLLI, runControl } from "@/lib/sede-controllori";
import { runChecks } from "@/lib/ops-alerts";
import { OPERATOR_SIGNALS_VERSION } from "@/lib/operator-signals";
import { SIGNALS_VERSION } from "@/lib/academy-signals";
import { TRANSFER_VERSION } from "@/lib/transfer-measurement";
import { CREATOR_DIFFICULTY_VERSION } from "@/lib/creator-difficulty";

export const runtime = "nodejs";
export const maxDuration = 60;

const safe = (p) => p.catch(() => null);

async function inputs() {
  const [op, ac, tr, cd, weekly, citBeat, queue] = await Promise.all([
    safe(kv.get(`operator:signals:${OPERATOR_SIGNALS_VERSION}`)),
    safe(kv.get(`academy:signals:${SIGNALS_VERSION}`)),
    safe(kv.get(`transfer:trajectories:${TRANSFER_VERSION}`)),
    safe(kv.get(`creator:difficulty:${CREATOR_DIFFICULTY_VERSION}`)),
    safe(kv.get("citta:weekly")),
    safe(kv.get("cron:heartbeat:citta-lunedi")),
    safe(kv.get("cron:heartbeat:queue-snapshot")),
  ]);
  return {
    "operator-signals": op, "academy-signals": ac, transfer: tr, "creator-difficulty": cd,
    "citta-lunedi": { weekly, beat: citBeat }, queue,
  };
}

async function handle(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const now = Date.now();
  const data = await inputs();
  const esiti = {};
  for (const c of CONTROLLI) {
    const prev = await safe(kv.get(`sede:ctrl:${c.id}`));
    const r = runControl(c, data[c.id], prev?.ok ? prev.metriche : prev?.ultime_buone || null, now);
    // la memoria per i confronti è l'ultimo risultato BUONO: un crollo non diventa la nuova normalità
    const rec = { at: now, ok: r.ok, problemi: r.problemi, metriche: r.metriche, ultime_buone: r.ok ? r.metriche : (prev?.ok ? prev.metriche : prev?.ultime_buone || null) };
    await kv.set(`sede:ctrl:${c.id}`, rec, { ex: 30 * 86400 });
    esiti[c.id] = { ok: r.ok, problemi: r.problemi };
  }
  const ko = Object.values(esiti).filter((x) => !x.ok).length;
  await kv.set("cron:heartbeat:controllori", { at: now, via: viaCron ? "cron" : "session", result: `${CONTROLLI.length - ko} uscite su ${CONTROLLI.length} credibili` }, { ex: 40 * 86400 }).catch(() => {});
  const alerts = await runChecks({ trigger: "controllori", only: ["uscite-sospette"] }).catch((e) => ({ error: String(e?.message || e) }));
  return Response.json({ esiti, alerts });
}

export const GET = async (request) => {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
};
export const POST = handle;
