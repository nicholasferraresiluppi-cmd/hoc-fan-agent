// Creator con Revenue e Chat dal vivo (ricostruzione di revenue.hoc.tools + chat.hoc.tools,
// ott 2026). Strumento dei progetti seguiti da Antonio Marucci (sales);
// Laura Sommaruga tolta su indicazione di Nicholas (8/10). Una creator = la PERSONA, con uno o più account OnlyFans (uno per mercato):
// i numeri escono per account e, se gli account sono più di uno, anche sommati (Totale).
// Logica pura (niente Node): la usano pagine, API e query.
// Per aggiungere una creator: id degli account (hoc.creators / turni CreatorsPro) + paese.

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
