"use client";

// Carta-lezione Academy — la pagina che insegna: due velocità (tre cose da
// ricordare + meccanica per mossa), mappa dei gradini, esempi reali vinti e
// anti-esempi, linea rossa "non si insegna", drill, generalizzazione e limiti.
// Ogni claim porta il chip di evidenza; il chip certifica solo l'enunciato.

import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore di caricamento")))));

const fmtInt = (n) => Number(n || 0).toLocaleString("it-IT");

// Chip di evidenza: verde solo per il dato deterministico; il resto neutro con
// etichetta parlante (un solo accent in pagina, riservato alla struttura).
const EVIDENCE = {
  dato: { label: "dato", color: CP.accentGreen, bg: `${CP.accentGreen}1f`, border: `${CP.accentGreen}55` },
  correlazione: { label: "correlazione con caveat", color: CP.textSecondary, bg: CP.surfaceAlt, border: CP.border },
  "osservato-contrastato": { label: "osservato · vinte vs perse", color: CP.textSecondary, bg: CP.surfaceAlt, border: CP.border },
  osservato: { label: "osservato · senza contrasto", color: CP.textMuted, bg: "transparent", border: CP.borderStrong },
};

function EvidenceChip({ kind }) {
  const e = EVIDENCE[kind] || EVIDENCE.osservato;
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: FONTS.mono,
        color: e.color,
        background: e.bg,
        border: `1px solid ${e.border}`,
        borderRadius: 6,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {e.label}
    </span>
  );
}

