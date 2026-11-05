// La scaletta — funzioni pure (niente KV, niente BigQuery): le usano l'API e i test in node.
// Definizioni e origine: vedi scaletta-sql.js. Coaching, NON score/comp: le percentuali per
// operatore servono a decidere su cosa allenare, non si pubblicano come classifica.

export const SCALETTA_VERSION = "scal-1";

// Profili di riferimento del caso di studio (16/10/2026): i più forti di HOC per incasso
// settimanale, scelti con Nicholas. Fishball solo la pagina IT.
export const REFERENCE_IDS = [263412168, 114921397, 1000000296, 160294962, 93666613];
export const REFERENCE_LABEL = "Gaja, Sara Sfamurri, Elisa Esposito, Fishball IT, Giulia Ottorini";

// Sotto queste soglie una percentuale è rumore: si mostra "pochi dati".
export const MIN_SESSIONS = 30;
export const MIN_SOLD = 15;

// Colonne delle righe compatte (l'ordine è il contratto con la cache: cambiarlo = nuova versione)
export const C_COLS = ["wk", "cid", "eng", "warm", "n", "sold", "cont", "b2", "b3", "rev", "l1", "l2", "l3", "p2sum", "b2vid",
  "w_fin", "w_money", "w_go", "w_gone", "w_noreply", "w_chat", "w_asks", "w_gift"];
export const O_COLS = ["wk", "cid", "op", "n", "sold", "cont", "b2", "b3", "rev", "w_noreply", "w_chat"];
export const M_COLS = ["wk", "cid", "n", "paid", "price_p50", "ppc_p50", "cheap", "sconto", "liste"];
export const P_COLS = ["wk", "cid", "payers", "net"];

const NUMS = new Set(["n", "sold", "cont", "b2", "b3", "rev", "l1", "l2", "l3", "p2sum", "b2vid", "w_fin", "w_money", "w_go",
  "w_gone", "w_noreply", "w_chat", "w_asks", "w_gift", "paid", "price_p50", "ppc_p50", "cheap", "sconto", "liste", "payers", "net"]);

const num = (v) => (v == null || v === "" ? null : Number(v));
export const toRow = (cols, o) => cols.map((c) => (NUMS.has(c) ? num(o[c]) ?? 0 : c === "warm" ? (o[c] === true || o[c] === "true" || o[c] === 1 ? 1 : 0) : c === "cid" ? Number(o[c]) : o[c] ?? null));
export const fromRow = (cols, r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]));

/**
 * Righe grezze della query principale (con op, eng, warm) → due tabelle compatte:
 * per creator (senza operatore) e per operatore (senza coinvolgimento/riscaldamento).
 * Così la cache resta piccola anche su tutta HOC.
 */
export function compactMain(rows) {
  const byC = new Map(), byO = new Map();
  for (const r of rows) {
    const kc = `${r.wk}|${r.creator_id}|${r.eng}|${r.warm}`;
    const ko = `${r.wk}|${r.creator_id}|${r.op}`;
    const c = byC.get(kc) || { wk: r.wk, cid: Number(r.creator_id), eng: r.eng, warm: r.warm };
    const o = byO.get(ko) || { wk: r.wk, cid: Number(r.creator_id), op: r.op };
    for (const k of C_COLS.slice(4)) c[k] = (c[k] || 0) + (num(r[k]) || 0);
    for (const k of O_COLS.slice(3)) o[k] = (o[k] || 0) + (num(r[k]) || 0);
    byC.set(kc, c); byO.set(ko, o);
  }
  return { c: [...byC.values()].map((o) => toRow(C_COLS, o)), o: [...byO.values()].map((o) => toRow(O_COLS, o)) };
}

export const weeksOf = (cRows) => [...new Set(cRows.map((r) => r[0]))].filter(Boolean).sort();

const ratio = (a, b) => (b > 0 ? a / b : null);

