"use client";

import useSWR from "swr";
import { HelpCircle, CheckCircle2, Circle, Lock } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/percorso — "Il mio percorso" (scope own, docs/VISIBILITY_POLICY.md).
 * La componente performance dei gate della career ladder, spiegata mese per mese.
 * Ladder pubblica per principio: i criteri sono visibili dal giorno uno.
 * 25/09/2026: fasce dello score mestiere SOSPESE (soglie fisse tarate su gen-mag:
 * "Critical" anche per chi è al 68° percentile o tra i primi per vendite).
 * Si mostrano i numeri; il conteggio dei mesi utili torna con le soglie nuove.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: CP.accentRed, Weak: "#d9a44a", Average: "#cba55f",
  Good: CP.accentGreen, Strong: CP.accentBlue, Elite: CP.accent,
};

export default function MyLadderPage() {
  const { data, isLoading } = useSWR("/api/me/ladder", fetcher, { revalidateOnFocus: false });

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Il mio percorso"
        subtitle="La career ladder è pubblica: qui vedi i criteri di passaggio e a che punto sei sulla componente performance. Niente 'fai i numeri e vedremo' — i requisiti sono scritti."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && !data.linked && !data.error && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>Account non ancora collegato a un profilo operatore.</p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
          </div>
        </CpCard>
      )}

      {data?.linked && data.reason === "no_history" && (
        <CpCard><p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>Nessuno storico score disponibile ancora — serve almeno un mese importato in cui hai lavorato.</p></CpCard>
      )}

      {data?.linked && Array.isArray(data.gates) && data.gates.length > 0 && (
        <>
          <div style={{ padding: "12px 14px", marginBottom: 16, borderRadius: 10, border: `1px solid ${CP.border}`, background: CP.surface, fontSize: 13, color: CP.textSecondary, lineHeight: 1.55 }}>
            Le fasce dello score mestiere (Critical, Weak, Average…) sono in ricalibrazione sui dati di quest&apos;anno: finché non escono le soglie nuove il conteggio dei &quot;mesi utili&quot; è sospeso e qui vedi i tuoi numeri mese per mese. I requisiti restano quelli scritti.
          </div>
          {data.current && (
            <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px", marginBottom: 18, display: "inline-block" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Ultimo mese valutato · {data.current.period_id}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 600, color: CP.textPrimary }}>{data.current.score != null ? Math.round(data.current.score) : "—"}</span>
                <span style={{ fontSize: 13, color: CP.textMuted }}>score mestiere</span>
              </div>
            </div>
          )}

          {data.gates.map((g) => {
            const perf = g.performance || {};
            return (
              <CpCard key={g.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 600, color: CP.textPrimary, margin: 0 }}>{g.label}</h3>
                  <span style={{ fontSize: 12, color: CP.textMuted }}>conteggio sospeso (soglie in ricalibrazione)</span>
                </div>
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px" }}>
                  Requisito performance: <b style={{ color: CP.textPrimary }}>{perf.requirement}</b> · Time floor: {g.time_floor}
                </p>

                {/* Mesi della finestra */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {(perf.months || []).map((m) => (
                    <div key={m.period_id} style={{ textAlign: "center" }}>
                      <div style={{ width: 54, padding: "6px 0", borderRadius: 8, background: CP.surfaceAlt, border: `1px solid ${CP.border}` }}>
                        <span style={{ fontSize: 12.5, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{m.score != null ? Math.round(m.score) : "—"}</span>
                      </div>
                      <span style={{ fontSize: 10, color: CP.textMuted }}>{String(m.period_id).slice(5)}</span>
                    </div>
                  ))}
                </div>

                {/* Altri requisiti */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {(g.other_requirements || []).map((r, i) => {
                    const met = r.status === "met";
                    const fail = r.status === "compliance_fail";
                    const notMet = r.status === "not_met";
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: fail ? CP.accentRed : met ? CP.textSecondary : CP.textMuted, flexWrap: "wrap" }}>
                        {met ? <CheckCircle2 size={12} color={CP.accentGreen} />
                          : fail ? <Lock size={12} color={CP.accentRed} />
                          : r.status === "not_tracked" ? <Lock size={12} color={CP.mutedIcons} />
                          : <Circle size={12} color={notMet ? CP.textMuted : CP.mutedIcons} />}
                        {r.label}
                        <span style={{ fontSize: 11, color: fail ? CP.accentRed : CP.textMuted }}>
                          {r.status === "not_tracked" && "· tracciamento in arrivo"}
                          {(met || notMet || fail) && r.detail ? `· ${r.detail}` : ""}
                          {fail && " · congela le promozioni in corso (§8.1)"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CpCard>
            );
          })}

          <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 12, lineHeight: 1.6 }}>{data.note}</p>
        </>
      )}
    </div>
  );
}
