"use client";

/**
 * Il tuo primo mese (27/09/2026, pilota operatori: "Operatore nuovo" apriva «Come sto andando»
 * e trovava solo un avviso "non risulti tra gli operatori valutati"). Si mostra finché la persona
 * non ha ancora un Mestiere e ha meno di 5 turni nel mese.
 * Regole: niente percentuali di completamento (partono da 0 e scoraggiano), il traguardo è in
 * turni veri; tre cose da fare, non dieci; la soglia dei 5 turni è quella dell'Action Center
 * (sotto, nelle revisioni mensili non si guarda nessuno).
 */
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { card } from "@/components/ds";

export const PRIMO_MESE_TURNI = 5;

const STEPS = [
  { href: "/", t: "Allenati su una conversazione", d: "Nel simulatore un fan AI ti risponde come uno vero. Sbagliare lì non costa niente." },
  { href: "/me/turno", t: "Prima di ogni turno, apri «Oggi»", d: "Ti dice chi seguire sui tuoi account e dove si era fermata la conversazione." },
  { href: "/cultura", t: "Leggi «Come lavoriamo»", d: "Cinque minuti: come ci parliamo, come ci diamo feedback, a chi chiedere." },
];

export default function PrimoMese({ shifts = 0 }) {
  const n = Math.max(0, Math.min(PRIMO_MESE_TURNI, Number(shifts) || 0));
  return (
    <section style={{ ...card, padding: "20px 22px", marginBottom: 22, fontFamily: FONTS.body }}>
      <h2 className="ds-sect" style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, margin: 0, color: CP.textPrimary }}>Il tuo primo mese</h2>
      <p style={{ fontSize: 14.5, color: CP.textSecondary, lineHeight: 1.55, margin: "6px 0 16px", maxWidth: 640 }}>
        Qui non c&apos;è ancora nessun numero, ed è normale. Il primo mese serve a imparare: i numeri arrivano con i turni, e servono a capire dove crescere, non a giudicarti.
      </p>

      <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: CP.textMuted }}>Turni questo mese</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-label={`${n} turni su ${PRIMO_MESE_TURNI}`}>
          {Array.from({ length: PRIMO_MESE_TURNI }, (_, i) => (
            <span key={i} style={{ width: 28, height: 8, borderRadius: 999, background: i < n ? CP.accent : CP.track }} />
          ))}
          <span style={{ fontSize: 14, color: CP.textPrimary, marginLeft: 6 }}>{n > 0 ? `${n} di ${PRIMO_MESE_TURNI}` : "si parte dal primo"}</span>
        </div>
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
          Con pochi turni lo score Vendite si muove molto da un giorno all&apos;altro: per questo nelle revisioni mensili si guarda solo da {PRIMO_MESE_TURNI} turni in su. Il Mestiere (come chatti) arriva a fine mese.
        </div>
      </div>

      <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>Tre cose da fare questa settimana</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {STEPS.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${CP.borderSoft}`, textDecoration: "none" }}>
              <span style={{ fontSize: 13, color: CP.textMuted }}>{i + 1}</span>
              <span>
                <span style={{ display: "block", fontSize: 14.5, color: CP.textPrimary, fontWeight: 500 }}>{s.t} →</span>
                <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, lineHeight: 1.45, marginTop: 2 }}>{s.d}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p style={{ fontSize: 13, color: CP.textMuted, margin: "14px 0 0", lineHeight: 1.5 }}>
        Un dubbio durante il turno? Chiedi subito a chi coordina il turno o allo Spark della tua area: meglio una domanda in più che un fan perso.
      </p>
    </section>
  );
}
