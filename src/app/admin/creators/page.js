"use client";

import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import AdminNav from "@/components/AdminNav";
import { COLORS } from "@/lib/brand";

const C = {
  bgDark: COLORS.obsidian,
  orange: COLORS.champagne,
  purple: COLORS.cobalt,
  white: COLORS.alabaster,
  gray: COLORS.mist,
  green: COLORS.verdant,
};

function Section({ title, children }) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ color: C.orange, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.35rem" }}>
        {title}
      </div>
      <div style={{ color: C.white, fontSize: "0.88rem", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function Chips({ items, color = C.purple }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
      {(items || []).map((it, i) => (
        <span
          key={i}
          style={{
            padding: "0.2rem 0.55rem",
            background: `${color}30`,
            border: `1px solid ${color}`,
            borderRadius: "0.35rem",
            color: C.white,
            fontSize: "0.8rem",
          }}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export default function CreatorsAdmin() {
  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>Creator personas — Pilot</h1>
          <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Tone card generate da analisi di 60k+ messaggi Infloww. Rivedi e approva. Edit disponibile in V6.4.
          </p>
        </div>
        <a href="/admin/dashboard" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>
          ← Dashboard
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        {CREATOR_PERSONAS.map((c) => (
          <div
            key={c.id}
            style={{
              background: `${C.white}05`,
              border: `2px solid ${C.purple}50`,
              borderRadius: "0.75rem",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{c.name}</h2>
              <span style={{
                padding: "0.2rem 0.5rem",
                background: `${C.green}30`,
                border: `1px solid ${C.green}`,
                borderRadius: "0.35rem",
                color: C.green,
                fontSize: "0.7rem",
                fontWeight: 700,
                textTransform: "uppercase",
              }}>
                {c.status || "pilot"}
              </span>
            </div>
            <div style={{ color: C.orange, fontSize: "0.85rem", fontWeight: 700, marginTop: "0.35rem" }}>
              {c.archetype}
            </div>
            {c.emotional_hook && (
              <div style={{
                marginTop: "0.75rem",
                padding: "0.6rem 0.85rem",
                background: `${C.orange}15`,
                border: `1px dashed ${C.orange}`,
                borderRadius: "0.5rem",
                fontSize: "0.9rem",
              }}>
                <div style={{ color: C.orange, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Gancio emotivo
                </div>
                <div style={{ color: C.white, fontStyle: "italic", marginTop: "0.25rem" }}>
                  "{c.emotional_hook}"
                </div>
              </div>
            )}
            <p style={{ color: C.gray, fontSize: "0.88rem", lineHeight: 1.5, marginTop: "0.75rem" }}>
              {c.shortDescription}
            </p>
            {c.hook_mechanics && (
              <>
                <Section title="Illusione da creare">
                  {c.hook_mechanics.illusion}
                </Section>
                <Section title="Dipendenza da costruire">
                  {c.hook_mechanics.dependency}
                </Section>
                <Section title="Segnali concreti da usare">
                  <Chips items={c.hook_mechanics.hook_signals_to_use} color={C.orange} />
                </Section>
              </>
            )}

            <Section title="Opener tipici">
              <Chips items={c.vocabulary?.openers} />
            </Section>

            <Section title="Frasi firma">
              <Chips items={c.vocabulary?.signature_phrases} color={C.orange} />
            </Section>

            <Section title="Emoji primarie">
              <div style={{ fontSize: "1.4rem" }}>{(c.emojis?.primary || []).join(" ")}</div>
            </Section>

            <Section title="Emoji sexy">
              <div style={{ fontSize: "1.4rem" }}>
                {[...(c.emojis?.sexual_light || []), ...(c.emojis?.sexual_strong || [])].join(" ")}
              </div>
            </Section>

            <Section title="Lunghezza / registro">
              ~{c.style?.avg_message_length} char · {c.style?.register}
            </Section>

            <Section title="Stile conversione">
              {c.conversion_style}
            </Section>

            <Section title="Esempi opener">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {(c.example_openers || []).map((e, i) => (
                  <div key={i} style={{ padding: "0.5rem 0.75rem", background: `${C.purple}15`, borderRadius: "0.5rem", fontStyle: "italic" }}>
                    "{e}"
                  </div>
                ))}
              </div>
            </Section>
          </div>
        ))}
      </div>
    </div>
  );
}
