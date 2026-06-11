"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calculator, Users, Sparkles, Award, Target,
  ArrowRight, Info, Activity,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, CpCard } from "@/components/cp-style";

/**
 * /welcome/score-explained — Pagina dedicata che spiega in dettaglio lo
 * score CP v3, con un calcolatore interattivo.
 */

const TIER_BADGES = [
  { tier: "Elite",    range: "top 10%",  color: "#A855F7", desc: "Eccellenza assoluta — rari e iper-performanti su tutto" },
  { tier: "Strong",   range: "top 25%",  color: "#3B82F6", desc: "Solidi performer — sopra media in modo consistente" },
  { tier: "Good",     range: "top 50%",  color: "#10B981", desc: "Sopra mediana — affidabili, contribuiscono attivamente" },
  { tier: "Average",  range: "top 75%",  color: "#9CA3AF", desc: "Mediocri — non distinguono ma non sono problema" },
  { tier: "Weak",     range: "top 90%",  color: "#F59E0B", desc: "Sotto media — area di intervento, da monitorare" },
  { tier: "Critical", range: "bottom 10%", color: "#EF4444", desc: "Performance non sostenibili — candidati a swap/cambio ruolo" },
];

function tierFromPercentile(p) {
  if (p == null) return null;
  if (p >= 90) return "Elite";
  if (p >= 75) return "Strong";
  if (p >= 50) return "Good";
  if (p >= 25) return "Average";
  if (p >= 10) return "Weak";
  return "Critical";
}
function colorForTier(t) {
  const b = TIER_BADGES.find((x) => x.tier === t);
  return b?.color || CP.textMuted;
}

