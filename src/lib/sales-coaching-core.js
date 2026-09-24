// Coaching vendite — core PURO (zero import): compattazione delle righe del
// warehouse e tutte le viste (pagine di uno split, operatori a parità di
// pagina, comportamenti che vendono, riferimento HOC, test in corso).
// Unit test: tests/sales-coaching.test.mjs.
//
// DEFINIZIONI (dichiarate anche a schermo, non cambiarle senza bump versione):
//   - "vendita in chat" = PPV mandato a mano, ESCLUSO il benvenuto automatico
//   - "mai pagante"     = il fan non aveva mai pagato la creator prima del PPV
//   - "conversione"     = PPV comprati entro 72h ÷ PPV mandati
//   - "chat viva"       = il fan ha scritto ≥3 messaggi nell'ora prima
//   - "chat ferma"      = il fan non ha scritto nell'ora prima
//   - "tecnica"         = bonus/regalo o prezzo di riferimento/sconto nell'ora prima
//   - "indice"          = incasso reale ÷ incasso atteso per quei PPV (atteso =
//     media HOC della stessa pagina × fan già-pagante/no × ordine del PPV),
//     con shrinkage verso 1 (SHRINK buys di prior) → i campioni piccoli non
//     finiscono in cima/fondo per caso. Solo turni in cui l'operatore era solo.

export const SALES_COACHING_VERSION = "sales-coach-1";
export const SHRINK = 60; // PPV comprati "virtuali" a indice 1
export const MIN_OP_PPV = 150; // sotto questo volume l'indice non si mostra
export const RECENT_WEEKS = 4;
export const REFERENCE_TOP = 10;

// ── Compattazione (riduce ~3MB di righe a strutture posizionali) ─────────────
const num = (v) => (v == null ? 0 : Number(v));
const bool = (v) => v === true || v === "true";

export const AGG_COLS = ["wk", "cid", "op", "welcome", "prior", "n", "buys", "net", "e_buy", "e_net", "live_n", "live_buys", "dead_n", "dead_buys", "tech_n", "tech_buys"];

export function compactRows(rows) {
  const agg = [];
  const lift = [];
  const cand = [];
  for (const r of rows || []) {
    if (r.kind === "agg") {
      agg.push([r.wk, num(r.creator_id), r.op, bool(r.welcome), bool(r.prior), num(r.n), num(r.buys), num(r.net), num(r.e_buy), num(r.e_net), num(r.live_n), num(r.live_buys), num(r.dead_n), num(r.dead_buys), num(r.tech_n), num(r.tech_buys)]);
    } else if (r.kind === "lift") {
      lift.push([num(r.creator_id), bool(r.prior), r.kb, r.feature, bool(r.fval), num(r.n), num(r.buys)]);
    } else if (r.kind === "cand") {
      cand.push({ creator_id: num(r.creator_id), uid: String(r.uid), ts: r.ts, op: r.op, price: num(r.price), net: num(r.net), wk: r.wk });
    }
  }
  return { agg, lift, cand };
}

const A = Object.fromEntries(AGG_COLS.map((c, i) => [c, i]));
export const aggGet = (row, col) => row[A[col]];

export function weeksOf(agg) {
  return [...new Set(agg.map((r) => r[A.wk]))].sort();
}

// ultime `n` settimane e le `n` prima
export function splitWeeks(weeks, n = RECENT_WEEKS) {
  const recent = weeks.slice(-n);
  const prev = weeks.slice(-2 * n, -n);
  return { recent, prev };
}

const rate = (b, n) => (n > 0 ? b / n : null);
export const shrinkIndex = (obs, exp, k) => (exp + k > 0 ? (obs + k) / (exp + k) : null);

function inScope(row, creatorSet, weekSet) {
  return (!creatorSet || creatorSet.has(row[A.cid])) && (!weekSet || weekSet.has(row[A.wk]));
}

