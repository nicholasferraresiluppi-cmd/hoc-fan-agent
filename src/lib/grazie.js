// "Grazie" tra colleghi (27/09/2026, pannello cultura: riconoscimento specifico, sul comportamento,
// PRIVATO a chi lo riceve; lo condivide solo lei/lui se vuole; nessun contatore, nessuna classifica).
// KV: thanks:in:{userId} / thanks:out:{userId} (liste, max 200) · thanks:shared (ultimi 30 condivisi)
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

export const PRATICHE = ["Nostro, non mio", "Rispondi quando ti chiamano", "Porta il problema con una proposta", "Un pensiero, un messaggio", "Grazie invece di scusa", "Altro"];
const IN = (u) => `thanks:in:${u}`, OUT = (u) => `thanks:out:${u}`, SHARED = "thanks:shared";
const str = (v, n) => String(v ?? "").trim().slice(0, n);

export async function sendThanks({ from, to, pratica, text }) {
  const t = str(text, 280);
  if (!to?.userId || to.userId === from.userId) throw new Error("Scegli un collega (non te stesso).");
  if (t.length < 8) throw new Error("Scrivi cosa ha fatto: una frase specifica.");
  const item = { id: randomUUID(), from: { userId: from.userId, name: str(from.name, 60) }, to: { userId: to.userId, name: str(to.name, 60) }, pratica: PRATICHE.includes(pratica) ? pratica : "Altro", text: t, at: Date.now(), shared: false };
  await kv.lpush(IN(to.userId), JSON.stringify(item)); await kv.ltrim(IN(to.userId), 0, 199);
  await kv.lpush(OUT(from.userId), JSON.stringify(item)); await kv.ltrim(OUT(from.userId), 0, 199);
  return item;
}

const parse = (arr) => (arr || []).map((x) => (typeof x === "string" ? JSON.parse(x) : x));
export async function listThanks(userId) {
  const [inn, out] = await Promise.all([kv.lrange(IN(userId), 0, 99), kv.lrange(OUT(userId), 0, 49)]);
  return { received: parse(inn), sent: parse(out) };
}

/** Chi riceve decide se mostrarlo nella pagina "Come lavoriamo" (e può ritirarlo). */
export async function setShared(userId, id, on) {
  const list = parse(await kv.lrange(IN(userId), 0, 199));
  const it = list.find((x) => x.id === id);
  if (!it) throw new Error("Grazie non trovato.");
  it.shared = Boolean(on);
  await kv.del(IN(userId)); if (list.length) await kv.rpush(IN(userId), ...list.map((x) => JSON.stringify(x)));
  const shared = parse(await kv.lrange(SHARED, 0, 29)).filter((x) => x.id !== id);
  if (on) shared.unshift({ id: it.id, from: it.from.name, to: it.to.name, pratica: it.pratica, text: it.text, at: it.at });
  await kv.del(SHARED); if (shared.length) await kv.rpush(SHARED, ...shared.slice(0, 30).map((x) => JSON.stringify(x)));
  return it;
}
export async function listShared(n = 6) { return parse(await kv.lrange(SHARED, 0, n - 1)); }
