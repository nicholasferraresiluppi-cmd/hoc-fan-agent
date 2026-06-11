"use client";

/**
 * ScoreTutorialModal — modal multi-step (5 slide) che spiega la logica
 * dello score v3. Riusato nelle pagine leaderboard (Sales CP, Creator,
 * Creator drill-down, Action Center).
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   ...
 *   <button onClick={() => setOpen(true)}>ⓘ Come funziona lo score?</button>
 *   {open && <ScoreTutorialModal onClose={() => setOpen(false)} />}
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  X, ChevronLeft, ChevronRight, Target, Activity, Users, Award,
  Calculator, ArrowRight, Sparkles,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

const TIER_BADGES = [
  { tier: "Elite",    range: "top 10%",  color: "#A855F7" },
  { tier: "Strong",   range: "top 25%",  color: "#3B82F6" },
  { tier: "Good",     range: "top 50%",  color: "#10B981" },
  { tier: "Average",  range: "top 75%",  color: "#9CA3AF" },
  { tier: "Weak",     range: "top 90%",  color: "#F59E0B" },
  { tier: "Critical", range: "bottom 10%", color: "#EF4444" },
];

const STEPS = [
  {
    id: "what",
    title: "Cosa misura lo score?",
    icon: Target,
    accent: "#10B981",
    body: ({ onNext }) => (
      <div>
        <p style={p}>
          Lo score di un operatore <b>su una creator</b> risponde a una domanda doppia:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18, marginBottom: 18 }}>
          <div style={miniCard("#10B981")}>
            <div style={miniHeader}><Users size={14} color="#10B981" /> vs Creator</div>
            <p style={miniBody}>
              "Sei tra i migliori che lavorano <b>su quella creator</b>?"<br />
              <span style={{ color: CP.textMuted, fontSize: 11 }}>Percentile vs altri operatori della stessa creator.</span>
            </p>
          </div>
          <div style={miniCard("#3B82F6")}>
            <div style={miniHeader}><Sparkles size={14} color="#3B82F6" /> vs Agency</div>
            <p style={miniBody}>
              "In scala agency, <b>quanto vali in assoluto</b>?"<br />
              <span style={{ color: CP.textMuted, fontSize: 11 }}>Percentile vs tutti gli operatori del mese.</span>
            </p>
          </div>
        </div>
        <p style={p}>
          Le due risposte vengono <b>combinate</b> per evitare distorsioni: chi è top di un team debole non vince "Elite" se in assoluto è mediocre.
        </p>
      </div>
    ),
  },
  {
    id: "formula",
    title: "La formula in 1 schermata",
    icon: Calculator,
    accent: "#3B82F6",
    body: () => (
      <div>
        <div style={formulaBlock}>
          <div style={formulaLine}>
            <span style={kpi}>Sales/shift</span>
            <span style={op}>×</span>
            <span style={weight}>85%</span>
            <span style={op}>+</span>
            <span style={kpi}>Consistency</span>
            <span style={op}>×</span>
            <span style={weight}>15%</span>
          </div>
          <div style={{ color: CP.textMuted, fontSize: 11, textAlign: "center", margin: "4px 0 14px 0" }}>↓ KPI compositi (0..100)</div>
          <div style={formulaLine}>
            <span style={pillBlue}>percentile_vs_creator</span>
            <span style={op}>×</span>
            <span style={weight}>70%</span>
            <span style={op}>+</span>
            <span style={pillGreen}>percentile_vs_agency</span>
            <span style={op}>×</span>
            <span style={weight}>30%</span>
          </div>
          <div style={{ color: CP.textMuted, fontSize: 11, textAlign: "center", marginTop: 4 }}>↓ Blending dei 2 percentili</div>
          <div style={{ textAlign: "center", marginTop: 12, fontFamily: FONTS.mono, fontWeight: 700, color: "#A855F7", fontSize: 18 }}>
            = score 0..100
          </div>
        </div>
        <p style={{ ...p, marginTop: 18 }}>
          <b>Sales/shift</b> = quanto generi a parità di turno (KPI principale, 85%).<br />
          <b>Consistency</b> = bassa volatilità tra shift = più affidabile (15%).
        </p>
        <p style={{ color: CP.textMuted, fontSize: 12, marginTop: 12, fontStyle: "italic" }}>
          Le ore extra sono visibili come info di contesto ma <u>non entrano</u> nello score (modello "lo shift è l'unità").
        </p>
      </div>
    ),
  },
  {
    id: "perspectives",
    title: "Perché 2 percentili?",
    icon: Activity,
    accent: "#A855F7",
    body: () => (
      <div>
        <p style={p}>
          Confrontare <b>solo</b> con il cohort della creator premia il "meno peggio".
          Confrontare <b>solo</b> in assoluto penalizza chi lavora su creator piccole.
          Il blend 70/30 bilancia:
        </p>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={th}>Caso</th>
              <th style={th}>vs Creator</th>
              <th style={th}>vs Agency</th>
              <th style={th}>Score</th>
              <th style={th}>Significato</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>Top di creator piccola</td>
              <td style={td}>95</td>
              <td style={td}>30</td>
              <td style={{ ...td, color: "#10B981", fontWeight: 700 }}>76</td>
              <td style={td}>Bravo lì, ma medio in assoluto</td>
            </tr>
            <tr>
              <td style={td}>Medio su creator forte</td>
              <td style={td}>50</td>
              <td style={td}>90</td>
              <td style={{ ...td, color: "#10B981", fontWeight: 700 }}>62</td>
              <td style={td}>Vende molto in assoluto</td>
            </tr>
            <tr>
              <td style={td}>Top su creator forte</td>
              <td style={td}>95</td>
              <td style={td}>90</td>
              <td style={{ ...td, color: "#A855F7", fontWeight: 700 }}>94</td>
              <td style={td}>Elite vero, top ovunque</td>
            </tr>
            <tr>
              <td style={td}>Bottom su creator debole</td>
              <td style={td}>10</td>
              <td style={td}>15</td>
              <td style={{ ...td, color: "#EF4444", fontWeight: 700 }}>11</td>
              <td style={td}>Critical reale</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "tiers",
    title: "I 6 tier di classificazione",
    icon: Award,
    accent: "#F59E0B",
    body: () => (
      <div>
        <p style={p}>
          I tier sono <b>percentile-based</b>: gli "Elite" sono sempre il top 10% (non una soglia hardcoded). Stabili nel tempo, calibrati sui tuoi dati reali del mese.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 16 }}>
          {TIER_BADGES.map((t) => (
            <div key={t.tier} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px",
              background: `${t.color}15`, border: `1px solid ${t.color}55`,
              borderRadius: 10,
            }}>
              <span style={{ padding: "3px 10px", background: t.color, color: "#0a0a0a", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                {t.tier.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: CP.textSecondary }}>{t.range}</span>
            </div>
          ))}
        </div>
        <p style={{ color: CP.textMuted, fontSize: 12, marginTop: 16, fontStyle: "italic" }}>
          Operatori con <b>meno di 3 shift</b> sulla creator hanno score "—" (campione troppo piccolo per essere affidabile).
        </p>
      </div>
    ),
  },
  {
    id: "aggregate",
    title: "Score aggregato operatore",
    icon: Users,
    accent: "#10B981",
    body: () => (
      <div>
        <p style={p}>
          Lo score che vedi su "<b>Sales CP</b>" è la <b>media pesata su sales</b> degli score per creator:
        </p>
        <div style={{ ...formulaBlock, textAlign: "center" }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 14, color: CP.textPrimary, fontWeight: 600 }}>
            score(op) = Σ ( score(op, creator) × sales(op, creator) ) / sales_totali(op)
          </div>
        </div>
        <p style={{ ...p, marginTop: 16 }}>
          Le creator dove l'operatore vende di più <b>pesano di più</b>. Effetto pratico:
        </p>
        <ul style={{ color: CP.textSecondary, fontSize: 13, lineHeight: 1.7, paddingLeft: 20 }}>
          <li>Non puoi essere <span style={{ color: "#A855F7", fontWeight: 700 }}>Elite</span> a Sales CP se sei mediocre sulle creator dove fai il 70% del fatturato.</li>
          <li>Le creator marginali (1-2 shift, sales bassissime) contano poco.</li>
          <li>Coerenza garantita tra le viste Sales CP e Creator.</li>
        </ul>
        <div style={{ marginTop: 18, padding: "14px 16px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ArrowRight size={16} color={CP.accentGreen} />
            <span style={{ fontSize: 13, color: CP.textSecondary }}>
              Vuoi la versione narrativa con esempi e Q&amp;A?{" "}
              <Link href="/welcome/score-friendly" style={{ color: CP.accentGreen, fontWeight: 600 }}>Tutorial guidato →</Link>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ArrowRight size={16} color="#3B82F6" />
            <span style={{ fontSize: 13, color: CP.textSecondary }}>
              Vuoi simulare uno score?{" "}
              <Link href="/welcome/score-explained" style={{ color: "#3B82F6", fontWeight: 600 }}>Calcolatore interattivo →</Link>
            </span>
          </div>
        </div>
      </div>
    ),
  },
];

export default function ScoreTutorialModal({ onClose }) {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;

  // ESC closes
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight" && step < total - 1) setStep(step + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, total, onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
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
          width: "100%", maxWidth: 720,
          maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 22px", borderBottom: `1px solid ${CP.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: `linear-gradient(135deg, ${current.accent}15, transparent)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${current.accent}22`,
              border: `1px solid ${current.accent}66`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon size={18} color={current.accent} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: CP.textMuted, fontFamily: FONTS.mono, fontWeight: 700, letterSpacing: "0.14em" }}>
                Tutorial Score · Step {step + 1} di {total}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: CP.textPrimary, marginTop: 2, fontFamily: FONTS.display, letterSpacing: "-0.01em" }}>
                {current.title}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtn} title="Chiudi (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, padding: "10px 22px 0 22px" }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)} title={s.title} style={{
              flex: 1, height: 3,
              background: i <= step ? current.accent : CP.surfaceAlt,
              border: "none", cursor: "pointer", borderRadius: 2,
              transition: "background 0.2s",
            }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", overflowY: "auto", color: CP.textPrimary }}>
          {current.body({ onNext: () => setStep((s) => Math.min(s + 1, total - 1)) })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px", borderTop: `1px solid ${CP.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: CP.surface,
        }}>
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            style={{ ...navBtn, opacity: step === 0 ? 0.4 : 1, cursor: step === 0 ? "default" : "pointer" }}
          >
            <ChevronLeft size={14} /> Indietro
          </button>
          <span style={{ fontSize: 12, color: CP.textMuted, fontFamily: FONTS.mono }}>
            {step + 1} / {total}
          </span>
          {step < total - 1 ? (
            <button onClick={() => setStep(step + 1)} style={{ ...navBtn, background: current.accent, color: "#0a0a0a", border: "none", fontWeight: 700 }}>
              Avanti <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={onClose} style={{ ...navBtn, background: current.accent, color: "#0a0a0a", border: "none", fontWeight: 700 }}>
              Capito ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// === Styles ===
const p = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.55, margin: "0 0 12px 0" };
const closeBtn = { background: "transparent", border: `1px solid ${CP.border}`, color: CP.textSecondary, borderRadius: 8, cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" };
const navBtn = { padding: "8px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONTS.body };
const miniCard = (col) => ({ padding: "14px 16px", background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 10 });
const miniHeader = { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: CP.textSecondary, marginBottom: 6, fontFamily: FONTS.mono };
const miniBody = { fontSize: 13, color: CP.textPrimary, margin: 0, lineHeight: 1.5 };
const formulaBlock = { padding: "18px 16px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12 };
const formulaLine = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", fontFamily: FONTS.mono, fontSize: 13 };
const kpi = { padding: "5px 10px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 6, color: CP.textPrimary, fontWeight: 600 };
const weight = { padding: "5px 8px", background: CP.accentGreen + "22", color: CP.accentGreen, borderRadius: 6, fontWeight: 700 };
const op = { color: CP.textMuted, fontSize: 14 };
const pillBlue = { padding: "5px 10px", background: "#3B82F622", color: "#3B82F6", border: "1px solid #3B82F644", borderRadius: 6, fontWeight: 600 };
const pillGreen = { padding: "5px 10px", background: "#10B98122", color: "#10B981", border: "1px solid #10B98144", borderRadius: 6, fontWeight: 600 };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 14, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, overflow: "hidden" };
const th = { padding: "9px 10px", textAlign: "left", color: CP.textMuted, fontSize: 10, letterSpacing: "0.08em", borderBottom: `1px solid ${CP.borderStrong}`, fontFamily: FONTS.mono, fontWeight: 700 };
const td = { padding: "10px", borderBottom: `1px solid ${CP.border}`, color: CP.textPrimary, fontFamily: FONTS.mono, fontSize: 12 };