// ── Pagine ───────────────────────────────────────────────────────────────────
function pageStats(rows) {
  let chat_n = 0, chat_b = 0, np_n = 0, np_b = 0, pp_n = 0, pp_b = 0, live = 0, dead = 0, dead_b = 0, tech = 0, wel_n = 0, wel_b = 0, net = 0;
  for (const r of rows) {
    net += r[A.net];
    if (r[A.welcome]) { wel_n += r[A.n]; wel_b += r[A.buys]; continue; }
    chat_n += r[A.n]; chat_b += r[A.buys];
    if (r[A.prior]) { pp_n += r[A.n]; pp_b += r[A.buys]; } else { np_n += r[A.n]; np_b += r[A.buys]; }
    live += r[A.live_n]; dead += r[A.dead_n]; dead_b += r[A.dead_buys]; tech += r[A.tech_n];
  }
  return {
    chat_ppv: chat_n,
    nonpayer_ppv: np_n,
    conv_nonpayer: rate(np_b, np_n),
    conv_payer: rate(pp_b, pp_n),
    live_share: rate(live, chat_n),
    dead_share: rate(dead, chat_n),
    conv_dead: rate(dead_b, dead),
    tech_share: rate(tech, chat_n),
    conv_welcome: rate(wel_b, wel_n),
    net,
  };
}

export function summarizePages(agg, { creatorIds = null, recentWeeks = RECENT_WEEKS } = {}) {
  const weeks = weeksOf(agg);
  const { recent, prev } = splitWeeks(weeks, recentWeeks);
  const cs = creatorIds ? new Set(creatorIds.map(Number)) : null;
  const rs = new Set(recent), ps = new Set(prev);
  const byC = new Map();
  for (const r of agg) {
    if (!inScope(r, cs, null)) continue;
    const c = r[A.cid];
    if (!byC.has(c)) byC.set(c, { recent: [], prev: [] });
    if (rs.has(r[A.wk])) byC.get(c).recent.push(r);
    else if (ps.has(r[A.wk])) byC.get(c).prev.push(r);
  }
  const pages = [...byC.entries()].map(([cid, v]) => ({ creator_id: cid, recent: pageStats(v.recent), prev: pageStats(v.prev) }));
  pages.sort((a, b) => (b.recent.net || 0) - (a.recent.net || 0));
  const all = agg.filter((r) => inScope(r, cs, rs));
  return { recent_weeks: recent, prev_weeks: prev, total: pageStats(all), pages };
}

// ── Operatori ────────────────────────────────────────────────────────────────
function opAccumulate(rows) {
  const m = new Map();
  for (const r of rows) {
    const op = r[A.op];
    if (!op || op.startsWith("(") || r[A.welcome]) continue;
    if (!m.has(op)) m.set(op, { op, n: 0, buys: 0, net: 0, e_buy: 0, e_net: 0, np_n: 0, np_b: 0, live: 0, dead: 0, tech: 0, creators: new Map() });
    const o = m.get(op);
    o.n += r[A.n]; o.buys += r[A.buys]; o.net += r[A.net]; o.e_buy += r[A.e_buy]; o.e_net += r[A.e_net];
    if (!r[A.prior]) { o.np_n += r[A.n]; o.np_b += r[A.buys]; }
    o.live += r[A.live_n]; o.dead += r[A.dead_n]; o.tech += r[A.tech_n];
    o.creators.set(r[A.cid], (o.creators.get(r[A.cid]) || 0) + r[A.n]);
  }
  return m;
}

// k per l'indice incasso: SHRINK acquisti al netto medio per acquisto dello scope
function netShrinkK(rows) {
  let net = 0, buys = 0;
  for (const r of rows) if (!r[A.welcome]) { net += r[A.net]; buys += r[A.buys]; }
  return buys > 0 ? SHRINK * (net / buys) : SHRINK;
}

