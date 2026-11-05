/**
 * Segnali di esperienza d'uso, lato browser (montato da AppShell).
 *
 * Perché (25/09/2026, richiesta Nicholas: "capire se i tasti sono nella
 * posizione giusta"): i prodotti di analytics misurano non solo QUALI pagine si
 * aprono ma COME si usano. Raccogliamo i segnali classici, in forma aggregata:
 *  - clic su elementi interattivi, con DOVE stanno nella pagina (visibili
 *    subito o solo scorrendo; in alto/metà/fondo) → un tasto molto usato che
 *    sta in fondo va spostato su;
 *  - rage click (3+ clic ravvicinati sullo stesso punto in 1s) → frustrazione:
 *    qualcosa non risponde o sembra cliccabile e non lo è;
 *  - profondità di scorrimento per pagina → cosa sta sotto e nessuno vede;
 *  - errori JavaScript per pagina, tempo di caricamento.
 *
 * Aggiunti il 17/10/2026 (sezione Utilizzo: "dove si blocca"), sempre anonimi:
 *  - passaggio da una pagina all'altra (la prima della visita viene da
 *    "(ingresso)"; una visita finisce dopo 30 minuti senza far niente);
 *  - secondi con la pagina in primo piano, e le aperture durate meno di 10 s
 *    senza nessun clic;
 *  - chiamate ai dati (/api/…) che rispondono 401/403/404/5xx o non arrivano:
 *    contate UNA volta per apertura e per codice — sono le pagine che si
 *    aprono ma non funzionano per chi le apre.
 *
 * PRIVACY: mai valori dei campi, mai testo di righe/celle dinamiche. Per i
 * link si registra la destinazione normalizzata, per i tasti l'etichetta
 * (≤40 caratteri, numeri → #). Nessuna registrazione dello schermo.
 */

const MAX_BATCH = 20;
let queue = [];
let currentPath = null;
let maxScroll = 0;
let lastClicks = [];
let timer = null;
let installed = false;
// percorsi e tempo (17/10/2026)
const ENTRY = "(ingresso)";
const VISIT_GAP_MS = 30 * 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;
let lastActive = 0;
let visibleSince = null;
let activeMs = 0;
let everVisible = false;
let clicksHere = 0;
let blockedHere = new Set();

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/\d+([.,]\d+)?/g, "#").slice(0, 40);

function normHref(href) {
  try {
    const u = new URL(href, location.origin);
    if (u.origin !== location.origin) return "→ esterno";
    const segs = u.pathname.split("/").filter(Boolean).map((s, i) => (i >= 2 || /%|\d/.test(s) ? ":x" : s));
    return "→ /" + segs.join("/");
  } catch { return "→ ?"; }
}

function describe(el) {
  if (el.dataset?.track) return clean(el.dataset.track);
  if (el.tagName === "A" && el.getAttribute("href")) return normHref(el.getAttribute("href"));
  const aria = el.getAttribute("aria-label") || el.getAttribute("title");
  if (aria) return clean(aria);
  if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
    return clean(`campo ${el.getAttribute("placeholder") || el.getAttribute("name") || el.type || ""}`);
  }
  const txt = (el.innerText || "").split("\n")[0];
  return clean(txt) || el.tagName.toLowerCase();
}

function position(el) {
  const r = el.getBoundingClientRect();
  const docY = r.top + window.scrollY;
  const docH = Math.max(document.documentElement.scrollHeight, 1);
  const fold = docY < window.innerHeight ? "subito" : "scorrendo";
  const q = docY / docH;
  const zone = q < 0.25 ? "alto" : q < 0.5 ? "metà-alta" : q < 0.75 ? "metà-bassa" : "fondo";
  return `${fold}|${zone}`;
}

function push(ev) {
  queue.push({ ...ev, path: currentPath });
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, 8000);
}

export function flush() {
  clearTimeout(timer); timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, MAX_BATCH) });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {}
}

