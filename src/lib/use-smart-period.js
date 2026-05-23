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

      if (!cancelled) setPeriodIdState(resolved);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try { localStorage.setItem(STORAGE_KEY, newPeriod); } catch {}
    // Aggiorna URL preservando gli altri searchParams
    const params = new URLSearchParams(searchParams.toString());
    params.set("period_id", newPeriod);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  return [periodId, setPeriod];
}
