/**
 * Squadra — logica pura (14/10/2026). Nessun I/O: riceve i dati già letti e
 * restituisce la classifica. Testata in tests/squadra.mjs.
 *
 * DOMANDA a cui risponde (Nicholas, 14/10): "chi sa vendere e chi no, rispetto
 * alla modella su cui è". Nata dall'analisi in chat per decidere chi lascia HOC
 * (motivo: alzare la qualità). Scelte, tutte decise in quella conversazione:
 *   - VENDITE solo da Infloww (export Employee statistics, `ops_kpi:monthly:*`):
 *     Nicholas non vuole CreatorsPro come base delle vendite.
 *   - CreatorsPro SOLO come calendario: i turni (ore × modella × fascia oraria)
 *     servono a sapere su chi e quando ha lavorato ognuno, non quanto ha venduto.
 *   - BRAVURA = venduto all'ora Infloww ÷ venduto all'ora atteso, dove l'atteso è
 *     la media (pesata sulle ore) dei COLLEGHI sulla stessa modella e nella stessa
 *     fascia oraria, escluso l'operatore stesso (leave-one-out: chi domina una
 *     modella altrimenti si confronta con se stesso e prende un falso 1,00).
 *     Senza la fascia oraria chi fa le notti è penalizzato (notte ≈ $65/h, sera
 *     ≈ $116/h misurati ago-set 2026).
 *   - ANZIANITÀ = mesi con busta CP e turni (Nicholas: "quante buste ha avuto").
 *     Pesa molto (mediana 0,49 a 1-3 mesi, 1,05 a 13+): un nuovo in fondo è normale.
 *   - v2: il venduto all'ora si divide per le ORE DI TURNO del calendario CP (vedi
 *     rankPeriod): le ore "attive" di Infloww cambiano definizione tra un export e
 *     l'altro e rendevano i mesi non confrontabili.
 * Limiti dichiarati in pagina: correlazione non causa; le ore per modella vengono
 * dal calendario CP (turni multi-modella divisi in parti uguali); fuori dal
 * calcolo chi non si abbina al calendario.
 */

export const SQUADRA_VERSION = "squadra-2";
export const MIN_HOURS = 30; // ore attive Infloww nel periodo per entrare (solo filtro di sanità dei dati)
export const MIN_HOURS_MONTH = 40; // ore di turno nel mese per avere la bravura del mese
export const MIN_CP_HOURS = 20; // ore di calendario per poter fare il confronto
export const MIN_PEER_HOURS = 40; // ore dei colleghi in una cella modella×fascia
export const MIN_PEERS = 2; // colleghi diversi in una cella per poterla usare
export const FEW_PEERS = 3; // sotto questa soglia il confronto si regge su pochi colleghi (avviso)
export const MIN_COVERAGE = 0.6; // quota delle proprie ore confrontabili coi colleghi
export const SPLIT_SHARE = 0.5; // quota di ore sulle modelle dello split per far parte della squadra

const num = (x) => (x == null || x === "" ? 0 : Number(x) || 0);

/** Nome → token confrontabili (minuscole, senza accenti né apostrofi, senza HOC/ES/EN). */
export function nameTokens(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["hoc", "es", "en"].includes(t));
}
export const nameKey = (s) => nameTokens(s).join("");

export function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/**
 * Trova `name` in `candidates` (array di nomi). Ordine: chiave identica →
 * chiave a distanza ≤2 (refusi, apostrofi) se unica → sottoinsieme di token
 * con almeno 2 token in comune se unico. Ambiguo = null: un buco è meglio del
 * numero di un'altra persona.
 */
export function matchName(name, candidates) {
  const k = nameKey(name);
  if (!k) return null;
  const keyed = candidates.map((c) => ({ c, k: nameKey(c), t: nameTokens(c) }));
  const exact = keyed.filter((x) => x.k === k);
  if (exact.length === 1) return exact[0].c;
  if (exact.length > 1) return null;
  // refusi tollerati solo su nomi lunghi: su "naz" un errore di 2 lettere è già
  // un'altra persona ("max") — trovato sui dati veri il 14/10
  const tol = k.length >= 10 ? 2 : k.length >= 7 ? 1 : 0;
  const near = tol ? keyed.filter((x) => x.k && levenshtein(x.k, k) <= tol) : [];
  if (near.length === 1) return near[0].c;
  if (near.length > 1) return null;
  const t = new Set(nameTokens(name));
  const sub = keyed.filter((x) => {
    const xs = new Set(x.t);
    const common = [...t].filter((y) => xs.has(y)).length;
    const subset = [...t].every((y) => xs.has(y)) || x.t.every((y) => t.has(y));
    return subset && common >= 2;
  });
  return sub.length === 1 ? sub[0].c : null;
}

