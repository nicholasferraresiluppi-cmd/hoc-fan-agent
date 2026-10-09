// Logica pura del pilota OnlyFansAPI: confronto giornaliero con il warehouse.
// Niente rete né KV: testata in tests/ofapi-pilot.mjs.
//
// Una transazione è la STESSA se coincidono secondo (UTC), netto e fan: gli id
// non servono (il warehouse ne assegna uno suo). Il 9/10/2026 su Elisa
// Vimercati: 32 su 32 identiche con questa chiave.

const round2 = (x) => Math.round(Number(x) * 100) / 100;

export function apiTxKey(t) {
  return `${String(t.createdAt).slice(0, 19)}|${round2(t.net).toFixed(2)}|${t.user?.id ?? ""}`;
}

export function whTxKey(r) {
  return `${String(r.created_at).slice(0, 19)}|${round2(r.net).toFixed(2)}|${r.user_id ?? ""}`;
}

/** Transazioni dell'API cadute nel giorno UTC `day` ("YYYY-MM-DD"). */
export function apiTxOfDay(list, day) {
  return (list || []).filter((t) => String(t.createdAt).slice(0, 10) === day);
}

/**
 * Nel registro della piattaforma uno stesso account OnlyFans può avere più
 * creator_id, ognuno con le transazioni DUPLICATE: si tiene quello con più righe.
 * @param {Array<{creator_id:number, n:number}>} counts
 */
export function pickCreatorId(counts) {
  if (!counts?.length) return null;
  return [...counts].sort((a, b) => b.n - a.n || a.creator_id - b.creator_id)[0].creator_id;
}

function summarize(rows, netOf, typeOf) {
  const byType = {};
  let net = 0;
  for (const r of rows) {
    const t = typeOf(r);
    byType[t] = (byType[t] || 0) + 1;
    net += Number(netOf(r)) || 0;
  }
  return { n: rows.length, net: round2(net), byType };
}

/**
 * Confronto di un giorno. Multiinsieme: due transazioni identiche nello stesso
 * secondo contano due volte.
 */
export function compareDay(apiRows, whRows) {
  const count = (keys) => keys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const a = count(apiRows.map(apiTxKey));
  const w = count(whRows.map(whTxKey));
  let matched = 0;
  const onlyApi = [];
  const onlyWh = [];
  for (const [k, n] of a) {
    const m = Math.min(n, w.get(k) || 0);
    matched += m;
    for (let i = m; i < n; i++) onlyApi.push(k);
  }
  for (const [k, n] of w) for (let i = Math.min(n, a.get(k) || 0); i < n; i++) onlyWh.push(k);
  const api = summarize(apiRows, (t) => t.net, (t) => t.type);
  const wh = summarize(whRows, (r) => r.net, (r) => r.type);
  const total = Math.max(api.n, wh.n);
  return {
    api,
    wh,
    matched,
    matchRate: total ? round2(matched / total) : 1,
    netDiff: round2(api.net - wh.net),
    refunds: apiRows.filter((t) => t.status === "undo").length,
    onlyApi: onlyApi.slice(0, 10),
    onlyWh: onlyWh.slice(0, 10),
  };
}

/** Esito sintetico di un account in un giorno. */
export function verdict({ authenticated, authProgress, comparison, truncated }) {
  if (!authenticated) return "disconnesso";
  if (authProgress) return "verifica-richiesta";
  if (truncated) return "incompleto";
  if (!comparison) return "senza-confronto";
  return comparison.matchRate >= 0.99 && Math.abs(comparison.netDiff) < 1 ? "ok" : "differenze";
}
