"use client";

/**
 * /admin/activation — attivazione operatore (leading indicator).
 *
 * Mostra la coorte per la definizione "gap diagnosticato + allenato"
 * (src/lib/activation.js): funnel aha→attivato, activation rate, latenza.
 * SEED. Finché nessun operatore è onboardato la coorte è vuota: la pagina
 * dichiara cosa misura e resta in attesa di dati (onestà, non finta metrica).
 */
import useSWR from "swr";
import { Target, Signpost, TrendingUp, Timer } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel } from "@/components/cp-style";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || "Errore"), { status: r.status });
  return j;
};

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtLatency(ms) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}g`;
}

export default function ActivationPage() {
  const { data, error, isLoading } = useSWR("/api/admin/activation", fetcher, { revalidateOnFocus: false });

  const cfg = data?.config;
  const rate = data?.activationRate;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 28px 64px" }}>
      <PageHeader
        section="Onboarding operatore"
        title="Attivazione operatore"
        subtitle="Il primo risultato reale che predice se un operatore resterà e renderà: ha visto un gap vero sul suo lavoro e ha allenato proprio quello. È un leading indicator loggato in tempo reale — si valida in avanti contro il movimento reale del profilo-segnali, non si ottimizza da solo."
      />

      {error && error.status === 403 && (
        <CpCard><div style={{ color: CP.textMuted, fontSize: 14, fontFamily: FONTS.body }}>Serve un accesso admin (SEED) per questa vista.</div></CpCard>
      )}

      {!error && (
        <>
          {/* Definizione + soglie (lette dal config, mai hardcodate nel copy) */}
          <CpCard accent={CP.accent} style={{ marginBottom: 20 }}>
            <SectionLabel color={CP.accentSoftText}>La definizione (v1)</SectionLabel>
            <div style={{ fontSize: 14.5, color: CP.textPrimary, fontFamily: FONTS.body, lineHeight: 1.6, marginTop: 8 }}>
              Un operatore è <b>attivo</b> quando, entro <b>{cfg?.windowDays ?? "…"} giorni</b> dall'aver visto un gap reale nel suo profilo-segnali,
              completa <b>≥ {cfg?.minGapScenarios ?? "…"} scenari</b> Academy nelle categorie che allenano quel gap, con qualità <b>≥ {cfg?.minOverall ?? "…"}/100</b>.
            </div>
            <div style={{ fontSize: 12.5, color: CP.textMuted, fontFamily: FONTS.body, marginTop: 10, lineHeight: 1.55 }}>
              La soglia è un <b>placeholder</b> {cfg?.derived === false ? "(non ancora derivata dai dati)" : ""}: va derivata da una coorte reale col metodo magic-number, non fissata a priori.
              La <b>north-star</b> di validazione è il movimento reale dei segnali warehouse (il verdetto del gap che passa da «gap» a «ok») — quella si misura, non si insegue.
              {cfg?.version ? <span style={{ fontFamily: FONTS.mono, color: CP.mutedIcons }}> · {cfg.version}</span> : null}
            </div>
          </CpCard>

          {/* Stat */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Coorte strumentata" value={isLoading ? "…" : (data?.cohortSize ?? 0)} sub="operatori con ≥1 evento" />
            <StatCard label="Hanno visto il gap" value={isLoading ? "…" : (data?.ahaCount ?? 0)} sub="aha raggiunto" />
            <StatCard label="Attivati" value={isLoading ? "…" : (data?.activatedCount ?? 0)} sub="gap diagnosticato + allenato" accent={CP.accent} />
            <StatCard label="Activation rate" value={rate == null ? "—" : `${Math.round(rate * 100)}%`} sub={rate == null ? "in attesa di coorte" : "della coorte"} />
          </div>

          {/* Coorte o empty state onesto */}
          {(data?.cohortSize ?? 0) === 0 ? (
            <CpCard>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: CP.accentSoft, color: CP.accentSoftText, display: "grid", placeItems: "center", flex: "none" }}>
                  <Signpost size={18} aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.body }}>Nessun operatore onboardato ancora — la superficie è strumentata, in attesa di dati.</div>
                  <div style={{ fontSize: 13, color: CP.textMuted, fontFamily: FONTS.body, marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>
                    Gli eventi si registrano già dal vivo su quattro punti reali: apertura del profilo-segnali (l'aha), scenario completato (per il gap-match), acknowledge del coaching, apertura del turno.
                    Appena gli operatori entrano nell'app la coorte si popola qui — e dopo qualche settimana potremo <b>derivare la soglia dai dati</b> invece di indovinarla, e validare l'attivazione contro il miglioramento reale.
                  </div>
                </div>
              </div>
            </CpCard>
          ) : (
            <CpCard padding="0">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FONTS.body, minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CP.border}` }}>
                      {["Operatore", "Primo accesso", "Ha visto il gap", "Scenari-gap", "Attivato", "Latenza"].map((h, i) => (
                        <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "12px 16px", fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: CP.textMuted, fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.members || []).map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${CP.borderSoft}` }}>
                        <td style={{ padding: "11px 16px", color: CP.textPrimary }}>{m.employee || <span style={{ color: CP.mutedIcons }}>—</span>}</td>
                        <td style={{ padding: "11px 16px", color: CP.textSecondary }}>{fmtDate(m.firstSeen)}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", color: m.ahaReached ? CP.accentGreen : CP.textMuted }}>{m.ahaReached ? "sì" : "no"}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", fontFamily: FONTS.mono, color: CP.textPrimary }}>{m.gapScenariosInWindow}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 500, color: m.activated ? CP.accentGreen : CP.textMuted }}>{m.activated ? "attivo" : "—"}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtLatency(m.latencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CpCard>
          )}

          {/* Come si valida (forward) */}
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {[
              { icon: Target, t: "Misura l'attivazione, non il tour", d: "Non conta «ha finito la guida»: conta se ha connesso un gap vero a pratica su quel comportamento." },
              { icon: TrendingUp, t: "Si valida contro il campo", d: "Per gli attivati, il verdetto del gap si muove davvero nel profilo-segnali warehouse a 30-60gg? È il Kirkpatrick livello 3." },
              { icon: Timer, t: "La soglia si deriva", d: "7gg / 2 scenari è un placeholder: la combinazione che separa meglio il miglioramento reale si trova sui dati, non a priori." },
            ].map((x) => (
              <CpCard key={x.t}>
                <x.icon size={16} color={CP.textMuted} aria-hidden="true" />
                <div style={{ fontSize: 13.5, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.body, marginTop: 8 }}>{x.t}</div>
                <div style={{ fontSize: 12.5, color: CP.textMuted, fontFamily: FONTS.body, marginTop: 4, lineHeight: 1.5 }}>{x.d}</div>
              </CpCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