function finishOp(o, kNet) {
  const creators = [...o.creators.entries()].sort((a, b) => b[1] - a[1]).map(([cid, n]) => ({ creator_id: cid, ppv: n }));
  const reliable = o.n >= MIN_OP_PPV;
  return {
    op: o.op,
    ppv: o.n,
    reliable,
    index_net: reliable ? shrinkIndex(o.net, o.e_net, kNet) : null,
    index_buy: reliable ? shrinkIndex(o.buys, o.e_buy, SHRINK) : null,
    conv_nonpayer: rate(o.np_b, o.np_n),
    nonpayer_ppv: o.np_n,
    live_share: rate(o.live, o.n),
    dead_share: rate(o.dead, o.n),
    tech_share: rate(o.tech, o.n),
    net: o.net,
    creators,
  };
}

export function summarizeOperators(agg, { creatorIds = null, weeks = null } = {}) {
  const cs = creatorIds ? new Set(creatorIds.map(Number)) : null;
  const ws = weeks ? new Set(weeks) : null;
  const rows = agg.filter((r) => inScope(r, cs, ws));
  const kNet = netShrinkK(rows);
  const ops = [...opAccumulate(rows).values()].map((o) => finishOp(o, kNet));
  ops.sort((a, b) => (b.index_net ?? -1) - (a.index_net ?? -1) || b.ppv - a.ppv);
  return ops;
}

// Serie settimanale della conversione mai-paganti (per operatore o per pagina)
export function weeklySeries(agg, { creatorIds = null, op = null } = {}) {
  const cs = creatorIds ? new Set(creatorIds.map(Number)) : null;
  const byW = new Map();
  for (const r of agg) {
    if (r[A.welcome] || r[A.prior]) continue;
    if (cs && !cs.has(r[A.cid])) continue;
    if (op && r[A.op] !== op) continue;
    const w = r[A.wk];
    const x = byW.get(w) || { n: 0, b: 0, live: 0, tech: 0 };
    x.n += r[A.n]; x.b += r[A.buys]; x.live += r[A.live_n]; x.tech += r[A.tech_n];
    byW.set(w, x);
  }
  return weeksOf(agg).map((w) => {
    const x = byW.get(w) || { n: 0, b: 0, live: 0, tech: 0 };
    return { wk: w, ppv: x.n, conv: rate(x.b, x.n), live_share: rate(x.live, x.n), tech_share: rate(x.tech, x.n) };
  });
}

// Riferimento HOC: i migliori operatori di TUTTA l'org (indice incasso) e i
// loro comportamenti medi = l'obiettivo di formazione per gli altri.
const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Perché due riferimenti e non uno: l'indice operatore è RELATIVO alla pagina
// (chi batte la media di una pagina difficile può avere una conversione
// assoluta bassa), quindi l'OBIETTIVO numerico viene dalle PAGINE MODELLO —
// dove si vende davvero ai mai-paganti (misurato set 2026: Gaja IT, Alessandra,
// Iri IT, Giulia Ottorini, Sara IT…) — mentre gli OPERATORI MODELLO sono i
// migliori a parità di pagina su tutta HOC + i migliori dei team modello.
// Il riferimento serve come traguardo di formazione e fonte di esempi: gli
// operatori da SPOSTARE in uno split si scelgono tra quelli dello split.
export const MODEL_PAGES = 5;
export const MODEL_PAGE_MIN_PPV = 400;

