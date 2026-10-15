// Creator con Revenue e Chat dal vivo (ricostruzione di revenue.hoc.tools + chat.hoc.tools,
// ott 2026). Una creator = la PERSONA, con uno o più account OnlyFans (uno per mercato):
// i numeri escono per account e, se gli account sono più di uno, anche sommati (Totale).
//
// Da dove vengono (15/10/2026): dallo SPLIT (`sales:splits`, lo stesso di Analisi vendite,
// S4S e Sales coaching), non più da un elenco scritto nel codice — prima c'erano solo le tre
// creator di Antonio ed Eleonora non vedeva Cubanita. Si aggiunge una creator allo split da
// /admin/creator-split e qui compare da sola. Le pagine dello split si leggono nell'anagrafica
// del warehouse (postgres.public_creators) e si raggruppano qui:
//   persona = alias senza il suffisso di mercato ("Fishball - IT" → "Fishball")
//   paese   = suffisso dell'alias, se no la lingua della pagina, se no dedotto (dichiarato)
//   copie   = due righe con lo stesso platform_id (l'id OnlyFans vero) sono la STESSA pagina
//             vista due volte (es. Elisa Vimercati 173440612 / 1000000397): se ne tiene una sola
//             — quella con i turni — altrimenti venduto e chat contano doppio.
// Un paese per account: è la chiave delle query (revenue-pacing-sql, chat-monitor-sql).
// Logica pura (niente Node): la usano pagine, API, query e i test (tests/live-creators.mjs).

export const COUNTRY_NAMES = { IT: "Italia", EN: "English", ES: "España" };
export const COUNTRIES = ["IT", "EN", "ES"];
export const countriesOf = (c) => c.accounts.map((a) => a.country);

/** "Rebecca  Bardaro" / "rebecca bardaro" → "rebecca bardaro" (confronto tra nomi). */
export const personKey = (s) =>
  String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const slugOf = (name) => personKey(name).replace(/ /g, "-");

const SUFFIX = /\s*-\s*(IT|ITA|EN|ENG|ES|ESP|SPA)\s*$/i;
const CODE = { IT: "IT", ITA: "IT", EN: "EN", ENG: "EN", ES: "ES", ESP: "ES", SPA: "ES" };

