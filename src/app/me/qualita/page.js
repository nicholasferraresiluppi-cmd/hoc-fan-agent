"use client";

import useSWR from "swr";
import Link from "next/link";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, SectionTitle, Notice, card, NUM } from "@/components/ds";
import { academyForQaDim, VOCAB_GAPS } from "@/lib/skill-vocabulary";

/**
 * /me/qualita — "La mia qualità" (scope own, docs/VISIBILITY_POLICY.md).
 * Gli esiti QA propri con rubrica, note del reviewer (anonimo: rotazione §8.1)
 * e lo stato che alimenta i gate. Mai visibili tra pari.
 * 26/09/2026: portata sul design system; regola della rubrica spiegata a parole.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const monthLabel = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? `${MESI[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : pid);
const fmtAvg = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const chip = { fontSize: 12, color: CP.textSecondary, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, borderRadius: 999, padding: "3px 10px" };

export default function MyQaPage() {
  const { data, error, isLoading } = useSWR("/api/me/qa", fetcher, { revalidateOnFocus: false });
  const dims = data?.dimensions || [];
  const gs = data?.gate_status;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "La mia qualità" }]}
        title="La mia qualità"
        subtitle="Le review sulle tue conversazioni: cosa ha funzionato, cosa migliorare e se conta per il tuo percorso. Chi valuta ruota e non è mai il tuo team lead da solo. Le note sono per te."
      />

      {isLoading && <div style={{ ...card, padding: 16, color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Non riesco a caricare le tue review. Ricarica la pagina tra qualche minuto.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.linked && !data.error && (
        <Notice>Account non ancora collegato a un profilo operatore. Chiedi a un admin di collegare la tua email al tuo nome operatore.</Notice>
      )}

      {data?.linked && (
        <>
          {gs ? (
            <>
              <HeroMetric
                label={`Controllo qualità · ultimi ${gs.window_months} mesi`}
                value={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 30 }}>
                    {gs.frozen_by_compliance ? <ShieldAlert size={26} color={CP.accentRed} /> : gs.pass ? <CheckCircle2 size={26} color={CP.accentGreen} /> : <XCircle size={26} color={CP.textMuted} />}
                    {gs.frozen_by_compliance ? "Compliance da risolvere" : gs.pass ? "QA pass" : "QA non superata"}
                  </span>
                }
                compare={<span style={NUM}>{gs.passes}/{gs.reviews} review pass</span>}
              />
              {gs.frozen_by_compliance && (
                <Notice danger>Un fail su compliance congela le promozioni in corso (§8.1): parlane subito col tuo sales manager.</Notice>
              )}
            </>
          ) : (
            <Notice>Nessuna review negli ultimi 3 mesi — appena arriva la prima la vedi qui, con le note.</Notice>
          )}

          <p style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.6, margin: "4px 0 22px", maxWidth: 760 }}>
            Come funziona: ogni review dà un voto da 1 a 4 su 5 aspetti della conversazione. La review è superata (pass) se la media è almeno 3 e non c&apos;è nessun problema di compliance.
          </p>

          {dims.length > 0 && (
            <section style={{ marginBottom: 22 }}>
              <SectionTitle>Come si allena</SectionTitle>
              <div style={{ ...card, padding: "16px 18px" }}>
                <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 12px", lineHeight: 1.6 }}>
                  Ogni dimensione su cui ti valutano ha un allenamento diretto nell&apos;<Link href="/" style={{ color: CP.accentSoftText }}>Academy</Link>: è la stessa competenza, con lo stesso nome.
                </p>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {dims.map((d) => {
                    const map = academyForQaDim(d.key);
                    return (
                      <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                        <span style={{ fontSize: 14, color: CP.textPrimary, flex: "0 1 210px", minWidth: 160 }}>{d.label}</span>
                        <span style={{ color: CP.textMuted }}>→</span>
                        {map && map.sim.length ? (
                          map.sim.map((s) => <span key={s.key} style={chip}>{s.label}</span>)
                        ) : (
                          <span style={{ fontSize: 13, color: CP.textMuted }}>
                            {d.key === "compliance" ? "non ancora allenabile in Academy" : "—"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {VOCAB_GAPS.academyBlind.includes("compliance") && (
                  <div style={{ display: "flex", gap: 8, marginTop: 6, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
                    <ShieldAlert size={16} color={CP.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13, color: CP.textMuted, margin: 0, lineHeight: 1.55 }}>
                      La <span style={{ color: CP.textSecondary, fontWeight: 500 }}>compliance</span> vuol dire rispettare le regole della chat. Conta tantissimo per passare di livello: una sola violazione pesa più di tanti messaggi ben fatti. Per ora si misura solo sul lavoro vero (in Academy non c&apos;è ancora un esercizio dedicato).
                    </p>
                  </div>
                )}
                {VOCAB_GAPS.academyBlind.includes("compliance") && (
                  // Esempio chiesto da Nicholas (26/09): solo regole che valgono per tutti
                  // perché vengono dalle regole di OnlyFans. Le regole complete
                  // dell'agenzia NON esistono ancora in app: tema aperto in /admin/roadmap
                  // ("Regole di compliance + allenamento"). Non inventarne qui.
                  <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: CP.bg, border: `1px solid ${CP.borderSoft}` }}>
                    <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, marginBottom: 6 }}>Qualche esempio (valgono sempre, sono regole di OnlyFans)</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
                      <li>Niente incontri dal vivo: non proporli e non accettarli, nemmeno per scherzo.</li>
                      <li>Niente contatti o pagamenti fuori da OnlyFans: numero di telefono, altri social, altri siti di pagamento.</li>
                      <li>Niente dati personali: né della creator né chiesti al fan (indirizzo, lavoro, documenti).</li>
                      <li>Nessun gioco di ruolo che riguardi minorenni o situazioni senza consenso, in nessuna forma.</li>
                      <li>Non promettere contenuti che la creator non ha o non farà.</li>
                    </ul>
                    <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Le regole complete dell&apos;agenzia arriveranno qui. Nel dubbio, prima di mandare chiedi al tuo team lead.</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {(data.reviews || []).length > 0 && (
            <section style={{ marginBottom: 14 }}>
              <SectionTitle aside="dalla più recente">Le mie review</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.reviews.map((r) => (
                  <div key={r.id} style={{ ...card, padding: "14px 16px", ...(r.compliance_fail ? { borderLeft: `3px solid ${CP.accentRed}` } : {}) }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <span style={{ fontSize: 14, color: CP.textPrimary }}>{monthLabel(r.period_id)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: r.compliance_fail ? CP.accentRed : r.pass ? CP.accentGreen : CP.textMuted, ...NUM }}>
                        media {fmtAvg(r.avg)} · {r.compliance_fail ? "fail compliance" : r.pass ? "pass" : "no pass"}
                      </span>
                      <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto", ...NUM }}>{r.created_at ? new Date(r.created_at).toLocaleDateString("it-IT") : ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: r.notes ? 10 : 0 }}>
                      {dims.map((d) => {
                        const v = r.scores?.[d.key];
                        return (
                          <span key={d.key} style={{ ...chip, color: v <= 1 ? CP.accentRed : CP.textSecondary }}>
                            {d.label.split(" ")[0]} <span style={{ fontWeight: 500, color: v <= 1 ? CP.accentRed : CP.textPrimary, ...NUM }}>{v}</span>
                          </span>
                        );
                      })}
                    </div>
                    {r.notes && <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.55 }}>{r.notes}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <p style={{ fontSize: 13, color: CP.textMuted, marginTop: 18, lineHeight: 1.6 }}>
            Non sei d&apos;accordo con una valutazione? <Link href="/me/contestazioni" style={{ color: CP.accentSoftText }}>Apri una contestazione</Link>.
          </p>
        </>
      )}
    </div>
  );
}
