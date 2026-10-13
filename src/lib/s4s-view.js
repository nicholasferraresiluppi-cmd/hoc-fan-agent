// S4S — la vista della pagina (calendario arricchito + risultati), costruita per uno split.
// Separata dalla route così si può far girare anche fuori da Next (verifica sui dati veri).

import { getKits } from "@/lib/s4s-kit";
import { getNames, getResults, getAliases, syncPlan, getLinks, getLinkStats, getDeals, getPlan, getAvails, WINDOW_DAYS, DEFAULT_WEEKDAYS } from "@/lib/s4s";
import {
  planSchedule, addDays, baseName, linkNameFor, buildAliasIndex, enrichResults, summarizeByPage,
  reciprocity, resultFor, lastExchange, langOf, MIN_MATURE, matchPartner, labelKey, sideKey, sideStatus, toDate, handleFromUrl,
  mergeDeals, FORMATS, DEAL_DEFAULTS, MAX_PER_DAY, kitReady, kitMissing, KIT_MAX_PHOTOS, PHOTO_USES,
  dealState, availIssues, weekRange, weekCount, TIME_SLOTS,
} from "@/lib/s4s-core";

const PAST_DAYS = 28;
const FUTURE_DAYS = 56;
// "oggi" nel fuso italiano: alle 00:30 di giovedì è già giovedì, non mercoledì in UTC
const todayIT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

