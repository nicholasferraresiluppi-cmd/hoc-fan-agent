/**
 * Fasce e turni — logica pura (22/10/2026). Nessun I/O. Testata in tests/fasce.mjs.
 *
 * DOMANDA (Nicholas, 22/10): "chi rende di più e in quali turni? Ho paura che i
 * turni serali li facciano persone che non stanno rendendo." Le ore non valgono
 * tutte uguali (22-3 ≈ $89/h a persona sullo split, 7-12 ≈ $54/h): chi è bravo
 * deve stare dove l'ora vale di più, e chi chiude basso non deve avere la
 * priorità sulla notte.
 *
 * COSA DICONO I DATI (ago-ott 2026, 13k turni CP, verificato prima di costruire):
 *   - la BRAVURA GENERALE di un operatore è stabile: calcolata sui giorni pari e
 *     su quelli dispari separatamente, r = 0,79;
 *   - la "fascia personale" (essere più bravi di sé stessi in una fascia) quasi
 *     non si vede: r ≈ 0,0 sullo split a ogni soglia di ore, 0,17 su tutta HOC.
 *     Chi è bravo lo è in tutte le fasce. Quindi la regola non è "ognuno nella sua fascia" ma "i più bravi
 *     nelle fasce che valgono di più". Le due correlazioni si ricalcolano a ogni
 *     giro (`stability`) e la pagina le mostra: se un giorno la fascia personale
 *     comparisse, lo si vedrebbe lì.
 *   - quale fascia vale di più CAMBIA per pagina (Martina Scavo: pomeriggio ≈ sera
 *     > notte): la priorità si calcola pagina per pagina, non è "22-3 sempre".
 *
 * SCELTE:
 *   - Fonte: turni CreatorsPro (`cp:wages`), l'unica che dà le vendite PER TURNO
 *     (Infloww dà solo il totale del mese per operatore). Venduto = total_attributed
 *     del turno (nei turni in duo è già la quota della persona). Controllo fatto:
 *     la bravura così calcolata e quella della scheda Squadra (vendite Infloww)
 *     vanno d'accordo, r = 0,71 su 68 operatori dello split.
 *   - Bravura = venduto ÷ venduto atteso, dove l'atteso viene dai COLLEGHI sulla
 *     stessa pagina, nella stessa fascia, nello stesso tipo di turno (da solo / in
 *     duo), escluso l'operatore stesso (leave-one-out, come squadra-core).
 *   - Valore di una fascia per pagina = venduto all'ora a PARI BRAVURA (Σ venduto ÷
 *     Σ ore×bravura): altrimenti una fascia sembra buona solo perché ci mettiamo i
 *     più bravi. Fasce entro il 10% del migliore = "di punta" anche loro.
 *   - Fasce dall'ora di INIZIO del turno, ora di Roma (i turni veri sono 7-12/13,
 *     12-17/13-19, 17-22/19-01, 22-3, 1-7/3-7).
 *
 * Correlazione, non causa. Le ore in fascia dipendono anche dalla disponibilità
 * delle persone (altro lavoro, fuso orario): la pagina dà una priorità, non un
 * calendario.
 */

export const FASCE_VERSION = "fasce-1";

export const SLOTS = [
  { id: "22-3", label: "22–3", from: 22, to: 1 },
  { id: "17-22", label: "17–22", from: 17, to: 22 },
  { id: "12-17", label: "12–17", from: 12, to: 17 },
  { id: "7-12", label: "7–12", from: 6, to: 12 },
  { id: "1-7", label: "1–7", from: 1, to: 6 },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);

export const MIN_PEER_HOURS = 20; // ore dei colleghi in una cella pagina×fascia×tipo
export const MIN_CMP_HOURS = 60; // ore confrontabili per avere la bravura
export const MIN_COVERAGE = 0.6; // quota delle proprie ore confrontabili
export const MIN_SLOT_HOURS = 150; // ore in una fascia per darle un valore sulla pagina
export const SAME_VALUE = 0.1; // entro il 10% del migliore = fascia di punta anche lei
export const WEAK = 0.85; // bravura sotto cui la fascia di punta non è una priorità
export const STRONG = 1.15; // bravura sopra cui la persona va portata nelle fasce di punta
export const PRIME_HEAVY = 0.3; // quota delle proprie ore in fascia di punta = "le fa spesso"
export const PRIME_LIGHT = 0.2; // sotto = "le fa poco"
export const MIN_OP_HOURS_PAGE = 30; // ore su una pagina per contarla nelle sue liste
export const STOP_DAYS = 21; // nessun turno da 3 settimane = fuori dalle liste d'azione
export const DUO_PAGE = 0.3; // quota di fasce coperte in due = pagina a doppio turno