/** Somma le righe per creator (eventualmente filtrate per settimane/coinvolgimento). */
export function sumC(cRows, { ids, weeks, eng, warm } = {}) {
  const idSet = ids ? new Set(ids.map(Number)) : null;
  const wkSet = weeks ? new Set(weeks) : null;
  const t = Object.fromEntries(C_COLS.slice(4).map((k) => [k, 0]));
  for (const row of cRows) {
    const r = fromRow(C_COLS, row);
    if (idSet && !idSet.has(r.cid)) continue;
    if (wkSet && !wkSet.has(r.wk)) continue;
    if (eng && r.eng !== eng) continue;
    if (warm != null && r.warm !== (warm ? 1 : 0)) continue;
    for (const k of C_COLS.slice(4)) t[k] += r[k] || 0;
  }
  return t;
}

/** I numeri della scaletta da un totale. Ogni rapporto ha il suo denominatore dichiarato. */
export function funnel(t) {
  const stopped = t.w_fin + t.w_money + t.w_go + t.w_gone + t.w_noreply + t.w_chat;
  return {
    sessions: t.n,
    sold: t.sold,
    sold_rate: ratio(t.sold, t.n), // conversazioni con proposta che vendono
    cont_rate: ratio(t.cont, t.sold), // dopo il 1° acquisto propone ancora
    second_if_proposed: ratio(t.b2, t.cont), // se il 2° gradino arriva, quanti lo comprano
    b2_rate: ratio(t.b2, t.sold),
    b3_rate: ratio(t.b3, t.sold), // conversazioni con 3+ acquisti (sulle conversazioni che vendono)
    rev_per_sold: ratio(t.rev, t.sold),
    ladder: t.b3 > 0 ? [t.l1 / t.b3, t.l2 / t.b3, t.l3 / t.b3] : null, // prezzi medi 1°→2°→3° (lordi)
    p2_avg: ratio(t.p2sum, t.b2),
    video_share: ratio(t.b2vid, t.b2), // scalette di 2+ acquisti fatte solo di video
    stopped,
    few: t.n < MIN_SESSIONS || t.sold < MIN_SOLD,
  };
}

export const STOP_REASONS = [
  ["w_fin", "Il fan ha concluso (venuto, finito)", "fan"],
  ["w_money", "Il fan parla di soldi o di un limite", "fan"],
  ["w_go", "Il fan deve andare o rimanda", "fan"],
  ["w_gone", "Il fan sparisce subito dopo l'acquisto", "fan"],
  ["w_chat", "Il fan resta e scrive, ma la proposta non arriva", "noi"],
  ["w_noreply", "Il fan scrive e resta senza risposta", "noi"],
];

/**
 * Perché la scaletta si ferma. `lost` = stima onesta dell'incasso lasciato: SOLO le conversazioni
 * che dipendono da noi × quanti comprano il 2° gradino quando arriva × prezzo medio del 2°.
 * Si usa il tasso dello stesso perimetro (o del riferimento se il perimetro ha pochi dati).
 */
export function stopBreakdown(t, { fallback } = {}) {
  const f = funnel(t);
  const total = f.stopped;
  const reasons = STOP_REASONS.map(([k, label, side]) => ({ key: k, label, side, n: t[k], share: ratio(t[k], total) }));
  const ours = t.w_chat + t.w_noreply;
  const fb = fallback ? funnel(fallback) : null;
  const conv = t.cont >= MIN_SOLD && f.second_if_proposed != null ? f.second_if_proposed : fb?.second_if_proposed ?? f.second_if_proposed;
  const p2 = t.b2 >= MIN_SOLD ? f.p2_avg : fb?.p2_avg ?? f.p2_avg;
  return {
    total,
    reasons,
    ours,
    ours_share: ratio(ours, total),
    asks: t.w_asks,
    asks_share: ratio(t.w_asks, total),
    gift: t.w_gift,
    gift_share: ratio(t.w_gift, total),
    lost: conv != null && p2 != null ? ours * conv * p2 : null,
  };
}