export default function ScoreExplainedPage() {
  // Calcolatore interattivo
  const [percCreator, setPercCreator] = useState(70);
  const [percAgency, setPercAgency] = useState(60);
  const [consistency, setConsistency] = useState(80); // 0..100

  const spsBlended = useMemo(() => 0.7 * percCreator + 0.3 * percAgency, [percCreator, percAgency]);
  const finalScore = useMemo(() => 0.85 * spsBlended + 0.15 * consistency, [spsBlended, consistency]);
  const finalTier = tierFromPercentile(finalScore);
  const finalColor = colorForTier(finalTier);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1100, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary, marginBottom: 14 }}>
        <Link href="/welcome" style={{ color: "inherit", textDecoration: "none" }}>Welcome</Link>
        <span style={{ color: CP.textMuted }}>›</span>
        <span style={{ color: CP.textPrimary }}>Score Explained</span>
      </div>

      {/* Header */}
      <SectionLabel>Tutorial · Score CP v3</SectionLabel>
      <h1 style={{ fontFamily: FONTS.display, fontSize: 40, fontWeight: 700, margin: "10px 0 8px 0", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
        Come funziona <span style={{ color: CP.accentGreen }}>lo score</span>?
      </h1>
      <p style={{ color: CP.textSecondary, fontSize: 16, margin: 0, lineHeight: 1.55, maxWidth: 820 }}>
        Una guida passo-passo alla formula che classifica i tuoi operatori. Niente magia: solo dati CP reali, percentili e una calibrazione automatica sul mese corrente.
      </p>

      {/* SEZIONE 1 — Cosa misura */}
      <Section icon={Target} color="#10B981" title="1. Cosa misura lo score">
        <p style={pBig}>
          Lo score di un operatore <b>su una creator</b> risponde a due domande in contemporanea:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <CpCard accent="#3B82F6" padding="18px 20px">
            <div style={iconRow}><Users size={16} color="#3B82F6" /><b>vs Creator</b></div>
            <p style={pSm}>Sei tra i migliori che lavorano <b>su quella creator</b>? Percentile vs altri operatori della stessa creator.</p>
          </CpCard>
          <CpCard accent="#10B981" padding="18px 20px">
            <div style={iconRow}><Sparkles size={16} color="#10B981" /><b>vs Agency</b></div>
            <p style={pSm}>In scala agency, <b>quanto vali in assoluto</b>? Percentile vs tutti gli operatori del mese.</p>
          </CpCard>
        </div>
        <p style={{ ...pBig, marginTop: 18 }}>
          Le due risposte vengono <b>combinate (70% creator + 30% agency)</b> per evitare distorsioni: chi è top di un team debole non vince "Elite" se in assoluto è mediocre.
        </p>
      </Section>

      {/* SEZIONE 2 — Formula */}
      <Section icon={Calculator} color="#3B82F6" title="2. La formula in 3 step">
        <ol style={ol}>
          <li>
            <b>Calcola i 2 KPI base</b> per la coppia (operatore × creator):
            <ul style={ul}>
              <li><code style={code}>sales/shift</code> — quanto generi a parità di turno (KPI principale)</li>
              <li><code style={code}>consistency</code> — bassa volatilità tra shift = più affidabile (0..1)</li>
            </ul>
          </li>
          <li>
            <b>Trasforma sales/shift in 2 percentili</b>:
            <ul style={ul}>
              <li><code style={code}>perc_vs_creator</code> = posizione tra gli operatori che lavorano sulla stessa creator</li>
              <li><code style={code}>perc_vs_agency</code> = posizione tra tutti gli operatori del mese</li>
            </ul>
            E li <b>blend</b>: <code style={code}>SPS_blended = 0.7 × perc_vs_creator + 0.3 × perc_vs_agency</code>
          </li>
          <li>
            <b>Score finale</b> = blend pesato dei 2 KPI:
            <div style={{ marginTop: 8, padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary }}>
              score = 0.85 × SPS_blended + 0.15 × consistency × 100
            </div>
          </li>
        </ol>
        <div style={{ marginTop: 18, padding: "12px 16px", background: "#F59E0B12", border: "1px solid #F59E0B44", borderRadius: 10, fontSize: 13, color: CP.textSecondary, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Info size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>Le ore extra non entrano nello score.</b> Modello: lo shift è l'unità atomica; estendere uno shift di 1-2h è informativo ma non altera il merito.
          </span>
        </div>
      </Section>

      {/* SEZIONE 3 — Calcolatore */}
      <Section icon={Activity} color="#A855F7" title="3. Calcolatore interattivo">
        <p style={pBig}>
          Sposta i 3 slider per vedere come cambia lo score in tempo reale.
        </p>
        <CpCard padding="24px 28px" style={{ marginTop: 14 }}>
          <SliderRow
            label="Percentile vs Creator"
            value={percCreator}
            onChange={setPercCreator}
            color="#3B82F6"
            hint="Sei top tra i colleghi sulla stessa creator?"
          />
          <SliderRow
            label="Percentile vs Agency"
            value={percAgency}
            onChange={setPercAgency}
            color="#10B981"
            hint="In assoluto, dove ti collochi nel pool intero?"
          />
          <SliderRow
            label="Consistency"
            value={consistency}
            onChange={setConsistency}
            color="#F59E0B"
            hint="0 = molto volatile, 100 = uniforme tra shift"
          />

          {/* Calcolo passo passo */}
          <div style={{ marginTop: 20, padding: "16px 18px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 10, fontFamily: FONTS.mono, fontSize: 13 }}>
            <div style={{ color: CP.textMuted, marginBottom: 8, fontSize: 11, letterSpacing: "0.1em", fontWeight: 700 }}>Calcolo</div>
            <div style={calcLine}>
              <span>SPS_blended</span>
              <span>= 0.7 × {percCreator} + 0.3 × {percAgency}</span>
              <span style={{ color: CP.textPrimary, fontWeight: 700 }}>= {spsBlended.toFixed(1)}</span>
            </div>
            <div style={calcLine}>
              <span>score finale</span>
              <span>= 0.85 × {spsBlended.toFixed(1)} + 0.15 × {consistency}</span>
              <span style={{ color: finalColor, fontWeight: 700, fontSize: 17 }}>= {finalScore.toFixed(1)}</span>
            </div>
          </div>

          {/* Tier risultante */}
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <span style={{ color: CP.textMuted, fontSize: 13 }}>Tier risultante:</span>
            <span style={{
              padding: "8px 18px",
              background: finalColor + "22",
              color: finalColor,
              border: `2px solid ${finalColor}`,
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}>
              {finalTier?.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: CP.textMuted, fontFamily: FONTS.mono }}>
              ({TIER_BADGES.find((t) => t.tier === finalTier)?.range})
            </span>
          </div>
        </CpCard>
      </Section>

      {/* SEZIONE 4 — Tier */}
      <Section icon={Award} color="#F59E0B" title="4. I 6 tier di classificazione">
        <p style={pBig}>
          I tier sono <b>percentile-based</b>: gli "Elite" sono sempre il top 10%, non una soglia fissa. Stabili nel tempo, ricalibrati ogni mese sui dati reali.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 16 }}>
          {TIER_BADGES.map((t) => (
            <div key={t.tier} style={{
              padding: "14px 18px",
              background: `${t.color}10`,
              border: `1px solid ${t.color}55`,
              borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  padding: "3px 11px", background: t.color, color: "#0a0a0a",
                  borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                }}>{t.tier.toUpperCase()}</span>
                <span style={{ fontSize: 11, color: CP.textMuted, fontFamily: FONTS.mono }}>{t.range}</span>
              </div>
              <p style={{ fontSize: 12, color: CP.textSecondary, margin: 0, lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ color: CP.textMuted, fontSize: 12, marginTop: 16, fontStyle: "italic" }}>
          ⚠ Operatori con <b>meno di 3 shift</b> sulla creator hanno score "—" (campione troppo piccolo).
        </p>
      </Section>

      {/* SEZIONE 5 — Score aggregato */}
      <Section icon={Users} color="#10B981" title="5. Score aggregato (pagina Sales CP)">
        <p style={pBig}>
          Lo score che vedi su <b>Sales CP</b> per un operatore è la <b>media pesata su sales</b> degli score per creator:
        </p>
        <div style={{ marginTop: 14, padding: "18px 20px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, textAlign: "center" }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 15, color: CP.textPrimary, fontWeight: 600 }}>
            score(op) = Σ ( score(op, creator) × sales(op, creator) ) / sales_totali(op)
          </div>
        </div>
        <p style={{ ...pBig, marginTop: 18 }}>
          <b>Effetto pratico:</b>
        </p>
        <ul style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22 }}>
          <li>Le creator dove l'operatore vende di più <b>pesano di più</b>.</li>
          <li>Non puoi essere <span style={{ color: "#A855F7", fontWeight: 700 }}>Elite</span> a Sales CP se sei <span style={{ color: "#EF4444", fontWeight: 700 }}>Critical</span> sulle creator dove fai il 70% del fatturato.</li>
          <li>Le creator marginali (1-2 shift, sales bassissime) contano poco.</li>
          <li>Coerenza matematica garantita: <b>Sales CP</b> e <b>Creator</b> raccontano la stessa storia.</li>
        </ul>
      </Section>

      {/* CTA finali */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 32 }}>
        <Link href="/leaderboard/sales-cp" style={ctaCard("#10B981")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={20} color="#10B981" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: CP.textPrimary }}>Vai a Sales CP</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Vedi gli score reali del mese corrente</div>
            </div>
          </div>
          <ArrowRight size={16} color="#10B981" />
        </Link>
        <Link href="/admin/action-center" style={ctaCard("#EF4444")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Target size={20} color="#EF4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: CP.textPrimary }}>Action Center</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Lista operatori da rivedere → swap → HR</div>
            </div>
          </div>
          <ArrowRight size={16} color="#EF4444" />
        </Link>
      </div>
    </div>
  );
}

function Section({ icon: Icon, color, title, children }) {
  return (
    <div style={{ marginTop: 44 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${color}22`, border: `1px solid ${color}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} color={color} strokeWidth={2} />
        </div>
        <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.015em", color: CP.textPrimary }}>{title}</h2>
      </div>
      <div style={{ paddingLeft: 50 }}>{children}</div>
    </div>
  );
}

function SliderRow({ label, value, onChange, color, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 600 }}>{label}</label>
        <span style={{ fontFamily: FONTS.mono, fontSize: 14, color, fontWeight: 700 }}>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }}
      />
      <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

// === styles ===
const pBig = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "0 0 8px 0" };
const pSm = { fontSize: 13, color: CP.textPrimary, margin: 0, lineHeight: 1.55 };
const ol = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: "8px 0" };
const ul = { color: CP.textSecondary, fontSize: 13, lineHeight: 1.7, paddingLeft: 22, marginTop: 4 };
const iconRow = { display: "flex", alignItems: "center", gap: 8, color: CP.textPrimary, fontSize: 14, marginBottom: 6 };
const code = { background: CP.surfaceAlt, padding: "1px 7px", borderRadius: 4, fontFamily: FONTS.mono, fontSize: 12, color: CP.textPrimary };
const calcLine = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", gap: 10, color: CP.textSecondary };
const ctaCard = (col) => ({
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "18px 22px",
  background: CP.surface,
  border: `1px solid ${col}44`,
  borderRadius: 12,
  textDecoration: "none",
});
