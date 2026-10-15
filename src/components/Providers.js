"use client";

import { useEffect } from "react";
import { SWRConfig } from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

// Safari (anche dalla schermata Home) ignora user-scalable=no: il pizzico si ferma
// bloccando i suoi eventi gesture* e i tocchi a due dita già all'inizio (touchstart),
// non solo mentre si muovono. Il doppio tocco lo ferma `touch-action: manipulation`
// in globals.css. Se la pagina risulta comunque ingrandita (zoom rimasto da prima,
// campo toccato), si riscrive il meta viewport: iOS torna a scala 1.
// I gesti dentro le scene 3D restano: gli eventi pointer arrivano comunque.
function useNoZoom() {
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    const multi = (e) => {
      if ((e.touches && e.touches.length > 1) || (typeof e.scale === "number" && e.scale !== 1)) e.preventDefault();
    };
    const vv = window.visualViewport;
    let resetting = false;
    const resetZoom = () => {
      if (resetting || !vv || vv.scale <= 1.01) return;
      const meta = document.querySelector('meta[name="viewport"]');
      if (!meta) return;
      resetting = true;
      const content = meta.getAttribute("content") || "";
      meta.setAttribute("content", "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no");
      requestAnimationFrame(() => { meta.setAttribute("content", content); resetting = false; });
    };
    const opts = { passive: false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("touchstart", multi, opts);
    document.addEventListener("touchmove", multi, opts);
    document.addEventListener("focusout", resetZoom);
    vv?.addEventListener("resize", resetZoom);
    resetZoom();
    return () => {
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
      document.removeEventListener("touchstart", multi, opts);
      document.removeEventListener("touchmove", multi, opts);
      document.removeEventListener("focusout", resetZoom);
      vv?.removeEventListener("resize", resetZoom);
    };
  }, []);
}

export default function Providers({ children }) {
  useNoZoom();
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 5000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
