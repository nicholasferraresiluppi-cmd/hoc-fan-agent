import { redirect } from "next/navigation";

/**
 * Pagina FUSA in /admin/wage-audit ("Sync & Audit CP", giu 2026).
 * Sync storico + audit completezza ora vivono in un'unica pagina: tabella
 * mese×(KV vs CP live) con azione sync/ripara chunkata per riga + bulk.
 * Questo redirect tiene vivi i vecchi link/bookmark (es. "Sync questo mese").
 */
export default function CreatorsProSyncHistoryRedirect() {
  redirect("/admin/wage-audit");
}
