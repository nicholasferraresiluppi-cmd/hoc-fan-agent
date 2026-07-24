// Copertura duo — congiunge i segnali dell'export Infloww (che coprono ANCHE i
// turni in duo) al profilo-segnali warehouse (solo turni singoli). Chiude il buco
// noto di operator-signals.js: in duo il warehouse non sa chi ha scritto, l'export
// Message Dashboard sì (colonna Sender) → i suoi aggregati, oggi orfani in
// /admin/infloww-ingest, entrano qui nel profilo dell'operatore.
//
// DISCIPLINA (Nicholas): i numeri NON si incatenano né si fondono. Il warehouse dà
// il turno SINGOLO, l'export dà TUTTI i turni (singoli + duo); i due valori restano
// affiancati, ciascuno dalla sua fonte. La differenza tra loro RIGUARDA i turni in
// duo — ed è proprio il valore aggiunto dell'export (#77): fa EMERGERE chi cambia
// comportamento quando lavora in coppia, cosa invisibile al profilo che vede solo i
// singoli. Confronto INDICATIVO, non fusione e non dato contabile.
//
// ONESTÀ DI SCOPO:
//   - Confrontabili solo i due segnali COUNT-based comuni alle due fonti:
//       question_rate  — validato cross-fonte corr 0.78 (#77) → GUIDA il verdetto
//       avg_ppv_price  — corr 0.63, più rumoroso → informativo, NON alza il flag
//     Cadenza/latency NON sono nell'export (mancano le ore) → niente confronto lì.
//   - Le due misure hanno finestre temporali diverse (warehouse ~ultimi 60gg,
//     export = periodo del file) e definizioni leggermente diverse del "?": il
//     delta è confuso anche da questo → soglie prudenti, periodo sempre esposto,
//     e il flag conta come "attenzione forte" (diverging) SOLO se il periodo
//     dell'export è noto e recente. Export non recente o senza periodo → flag
//     depotenziato, fuori dal conteggio.
//   - IDENTITÀ AMBIGUA non si abbina, su ENTRAMBI i lati: se due nomi distinti
//     (warehouse o export) normalizzano allo stesso, non attribuiamo (meglio un
//     buco che un numero sull'operatore sbagliato).
//   - Coaching, non score/comp (policy dati-operatore, come tutto operator-signals).

export const DUO_COVERAGE_VERSION = "duo-cov-1-2026-07";

// Soglie di divergenza: sopra il rumore metodologico atteso tra le due fonti.
const Q_DIVERGE = 0.06; // tasso domande: 6 punti percentuali
const PRICE_DIVERGE_REL = 0.15; // prezzo PPV: 15% relativo
const STALE_DAYS = 45; // export più vecchio di così: confronto poco affidabile
const STALE_MS = STALE_DAYS * 24 * 3600 * 1000;

// Normalizzatore identico a normalizeName di src/lib/me.js (stessa identità
// operatore in tutta l'app). È il default: la route passa comunque quello reale.
export function normalizeOpName(s) {
  return (s || "").toLowerCase().replace(/[\s._-]+/g, "");
}

