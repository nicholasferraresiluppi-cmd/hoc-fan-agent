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
      label: navByHref[page]?.label || pageLabel(page, nav),
      group: navFor(page, nav)?.group || null,
      users: p.users.size,
      views: p.views,
      prev_users: p.prevUsers.size,
      last_day: p.lastDay,
    }))
    .sort((a, b) => b.users - a.users || b.views - a.views);

  const personRows = members.map((m) => {
    const u = people[m.userId];
    const top = u ? Object.entries(u.pages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([page]) => pageLabel(page, nav)) : [];
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

  // Da quando abbiamo dati: il tracciamento è partito il 25/09/2026. Finché la
  // storia è più corta della finestra, i numeri vanno letti come parziali e le
  // conclusioni "mai aperta" / "non si torna" NON si traggono (sarebbero false).
  const dataDays = Object.keys(days).filter((d) => Object.keys(days[d] || {}).length).sort();
  const since = dataDays[0] || null;
  const trackedDays = since ? Math.round((Date.parse(dayId(now)) - Date.parse(since)) / 86400000) + 1 : 0;

  const report = {
    window,
    generated_at: now,
    since,
    tracked_days: trackedDays,
    partial: trackedDays < window,
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
  const young = r.tracked_days < 7;
  if (r.partial) {
    out.push({
      kind: "info",
      title: `Dati raccolti da ${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}`,
      text: young
        ? "Troppo presto per dire cosa non si usa o chi non torna: queste conclusioni compaiono dopo una settimana di dati."
        : `La finestra è di ${r.window} giorni ma i dati partono dal ${r.since}: leggi i numeri come parziali.`,
    });
  }

  const neverIn = r.people.filter((p) => p.email && !p.last_day && !p.last_sign_in_at);
  if (neverIn.length) {
    out.push({
      kind: "warn",
      title: `${neverIn.length} ${neverIn.length === 1 ? "persona invitata non è mai entrata" : "persone invitate non sono mai entrate"}`,
      text: `${neverIn.slice(0, 5).map((p) => p.name).join(", ")}${neverIn.length > 5 ? "…" : ""}. Se devono usare l'app, serve una spinta (o una spiegazione): uno strumento che nessuno apre non produce niente.`,
    });
  }

  const dormant = young ? [] : r.people.filter((p) => p.last_day && daysSince(p.last_day) >= 7);
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

  if (!young && r.never_opened.length) {
    out.push({
      kind: "info",
      title: `${r.never_opened.length} voci di menu mai aperte in ${r.window} giorni`,
      text: `Es. ${r.never_opened.slice(0, 4).map((n) => n.label).join(", ")}. Sono candidate a finire in modalità Advanced o a sparire: meno voci = app più leggibile.`,
    });
  }

  if (!young && r.kpi.active_30d && r.kpi.avg_active_days < 3) {
    out.push({ kind: "warn", title: "Si entra, ma non si torna", text: `Chi usa l'app lo fa in media ${r.kpi.avg_active_days} giorni su ${r.window}: non è ancora un'abitudine.` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Esperienza d'uso: dove si clicca, cosa frustra, cosa non si vede.    */
/* ------------------------------------------------------------------ */

// Soglie minime di campione: sotto, niente conclusioni (regola di onestà).
export const UX_MIN = { clicks: 5, rage: 3, scrollViews: 5, loadViews: 3, slowMs: 3000, lowScrollPct: 40 };

/**
 * @param {Record<string, Record<string, number>>} ux  giorno → hash usage:x
 * @param {object} navByHref  href → { label }
 */
export function buildUxReport(ux, navByHref = {}) {
  const pages = {};
  const navList = Object.values(navByHref).filter((n) => n?.href);
  const P = (p) => (pages[p] ||= { page: p, label: navByHref[p]?.label || (navList.length ? pageLabel(p, navList) : null), clicks: {}, rage: {}, errors: {}, scrollSum: 0, scrollN: 0, loadSum: 0, loadN: 0 });
  for (const h of Object.values(ux || {})) {
    for (const [f, raw] of Object.entries(h || {})) {
      const n = Number(raw) || 0;
      const parts = f.split("\t");
      const kind = parts[0], page = parts[1];
      if (!page || !"crels".includes(kind) || kind.length !== 1) continue; // n/t/q/b: percorsi, li legge buildFlowReport
      const p = P(page);
      if (kind === "c") {
        const [fold, zone] = String(parts[3] || "?|?").split("|");
        const c = (p.clicks[parts[2]] ||= { label: parts[2], count: 0, below: 0, zones: {} });
        c.count += n; if (fold === "scorrendo") c.below += n; c.zones[zone] = (c.zones[zone] || 0) + n;
      } else if (kind === "r") p.rage[parts[2]] = (p.rage[parts[2]] || 0) + n;
      else if (kind === "e") p.errors[parts[2]] = (p.errors[parts[2]] || 0) + n;
      else if (kind === "s") parts[2] === "sum" ? (p.scrollSum += n) : (p.scrollN += n);
      else if (kind === "l") parts[2] === "sum" ? (p.loadSum += n) : (p.loadN += n);
    }
  }
  const rows = Object.values(pages).map((p) => {
    const clicks = Object.values(p.clicks).sort((a, b) => b.count - a.count).map((c) => ({
      label: c.label, count: c.count,
      below_share: c.count ? Math.round((c.below / c.count) * 100) / 100 : 0,
      zone: Object.entries(c.zones).sort((a, b) => b[1] - a[1])[0]?.[0] || "?",
    }));
    return {
      page: p.page, label: p.label,
      clicks, total_clicks: clicks.reduce((a, c) => a + c.count, 0),
      rage: Object.entries(p.rage).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      errors: Object.entries(p.errors).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      scroll_avg: p.scrollN ? Math.round(p.scrollSum / p.scrollN) : null, scroll_n: p.scrollN,
      load_avg_ms: p.loadN ? Math.round(p.loadSum / p.loadN) : null, load_n: p.loadN,
    };
  }).sort((a, b) => b.total_clicks - a.total_clicks);
  return { pages: rows, insights: buildUxInsights(rows) };
}

export function buildUxInsights(rows) {
  const out = [];
  const name = (r) => r.label || r.page;
  for (const r of rows) {
    // tasto molto usato che si trova solo scorrendo
    const top = r.clicks.slice(0, 3).filter((c) => c.count >= UX_MIN.clicks && c.below_share >= 0.6 && !c.label.startsWith("→ "));
    for (const c of top) out.push({ kind: "warn", page: r.page, title: `«${c.label}» è tra i tasti più usati di ${name(r)}, ma per trovarlo bisogna scorrere`, text: `${c.count} clic, ${Math.round(c.below_share * 100)}% sotto la parte visibile all'apertura: spostarlo in alto fa risparmiare uno scroll a ogni uso.` });
    for (const g of r.rage.filter((x) => x.count >= UX_MIN.rage)) out.push({ kind: "warn", page: r.page, title: `Clic ripetuti per frustrazione su «${g.label}» (${name(r)})`, text: `${g.count} volte qualcuno ha cliccato 3+ volte di fila nello stesso punto: di solito vuol dire che non risponde, è lento o sembra cliccabile e non lo è.` });
    const errs = r.errors.reduce((a, e) => a + e.count, 0);
    if (errs) out.push({ kind: "warn", page: r.page, title: `${errs} ${errs === 1 ? "errore" : "errori"} su ${name(r)}`, text: `Il più frequente: «${r.errors[0].label}». Da correggere: chi lo incontra vede una pagina rotta.` });
    if (r.load_n >= UX_MIN.loadViews && r.load_avg_ms >= UX_MIN.slowMs) out.push({ kind: "info", page: r.page, title: `${name(r)} è lenta ad aprirsi`, text: `In media ${(r.load_avg_ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} secondi al primo caricamento.` });
    if (r.scroll_n >= UX_MIN.scrollViews && r.scroll_avg < UX_MIN.lowScrollPct) out.push({ kind: "info", page: r.page, title: `Su ${name(r)} si guarda solo la parte alta`, text: `In media si scorre fino al ${r.scroll_avg}% della pagina: quello che sta sotto quasi nessuno lo vede. Le cose importanti vanno in cima.` });
  }
  const rank = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/* ------------------------------------------------------------------ */
/* Percorsi e punti di blocco (17/10/2026).                             */
/* ------------------------------------------------------------------ */
/*
 * Richiesta Nicholas: "chi apre cosa, cosa non apre nessuno, dove si blocca",
 * in una sezione apposita. Modello dei prodotti di analytics (PostHog «Paths»,
 * Amplitude «Journeys», Pendo «Friction»): da dove si arriva a una pagina e
 * dove si va dopo, quanto ci si resta, quante aperture finiscono in un muro.
 * Tutto ANONIMO e aggregato per pagina (in usage:x non c'è mai chi): i
 * percorsi per persona sarebbero sorveglianza, e per decidere dove intervenire
 * non servono. Campi nuovi in usage:x (scritti da ux-client → usage.recordEvents):
 *   "n\t{da}\t{a}"          → passaggi da una pagina all'altra ("(ingresso)" = prima pagina della visita)
 *   "t\t{pagina}\tsum|n"    → secondi con la pagina in primo piano (≤30 min a vista)
 *   "q\t{pagina}"           → aperture durate <10 s senza nessun clic
 *   "b\t{pagina}\t{codice}" → aperture in cui almeno una chiamata ai dati ha risposto 401/403/404/5xx o non è arrivata (rete)
 * Le uscite non si registrano: uscite = aperture − passaggi verso un'altra pagina.
 */

export const ENTRY = "(ingresso)";
export const EXIT = "(uscita)";
export const BLOCK_CODES = ["401", "403", "404", "5xx", "rete"];

// Soglie minime (regola di onestà: sotto il campione niente conclusioni).
export const FLOW_MIN = { views: 5, quickViews: 8, quickShare: 0.4, blockShare: 0.2, errShare: 0.05, netShare: 0.1 };

/** Voce di menu che "contiene" la pagina (la più lunga che ne è prefisso): per nome e area delle pagine di dettaglio. */
export function navFor(page, nav = []) {
  let best = null;
  for (const n of nav) {
    if (page === n.href) return n;
    if (n.href !== "/" && n.href !== "/admin" && page.startsWith(n.href + "/") && (!best || n.href.length > best.href.length)) best = n;
  }
  return best;
}

/** Nome leggibile di una pagina: voce di menu, o "Voce › dettaglio" per le sottopagine. */
const KNOWN_PAGES = { "/": "Inizio", "/admin": "Hub" };
const prettySegs = (segs) => segs.map((s) => (/^\[.+\]$/.test(s) ? "scheda" : s.replace(/-/g, " "))).join(" › ");
export function pageLabel(page, nav = []) {
  if (page === ENTRY) return "Entra nell'app";
  if (page === EXIT) return "Esce dall'app";
  if (KNOWN_PAGES[page]) return KNOWN_PAGES[page];
  const n = navFor(page, nav);
  if (!n || n.href === "/admin") {
    // fuori dal menu: "/academy/lezioni" → "Academy › lezioni"
    const t = prettySegs(page.split("/").filter(Boolean));
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : page;
  }
  if (n.href === page) return n.label;
  return `${n.label} › ${prettySegs(page.slice(n.href.length + 1).split("/"))}`;
}

/**
 * @param {Record<string, Record<string, number>>} ux  giorno → hash usage:x
 * @param {Array<{href,label,group}>} nav
 */
export function buildFlowReport(ux, nav = []) {
  const P = {};
  const get = (page) => (P[page] ||= { page, views: 0, entries: 0, out: 0, from: {}, to: {}, tSum: 0, tN: 0, quick: 0, blocks: {} });
  let since = null;
  for (const [day, h] of Object.entries(ux || {})) {
    for (const [f, raw] of Object.entries(h || {})) {
      const n = Number(raw) || 0;
      if (!n) continue;
      const [kind, a, b] = f.split("\t");
      if (!a) continue;
      if (kind === "n") {
        if (!b || b === ENTRY) continue;
        if (!since || day < since) since = day;
        const to = get(b);
        to.views += n; to.from[a] = (to.from[a] || 0) + n;
        if (a === ENTRY) to.entries += n;
        else if (a !== b) { const fr = get(a); fr.out += n; fr.to[b] = (fr.to[b] || 0) + n; }
        else { const fr = get(a); fr.out += n; } // stessa pagina (ricarica nella visita): non è un'uscita
      } else if (kind === "t") { const p = get(a); b === "sum" ? (p.tSum += n) : b === "n" ? (p.tN += n) : null; }
      else if (kind === "q") get(a).quick += n;
      else if (kind === "b" && BLOCK_CODES.includes(b)) { const p = get(a); p.blocks[b] = (p.blocks[b] || 0) + n; }
    }
  }
  const top = (o, k = 6) => Object.entries(o).filter(([, c]) => c > 0).sort((x, y) => y[1] - x[1]).slice(0, k).map(([page, count]) => ({ page, label: pageLabel(page, nav), count }));
  const pages = Object.values(P).filter((p) => p.views > 0).map((p) => {
    const exits = Math.max(0, p.views - p.out);
    const nb = navFor(p.page, nav);
    const blocked = Object.values(p.blocks).reduce((s, c) => s + c, 0);
    return {
      page: p.page,
      label: pageLabel(p.page, nav),
      group: nb?.group || null,
      views: p.views,
      entries: p.entries,
      exits,
      exit_share: p.views ? exits / p.views : 0,
      from: top(p.from),
      to: top({ ...p.to, ...(exits ? { [EXIT]: exits } : {}) }),
      avg_seconds: p.tN ? Math.round(p.tSum / p.tN) : null,
      quick: p.quick,
      quick_share: p.views ? Math.min(1, p.quick / p.views) : 0,
      blocks: p.blocks,
      blocked_views: blocked,
    };
  }).sort((a, b) => b.views - a.views);
  return { since, pages, total_views: pages.reduce((s, p) => s + p.views, 0) };
}

/**
 * I punti in cui ci si blocca, dal più grave: muri di permesso, errori,
 * pagine aperte e richiuse subito, più i segnali di buildUxReport (clic per
 * frustrazione, errori JavaScript, lentezza, tasti da scorrere).
 * Ogni voce dice cosa succede, quante aperture tocca e cosa fare.
 */
export function buildStuckReport(flow, ux = null) {
  const out = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const p of flow?.pages || []) {
    if (p.views < FLOW_MIN.views) continue;
    const share = (code) => (p.blocks[code] || 0) / p.views;
    const n = (code) => p.blocks[code] || 0;
    if (share("403") >= FLOW_MIN.blockShare) out.push({ kind: "warn", cause: "permesso", page: p.page, affected: n("403"),
      title: `«${p.label}» si apre, ma le rispondono «non hai il permesso»`,
      text: `${n("403")} aperture su ${p.views} (${pct(share("403"))}) hanno chiesto dati che chi la apre non può vedere: o la voce non dovrebbe stare nel suo menu (nav-access), o gli manca un permesso o le creator assegnate.` });
    if (share("5xx") >= FLOW_MIN.errShare) out.push({ kind: "warn", cause: "errore", page: p.page, affected: n("5xx"),
      title: `«${p.label}» va in errore`,
      text: `${n("5xx")} aperture su ${p.views} (${pct(share("5xx"))}) hanno avuto un errore del server nel caricare i dati: chi la apre vede una pagina vuota o a metà. Da correggere.` });
    if (share("404") >= FLOW_MIN.blockShare) out.push({ kind: "info", cause: "vuota", page: p.page, affected: n("404"),
      title: `«${p.label}» cerca dati che non trova`,
      text: `${n("404")} aperture su ${p.views} hanno chiesto qualcosa che non esiste (un periodo, una scheda, una creator): di solito un link vecchio o un filtro rimasto nell'indirizzo.` });
    if (share("401") >= FLOW_MIN.blockShare) out.push({ kind: "info", cause: "sessione", page: p.page, affected: n("401"),
      title: `Su «${p.label}» la sessione risulta scaduta`,
      text: `${n("401")} aperture su ${p.views}: la pagina era aperta da molto e l'accesso era scaduto. Bisogna ricaricare: se succede spesso, la pagina dovrebbe dirlo da sola.` });
    if (share("rete") >= FLOW_MIN.netShare) out.push({ kind: "info", cause: "rete", page: p.page, affected: n("rete"),
      title: `Su «${p.label}» i dati a volte non arrivano proprio`,
      text: `${n("rete")} aperture su ${p.views}: la richiesta non è arrivata (connessione, o una richiesta troppo lunga interrotta).` });
    if (p.views >= FLOW_MIN.quickViews && p.quick_share >= FLOW_MIN.quickShare) out.push({ kind: "warn", cause: "subito", page: p.page, affected: p.quick,
      title: `«${p.label}» si apre e si richiude subito`,
      text: `${p.quick} aperture su ${p.views} (${pct(p.quick_share)}) durano meno di 10 secondi senza nessun clic: chi ci arriva si aspettava altro (il nome nel menu?) o la pagina non mostra subito quello che serve.` });
  }
  for (const i of ux?.insights || []) {
    const cause = /frustrazione/.test(i.title) ? "frustrazione" : /errore/.test(i.title) ? "errore" : /lenta/.test(i.title) ? "lenta" : /scorrere/.test(i.title) ? "nascosto" : "scorrimento";
    out.push({ ...i, cause, affected: Number((i.text.match(/^(\d+)/) || i.title.match(/(\d+)/) || [])[1]) || 0 });
  }
  // a parità di gravità: prima ciò che è rotto (errori, permessi), poi ciò che fa perdere la gente, poi la comodità
  const rank = { warn: 0, info: 1, good: 2 };
  const CAUSE_RANK = { errore: 0, permesso: 1, subito: 2, frustrazione: 3, nascosto: 4, lenta: 5, vuota: 6, sessione: 7, rete: 8, scorrimento: 9 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || (CAUSE_RANK[a.cause] ?? 9) - (CAUSE_RANK[b.cause] ?? 9) || b.affected - a.affected);
}

/* ------------------------------------------------------------------ */
/* Persone: abitudine e parte della mansione mai aperta.                */
/* ------------------------------------------------------------------ */

export const PERSON_STATUS = {
  abitudine: { label: "Lo usa ogni settimana", short: "Abitudine" },
  occasionale: { label: "Lo usa ogni tanto", short: "Ogni tanto" },
  fermo: { label: "Non lo apre da più di 14 giorni", short: "Fermo" },
  mai: { label: "Invitato, mai entrato", short: "Mai entrato" },
};

/**
 * Stato d'uso di una persona. Abitudine = attiva in almeno 3 delle ultime 4
 * settimane, compresa l'ultima (con meno di 3 settimane di dati: almeno 5
 * giorni sugli ultimi 14).
 * @param {Record<string, Record<string, number>>} days
 */
export function personHabit(userId, days, { now = Date.now(), trackedDays = 999, everSignedIn = false } = {}) {
  const ds = lastDays(28, now);
  const strip = ds.map((d) => Object.keys(days?.[d] || {}).some((k) => k.startsWith(userId + "\t")));
  let last = null;
  for (const d of Object.keys(days || {}).sort()) if (Object.keys(days[d] || {}).some((k) => k.startsWith(userId + "\t"))) last = d;
  const weeks = [0, 1, 2, 3].filter((w) => strip.slice(w * 7, w * 7 + 7).some(Boolean)).length;
  const last14 = strip.slice(14).filter(Boolean).length;
  const since = last ? Math.round((Date.parse(dayId(now)) - Date.parse(last)) / 86400000) : null;
  let status;
  if (!last) status = everSignedIn ? "fermo" : "mai";
  else if (since > 14) status = "fermo";
  else if ((weeks >= 3 && strip.slice(21).some(Boolean)) || (trackedDays < 21 && last14 >= 5)) status = "abitudine";
  else status = "occasionale";
  return { strip, status, active_weeks: weeks, days_since: since };
}

/**
 * Arricchisce le persone del report: stato, striscia di 28 giorni e, per chi
 * ha una mansione, le pagine della sua parte che nel periodo non ha mai
 * aperto. `expectedFor(member)` → [{href,label}] (la decide la pagina:
 * mansione ∩ permessi, così il core resta puro).
 */
export function enrichPeople(report, { days, members = [], expectedFor = () => [], now = Date.now() }) {
  const byId = Object.fromEntries(members.map((m) => [m.userId, m]));
  const opened = {}; // userId → Set(pagine) nella finestra
  for (const d of lastDays(report.window, now)) for (const k of Object.keys(days?.[d] || {})) {
    const [u, page] = k.split("\t");
    (opened[u] ||= new Set()).add(page);
  }
  const people = report.people.map((p) => {
    const m = byId[p.userId] || {};
    const h = personHabit(p.userId, days, { now, trackedDays: report.tracked_days, everSignedIn: Boolean(m.lastSignInAt) });
    const expected = expectedFor(m) || [];
    const mine = opened[p.userId] || new Set();
    const used = (href) => mine.has(href) || [...mine].some((pg) => pg.startsWith(href + "/"));
    return {
      ...p,
      ...h,
      workspace: m.workspace || null,
      admin: Boolean(m.admin),
      expected_count: expected.length,
      expected_used: expected.filter((e) => used(e.href)).length,
      missing: expected.filter((e) => !used(e.href)),
    };
  });
  const counts = Object.fromEntries(Object.keys(PERSON_STATUS).map((s) => [s, people.filter((p) => p.status === s).length]));
  const insights = [...(report.insights || [])];
  // chi entra ma non usa la sua parte: il segnale più utile per spiegare (o togliere) uno strumento
  const halfUnused = report.tracked_days >= 7
    ? people.filter((p) => p.status !== "mai" && p.expected_count >= 2 && p.missing.length * 2 >= p.expected_count)
    : [];
  if (halfUnused.length) {
    insights.push({
      kind: "warn",
      title: `${halfUnused.length} ${halfUnused.length === 1 ? "persona entra ma non usa" : "persone entrano ma non usano"} metà degli strumenti della sua mansione`,
      text: halfUnused.slice(0, 4).map((p) => `${p.name}: mai ${p.missing.slice(0, 2).map((m) => m.label).join(", ")}`).join(" · ") + ". Chiedi se sa che esistono e a cosa servono: spesso basta mostrarli una volta.",
    });
  }
  return { ...report, people, status_counts: counts, insights };
}

/** Aree del menu (gruppi): persone diverse che le usano e aperture, nella finestra. */
export function buildAreas({ days, window = 30, nav = [], now = Date.now() }) {
  const areas = {};
  for (const d of lastDays(window, now)) for (const [k, raw] of Object.entries(days?.[d] || {})) {
    const [u, page] = k.split("\t");
    const c = Number(raw) || 0;
    if (!u || !page || !c) continue;
    const g = navFor(page, nav)?.group || "Fuori dal menu";
    const a = (areas[g] ||= { group: g, views: 0, users: new Set() });
    a.views += c; a.users.add(u);
  }
  const total = Object.values(areas).reduce((s, a) => s + a.views, 0) || 1;
  return Object.values(areas).map((a) => ({ group: a.group, views: a.views, users: a.users.size, share: a.views / total })).sort((a, b) => b.users - a.users || b.views - a.views);
}
