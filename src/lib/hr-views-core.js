/**
 * Viste del CRM su ClickUp riallineate ai campi nuovi (18/10/2026) — parte pura, testabile.
 *
 * Il New CRM è nato come copia del CRM vecchio e ne ha ereditato le 31 viste, che però
 * leggono i campi VECCHI: raggruppano per «Role» (nel New CRM la mansione sta in «Mansione»)
 * e le viste per creator filtrano su «Project» («Model - Elisa»…), mentre ora le creator stanno
 * in «Progetto». Risultato visto il 18/10: «Anagrafica Collaboratori» con 89 persone tutte in
 * «Vuoto», «CRM Elisa Vimercati» vuota. Nicholas: le viste devono esserci tutte e funzionare.
 *
 * Regole:
 *  - raggruppamento per Role → per Mansione;
 *  - vista «CRM <creator>»: filtro Project → Progetto con la creator del NOME della vista
 *    (il valore vecchio «Model - Elisa» è ambiguo: Elisa Vimercati o Elisa Esposito); «CRM Fishball»
 *    → Fishball ITA + Fishball ENG. Creator che non è più tra i Progetti → la vista resta com'è
 *    (si dichiara, non si inventa un filtro);
 *  - colonne Role/Project visibili → anche Mansione/Progetto; Partita IVA visibile nelle viste
 *    principali;
 *  - le creator del Progetto senza vista ricevono una vista «CRM <creator>» copiata da una esistente;
 *  - ordine: le viste principali in testa, poi le creator in ordine alfabetico, i moduli in fondo.
 */

export const MAIN_VIEWS = ["Persone", "Collaboratori senza contratto", "Anagrafica Collaboratori", "HV Contract Tracking", "Dashboard - Collaboratori", "Elenco", "Board", "Team"];
export const TAIL_VIEWS = ["Form CRM", "Form CRM ENG", "HV Contract Tracking Modelle"];
export const PIVA_VIEWS = ["Persone", "Collaboratori senza contratto", "Anagrafica Collaboratori", "HV Contract Tracking"];

export const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cfKey = (f) => (f ? `cf_${f.id}` : null);
const optionsOf = (f) => (f?.type_config?.options || []).map((o) => ({ id: String(o.id), label: String(o.label ?? o.name ?? "") }));

/** Campi che servono, per nome. */
export function pickFields(meta = []) {
  const by = (n) => meta.find((m) => norm(m.name) === norm(n)) || null;
  return { role: by("Role"), mansione: by("Mansione"), project: by("Project"), progetto: by("Progetto"), piva: by("Partita IVA") };
}

/** «CRM Elisa Vimercati» → id delle opzioni Progetto (Fishball → ITA+ENG). null = non è una vista creator. */
export function progettoForView(viewName, progettoField) {
  const m = /^CRM\s+(.+)$/i.exec(String(viewName || "").trim());
  if (!m) return null;
  const who = norm(m[1]);
  const opts = optionsOf(progettoField);
  const hits = opts.filter((o) => norm(o.label) === who || norm(o.label).startsWith(who + " "));
  return { creator: m[1].trim(), optionIds: hits.map((o) => o.id), labels: hits.map((o) => o.label) };
}

/** Sostituisce, in qualsiasi profondità, i filtri sul campo `from` con `to` e i valori dati. */
export function rewriteFilters(filters, fromKey, toKey, values) {
  let changed = false;
  const walk = (node) => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const out = { ...node };
    if (out.field === fromKey) { out.field = toKey; out.values = [...values]; if (!out.op || /^(EQ|IS)$/i.test(out.op)) out.op = "ANY"; changed = true; }
    if (Array.isArray(out.fields)) out.fields = out.fields.map(walk);
    if (Array.isArray(out.groups)) out.groups = out.groups.map(walk);
    return out;
  };
  const next = walk(filters);
  return { filters: next, changed };
}

/** Il filtro della vista nomina il campo? (anche annidato) */
export function filtersMention(filters, key) {
  let hit = false;
  const walk = (n) => { if (!n || typeof n !== "object" || hit) return; if (Array.isArray(n)) return n.forEach(walk); if (n.field === key) hit = true; (n.fields || []).forEach(walk); (n.groups || []).forEach(walk); };
  walk(filters);
  return hit;
}

