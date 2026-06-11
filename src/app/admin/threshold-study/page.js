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
        subtitle="Per ogni banda di fatturato: dove cadono i turni reali (le barre) e le soglie proposte (le linee). La soglia top è messa nel punto che solo il 20-25% dei turni supera. Solo soglie in dollari: le percentuali di ogni creator non si toccano."
      />

      <CompNav />

      <HowToRead items={[
        "Ogni creator finisce in una banda in base a quanto fattura al mese (banda 50K = creator intorno ai 40-62mila dollari).",
        "Le barre mostrano i turni veri del mese: più una barra è alta, più turni hanno venduto quella cifra.",
        "Le due linee verticali sono le soglie proposte: dove tagliano le barre, vedi a occhio quanti turni stanno sopra e quanti sotto.",
        "La soglia intermedia è messa dove la supera circa metà dei turni. La soglia top dove la supera solo il 20-25%: difficile il giusto — si suda, ma si vede raggiungibile.",
        "IL numero da controllare: la percentuale accanto alla soglia top. Verde = calibrata bene. Ambra = da aggiustare a mano.",
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
                {b.classes.map((c, ci) => {
                  const lowSample = c.shifts < 20;
                  return (
                    <div key={c.cls} style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 18px", borderBottom: ci < b.classes.length - 1 ? `1px solid ${CP.borderSoft}` : "none", opacity: lowSample ? 0.6 : 1, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 104 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{CLASS_LABEL[c.cls] || `${c.cls}×`}</div>
                        <div style={{ fontSize: 11, color: CP.textMuted }}>{c.shifts} turni{lowSample ? " · campione piccolo" : ""}</div>
                      </div>
                      <Histogram buckets={c.histogram} bucketWidth={c.bucket_width} mid={c.suggested_mid} top={c.suggested_top} />
                      <div style={{ display: "flex", gap: 26 }}>
                        <div>
                          <div style={lbl}>Soglia intermedia</div>
                          <div style={{ fontSize: 19, fontWeight: 500, color: CP.accentSoftText, fontFamily: FONTS.mono }}>{fmt$(c.suggested_mid)}</div>
                          <div style={{ fontSize: 10.5, color: CP.textMuted }}>{c.mid_share != null ? `la supera il ${c.mid_share}% dei turni` : "—"}</div>
                        </div>
                        <div>
                          <div style={lbl}>Soglia top</div>
                          <div style={{ fontSize: 19, fontWeight: 500, color: CP.accent, fontFamily: FONTS.mono }}>{fmt$(c.suggested_top)}</div>
                          <div style={{ fontSize: 10.5, color: c.top_share >= 18 && c.top_share <= 28 ? CP.accentGreen : "#F59E0B" }}>
                            {c.top_share != null ? `la supera il ${c.top_share}% (target 20-25%)` : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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


/**
 * Istogramma della distribuzione venduto/turno: barre = quanti turni hanno
 * venduto quella cifra; linee verticali = soglie proposte. Si VEDE dove
 * taglia la soglia, senza nominare percentili.
 */
function Histogram({ buckets = [], bucketWidth = 25, mid, top }) {
  if (buckets.length === 0) return <div style={{ flex: 1 }} />;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const scale = buckets.length * bucketWidth;
  const pos = (v) => `${Math.min(98.5, (v / scale) * 100)}%`;
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 280, height: 58 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 44, marginTop: 8 }}>
        {buckets.map((bk, i) => (
          <div
            key={i}
            title={`$${bk.from}–$${bk.to}: ${bk.count} turni`}
            style={{ flex: 1, height: Math.max(2, Math.round((bk.count / maxCount) * 44)), background: CP.accentDim, borderRadius: 2 }}
          />
        ))}
      </div>
      {mid != null && (
        <div title={`Soglia intermedia: $${mid}`} style={{ position: "absolute", top: 0, bottom: 4, left: pos(mid), width: 2, background: CP.accentSoftText, opacity: 0.75, borderRadius: 1 }} />
      )}
      {top != null && (
        <div title={`Soglia top: $${top}`} style={{ position: "absolute", top: 0, bottom: 4, left: pos(top), width: 2, background: CP.accent, borderRadius: 1 }} />
      )}
      <div style={{ position: "absolute", bottom: -6, left: 0, fontSize: 9, color: CP.mutedIcons }}>$0</div>
      <div style={{ position: "absolute", bottom: -6, right: 0, fontSize: 9, color: CP.mutedIcons }}>${scale.toLocaleString("it-IT")}</div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, color: CP.textMuted, fontWeight: 500, marginBottom: 5, fontFamily: FONTS.body };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 500, color: CP.textMuted, whiteSpace: "nowrap" };
const td = { padding: "8px 12px", verticalAlign: "middle" };
