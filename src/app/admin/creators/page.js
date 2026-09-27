"use client";

// Voce delle creator (redesign 26/09/2026 sul design system).
// Schede di tono (lib/creator-personas, dati statici) usate dal simulatore per
// far parlare il "fan" e da chi forma gli operatori. Prima: schede lunghissime
// tutte aperte e un sottotitolo che prometteva "rivedi e approva / edit in V6.4"
// che non esiste → ora si dice che è sola lettura. In vista resta ciò che serve
// per scrivere come lei (gancio, cosa far sentire al fan, come vende); vocabolario,
// emoji ed esempi sono su richiesta, per scheda. Nessun dato tolto.
import { useState } from "react";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, card } from "@/components/ds";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function CreatorsAdmin() {
  const [open, setOpen] = useState({});
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Voce delle creator" }]}
        title="Voce delle creator"
        subtitle="Come scrive ogni creator: il tono, cosa far sentire al fan e come propone i contenuti. Il simulatore le usa per gli scenari; chi forma gli operatori le usa per insegnare a scrivere “come lei”."
      />
      <Notice>
        Schede in fase pilota ({CREATOR_PERSONAS.length} creator), ricavate da oltre 60 mila messaggi reali di Infloww. Sono in sola lettura: per cambiarle oggi va modificato il file dati, non c’è ancora un editor.
      </Notice>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "start" }}>
        {CREATOR_PERSONAS.map((c) => {
          const isOpen = !!open[c.id];
          return (
            <article key={c.id} style={{ ...card, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{c.name}</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: CP.textMuted }}>
                  {[c.silos, c.status === "pilot" || !c.status ? "pilota" : c.status].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div style={{ fontSize: 14, color: CP.accentSoftText, marginTop: 4 }}>{c.archetype}</div>

              {c.emotional_hook && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: CP.surfaceAlt }}>
                  <div style={{ fontSize: 12.5, color: CP.textMuted }}>Il gancio, in una frase</div>
                  <div style={{ fontSize: 15, color: CP.textPrimary, fontStyle: "italic", marginTop: 2 }}>“{c.emotional_hook}”</div>
                </div>
              )}
              <p style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55, margin: "12px 0 0" }}>{c.shortDescription}</p>

              {c.hook_mechanics && (
                <>
                  <Block title="Cosa deve credere il fan">{c.hook_mechanics.illusion}</Block>
                  <Block title="Perché il fan torna">{c.hook_mechanics.dependency}</Block>
                  <Block title="Segnali concreti da usare">
                    <List items={c.hook_mechanics.hook_signals_to_use} />
                  </Block>
                </>
              )}
              <Block title="Come vende">{c.conversion_style}</Block>

              <button onClick={() => toggle(c.id)} aria-expanded={isOpen}
                style={{ marginTop: 14, width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 0 0", background: "transparent", border: "none", borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body, fontSize: 14, textAlign: "left" }}>
                {isOpen ? <ChevronDown size={15} color={CP.textMuted} /> : <ChevronRight size={15} color={CP.textMuted} />}
                Vocabolario, emoji ed esempi
              </button>
              {isOpen && (
                <div>
                  <Block title="Come apre la chat"><Chips items={c.vocabulary?.openers} /></Block>
                  <Block title="Frasi tipiche"><Chips items={c.vocabulary?.signature_phrases} /></Block>
                  <Block title="Emoji più usate">
                    <div style={{ fontSize: 20, letterSpacing: 2 }}>{(c.emojis?.primary || []).join(" ")}</div>
                  </Block>
                  <Block title="Emoji per i messaggi sexy">
                    <div style={{ fontSize: 20, letterSpacing: 2 }}>{[...(c.emojis?.sexual_light || []), ...(c.emojis?.sexual_strong || [])].join(" ")}</div>
                  </Block>
                  <Block title="Lunghezza e registro">
                    circa {c.style?.avg_message_length} caratteri a messaggio · {c.style?.register}
                  </Block>
                  <Block title="Esempi di apertura">
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(c.example_openers || []).map((e, i) => (
                        <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: CP.surfaceAlt, fontStyle: "italic" }}>“{e}”</div>
                      ))}
                    </div>
                  </Block>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: CP.textPrimary, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function List({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
      {(items || []).map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function Chips({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(items || []).map((it, i) => (
        <span key={i} style={{ padding: "3px 9px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textPrimary, fontSize: 13 }}>{it}</span>
      ))}
    </div>
  );
}
