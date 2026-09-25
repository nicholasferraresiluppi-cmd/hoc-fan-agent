"use client";
// Tema dell'app lato browser: legge/imposta data-theme su <html> e lo ricorda.
import { useEffect, useState } from "react";

const KEY = "hoc:theme";
const EVT = "hoc:theme-change";

export function getTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(t) {
  const theme = t === "light" ? "light" : "dark";
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: theme }));
}

/** [theme, setTheme] — si aggiorna quando il tema cambia ovunque nell'app. */
export function useTheme() {
  const [theme, set] = useState("dark");
  useEffect(() => {
    set(getTheme());
    const on = () => set(getTheme());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return [theme, setTheme];
}
