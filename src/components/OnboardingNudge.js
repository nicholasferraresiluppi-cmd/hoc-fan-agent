"use client";

/**
 * OnboardingNudge — modale di PRIMO ACCESSO che presenta all'utente il suo
 * "funnel di strumenti" (cfr src/lib/role-funnels.js), calibrato sul ruolo.
 *
 * Comportamento:
 *   - Si mostra una sola volta per browser (localStorage hoc:guida:seen).
 *   - Mostra il funnel PRIMARIO dell'utente; da lì può aprire uno strumento
 *     (chiude e segna visto) o andare alla guida completa /guida.
 *   - Montata globalmente in AppShell → visibile su tutte le pagine app.
 *
 * È la superficie "percorso guidato al primo accesso"; /guida è la reference
 * persistente e riapribile. Stesso engine, stesso contenuto.
 *
 * Design: pattern modale come ScoreTutorialModal (fixed + backdrop + Esc),
 * token CP, pesi 400/500, sentence case.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { Compass, X, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { selectFunnels, getFunnel } from "@/lib/role-funnels";
import RoleFunnelGuide from "@/components/RoleFunnelGuide";
import RoleFunnelChecklist from "@/components/RoleFunnelChecklist";

const SEEN_KEY = "hoc:guida:seen:v1";

export default function OnboardingNudge() {
  const pathname = usePathname() || "";
  const { user, isLoaded } = useUser();
  const swrKey = isLoaded && user ? "/api/whoami" : null;
  const { data: whoami } = useSWR(swrKey);
  const primaryKey = whoami ? selectFunnels(whoami).primaryKey : null;
  // Progresso proprio per il checklist-launcher — SOLO se l'utente è operatore
  // (evita il resolveEmployeeForUser pesante per i non-operatori a ogni pagina).
  const { data: act } = useSWR(isLoaded && user && primaryKey === "operator" ? "/api/me/activation" : null);

  const [open, setOpen] = useState(false);
  const [checkedStorage, setCheckedStorage] = useState(false);

  // Legge lo stato "già visto" dal localStorage (solo client, post-mount).
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(SEEN_KEY);
      if (!seen) setOpen(true);
    } catch {
      /* localStorage non disponibile → non forziamo il nudge */
    }
    setCheckedStorage(true);
  }, []);

  function markSeen() {
    try {
      window.localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* no-op */
    }
    setOpen(false);
  }

  // Esc per chiudere.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") markSeen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Gate: aspetta storage + auth + whoami. Non mostrare sulla guida stessa.
  if (!checkedStorage || !open) return null;
  if (!isLoaded || !user || !whoami) return null;
  if (pathname === "/guida") return null;

  const funnel = getFunnel(primaryKey);
  if (!funnel) return null;

  return (
    <div
      onClick={markSeen}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: CP.bg,
          border: `1px solid ${CP.border}`,
          borderRadius: 18,
          width: "100%", maxWidth: 680, maxHeight: "92vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 12, padding: "20px 22px 16px 22px",
            borderBottom: `1px solid ${CP.border}`,
          }}
        >
          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: CP.accentSoft, color: CP.accentSoftText,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Compass size={18} aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: CP.textMuted }}>
                Benvenuto in HOC Pro
              </div>
              <h2 style={{ margin: "3px 0 0 0", fontSize: 19, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.25 }}>
                Il tuo percorso: {funnel.label.toLowerCase()}
              </h2>
            </div>
          </div>
          <button
            onClick={markSeen}
            aria-label="Chiudi"
            style={{
              background: "transparent", border: "none", color: CP.textMuted,
              cursor: "pointer", padding: 6, flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo: checklist per l'operatore (learn-by-doing), read-only per gli altri ruoli */}
        <div style={{ padding: "18px 22px", overflowY: "auto" }}>
          {primaryKey === "operator" && act?.linked ? (
            <RoleFunnelChecklist funnel={funnel} progress={act.progress} focus={act.focus} onNavigate={markSeen} />
          ) : (
            <RoleFunnelGuide funnel={funnel} onNavigate={markSeen} />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "14px 22px",
            borderTop: `1px solid ${CP.border}`,
          }}
        >
          <button
            onClick={markSeen}
            style={{
              background: "transparent", border: "none", color: CP.textMuted,
              fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, padding: 0,
            }}
          >
            Ho capito
          </button>
          <Link
            href="/guida"
            onClick={markSeen}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: CP.accent, color: CP.accentInk,
              padding: "8px 14px", borderRadius: 8,
              fontSize: 13, fontWeight: 500, textDecoration: "none", fontFamily: FONTS.body,
            }}
          >
            Vedi la guida completa
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