const num = (x) => (x == null || x === "" ? 0 : Number(x) || 0);

const ROME_H = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" });
const ROME_D = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });

/** Ora di Roma (0-23) e giorno "YYYY-MM-DD" di un timestamp ISO. */
export function romeParts(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return { hour: Number(ROME_H.format(d)) % 24, day: ROME_D.format(d) };
}

/** Fascia dall'ora di inizio (Roma). */
export function slotOfHour(h) {
  if (h >= 22 || h < 1) return "22-3";
  if (h < 6) return "1-7";
  if (h < 12) return "7-12";
  if (h < 17) return "12-17";
  return "17-22";
}

/**
 * Turni CP normalizzati → pezzi turno×pagina. Turno su più pagine = ore e venduto
 * divisi in parti uguali. Doppioni (stesso id) contati una volta.
 * Ingresso: [{ id, member_id, member_name, started_at, worked_hours,
 *              total_attributed, creator_ids, cosellers }]
 */
export function toPieces(shifts) {
  const seen = new Set();
  const out = [];
  for (const s of shifts || []) {
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    const h = num(s.worked_hours);
    const p = romeParts(s.started_at);
    const cids = (s.creator_ids || []).map(String).filter(Boolean);
    if (h <= 0 || !p || !cids.length || s.member_id == null) continue;
    const mode = num(s.cosellers) >= 2 ? "duo" : "solo";
    for (const cid of cids) {
      out.push({
        op: String(s.member_id),
        name: s.member_name || String(s.member_id),
        cid,
        slot: slotOfHour(p.hour),
        mode,
        day: p.day,
        h: h / cids.length,
        rev: num(s.total_attributed) / cids.length,
      });
    }
  }
  return out;
}

const cellKey = (x) => `${x.cid}|${x.slot}|${x.mode}`;

/**
 * Per ogni pezzo: venduto atteso dai colleghi della stessa cella (leave-one-out).
 * Restituisce Map cellKey → Map op → { h, rev } e una funzione che dà il ritmo
 * dei colleghi (venduto/ora) per (cella, op) o null se i colleghi sono troppo pochi.
 */
export function peerTable(pieces) {
  const cells = new Map();
  for (const x of pieces) {
    const k = cellKey(x);
    const m = cells.get(k) || new Map();
    const c = m.get(x.op) || { h: 0, rev: 0 };
    c.h += x.h;
    c.rev += x.rev;
    m.set(x.op, c);
    cells.set(k, m);
  }
  const totals = new Map();
  for (const [k, m] of cells) {
    let h = 0;
    let rev = 0;
    for (const c of m.values()) { h += c.h; rev += c.rev; }
    totals.set(k, { h, rev, n: m.size });
  }
  const peerRate = (k, op) => {
    const t = totals.get(k);
    const mine = cells.get(k)?.get(op) || { h: 0, rev: 0 };
    if (!t) return null;
    const H = t.h - mine.h;
    const n = t.n - (mine.h > 0 ? 1 : 0);
    if (H < MIN_PEER_HOURS || n < 1) return null;
    return (t.rev - mine.rev) / H;
  };
  return { cells, peerRate };
}

/**
 * Bravura per operatore: Σ venduto ÷ Σ atteso sulle ore confrontabili.
 * Map op → { idx, h, cmp_h, rev, exp }. idx null se poche ore confrontabili.
 */
