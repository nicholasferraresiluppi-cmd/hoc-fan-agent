"use client";

/**
 * HOC Pro — Player Card (Dossier version, V9.0).
 * Stile: dossier performance, non videogame. Sfondo charcoal uniforme, champagne come unico
 * accento, numeri in monospace, tier come micro-badge. No gradient FIFA.
 *
 * Props:
 *   name, position, overall, skills{}, league, seniority, certifications[], totalSessions, compact
 */
import { COLORS, TIER, FONTS, SHADOW } from "@/lib/brand";

const SKILL_KEYS = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];
const SKILL_LABEL = {
  naturalezza: "Naturalezza",
  esclusivita: "Esclusività",
  dipendenza: "Dipendenza",
  conversione: "Conversione",
  tono: "Tono",
  gestione_obiezioni: "Obiezioni",
};
const SENIORITY_LABEL = { junior: "Junior", senior: "Senior", master: "Master" };
const CERT_EMOJI = { 1: "🥉", 2: "🥈", 3: "🥇" };

function colorForValue(v) {
  if (v >= 80) return COLORS.verdant;
  if (v >= 60) return COLORS.alabaster;
  if (v >= 40) return COLORS.ember;
  return COLORS.signal;
}

export default function PlayerCard({
  name = "Operatore",
  position = "OP",
  overall = 0,
  skills = {},
  league = "unranked",
  seniority = "junior",
  certifications = [],
  totalSessions = 0,
  lastActivity = null,
  compact = false,
}) {
  const tier = TIER[league] || TIER.unranked;
  const w = compact ? 300 : 340;
  const h = compact ? 440 : 480;
  const ovr = Math.round(overall || 0);
  const wonCerts = (certifications || []).filter((c) => c.level > 0);

  return (
    <div
      style={{
        width: w,
        minHeight: h,
        background: COLORS.charcoal,
        border: `1px solid ${COLORS.steel}`,
        borderRadius: 18,
        boxShadow: SHADOW,
        color: COLORS.alabaster,
        position: "relative",
        overflow: "hidden",
        fontFamily: FONTS.body,
        padding: "22px",
      }}
    >
      {/* Tier bar on top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: tier.accent,
        }}
      />

      {/* Tier chip top-right */}
      <div
        style={{
          position: "absolute",
          top: 18,
          right: 22,
          fontFamily: FONTS.mono,
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 8px",
          border: `1px solid ${tier.accent}`,
          color: tier.accent,
          letterSpacing: "0.14em",
          borderRadius: 4,
        }}
      >
        TIER · {tier.label}
      </div>

      {/* Overall */}
      <div
        style={{
          fontFamily: FONTS.mono,
          fontWeight: 700,
          fontSize: compact ? 52 : 64,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: COLORS.alabaster,
        }}
      >
        {ovr}
      </div>
      <div
        style={{
          fontSize: 10,
          color: COLORS.mist,
          letterSpacing: "0.18em",
          fontWeight: 600,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        Overall
      </div>

      {/* Position / role */}
      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: COLORS.champagne,
          letterSpacing: "0.16em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {position}
      </div>

      {/* Divider */}
      <hr style={{ border: 0, borderTop: `1px solid ${COLORS.steel}`, margin: "16px 0" }} />

      {/* Name */}
      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: compact ? 18 : 20,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          lineHeight: 1.2,
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: COLORS.mist, flexWrap: "wrap" }}>
        <span>
          {SENIORITY_LABEL[seniority] || "Junior"} · {totalSessions} sess.
        </span>
        {lastActivity && (
          <>
            <span>·</span>
            <span style={{ fontFamily: FONTS.mono }}>{lastActivity}</span>
          </>
        )}
      </div>

      {/* Stats grid 2x3 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px 24px",
          marginTop: 16,
        }}
      >
        {SKILL_KEYS.map((k) => {
          const v = Math.round(skills?.[k] ?? 0);
          return (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "6px 0",
                borderBottom: `1px solid ${COLORS.steel}`,
              }}
            >
              <span
                style={{
                  color: COLORS.mist,
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {SKILL_LABEL[k]}
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontWeight: 700,
                  fontSize: 14,
                  color: colorForValue(v),
                }}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: FONTS.mono,
          fontSize: 10,
          color: COLORS.mist,
          marginTop: 16,
          paddingTop: 10,
          borderTop: `1px solid ${COLORS.steel}`,
          letterSpacing: "0.1em",
        }}
      >
        <span>HOC PRO · DOSSIER</span>
        <span style={{ fontSize: 14 }}>
          {wonCerts.map((c, i) => (
            <span key={i} title={`Livello ${c.level}`} style={{ marginLeft: 2 }}>
              {CERT_EMOJI[c.level]}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
