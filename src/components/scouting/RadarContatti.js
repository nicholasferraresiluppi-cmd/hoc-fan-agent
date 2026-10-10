"use client";
// Radar creator — vista "Contatti": le colonne del percorso, dalla scelta alla firma.
// I contatti restano in pausa finché non arriva il parere dell'avvocato (docs/SCOUTING_PRIVACY.md).
import { CP, alpha } from "@/lib/brand";
import { SERIF, NUM, fmtN, btnQuiet, LinkChip, STAGE_LABEL } from "./radar-ui";

const COLS = ["interessante", "contattata", "trattativa", "firmata"];
const EMPTY = {
  interessante: "Segna «Interessante» dalla scheda o da Oggi: le creator scelte arrivano qui.",
  contattata: "Dopo il primo messaggio: il radar ricorda data e canale.",
  trattativa: "Proposta inviata, risposta, prossimo appuntamento.",
  firmata: "Alla firma la creator passa nel CRM persone.",
};

export default function RadarContatti({ creators, onOpen }) {
  const by = Object.fromEntries(COLS.map((s) => [s, creators.filter((c) => c.stage === s).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", border: `1px solid ${alpha(CP.gold, "55")}`, borderRadius: 12, padding: "14px 18px", fontSize: 14.5 }}>
        <span style={{ flex: "1 1 360px" }}>Contatti in pausa: aspettiamo il parere sull&apos;uso dei dati pubblici e il testo da mandare al primo messaggio.</span>
      </div>
      <div className="rc-scroll" style={{ overflowX: "auto" }}>
        <div className="rc-cols" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(230px, 1fr))", gap: 24, minWidth: 980 }}>
          {COLS.map((s) => (
            <section key={s} aria-label={STAGE_LABEL[s]} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ margin: 0, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 500, borderBottom: `1px solid ${s === "interessante" ? CP.gold : CP.border}`, paddingBottom: 10 }}>
                <span>{STAGE_LABEL[s]}</span><span style={{ color: CP.textMuted, ...NUM }}>{by[s].length}</span>
              </h2>
              {by[s].length === 0 && <p style={{ margin: 0, border: `1px dashed ${CP.border}`, borderRadius: 12, padding: 16, fontSize: 13.5, color: CP.textSecondary }}>{EMPTY[s]}</p>}
              {by[s].slice(0, 40).map((c) => (
                <article key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 12, background: CP.surface, border: `1px solid ${CP.border}` }}>
                  <button onClick={() => onOpen(c)} style={{ ...btnQuiet, padding: 0, minHeight: 0, justifyContent: "flex-start", color: CP.textPrimary, fontWeight: 600 }}>{c.name}</button>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{[c.nic || c.g, `${fmtN(c.fol)} follower`].join(" · ")}</span>
                  <LinkChip link={c.link} sig={c.sig} />
                  <span style={{ fontSize: 12.5, color: CP.textMuted }}>{c.owner ? `La segue ${c.owner}` : "Nessuno la segue ancora"}{c.notes ? ` · ${c.notes} note` : ""}</span>
                </article>
              ))}
              {by[s].length > 40 && <span style={{ fontSize: 13, color: CP.textMuted }}>+ altre {by[s].length - 40}</span>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
