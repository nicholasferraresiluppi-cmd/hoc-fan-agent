/**
 * Mansioni: menu e hub per il lavoro che fa la persona (03/10/2026).
 *
 * Perché: la prova d'uso con tester per ruolo (HR, Sales Manager, Board) ha dato 5/10 a tutti e tre con lo
 * stesso motivo: ~100 voci di menu uguali per tutti, quando a ciascuno ne servono 7-14 e la sua parte sta in
 * fondo all'hub. Report: https://claude.ai/artifact/KBfbdXpTifBNJxuFtmTMtz
 *
 * La mansione mette ORDINE, non apre né chiude dati: ogni voce resta filtrata dai permessi (lib/nav-access) e
 * ogni API si difende da sé. "Tutti gli strumenti" apre sempre l'elenco completo.
 *
 * Logica pura (niente React, niente KV): la usano Sidebar classico, SidebarCasa, hub, Membri e /api/whoami.
 */

export const WORKSPACE_IDS = ["board", "sales", "hr", "all"];

/** Menu corto di ogni mansione: gruppi con titolo e voci {href, label}. I nomi sono quelli canonici del menu. */
export const WORKSPACES = {
  board: {
    id: "board",
    label: "Board",
    hint: "Andamento, margini, rischi e decisioni",
    home: "/admin",
    sections: [
      { title: null, items: [
        { href: "/admin", label: "Oggi", exact: true },
        { href: "/admin/alerts", label: "Alert operativi", badge: true },
      ] },
      { title: "Andamento", items: [
        { href: "/admin/pnl-live", label: "P&L Live" },
        { href: "/admin/revenue-pacing", label: "Revenue Laura" },
        { href: "/admin/infloww-agency", label: "Incassi Infloww" },
        { href: "/leaderboard/sales-cp", label: "Classifica vendite" },
        { href: "/admin/comp-review", label: "Anomalie compensi", desc: "Chi incassa molto più o molto meno della media del team sulla stessa creator, per dollari in gioco" },
      ] },
      { title: "Persone e decisioni", items: [
        { href: "/admin/hr", label: "Persone HR" },
        { href: "/admin/sede", label: "La Sede" },
        { href: "/admin/citta", label: "La città" },
        { href: "/admin/roadmap", label: "Roadmap" },
      ] },
    ],
  },
  sales: {
    id: "sales",
    label: "Sales Manager",
    hint: "Chi seguire, chi mettere dove, creator e coaching",
    home: "/admin/settimana",
    sections: [
      { title: "La mia settimana", items: [
        { href: "/admin/settimana", label: "Da seguire" },
        { href: "/admin/action-center", label: "Sotto soglia" },
        { href: "/admin/coaching-center", label: "Da far crescere" },
        { href: "/admin/alerts", label: "Alert operativi", badge: true },
      ] },
      { title: "Vendite", items: [
        { href: "/leaderboard/sales-cp", label: "Classifica vendite" },
        { href: "/leaderboard/creators", label: "Creator" },
        { href: "/admin/revenue-pacing", label: "Revenue Laura", desc: "Proiezione di fine mese per paese contro obiettivo e media storica" },
        { href: "/leaderboard/creators/heatmap", label: "Mappa operatore×creator" },
        { href: "/admin/creator-difficulty", label: "Difficoltà creator" },
      ] },
      { title: "Chat e turni", items: [
        { href: "/admin/conversation-intelligence", label: "Presidio chat" },
        { href: "/admin/sales-ai", label: "Sales manager AI" },
        { href: "/admin/manuale-vendite", label: "Manuale vendite" },
        { href: "/admin/shift-quality", label: "Qualità turni" },
        { href: "/cm-cockpit", label: "Cockpit CM" },
        { href: "/admin/operator-signals", label: "Profilo operatore" },
      ] },
    ],
  },
  hr: {
    id: "hr",
    label: "HR",
    hint: "Persone, contratti, accessi e contestazioni",
    home: "/admin/hr",
    sections: [
      { title: "Persone", items: [
        { href: "/admin/hr", label: "Persone HR" },
        { href: "/admin/hr/sync", label: "Sincronizzazione ClickUp" },
        { href: "/admin/candidate-assessments", label: "Assessment candidati" },
      ] },
      { title: "Accessi e richieste", items: [
        { href: "/admin/ruoli", label: "Membri e ruoli" },
        { href: "/admin/team", label: "Team" },
        { href: "/admin/disputes", label: "Contestazioni" },
      ] },
    ],
  },
  all: {
    id: "all",
    label: "Tutti gli strumenti",
    hint: "Il menu completo, come prima",
    home: "/admin",
    sections: [],
  },
};

export const isWorkspaceId = (v) => WORKSPACE_IDS.includes(v);

/**
 * Mansione di partenza quando nessuno l'ha scelta: dal ruolo. Un admin senza scelta resta su "Tutti gli
 * strumenti" (il menu di chi ha già l'app non cambia senza che lo decida); chi guida vendite/squadre va su
 * Sales Manager; gli altri (operatori) non hanno mansione: restano sul loro menu personale.
 */
export function defaultWorkspace({ admin, roles } = {}) {
  if (admin) return "all";
  const r = new Set(roles || []);
  if (r.has("sales_manager") || r.has("team_lead") || r.has("qa_reviewer")) return "sales";
  return null;
}

/** Le voci di una mansione che questa persona può davvero aprire (allowed = canSee già legato ai permessi). */
export function workspaceSections(id, allowed = () => true) {
  const ws = WORKSPACES[id];
  if (!ws) return [];
  return ws.sections
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(i.href)) }))
    .filter((s) => s.items.length);
}

/** Tutte le href di una mansione (per mettere in testa all'hub "i tuoi strumenti"). */
export const workspaceHrefs = (id) => new Set((WORKSPACES[id]?.sections || []).flatMap((s) => s.items.map((i) => i.href)));