export function bravura(pieces, { minCmp = MIN_CMP_HOURS } = {}) {
  const { cells, peerRate } = peerTable(pieces);
  const acc = new Map();
  for (const [k, m] of cells) {
    for (const [op, c] of m) {
      const a = acc.get(op) || { h: 0, rev: 0, cmp_h: 0, cmp_rev: 0, exp: 0 };
      a.h += c.h;
      a.rev += c.rev;
      const r = peerRate(k, op);
      if (r != null) {
        a.cmp_h += c.h;
        a.cmp_rev += c.rev;
        a.exp += r * c.h;
      }
      acc.set(op, a);
    }
  }
  const out = new Map();
  for (const [op, a] of acc) {
    const ok = a.cmp_h >= minCmp && a.cmp_h / a.h >= MIN_COVERAGE && a.exp > 0;
    out.set(op, { idx: ok ? a.cmp_rev / a.exp : null, h: a.h, cmp_h: a.cmp_h, rev: a.rev, exp: a.exp });
  }
  return out;
}

function corr(a, b) {
  const n = a.length;
  if (n < 5) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num_ = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num_ += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num_ / Math.sqrt(da * db) : null;
}

/** Indice per (operatore, fascia) su tutte le pagine. Map "op|slot" → idx. */
function slotIndex(pieces, minCmp) {
  const { cells, peerRate } = peerTable(pieces);
  const acc = new Map();
  for (const [k, m] of cells) {
    const slot = k.split("|")[1];
    for (const [op, c] of m) {
      const r = peerRate(k, op);
      if (r == null) continue;
      const key = `${op}|${slot}`;
      const a = acc.get(key) || { h: 0, rev: 0, exp: 0 };
      a.h += c.h;
      a.rev += c.rev;
      a.exp += r * c.h;
      acc.set(key, a);
    }
  }
  const out = new Map();
  for (const [k, a] of acc) if (a.h >= minCmp && a.exp > 0 && a.rev > 0) out.set(k, a.rev / a.exp);
  return out;
}

/**
 * Prova di onestà, ricalcolata a ogni giro: giorni pari contro giorni dispari.
 *   general: la bravura generale regge? (correlazione dei log)
 *   personal: la fascia personale (scarto dalla propria media) regge?
 */
export function stability(pieces) {
  const odd = pieces.filter((x) => Number(x.day.slice(8, 10)) % 2 === 1);
  const even = pieces.filter((x) => Number(x.day.slice(8, 10)) % 2 === 0);
  const half = MIN_CMP_HOURS / 2;
  const bo = bravura(odd, { minCmp: half });
  const be = bravura(even, { minCmp: half });
  const ga = [];
  const gb = [];
  for (const [op, a] of bo) {
    const b = be.get(op);
    if (a.idx > 0 && b?.idx > 0) { ga.push(Math.log(a.idx)); gb.push(Math.log(b.idx)); }
  }
  const so = slotIndex(odd, half / 2);
  const se = slotIndex(even, half / 2);
  const byOp = new Map();
  for (const [k, v] of so) {
    const w = se.get(k);
    if (!w) continue;
    const [op, slot] = k.split("|");
    const l = byOp.get(op) || [];
    l.push([slot, Math.log(v), Math.log(w)]);
    byOp.set(op, l);
  }
  const pa = [];
  const pb = [];
  for (const l of byOp.values()) {
    if (l.length < 2) continue;
    const ma = l.reduce((s, x) => s + x[1], 0) / l.length;
    const mb = l.reduce((s, x) => s + x[2], 0) / l.length;
    for (const x of l) { pa.push(x[1] - ma); pb.push(x[2] - mb); }
  }
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return { general: r2(corr(ga, gb)), general_n: ga.length, personal: r2(corr(pa, pb)), personal_n: pa.length };
}

/**
 * Valore delle fasce di una pagina a pari bravura + quali sono di punta.
 * `bra` = Map op → { idx }. Restituisce { slots: {id: {h, sph, sph_adj}}, prime: [id] }.
 */
