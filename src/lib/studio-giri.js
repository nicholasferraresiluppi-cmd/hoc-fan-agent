// La redazione video — archivio dei giri (6/11/2026). Logica in studio-giri-core.js.
//
// Il montaggio gira fuori dall'app (in sessione, sul Mac): a fine giro chi l'ha fatto lo registra con
// scripts/studio-giro.mjs, che scrive qui e lascia il battito per la Sede. Nell'app si legge e basta.
//
// Chiavi:
//   studio:giri:{pid}                  [giro…] dal più recente
//   cron:heartbeat:redazione-video     { at, via, result } — l'ultimo giro registrato, su qualunque profilo
import { kv } from "@vercel/kv";
import { validateGiro, upsertGiro, beatLine } from "./studio-giri-core.js";

const key = (pid) => `studio:giri:${pid}`;
export const BEAT_KEY = "cron:heartbeat:redazione-video";

export async function getGiri(pid) {
  const v = await kv.get(key(pid));
  return Array.isArray(v) ? v : [];
}

export async function recordGiro(pid, handle, raw) {
  const res = validateGiro(raw);
  if (!res.ok) return res;
  const list = upsertGiro(await getGiri(pid), res.giro);
  await kv.set(key(pid), list);
  await kv.set(BEAT_KEY, { at: Date.now(), via: "sessione", result: beatLine(handle, res.giro) }, { ex: 120 * 86400 });
  return { ok: true, giro: res.giro, total: list.length };
}