export function referenceBenchmark(agg, { weeks = null, top = REFERENCE_TOP, modelPages = MODEL_PAGES, minPagePpv = MODEL_PAGE_MIN_PPV } = {}) {
  const ws = weeks ? new Set(weeks) : null;
  const rows = ws ? agg.filter((r) => ws.has(r[A.wk])) : agg;
  const byC = new Map();
  for (const r of rows) {
    if (!byC.has(r[A.cid])) byC.set(r[A.cid], []);
    byC.get(r[A.cid]).push(r);
  }
  const pages = [...byC.entries()]
    .map(([cid, rs]) => ({ creator_id: cid, ...pageStats(rs) }))
    .filter((p) => p.nonpayer_ppv >= minPagePpv && p.conv_nonpayer != null)
    .sort((a, b) => b.conv_nonpayer - a.conv_nonpayer);
  const models = pages.slice(0, modelPages);
  const modelIds = models.map((p) => p.creator_id);
  const goal = modelIds.length ? pageStats(rows.filter((r) => modelIds.includes(r[A.cid]))) : null;

  const all = summarizeOperators(agg, { weeks }).filter((o) => o.reliable);
  const topIndex = all.slice(0, top);
  // i migliori (indice ≥1) dei team delle pagine modello, 2 per pagina
  const teamBest = [];
  for (const cid of modelIds) {
    const t = summarizeOperators(agg, { weeks, creatorIds: [cid] }).filter((o) => o.reliable && o.index_net >= 1);
    teamBest.push(...t.slice(0, 2).map((o) => ({ ...o, model_page: cid })));
  }
  const seen = new Set();
  const operators = [];
  for (const o of [...teamBest, ...topIndex]) {
    if (seen.has(o.op)) continue;
    seen.add(o.op);
    operators.push({ ...o, source: o.model_page ? "team modello" : "indice più alto" });
  }
  return {
    model_pages: models,
    goal, // pageStats delle pagine modello insieme
    org: pageStats(rows),
    operators,
    operators_evaluated: all.length,
  };
}

// ── Comportamenti che vendono (stratificati per cella) ────────────────────────
export const FEATURES = {
  live: "Chat viva (il fan ha scritto ≥3 messaggi nell'ultima ora)",
  dead: "Chat ferma (il fan non ha scritto nell'ultima ora)",
  bonus: "Bonus o regalo nell'offerta",
  anchor: "Prezzo di riferimento o sconto",
  objection: "Il fan ha appena fatto un'obiezione",
  q_hi: "Tante domande dell'operatore (≥30% dei messaggi)",
};

// Per ogni feature: nelle celle (creator × già-pagante × ordine PPV) dove ci
// sono abbastanza PPV sia con sia senza, media pesata (peso = min dei due n)
// della conversione con/senza. `nonPayersOnly` restringe ai mai-paganti.
export function behaviorLifts(lift, { creatorIds = null, nonPayersOnly = true, minCell = 25 } = {}) {
  const cs = creatorIds ? new Set(creatorIds.map(Number)) : null;
  const cells = new Map();
  for (const [cid, prior, kb, feature, fval, n, buys] of lift) {
    if (cs && !cs.has(cid)) continue;
    if (nonPayersOnly && prior) continue;
    const key = `${feature}|${cid}|${prior}|${kb}`;
    const c = cells.get(key) || { feature, y: [0, 0], nn: [0, 0] };
    c[fval ? "y" : "nn"][0] += n;
    c[fval ? "y" : "nn"][1] += buys;
    cells.set(key, c);
  }
  const out = {};
  for (const f of Object.keys(FEATURES)) {
    let w = 0, withR = 0, withoutR = 0, used = 0, nWith = 0, nAll = 0;
    for (const c of cells.values()) {
      if (c.feature !== f) continue;
      nWith += c.y[0]; nAll += c.y[0] + c.nn[0];
      if (c.y[0] < minCell || c.nn[0] < minCell) continue;
      const wt = Math.min(c.y[0], c.nn[0]);
      w += wt; used++;
      withR += wt * (c.y[1] / c.y[0]);
      withoutR += wt * (c.nn[1] / c.nn[0]);
    }
    out[f] = {
      label: FEATURES[f],
      with: w ? withR / w : null,
      without: w ? withoutR / w : null,
      diff: w ? (withR - withoutR) / w : null,
      usage: nAll ? nWith / nAll : null,
      cells: used,
    };
  }
  return out;
}

