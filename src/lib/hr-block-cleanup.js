/**
 * Pulizia una tantum delle descrizioni del CRM (18/10/2026): toglie la riga «Prepara il contratto: …»
 * dal blocco «— Dati HOC Pro —» di tutte le schede (i contratti si fanno a mano). Tocca solo le
 * descrizioni che la contengono e solo quella riga. A budget: se il tempo finisce si rilancia
 * (bottone in /admin/hr/sync, e il giro di notte finché resta qualcosa).
 */
import { kv } from "@vercel/kv";
import { hrSyncConfig, listAllTasks, updateTask } from "./clickup-hr-api.js";
import { withoutContractLink } from "./hr-clickup-map.js";

const DONE = "hr:cleanup:contract-link:done";

export async function stripContractLinks({ budgetMs = 40_000 } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, reason: "sincronizzazione ClickUp spenta" };
  if (await kv.get(DONE).catch(() => null)) return { ok: true, already: true, cleaned: 0, left: 0 };
  const deadline = Date.now() + budgetMs;
  const tasks = await listAllTasks(cfg.listId);
  const todo = tasks.map((t) => ({ id: t.id, next: withoutContractLink(t.description ?? t.text_content) })).filter((x) => x.next !== null);
  let cleaned = 0;
  const errors = [];
  for (const t of todo) {
    if (Date.now() > deadline) break;
    try { await updateTask(t.id, { description: t.next }); cleaned++; } catch (e) { errors.push(`${t.id}: ${e.message}`.slice(0, 120)); }
  }
  const left = todo.length - cleaned;
  if (!left && !errors.length) await kv.set(DONE, Date.now()).catch(() => {});
  return { ok: true, scanned: tasks.length, found: todo.length, cleaned, left, errors };
}