export function slotValues(piecesOfPage, bra) {
  const s = {};
  for (const x of piecesOfPage) {
    const v = s[x.slot] || { h: 0, rev: 0, adj_h: 0, adj_rev: 0 };
    v.h += x.h;
    v.rev += x.rev;
    const idx = bra.get(x.op)?.idx;
    if (idx > 0) { v.adj_h += x.h * idx; v.adj_rev += x.rev; }
    s[x.slot] = v;
  }
  const slots = {};
  for (const [id, v] of Object.entries(s)) {
    slots[id] = {
      h: v.h,
      sph: v.h ? v.rev / v.h : null,
      sph_adj: v.h >= MIN_SLOT_HOURS && v.adj_h > 0 ? v.adj_rev / v.adj_h : null,
    };
  }
  const valued = SLOT_IDS.filter((id) => slots[id]?.sph_adj != null).sort((a, b) => slots[b].sph_adj - slots[a].sph_adj);
  const top = valued.length ? slots[valued[0]].sph_adj : null;
  const prime = valued.length >= 2 ? valued.filter((id) => slots[id].sph_adj >= top * (1 - SAME_VALUE)) : [];
  // se tutte le fasce valgono uguale non c'è priorità da dare
  const flat = valued.length >= 2 && prime.length === valued.length;
  return { slots, order: valued, prime: flat ? [] : prime, flat };
}

/** Quota di (giorno, fascia) della pagina coperti da 2+ persone. */
export function duoShare(piecesOfPage) {
  const m = new Map();
  for (const x of piecesOfPage) {
    const k = `${x.day}|${x.slot}`;
    const s = m.get(k) || new Set();
    s.add(x.op);
    m.set(k, s);
  }
  if (!m.size) return null;
  let duo = 0;
  for (const s of m.values()) if (s.size >= 2) duo++;
  return duo / m.size;
}

/**
 * Documento completo. `pieces` = tutti i pezzi della finestra (tutta HOC: più
 * colleghi = confronti migliori). `now` per la presenza. `names` = cid → nome pagina.
 */
