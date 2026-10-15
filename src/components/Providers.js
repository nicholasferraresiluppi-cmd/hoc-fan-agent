"use client";

import { useEffect } from "react";
import { SWRConfig } from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

// Safari (anche dalla schermata Home) ignora user-scalable=no: il pizzico si ferma
// bloccando i suoi eventi gesture* e i movimenti a due dita. Il doppio tocco lo ferma
// `touch-action: manipulation` in globals.css. I gesti dentro le scene 3D restano
// (gli eventi pointer arrivano comunque, si blocca solo lo zoom della pagina).
function useNoZoom() {
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    const twoFingers = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
    const opts = { passive: false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("touchmove", twoFingers, opts);
    return () => {
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
      document.removeEventListener("touchmove", twoFingers, opts);
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
