/**
 * Segnalazioni e suggerimenti dall'app (tasto in basso a destra, 25/09/2026).
 * KV `feedback:inbox` — LIST di JSON, più recenti in testa, cap 1000.
 * La pagina da cui si scrive è allegata in automatico: "questo non funziona"
 * senza sapere DOVE non serve a niente.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";

const KEY = "feedback:inbox";
export const KINDS = { problem: "Problema", idea: "Idea", question: "Domanda" };
export const STATUSES = { new: "Nuova", seen: "Letta", done: "Fatta" };

export async function addFeedback({ userId, name, page, kind, text }) {
  const t = String(text || "").trim();
  if (t.length < 3) throw new Error("Scrivi qualcosa in più");
  const item = {
    id: randomBytes(6).toString("hex"),
    at: Date.now(), userId, name: name || null,
    page: String(page || "").slice(0, 200),
    kind: KINDS[kind] ? kind : "idea",
    text: t.slice(0, 2000),
    status: "new",
  };
  await kv.lpush(KEY, JSON.stringify(item));
  await kv.ltrim(KEY, 0, 999);
  return item;
}

export async function listFeedback(limit = 200) {
  const raw = (await kv.lrange(KEY, 0, limit - 1)) || [];
  return raw.map((x) => (typeof x === "string" ? JSON.parse(x) : x));
}

export async function setFeedbackStatus(id, status) {
  if (!STATUSES[status]) throw new Error("Stato non valido");
  const raw = (await kv.lrange(KEY, 0, 999)) || [];
  for (let i = 0; i < raw.length; i++) {
    const it = typeof raw[i] === "string" ? JSON.parse(raw[i]) : raw[i];
    if (it.id === id) { it.status = status; await kv.lset(KEY, i, JSON.stringify(it)); return it; }
  }
  throw new Error("Segnalazione non trovata");
}
