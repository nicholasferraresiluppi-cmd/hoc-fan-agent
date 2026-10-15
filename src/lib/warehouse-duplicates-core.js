// Doppioni nel warehouse (15/10/2026) — logica pura (la usano la lib server e i test).
//
// Il caso: il warehouse è MULTI-ORGANIZZAZIONE (il sistema di raccolta serve più agenzie, `organization_id`). Lo stesso
// account OnlyFans può essere registrato da due organizzazioni: è normale e NON è un doppione per House of Creators
// (al 15/10 tutte e 5 le coppie trovate erano così: altre org «Nicola (Da Cancellare)», «OSA», «VIBES VENTURES»; la
// prima versione dello scudo le trattava come doppioni ed era sbagliata — per Atena e Marta teneva il record dell'altra
// org). Doppione vero = due record dello stesso account DENTRO LA STESSA organizzazione: ogni vendita finirebbe due
// volte nei conti di quell'organizzazione. Il warehouse non è nostro (sola lettura): HOC Pro si difende da sé.
//
// Regola: per ogni (account OnlyFans, organizzazione) con più record non cancellati si tiene il PIÙ VECCHIO; un record più nuovo è un
// "doppione" se nei giorni in cui hanno incassato entrambi gli importi coincidono quasi sempre (≥3 giorni e ≥80%).
// Altrimenti è un "passaggio" (un record ha sostituito l'altro, con pochi giorni sovrapposti): si segnala e basta,
// perché lì entrambi i record portano dati veri (storia nel vecchio, presente nel nuovo).

export const DUPLICATES_VERSION = 2; // v1 confondeva le altre organizzazioni coi doppioni: la sua memoria si butta
export const MIN_IDENTICAL_DAYS = 3;
export const MIN_IDENTICAL_SHARE = 0.8;
const HISTORY_DAYS = 400;

/** Coppie (record più nuovo → record più vecchio dello stesso account) con la sovrapposizione degli incassi. */
export function duplicatesSql(refs) {
  // organizzazione di ogni record: da reach (una riga al giorno per pagina, porta organization_id); senza dati → '?'
  return `
    WITH o AS (SELECT creator_id, ARRAY_AGG(organization_id ORDER BY calendar_date DESC LIMIT 1)[OFFSET(0)] AS org
               FROM \`${refs.reach}\` GROUP BY 1),
    c AS (SELECT id, platform_id, COALESCE(o.org, '?') AS org, COALESCE(alias, name) AS nm, created_at, heartbeat
          FROM \`${refs.creators}\` LEFT JOIN o ON o.creator_id = id
          WHERE platform_id IS NOT NULL AND deleted_at IS NULL),
    dup AS (SELECT platform_id, org FROM c GROUP BY 1, 2 HAVING COUNT(*) > 1),
    cc AS (SELECT c.* FROM c JOIN dup USING (platform_id, org)),
    k AS (SELECT platform_id, org, ARRAY_AGG(STRUCT(id, nm) ORDER BY created_at, id LIMIT 1)[OFFSET(0)] AS keep FROM cc GROUP BY 1, 2),
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
    FROM cc JOIN k USING (platform_id, org)
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
