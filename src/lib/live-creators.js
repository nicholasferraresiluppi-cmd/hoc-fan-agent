// Creator con Revenue e Chat dal vivo (ricostruzione di revenue.hoc.tools + chat.hoc.tools,
// ott 2026). Nato per i progetti seguiti da Antonio Marucci (sales); dal 15/10 copre tutte le
// creator dello split (Eleonora Di Cristofaro vedeva solo le tre di Antonio). Ognuno vede solo
// le sue assegnate (creator-scope). Laura Sommaruga tolta su indicazione di Nicholas (8/10). Una creator = la PERSONA, con uno o più account OnlyFans (uno per mercato):
// i numeri escono per account e, se gli account sono più di uno, anche sommati (Totale).
// Logica pura (niente Node): la usano pagine, API e query.
// Per aggiungere una creator: id degli account (hoc.creators / turni CreatorsPro) + paese.
// L'id giusto è quello dei TURNI (postgres.public_events_creators): alcune pagine hanno due id
// in hoc.creators con dati speculari (es. Elisa Vimercati 173440612 / 1000000397) — se ne mette
// UNO solo, altrimenti venduto e chat contano doppio. Un paese per account (è la chiave delle query).

export const LIVE_CREATORS = [
  {
    slug: "giulia-amici", name: "Giulia Amici", short: "Giulia Amici",
    accounts: [{ creator_id: 1000000347, country: "IT" }],
    matches: (p) => p.includes("giulia amici"),
  },
  {
    slug: "martina-scavo", name: "Martina Scavo", short: "Martina Scavo",
    accounts: [{ creator_id: 1000000358, country: "IT" }],
    matches: (p) => p.includes("martina scavo"),
  },
  {
    slug: "rebecca-bardaro", name: "Rebecca Bardaro", short: "Rebecca",
    accounts: [{ creator_id: 273031887, country: "IT" }, { creator_id: 412962454, country: "EN" }],
    matches: (p) => p.includes("rebecca"),
  },
  // ── resto dello split (15/10/2026): id verificati su venduto 30gg + turni 14gg ──
  {
    slug: "alessandra-sparagno", name: "Alessandra Sparagno", short: "Alessandra",
    accounts: [{ creator_id: 1000000377, country: "IT" }],
    matches: (p) => p.includes("alessandra sparagno"),
  },
  {
    slug: "anastasia-policardi", name: "Anastasia Policardi", short: "Anastasia",
    accounts: [{ creator_id: 1000000387, country: "IT" }],
    matches: (p) => p.includes("anastasia policardi"),
  },
  {
    slug: "christina-bertevello", name: "Christina Bertevello", short: "Christina",
    accounts: [{ creator_id: 277921821, country: "IT" }],
    matches: (p) => p.includes("christina bertevello"),
  },
  {
    slug: "cubanita", name: "Cubanita", short: "Cubanita",
    accounts: [{ creator_id: 1000000408, country: "IT" }],
    matches: (p) => p.includes("cubanita"),
  },
  {
    slug: "elisa-vimercati", name: "Elisa Vimercati", short: "Elisa Vimercati",
    accounts: [{ creator_id: 173440612, country: "IT" }],
    matches: (p) => p.includes("elisa vimercati"),
  },
  {
    slug: "fishball", name: "Fishball", short: "Fishball",
    accounts: [{ creator_id: 160294962, country: "IT" }, { creator_id: 7560862, country: "EN" }],
    matches: (p) => p.includes("fishball"),
  },
  {
    slug: "giulia-ottorini", name: "Giulia Ottorini", short: "Giulia Ottorini",
    accounts: [{ creator_id: 93666613, country: "IT" }],
    matches: (p) => p.includes("giulia ottorini"),
  },
  {
    slug: "michela-mucciante", name: "Michela Mucciante", short: "Michela",
    accounts: [{ creator_id: 160406145, country: "IT" }],
    matches: (p) => p.includes("michela mucciante"),
  },
  {
    slug: "stormy", name: "Stormy", short: "Stormy",
    accounts: [{ creator_id: 64413654, country: "IT" }],
    matches: (p) => p.includes("stormy"),
  },
];

export const DEFAULT_CREATOR = "giulia-amici";
export const COUNTRY_NAMES = { IT: "Italia", EN: "English", ES: "España" };
export const getLiveCreator = (slug) => LIVE_CREATORS.find((c) => c.slug === slug) || null;
export const countriesOf = (c) => c.accounts.map((a) => a.country);

/** La creator è tra quelle che questo membro vede? (scope da creator-scope: {all, creators:Set}) */
export function seesCreator(scope, creator) {
  if (scope?.all) return true;
  return [...(scope?.creators || [])].some((n) => creator.matches(String(n).trim().toLowerCase()));
}
/** Elenco pubblico per la tendina (senza funzioni). */
export const publicCreator = (c) => ({ slug: c.slug, name: c.name, short: c.short, countries: countriesOf(c) });