/** Colonne: rende visibile `key` (se già c'è, la scopre), dopo `afterKey` se possibile. */
function showColumn(fields, key, afterKey = null) {
  const cur = fields.find((c) => c.field === key);
  if (cur) { if (!cur.hidden) return false; cur.hidden = false; return true; }
  const i = afterKey ? fields.findIndex((c) => c.field === afterKey) : -1;
  const col = { field: key, hidden: false };
  if (i >= 0) fields.splice(i + 1, 0, col); else fields.push(col);
  return true;
}

/**
 * Piano per UNA vista. @returns { changes: string[], warnings: string[], patch: object|null }
 * `patch` = la vista intera da rimandare a ClickUp (PUT vuole la vista completa), null se niente da fare.
 */
export function planView(view, F) {
  const changes = [];
  const warnings = [];
  const next = JSON.parse(JSON.stringify(view || {}));
  const name = String(view?.name || "");
  // 1) raggruppamento
  if (F.role && F.mansione && next.grouping?.field === cfKey(F.role)) {
    next.grouping = { ...next.grouping, field: cfKey(F.mansione) };
    changes.push("raggruppa per Mansione invece di Role");
  }
  // 2) filtro creator
  if (F.project && filtersMention(next.filters, cfKey(F.project))) {
    const p = progettoForView(name, F.progetto);
    if (p && p.optionIds.length && F.progetto) {
      const r = rewriteFilters(next.filters, cfKey(F.project), cfKey(F.progetto), p.optionIds);
      next.filters = r.filters;
      if (r.changed) changes.push(`filtro Progetto = ${p.labels.join(" + ")} (prima Project)`);
    } else {
      warnings.push(p ? `«${p.creator}» non è tra le creator del campo Progetto: filtro lasciato su Project` : "filtra su Project ma non è una vista «CRM creator»: lasciata com'è");
    }
  }
  // 3) colonne
  if (Array.isArray(next.columns?.fields)) {
    const cols = next.columns.fields;
    const visible = (f) => f && cols.some((c) => c.field === cfKey(f) && !c.hidden);
    if (visible(F.role) && F.mansione && showColumn(cols, cfKey(F.mansione), cfKey(F.role))) changes.push("colonna Mansione");
    if (visible(F.project) && F.progetto && showColumn(cols, cfKey(F.progetto), cfKey(F.project))) changes.push("colonna Progetto");
    if (PIVA_VIEWS.includes(name) && F.piva && showColumn(cols, cfKey(F.piva))) changes.push("colonna Partita IVA");
  }
  if (!changes.length) return { changes, warnings, patch: null };
  const { id, date_created, creator, visibility, protected: _p, protected_note, protected_by, date_protected, orderindex, ...rest } = next;
  return { changes, warnings, patch: rest };
}

/** Creator del campo Progetto che non hanno una vista «CRM …» (Fishball ITA/ENG = «CRM Fishball»). */
export function missingCreatorViews(views, F) {
  const names = new Set((views || []).map((v) => norm(v.name)));
  const out = [];
  for (const o of optionsOf(F.progetto)) {
    if (norm(o.label) === "interno") continue;
    const base = /^fishball /i.test(o.label) ? "Fishball" : o.label;
    if (names.has(norm(`CRM ${base}`)) || out.some((x) => x.name === `CRM ${base}`)) continue;
    out.push({ name: `CRM ${base}`, optionIds: optionsOf(F.progetto).filter((x) => (base === "Fishball" ? /^fishball /i.test(x.label) : x.id === o.id)).map((x) => x.id) });
  }
  return out;
}

/** Ordine voluto: principali, creator in ordine alfabetico, altre, moduli e modelle in fondo. */
export function desiredOrder(names) {
  const rank = (n) => {
    const i = MAIN_VIEWS.indexOf(n);
    if (i >= 0) return [0, i, ""];
    const t = TAIL_VIEWS.indexOf(n);
    if (t >= 0) return [3, t, ""];
    if (/^CRM\s/i.test(n)) return [1, 0, norm(n)];
    return [2, 0, norm(n)];
  };
  return [...names].sort((a, b) => {
    const x = rank(a), y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
  });
}
