"use client";
// Cambio pagina "da app" (21/10/2026, richiesta di Nicholas: «ci vuole un po' a caricare, sembra
// una web app»). Tre cose, per TUTTI i link interni dell'app senza toccarli uno a uno:
// 1. al primo contatto (dito che tocca, mouse sopra) la pagina si scarica in anticipo
//    (router.prefetch): quando il dito si alza metà del lavoro è già fatto;
// 2. al tocco la destinazione si segna subito (lib/nav-pending) → la scheda si accende senza attesa;
// 3. se la pagina tarda più di un attimo compare una barra sottile in alto, così si vede che
//    il tocco è arrivato. Sparisce quando la pagina nuova è montata.
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CP } from "@/lib/brand";
import { setPendingHref } from "@/lib/nav-pending";

const SHOW_AFTER_MS = 120; // sotto, la barra sarebbe solo un lampo
const GIVE_UP_MS = 12000; // un link che non porta da nessuna parte non lascia la barra accesa

/** Percorso interno raggiungibile col router, o null (esterni, download, nuove schede, API, file). */
function internalPath(a, e) {
  if (!a || !a.href || a.hasAttribute("download")) return null;
  if (a.target && a.target !== "_self") return null;
  if (e && (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
  let u;
  try { u = new URL(a.href, location.href); } catch { return null; }
  if (u.origin !== location.origin) return null;
  if (u.pathname.startsWith("/api/") || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) return null;
  return u;
}

export default function NavProgress() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [phase, setPhaseState] = useState("idle"); // idle | wait | run | done
  const phaseRef = useRef("idle");
  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };
  const timers = useRef([]);
  const prefetched = useRef(new Set());
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    const prefetch = (e) => {
      const u = internalPath(e.target.closest?.("a"));
      if (!u || u.pathname === location.pathname) return;
      const key = u.pathname + u.search;
      if (prefetched.current.has(key)) return;
      prefetched.current.add(key);
      try { router.prefetch(key); } catch {}
    };
    const click = (e) => {
      const u = internalPath(e.target.closest?.("a"), e);
      if (!u || u.pathname === location.pathname) return;
      clear();
      setPendingHref(u.pathname.replace(/\/$/, "") || "/");
      setPhase("wait");
      timers.current.push(setTimeout(() => { if (phaseRef.current === "wait") setPhase("run"); }, SHOW_AFTER_MS));
      timers.current.push(setTimeout(() => { setPendingHref(null); setPhase("idle"); }, GIVE_UP_MS));
    };
    const opts = { capture: true, passive: true };
    document.addEventListener("touchstart", prefetch, opts);
    document.addEventListener("mouseover", prefetch, opts);
    document.addEventListener("focusin", prefetch, opts);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("touchstart", prefetch, opts);
      document.removeEventListener("mouseover", prefetch, opts);
      document.removeEventListener("focusin", prefetch, opts);
      document.removeEventListener("click", click, true);
      clear();
    };
  }, [router]);

  // pagina nuova montata: la barra si chiude (veloce) e la destinazione si svuota
  useEffect(() => {
    setPendingHref(null);
    clear();
    if (phaseRef.current === "run") {
      setPhase("done");
      timers.current.push(setTimeout(() => setPhase("idle"), 260));
    } else if (phaseRef.current !== "idle") setPhase("idle");
    // le pagine si riscaricano in anticipo dopo un po' (la cache del router scade)
    const t = setTimeout(() => prefetched.current.clear(), 60000);
    return () => clearTimeout(t);
  }, [pathname]);

  if (phase === "idle" || phase === "wait") return null;
  return (
    <div aria-hidden="true" className={`hoc-navbar hoc-navbar-${phase}`} style={{
      position: "fixed", left: 0, right: 0, top: "env(safe-area-inset-top)", height: 2, zIndex: 100, pointerEvents: "none",
    }}>
      <div style={{ height: "100%", background: CP.accent, transformOrigin: "left center" }} />
    </div>
  );
}