/** Ore attive Infloww di una riga (venduto ÷ vendite/ora, o messaggi ÷ messaggi/ora). */
export function rowHours(r) {
  if (num(r.sales_per_hour) > 0 && num(r.sales) > 0) return num(r.sales) / num(r.sales_per_hour);
  if (num(r.messages_sent_per_hour) > 0) return num(r.direct_messages_sent) / num(r.messages_sent_per_hour);
  return 0;
}

/** Righe Infloww → aggregato per operatore (stessi filtri dell'analisi del 14/10). */
export function aggregateKpi(rows) {
  const E = new Map();
  for (const r of rows || []) {
    if (r.is_mass) continue;
    if (String(r.group || "").toLowerCase().includes("manager")) continue;
    const h = rowHours(r);
    if (h <= 0 || !r.employee) continue;
    const e = E.get(r.employee) || { h: 0, sales: 0, ppv_sales: 0, msgs: 0, ppv_sent: 0, unl: 0, fans: 0, payers: 0, rt_w: 0, rt_h: 0 };
    e.h += h;
    e.sales += num(r.sales);
    e.ppv_sales += num(r.ppv_sales);
    e.msgs += num(r.direct_messages_sent);
    e.ppv_sent += num(r.direct_ppvs_sent);
    e.unl += num(r.ppvs_unlocked);
    e.fans += num(r.fans_chatted);
    e.payers += num(r.fans_who_spent_money);
    if (num(r.response_time_seconds) > 0) {
      e.rt_w += num(r.response_time_seconds) * h;
      e.rt_h += h;
    }
    E.set(r.employee, e);
  }
  const ops = new Map();
  for (const [name, e] of E) {
    if (e.h < MIN_HOURS || e.sales <= 0 || e.msgs < 200) continue;
    ops.set(name, {
      name,
      h: e.h,
      sales: e.sales,
      sph: e.sales / e.h,
      ppv_price: e.unl ? e.ppv_sales / e.unl : null,
      cvr: e.fans ? e.payers / e.fans : null,
      per_payer: e.payers ? e.sales / e.payers : null,
      unlock: e.ppv_sent ? e.unl / e.ppv_sent : null,
      rt: e.rt_h ? e.rt_w / e.rt_h : null,
    });
  }
  return ops;
}

/** Fasce notturne del calendario CP (mezzanotte → mattina). */
export const NIGHT_BUCKETS = new Set(["Night", "After"]);

/**
 * Turni CP → ore per operatore su (modella, fascia). `resolve(shift)` restituisce
 * il nome Infloww dell'operatore o null. Un turno su più modelle si divide in
 * parti uguali.
 */
export function buildCells(shifts, resolve) {
  const cells = new Map(); // name -> Map("cid|bucket" -> h)
  for (const s of shifts || []) {
    const name = resolve(s);
    if (!name) continue;
    const h = num(s.h);
    if (h <= 0) continue;
    const cids = (s.creator_ids || []).map(Number).filter(Number.isFinite);
    const list = cids.length ? cids : [0];
    const m = cells.get(name) || new Map();
    for (const c of list) {
      const key = `${c}|${s.bucket || "?"}`;
      m.set(key, (m.get(key) || 0) + h / list.length);
    }
    cells.set(name, m);
  }
  return cells;
}

/**
 * Bravura confrontata coi colleghi (stessa modella × fascia, leave-one-out).
 * Restituisce Map name -> { idx, exp, cp_h, crs: {cid: quota}, night }.
 */
