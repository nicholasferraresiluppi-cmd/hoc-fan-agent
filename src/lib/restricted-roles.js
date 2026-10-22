// Ruoli ristretti (13/10/2026): chi ha SOLO ruoli di questo elenco vede l'app ridotta alle loro
// pagine — atterra sulla prima, il menu non c'è, ogni altra pagina lo riporta lì. Primo caso: "social"
// (chi gestisce gli account social vede soltanto Account social). Un admin, o chi ha anche un altro
// ruolo, non è mai ristretto. Logica pura: la usano /api/whoami, /start, AppShell e i test.
//
// È una regola di INTERFACCIA: i dati restano difesi dalle API (il ruolo "social" ha un solo
// permesso, social.manage); qui si evita che la persona finisca su pagine che non la riguardano.

export const RESTRICTED_ROLES = {
  // 22/10/2026: + Warm-up, che diventa la pagina d'arrivo (è il lavoro di ogni giorno di chi ha questo ruolo)
  social: { home: "/admin/warmup", paths: ["/admin/warmup", "/admin/supervisor"], label: "Warm-up" },
  // 18/10/2026: People Partner — CRM persone e contratti; Contabilità solo se il titolare gliel'ha aperta
  // `needs`: pagina mostrata solo con quel permesso (la Contabilità la apre il titolare a mano)
  people: { home: "/admin/hr", paths: ["/admin/hr", "/admin/hr/contratti", "/contabilita"], label: "Persone", needs: { "/contabilita": "accounting.private" } },
  smm: { home: "/admin/scouting", paths: ["/admin/scouting", "/admin/studio-social", "/admin/supervisor", "/admin/warmup"], label: "Radar creator" },
};

/** { home, paths, label } se la persona è ristretta, altrimenti null. */
export function restrictionFor({ admin, roles, capabilities = null } = {}) {
  if (admin) return null;
  const rs = (roles || []).filter(Boolean);
  if (!rs.length || !rs.every((r) => RESTRICTED_ROLES[r])) return null;
  const first = RESTRICTED_ROLES[rs[0]];
  const ok = (r, p) => { const need = RESTRICTED_ROLES[r].needs?.[p]; return !need || Boolean(capabilities?.[need]); };
  return { home: first.home, label: first.label, paths: [...new Set(rs.flatMap((r) => RESTRICTED_ROLES[r].paths.filter((p) => ok(r, p))))] };
}

/** La pagina è tra quelle permesse? (senza restrizione: sempre) */
export function pathAllowed(restriction, pathname) {
  if (!restriction) return true;
  const p = String(pathname || "").replace(/\/$/, "") || "/";
  return restriction.paths.some((x) => p === x || p.startsWith(x + "/"));
}