// ── Test in corso (esperimenti) ──────────────────────────────────────────────
// Baseline = conversione mai-paganti delle `baselineWeeks` settimane PRIMA
// dell'inizio; poi settimana per settimana dal lunedì di inizio.
export function experimentView(agg, exp, { baselineWeeks = 4 } = {}) {
  const cid = Number(exp.creator_id);
  const startWk = mondayOf(exp.start);
  const series = weeklySeries(agg, { creatorIds: [cid] });
  const before = series.filter((s) => s.wk < startWk).slice(-baselineWeeks);
  const bn = before.reduce((a, s) => a + s.ppv, 0);
  const bb = before.reduce((a, s) => a + (s.conv || 0) * s.ppv, 0);
  const during = series.filter((s) => s.wk >= startWk);
  const dn = during.reduce((a, s) => a + s.ppv, 0);
  const db = during.reduce((a, s) => a + (s.conv || 0) * s.ppv, 0);
  const ops = (exp.operators || []).map((op) => {
    const s = weeklySeries(agg, { creatorIds: [cid], op }).filter((x) => x.wk >= startWk);
    const n = s.reduce((a, x) => a + x.ppv, 0);
    const b = s.reduce((a, x) => a + (x.conv || 0) * x.ppv, 0);
    return { op, ppv: n, conv: rate(b, n) };
  });
  return {
    baseline: rate(bb, bn),
    baseline_ppv: bn,
    during: rate(db, dn),
    during_ppv: dn,
    target: exp.target != null ? Number(exp.target) : null,
    weeks: series.filter((s) => s.wk >= (before[0]?.wk || startWk)),
    start_wk: startWk,
    operators: ops,
    // un giudizio solo con un campione minimo: sotto, "troppo presto"
    enough_data: dn >= 150,
  };
}

export function mondayOf(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dow = (d.getUTCDay() + 6) % 7; // lun=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ── Esempi dai migliori ──────────────────────────────────────────────────────
// Candidati = vendite a fan mai paganti con chat viva e tecnica/obiezione,
// fatte dagli operatori-riferimento. Al massimo `perOp` per operatore, creator
// diverse prima (varietà), deterministico.
export function pickExamples(cand, referenceOps, { perOp = 3, max = 30 } = {}) {
  const refSet = new Set(referenceOps);
  const byOp = new Map();
  for (const c of cand) {
    if (!refSet.has(c.op)) continue;
    if (!byOp.has(c.op)) byOp.set(c.op, []);
    byOp.get(c.op).push(c);
  }
  const picks = [];
  for (const op of referenceOps) {
    const list = (byOp.get(op) || []).slice().sort((a, b) => (b.net - a.net) || String(a.ts).localeCompare(String(b.ts)));
    const seen = new Set();
    const chosen = [];
    for (const c of list) if (chosen.length < perOp && !seen.has(c.creator_id)) { chosen.push(c); seen.add(c.creator_id); }
    for (const c of list) if (chosen.length < perOp && !chosen.includes(c)) chosen.push(c);
    picks.push(...chosen);
    if (picks.length >= max) break;
  }
  return picks.slice(0, max);
}

// id stabile dell'esempio, NON derivato dallo user_id in chiaro esposto: la
// lib lo calcola con HMAC (qui solo l'assemblaggio dei messaggi).
export function assembleExamples(msgRows, picks, idFor) {
  const byKey = new Map();
  for (const r of msgRows || []) {
    const k = `${r.creator_id}|${r.uid}|${r.ts}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ at: r.msg_at ?? r.at, from: bool(r.out_) ? "op" : "fan", price: r.price != null ? Number(r.price) : null, text: String(r.txt || "").replace(/\s+/g, " ").trim() });
  }
  const out = [];
  for (const p of picks) {
    const k = `${p.creator_id}|${p.uid}|${p.ts}`;
    const msgs = (byKey.get(k) || []).filter((m) => m.text || m.price);
    if (msgs.length < 3) continue;
    out.push({ id: idFor(p), creator_id: p.creator_id, op: p.op, ppv_price: p.price, net: p.net, at: p.ts, messages: msgs.slice(-24) });
  }
  return out;
}

// Versione per gli operatori: niente nome operatore, niente id interni.
export function stripExampleForOperators(ex, creatorName) {
  return {
    id: ex.id,
    creator: creatorName || "",
    ppv_price: ex.ppv_price,
    note: ex.note || "",
    messages: (ex.messages || []).map((m) => ({ from: m.from, price: m.price, text: m.text })),
  };
}