export function compareWithPeers(ops, cells) {
  const eligible = [...ops.keys()].filter((n) => {
    const c = cells.get(n);
    return c && [...c.values()].reduce((a, b) => a + b, 0) >= MIN_CP_HOURS;
  });
  // [somma sph×ore, ore, numero di operatori] per cella e per modella
  const cellSum = new Map();
  const crSum = new Map();
  for (const n of eligible) {
    const sph = ops.get(n).sph;
    const seenCr = new Set();
    for (const [key, h] of cells.get(n)) {
      const cs = cellSum.get(key) || [0, 0, 0];
      cs[0] += sph * h;
      cs[1] += h;
      cs[2] += 1;
      cellSum.set(key, cs);
      const cid = key.split("|")[0];
      const cc = crSum.get(cid) || [0, 0, 0];
      cc[0] += sph * h;
      cc[1] += h;
      if (!seenCr.has(cid)) { cc[2] += 1; seenCr.add(cid); }
      crSum.set(cid, cc);
    }
  }
  const out = new Map();
  for (const n of eligible) {
    const o = ops.get(n);
    const c = cells.get(n);
    const tot = [...c.values()].reduce((a, b) => a + b, 0);
    let numr = 0;
    let den = 0;
    let fewH = 0; // ore confrontate con meno di FEW_PEERS colleghi
    const crs = {};
    let night = 0;
    for (const [key, h] of c) {
      const [cid, bucket] = key.split("|");
      crs[cid] = (crs[cid] || 0) + h / tot;
      if (NIGHT_BUCKETS.has(bucket)) night += h / tot;
      // colleghi = tutti tranne lui (leave-one-out)
      const [cs0, cs1, cs2] = cellSum.get(key);
      const s = cs0 - o.sph * h;
      const H = cs1 - h;
      const peers = cs2 - 1;
      let base = null;
      let usedPeers = 0;
      if (H >= MIN_PEER_HOURS && peers >= MIN_PEERS) {
        base = s / H;
        usedPeers = peers;
      } else {
        const [c0, c1, c2] = crSum.get(cid);
        const crH = cells.get(n);
        let mine = 0;
        for (const [k2, h2] of crH) if (k2.split("|")[0] === cid) mine += h2;
        const s2 = c0 - o.sph * mine;
        const H2 = c1 - mine;
        if (H2 >= MIN_PEER_HOURS && c2 - 1 >= MIN_PEERS) {
          base = s2 / H2;
          usedPeers = c2 - 1;
        }
      }
      if (base == null) continue;
      numr += base * h;
      den += h;
      if (usedPeers < FEW_PEERS) fewH += h;
    }
    const exp = den && den / tot >= MIN_COVERAGE ? numr / den : null;
    out.set(n, { idx: exp ? o.sph / exp : null, exp, cp_h: tot, crs, night, few_peers: den ? fewH / den > 0.5 : false });
  }
  return out;
}

/**
 * Classifica completa di un insieme di righe+turni (un periodo).
 *
 * v2 (14/10/2026): il venduto all'ora si divide per le ORE DI TURNO del calendario
 * CP, non per le ore "attive" di Infloww. Le ore attive cambiano definizione da un
 * export all'altro (rapporto ore attive/timbrate: giu 1,00 · ago 0,87 · set 1,32 ·
 * ott 1,31): a settembre lo split sembrava vendere il 41% in meno all'ora con un
 * venduto calato dell'8%. Il venduto resta di Infloww; il calendario dà solo le ore.
 * Chi non ha turni abbinati resta in elenco con sph/idx null ("non confrontabile").
 */
export function rankPeriod(rows, shifts, resolve) {
  const kpi = aggregateKpi(rows);
  const cells = buildCells(shifts, resolve);
  const ops = new Map();
  for (const [name, o] of kpi) {
    const c = cells.get(name);
    const cal = c ? [...c.values()].reduce((a, b) => a + b, 0) : 0;
    ops.set(name, cal >= MIN_CP_HOURS
      ? { ...o, h_infloww: o.h, h: cal, sph: o.sales / cal }
      : { ...o, h_infloww: o.h, h: o.h, sph: null, no_calendar: true });
  }
  const comparable = new Map([...ops].filter(([, o]) => o.sph != null));
  const cmp = compareWithPeers(comparable, cells);
  return { ops, cmp };
}

/** Quota delle ore dell'operatore sulle modelle dello split (crs = {cid: quota}). */
export function splitShare(crs, creatorIds) {
  if (!crs) return 0;
  const set = new Set((creatorIds || []).map(String));
  return Object.entries(crs).reduce((a, [cid, q]) => a + (set.has(String(cid)) ? q : 0), 0);
}

/** Avvisi di lettura su una riga. */
export function rowFlags(r) {
  const f = [];
  if (r.h < 100) f.push("poche ore"); // ore di turno (calendario) nel periodo
  if (r.tenure != null && r.tenure <= 3) f.push("nuovo");
  if (r.m1 != null && r.m2 != null && Math.abs(r.m1 - r.m2) > 0.5) f.push("altalenante");
  if (r.few_peers) f.push("pochi colleghi");
  return f;
}

/**
 * Le due misure non sono d'accordo? (bravura Infloww vs indice di resa della chat).
 * Segnale da guardare, non verdetto: una alta (≥1,1) e l'altra bassa (≤0,7).
 */
export function measuresDisagree(a, b) {
  if (a == null || b == null) return false;
  return (a >= 1.1 && b <= 0.7) || (a <= 0.7 && b >= 1.1);
}

/** Mesi "YYYY-MM": da `first` a `last` compresi. */
export function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Mese "YYYY-MM" spostato di `delta` mesi. */
export function shiftMonth(ym, delta) {
  let [y, m] = ym.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
