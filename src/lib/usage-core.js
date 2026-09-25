/**
 * Analytics d'uso di HOC Pro — logica PURA (niente KV, testabile in node).
 *
 * Perché esiste (25/09/2026): l'app ha ~100 pagine e 5-10 utenti reali; senza
 * sapere cosa viene aperto davvero ogni scelta (cosa migliorare, cosa
 * nascondere, chi non sta usando lo strumento) è a sensazione. Modello dei
 * prodotti di analytics (PostHog/Amplitude): utenti attivi (DAU/WAU/MAU),
 * "stickiness" (giorni attivi per utente), pagine per utenti unici — non per
 * visite, che premiano chi ricarica — e le pagine MAI aperte, che sono il
 * segnale più utile per semplificare la navigazione.
 *
 * Cosa NON si traccia: contenuti, dati dei fan, clic. Solo (persona, pagina,
 * giorno) → numero di aperture.
 */

/** "/leaderboard/creators/Elisa%20Esposito" → "/leaderboard/creators/[alias]" */
export function matchRoute(path, templates) {
  const clean = String(path || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const segs = clean.split("/").filter(Boolean);
  let best = null;
  let bestStatic = -1;
  for (const t of templates) {
    const ts = t.split("/").filter(Boolean);
    if (ts.length !== segs.length) continue;
    let ok = true;
    let statics = 0;
    for (let i = 0; i < ts.length; i++) {
      if (/^\[.+\]$/.test(ts[i])) continue;
      if (ts[i] !== segs[i]) { ok = false; break; }
      statics++;
    }
    // a parità di lunghezza vince il template più "statico" (/admin/ruoli batte /admin/[x])
    if (ok && statics > bestStatic) { best = t; bestStatic = statics; }
  }
  return best;
}

export const dayId = (ts) => new Date(ts).toISOString().slice(0, 10);

export function lastDays(n, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => dayId(now - (n - 1 - i) * 86400000));
}

/**
 * @param {object} p
 * @param {Record<string, Record<string, number>>} p.days  giorno → { "userId\tpage": count }
 * @param {Array<{userId,name,email,roles,lastSignInAt,createdAt}>} p.members
 * @param {Array<{href,label,group}>} p.nav   voci di menu (per le pagine mai aperte)
 * @param {number} p.now
 * @param {number} p.window giorni della finestra (default 30)
 */
export function buildUsageReport({ days, members = [], nav = [], now = Date.now(), window = 30 }) {
  const cur = lastDays(window, now);
  const prev = lastDays(window * 2, now).slice(0, window);
  const navByHref = Object.fromEntries(nav.map((n) => [n.href, n]));
  const memberById = Object.fromEntries(members.map((m) => [m.userId, m]));

  const pages = {};   // page → { views, users:Set, prevViews, prevUsers:Set, lastDay }
  const people = {};  // userId → { views, days:Set, pages:{} , lastDay }
  const daily = cur.map((d) => ({ day: d, users: new Set(), views: 0 }));
  const dailyIdx = Object.fromEntries(cur.map((d, i) => [d, i]));

  const add = (dayList, isCur) => {
    for (const d of dayList) {
      const h = days[d] || {};
      for (const [k, n] of Object.entries(h)) {
        const [userId, page] = k.split("\t");
        const c = Number(n) || 0;
        if (!userId || !page || !c) continue;
        const p = (pages[page] ||= { views: 0, users: new Set(), prevViews: 0, prevUsers: new Set(), lastDay: null });
        if (isCur) {
          p.views += c; p.users.add(userId);
          if (!p.lastDay || d > p.lastDay) p.lastDay = d;
          const u = (people[userId] ||= { views: 0, days: new Set(), pages: {}, lastDay: null });
          u.views += c; u.days.add(d); u.pages[page] = (u.pages[page] || 0) + c;
          if (!u.lastDay || d > u.lastDay) u.lastDay = d;
          const di = daily[dailyIdx[d]];
          di.users.add(userId); di.views += c;
        } else {
          p.prevViews += c; p.prevUsers.add(userId);
        }
      }
    }
  };
  add(cur, true);
  add(prev, false);

  const activeIn = (n) => {
    const set = new Set();
    for (const d of cur.slice(-n)) for (const k of Object.keys(days[d] || {})) set.add(k.split("\t")[0]);
    return set;
  };
  const wau = activeIn(7);
  const mau = new Set(Object.keys(people));
  const totalViews = Object.values(pages).reduce((a, p) => a + p.views, 0);

  const pageRows = Object.entries(pages)
    .filter(([, p]) => p.views > 0)
    .map(([page, p]) => ({
      page,
      label: navByHref[page]?.label || null,
      group: navByHref[page]?.group || null,
      users: p.users.size,
      views: p.views,
      prev_users: p.prevUsers.size,
      last_day: p.lastDay,
    }))
    .sort((a, b) => b.users - a.users || b.views - a.views);

  const personRows = members.map((m) => {
    const u = people[m.userId];
    const top = u ? Object.entries(u.pages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([page]) => navByHref[page]?.label || page) : [];
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      roles: m.roles || [],
      active_days: u ? u.days.size : 0,
      views: u ? u.views : 0,
      last_day: u?.lastDay || null,
      last_sign_in_at: m.lastSignInAt || null,
      created_at: m.createdAt || null,
      top_pages: top,
    };
  }).sort((a, b) => b.active_days - a.active_days || b.views - a.views || (a.name || "").localeCompare(b.name || ""));
  // chi ha visite ma non è (più) tra i membri Clerk: lo si mostra comunque
  for (const [userId, u] of Object.entries(people)) {
    if (memberById[userId]) continue;
    personRows.push({ userId, name: "Utente non più tra i membri", email: null, roles: [], active_days: u.days.size, views: u.views, last_day: u.lastDay, top_pages: [] });
  }

  const never = nav.filter((n) => !pages[n.href] || pages[n.href].views === 0);

  const report = {
    window,
    generated_at: now,
    kpi: {
      members: members.length,
      active_7d: wau.size,
      active_30d: mau.size,
      views_30d: totalViews,
      // stickiness: in media quanti giorni su `window` torna chi è attivo
      avg_active_days: mau.size ? Math.round((Object.values(people).reduce((a, u) => a + u.days.size, 0) / mau.size) * 10) / 10 : 0,
    },
    daily: daily.map((d) => ({ day: d.day, users: d.users.size, views: d.views })),
    pages: pageRows,
    people: personRows,
    never_opened: never,
  };
  report.insights = buildInsights(report, now);
  return report;
}

