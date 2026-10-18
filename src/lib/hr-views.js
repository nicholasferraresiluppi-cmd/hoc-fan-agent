/**
 * Riallineamento delle viste del CRM su ClickUp (18/10/2026). Solo server, regole in hr-views-core.js.
 * Prima un'ANTEPRIMA (nessuna scrittura), poi `apply` scrive vista per vista. L'esito resta in KV
 * (`hr:views:last`) e si legge da /admin/hr/sync.
 */
import { kv } from "@vercel/kv";
import { hrSyncConfig, getListFields, listListViews, getView, updateView, createListView } from "./clickup-hr-api.js";
import { pickFields, planView, missingCreatorViews, desiredOrder, progettoForView, rewriteFilters } from "./hr-views-core.js";

const LAST = "hr:views:last";

export async function realignCrmViews({ apply = false, by = "sistema", budgetMs = 50_000 } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, error: "Sincronizzazione ClickUp spenta." };
  const deadline = Date.now() + budgetMs;
  const [meta, list] = await Promise.all([getListFields(cfg.listId), listListViews(cfg.listId)]);
  const F = pickFields(meta);
  const missingFields = Object.entries({ Mansione: F.mansione, Progetto: F.progetto, "Partita IVA": F.piva }).filter(([, v]) => !v).map(([k]) => k);
  const rows = [];
  let template = null;
  for (const v of list) {
    if (Date.now() > deadline) { rows.push({ name: v.name, error: "tempo finito: rilancia" }); continue; }
    const full = await getView(v.id).catch((e) => ({ _err: e?.message }));
    if (full?._err) { rows.push({ name: v.name, error: full._err }); continue; }
    const plan = planView(full, F);
    const row = { id: v.id, name: v.name, type: full.type, changes: plan.changes, warnings: plan.warnings, done: false };
    if (!template && /^CRM\s/i.test(v.name) && progettoForView(v.name, F.progetto)?.optionIds.length) template = { view: full, plan };
    if (apply && plan.patch) {
      try { await updateView(v.id, plan.patch); row.done = true; } catch (e) { row.error = e?.message || "errore"; }
    }
    rows.push(row);
  }
  // viste nuove per le creator del Progetto che non ce l'hanno (copiate da una vista creator già sistemata)
  const toCreate = missingCreatorViews(list, F);
  const created = [];
  for (const c of toCreate) {
    const item = { name: c.name, done: false };
    if (apply && template && Date.now() < deadline) {
      const base = template.plan.patch || (() => { const { id, date_created, creator, visibility, protected: _p, protected_note, protected_by, date_protected, orderindex, ...r } = template.view; return r; })();
      const filters = rewriteFilters(base.filters, `cf_${F.progetto.id}`, `cf_${F.progetto.id}`, c.optionIds).filters;
      try { await createListView(cfg.listId, { ...base, name: c.name, filters }); item.done = true; } catch (e) { item.error = e?.message || "errore"; }
    } else if (apply && !template) item.error = "nessuna vista creator da copiare";
    created.push(item);
  }
  const report = {
    at: Date.now(), by, apply, missingFields,
    views: rows, created,
    order: desiredOrder([...list.map((v) => v.name), ...created.filter((c) => c.done || !apply).map((c) => c.name)]),
  };
  await kv.set(LAST, report).catch(() => {});
  return { ok: true, ...report };
}

export const lastViewsReport = () => kv.get(LAST).catch(() => null);

