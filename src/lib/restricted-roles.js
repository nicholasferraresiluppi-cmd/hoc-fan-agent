// Ruoli ristretti (13/10/2026): chi ha SOLO ruoli di questo elenco vede l'app ridotta alle loro
// pagine — atterra sulla prima, il menu non c'è, ogni altra pagina lo riporta lì. Primo caso: "social"
// (chi gestisce gli account social vede soltanto Account social). Un admin, o chi ha anche un altro
// ruolo, non è mai ristretto. Logica pura: la usano /api/whoami, /start, AppShell e i test.
//
// È una regola di INTERFACCIA: i dati restano difesi dalle API (il ruolo "social" ha un solo
// permesso, social.manage); qui si evita che la persona finisca su pagine che non la riguardano.

export const RESTRICTED_ROLES = {
  social: { home: "/admin/supervisor", paths: ["/admin/supervisor"], label: "Account social" },
};

/** { home, paths, label } se la persona è ristretta, altrimenti null. */
export function restrictionFor({ admin, roles } = {}) {
  if (admin) return null;
  const rs = (roles || []).filter(Boolean);
  if (!rs.length || !rs.every((r) => RESTRICTED_ROLES[r])) return null;
  const first = RESTRICTED_ROLES[rs[0]];
  return { home: first.home, label: first.label, paths: [...new Set(rs.flatMap((r) => RESTRICTED_ROLES[r].paths))] };
}

/** La pagina è tra quelle permesse? (senza restrizione: sempre) */
export function pathAllowed(restriction, pathname) {
  if (!restriction) return true;
  const p = String(pathname || "").replace(/\/$/, "") || "/";
  return restriction.paths.some((x) => p === x || p.startsWith(x + "/"));
}
