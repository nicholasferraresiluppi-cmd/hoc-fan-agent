/**
 * Perimetro del personale (23/11/2026) — logica pura, tests/perimetro.mjs.
 *
 * Nicholas: «vorrei che ci fossero solo il personale del nostro split in questa webapp».
 * Dopo lo split societario le persone dell'altra parte non sono più nostre: elenchi,
 * classifiche, fascicoli e decisioni mostrano SOLO chi lavora per lo split.
 *
 * Chi è «del nostro split» — la stessa regola della Squadra (Coaching vendite, 14/10/2026):
 * almeno metà delle ore degli ultimi 3 mesi sulle pagine dello split (`SPLIT_SHARE`).
 * Una sola definizione, così nessuna pagina può contare un perimetro diverso.
 *
 * Gli ALTRI restano nei calcoli come termine di paragone (l'indice confronta con i colleghi
 * sulla stessa creator) e negli studi: il perimetro filtra cosa si MOSTRA, mai cosa si calcola.
 */
import { nameKey, matchName, splitShare, SPLIT_SHARE } from "./squadra-core.js";

/** Righe Squadra → elenco delle persone dello split (nome + quota ore sulle pagine dello split). */
export function buildRoster(rows, creatorIds, minShare = SPLIT_SHARE) {
  const ids = (creatorIds || []).map(String);
  const people = [];
  for (const r of rows || []) {
    if (!r?.name) continue;
    const share = splitShare(r.crs, ids);
    if (share >= minShare) people.push({ name: r.name, share: Math.round(share * 100) / 100 });
  }
  return people;
}

/**
 * Un nome (CP, Infloww, ClickUp, Clerk… scritto come capita) appartiene allo split?
 * Prima la chiave esatta, poi lo stesso abbinamento prudente della Squadra (refusi solo
 * su nomi lunghi, sottoinsiemi di almeno 2 parole, MAI se i candidati sono più d'uno).
 */
export function makeInRoster(people) {
  const names = (people || []).map((p) => p.name);
  const keys = new Set(names.map(nameKey).filter(Boolean));
  const memo = new Map();
  return (name) => {
    const k = nameKey(name);
    if (!k) return false;
    if (keys.has(k)) return true;
    if (memo.has(k)) return memo.get(k);
    const hit = Boolean(matchName(name, names));
    memo.set(k, hit);
    return hit;
  };
}

/** Filtra un elenco qualsiasi; `getName` dice dove sta il nome nella riga. */
export function keepOurs(list, inRoster, getName = (r) => r?.name) {
  if (!Array.isArray(list) || typeof inRoster !== "function") return list;
  return list.filter((r) => inRoster(getName(r)));
}
