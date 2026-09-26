"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Sparkles, Target, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, card, NUM } from "@/components/ds";

/**
 * /welcome/score-explained — La formula dello score Vendite (score CP v3) con
 * un calcolatore interattivo.
 *
 * Redesign 26/09/2026 sul design system. Contenuto riallineato al codice
 * (src/lib/creator-aggregates.js): l'aggregato per operatore è pesato sui TURNI
 * (v3.1), non sui sales; le creator sotto 3 turni sono escluse dal calcolo.
 * La logica del calcolatore è invariata.
 */

// Fasce dello score Vendite: soglie di tierFromPercentile in creator-aggregates.js.
const TIER_BADGES = [
  { tier: "Elite",    range: "90–100", desc: "La fascia più alta: risultati eccellenti e costanti" },
  { tier: "Strong",   range: "75–89",  desc: "Sopra la media in modo netto e stabile" },
  { tier: "Good",     range: "50–74",  desc: "Nella metà alta: risultati affidabili" },
  { tier: "Average",  range: "25–49",  desc: "Vicino alla media, nella metà bassa" },
  { tier: "Weak",     range: "10–24",  desc: "Sotto la media: c'è qualcosa da capire insieme al tuo responsabile" },
  { tier: "Critical", range: "0–9",    desc: "La fascia più bassa: se si ripete, il caso viene rivisto (cambio di creator o di ruolo)" },
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
// Il colore porta solo il segnale: verde = sopra, rosso = da guardare.
function colorForTier(t) {
  if (t === "Elite" || t === "Strong") return CP.accentGreen;
  if (t === "Weak" || t === "Critical") return CP.accentRed;
  return CP.textSecondary;
}
const fmt1 = (v) => v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
    <div style={{ padding: "28px 24px 64px", maxWidth: 1000, margin: "0 auto", fontFamily: FONTS.body, color: CP.textPrimary }}>
      <PageHead
        crumbs={[{ label: "Benvenuto", href: "/welcome" }, { label: "Score Vendite, la formula" }]}
        title="La formula dello score Vendite"
        subtitle="Come si passa dalle vendite dei turni a un numero da 0 a 100, con un calcolatore per provarlo. Solo dati reali di CreatorsPro, confrontati ogni mese con quelli dei colleghi."
      />

      <Notice>
        Questa pagina spiega lo score <b style={b}>Vendite</b>, usato nelle revisioni mensili. L&apos;altro score, <b style={b}>Mestiere</b>, misura come lavori in chat (dati Infloww) ed è quello del percorso di carriera: ha fasce proprie (Critical sotto 15, Weak 15–27, Average 27–44, Good 44–61, Strong 61–75, Elite da 75).
      </Notice>

      {/* 1 — Cosa misura */}
      <Block title="1. Cosa misura">
        <p style={pBig}>Lo score di un operatore <b style={b}>su una creator</b> risponde a due domande insieme:</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={cardTitle}>Confronto sulla creator</div>
            <p style={pSm}>Sei tra chi vende di più <b style={b}>su quella creator</b>? È il percentile rispetto agli altri operatori della stessa creator.</p>
          </div>
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={cardTitle}>Confronto con l&apos;agenzia</div>
            <p style={pSm}>Quanto vendi <b style={b}>rispetto a tutta l&apos;agenzia</b>? È il percentile rispetto a tutti gli operatori del mese.</p>
          </div>
        </div>
        <p style={{ ...pBig, marginTop: 14 }}>
          Le due risposte si combinano, <b style={b}>70% creator e 30% agenzia</b>, per evitare distorsioni: chi è il migliore di un team debole non arriva a Elite se in assoluto vende poco.
        </p>
      </Block>

      {/* 2 — Formula */}
      <Block title="2. La formula in 3 passi">
        <ol style={ol}>
          <li>
            <b style={b}>Due indicatori</b> per ogni coppia operatore × creator:
            <ul style={ul}>
              <li><Code>vendite per turno</Code>: quanto vendi in un turno, in media (l&apos;indicatore principale)</li>
              <li><Code>regolarità</Code>: quanto si somigliano i turni tra loro, da 0 a 1 (più alta = più affidabile)</li>
            </ul>
          </li>
          <li>
            <b style={b}>Le vendite per turno diventano due percentili</b>:
            <ul style={ul}>
              <li><Code>percentile sulla creator</Code>: la posizione tra chi lavora sulla stessa creator</li>
              <li><Code>percentile con l&apos;agenzia</Code>: la posizione tra tutti gli operatori del mese</li>
            </ul>
            e si combinano: <Code>vendite (score) = 0,7 × percentile creator + 0,3 × percentile agenzia</Code>
          </li>
          <li>
            <b style={b}>Score finale</b>, che unisce i due indicatori:
            <div style={{ ...card, marginTop: 8, padding: "10px 14px", fontSize: 14, color: CP.textPrimary, ...NUM }}>
              score = 0,85 × vendite (score) + 0,15 × regolarità × 100
            </div>
          </li>
        </ol>
        <div style={{ marginTop: 14 }}>
          <Notice>
            <b style={b}>Le ore extra non entrano nello score.</b> L&apos;unità è il turno: allungarlo di 1-2 ore si vede nei dati, ma non cambia il merito.
          </Notice>
        </div>
      </Block>

      {/* 3 — Calcolatore */}
      <Block title="3. Calcolatore" aside="Sposta i tre cursori e guarda come cambia lo score">
        <section style={{ ...card, padding: "20px 22px" }}>
          <SliderRow label="Percentile sulla creator" value={percCreator} onChange={setPercCreator} hint="Quanto sei in alto tra i colleghi sulla stessa creator" />
          <SliderRow label="Percentile con l'agenzia" value={percAgency} onChange={setPercAgency} hint="Quanto sei in alto tra tutti gli operatori" />
          <SliderRow label="Regolarità" value={consistency} onChange={setConsistency} hint="0 = turni molto diversi tra loro, 100 = turni sempre simili" />

          <div style={{ marginTop: 18, padding: "14px 16px", background: CP.surfaceAlt, borderRadius: 8, fontSize: 13, ...NUM }}>
            <div style={{ color: CP.textMuted, marginBottom: 6, fontSize: 12 }}>Calcolo</div>
            <div style={calcLine}>
              <span>Vendite (score)</span>
              <span>= 0,7 × {percCreator} + 0,3 × {percAgency}</span>
              <span style={{ color: CP.textPrimary, fontWeight: 500 }}>= {fmt1(spsBlended)}</span>
            </div>
            <div style={calcLine}>
              <span>Score finale</span>
              <span>= 0,85 × {fmt1(spsBlended)} + 0,15 × {consistency}</span>
              <span style={{ color: CP.textPrimary, fontWeight: 500, fontSize: 17 }}>= {fmt1(finalScore)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <span style={{ color: CP.textMuted, fontSize: 13 }}>Fascia:</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 999, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: finalColor }} />
              {finalTier}
            </span>
            <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>
              (score {TIER_BADGES.find((t) => t.tier === finalTier)?.range})
            </span>
          </div>
        </section>
      </Block>

      {/* 4 — Fasce */}
      <Block title="4. Le sei fasce">
        <p style={pBig}>
          Lo score è fatto di percentili ricalcolati ogni mese sui dati reali: per questo le fasce mantengono lo stesso significato nel tempo, anche se il livello delle vendite dell&apos;agenzia cambia.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 12 }}>
          {TIER_BADGES.map((t) => (
            <div key={t.tier} style={{ ...card, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: colorForTier(t.tier), flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{t.tier}</span>
                <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{t.range}</span>
              </div>
              <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0, lineHeight: 1.45 }}>{t.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ color: CP.textMuted, fontSize: 13, marginTop: 12 }}>
          Con <b style={b}>meno di 3 turni</b> su una creator lo score su quella creator è &quot;—&quot;: il campione è troppo piccolo.
        </p>
      </Block>

      {/* 5 — Aggregato */}
      <Block title="5. Il numero unico di Sales CP">
        <p style={pBig}>
          Lo score che vedi in <b style={b}>Sales CP</b> per un operatore è la <b style={b}>media degli score per creator, pesata sui turni</b>:
        </p>
        <div style={{ ...card, marginTop: 10, padding: "14px 16px", textAlign: "center", fontSize: 14, color: CP.textPrimary, ...NUM }}>
          score(operatore) = Σ ( score(operatore, creator) × turni(operatore, creator) ) / turni totali
        </div>
        <p style={{ ...pBig, marginTop: 14 }}><b style={b}>Cosa vuol dire in pratica:</b></p>
        <ul style={{ ...ul, fontSize: 14 }}>
          <li>Le creator su cui fai più turni <b style={b}>pesano di più</b>.</li>
          <li>Non puoi essere Elite in Sales CP se vai male sulle creator dove passi la maggior parte dei turni: pochi turni fortunati non bastano.</li>
          <li>Le creator con meno di 3 turni non entrano nel calcolo.</li>
          <li>Sales CP e la vista per creator raccontano la stessa storia: i numeri sono gli stessi.</li>
        </ul>
      </Block>

      {/* Dove andare adesso */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 32 }}>
        <Link href="/leaderboard/sales-cp" style={ctaCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Sparkles size={18} color={CP.textMuted} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Vai a Sales CP</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Gli score reali del mese in corso</div>
            </div>
          </div>
          <ArrowRight size={16} color={CP.accentSoftText} />
        </Link>
        <Link href="/admin/action-center" style={ctaCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Target size={18} color={CP.textMuted} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Action Center</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Chi rivedere questo mese e cosa fare (per chi gestisce il team)</div>
            </div>
          </div>
          <ArrowRight size={16} color={CP.accentSoftText} />
        </Link>
      </div>
    </div>
  );
}

function Block({ title, aside, children }) {
  return (
    <section style={{ marginTop: 32 }}>
      <SectionTitle aside={aside}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Code({ children }) {
  return <code style={{ background: CP.surfaceAlt, padding: "1px 7px", borderRadius: 4, fontFamily: FONTS.body, fontSize: 13, color: CP.textPrimary, ...NUM }}>{children}</code>;
}

function SliderRow({ label, value, onChange, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 12 }}>
        <label style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{label}</label>
        <span style={{ fontSize: 15, color: CP.textPrimary, fontWeight: 500, ...NUM }}>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ width: "100%", accentColor: CP.accent, cursor: "pointer" }}
      />
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

// === stili ===
const b = { color: CP.textPrimary, fontWeight: 500 };
const pBig = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" };
const pSm = { fontSize: 13, color: CP.textSecondary, margin: 0, lineHeight: 1.55 };
const cardTitle = { fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 };
const ol = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: "8px 0" };
const ul = { color: CP.textSecondary, fontSize: 13, lineHeight: 1.7, paddingLeft: 22, marginTop: 4 };
const calcLine = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", gap: 10, color: CP.textSecondary, flexWrap: "wrap" };
const ctaCard = {
  ...card,
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  padding: "16px 18px", textDecoration: "none", color: CP.textPrimary,
};
