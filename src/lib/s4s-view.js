// S4S — la vista della pagina (calendario arricchito + risultati), costruita per uno split.
// Separata dalla route così si può far girare anche fuori da Next (verifica sui dati veri).

import { getNames, getResults, getAliases, syncPlan, WINDOW_DAYS, DEFAULT_WEEKDAYS } from "@/lib/s4s";
import {
  planSchedule, addDays, baseName, linkNameFor, buildAliasIndex, enrichResults, summarizeByPage,
  reciprocity, resultFor, lastExchange, langOf, MIN_MATURE,
} from "@/lib/s4s-core";

const PAST_DAYS = 28;
const FUTURE_DAYS = 56;
// "oggi" nel fuso italiano: alle 00:30 di giovedì è già giovedì, non mercoledì in UTC
const todayIT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

export async function buildView(split, { force = false, settings, userId } = {}) {
  const today = todayIT();
  const names = await getNames();
  const { plan, pages } = await syncPlan(split, names, today, { settings, userId });
  const [res, aliases] = await Promise.all([getResults(split.id, split.creator_ids, { force }), getAliases()]);
  const aliasIdx = buildAliasIndex(Object.values(names));
  const results = enrichResults(res.rows, names, aliasIdx, aliases);
  const nm = (id) => names[String(id)] || String(id);
  // Nome da mostrare: il nome base, più la lingua quando la stessa creator ha più pagine
  // nello split (Fishball IT e Fishball EN non possono comparire entrambe come "Fishball").
  const langOfId = (id) => plan.settings.lang_override[id] || langOf(nm(id)).lang;
  const baseCount = {};
  for (const p of pages) baseCount[baseName(p.name)] = (baseCount[baseName(p.name)] || 0) + 1;
  const disp = (id) => (baseCount[baseName(nm(id))] > 1 ? `${baseName(nm(id))} ${langOfId(id).toUpperCase()}` : baseName(nm(id)));

  const first = plan.segments[0]?.from || today;
  const from = first > addDays(today, -PAST_DAYS) ? first : addDays(today, -PAST_DAYS);
  const sameBase = (a, b) => baseName(nm(a)) === baseName(nm(b));
  const schedule = planSchedule(plan, from, addDays(today, FUTURE_DAYS), { sameBase }).map((d) => ({
    day: d.day,
    groups: Object.fromEntries(Object.entries(d.groups).map(([lang, g]) => [lang, {
      rest: g.rest.map((id) => ({ id, name: disp(id) })),
      pairs: g.pairs.map(([a, b]) => ({
        a: { id: a, name: disp(a), link: linkNameFor(nm(b), d.day), result: d.day <= today ? resultFor(results, a, nm(b), d.day) : null, last: lastExchange(results, a, nm(b), d.day) },
        b: { id: b, name: disp(b), link: linkNameFor(nm(a), d.day), result: d.day <= today ? resultFor(results, b, nm(a), d.day) : null, last: lastExchange(results, b, nm(a), d.day) },
      })),
    }])),
  }));

  // testi dei link che il sistema non ha saputo attribuire, dal più grosso
  const unmatched = new Map();
  for (const r of results) {
    if (r.partner || r.partner_source === "manuale" || !r.label_key) continue;
    const u = unmatched.get(r.label_key) || { label_key: r.label_key, label: r.partner_label, subs: 0, links: [] };
    u.subs += r.subs;
    u.links.push(`${disp(r.creator_id)} · ${r.link_name}`);
    unmatched.set(r.label_key, u);
  }

  return {
    today,
    split: { id: split.id, name: split.name },
    settings: plan.settings,
    segments: plan.segments.map((s) => ({ from: s.from, weekdays: s.weekdays, groups: s.groups })),
    pages: pages.map((p) => ({ id: p.id, name: disp(p.id), lang: langOfId(p.id), lang_guessed: !plan.settings.lang_override[p.id] && langOf(p.name).guessed, paused: plan.settings.paused.includes(Number(p.id)) })),
    schedule,
    results: results.map(({ key, creator_id, page, link_name, partner, partner_label, partner_source, label_key, format, subs, first_day, mature_subs, net30, net30_per_sub, payers_rate }) => ({
      key, creator_id, page: split.creator_ids.includes(creator_id) ? disp(creator_id) : baseName(page), link_name, partner, partner_label, partner_source, label_key, format, subs, first_day, mature_subs, net30, net30_per_sub, payers_rate,
    })),
    by_page: summarizeByPage(results).map((p) => ({ ...p, page: disp(p.creator_id) })),
    reciprocity: reciprocity(results, pages),
    unmatched: [...unmatched.values()].sort((a, b) => b.subs - a.subs),
    aliases,
    partner_options: [...new Set(Object.values(names).map(baseName))].sort((a, b) => a.localeCompare(b, "it")),
    meta: { generated_at: res.generated_at, bytes_processed: res.bytes_processed, window_days: WINDOW_DAYS, min_mature: MIN_MATURE, default_weekdays: DEFAULT_WEEKDAYS },
  };
}

