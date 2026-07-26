"use client";

/**
 * /guida — La guida agli strumenti, per il tuo ruolo.
 *
 * Rende il "funnel degli strumenti" (cfr src/lib/role-funnels.js) calibrato sul
 * ruolo dell'utente. Chi ha più scope vede più percorsi (tab), preselezionato
 * quello primario. Progressive disclosure: un operatore vede solo il suo loop.
 *
 * Il ruolo lato client (via /api/whoami) serve SOLO a mostrare il percorso
 * giusto — non è una difesa: ogni strumento gata da sé lato API.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { Compass } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, PillTab } from "@/components/cp-style";
import { selectFunnels, getFunnel } from "@/lib/role-funnels";
import RoleFunnelGuide from "@/components/RoleFunnelGuide";
import RoleFunnelChecklist from "@/components/RoleFunnelChecklist";

export default function GuidaPage() {
  const { user, isLoaded } = useUser();
  const swrKey = isLoaded && user ? "/api/whoami" : null;
  const { data: whoami } = useSWR(swrKey);

  const { visibleKeys, primaryKey } = useMemo(
    () => selectFunnels(whoami || {}),
    [whoami]
  );

  const [active, setActive] = useState(null);
  // La chiave attiva: quella scelta dall'utente se ancora visibile, altrimenti il primario.
  const activeKey = active && visibleKeys.includes(active) ? active : primaryKey;
  const funnel = getFunnel(activeKey);

  // Il percorso operatore è una CHECKLIST agganciata al proprio progresso reale
  // (learn-by-doing + misura); gli altri ruoli restano read-only.
  const { data: act } = useSWR(activeKey === "operator" ? "/api/me/activation" : null);
  const operatorChecklist = activeKey === "operator" && !(act && act.linked === false);

  const loading = !isLoaded || (swrKey && !whoami);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 28px 64px 28px" }}>
      <PageHeader
        section="Onboarding"
        title="La guida agli strumenti"
        subtitle="Ogni ruolo ha un percorso di strumenti nella console. Qui è reso esplicito: cosa apri, in che ordine, e perché. Non si impara dove sono i bottoni — si impara come si ragiona in HOC Pro."
      />

      {loading ? (
        <div style={{ color: CP.textMuted, fontSize: 14, fontFamily: FONTS.body, padding: "40px 0" }}>
          Carico il tuo percorso…
        </div>
      ) : (
        <>
          {/* Tab per ruolo (solo se più di uno visibile) */}
          {visibleKeys.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
              {visibleKeys.map((k) => {
                const f = getFunnel(k);
                if (!f) return null;
                return (
                  <PillTab key={k} active={activeKey === k} onClick={() => setActive(k)}>
                    {f.label}
                  </PillTab>
                );
              })}
            </div>
          )}

          {/* Nota quando l'utente sta guardando un percorso non suo primario */}
          {visibleKeys.length > 1 && activeKey !== primaryKey && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 18, padding: "8px 12px",
                background: CP.accentSoft, borderRadius: 8,
                fontSize: 12.5, color: CP.accentSoftText, fontFamily: FONTS.body,
              }}
            >
              <Compass size={14} aria-hidden="true" />
              Stai guardando il percorso di un altro ruolo — utile per capire cosa vede il resto del team.
            </div>
          )}

          {operatorChecklist ? (
            <RoleFunnelChecklist funnel={funnel} progress={act?.progress} focus={act?.focus} />
          ) : (
            <RoleFunnelGuide funnel={funnel} />
          )}
        </>
      )}
    </div>
  );
}
