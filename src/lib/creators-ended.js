/**
 * Creator che hanno smesso di lavorare con HOC — KV `creators:ended`
 * { [alias CP]: { ended_on: "YYYY-MM-DD", by, at } }.
 *
 * Serve ai controlli sui dati: una creator che ha smesso a fine agosto con
 * 0 turni a settembre NON è un buco di dati (caso Annarita Esposito, 25/09/2026).
 * Si gestisce da /admin/alerts (sezione "Creator terminate").
 */
import { kv } from "@vercel/kv";

const KEY = "creators:ended";

export async function getEndedCreators() {
  const v = await kv.get(KEY).catch(() => null);
  return v && typeof v === "object" ? v : {};
}

export async function setEndedCreator(alias, endedOn, by) {
  const a = String(alias || "").trim();
  if (!a || a.length > 120) throw new Error("Creator non valida");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endedOn || ""))) throw new Error("Data non valida (AAAA-MM-GG)");
  const all = await getEndedCreators();
  all[a] = { ended_on: endedOn, by, at: Date.now() };
  await kv.set(KEY, all);
  return all;
}

export async function removeEndedCreator(alias) {
  const all = await getEndedCreators();
  delete all[String(alias || "").trim()];
  await kv.set(KEY, all);
  return all;
}
