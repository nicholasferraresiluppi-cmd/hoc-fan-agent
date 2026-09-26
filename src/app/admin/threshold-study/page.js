"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import CompNav from "@/components/CompNav";
import HowToRead from "@/components/HowToRead";
import HoverTip from "@/components/HoverTip";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Disclosure, Notice, card, NUM } from "@/components/ds";

/**
 * /admin/threshold-study — Studio calibrazione soglie per il modello a bande.
 * Per ogni banda di fatturato: creator assegnati, distribuzione venduto/turno
 * per classe cosellers, soglie suggerite (mid = P50, top = P77 → ~20-25% dei
 * turni sopra). SOLO soglie: le percentuali restano quelle di ogni creator.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * - numero principale: quante soglie top cadono nel target 20-25% (è la
 *   domanda della pagina: "le soglie proposte sono calibrate?");
 * - avviso "1 solo mese post-Fase B" riscritto in parole semplici;
 * - un solo accento: prima riquadri, numeri e linee erano tutti viola;
 * - "fuori target" detto a parole, non solo col colore;
 * - verifica coppia/solo in una sezione su richiesta.
 * API e calcoli invariati.
 */

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const CLASS_LABEL = { 1: "Da solo", 2: "In coppia", 3: "In tre", 4: "In quattro" };
const PAIR_LABEL = { "2x/1x": "coppia rispetto al solo", "3x/1x": "in tre rispetto al solo" };
const MIN_SAMPLE = 20; // sotto: campione piccolo
const inTarget = (share) => share != null && share >= 18 && share <= 28;

