// Memoria breve dei permessi (29/10/2026). Misurato in produzione: ogni richiesta pagava
// ~300 ms anche quando non faceva quasi niente, perché il controllo dei permessi rifaceva una
// dozzina di letture dell'archivio in fila (admin, ruoli, profilo Clerk, 2FA, ruoli personalizzati)
// e authorize() ripeteva il controllo admin per il ruolo principale.
//
// Qui il risultato si tiene per persona 30 secondi, nella memoria dell'istanza del server, e
// nella stessa richiesta non si ricalcola mai due volte (si condivide anche la promessa in corso).
// La chiave contiene il cookie di «Vedi come»: l'anteprima di un admin non si mescola mai con
// la sua sessione normale. Chi cambia ruoli o admin chiama forgetAuthz(): vale subito su questa
// istanza, sulle altre al massimo dopo 30 secondi (stesso compromesso della cache profilo Clerk).
import { cookies } from "next/headers";

const TTL_MS = 30_000;
const MAX = 2000;
const store = new Map(); // key → { at, p }

async function viewAsTag() {
  try { return (await cookies()).get("hoc_view_as")?.value || ""; } catch { return ""; }
}

/** Esegue fn una volta per (nome, persona, anteprima) ogni 30 s. */
export async function memoAuthz(name, userId, fn) {
  if (!userId) return fn();
  const key = `${name}|${userId}|${await viewAsTag()}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = Promise.resolve().then(fn);
  store.set(key, { at: Date.now(), p });
  if (store.size > MAX) store.delete(store.keys().next().value);
  // un errore non resta in memoria
  p.catch(() => { if (store.get(key)?.p === p) store.delete(key); });
  return p;
}

/** Dimentica i permessi di una persona (o di tutti) su questa istanza. */
export function forgetAuthz(userId) {
  if (!userId) { store.clear(); return; }
  for (const k of [...store.keys()]) if (k.split("|")[1] === userId) store.delete(k);
}
