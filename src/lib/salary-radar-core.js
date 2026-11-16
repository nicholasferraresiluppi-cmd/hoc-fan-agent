// Radar salary — logica pura (16/11/2026). Test: tests/salary-radar.mjs
//
// Richiesta di Nicholas: «qualcosa di simile al Radar creator ma per i profili social delle salary
// che abbiamo noi, più cercare e aggiungere gli altri profili che troviamo». Una salary vive di una
// RETE di account piccoli (Alice Pinotti: 37 account, 1-3 reel al giorno ciascuno): la scheda è per
// MODELLA, gli account stanno dentro.
//
// Due fonti, mai mescolate nello stesso numero:
//   - «magazzino»: le nostre, dalla tabella giornaliera instagram.cache_accounts_creators (un account
//     → la sua modella, follower, reel nuovi, view del giorno, clic in bio, iscritti). Ogni giorno.
//   - «apify»: gli account aggiunti a mano (altre agenzie, o nostri che il magazzino non segue),
//     letti con lo stesso attore del Radar creator una volta a settimana: follower e view MEDIANE
//     per reel. Sono numeri diversi da quelli del magazzino, e la pagina lo dice.

export const SALARY_RADAR_VERSION = "salradar-1";

// Le salary che il magazzino segue già (16/11/2026). Le altre dell'altro split (Marta Bellini,
// Bianca De Angelis, Laura Cipriani, Milena, Eva) non hanno account Instagram collegati nel
// magazzino: si aggiungono a mano come «nostre» e le legge Apify.
export const DEFAULT_TALENTS = ["Alice Pinotti", "Anna Belti", "Atena Gentile", "Vittoria Sbanca"];

export const DAYS = 35;          // finestra letta dal magazzino
export const WEEK = 7;
export const GONE_AFTER_DAYS = 2; // un account che non compare più da 2 giorni: sparito (bannato, chiuso o scollegato)
export const HISTORY_MAX = 26;
export const MIN_PREV_VIEWS = 1000; // base minima per dire «sulla settimana prima» di un account    // settimane tenute per gli account letti da Apify

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pos = (v) => Math.max(0, num(v) || 0);

