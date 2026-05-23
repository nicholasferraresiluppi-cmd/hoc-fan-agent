"use client";

/**
 * AppShell — TEMPORARILY DISABLED pass-through.
 *
 * Era: wrapper layout globale con sidebar fissa CP-style.
 * Stato: la sidebar causa un client-side exception in produzione (sotto
 * investigazione). Per non rompere TUTTA l'app, AppShell ritorna i children
 * direttamente, ripristinando il comportamento pre-PR #20.
 *
 * Riabilita la sidebar solo dopo aver capito + fixato la causa.
 */
export default function AppShell({ children }) {
  return <>{children}</>;
}
