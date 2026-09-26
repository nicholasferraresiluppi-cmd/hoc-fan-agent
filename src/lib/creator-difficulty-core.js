// Creator Difficulty — funzioni PURE, zero dipendenze.
//
// Separate da `creator-difficulty.js` (che importa kv/BigQuery) di proposito:
// qui vive tutto ciò che decide come si LEGGE la difficoltà di un pubblico —
// la parte da testare davvero. Si esegue con `node tests/creator-difficulty.mjs`.
// Chi consuma importa da `creator-difficulty.js`, che ri-esporta.

export const WINDOW_DAYS = 60; // finestra delle metriche "correnti" (CR, ARPPU, PPV, new subs)

// Componenti del profilo. `in_index: true` = concorre all'indice direzionale;
// per tutti quelli nell'indice vale "più basso = pubblico più difficile".
//
// FUORI dall'indice, di proposito (review 30/07):
//   - ppv_price_p50: è la mediana dei prezzi CHIESTI in chat — una scelta degli
//     OPERATORI, non una proprietà del pubblico (lo stesso segnale in
//     operator-signals è coaching di skill: metterlo qui creerebbe circolarità —
//     il team che si coacha ad alzare i prezzi "scalderebbe" il pubblico). Resta
//     visibile come contesto sul comportamento del team.
//   - whale_share: non è difficoltà, è VARIANZA (chi becca il whale sembra bravo).
//   - tenure/freschezza/traffico: spiegano l'indice, non lo compongono.
export const DIFFICULTY_COMPONENTS = [
  { key: "pct_ever_paid", label: "% fan maturi (≥30g) che ha mai pagato", window: "lifetime", in_index: true, fmt: "pct" },
  { key: "cr_avg", label: "Conversion rate (pooled)", window: `${WINDOW_DAYS}g`, in_index: true, fmt: "pct" },
  { key: "arppu_avg", label: "Revenue per fan attivo al giorno (pooled)", window: `${WINDOW_DAYS}g`, in_index: true, fmt: "usd" },
  { key: "ltv_p50", label: "LTV mediano dei paganti", window: "lifetime", in_index: true, fmt: "usd" },
  { key: "ppv_price_p50", label: "Prezzo PPV mediano chiesto (comportamento del team, non del pubblico)", window: `${WINDOW_DAYS}g`, in_index: false, fmt: "usd" },
  { key: "n_fan", label: "Fan totali", window: "lifetime", in_index: false, fmt: "int" },
  { key: "payers_n", label: "Fan paganti", window: "lifetime", in_index: false, fmt: "int" },
  { key: "whale_share_top1", label: "Quota revenue del top-1% fan", window: "lifetime", in_index: false, fmt: "pct" },
  { key: "tenure_p50_days", label: "Anzianità mediana dei fan (giorni)", window: "lifetime", in_index: false, fmt: "int" },
  { key: "fresh_fans_30d", label: "Fan nuovi (30g)", window: "30g", in_index: false, fmt: "int" },
  { key: "new_subs_60d", label: "Nuovi sub", window: `${WINDOW_DAYS}g`, in_index: false, fmt: "int" },
  { key: "revenue_60d", label: "Revenue", window: `${WINDOW_DAYS}g`, in_index: false, fmt: "usd" },
];

// Floor di campione per componente (review 30/07 — stessa lezione di MIN_PAIRS in
// academy-signals): sotto il floor il valore diventa null PRIMA dei percentili,
// così non entra né nell'indice né nella coorte. Un rapporto calcolato su una
// manciata di fan non è un dato, è rumore travestito — meglio tacere.
// `basis` = la colonna che misura il campione, `min` = la soglia.
export const SAMPLE_FLOORS = {
  pct_ever_paid: { basis: "mature_fans", min: 300 },
  cr_avg: { basis: "new_subs_60d", min: 100 },
  arppu_avg: { basis: "active_user_days_60d", min: 100 },
  ltv_p50: { basis: "payers_n", min: 20 },
  ppv_price_p50: { basis: "ppv_sent_60d", min: 30 },
  whale_share_top1: { basis: "payers_n", min: 20 },
};

