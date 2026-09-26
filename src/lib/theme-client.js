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
    window.addEventListener("hoc:style-change", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("hoc:style-change", on); };
  }, []);
  return [theme, setTheme];
}

// Stile v3 "Casa" in anteprima (26/09/2026): data-style="v3" su <html>.
const SKEY = "hoc:style";
const SEVT = "hoc:style-change";
export function getStyle() {
  if (typeof document === "undefined") return "v2";
  return document.documentElement.getAttribute("data-style") === "v3" ? "v3" : "v2";
}
export function setStyle(v) {
  const st = v === "v3" ? "v3" : "v2";
  if (st === "v3") document.documentElement.setAttribute("data-style", "v3");
  else document.documentElement.removeAttribute("data-style");
  try { localStorage.setItem(SKEY, st); } catch {}
  window.dispatchEvent(new CustomEvent(SEVT, { detail: st }));
}
export function useStyle() {
  const [st, set] = useState("v2");
  useEffect(() => {
    set(getStyle());
    const on = () => set(getStyle());
    window.addEventListener(SEVT, on);
    return () => window.removeEventListener(SEVT, on);
  }, []);
  return [st, setStyle];
}
