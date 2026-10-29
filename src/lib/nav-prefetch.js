"use client";

// Precaricamento al passaggio sul menu (29/10/2026). Misurato: un cambio di pagina aspettava
// la struttura dal server (~430 ms) e poi i dati (~450 ms), uno dopo l'altro. Quando il puntatore
// arriva su una voce (o il dito la tocca) si chiedono già la pagina e i suoi dati principali:
// al clic sono di solito pronti e la pagina si mostra subito, poi si aggiorna in sottofondo.
// I dati entrano nella cache di SWR solo se la risposta è buona: una pagina che dà errore si
// comporta esattamente come prima. Solo chiavi FISSE (le pagine con periodo/creator nell'indirizzo
// prendono solo la struttura): una chiave diversa da quella della pagina sarebbe lavoro sprecato.
import { mutate } from "swr";

const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

const DATA = {
  "/admin/warmup": () => ["/api/admin/warmup"],
  "/admin/editoriale": () => {
    const c = ls("hoc:editoriale:creator");
    return ["/api/admin/editoriale", "/api/admin/warmup", ...(c ? [`/api/admin/editoriale?creator=${encodeURIComponent(c)}`] : [])];
  },
  "/admin/hr": () => ["/api/admin/hr/people", "/api/admin/hr/form-links/shared"],
  "/admin/le-mie-creator": () => ["/api/admin/live-overview"],
  "/admin/referral": () => ["/api/admin/referral"],
  "/admin/supervisor": () => ["/api/admin/supervisor"],
  "/admin/scouting": () => ["/api/admin/scouting"],
};

const last = new Map();
const AGAIN_MS = 20_000; // non si richiede la stessa voce più di una volta ogni 20 s

export function prefetchNav(router, href) {
  if (!href || typeof window === "undefined") return;
  const path = href.split("?")[0].replace(/\/$/, "") || "/";
  const now = Date.now();
  if (now - (last.get(path) || 0) < AGAIN_MS) return;
  last.set(path, now);
  try { router?.prefetch?.(href); } catch {}
  for (const key of DATA[path]?.() || []) {
    fetch(key)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) mutate(key, d, { revalidate: false }); })
      .catch(() => {});
  }
}

/** Dati di una scheda (es. una persona) caricati in anticipo al passaggio sulla riga. */
export function prefetchData(keys) {
  const now = Date.now();
  for (const key of keys) {
    if (now - (last.get(key) || 0) < AGAIN_MS) continue;
    last.set(key, now);
    fetch(key)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) mutate(key, d, { revalidate: false }); })
      .catch(() => {});
  }
}

/**
 * Telefono e tablet (niente passaggio del mouse): quando l'app è ferma si precaricano da sole le
 * pagine principali che la persona ha nel menu (solo quelle con dati noti, al massimo 6), così il
 * tocco trova tutto pronto. Una volta per caricamento dell'app.
 */
let idleDone = false;
export function prefetchMenuWhenIdle(router, hrefs) {
  if (idleDone || typeof window === "undefined") return;
  let touch = false;
  try { touch = window.matchMedia("(hover: none)").matches; } catch {}
  if (!touch) return;
  const list = (hrefs || []).filter((h) => DATA[h]).slice(0, 6);
  if (!list.length) return;
  idleDone = true;
  const run = () => list.forEach((h, i) => setTimeout(() => prefetchNav(router, h), i * 400));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2500);
}
