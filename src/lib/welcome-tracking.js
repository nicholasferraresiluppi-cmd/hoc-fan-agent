// Benvenuto a pagamento — prezzi inseriti a mano (KV). Definizioni in lib/welcome-tracking-core.js.
//
// Un prezzo a mano serve quando il benvenuto non si legge dalle chat (mandato con un altro strumento,
// o un messaggio che le chat non vedono): da quella data HOC Pro cerca gli acquisti a quel prezzo tra
// i nuovi iscritti della pagina. I numeri li vedono tutti quelli che vedono la pagina: un prezzo
// inserito da un sales manager vale per tutti.
//
// KV `welcome:rules` (elenco) + `welcome:rules:log` (ultime 200 modifiche, chi e quando).

import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { validateRule } from "@/lib/welcome-tracking-core";

const KEY = "welcome:rules";
const LOG = "welcome:rules:log";
const LOG_CAP = 200;

export async function listRules() {
  const list = await kv.get(KEY).catch(() => null);
  return Array.isArray(list) ? list : [];
}

/** Firma dell'elenco: entra nella chiave di cache delle viste, così un prezzo nuovo si vede subito. */
export function rulesStamp(rules) {
  return rules.map((r) => `${r.id}:${r.updated_at || r.created_at}`).sort().join(",").slice(0, 2000) || "0";
}

async function log(entry) {
  await kv.lpush(LOG, { ...entry, at: new Date().toISOString() }).catch(() => {});
  await kv.ltrim(LOG, 0, LOG_CAP - 1).catch(() => {});
}

/** Crea o modifica (con `id`). `allowed(creator_id)` = la pagina è visibile a chi scrive. */
export async function saveRule(input, { userId, userName, allowed }) {
  const v = validateRule(input);
  if (!v.ok) return v;
  if (!allowed(v.rule.creator_id)) return { ok: false, status: 403, error: "Questa pagina non è tra le tue" };
  const rules = await listRules();
  const now = new Date().toISOString();
  if (input.id) {
    const i = rules.findIndex((r) => r.id === input.id);
    if (i < 0) return { ok: false, status: 404, error: "Prezzo non trovato" };
    if (!allowed(rules[i].creator_id)) return { ok: false, status: 403, error: "Questa pagina non è tra le tue" };
    rules[i] = { ...rules[i], ...v.rule, updated_at: now, updated_by: userId, updated_by_name: userName };
    await kv.set(KEY, rules);
    await log({ op: "modifica", rule: rules[i], by: userName || userId });
    return { ok: true, rule: rules[i] };
  }
  const rule = { id: randomUUID().replace(/-/g, "").slice(0, 12), ...v.rule, created_at: now, created_by: userId, created_by_name: userName };
  rules.push(rule);
  await kv.set(KEY, rules);
  await log({ op: "nuovo", rule, by: userName || userId });
  return { ok: true, rule };
}

export async function deleteRule(id, { userId, userName, allowed }) {
  const rules = await listRules();
  const rule = rules.find((r) => r.id === id);
  if (!rule) return { ok: false, status: 404, error: "Prezzo non trovato" };
  if (!allowed(rule.creator_id)) return { ok: false, status: 403, error: "Questa pagina non è tra le tue" };
  await kv.set(KEY, rules.filter((r) => r.id !== id));
  await log({ op: "tolto", rule, by: userName || userId });
  return { ok: true };
}
