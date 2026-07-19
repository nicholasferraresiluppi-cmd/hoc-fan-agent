/**
 * Matching identità creator Infloww ↔ alias CP.
 *
 * Funzioni PURE estratte da /api/admin/infloww-reconcile (dove sono nate e
 * validate sui dati reali, lug 2026) perché servono anche all'albero payout
 * (payout-ledger/payout-match): stessa logica, un solo posto — la divergenza
 * tra due copie di queste regole produrrebbe alberi e reconcile in disaccordo.
 *
 * Regole (post-review adversariale, non ammorbidire senza ricalibrare):
 *  - primo nome DEVE combaciare (anche unito: "Anna Rita" ↔ "Annarita");
 *  - lingue esplicite diverse → MAI (0);
 *  - Infloww dichiara una lingua ma il CP no → 0 (niente fusioni alla cieca);
 *  - Infloww senza sigla → bonus al profilo IT (0.75) sopra le altre (0.5);
 *  - cognomi in conflitto ("Elisa Esposito" vs "Elisa Vimercati") → 0.
 */

export function normName(s) {
  // NFD scompone gli accenti (é → e + segno); il replace successivo toglie i segni.
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function normLang(s) {
  const u = String(s || "").toUpperCase();
  if (/^(ESP|SPA|ES)$/.test(u)) return "ESP";
  if (/^(ENG|EN)$/.test(u)) return "EN";
  if (/^(ITA|IT)$/.test(u)) return "IT";
  return "";
}

// Infloww: "Laura ESP" → {tokens:["laura"], lang:"ESP"}; "Giulia ottorini" → {tokens, lang:""}
export function parseInfloww(name) {
  const raw = String(name || "");
  const m = raw.match(/\b(ESP|ENG|ITA|EN|IT|ES|SPA)\s*$/i);
  let lang = "", base = raw;
  if (m) { lang = normLang(m[1]); base = raw.slice(0, m.index); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang };
}

// CP: "Giulia Ottorini - IT" → {tokens, lang:"IT"}; "Eva Rizzoli - SILO_1" →
// {tokens:["eva","rizzoli"], lang:"", tag:"SILO_1"} — il suffisso "- XXX" è
// SEMPRE un tag di team, mai parte del nome (i token spuri creavano fusioni).
export function parseCp(alias) {
  const m = String(alias || "").match(/^(.*?)\s*[-–]\s*([A-Za-z0-9_]{2,12})\s*$/);
  let base = alias, lang = "", tag = "";
  if (m) { base = m[1]; tag = m[2]; lang = normLang(m[2]); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang, tag };
}

// Primo nome compatibile anche con grafie unite/staccate ("Anna Rita" ↔
// "Annarita"): se i primi DUE token di un lato, uniti, combaciano col primo
// dell'altro, normalizza. Ritorna [tokensInf, tokensCp] o null.
export function firstCompat(a, b) {
  if (a[0] === b[0]) return [a, b];
  if (a.length >= 2 && a[0] + a[1] === b[0]) return [[a[0] + a[1], ...a.slice(2)], b];
  if (b.length >= 2 && b[0] + b[1] === a[0]) return [a, [b[0] + b[1], ...b.slice(2)]];
  return null;
}

/** Punteggio match Infloww↔CP. 0 = incompatibile. */
export function matchScore(inf, cp) {
  if (!inf.tokens.length || !cp.tokens.length) return 0;
  const fc = firstCompat(inf.tokens, cp.tokens);
  if (!fc) return 0;
  const [ti, tc] = fc;
  let score = 1;
  if (inf.lang && cp.lang) {
    if (inf.lang !== cp.lang) return 0;
    score += 1;
  } else if (inf.lang && !cp.lang) {
    return 0;
  } else if (!inf.lang && cp.lang === "IT") {
    score += 0.75;
  } else {
    score += 0.5;
  }
  const allInfInCp = ti.every((t) => tc.includes(t));
  const allCpInInf = tc.every((t) => ti.includes(t));
  if (!allInfInCp && !allCpInInf) return 0;
  if (allInfInCp) score += 1;
  return score;
}

/**
 * Indice alias CP → creator Infloww per l'albero payout.
 *
 * Stessa strategia di reconcile: prima gli abbinamenti MANUALI (overrides
 * KV `infloww:reconcile:overrides`, shape { [inflowwId]: cpAlias }), poi
 * assegnazione globale greedy per score (soglia 1.5, tie → non abbinare).
 *
 * @param aliases  array di alias CP presenti nel periodo — passare il pool
 *                 dell'INTERO mese (come reconcile), mai un sottoinsieme:
 *                 con un pool parziale gli override verso alias assenti non
 *                 "bruciano" la creator e il greedy può riassegnarla male
 * @param inflowwCreators  roster [{id, name}]
 * @param overrides  { [inflowwCreatorId]: cpAlias }
 * @param activeIds  Set opzionale di creatorId ATTIVI nel periodo: il greedy
 *                   considera solo questi (parità con reconcile, che matcha i
 *                   soli profili con transazioni nel mese); gli override
 *                   restano validi su tutto il roster perché espliciti
 * @param grossById  { [creatorId]: grossCents } per il tie-break (a parità di
 *                   score vince il lordo maggiore, come reconcile)
 * @returns { byAlias: Map(alias → {id, name, via, score}), unmatched: [alias] }
 */
export function buildAliasIndex({ aliases, inflowwCreators, overrides = {}, activeIds = null, grossById = {} }) {
  const byAlias = new Map();
  const usedInf = new Set();
  const creators = (inflowwCreators || []).map((c) => ({ id: c.id, name: c.name || "", p: parseInfloww(c.name || "") }));

  // 1. Overrides manuali (vincono sull'automatico). Una creator con override
  // valido è SEMPRE vincolata (usedInf) anche se l'alias è già assegnato:
  // mai lasciarla rientrare nel greedy — è il caso per cui l'override esiste.
  const aliasSet = new Set(aliases);
  for (const c of creators) {
    const forced = overrides[c.id];
    if (!forced || !aliasSet.has(forced)) continue; // alias fuori pool → flusso automatico (come reconcile)
    usedInf.add(c.id);
    if (!byAlias.has(forced)) {
      byAlias.set(forced, { id: c.id, name: c.name, via: "override", score: null });
    }
  }

  // 2. Greedy globale per score
  const parsedAliases = aliases.filter((a) => !byAlias.has(a)).map((a) => ({ alias: a, p: parseCp(a) }));
  const pairs = [];
  for (const c of creators) {
    if (usedInf.has(c.id)) continue;
    if (activeIds && !activeIds.has(c.id)) continue;
    for (const pa of parsedAliases) {
      const sc = matchScore(c.p, pa.p);
      if (sc >= 1.5) pairs.push({ c, pa, sc });
    }
  }
  // Tie-break come reconcile (lordo maggiore) + chiave finale stabile per
  // non dipendere dall'ordine del roster (che cambia a ogni sync).
  pairs.sort((a, b) => b.sc - a.sc
    || (grossById[b.c.id] || 0) - (grossById[a.c.id] || 0)
    || String(a.c.id).localeCompare(String(b.c.id)));
  for (const p of pairs) {
    if (usedInf.has(p.c.id) || byAlias.has(p.pa.alias)) continue;
    const tie = pairs.some((q) => q !== p && q.c.id === p.c.id && q.sc === p.sc && !byAlias.has(q.pa.alias) && q.pa.alias !== p.pa.alias);
    usedInf.add(p.c.id);
    if (tie) continue; // ambiguo: conservativo, resta non abbinato
    byAlias.set(p.pa.alias, { id: p.c.id, name: p.c.name, via: "auto", score: p.sc });
  }

  const unmatched = aliases.filter((a) => !byAlias.has(a));
  return { byAlias, unmatched };
}
