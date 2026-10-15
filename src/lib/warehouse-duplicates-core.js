// Doppioni nel warehouse (15/10/2026) — logica pura (la usano la lib server e i test).
//
// Il caso: nel sistema che raccoglie i dati da OnlyFans, a volte nasce un SECONDO record creator agganciato allo
// stesso account OnlyFans (stesso `platform_id`), con un raccoglitore suo. Se restano attivi tutti e due, ogni vendita
// finisce nel warehouse due volte con id diversi (misurato: Elisa Vimercati 173440612 + 1000000397 dal 27/07, 1.462
// transazioni identiche per lato da settembre; in tutto ~$431k di lordo doppio da luglio su 5 creator, +5,4% sul
// totale agenzia a 30 giorni). Il warehouse non è nostro (sola lettura): HOC Pro si difende da sé.
//
// Regola: per ogni account OnlyFans con più record non cancellati si tiene il PIÙ VECCHIO; un record più nuovo è un
// "doppione" se nei giorni in cui hanno incassato entrambi gli importi coincidono quasi sempre (≥3 giorni e ≥80%).
// Altrimenti è un "passaggio" (un record ha sostituito l'altro, con pochi giorni sovrapposti): si segnala e basta,
// perché lì entrambi i record portano dati veri (storia nel vecchio, presente nel nuovo).

export const MIN_IDENTICAL_DAYS = 3;
export const MIN_IDENTICAL_SHARE = 0.8;
const HISTORY_DAYS = 400;

/** Coppie (record più nuovo → record più vecchio dello stesso account) con la sovrapposizione degli incassi. */
export function duplicatesSql(refs) {
  return `
    WITH c AS (SELECT id, platform_id, COALESCE(alias, name) AS nm, created_at, heartbeat FROM \`${refs.creators}\`
               WHERE platform_id IS NOT NULL AND deleted_at IS NULL),
    dup AS (SELECT platform_id FROM c GROUP BY 1 HAVING COUNT(*) > 1),
    cc AS (SELECT c.* FROM c JOIN dup USING (platform_id)),
    k AS (SELECT platform_id, ARRAY_AGG(STRUCT(id, nm) ORDER BY created_at, id LIMIT 1)[OFFSET(0)] AS keep FROM cc GROUP BY 1),
    d AS (SELECT creator_id, calendar_date, SUM(amount) AS g FROM \`${refs.attributed}\`
          WHERE creator_id IN (SELECT id FROM cc) AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${HISTORY_DAYS} DAY)
          GROUP BY 1, 2)
    SELECT cc.platform_id, k.keep.id AS keep_id, k.keep.nm AS keep_name, cc.id, cc.nm AS name,
      FORMAT_TIMESTAMP('%Y-%m-%d', cc.created_at) AS created, FORMAT_TIMESTAMP('%Y-%m-%d', cc.heartbeat) AS heartbeat,
      COUNT(b.calendar_date) AS own_days,
      COUNTIF(a.g IS NOT NULL) AS both_days,
      COUNTIF(a.g IS NOT NULL AND ABS(a.g - b.g) < 0.01) AS identical_days,
      SUM(IF(a.g IS NOT NULL, b.g, 0)) AS gross_doubled,
      FORMAT_DATE('%Y-%m-%d', MIN(IF(a.g IS NOT NULL, b.calendar_date, NULL))) AS first_both,
      FORMAT_DATE('%Y-%m-%d', MAX(IF(a.g IS NOT NULL, b.calendar_date, NULL))) AS last_both
    FROM cc JOIN k USING (platform_id)
    LEFT JOIN d b ON b.creator_id = cc.id
    LEFT JOIN d a ON a.creator_id = k.keep.id AND a.calendar_date = b.calendar_date
    WHERE cc.id != k.keep.id
    GROUP BY 1, 2, 3, 4, 5, 6, 7`;
}

/** Righe della query → coppie classificate (doppione / passaggio / separati). */
export function classifyDuplicates(rows) {
  return (rows || []).map((r) => {
    const both = Number(r.both_days) || 0;
    const same = Number(r.identical_days) || 0;
    const kind = same >= MIN_IDENTICAL_DAYS && same / both >= MIN_IDENTICAL_SHARE ? "doppione" : both > 0 ? "passaggio" : "separati";
    return {
      platform_id: Number(r.platform_id),
      keep: { id: Number(r.keep_id), name: r.keep_name || `Creator ${r.keep_id}` },
      drop: { id: Number(r.id), name: r.name || `Creator ${r.id}`, created: r.created || null, heartbeat: r.heartbeat || null },
      kind,
      both_days: both,
      identical_days: same,
      own_days: Number(r.own_days) || 0,
      gross_doubled: Math.round(Number(r.gross_doubled) || 0),
      first_both: r.first_both || null,
      last_both: r.last_both || null,
    };
  }).sort((a, b) => b.gross_doubled - a.gross_doubled);
}

/**
 * Mappa delle sostituzioni {id doppione: id da tenere}. APPICCICOSA: un doppione trovato una volta resta sostituito
 * anche se il suo raccoglitore si ferma, perché i mesi già duplicati restano nel warehouse.
 */
export function mergeSubstitutions(prev, pairs) {
  const out = { ...(prev || {}) };
  for (const p of pairs || []) if (p.kind === "doppione") out[p.drop.id] = p.keep.id;
  // catene (A→B, B→C) risolte fino in fondo, senza cicli
  for (const k of Object.keys(out)) {
    let v = out[k];
    const seen = new Set([Number(k)]);
    while (out[v] != null && !seen.has(v)) { seen.add(v); v = out[v]; }
    out[k] = v;
  }
  return out;
}

/** Sostituisce i doppioni col record da tenere e toglie le ripetizioni, mantenendo l'ordine. */
export function dedupeIds(ids, subs) {
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = Number(raw);
    const v = subs && subs[id] != null ? Number(subs[id]) : id;
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}
