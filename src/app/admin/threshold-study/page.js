"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Ruler } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";
import HowToRead from "@/components/HowToRead";

/**
 * /admin/threshold-study — Studio calibrazione soglie per il modello a bande.
 * Per ogni banda di fatturato: creator assegnati, distribuzione venduto/turno
 * per classe cosellers, soglie suggerite (mid = P50, top = P77 → ~20-25% dei
 * turni sopra). SOLO soglie: le percentuali restano quelle di ogni creator.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const fmt$ = (n) => n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
const CLASS_LABEL = { 1: "Solo (1×)", 2: "Coppia (2×)", 3: "Triplo (3×)", 4: "4×" };

export default function ThresholdStudyPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Studio soglie</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Studio soglie — modello a bande"
        subtitle="Per ogni banda di fatturato: distribuzione reale del venduto per turno per classe cosellers e soglie suggerite (mid = mediana, top = P77 → 20-25% dei turni sopra, target board). Solo soglie: le percentuali restano quelle correnti di ogni creator."
      />

      <CompNav />

      <HowToRead items={[
        "Ogni creator viene messa in una banda in base a quanto fattura al mese (banda 50K = creator che fanno circa 40-62mila dollari).",
        "Per ogni banda guardiamo TUTTI i turni reali e quanto si è venduto in ciascuno. Da lì escono le soglie giuste.",
        "Mediana = metà dei turni vende meno di quel numero. È la soglia naturale dello scaglione intermedio: metà dei turni la supera.",
        "Soglia top suggerita = il valore che solo il 20-25% dei turni supera. Difficile il giusto: si suda, ma si vede raggiungibile.",
        "IL numero da controllare: la colonna '% turni sopra top'. Verde = soglia calibrata bene. Ambra = da aggiustare.",
        "Qui si parla SOLO di soglie in dollari. Le percentuali (10/12/15…) di ogni creator non si toccano.",
      ]} />

      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mese di studio</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 160, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginTop: 16 }} />}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {data && (
        <>
          {data.data_quality?.caveat && (
            <CpCard accent="#F59E0B" padding="12px 16px" style={{ marginBottom: 18 }}>
              <div style={{ color: "#F59E0B", fontSize: 12 }}>
                ⚠ {data.data_quality.caveat} ({data.data_quality.mono_shifts_with_profile}/{data.data_quality.mono_shifts_total} turni mono con profilo)
              </div>
            </CpCard>
          )}

          {data.bands.map((b) => (
            <div key={b.band} style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 500 }}>Banda {b.band}</span>
                <span style={{ fontSize: 11, color: CP.textMuted }}>{b.range} · {b.creators.length} creator:</span>
                <span style={{ fontSize: 11, color: CP.textSecondary }}>
                  {b.creators.map((c) => `${c.alias} (${fmt$(c.sales)})`).join(" · ")}
                </span>
              </div>
              {/* Verdetto in chiaro: la frase che un non-analista legge e ha finito */}
              {b.classes.some((c) => c.suggested_mid != null) && (
                <div style={{ padding: "9px 14px", marginBottom: 8, background: CP.accentSoft + "55", border: `1px solid ${CP.accent}44`, borderRadius: 8, fontSize: 12.5, color: CP.textPrimary }}>
                  Il dato dice:{" "}
                  {b.classes.filter((c) => c.suggested_mid != null).map((c, i, arr) => (
                    <span key={c.cls}>
                      <b>{(CLASS_LABEL[c.cls] || `${c.cls}×`).split(" ")[0]}</b>
                      {" "}→ scaglione intermedio da <b style={{ color: CP.accentSoftText }}>{fmt$(c.suggested_mid)}</b>, top da <b style={{ color: CP.accentSoftText }}>{fmt$(c.suggested_top)}</b>
                      {c.shifts < 20 ? " (campione piccolo, prendere con cautela)" : ""}
                      {i < arr.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
              <CpCard padding="0" style={{ overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: CP.surfaceAlt, borderBottom: `1px solid ${CP.border}` }}>
                      <th style={th}>Classe</th>
                      <th style={{ ...th, textAlign: "right" }} title="Quanti turni mono-creator del mese stanno dietro a questi numeri">Turni</th>
                      <th style={{ ...th, textAlign: "right" }} title="Il 25% dei turni vende meno di questo valore">P25</th>
                      <th style={{ ...th, textAlign: "right" }} title="Metà dei turni vende meno di questo valore, metà di più">Mediana</th>
                      <th style={{ ...th, textAlign: "right" }} title="Il 75% dei turni vende meno di questo valore">P75</th>
                      <th style={{ ...th, textAlign: "right" }} title="L'80% dei turni vende meno di questo valore">P80</th>
                      <th style={{ ...th, textAlign: "right", color: CP.accent }} title="Proposta per lo scaglione intermedio: la mediana arrotondata a $25 — metà dei turni la supera">Soglia mid sugg.</th>
                      <th style={{ ...th, textAlign: "right", color: CP.accent }} title="Proposta per lo scaglione top: il valore che solo il 20-25% dei turni supera, arrotondato a $25">Soglia top sugg.</th>
                      <th style={{ ...th, textAlign: "right" }} title="Verifica: quota di turni che supererebbe la soglia top suggerita. Verde = dentro il target 20-25%">% turni sopra top</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.classes.map((c) => {
                      const lowSample = c.shifts < 20;
                      return (
                        <tr key={c.cls} style={{ borderBottom: `1px solid ${CP.borderSoft}`, opacity: lowSample ? 0.55 : 1 }}>
                          <td style={{ ...td, fontWeight: 500 }}>
                            {CLASS_LABEL[c.cls] || `${c.cls}×`}
                            {lowSample && <span style={{ fontSize: 10, color: "#F59E0B", marginLeft: 6 }}>campione piccolo</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{c.shifts}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textMuted }}>{fmt$(c.p25)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(c.p50)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(c.p75)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textMuted }}>{fmt$(c.p80)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 500, color: CP.accent }}>{fmt$(c.suggested_mid)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 500, color: CP.accent }}>{fmt$(c.suggested_top)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: c.top_share >= 18 && c.top_share <= 28 ? CP.accentGreen : "#F59E0B" }}>
                            {c.top_share != null ? `${c.top_share}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CpCard>
            </div>
          ))}

          {/* Validazione rapporto coppia/solo */}
          {data.class_ratios?.length > 0 && (
            <CpCard padding="16px 20px" style={{ marginBottom: 18 }}>
              <SectionLabel style={{ display: "block", marginBottom: 8 }}>Validazione empirica — rapporto soglie tra classi (regola attesa: 2×≈60-65%, 3×≈40-45% della solo)</SectionLabel>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {data.class_ratios.map((r, i) => (
                  <span key={i} style={{ padding: "5px 12px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 7, fontSize: 12, fontFamily: FONTS.mono }}>
                    {r.band} · {r.pair}: <b style={{ color: CP.accent }}>{r.ratio}%</b>
                  </span>
                ))}
              </div>
            </CpCard>
          )}

          {data.micro_creators?.length > 0 && (
            <div style={{ fontSize: 11, color: CP.textMuted }}>
              Fuori bande (sotto $15k): {data.micro_creators.map((c) => `${c.alias} (${fmt$(c.sales)})`).join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, color: CP.textMuted, fontWeight: 500, marginBottom: 5, fontFamily: FONTS.body };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 500, color: CP.textMuted, whiteSpace: "nowrap" };
const td = { padding: "8px 12px", verticalAlign: "middle" };
