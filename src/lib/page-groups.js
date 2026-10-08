// Pagine che fanno parte dello STESSO compito, unite come schede di un'unica voce (27/09/2026,
// pannello di 5 esperti di navigazione: "la stessa cosa sta in 3-5 posti"). Le pagine restano
// dove sono (indirizzi e link invariati): nel menu e nell'hub resta una sola voce (la prima),
// e in cima a ogni pagina del gruppo compaiono le schede per passare dall'una all'altra.
export const PAGE_GROUPS = [
  // Academy (28/09/2026, pannello navigazione: 20 voci di Training = metà per l'operatore, metà laboratorio admin)
  { label: "Allenarsi", tabs: [["/", "Simulatore"], ["/academy/multi", "Chat in parallelo"], ["/academy/vendere", "Come si vende"], ["/academy/lezioni", "Lezioni dal reale"], ["/academy/tapes", "Conversazioni vere"], ["/playbook", "Playbook di vendita"]] },
  { label: "Classifiche Academy", tabs: [["/leaderboard", "Classifica allenamento"], ["/leaderboard/leghe", "Leghe"], ["/leaderboard/storico", "Hall of Fame"]] },
  { label: "Laboratorio Academy", tabs: [["/admin/sessions", "Sessioni"], ["/admin/review", "Revisione voti AI"], ["/admin/outcomes", "Risultati reali"], ["/admin/qa-reviews", "QA conversazioni"], ["/admin/academy-tapes", "Curatela tape"], ["/admin/academy-signals", "Cosa fa vendere"], ["/admin/transfer", "Transfer sul campo"], ["/admin/activation", "Attivazione"], ["/admin/infloww-ingest", "Carica export"], ["/admin/dashboard", "Allenamento operatori"]] },
  // pagine personali dell'operatore (pannello 27/09: "tre posti per sapere come sto andando")
  { label: "Come sto andando", tabs: [["/me/score", "Score"], ["/profilo", "Il mio mese"], ["/me/percorso", "Percorso"], ["/profilo/certificazioni", "Certificazioni"]] },
  { label: "Come migliorare", tabs: [["/me/coaching", "Coaching"], ["/me/qualita", "Qualità delle chat"]] },
  { label: "Il mio compenso", tabs: [["/me/compenso", "Compenso"], ["/me/contestazioni", "Contestazioni"]] },
  // Laura (08/10/2026): revenue.hoc.tools + chat.hoc.tools ricostruiti, un solo strumento per il sales
  { label: "Laura", tabs: [["/admin/revenue-pacing", "Revenue"], ["/admin/chat-monitor", "Chat"]] },
  // chi guida una squadra: chi è sotto soglia, chi far crescere, le sessioni
  { label: "Da seguire", tabs: [["/admin/settimana", "Questa settimana"], ["/admin/action-center", "Sotto soglia"], ["/admin/coaching-center", "Da far crescere"], ["/admin/coaching-sessions", "Sessioni"]] },
  // scheda dell'operatore: stesse persone, più viste (":e" = nome operatore nell'indirizzo)
  { label: "Scheda operatore", tabs: [["/leaderboard/operational/:e", "Scheda"], ["/admin/operator-signals/:e", "Segnali e game film"]] },
  // Centro HR (29/09/2026): CRM persone + stato della sync con ClickUp
  { label: "Persone HR", tabs: [["/admin/hr", "Persone"], ["/admin/hr/sync", "Sincronizzazione ClickUp"]] },
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
const dynamic = [];
for (const g of PAGE_GROUPS) g.tabs.forEach(([href], i) => {
  if (href.includes(":e")) dynamic.push({ re: new RegExp("^" + href.replace(":e", "([^/]+)") + "/?$"), group: g });
  else byHref.set(href, { group: g, primary: i === 0 });
});

/** Il gruppo di una pagina (per le schede in cima) e il parametro, o null. */
export function groupMatch(pathname) {
  const p = String(pathname || "").replace(/\/$/, "");
  const hit = byHref.get(p);
  if (hit) return { group: hit.group, param: null };
  for (const d of dynamic) { const m = p.match(d.re); if (m) return { group: d.group, param: m[1] }; }
  return null;
}
export function groupOf(pathname) { return groupMatch(pathname)?.group || null; }

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