// Applica i floor a una riga: i componenti sotto-campione diventano null e
// finiscono in `low_sample_keys` (la UI può dire "campione insufficiente"
// invece di mostrare un numero che non regge).
export function applySampleFloors(row) {
  const out = { ...row };
  const low = [];
  for (const [key, floor] of Object.entries(SAMPLE_FLOORS)) {
    if (out[key] == null) continue;
    const basis = Number(out[floor.basis]);
    if (!Number.isFinite(basis) || basis < floor.min) {
      out[key] = null;
      low.push(key);
    }
  }
  out.low_sample_keys = low;
  return out;
}

// Pagina FREE/BOP: il nome la dichiara, oppure ha pubblico grande e una quota di
// paganti da pagina non-monetizzata (<0,5% — la pagina PAID più fredda mai
// misurata da noi sta al ~7-12%: un ordine di grandezza sopra). La vecchia
// soglia "payers esattamente 0" bastava un singolo tip storico per aggirarla.
export function isFreePage(name, payersN, nFan) {
  if (/\b(free|bop)\b/i.test(String(name || ""))) return true;
  const fans = nFan || 0;
  return fans > 1000 && (payersN || 0) / fans < 0.005;
}

// Rango percentile [0..1] di `value` dentro `values` (definizione: quota di
// valori strettamente minori + metà dei pari — stabile ai duplicati).
// ⚠️ null va escluso ESPLICITAMENTE: Number(null) è 0, non NaN — senza la guardia
// un dato mancante diventerebbe "il valore più basso dell'org" (bug visto in UI:
// creator senza dati fan in cima alla classifica di difficoltà).
export function percentileRank(value, values) {
  if (value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const arr = (values || []).filter((x) => x != null).map(Number).filter(Number.isFinite);
  if (arr.length < 2) return null;
  let below = 0;
  let equal = 0;
  for (const x of arr) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + equal / 2) / arr.length;
}

// Indice direzionale 0-100: media di (1 - percentile) sui componenti in_index
// presenti. 100 = il pubblico più freddo dell'org, 0 = il più caldo. Richiede
// ≥3 componenti (con meno, meglio tacere che ordinare a caso). Escluso per le
// pagine FREE (spesa non comparabile).
export function difficultyIndex(profile, cohortByKey, { minComponents = 3 } = {}) {
  if (profile.free_page) return null;
  const parts = [];
  for (const c of DIFFICULTY_COMPONENTS) {
    if (!c.in_index) continue;
    const pr = percentileRank(profile[c.key], cohortByKey[c.key] || []);
    if (pr != null) parts.push(1 - pr);
  }
  if (parts.length < minComponents) return null;
  return Math.round((parts.reduce((a, v) => a + v, 0) / parts.length) * 100);
}

// Arricchisce le righe warehouse: floor di campione, flag free-page, percentili
// org, indice. Ordine deliberato: PRIMA i floor (i sotto-campione → null), POI
// le coorti (solo pagine paid, solo valori sopra-floor), POI percentili+indice.
export function buildProfiles(rows) {
  const base = rows.map((r) => ({
    ...applySampleFloors(r),
    free_page: isFreePage(r.creator_name, Number(r.payers_n), Number(r.n_fan)),
  }));
  const paid = base.filter((p) => !p.free_page);
  const cohortByKey = {};
  for (const c of DIFFICULTY_COMPONENTS) {
    // stessa guardia null di percentileRank: Number(null)=0 inquinerebbe la
    // coorte con zeri finti per ogni creator a cui manca (o non regge) il dato
    cohortByKey[c.key] = paid
      .map((p) => p[c.key])
      .filter((v) => v != null)
      .map(Number)
      .filter(Number.isFinite);
  }
  const profiles = base.map((p) => {
    const pctl = {};
    for (const c of DIFFICULTY_COMPONENTS) {
      pctl[c.key] = p.free_page ? null : percentileRank(p[c.key], cohortByKey[c.key]);
    }
    return { ...p, org_percentile: pctl, difficulty_index: difficultyIndex(p, cohortByKey) };
  });
  // le più difficili in alto; free-page e indice-nullo in fondo
  profiles.sort((a, b) => (b.difficulty_index ?? -1) - (a.difficulty_index ?? -1));
  return profiles;
}

export function isStale(generatedAt, now = Date.now(), staleAfterH = 144) {
  const t = Date.parse(generatedAt || "");
  if (!Number.isFinite(t)) return true;
  return now - t > staleAfterH * 3600 * 1000;
}