/** "Fishball - IT" → "Fishball". Alias vuoto → nome della pagina ripulito dalle emoji, poi username. */
export function personOfPage(p) {
  const alias = String(p?.alias || "").trim();
  if (alias) return alias.replace(SUFFIX, "").trim();
  const name = String(p?.name || "").replace(/[^\p{L}\p{N}' .-]/gu, "").trim();
  return name || String(p?.username || p?.id || "").trim();
}
/** Paese dalla pagina: suffisso dell'alias, poi lingua. null = non si sa. */
export function countryOfPage(p) {
  const m = SUFFIX.exec(String(p?.alias || ""));
  if (m) return CODE[m[1].toUpperCase()];
  return CODE[String(p?.language || "").toUpperCase()] || null;
}

const lastTs = (p) => (p?.last_data ? Date.parse(p.last_data) || 0 : 0);
const better = (a, b) =>
  (Number(b.shifts14) || 0) - (Number(a.shifts14) || 0) ||
  (Number(b.id) === Number(b.platform_id)) - (Number(a.id) === Number(a.platform_id)) ||
  lastTs(b) - lastTs(a) ||
  Number(a.id) - Number(b.id);

/**
 * Pagine del warehouse → creator (persona) con i loro account.
 * pages = [{ id, alias, name, username, language, platform_id, deleted, last_data, shifts14, net30 }]
 * Ritorna [{ slug, name, short, accounts:[{creator_id, country, guessed, alias, username, shifts14, net30, last_data}],
 *            skipped:[{id, alias, reason}] }] ordinato per nome.
 */
export function buildLiveCreators(pages) {
  const byPerson = new Map();
  for (const p of pages || []) {
    if (!p || !Number(p.id)) continue;
    const name = personOfPage(p);
    const k = personKey(name);
    if (!k) continue;
    if (!byPerson.has(k)) byPerson.set(k, { name, pages: [] });
    byPerson.get(k).pages.push(p);
  }
  const out = [];
  for (const { name, pages: list } of byPerson.values()) {
    const skipped = [];
    const live = [];
    for (const p of list) {
      if (p.deleted) skipped.push({ id: Number(p.id), alias: p.alias || name, reason: "pagina cancellata" });
      else live.push(p);
    }
    // copie: stessa pagina OnlyFans vista due volte → una sola
    const byPlatform = new Map();
    for (const p of live) {
      const k = String(p.platform_id || p.id);
      if (!byPlatform.has(k)) byPlatform.set(k, []);
      byPlatform.get(k).push(p);
    }
    const unique = [];
    for (const group of byPlatform.values()) {
      const [keep, ...dups] = [...group].sort(better);
      unique.push(keep);
      for (const d of dups) skipped.push({ id: Number(d.id), alias: d.alias || name, reason: `copia della pagina ${keep.id}` });
    }
    // paese: prima chi lo dichiara, poi i dedotti sui paesi liberi (IT prima)
    unique.sort(better);
    const used = new Set();
    const accounts = [];
    const pending = [];
    for (const p of unique) {
      const c = countryOfPage(p);
      if (!c) { pending.push(p); continue; }
      if (used.has(c)) { skipped.push({ id: Number(p.id), alias: p.alias || name, reason: `seconda pagina ${c}: ne entra una per paese` }); continue; }
      used.add(c);
      accounts.push({ p, country: c, guessed: false });
    }
    for (const p of pending) {
      const c = COUNTRIES.find((x) => !used.has(x));
      if (!c) { skipped.push({ id: Number(p.id), alias: p.alias || name, reason: "paese non riconosciuto" }); continue; }
      used.add(c);
      accounts.push({ p, country: c, guessed: true });
    }
    if (!accounts.length) {
      out.push({ slug: slugOf(name), name, short: name, accounts: [], skipped });
      continue;
    }
    accounts.sort((a, b) => COUNTRIES.indexOf(a.country) - COUNTRIES.indexOf(b.country));
    out.push({
      slug: slugOf(name), name, short: name,
      accounts: accounts.map(({ p, country, guessed }) => ({
        creator_id: Number(p.id), country, guessed,
        alias: p.alias || null, username: p.username || null,
        shifts14: Number(p.shifts14) || 0, net30: p.net30 == null ? null : Number(p.net30), last_data: p.last_data || null,
      })),
      skipped,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** Pagina attiva = turni negli ultimi 14 giorni o venduto negli ultimi 30. */
export const isActiveAccount = (a) => (Number(a?.shifts14) || 0) > 0 || (Number(a?.net30) || 0) > 0;

/** Pagine da mettere nello split per una persona trovata con la ricerca: una per paese, niente copie. */
export const idsToAdd = (creator) => creator.accounts.map((a) => a.creator_id);

/** La creator è tra quelle che questo membro vede? (scope da creator-scope: {all, creators:Set}) */
export function seesCreator(scope, creator) {
  if (scope?.all) return true;
  const k = personKey(creator?.name);
  return Boolean(k) && [...(scope?.creators || [])].some((n) => personKey(n) === k);
}
/** Elenco pubblico per la tendina (senza dettagli). */
export const publicCreator = (c) => ({ slug: c.slug, name: c.name, short: c.short, countries: countriesOf(c) });

// Riserva se split o warehouse non rispondono: le creator com'erano il 15/10/2026, così la
// pagina non si svuota per un problema di rete (gli id sono quelli verificati a mano quel giorno).
const S = (id, alias, country) => ({ id, alias: `${alias} - ${country}`, platform_id: id });
export const FALLBACK_PAGES = [
  S(1000000347, "Giulia Amici", "IT"), S(1000000358, "Martina Scavo", "IT"),
  S(273031887, "Rebecca Bardaro", "IT"), S(412962454, "Rebecca Bardaro", "EN"),
  S(1000000377, "Alessandra Sparagno", "IT"), S(1000000387, "Anastasia Policardi", "IT"),
  S(277921821, "Christina Bertevello", "IT"), { id: 1000000408, alias: "Cubanita", platform_id: 1000000408, language: "ITA" },
  S(173440612, "Elisa Vimercati", "IT"), S(160294962, "Fishball", "IT"), S(7560862, "Fishball", "EN"),
  S(93666613, "Giulia Ottorini", "IT"), S(160406145, "Michela Mucciante", "IT"), S(64413654, "Stormy", "IT"),
];
