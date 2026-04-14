"use client";

import { FAN_ARCHETYPES } from "@/lib/fan-archetypes";
import AdminNav from "@/components/AdminNav";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#EF4444",
  white: "#F9FAFB",
  gray: "#9CA3AF",
};

function diffColor(d) {
  if (d <= 2) return C.green;
  if (d === 3) return C.yellow;
  return C.red;
}
function diffLabel(d) {
  if (d <= 2) return "Facile";
  if (d === 3) return "Medio";
  return "Difficile";
}

function Section({ title, color, children }) {
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ color, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.3rem" }}>{title}</div>
      <div style={{ color: C.white, fontSize: "0.85rem", lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

function Chips({ items, color = C.purple }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
      {(items || []).map((it, i) => (
        <span key={i} style={{ padding: "0.2rem 0.5rem", background: `${color}25`, border: `1px solid ${color}60`, borderRadius: "0.3rem", color: C.white, fontSize: "0.75rem" }}>{it}</span>
      ))}
    </div>
  );
}

export default function FanArchetypesPage() {
  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>👥 Fan Archetypes</h1>
          <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            {FAN_ARCHETYPES.length} tipologie di fan derivate da pattern ricorrenti. Usate nei training per variare scenari e nelle valutazioni per contestualizzare le strategie ottimali.
          </p>
        </div>
        <a href="/admin" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>← Hub Admin</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        {FAN_ARCHETYPES.map((a) => {
          const dc = diffColor(a.difficulty);
          return (
            <div key={a.id} style={{ background: `${C.white}05`, border: `1px solid ${C.purple}30`, borderRadius: "0.85rem", padding: "1.1rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.35rem" }}>
                <span style={{ fontSize: "1.4rem" }}>{a.emoji}</span>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>{a.name}</h3>
                <span style={{ marginLeft: "auto", padding: "0.15rem 0.5rem", fontSize: "0.7rem", fontWeight: 700, color: dc, background: `${dc}20`, border: `1px solid ${dc}`, borderRadius: "0.3rem" }}>
                  {diffLabel(a.difficulty)}
                </span>
              </div>
              <div style={{ color: C.gray, fontSize: "0.85rem", lineHeight: 1.45 }}>{a.profile}</div>

              <Section title="💭 Bisogno emotivo" color={C.purple}>{a.emotional_need}</Section>
              <Section title="🎯 Segnali" color={C.yellow}><Chips items={a.signals} color={C.yellow} /></Section>
              <Section title="✅ Strategia ottimale" color={C.green}>{a.conversion_strategy}</Section>
              <Section title="⚠️ Trappole" color={C.red}>{a.avoid}</Section>

              <div style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: `1px solid ${C.purple}20`, display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: C.gray }}>
                <span><code>{a.id}</code></span>
                <span>LTV: {a.typical_ltv}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
