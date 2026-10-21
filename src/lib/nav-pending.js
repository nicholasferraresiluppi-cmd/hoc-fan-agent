"use client";
// Pagina verso cui si sta andando (21/10/2026): al tocco su un link la scheda si accende SUBITO,
// prima che arrivi la pagina nuova (sensazione da app, non da sito). La scrive NavProgress,
// la leggono le barre di schede (CompNav, PageTabs, barra in basso). Si svuota al cambio pagina.
import { useSyncExternalStore } from "react";

let pending = null;
const subs = new Set();

export function setPendingHref(href) {
  if (pending === href) return;
  pending = href;
  subs.forEach((f) => f());
}

const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const get = () => pending;
const getServer = () => null;

/** Pathname di destinazione mentre la navigazione è in corso, altrimenti null. */
export function usePendingHref() {
  return useSyncExternalStore(subscribe, get, getServer);
}

/** Il percorso da considerare "aperto": quello di destinazione se si sta navigando. */
export function useShownPath(pathname) {
  return usePendingHref() || pathname;
}
