"use client";

/**
 * useSmartPeriod — hook condiviso per la selezione del periodo (YYYY-MM).
 *
 * Priorità di risoluzione del period_id iniziale:
 *   1. URL searchParam ?period_id=YYYY-MM (se presente)
 *   2. localStorage 'hoc:selected_period' (ultima scelta dell'utente)
 *   3. ultimo mese con DATI EFFETTIVI (da /api/leaderboard/periods)
 *   4. mese corrente (fallback)
 *
 * Setter `setPeriod`:
 *   - aggiorna stato locale
 *   - persiste in localStorage
 *   - aggiorna URL (?period_id=X) usando router.replace (no full reload)
 *
 * Tutte le pagine principali (Sales CP, Creator, Action Center) lo usano
 * così la selezione è coerente nelle navigazioni inter-pagina.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STORAGE_KEY = "hoc:selected_period";
// Inizio mese (03/10/2026, prova d'uso): nei primi giorni il mese in corso ha 2-3 turni a testa e
// "Eccellente con 2 turni" o "in calo di 27 punti" sono rumore. Senza una scelta esplicita in questa
// sessione si apre il mese CHIUSO precedente, con un avviso e un link per passare al mese in corso.
export const EARLY_MONTH_DAYS = 7;
const EXPLICIT_KEY = "hoc:period-explicit";

function prevMonthId(id) {
  const [y, m] = id.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** true nei primi EARLY_MONTH_DAYS giorni del mese. */
export const isEarlyMonth = (d = new Date()) => d.getDate() <= EARLY_MONTH_DAYS;

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isValidPeriod(p) {
  return typeof p === "string" && /^\d{4}-\d{2}$/.test(p);
}

async function fetchLastPeriodWithData() {
  try {
    const res = await fetch("/api/leaderboard/periods");
    if (!res.ok) return null;
    const j = await res.json();
    return j?.last_period_with_data || null;
  } catch {
    return null;
  }
}

export function useSmartPeriod() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period_id");

  // Stato locale: parte con URL se valido, altrimenti vuoto (verrà popolato in effect)
  const [periodId, setPeriodIdState] = useState(() => {
    if (isValidPeriod(urlPeriod)) return urlPeriod;
    return "";
  });

  // On mount: se non c'è URL period, risolvi via localStorage o last sync
  useEffect(() => {
    if (periodId) return; // già risolto
    let cancelled = false;

    (async () => {
      let resolved = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isValidPeriod(stored)) resolved = stored;
      } catch {}

      if (!resolved) {
        // Fetch ultimo periodo con dati effettivi
        const lastWithData = await fetchLastPeriodWithData();
        if (isValidPeriod(lastWithData)) resolved = lastWithData;
      }

      if (!resolved) resolved = currentMonthId();
      let explicit = false;
      try { explicit = sessionStorage.getItem(EXPLICIT_KEY) === "1"; } catch {}
      if (!explicit && resolved === currentMonthId() && isEarlyMonth()) {
        resolved = prevMonthId(resolved);
        if (!cancelled) setEarly(true);
      }

      if (!cancelled) setPeriodIdState(resolved);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [early, setEarly] = useState(false);

  // Se l'URL cambia (es. user click link), sincronizza state
  useEffect(() => {
    if (isValidPeriod(urlPeriod) && urlPeriod !== periodId) {
      setPeriodIdState(urlPeriod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPeriod]);

  // Setter: aggiorna state + localStorage + URL (router.replace, no reload)
  const setPeriod = useCallback((newPeriod) => {
    if (!isValidPeriod(newPeriod)) return;
    setPeriodIdState(newPeriod);
    setEarly(false);
    try { localStorage.setItem(STORAGE_KEY, newPeriod); sessionStorage.setItem(EXPLICIT_KEY, "1"); } catch {}
    // Aggiorna URL preservando gli altri searchParams
    const params = new URLSearchParams(searchParams.toString());
    params.set("period_id", newPeriod);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // terzo valore: { early, current } → la pagina mostra <EarlyMonthNote> (componente in components/ds)
  return [periodId, setPeriod, { early, current: currentMonthId() }];
}