export default function ThresholdStudyPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRatios, setShowRatios] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`/api/admin/threshold-study?period_id=${periodId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setData(j);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodId]);

  const summary = useMemo(() => {
    if (!data?.bands) return null;
    const classes = data.bands.flatMap((b) => b.classes.map((c) => ({ ...c, band: b.band })));
    const reliable = classes.filter((c) => c.shifts >= MIN_SAMPLE && c.suggested_top != null);
    const ok = reliable.filter((c) => inTarget(c.top_share));
    return {
      reliable: reliable.length,
      ok: ok.length,
      off: reliable.filter((c) => !inTarget(c.top_share)).map((c) => `${c.band} ${(CLASS_LABEL[c.cls] || `in ${c.cls}`).toLowerCase()}`),
      small: classes.filter((c) => c.shifts < MIN_SAMPLE).length,
      shifts: classes.reduce((s, c) => s + (c.shifts || 0), 0),
      creators: data.bands.reduce((s, b) => s + b.creators.length, 0),
    };
  }, [data]);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Studio soglie" }]}
        title="Studio soglie"
        subtitle="Per decidere le soglie in dollari degli scaglioni, banda per banda: dove cadono i turni reali (le barre) e le soglie proposte (le linee). Le percentuali di ogni creator non si toccano."
        actions={<>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese di studio" style={{ ...input, minWidth: 170, cursor: "pointer" }}>
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, alignSelf: "center" }} />}
        </>}
      />

      <CompNav />

      <HowToRead items={[
        "Ogni creator finisce in una banda in base a quanto fattura al mese (banda 50K = creator intorno ai 40-62mila dollari).",
        "Le barre mostrano i turni veri del mese: più una barra è alta, più turni hanno venduto quella cifra.",
        "Le due linee verticali sono le soglie proposte: dove tagliano le barre, vedi a occhio quanti turni stanno sopra e quanti sotto.",
        "La soglia intermedia è messa dove la supera circa metà dei turni. La soglia top dove la supera solo il 20-25%: difficile il giusto — si suda, ma si vede raggiungibile.",
        "Il numero da controllare: la percentuale sotto la soglia top. Verde = calibrata bene. “Fuori target” = da aggiustare a mano.",
        "Qui si parla SOLO di soglie in dollari. Le percentuali (10/12/15…) di ogni creator non si toccano.",
      ]} />

      {error && <Notice danger>Non riesco a caricare lo studio: {error}</Notice>}
      {loading && !data && <div style={{ ...card, padding: "18px 20px", color: CP.textSecondary, fontSize: 14 }}>Calcolo la distribuzione dei turni per banda…</div>}
      {data && data.bands?.length === 0 && (
        <Notice>Nessuna creator con abbastanza venduto nel mese per fare lo studio. Se il mese è appena chiuso, controlla che i compensi siano stati scaricati in <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync e controllo CP</Link>.</Notice>
      )}

      {data && data.bands?.length > 0 && (
        <>
          {summary && (
            <HeroMetric
              label="Soglie top nel target"
              value={`${fmtInt(summary.ok)} su ${fmtInt(summary.reliable)}`}
              compare="target: la soglia top la supera tra il 20% e il 25% dei turni (tolleranza 18-28%)"
              hint={summary.off.length ? `Da aggiustare a mano: ${summary.off.join(", ")}.` : "Tutte le soglie top con abbastanza turni sono calibrate."}
            >
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Metric label="Bande" value={fmtInt(data.bands.length)} />
                <Metric label="Creator studiate" value={fmtInt(summary.creators)} />
                <Metric label="Turni studiati" value={fmtInt(summary.shifts)} />
                {summary.small > 0 && <Metric label="Campioni piccoli" value={fmtInt(summary.small)} note={`meno di ${MIN_SAMPLE} turni: fuori dal conteggio`} />}
              </div>
            </HeroMetric>
          )}

          {data.data_quality?.caveat && (
            <Notice>
              Lo studio usa un solo mese. La regola è fissare le soglie su 2-3 mesi: prima di decidere quelle definitive, scarica anche i mesi precedenti da <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync e controllo CP</Link>.
              {data.data_quality.mono_shifts_total != null && <> Turni da solo con profilo di pagamento: <span style={NUM}>{fmtInt(data.data_quality.mono_shifts_with_profile)} su {fmtInt(data.data_quality.mono_shifts_total)}</span>.</>}
            </Notice>
          )}

          {data.bands.map((b) => (
            <section key={b.band} style={{ marginBottom: 24 }}>
              <SectionTitle aside={`${b.range} · ${b.creators.length} creator`}>Banda {b.band}</SectionTitle>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: -4, marginBottom: 8, lineHeight: 1.5 }}>
                {b.creators.map((c) => `${c.alias} (${fmt$(c.sales)})`).join(" · ")}
              </div>
              {/* Verdetto in chiaro: la frase che un non-analista legge e ha finito */}
              {b.classes.some((c) => c.suggested_mid != null) && (
                <div style={{ fontSize: 14, color: CP.textSecondary, marginBottom: 8, lineHeight: 1.5 }}>
                  Il dato dice:{" "}
                  {b.classes.filter((c) => c.suggested_mid != null).map((c, i, arr) => (
                    <span key={c.cls}>
                      <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{(CLASS_LABEL[c.cls] || `In ${c.cls}`).toLowerCase()}</span>
                      {" "}→ scaglione intermedio da <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{fmt$(c.suggested_mid)}</span>, top da <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{fmt$(c.suggested_top)}</span>
                      {c.shifts < MIN_SAMPLE ? " (campione piccolo, prendere con cautela)" : ""}
                      {i < arr.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ ...card }}>
                {b.classes.map((c, ci) => {
                  const lowSample = c.shifts < MIN_SAMPLE;
                  const ok = inTarget(c.top_share);
                  return (
                    <div key={c.cls} style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 16px", borderTop: ci ? `1px solid ${CP.borderSoft}` : "none", opacity: lowSample ? 0.6 : 1, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 104 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{CLASS_LABEL[c.cls] || `In ${c.cls}`}</div>
                        <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{fmtInt(c.shifts)} turni{lowSample ? " · campione piccolo" : ""}</div>
                      </div>
                      <Histogram buckets={c.histogram} bucketWidth={c.bucket_width} mid={c.suggested_mid} top={c.suggested_top} totalShifts={c.shifts} />
                      <div style={{ display: "flex", gap: 26 }}>
                        <div>
                          <div style={lbl}>Soglia intermedia</div>
                          <div style={{ fontSize: 20, fontWeight: 500, ...NUM }}>{fmt$(c.suggested_mid)}</div>
                          <div style={{ fontSize: 12, color: CP.textMuted }}>{c.mid_share != null ? `la supera il ${c.mid_share}% dei turni` : "—"}</div>
                        </div>
                        <div>
                          <div style={lbl}>Soglia top</div>
                          <div style={{ fontSize: 20, fontWeight: 500, ...NUM }}>{fmt$(c.suggested_top)}</div>
                          <div style={{ fontSize: 12, color: c.top_share == null ? CP.textMuted : ok ? CP.accentGreen : CP.accentRed }}>
                            {c.top_share != null ? `la supera il ${c.top_share}%${ok ? "" : " · fuori target"}` : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {data.class_ratios?.length > 0 && (
            <Disclosure open={showRatios} onToggle={() => setShowRatios(!showRatios)} title="Verifica: soglie in coppia e in tre rispetto al solo"
              summary="Regola attesa: in coppia ≈ 60-65% della soglia da solo, in tre ≈ 40-45%">
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>
                Quanto vale la soglia alta di chi lavora in coppia o in tre rispetto a chi lavora da solo, nella stessa banda (calcolata sui turni veri, solo dove entrambi hanno almeno 10 turni). Regola attesa: in coppia ≈ 60-65%, in tre ≈ 40-45%.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.class_ratios.map((r, i) => (
                  <span key={i} style={{ padding: "5px 12px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, ...NUM }}>
                    Banda {r.band} · {PAIR_LABEL[r.pair] || r.pair}: <span style={{ fontWeight: 500 }}>{r.ratio}%</span>
                  </span>
                ))}
              </div>
            </Disclosure>
          )}

          {data.micro_creators?.length > 0 && (
            <div style={{ fontSize: 12, color: CP.textMuted }}>
              Fuori dalle bande (sotto $15k al mese): {data.micro_creators.map((c) => `${c.alias} (${fmt$(c.sales)})`).join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}


/**
 * Istogramma della distribuzione venduto/turno: barre = quanti turni hanno
 * venduto quella cifra; linee verticali = soglie proposte. Si VEDE dove
 * taglia la soglia, senza nominare percentili.
 */
function Histogram({ buckets = [], bucketWidth = 25, mid, top, totalShifts = 0 }) {
  if (buckets.length === 0) return <div style={{ flex: 1 }} />;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const scale = buckets.length * bucketWidth;
  const pos = (v) => `${Math.min(98.5, (v / scale) * 100)}%`;
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 260, height: 58 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 44, marginTop: 8 }}>
        {buckets.map((bk, i) => {
          const share = totalShifts > 0 ? Math.round((bk.count / totalShifts) * 100) : 0;
          return (
            <HoverTip
              key={i}
              tip={`Fascia $${bk.from.toLocaleString("it-IT")}–$${bk.to.toLocaleString("it-IT")}\n${bk.count} turni${bk.count > 0 ? ` (${share}% del totale)` : ""}`}
              style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}
            >
              <div style={{ width: "100%", height: Math.max(2, Math.round((bk.count / maxCount) * 44)), background: CP.accentDim, borderRadius: 2 }} />
            </HoverTip>
          );
        })}
      </div>
      {mid != null && (
        <HoverTip tip={`Soglia intermedia proposta: $${mid.toLocaleString("it-IT")}`} style={{ position: "absolute", top: 0, bottom: 4, left: pos(mid), width: 8, marginLeft: -3, display: "block", cursor: "default" }}>
          <span style={{ display: "block", width: 2, height: "100%", margin: "0 auto", background: CP.textSecondary, borderRadius: 1 }} />
        </HoverTip>
      )}
      {top != null && (
        <HoverTip tip={`Soglia top proposta: $${top.toLocaleString("it-IT")}`} style={{ position: "absolute", top: 0, bottom: 4, left: pos(top), width: 8, marginLeft: -3, display: "block", cursor: "default" }}>
          <span style={{ display: "block", width: 2, height: "100%", margin: "0 auto", background: CP.accent, borderRadius: 1 }} />
        </HoverTip>
      )}
      <div style={{ position: "absolute", bottom: -6, left: 0, fontSize: 11, color: CP.textMuted }}>$0</div>
      <div style={{ position: "absolute", bottom: -6, right: 0, fontSize: 11, color: CP.textMuted, ...NUM }}>${scale.toLocaleString("it-IT")}</div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: CP.textMuted, fontWeight: 400, marginBottom: 4 };
const input = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none" };