/** Riscaldamento: vendono con / senza contenuto gratis prima, a parità di coinvolgimento. */
export const ENG_BUCKETS = [["0-2", "0-2 messaggi (fan freddo)"], ["3-6", "3-6"], ["7-15", "7-15"], ["16+", "16+ (fan caldo)"]];
export function warmTable(cRows, opts = {}) {
  return ENG_BUCKETS.map(([eng, label]) => {
    const a = sumC(cRows, { ...opts, eng, warm: false });
    const b = sumC(cRows, { ...opts, eng, warm: true });
    return { eng, label, without: ratio(a.sold, a.n), with: ratio(b.sold, b.n), n_without: a.n, n_with: b.n, warm_share: ratio(b.n, a.n + b.n) };
  });
}

/** Mass: per una pagina la riga 'recent'; per più pagine si sommano i conteggi e si prende la mediana dei p50. */
export function massRecent(mRows, ids) {
  const idSet = new Set(ids.map(Number));
  const rs = mRows.map((r) => fromRow(M_COLS, r)).filter((r) => r.wk === "recent" && idSet.has(r.cid));
  if (!rs.length) return null;
  const s = (k) => rs.reduce((a, r) => a + (r[k] || 0), 0);
  const med = (k) => {
    const v = rs.map((r) => r[k]).filter((x) => x != null && x > 0).sort((a, b) => a - b);
    return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
  };
  const n = s("n"), paid = s("paid");
  return {
    n, paid,
    per_day: n / 28 / rs.length, // media per pagina: col riferimento (più pagine) non si sommano
    paid_share: ratio(paid, n),
    price_p50: med("price_p50"),
    ppc_p50: med("ppc_p50"),
    cheap_share: ratio(s("cheap"), paid),
    sconto_share: ratio(s("sconto"), paid),
    liste_share: ratio(s("liste"), n),
  };
}

