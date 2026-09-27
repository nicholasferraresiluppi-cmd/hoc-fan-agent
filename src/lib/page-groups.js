// Pagine che fanno parte dello STESSO compito, unite come schede di un'unica voce (27/09/2026,
// pannello di 5 esperti di navigazione: "la stessa cosa sta in 3-5 posti"). Le pagine restano
// dove sono (indirizzi e link invariati): nel menu e nell'hub resta una sola voce (la prima),
// e in cima a ogni pagina del gruppo compaiono le schede per passare dall'una all'altra.
export const PAGE_GROUPS = [
  { label: "Membri e ruoli", tabs: [["/admin/ruoli", "Membri"], ["/admin/ruoli-custom", "Ruoli personalizzati"], ["/admin/team", "Team"]] },
  { label: "Dati CreatorsPro", tabs: [["/admin/creatorspro-sync", "Sincronizzazione"], ["/admin/wage-audit", "Controllo"], ["/admin/creatorspro-sync-history", "Storico"]] },
  { label: "Formula score", tabs: [["/admin/leaderboard-settings", "Impostazioni"], ["/admin/score-config-drafts", "Bozze"], ["/admin/score-config-history", "Storico"]] },
  { label: "Scaglioni", tabs: [["/admin/profiles-compare", "Confronto"], ["/admin/payment-profiles", "Profili di pagamento"], ["/admin/threshold-study", "Studio soglie"]] },
  { label: "Anomalie compensi", tabs: [["/admin/comp-review", "Da rivedere"], ["/admin/comp-exam", "Esame creator"]] },
  { label: "Incassi Infloww", tabs: [["/admin/infloww-agency", "Agenzia"], ["/admin/infloww-revenue", "Per creator"], ["/admin/infloww-reconcile", "Controllo con CreatorsPro"]] },
  { label: "Impostazioni classifiche", tabs: [["/admin/leaderboard-exclusions", "Esclusioni"], ["/admin/group-languages", "Lingua dei gruppi"], ["/admin/group-categories", "Categorie dei gruppi"]] },
  { label: "Collegamenti dati", tabs: [["/admin/debug-mapping", "Operatori senza dati CP"], ["/admin/user-mapping", "Collega utenti"]] },
];

const byHref = new Map();
for (const g of PAGE_GROUPS) g.tabs.forEach(([href], i) => byHref.set(href, { group: g, primary: i === 0 }));

/** Il gruppo di una pagina (per le schede in cima), o null. */
export function groupOf(pathname) {
  return byHref.get(String(pathname || "").replace(/\/$/, ""))?.group || null;
}

/** Voci di menu/hub: tiene solo la prima pagina di ogni gruppo, col nome del gruppo. */
export function collapseItems(items, labelKey = "label") {
  const out = [];
  for (const it of items || []) {
    const hit = byHref.get(it.href);
    if (!hit) { out.push(it); continue; }
    if (!hit.primary) continue;
    out.push({ ...it, [labelKey]: hit.group.label });
  }
  return out;
}