export function buildFasce(pieces, { now = Date.now(), names = {} } = {}) {
  const bra = bravura(pieces);
  const { peerRate } = peerTable(pieces);
  const today = new Date(now).toISOString().slice(0, 10);
  const lastDay = new Map();
  const opName = new Map();
  for (const x of pieces) {
    if (x.day > (lastDay.get(x.op) || "")) lastDay.set(x.op, x.day);
    opName.set(x.op, x.name);
  }
  const active = (op) => {
    const d = lastDay.get(op);
    return Boolean(d) && (Date.parse(today) - Date.parse(d)) / 86400000 <= STOP_DAYS;
  };

  const byPage = new Map();
  for (const x of pieces) {
    const l = byPage.get(x.cid) || [];
    l.push(x);
    byPage.set(x.cid, l);
  }

  const r = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  const pages = [];
  // op → { cid → { slot → h } } e ore di punta
  const opPages = new Map();
  for (const [cid, list] of byPage) {
    const val = slotValues(list, bra);
    const primeSet = new Set(val.prime);
    // per operatore su questa pagina: ore e venduto per fascia, atteso dai colleghi
    const ops = new Map();
    for (const x of list) {
      const o = ops.get(x.op) || { h: 0, slots: {} };
      o.h += x.h;
      const sl = o.slots[x.slot] || { h: 0, rev: 0, exp: 0, cmp_h: 0 };
      sl.h += x.h;
      sl.rev += x.rev;
      const pr = peerRate(cellKey(x), x.op);
      if (pr != null) { sl.exp += pr * x.h; sl.cmp_h += x.h; }
      o.slots[x.slot] = sl;
      ops.set(x.op, o);
    }
    const people = [];
    for (const [op, o] of ops) {
      const prime_h = val.prime.reduce((s, id) => s + (o.slots[id]?.h || 0), 0);
      const slots = {};
      for (const [id, sl] of Object.entries(o.slots)) {
        slots[id] = {
          h: Math.round(sl.h),
          sph: sl.h ? Math.round(sl.rev / sl.h) : null,
          // venduto all'ora che i colleghi fanno nelle stesse celle (pagina×fascia×tipo)
          peer_sph: sl.cmp_h >= 10 ? Math.round(sl.exp / sl.cmp_h) : null,
          // venduto mancato (o in più) rispetto ai colleghi nelle stesse ore
          gap: sl.cmp_h >= 10 ? Math.round(sl.rev * (sl.cmp_h / sl.h) - sl.exp) : null,
        };
      }
      people.push({ op, name: opName.get(op), h: Math.round(o.h), prime_h: Math.round(prime_h), slots, idx: r(bra.get(op)?.idx), active: active(op) });
      const op_ = opPages.get(op) || { h: 0, prime_h: 0, valued_h: 0, pages: {} };
      op_.h += o.h;
      op_.prime_h += prime_h;
      if (val.prime.length) op_.valued_h += o.h;
      op_.pages[cid] = Math.round(o.h);
      for (const [id, sl] of Object.entries(o.slots)) {
        op_.slots = op_.slots || {};
        op_.slots[id] = (op_.slots[id] || 0) + sl.h;
      }
      opPages.set(op, op_);
    }
    people.sort((a, b) => b.h - a.h);

    // chi chiude basso nelle fasce di punta / chi è forte e ci va poco
    const inPrime = (p) => (p.h >= MIN_OP_HOURS_PAGE ? p.prime_h / p.h : 0);
    const weakInPrime = val.prime.length ? people.filter((p) => p.active && p.idx != null && p.idx <= WEAK && p.prime_h >= MIN_OP_HOURS_PAGE && inPrime(p) >= PRIME_HEAVY) : [];
    const strongOutside = val.prime.length ? people.filter((p) => p.active && p.idx != null && p.idx >= STRONG && p.h >= MIN_OP_HOURS_PAGE && inPrime(p) < PRIME_LIGHT) : [];
    const duo = duoShare(list);
    const total_h = list.reduce((s, x) => s + x.h, 0);
    pages.push({
      cid,
      name: names[cid] || cid,
      h: Math.round(total_h),
      duo: r(duo),
      is_duo: duo != null && duo >= DUO_PAGE,
      slots: Object.fromEntries(Object.entries(val.slots).map(([id, v]) => [id, { h: Math.round(v.h), sph: v.sph == null ? null : Math.round(v.sph), sph_adj: v.sph_adj == null ? null : Math.round(v.sph_adj) }])),
      order: val.order,
      prime: val.prime,
      flat: val.flat,
      people,
      weak_in_prime: weakInPrime.map((p) => p.op),
      strong_outside: strongOutside.map((p) => p.op),
      prime_names: [...primeSet],
    });
  }
  pages.sort((a, b) => b.h - a.h);

  const operators = [];
  for (const [op, o] of opPages) {
    const b = bra.get(op);
    const idx = b?.idx ?? null;
    const primeShare = o.valued_h >= MIN_OP_HOURS_PAGE ? o.prime_h / o.valued_h : null;
    let verdict = null;
    if (idx != null && primeShare != null && active(op)) {
      if (idx <= WEAK && primeShare >= PRIME_HEAVY) verdict = "togliere";
      else if (idx >= STRONG && primeShare < PRIME_LIGHT) verdict = "portare";
    }
    operators.push({
      op,
      name: opName.get(op),
      idx: r(idx),
      h: Math.round(o.h),
      cmp_h: Math.round(b?.cmp_h || 0),
      prime_share: r(primeShare),
      slots: Object.fromEntries(Object.entries(o.slots || {}).map(([k, v]) => [k, Math.round(v)])),
      pages: o.pages,
      last_day: lastDay.get(op) || null,
      active: active(op),
      verdict,
    });
  }
  operators.sort((a, b) => b.h - a.h);

  // valore delle fasce sull'insieme (tutte le pagine passate)
  const all = slotValues(pieces, bra);
  return {
    version: FASCE_VERSION,
    pages,
    operators,
    overall: Object.fromEntries(Object.entries(all.slots).map(([id, v]) => [id, { h: Math.round(v.h), sph_adj: v.sph_adj == null ? null : Math.round(v.sph_adj) }])),
    stability: stability(pieces),
  };
}

/**
 * Valore delle fasce sulle sole pagine di uno split, a pari bravura (per il
 * riquadro in cima). `pages` = righe di buildFasce già filtrate.
 */
export function splitSlotValues(pages) {
  const acc = {};
  for (const p of pages) {
    for (const [id, v] of Object.entries(p.slots || {})) {
      if (v.sph_adj == null) continue;
      const a = acc[id] || { h: 0, w: 0 };
      a.h += v.h;
      a.w += v.sph_adj * v.h;
      acc[id] = a;
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, { h: Math.round(a.h), sph_adj: a.h ? Math.round(a.w / a.h) : null }]));
}