function onClick(e) {
  lastActive = Date.now();
  const el = e.target?.closest?.("a,button,[role=button],[role=tab],[role=menuitem],summary,select,input,textarea,label,[data-track]");
  const now = Date.now();
  lastClicks = lastClicks.filter((c) => now - c.t < 1000);
  lastClicks.push({ t: now, x: e.clientX, y: e.clientY });
  const near = lastClicks.filter((c) => Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30);
  const label = el ? describe(el) : "(zona non cliccabile)";
  if (near.length === 3) push({ type: "rage", label });
  if (!el) return; // i clic nel vuoto contano solo come frustrazione
  clicksHere++;
  push({ type: "click", label, pos: position(el) });
}

function onScroll() {
  lastActive = Date.now();
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docH <= 0 ? 100 : Math.round(((window.scrollY) / docH) * 100);
  if (pct > maxScroll) maxScroll = Math.min(100, pct);
}

function onError(message) {
  push({ type: "error", label: clean(String(message || "errore").replace(/https?:\/\/\S+/g, "")).slice(0, 40) || "errore" });
}

function onVisibility() {
  const now = Date.now();
  if (document.visibilityState === "visible") { visibleSince = now; everVisible = true; lastActive = now; }
  else if (visibleSince != null) { activeMs += now - visibleSince; visibleSince = null; }
}

const blockCode = (status) => (status === 401 || status === 403 || status === 404 ? String(status) : status >= 500 ? "5xx" : null);

function block(code) {
  if (!code || !currentPath || blockedHere.has(code)) return;
  blockedHere.add(code);
  push({ type: "block", code });
}

// Osserva le risposte delle API della pagina senza toccarle (SWR e fetch dirette passano tutte da qui).
function watchFetch() {
  const orig = window.fetch;
  if (typeof orig !== "function" || orig.__hocWatched) return;
  const watched = function (input, init) {
    const p = orig.apply(this, arguments);
    try {
      const raw = typeof input === "string" ? input : input?.url || String(input || "");
      const u = new URL(raw, location.origin);
      if (u.origin === location.origin && u.pathname.startsWith("/api/") && u.pathname !== "/api/track") {
        p.then((r) => block(blockCode(r.status)), (err) => { if (err?.name !== "AbortError") block("rete"); });
      }
    } catch {}
    return p;
  };
  watched.__hocWatched = true;
  window.fetch = watched;
}

/** Da chiamare a ogni cambio pagina. */
export function uxPageChange(path) {
  if (typeof window === "undefined") return;
  if (!installed) {
    installed = true;
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("error", (e) => onError(e.message));
    window.addEventListener("unhandledrejection", (e) => onError(e.reason?.message || e.reason));
    window.addEventListener("pagehide", () => { closePage(); currentPath = null; flush(); });
    document.addEventListener("visibilitychange", () => { onVisibility(); if (document.visibilityState === "hidden") flush(); });
    watchFetch();
    // tempo di caricamento della prima pagina aperta
    setTimeout(() => {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav && nav.duration > 0) push({ type: "load", ms: Math.round(nav.duration) });
    }, 0);
  }
  const now = Date.now();
  const from = currentPath && now - lastActive < VISIT_GAP_MS ? currentPath : ENTRY;
  closePage();
  currentPath = path;
  maxScroll = 0;
  activeMs = 0; clicksHere = 0; blockedHere = new Set();
  everVisible = document.visibilityState === "visible";
  visibleSince = everVisible ? now : null;
  lastActive = now;
  push({ type: "nav", from, to: path });
  onScroll();
}

function closePage() {
  if (!currentPath) return;
  push({ type: "scroll", pct: maxScroll });
  if (!everVisible) return; // aperta in una scheda mai guardata: niente tempo né "uscita subito"
  const now = Date.now();
  let ms = activeMs + (visibleSince != null ? now - visibleSince : 0);
  // pagina lasciata aperta senza toccarla: oltre 5 minuti di inattività non è uso
  if (visibleSince != null) ms -= Math.max(0, now - Math.max(lastActive, visibleSince) - IDLE_MS);
  ms = Math.max(0, Math.min(30 * 60 * 1000, ms));
  push({ type: "time", s: Math.round(ms / 1000) });
  if (ms < 10000 && clicksHere === 0) push({ type: "quick" });
}

/** Per l'ErrorBoundary di React. */
export function uxReportError(error) {
  onError(error?.message || String(error));
  flush();
}