/**
 * Le 3-5 cose da sapere, in italiano, ordinate per utilità decisionale.
 * Ogni insight dice COSA è successo e COSA fare — una dashboard che non porta
 * a una decisione è solo un grafico.
 */
export function buildInsights(r, now = Date.now()) {
  const out = [];
  const today = dayId(now);
  const daysSince = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : null);

  if (!r.kpi.views_30d) {
    out.push({ kind: "info", title: "Ancora nessun dato d'uso", text: "Il tracciamento è appena partito: i primi numeri arrivano dalle prossime visite." });
    return out;
  }

  const neverIn = r.people.filter((p) => p.email && !p.last_day && !p.last_sign_in_at);
  if (neverIn.length) {
    out.push({
      kind: "warn",
      title: `${neverIn.length} ${neverIn.length === 1 ? "persona invitata non è mai entrata" : "persone invitate non sono mai entrate"}`,
      text: `${neverIn.slice(0, 5).map((p) => p.name).join(", ")}${neverIn.length > 5 ? "…" : ""}. Se devono usare l'app, serve una spinta (o una spiegazione): uno strumento che nessuno apre non produce niente.`,
    });
  }

  const dormant = r.people.filter((p) => p.last_day && daysSince(p.last_day) >= 7);
  if (dormant.length) {
    out.push({
      kind: "warn",
      title: `${dormant.length} ${dormant.length === 1 ? "persona non torna" : "persone non tornano"} da almeno 7 giorni`,
      text: dormant.slice(0, 5).map((p) => `${p.name} (${daysSince(p.last_day)} gg)`).join(", ") + ". Chiedi cosa li ha fermati: spesso è una cosa sola.",
    });
  }

  if (r.pages.length) {
    const top = r.pages.slice(0, 3).map((p) => p.label || p.page);
    out.push({ kind: "good", title: "Le pagine che contano davvero", text: `${top.join(", ")}: qui vanno le energie di miglioramento, perché le usa più gente.` });
  }

  if (r.never_opened.length) {
    out.push({
      kind: "info",
      title: `${r.never_opened.length} voci di menu mai aperte in ${r.window} giorni`,
      text: `Es. ${r.never_opened.slice(0, 4).map((n) => n.label).join(", ")}. Sono candidate a finire in modalità Advanced o a sparire: meno voci = app più leggibile.`,
    });
  }

  if (r.kpi.active_30d && r.kpi.avg_active_days < 3) {
    out.push({ kind: "warn", title: "Si entra, ma non si torna", text: `Chi usa l'app lo fa in media ${r.kpi.avg_active_days} giorni su ${r.window}: non è ancora un'abitudine.` });
  }
  return out;
}