export function normHandle(h) {
  return String(h || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase();
}
export const validHandle = (h) => /^[a-z0-9._]{2,30}$/.test(h);

/**
 * Gli account in un testo incollato: link di profilo, @nome o nomi nudi, uno per riga o separati
 * da spazi/virgole. I link ai reel non bastano (non dicono di chi sono senza leggerli): scartati.
 */
export function parseHandles(text) {
  const out = [];
  for (const tok of String(text || "").split(/[\s,;]+/)) {
    if (!tok) continue;
    let h = null;
    const m = tok.match(/instagram\.com\/([^/?#\s]+)/i);
    if (m) {
      if (["reel", "reels", "p", "tv", "explore", "stories", "accounts", "direct"].includes(m[1].toLowerCase())) {
        const s = tok.match(/instagram\.com\/stories\/([^/?#\s]+)/i);
        h = s ? normHandle(s[1]) : null;
      } else h = normHandle(m[1]);
    } else if (/^@?[a-z0-9._]{2,30}$/i.test(tok)) h = normHandle(tok);
    if (h && validHandle(h) && !out.includes(h)) out.push(h);
  }
  return out;
}

export function slug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "modella";
}

const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
export function addDays(d, n) {
  const t = new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Variazione in percento, null quando la base è vuota (niente "+∞%"). */
export function pct(now, before) {
  if (now == null || before == null || !(before > 0)) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/**
 * Righe del magazzino → righe pulite. Una riga per (modella, account, giorno): la query prende già
 * il massimo per giorno (un account collegato a due creator, es. IT ed ENG, compare due volte).
 */
export function normalizeRow(r) {
  const t = String(r?.t || "").trim();
  const u = normHandle(r?.u);
  if (!t || !u || !isDay(r?.d)) return null;
  return {
    t, u, d: r.d,
    c: String(r.c || "").split(" / ").map((x) => x.trim()).filter(Boolean),
    fol: num(r.fol),
    reels: pos(r.reels), views: pos(r.views), clicks: pos(r.clicks), subs: pos(r.subs),
    link: r.link ? String(r.link).slice(0, 200) : "",
    priv: r.priv === true || r.priv === "true",
  };
}

/** Somma di un campo nei giorni (from, to] di una serie per giorno. */
function sumIn(byDay, field, from, to) {
  let s = 0;
  for (const [d, r] of byDay) if (d > from && d <= to) s += r[field] || 0;
  return s;
}
/** Il valore dell'ultimo giorno <= `day` (follower: si legge l'ultima misura, non si somma). */
function lastAt(byDay, field, day) {
  let best = null;
  for (const [d, r] of byDay) if (d <= day && r[field] != null && (!best || d > best[0])) best = [d, r[field]];
  return best ? best[1] : null;
}

/**
 * Le nostre salary: per modella, gli account con i numeri della settimana e quella prima.
 * `today` = l'ultimo giorno presente nel magazzino (non la data di sistema: il magazzino arriva a D-1).
 */
export function buildOurModels(rawRows, { talents = DEFAULT_TALENTS, today } = {}) {
  const rows = (rawRows || []).map(normalizeRow).filter(Boolean).filter((r) => talents.includes(r.t));
  const last = today || rows.reduce((m, r) => (r.d > m ? r.d : m), "");
  if (!last) return { day: null, models: talents.map((t) => emptyModel(t)) };
  const w1 = addDays(last, -WEEK), w2 = addDays(last, -2 * WEEK);
  const byAcc = new Map();
  for (const r of rows) {
    const k = `${r.t}|${r.u}`;
    if (!byAcc.has(k)) byAcc.set(k, { t: r.t, u: r.u, days: new Map() });
    byAcc.get(k).days.set(r.d, r);
  }
  const models = new Map(talents.map((t) => [t, []]));
  for (const a of byAcc.values()) {
    const days = [...a.days.keys()].sort();
    const lastSeen = days[days.length - 1];
    const lastRow = a.days.get(lastSeen);
    const firstSeen = days[0];
    const fol = lastRow.fol;
    const fol7 = lastAt(a.days, "fol", w1);
    const views7 = sumIn(a.days, "views", w1, last);
    const viewsPrev = sumIn(a.days, "views", w2, w1);
    const reels7 = sumIn(a.days, "reels", w1, last);
    const gone = dayDiff(last, lastSeen) >= GONE_AFTER_DAYS;
    const status = gone ? "sparito" : reels7 === 0 ? "fermo" : "attivo";
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(last, -i);
      const r = a.days.get(d);
      series.push([d, r ? r.views : null, r ? r.fol : null]);
    }
    models.get(a.t).push({
      h: a.u,
      creators: lastRow.c,
      fol,
      folDelta: fol != null && fol7 != null && !gone ? fol - fol7 : null,
      // sotto le 1.000 view la settimana prima il percento è rumore (+1.800% su un account appena partito)
      views7, viewsPrev, viewsPct: viewsPrev >= MIN_PREV_VIEWS ? pct(views7, viewsPrev) : null,
      reels7,
      clicks7: sumIn(a.days, "clicks", w1, last),
      subs7: sumIn(a.days, "subs", w1, last),
      link: lastRow.link, priv: lastRow.priv,
      firstSeen, lastSeen, isNew: dayDiff(last, firstSeen) < WEEK && firstSeen > addDays(last, -DAYS + 2),
      status,
      series,
    });
  }
  return {
    day: last,
    models: talents.map((t) => summarizeModel({
      id: `t:${slug(t)}`, name: t, side: "nostra", source: "magazzino", talent: t,
      accounts: (models.get(t) || []).sort((x, y) => (y.views7 - x.views7) || ((y.fol || 0) - (x.fol || 0))),
    }, last)),
  };
}

function emptyModel(t) {
  return summarizeModel({ id: `t:${slug(t)}`, name: t, side: "nostra", source: "magazzino", talent: t, accounts: [] }, null);
}

/** Totali di una modella del magazzino + la serie giornaliera delle view (somma degli account). */
export function summarizeModel(m, day) {
  const acc = m.accounts || [];
  const alive = acc.filter((a) => a.status !== "sparito");
  const sum = (f, list = alive) => list.reduce((s, a) => s + (a[f] || 0), 0);
  const views7 = sum("views7", acc), viewsPrev = sum("viewsPrev", acc);
  const deltas = alive.map((a) => a.folDelta).filter((v) => v != null);
  const series = [];
  if (acc.length && acc[0].series) {
    for (let i = 0; i < acc[0].series.length; i++) {
      let v = null;
      for (const a of acc) { const x = a.series[i]?.[1]; if (x != null) v = (v || 0) + x; }
      series.push([acc[0].series[i][0], v]);
    }
  }
  return {
    ...m,
    day,
    counts: {
      total: acc.length,
      attivo: acc.filter((a) => a.status === "attivo").length,
      fermo: acc.filter((a) => a.status === "fermo").length,
      sparito: acc.filter((a) => a.status === "sparito").length,
      nuovi: acc.filter((a) => a.isNew).length,
    },
    fol: sum("fol"),
    folDelta: deltas.length ? deltas.reduce((s, v) => s + v, 0) : null,
    views7, viewsPrev, viewsPct: pct(views7, viewsPrev),
    reels7: sum("reels7", acc),
    clicks7: sum("clicks7", acc),
    subs7: sum("subs7", acc),
    viewsPerAccount: alive.length ? Math.round(views7 / alive.length / WEEK) : null,
    series,
  };
}

// ---------- account letti da Apify (aggiunti a mano) ----------

/** Storico [settimana, follower, view mediane]: una riga per settimana (l'ultima vince). */
export function appendHistory(hist, week, fol, medv) {
  const out = (Array.isArray(hist) ? hist : []).filter((p) => p[0] !== week);
  out.push([week, fol ?? null, medv ?? null]);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out.slice(-HISTORY_MAX);
}

/**
 * Applica una lettura (parseRefreshItem del Radar creator: { h, fol, medv, er, url, pic }) a un
 * account dell'archivio. `missing` = l'attore non l'ha restituito: dopo 2 giri di fila è sparito.
 */
export function applyRead(acc, read, { week, now = Date.now() } = {}) {
  if (!read) {
    const miss = (acc.miss || 0) + 1;
    return { ...acc, miss, gone: miss >= 2, checkedAt: now };
  }
  return {
    ...acc,
    miss: 0, gone: false, checkedAt: now,
    last: { fol: read.fol ?? null, medv: read.medv ?? null, er: read.er ?? null, url: read.url || "", pic: read.pic || acc.last?.pic || null },
    hist: appendHistory(acc.hist, week, read.fol, read.medv),
  };
}

/** Variazione dei follower tra le ultime due settimane misurate. */
export function weekGrowth(hist) {
  const pts = (hist || []).filter((p) => p[1] != null);
  if (pts.length < 2) return { delta: null, pct: null };
  const a = pts[pts.length - 2][1], b = pts[pts.length - 1][1];
  return { delta: b - a, pct: pct(b, a) };
}

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

/** Le modelle aggiunte a mano (nostre fuori dal magazzino o di altre agenzie), con i loro account. */
export function buildManualModels(store) {
  const models = Object.values(store?.models || {});
  const accs = Object.values(store?.accounts || {});
  return models.map((m) => {
    const list = accs.filter((a) => a.modelId === m.id).map((a) => {
      const g = weekGrowth(a.hist);
      const status = !a.checkedAt ? "da_leggere" : a.gone ? "sparito" : "attivo";
      return { h: a.h, fol: a.last?.fol ?? null, medv: a.last?.medv ?? null, er: a.last?.er ?? null, link: a.last?.url || "", pic: a.last?.pic || null, folDelta: g.delta, folPct: g.pct, checkedAt: a.checkedAt || null, addedAt: a.at || null, by: a.by || null, status, hist: a.hist || [] };
    }).sort((x, y) => (y.fol || 0) - (x.fol || 0));
    const alive = list.filter((a) => a.status === "attivo");
    const deltas = alive.map((a) => a.folDelta).filter((v) => v != null);
    const checked = list.map((a) => a.checkedAt).filter(Boolean);
    return {
      id: m.id, name: m.name, side: m.side === "nostra" ? "nostra" : "altra", source: "apify",
      agency: m.agency || "", note: m.note || "", by: m.by || null, at: m.at || null,
      accounts: list,
      counts: { total: list.length, attivo: alive.length, sparito: list.filter((a) => a.status === "sparito").length, da_leggere: list.filter((a) => a.status === "da_leggere").length },
      fol: alive.some((a) => a.fol != null) ? alive.reduce((s, a) => s + (a.fol || 0), 0) : null,
      folDelta: deltas.length ? deltas.reduce((s, v) => s + v, 0) : null,
      medv: median(alive.map((a) => a.medv)),
      bestMedv: alive.reduce((m2, a) => (a.medv != null && (m2 == null || a.medv > m2) ? a.medv : m2), null),
      checkedAt: checked.length ? Math.max(...checked) : null,
    };
  });
}

// ---------- ricerca ----------

/**
 * Righe di una ricerca Apify → candidati { h, name, fol, bio, priv, pic, link }.
 * - "parola": apify/instagram-search-scraper (utenti per parola chiave)
 * - "seguiti": scraping_solutions/…followers-following-no-cookies (chi segue un account)
 * Gli account già nel radar (nostri o aggiunti) vengono marcati, non tolti: si vede che ci sono.
 */
export function parseCandidates(rows, known = new Set()) {
  const out = new Map();
  for (const r of rows || []) {
    const h = normHandle(r?.username || r?.userName || r?.Username || r?.ownerUsername || "");
    if (!validHandle(h) || out.has(h)) continue;
    const fol = num(r.followersCount ?? r.followers_count ?? r.follower_count ?? r.followers);
    out.set(h, {
      h,
      name: String(r.fullName || r.full_name || r.Full_Name || "").slice(0, 80),
      fol,
      bio: String(r.biography || r.bio || "").replace(/\s+/g, " ").slice(0, 160),
      priv: Boolean(r.private ?? r.is_private ?? r.isPrivate),
      pic: r.profilePicUrl || r.profile_pic_url || null,
      link: String(r.externalUrl || r.external_url || "").slice(0, 200),
      known: known.has(h),
    });
  }
  return [...out.values()].sort((a, b) => (a.known - b.known) || ((b.fol || 0) - (a.fol || 0)));
}

// Indizi di un profilo «da salary» nella bio (la scelta resta di chi guarda; serve solo a ordinare).
const HINTS = [
  /\b(0[5-8]|200[5-8])\b/,                 // anno di nascita: '08, 2007…
  /\b1[89]\b|\b2[0-2]\b/,                  // età: 18, 19, 20…
  /evidenz|highlight|prima storia|storie/i, // il link nascosto nelle storie in evidenza
  /🇮🇹|ital/i,
  /bannat|chiuso|backup|nuovo profilo|secondo profilo|second account/i,
];
export function salaryHints(bio) {
  const b = String(bio || "");
  return HINTS.reduce((s, re) => s + (re.test(b) ? 1 : 0), 0);
}

export const SEARCH_KINDS = {
  parola: { label: "Per parola", unit: 0.003, max: 50, hint: "Cerca tra gli utenti di Instagram come la lente dell'app: guarda il nome e il nome utente, NON la bio. Funzionano parole corte che le reti usano nei nomi: «privata», «backup», «08», «reels», o il nome di una modella. Le frasi lunghe non trovano niente." },
  seguiti: { label: "Chi segue un account", unit: 0.35, max: 1, hint: "Tutti gli account che un profilo segue. Le reti delle salary si seguono tra loro: partendo da un account di un'altra agenzia si trovano i suoi gemelli." },
};

/** Tetto mensile di spesa Apify del radar salary (oltre, le ricerche si fermano fino al mese dopo). */
export const MONTHLY_CAP_USD = 25;
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