function SectionTitle({ kicker, title, sub }) {
  return (
    <div style={{ margin: "44px 0 16px" }}>
      <div style={{ fontSize: 11, fontFamily: FONTS.mono, letterSpacing: "0.12em", textTransform: "uppercase", color: CP.accentSoftText }}>{kicker}</div>
      <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 4px", letterSpacing: "-0.01em" }}>{title}</h2>
      {sub && <p style={{ margin: 0, fontSize: 13.5, color: CP.textSecondary, maxWidth: 680, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

function ChainStep({ step }) {
  return (
    <div style={{ background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, color: CP.accentSoftText }}>${step.price}</div>
      <div style={{ fontSize: 12, color: CP.textSecondary, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>{step.label}</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10.5, color: CP.textMuted, marginTop: 5 }}>{step.note}</div>
    </div>
  );
}

function ChainRow({ steps }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "contents" }}>
          <ChainStep step={s} />
          {i < steps.length - 1 && (
            <div style={{ display: "flex", alignItems: "center", color: CP.mutedIcons, fontSize: 16 }}>→</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LessonCardPage() {
  const { id } = useParams();
  const { data, error, isLoading } = useSWR(id ? `/api/academy/lessons?id=${encodeURIComponent(id)}` : null, fetcher);
  const c = data?.card;

  if (error) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          {error.message} — <Link href="/academy/lezioni" style={{ color: CP.accentSoftText }}>torna alle lezioni</Link>
        </div>
      </div>
    );
  }
  if (isLoading || !c) {
    return <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px", color: CP.textMuted, fontSize: 14 }}>Carico la lezione…</div>;
  }

  const core = c.moves.filter((m) => m.tier === "core");
  const secondo = c.moves.filter((m) => m.tier === "secondo-giro");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Academy · lezioni"
        breadcrumb={<Link href="/academy/lezioni" style={{ color: CP.textSecondary, textDecoration: "none" }}>← Tutte le lezioni</Link>}
        title={c.title}
        subtitle={c.subtitle}
      />

      {/* provenienza + legenda evidenza */}
      <Card style={{ background: CP.bgSunken, display: "flex", flexWrap: "wrap", gap: "10px 22px", fontSize: 12.5, color: CP.textMuted }}>
        <span>{c.creator}</span>
        <span>{fmtInt(c.provenance.episodi)} episodi 1:1</span>
        <span>{fmtInt(c.provenance.sequenze_etichettate)} sequenze etichettate (vinte + perse)</span>
        <span>winrate medio {String(c.provenance.winrate_medio).replace(".", ",")}%</span>
        <span>{c.provenance.correzioni_critici} correzioni dai critici</span>
      </Card>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", margin: "12px 2px 0", fontSize: 12, color: CP.textMuted, alignItems: "center" }}>
        <span style={{ color: CP.textSecondary }}>Come leggere:</span>
        <EvidenceChip kind="dato" />
        <EvidenceChip kind="correlazione" />
        <EvidenceChip kind="osservato-contrastato" />
        <EvidenceChip kind="osservato" />
      </div>

      {/* tre cose */}
      <SectionTitle kicker="Velocità 1" title="Se ricordi solo tre cose" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {c.three_things.map((t, i) => (
          <Card key={i} style={{ borderTop: `2px solid ${CP.accent}` }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.accentSoftText, fontWeight: 600 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, margin: "6px 0" }}>{t.title}</div>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{t.body}</div>
          </Card>
        ))}
      </div>

      {/* mappa dei gradini */}
      <SectionTitle kicker="L'artefatto da memorizzare" title="La mappa dei gradini" sub={c.chain_map.intro} />
      <Card>
        <div style={{ fontSize: 11, fontFamily: FONTS.mono, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 6 }}>Ingresso</div>
        <ChainRow steps={[c.chain_map.ingresso]} />
        <div style={{ fontSize: 11, fontFamily: FONTS.mono, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, margin: "16px 0 6px" }}>Catena principale</div>
        <ChainRow steps={c.chain_map.principale} />
        <div style={{ fontSize: 11, fontFamily: FONTS.mono, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, margin: "16px 0 6px" }}>Catene parallele</div>
        <ChainRow steps={c.chain_map.parallele} />
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${CP.borderSoft}`, fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.6 }}>
          {c.chain_map.nota}
        </div>
      </Card>

      {/* mosse */}
      <SectionTitle kicker="Velocità 2" title="Le sei mosse core" sub="Ordinate come le usa l'operatore, dall'aggancio alla chiusura. Ogni mossa: quando scatta → cosa fai, con la battuta vera." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {core.map((m) => <MoveCard key={m.n} m={m} />)}
      </div>
      <SectionTitle kicker="Velocità 2" title="Le tre di secondo giro" sub="Utili ma meno discriminanti: si appoggiano alle mosse core, non le sostituiscono." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {secondo.map((m) => <MoveCard key={m.n} m={m} secondo />)}
      </div>

      {/* worked examples */}
      <SectionTitle kicker="Vedi come si fa" title="Tre partite vinte, mossa per mossa" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        {c.worked_examples.map((w) => (
          <Card key={w.id}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.accentGreen, fontWeight: 600 }}>{w.id} · {w.tag}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 10px", lineHeight: 1.35 }}>{w.title}</div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {w.beats.map((b, i) => (
                <li key={i} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>{b}</li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      {/* anti-esempi */}
      <SectionTitle kicker="Vedi dove si sbaglia" title="Anti-esempi: vittorie pirriche" sub="Episodi che hanno incassato oggi pagando un costo che si vede nell'aggregato — o domani." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {c.anti_examples.map((a) => (
          <Card key={a.id} style={{ borderLeft: `2px solid ${CP.accentRed}` }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.accentRed, fontWeight: 600 }}>{a.id}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 8px", lineHeight: 1.35 }}>{a.title}</div>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{a.body}</div>
            <div style={{ marginTop: 10, fontFamily: FONTS.mono, fontSize: 10.5, color: CP.textMuted }}>{a.note}</div>
          </Card>
        ))}
      </div>

      {/* do not teach */}
      <SectionTitle kicker="La linea rossa" title="Osservato nei dati, ma non si insegna" sub="Qui la policy comanda sul profitto osservato. È la ragione per cui il curriculum estratto dal reale ha un umano in mezzo." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {c.do_not_teach.map((d, i) => (
          <div key={i} style={{ background: `${CP.accentRed}14`, border: `1px solid ${CP.accentRed}44`, borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 10.5, color: CP.accentRed, letterSpacing: "0.06em", marginRight: 8 }}>NON SI INSEGNA</span>
              {d.title}
            </div>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55, marginBottom: 6 }}>{d.body}</div>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}><span style={{ color: CP.textPrimary, fontWeight: 500 }}>Perché no: </span>{d.why}</div>
          </div>
        ))}
      </div>

      {/* drill */}
      <SectionTitle kicker="Prova tu" title={c.drill.title} />
      <Card style={{ borderLeft: `2px solid ${CP.accent}` }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Scenario: {c.drill.scenario}</div>
        <ol style={{ margin: "0 0 12px", paddingLeft: 20, display: "grid", gap: 6 }}>
          {c.drill.steps.map((s, i) => (
            <li key={i} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55 }}>{s}</li>
          ))}
        </ol>
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55, marginBottom: 6 }}>
          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Errore squalificante: </span>{c.drill.fail}
        </div>
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55, marginBottom: 12 }}>
          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Twist: </span>{c.drill.twist}
        </div>
        <div style={{ background: CP.surfaceAlt, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
          <span style={{ color: CP.textSecondary, fontWeight: 500 }}>Dove si esegue oggi: </span>{c.drill.reality}
        </div>
      </Card>

      {/* generalizzazione */}
      <SectionTitle kicker="Secondo creator" title="Cosa regge e cosa è sistema-Elisa" sub={c.generalization.intro} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, color: CP.accentGreen, marginBottom: 10 }}>Regge sul secondo creator</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {c.generalization.regge.map((r, i) => (
              <li key={i} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{r}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary, marginBottom: 10 }}>Sistema-Elisa (si ricalibra per creator)</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {c.generalization.sistema_elisa.map((r, i) => (
              <li key={i} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{r}</li>
            ))}
          </ul>
        </Card>
      </div>
      {c.generalization.per_move?.length > 0 && (
        <Card style={{ marginTop: 12, overflowX: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary, marginBottom: 10 }}>Verdetto mossa per mossa</div>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Mossa", "Elisa", "Ottorini", "Verdetto"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.generalization.per_move.map((pm, i) => (
                <tr key={i}>
                  <td style={{ padding: "7px 10px", color: CP.textPrimary, borderBottom: `1px solid ${CP.borderSoft}` }}>{pm.move}</td>
                  <td style={{ padding: "7px 10px", color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}` }}>{pm.elisa_evidence}</td>
                  <td style={{ padding: "7px 10px", color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}` }}>{pm.ottorini_evidence}</td>
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", color: pm.verdict === "generalizza" ? CP.accentGreen : pm.verdict === "invertito" ? CP.accentRed : CP.textSecondary }}>
                    {pm.verdict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card style={{ marginTop: 12, background: CP.bgSunken }}>
        <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.6 }}>{c.generalization.implicazione}</div>
      </Card>

      {/* limiti */}
      <SectionTitle kicker="Integrità del metodo" title="I limiti, dichiarati" sub="«Tieni / non misurato» vuol dire «non contraddetto dai dati», non «validato». Questo registro separa lo strumento onesto da uno che finge rigore." />
      <Card>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 9 }}>
          {c.limits.map((l, i) => (
            <li key={i} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{l}</li>
          ))}
        </ul>
      </Card>

      <div style={{ marginTop: 24, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
        Materiale di coaching, fuori da score e comp. Le chat citate sono reali, con fan pseudonimizzati e contenuto
        esplicito oscurato dove non porta la meccanica. Vedi anche le azioni complete in <Link href="/academy/tapes" style={{ color: CP.accentSoftText }}>game tape</Link>.
      </div>
    </div>
  );
}

function MoveCard({ m, secondo }) {
  return (
    <div style={{ background: CP.surface, border: `1px ${secondo ? "dashed" : "solid"} ${CP.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11.5, fontWeight: 600, color: secondo ? CP.textMuted : CP.accentSoftText, whiteSpace: "nowrap" }}>
          {secondo ? `2º giro ${m.n}` : `Core ${m.n}`}
        </span>
        <span style={{ fontSize: 15.5, fontWeight: 500, color: CP.textPrimary, flex: "1 1 280px", fontFamily: FONTS.display }}>{m.name}</span>
        <EvidenceChip kind={m.evidence} />
      </div>
      <div style={{ fontSize: 13.5, color: CP.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>{m.claim}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 4 }}>Numeri</div>
          <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{m.numbers}</div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 4 }}>Quando → cosa</div>
          <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{m.how_to}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontFamily: FONTS.mono, fontSize: 12, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 8, padding: "9px 13px", lineHeight: 1.5 }}>
        «{m.quote}»
      </div>
    </div>
  );
}
