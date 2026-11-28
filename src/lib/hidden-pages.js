/**
 * Pagine nascoste (28/11/2026, pulizia prima del rilascio).
 *
 * Perché: il menu completo aveva ~125 voci e una persona nuova si perdeva. Nicholas ha scelto, schermata
 * per schermata, le pagine da togliere di mezzo (dati d'uso 25/09–28/11 alla mano: molte mai aperte da
 * nessuno). Le pagine NON sono cancellate: codice, dati e API restano dove sono.
 *
 * Cosa succede a una pagina in questo elenco:
 *   - sparisce da menu, mansioni, hub, ricerca ⌘K, schede in cima e benvenuto (passa da canSee, lib/nav-access);
 *   - chi non è admin e ci arriva da un link torna alla sua pagina di partenza (AppShell → landingFor);
 *   - l'admin la ritrova nel gruppo «Nascoste» in fondo al menu, e può aprirla come prima.
 *
 * Rimettere una pagina = togliere la sua riga. Si confronta l'indirizzo esatto (niente sotto-pagine):
 * "/leaderboard" nascosta non deve nascondere "/leaderboard/sales-cp".
 */

export const HIDDEN_PAGES = [
  // Performance
  { href: "/leaderboard/creators", label: "Creator", area: "Performance" },
  { href: "/admin/benvenuto", label: "Benvenuto a pagamento", area: "Performance" },
  { href: "/admin/fan-da-recuperare", label: "Fan da recuperare", area: "Performance" },
  { href: "/admin/scaletta", label: "La scaletta", area: "Performance" },
  { href: "/admin/prova-fedelta", label: "Prova fedeltà", area: "Performance" },
  // Training: Allenarsi, Classifiche e Laboratorio Academy (gruppi a schede, si nascondono interi)
  { href: "/welcome/score-friendly", label: "Guida allo score", area: "Training" },
  { href: "/", label: "Allenarsi", area: "Training" },
  { href: "/academy/multi", label: "Chat in parallelo", area: "Training" },
  { href: "/academy/vendere", label: "Come si vende", area: "Training" },
  { href: "/academy/lezioni", label: "Lezioni dal reale", area: "Training" },
  { href: "/academy/tapes", label: "Conversazioni vere", area: "Training" },
  { href: "/playbook", label: "Playbook di vendita", area: "Training" },
  { href: "/leaderboard", label: "Classifiche Academy", area: "Training" },
  { href: "/leaderboard/leghe", label: "Leghe", area: "Training" },
  { href: "/leaderboard/storico", label: "Hall of Fame", area: "Training" },
  { href: "/admin/sessions", label: "Laboratorio Academy", area: "Training" },
  { href: "/admin/review", label: "Revisione voti AI", area: "Training" },
  { href: "/admin/outcomes", label: "Risultati reali", area: "Training" },
  { href: "/admin/qa-reviews", label: "QA conversazioni", area: "Training" },
  { href: "/admin/academy-tapes", label: "Curatela tape", area: "Training" },
  { href: "/admin/academy-signals", label: "Cosa fa vendere", area: "Training" },
  { href: "/admin/transfer", label: "Transfer sul campo", area: "Training" },
  { href: "/admin/activation", label: "Attivazione", area: "Training" },
  { href: "/admin/infloww-ingest", label: "Carica export Infloww", area: "Training" },
  { href: "/admin/dashboard", label: "Allenamento operatori", area: "Training" },
  { href: "/admin/creator-difficulty", label: "Difficoltà creator", area: "Training" },
  // Insights
  { href: "/admin/fan-archetypes", label: "Tipi di fan", area: "Insights" },
  { href: "/admin/creators", label: "Voce delle creator", area: "Insights" },
  { href: "/admin/loop", label: "Loop azione→esito", area: "Insights" },
  // Marketing
  { href: "/admin/piani", label: "Piani", area: "Marketing" },
  { href: "/admin/social-proxies", label: "Proxy account social", area: "Marketing" },
  // People (Da seguire è un gruppo a schede: si nasconde intero)
  { href: "/cm-cockpit", label: "Cockpit CM", area: "People" },
  { href: "/admin/hr/contratti", label: "Contratti", area: "People" },
  { href: "/admin/candidate-assessments", label: "Assessment candidati", area: "People" },
  { href: "/admin/priority-queue", label: "Fan da seguire ora", area: "People" },
  { href: "/admin/settimana", label: "Da seguire", area: "People" },
  { href: "/admin/action-center", label: "Sotto soglia", area: "People" },
  { href: "/admin/coaching-center", label: "Da far crescere", area: "People" },
  { href: "/admin/coaching-sessions", label: "Sessioni coaching", area: "People" },
  { href: "/admin/disputes", label: "Contestazioni", area: "People" },
  { href: "/admin/employee-profiles", label: "Profili operatori", area: "People" },
  { href: "/admin/seniority", label: "Seniority", area: "People" },
];

const norm = (p) => String(p || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
const HIDDEN = new Set(HIDDEN_PAGES.map((p) => p.href));

/** L'indirizzo è una pagina nascosta? (confronto esatto, vedi sopra) */
export const isHiddenHref = (href) => HIDDEN.has(norm(href));

/**
 * Dove mandare chi apre una pagina nascosta (o la radice "/", che era l'Academy).
 * `allowed(href)` = canSee già legato ai permessi della persona; `workspaceHome` = home della sua mansione.
 */
export function landingFor(allowed, workspaceHome = null) {
  const candidates = [workspaceHome, "/admin", "/admin/bilancio", "/me/score"];
  return candidates.find((h) => h && !isHiddenHref(h) && allowed(h)) || "/welcome";
}
