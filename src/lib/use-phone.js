"use client";
// true sotto i 700px (telefono): per le pagine che hanno un disegno apposta, non la pagina da computer stretta.
import { useEffect, useState } from "react";

export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 699px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