/** Operatori sui turni da soli (duo e senza turno esclusi), ordinati per conversazioni. */
export function operatorTable(oRows, { ids, weeks } = {}) {
  const idSet = ids ? new Set(ids.map(Number)) : null;
  const wkSet = weeks ? new Set(weeks) : null;
  const by = new Map();
  for (const row of oRows) {
    const r = fromRow(O_COLS, row);
    if (!r.op || r.op.startsWith("(")) continue;
    if (idSet && !idSet.has(r.cid)) continue;
    if (wkSet && !wkSet.has(r.wk)) continue;
    const t = by.get(r.op) || { op: r.op, n: 0, sold: 0, cont: 0, b2: 0, b3: 0, rev: 0, w_noreply: 0, w_chat: 0 };
    for (const k of O_COLS.slice(3)) t[k] += r[k] || 0;
    by.set(r.op, t);
  }
  return [...by.values()]
    .map((t) => {
      const stopped = t.sold - t.cont;
      return {
        op: t.op, sessions: t.n, sold: t.sold,
        sold_rate: ratio(t.sold, t.n), cont_rate: ratio(t.cont, t.sold), b3_rate: ratio(t.b3, t.sold),
        rev: t.rev, ours_stopped: t.w_chat + t.w_noreply, ours_share: ratio(t.w_chat + t.w_noreply, stopped),
        few: t.n < MIN_SESSIONS || t.sold < MIN_SOLD,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/** Andamento settimanale delle sette misure della prova. */
export function weeklySeries({ cRows, mRows, pRows, ids, weeks }) {
  const idSet = new Set(ids.map(Number));
  return weeks.map((wk) => {
    const f = funnel(sumC(cRows, { ids, weeks: [wk] }));
    const ms = mRows.map((r) => fromRow(M_COLS, r)).filter((r) => r.wk === wk && idSet.has(r.cid));
    const paid = ms.reduce((a, r) => a + r.paid, 0);
    const ps = pRows.map((r) => fromRow(P_COLS, r)).filter((r) => r.wk === wk && idSet.has(r.cid));
    return {
      wk,
      sessions: f.sessions,
      sold_rate: f.sold_rate,
      cont_rate: f.cont_rate,
      b3_rate: f.b3_rate,
      cheap_share: ratio(ms.reduce((a, r) => a + r.cheap, 0), paid),
      sconto_share: ratio(ms.reduce((a, r) => a + r.sconto, 0), paid),
      ppc_p50: ms.length === 1 ? ms[0].ppc_p50 || null : null,
      payers: ps.length ? ps.reduce((a, r) => a + r.payers, 0) : null,
      net: ps.length ? ps.reduce((a, r) => a + r.net, 0) : null,
    };
  });
}

// ── Prove ───────────────────────────────────────────────────────────────────
// Le sette misure: chiave, etichetta, verso ("su" = più alto è meglio, "giu" = più basso).
export const PROVA_MEASURES = [
  ["sold_rate", "Conversazioni con proposta che vendono", "su", "pct"],
  ["cont_rate", "Dopo il 1° acquisto propone ancora", "su", "pct"],
  ["b3_rate", "Conversazioni con 3+ acquisti", "su", "pct"],
  ["cheap_share", "Mass con tanti contenuti scontati", "giu", "pct"],
  ["sconto_share", "«Sconto» nelle mass a pagamento", "giu", "pct"],
  ["ppc_p50", "Prezzo per contenuto nelle mass", "su", "usd"],
  ["payers", "Fan che pagano a settimana", "su", "int"],
];

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const mondayOf = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Valida e normalizza una prova in arrivo dal client. Ritorna { ok, prova } | { ok:false, error }. */
export function cleanProva(raw, { now = Date.now() } = {}) {
  const cid = Number(raw?.creator_id);
  if (!Number.isFinite(cid) || cid <= 0) return { ok: false, error: "Profilo non valido" };
  if (!isDay(raw?.start)) return { ok: false, error: "Data di inizio non valida (AAAA-MM-GG)" };
  const start = mondayOf(raw.start);
  const targets = {};
  for (const [k, , , kind] of PROVA_MEASURES) {
    const v = raw?.targets?.[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Obiettivo non valido: ${k}` };
    if (kind === "pct" && n > 1) return { ok: false, error: `Le percentuali vanno tra 0 e 1: ${k}` };
    targets[k] = n;
  }
  return {
    ok: true,
    prova: { creator_id: cid, start, targets, note: String(raw?.note || "").slice(0, 400), created_at: new Date(now).toISOString() },
  };
}

/** Prova: punto di partenza (le 4 settimane prima dell'inizio) e settimane da allora, con l'obiettivo. */
export function provaView(prova, series) {
  if (!prova) return null;
  const before = series.filter((s) => s.wk < prova.start).slice(-4);
  const after = series.filter((s) => s.wk >= prova.start);
  const avg = (rows, k) => {
    const v = rows.map((r) => r[k]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return {
    ...prova,
    measures: PROVA_MEASURES.map(([key, label, dir, kind]) => {
      const base = avg(before, key);
      const last = after.length ? after[after.length - 1][key] : null;
      const target = prova.targets?.[key] ?? null;
      const hit = target == null || last == null ? null : dir === "su" ? last >= target : last <= target;
      return { key, label, dir, kind, base, target, last, hit, weeks: after.map((s) => [s.wk, s[key]]) };
    }),
    weeks_running: after.length,
  };
}

/** Obiettivi proposti per una nuova prova: verso il riferimento, senza promettere il riferimento intero. */
export function suggestTargets(page, ref, mass, refMass) {
  const step = (cur, r, frac) => (cur == null ? null : r == null ? cur : cur + Math.max(0, r - cur) * frac);
  return {
    sold_rate: step(page.sold_rate, ref.sold_rate, 0.2),
    cont_rate: step(page.cont_rate, ref.cont_rate, 1),
    b3_rate: step(page.b3_rate, ref.b3_rate, 0.6),
    cheap_share: 0,
    sconto_share: 0,
    ppc_p50: mass?.ppc_p50 ?? refMass?.ppc_p50 ?? null,
    payers: null,
  };
}
