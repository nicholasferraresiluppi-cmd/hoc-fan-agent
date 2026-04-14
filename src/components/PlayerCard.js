"use client";

/**
 * HOC Pro — Player Card V3 (FIFA-style, V10.0 Gamification Overhaul).
 *
 * Stile: Ultimate Team card. Sfondo gradient per tier (bronze/silver/gold/platinum/diamond),
 * rating OVR grande in alto-sinistra, posizione sotto, radar esagonale delle 6 skill al centro,
 * nome + flag tier in basso. Palette HOC Pro come anima dei gradient.
 *
 * Props:
 *   name, position, overall, skills{}, league, seniority, certifications[], totalSessions, compact
 */
import { COLORS, TIER, FONTS, SHADOW } from "@/lib/brand";

const SKILL_KEYS = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];
const SKILL_ABBR = {
  naturalezza: "NAT",
  esclusivita: "ESC",
  dipendenza: "DIP",
  conversione: "CNV",
  tono: "TON",
  gestione_obiezioni: "OBZ",
};
const CERT_EMOJI = { 1: "🥉", 2: "🥈", 3: "🥇" };
const POS_LABEL = {
  operator: "OP", team_lead: "TL", sales_manager: "SM",
  qa_reviewer: "QA", admin: "AD",
};

// Esagono: 6 punti distribuiti ogni 60°, partendo dall'alto
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2; // -90°, -30°, 30°, 90°, 150°, 210°
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function Radar({ values, size = 180, tier }) {
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2 - 18;
  const rings = [0.25, 0.5, 0.75, 1];
  const outer = hexPoints(cx, cy, maxR);
  const normalized = values.map((v) => Math.max(0, Math.min(100, v)) / 100);
  const dataPts = normalized.map((n, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const r = maxR * n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const dataPoly = dataPts.map((p) => p.join(",")).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ display: "block", filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.35))" }}>
      {/* Ring grid */}
      {rings.map((r, i) => {
        const pts = hexPoints(cx, cy, maxR * r);
        return (
          <polygon key={i}
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={tier.text}
            strokeOpacity={0.18}
            strokeWidth={1} />
        );
      })}
      {/* Axes */}
      {outer.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]}
              stroke={tier.text} strokeOpacity={0.18} strokeWidth={1} />
      ))}
      {/* Data area */}
      <polygon points={dataPoly}
        fill={tier.accent}
        fillOpacity={0.55}
        stroke={tier.accent}
        strokeWidth={2.5}
        strokeLinejoin="round" />
      {/* Data points */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3}
                fill={tier.text} stroke={tier.accent} strokeWidth={1.5} />
      ))}
      {/* Vertex labels */}
      {outer.map((p, i) => {
        const key = SKILL_KEYS[i];
        const v = Math.round(values[i]);
        const dx = (p[0] - cx) * 0.22;
        const dy = (p[1] - cy) * 0.22;
        return (
          <g key={key}>
            <text x={p[0] + dx} y={p[1] + dy - 2}
                  textAnchor="middle"
                  fontFamily={FONTS.mono}
                  fontSize="8"
                  fontWeight="700"
                  fill={tier.text}
                  opacity={0.78}
                  letterSpacing="1">
              {SKILL_ABBR[key]}
            </text>
            <text x={p[0] + dx} y={p[1] + dy + 9}
                  textAnchor="middle"
                  fontFamily={FONTS.mono}
                  fontSize="11"
                  fontWeight="800"
                  fill={tier.text}>
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
  const w = compact ? 280 : 320;
  const h = compact ? 420 : 480;
  const ovr = Math.round(overall || 0);
  const pos = POS_LABEL[position] || position;
  const wonCerts = (certifications || []).filter((c) => c.level > 0);
  const skillValues = SKILL_KEYS.map((k) => Math.round(skills?.[k] ?? 0));

  return (
    <div
      style={{
        width: w,
        height: h,
        background: tier.gradient,
        borderRadius: 16,
        boxShadow: `${SHADOW}, inset 0 1px 0 rgba(255,255,255,0.15)`,
        color: tier.text,
        position: "relative",
        overflow: "hidden",
        fontFamily: FONTS.body,
        padding: "18px 18px 14px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Shine overlay */}
      <div style={{
        position: "absolute",
        top: 0, left: "-20%", right: "-20%", height: "55%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)",
        pointerEvents: "none",
      }} />

      {/* Tier stripe */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: 4,
        background: tier.accent,
      }} />

      {/* Header: OVR + POS (left)  —  TIER chip (right) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
        <div>
          <div style={{
            fontFamily: FONTS.mono,
            fontWeight: 800,
            fontSize: compact ? 58 : 68,
            lineHeight: 0.95,
            color: tier.text,
            textShadow: "0 2px 8px rgba(0,0,0,0.25)",
            letterSpacing: "-0.02em",
          }}>
            {ovr}
          </div>
          <div style={{
            marginTop: 6,
            fontFamily: FONTS.mono,
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: "0.18em",
            color: tier.accent,
          }}>
            {pos}
          </div>
          {/* Tiny underline divider */}
          <div style={{ width: 28, height: 2, background: tier.accent, marginTop: 6, borderRadius: 2 }} />
        </div>

        <div style={{
          fontFamily: FONTS.mono,
          fontSize: 9,
          fontWeight: 800,
          padding: "4px 8px 3px",
          background: tier.accent,
          color: tier.ink,
          letterSpacing: "0.22em",
          borderRadius: 3,
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
        }}>
          {tier.label}
        </div>
      </div>

      {/* Radar esagonale centrale */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
        position: "relative",
      }}>
        <Radar values={skillValues} size={compact ? 180 : 210} tier={tier} />
      </div>

      {/* Name + meta */}
      <div style={{
        textAlign: "center",
        marginTop: 4,
        position: "relative",
      }}>
        <div style={{
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: compact ? 17 : 19,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: tier.text,
          lineHeight: 1.1,
          textShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}>
          {name}
        </div>
        <div style={{
          marginTop: 5,
          fontFamily: FONTS.mono,
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: tier.text,
          opacity: 0.75,
          fontWeight: 600,
        }}>
          {totalSessions} SESS · {(seniority || "junior").toUpperCase()}
          {wonCerts.length > 0 && (
            <span style={{ marginLeft: 8, letterSpacing: 0 }}>
              {wonCerts.map((c, i) => (
                <span key={i} style={{ fontSize: 12 }}>{CERT_EMOJI[c.level]}</span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
