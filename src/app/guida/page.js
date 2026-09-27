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
import { PageHead, FilterChip, Notice } from "@/components/ds";
import { selectFunnels, getFunnel } from "@/lib/role-funnels";
import RoleFunnelGuide from "@/components/RoleFunnelGuide";
import RoleFunnelChecklist from "@/components/RoleFunnelChecklist";

export default function GuidaPage() {
  const { user, isLoaded } = useUser();
  const swrKey = isLoaded && user ? "/api/whoami" : null;
  const { data: whoami, error: whoamiError } = useSWR(swrKey);

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

  const loading = !isLoaded || (swrKey && !whoami && !whoamiError);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Onboarding" }]}
        title="La guida agli strumenti"
        subtitle="Il percorso del tuo ruolo dentro HOC Pro: cosa apri, in che ordine e perché. Non serve imparare dove sono i bottoni, ma come si ragiona qui dentro."
      />

      {loading ? (
        <div style={{ color: CP.textMuted, fontSize: 14, padding: "40px 0" }}>
          Carico il tuo percorso…
        </div>
      ) : (
        <>
          {whoamiError && (
            <Notice>Non riesco a leggere il tuo ruolo in questo momento: ti mostro il percorso di base. Ricarica la pagina tra poco per vedere quello giusto.</Notice>
          )}

          {/* Tab per ruolo (solo se più di uno visibile) */}
          {visibleKeys.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {visibleKeys.map((k) => {
                const f = getFunnel(k);
                if (!f) return null;
                return (
                  <FilterChip key={k} label={f.label} active={activeKey === k} onClick={() => setActive(k)} />
                );
              })}
            </div>
          )}

          {/* Nota quando l'utente sta guardando un percorso non suo primario */}
          {visibleKeys.length > 1 && activeKey !== primaryKey && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 18, padding: "10px 14px",
                background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10,
                fontSize: 13, color: CP.textSecondary, fontFamily: FONTS.body,
              }}
            >
              <Compass size={14} color={CP.textMuted} aria-hidden="true" style={{ flexShrink: 0 }} />
              Stai guardando il percorso di un altro ruolo: serve a capire cosa vede il resto del team.
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