export async function buildView(split, { force = false, settings, userId } = {}) {
  const today = todayIT();
  const names = await getNames();
  const { plan, pages } = await syncPlan(split, names, today, { settings, userId });
  const [res, aliases, pasted, stored, kitsRaw, avails] = await Promise.all([getResults(split.id, split.creator_ids, { force }), getAliases(), getLinks(split.id), getDeals(split.id), getKits(split.creator_ids), getAvails(split.creator_ids)]);
  const lstat = await getLinkStats(split.id, split.creator_ids, Object.values(pasted).map((x) => x.url), { force });
  const aliasIdx = buildAliasIndex(Object.values(names));
  const results = enrichResults(res.rows, names, aliasIdx, aliases);
  const nm = (id) => names[String(id)] || String(id);
  // Nome da mostrare: il nome base, più la lingua quando la stessa creator ha più pagine
  // nello split (Fishball IT e Fishball EN non possono comparire entrambe come "Fishball").
  const langOfId = (id) => plan.settings.lang_override[id] || langOf(nm(id)).lang;
  const baseCount = {};
  for (const p of pages) baseCount[baseName(p.name)] = (baseCount[baseName(p.name)] || 0) + 1;
  const disp = (id) => (baseCount[baseName(nm(id))] > 1 ? `${baseName(nm(id))} ${langOfId(id).toUpperCase()}` : baseName(nm(id)));

  // Link S4S trovati in links_stats (anche a 0 abbonati) col partner ricavato dal nome:
  // servono quando nessuno ha incollato il link ma è stato creato col nome giusto.
  const pastedUrls = new Set(Object.values(pasted).map((x) => x.url));
  const found = Object.entries(lstat.links).filter(([u]) => !pastedUrls.has(u)).map(([url, l]) => {
    const lk = labelKey(l.link_name);
    const manual = lk && Object.prototype.hasOwnProperty.call(aliases, lk) ? aliases[lk] : undefined;
    const partner = manual !== undefined ? manual : matchPartner(l.link_name, aliasIdx, { exclude: baseName(nm(l.creator_id)) });
    return { url, ...l, partner };
  });
  const near = (a, b, lo, hi) => { const d = (toDate(a) - toDate(b)) / 86400000; return d >= lo && d <= hi; };
  function side(day, recv, partner) {
    const k = sideKey(day, recv, partner);
    let url = pasted[k]?.url || null;
    let source = url ? "incollato" : null;
    if (!url && day <= addDays(today, 1)) {
      const f = found.find((l) => l.creator_id === Number(recv) && l.partner === baseName(nm(partner)) && l.created && near(l.created, day, -3, 1));
      if (f) { url = f.url; source = "trovato"; }
    }
    const stat = url ? lstat.links[url] || null : null;
    const result = !url && day <= today ? resultFor(results, recv, nm(partner), day) : null;
    return {
      id: recv, name: disp(recv), handle: lstat.handles[String(recv)] || null,
      link: linkNameFor(nm(partner), day),
      url, url_source: source,
      // link incollato che non è della pagina che riceve (es. quello del partner): da correggere
      url_mismatch: Boolean(url && lstat.handles[String(recv)] && handleFromUrl(url) !== lstat.handles[String(recv)]),
      stat: stat ? { clicks: stat.clicks, subs: stat.subs, link_name: stat.link_name } : null,
      result,
      status: sideStatus({ day, today, url, stat, result }),
      last: lastExchange(results, recv, nm(partner), day),
    };
  }

  const first = plan.segments[0]?.from || today;
  const from = first > addDays(today, -PAST_DAYS) ? first : addDays(today, -PAST_DAYS);
  const sameBase = (a, b) => baseName(nm(a)) === baseName(nm(b));
  const to = addDays(today, FUTURE_DAYS);
  const merged = mergeDeals(planSchedule(plan, from, to, { sameBase }), stored, { from, to, langOf: (id) => langOfId(id) });
  // problemi di disponibilità di una metà: conteggi della settimana senza questo accordo
  const issuesFor = (d, x, me, other, fmt) => {
    const [w0, w1] = weekRange(d.day);
    const week = merged.filter((e) => e.day >= w0 && e.day <= w1);
    return availIssues(avails[me], {
      day: d.day, time: x.time, fmt, partnerId: other, partnerName: disp(other),
      weekCount: weekCount(week, me, x.id),
    });
  };
  const schedule = merged.map((d) => ({
    day: d.day,
    rest: d.rest.map((id) => ({ id, name: disp(id) })),
    deals: d.deals.map((x) => ({
      id: x.id, day: d.day, lang: x.lang, source: x.source, status: x.status, saved: Boolean(stored[x.id]),
      time: x.time, mass_time: x.mass_time, pin_hours: x.pin_hours, note: x.note || "", done: x.done || {},
      accepted: x.accepted || {}, declined_by: x.declined_by || null, ...dealState(x),
      issues: x.status === "annullato" ? { a: [], b: [] } : { a: issuesFor(d, x, x.a, x.b, x.fmt_a), b: issuesFor(d, x, x.b, x.a, x.fmt_b) },
      // a pubblica la promo di b con fmt_a; b pubblica a con fmt_b
      a: { ...side(d.day, x.a, x.b), fmt: x.fmt_a },
      b: { ...side(d.day, x.b, x.a), fmt: x.fmt_b },
    })),
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
    pages: pages.map((p) => ({ id: p.id, name: disp(p.id), handle: lstat.handles[String(p.id)] || null, lang: langOfId(p.id), lang_guessed: !plan.settings.lang_override[p.id] && langOf(p.name).guessed, paused: plan.settings.paused.includes(Number(p.id)) })),
    schedule,
    results: results.map(({ key, creator_id, page, link_name, partner, partner_label, partner_source, label_key, format, subs, first_day, mature_subs, net30, net30_per_sub, payers_rate }) => ({
      key, creator_id, page: split.creator_ids.includes(creator_id) ? disp(creator_id) : baseName(page), link_name, partner, partner_label, partner_source, label_key, format, subs, first_day, mature_subs, net30, net30_per_sub, payers_rate,
    })),
    by_page: summarizeByPage(results).map((p) => ({ ...p, page: disp(p.creator_id) })),
    reciprocity: reciprocity(results, pages),
    unmatched: [...unmatched.values()].sort((a, b) => b.subs - a.subs),
    aliases,
    partner_options: [...new Set(Object.values(names).map(baseName))].sort((a, b) => a.localeCompare(b, "it")),
    baseline: res.baseline || null,
    avail: Object.fromEntries(split.creator_ids.map((id) => [id, avails[id] || null])), time_slots: TIME_SLOTS,
    deal_defaults: DEAL_DEFAULTS, formats: FORMATS, max_per_day: MAX_PER_DAY, kit_max_photos: KIT_MAX_PHOTOS, photo_uses: PHOTO_USES,
    // kit di ogni pagina: senza path del blob (le foto si leggono solo dalla route protetta)
    kits: Object.fromEntries(Object.entries(kitsRaw).map(([id, k]) => [id, {
      photos: (k.photos || []).map((p) => ({ id: p.id, use: p.use, at: p.at })),
      text_post: k.text_post || "", text_mass: k.text_mass || "",
      ready: kitReady(k), missing: kitMissing(k), updated_at: k.updated_at || null,
    }])),
    meta: { generated_at: res.generated_at, links_at: lstat.generated_at, bytes_processed: res.bytes_processed, window_days: WINDOW_DAYS, min_mature: MIN_MATURE, default_weekdays: DEFAULT_WEEKDAYS },
  };
}


// Gli accordi di un giorno (giro + salvati), senza BigQuery: per i controlli al salvataggio.
export async function dayDeals(split, day) {
  const today = todayIT();
  const [names, plan, stored] = await Promise.all([getNames(), getPlan(split.id), getDeals(split.id)]);
  const nm = (id) => names[String(id)] || String(id);
  const sameBase = (a, b) => baseName(nm(a)) === baseName(nm(b));
  const days = plan ? planSchedule(plan, day, day, { sameBase }) : [];
  return { entry: mergeDeals(days, stored, { from: day, to: day })[0] || null, stored, today, names };
}

// Vista ristretta alle pagine di chi guarda (sales manager con creator assegnate): restano gli
// scambi in cui c'è almeno una sua pagina, i risultati delle sue pagine, nessuna impostazione.
export function restrictView(view, mineIds) {
  const mine = new Set(mineIds.map(Number));
  const has = (id) => mine.has(Number(id));
  return {
    ...view,
    me: { all: false, pages: [...mine] },
    pages: view.pages.map((p) => ({ ...p, mine: has(p.id) })),
    schedule: view.schedule
      .map((d) => ({ ...d, rest: d.rest.filter((r) => has(r.id)), deals: d.deals.filter((x) => has(x.a.id) || has(x.b.id)) }))
      .filter((d) => d.deals.length || d.rest.length),
    results: view.results.filter((r) => has(r.creator_id)),
    by_page: view.by_page.filter((p) => has(p.creator_id)),
    reciprocity: [],
    unmatched: [],
    aliases: {},
    partner_options: [],
  };
}

// Accordi (giro + salvati) di un intervallo di giorni, senza BigQuery: per i controlli al salvataggio.
export async function rangeDeals(split, from, to) {
  const [names, plan, stored] = await Promise.all([getNames(), getPlan(split.id), getDeals(split.id)]);
  const nm = (id) => names[String(id)] || String(id);
  const sameBase = (a, b) => baseName(nm(a)) === baseName(nm(b));
  const days = plan ? planSchedule(plan, from, to, { sameBase }) : [];
  return { days: mergeDeals(days, stored, { from, to }), stored, names };
}