// Valore grezzo di una metrica warehouse dall'array p.metrics (o null).
function warehouseVal(profile, key) {
  const m = (profile?.metrics || []).find((x) => x && x.key === key);
  const v = m ? m.value : null;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

function toNum(v) {
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

// Fine del periodo dell'export come timestamp, o null se assente/non parsabile.
function periodEndTs(period) {
  const to = period && period.to;
  if (!to) return null;
  const t = Date.parse(`${to}T23:59:59Z`);
  return Number.isFinite(t) ? t : null;
}

// Confronto singolo (warehouse) vs tutti-i-turni (export) per UN operatore già
// abbinato. Ritorna il blocco `duo` da appendere al profilo.
function compareOne(profile, exp, now) {
  const rows = [];
  let flag = false;

  // question_rate — segnale pulito, guida il verdetto/flag
  const singleQ = warehouseVal(profile, "question_rate");
  const allQ = toNum(exp.question_rate);
  if (singleQ != null && allQ != null) {
    const delta = +(allQ - singleQ).toFixed(4);
    let verdict = "coerente";
    if (delta > Q_DIVERGE) {
      verdict = "più domande in duo"; // peggiora (domande ↓ = meglio) → attenzione
      flag = true;
    } else if (delta < -Q_DIVERGE) {
      verdict = "meno domande in duo"; // migliora includendo i duo
    }
    rows.push({ key: "question_rate", label: "Tasso di domande", single: singleQ, all: allQ, delta, verdict, better: "low" });
  }

  // avg_ppv_price — più rumoroso: informativo, non alza il flag
  const singleP = warehouseVal(profile, "avg_ppv_price");
  const allP = toNum(exp.avg_ppv_price);
  if (singleP != null && allP != null && singleP > 0) {
    const rel = (allP - singleP) / singleP;
    let verdict = "coerente";
    if (rel <= -PRICE_DIVERGE_REL) verdict = "prezzo più basso in duo";
    else if (rel >= PRICE_DIVERGE_REL) verdict = "prezzo più alto in duo";
    rows.push({ key: "avg_ppv_price", label: "Prezzo medio PPV", single: singleP, all: allP, delta: +(allP - singleP).toFixed(2), verdict, better: "high", caveat: true });
  }

  // Affidabilità temporale del confronto (evita il "mele vs pere" muto):
  //   period_known=false → periodo dell'export non estraibile
  //   stale=true         → periodo noto ma oltre STALE_DAYS fa
  // Solo un confronto con periodo noto e recente alza il flag "forte" (diverging).
  const end = periodEndTs(exp.period);
  const periodKnown = end != null;
  const stale = periodKnown && now - end > STALE_MS;

  return {
    operator_export: exp.operator, // nome come compare nell'export (trasparenza del match)
    msgs: toNum(exp.msgs),
    period: exp.period || null,
    period_known: periodKnown,
    stale,
    rows,
    flag,
  };
}

// Conta le occorrenze di ogni chiave normalizzata in una lista di oggetti con
// `.operator`. Serve a rilevare le collisioni di normalizzazione (identità ambigua).
function keyCounts(items, normalize) {
  const c = new Map();
  for (const it of items) {
    if (!it || !it.operator) continue;
    const k = normalize(it.operator);
    if (!k) continue;
    c.set(k, (c.get(k) || 0) + 1);
  }
  return c;
}

/**
 * Appende a ogni profilo warehouse il blocco `duo` (o null) confrontando i segnali
 * dell'export Infloww, e ritorna il sommario di copertura. Muta i profili in place
 * (stesso pattern di attachCoachingPaths), additivo: non tocca nessun campo esistente.
 *
 * @param {Array<object>} warehouseProfiles  data.profiles (mutati in place)
 * @param {Array<object>} inflowwList         storeToList(store): [{operator,msgs,question_rate,avg_ppv_price,ppv_share,period,updated_at}]
 * @param {object} [opts]
 * @param {(s:string)=>string} [opts.normalize] normalizzatore nome (default: normalizeOpName)
 * @param {number} [opts.now] timestamp per la staleness (default: Date.now())
 * @returns {{version,store_count,matched,diverging,ambiguous,infloww_only:Array,warehouse_only:number}}
 */
export function buildDuoCoverage(warehouseProfiles, inflowwList, opts = {}) {
  const normalize = typeof opts.normalize === "function" ? opts.normalize : normalizeOpName;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const profiles = Array.isArray(warehouseProfiles) ? warehouseProfiles : [];
  const list = Array.isArray(inflowwList) ? inflowwList : [];

  // indice export per nome normalizzato (l'ultimo vince, deterministico)
  const byNorm = new Map();
  for (const f of list) {
    if (!f || !f.operator) continue;
    const k = normalize(f.operator);
    if (!k) continue;
    byNorm.set(k, f);
  }

  // AMBIGUITÀ SIMMETRICA: una chiave è ambigua se due nomi distinti collidono nella
  // normalizzazione da un lato O dall'altro (warehouse: attribuiresti a entrambi lo
  // stesso export; export: sceglieresti un export a caso). In entrambi i casi non
  // abbiamo un'identità certa → non attribuiamo. `ambiguous` conta i NOMI ambigui.
  const whCounts = keyCounts(profiles, normalize);
  const expCounts = keyCounts(list, normalize);
  const ambiguousKeys = new Set();
  for (const [k, n] of whCounts) if (n > 1) ambiguousKeys.add(k);
  for (const [k, n] of expCounts) if (n > 1) ambiguousKeys.add(k);

  const matchedKeys = new Set();
  let matched = 0;
  let diverging = 0;
  for (const p of profiles) {
    if (!p || !p.operator) continue;
    const k = normalize(p.operator);
    if (!k || ambiguousKeys.has(k)) {
      p.duo = null; // nessuna chiave o identità ambigua → non attribuiamo
      continue;
    }
    const exp = byNorm.get(k);
    if (!exp) {
      p.duo = null;
      continue;
    }
    matchedKeys.add(k);
    matched++;
    p.duo = compareOne(p, exp, now);
    // "diverging" = attenzione FORTE: solo con periodo noto e recente (altrimenti
    // il delta può venire dallo sfasamento temporale, non dal contesto duo).
    if (p.duo.flag && !p.duo.stale && p.duo.period_known) diverging++;
  }

  // export senza controparte warehouse = operatori visibili SOLO in duo (mai
  // abbastanza turni singoli per un profilo) — i più interessanti, oggi del tutto
  // invisibili al profilo-segnali. Escludiamo le chiavi ambigue (identità incerta).
  const inflowwOnly = [];
  for (const f of list) {
    if (!f || !f.operator) continue;
    const k = normalize(f.operator);
    if (!k || matchedKeys.has(k) || ambiguousKeys.has(k)) continue;
    inflowwOnly.push({
      operator: f.operator,
      msgs: toNum(f.msgs),
      question_rate: toNum(f.question_rate),
      avg_ppv_price: toNum(f.avg_ppv_price),
      ppv_share: toNum(f.ppv_share),
      period: f.period || null,
    });
  }
  inflowwOnly.sort((a, b) => (b.msgs || 0) - (a.msgs || 0));

  // warehouse_only = profili senza export (né match né ambiguità): buco di
  // copertura dall'altro lato, prompt a caricare l'export di quell'operatore.
  const warehouseOnly = profiles.filter((p) => {
    if (!p || !p.operator || p.duo) return false;
    return !ambiguousKeys.has(normalize(p.operator));
  }).length;

  return {
    version: DUO_COVERAGE_VERSION,
    store_count: list.length,
    matched,
    diverging,
    ambiguous: ambiguousKeys.size, // numero di NOMI ambigui (non profili)
    infloww_only: inflowwOnly,
    warehouse_only: warehouseOnly,
  };
}
