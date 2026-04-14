"use client";

/**
 * FIFA Ultimate Team-style player card.
 * Props:
 *   name: string
 *   position: string (short, es. "TL" for Team Lead, "OP" for Operator)
 *   overall: number 0-100
 *   skills: { naturalezza, esclusivita, dipendenza, conversione, tono, gestione_obiezioni } each 0-100
 *   league: "bronze" | "silver" | "gold" | "platinum" | "diamond" | "unranked"
 *   seniority: "junior" | "senior" | "master"
 *   certifications: [{ creatorId, level:0-3 }]
 *   totalSessions?: number
 *   compact?: boolean (più piccolo)
 */

const TIER_THEMES = {
  bronze:   { bg: "linear-gradient(135deg,#6B3410 0%,#8B4513 35%,#CD7F32 70%,#B8722E 100%)", accent: "#FFD8A8", ink: "#2A1505", stroke: "#FFD8A8" },
  silver:   { bg: "linear-gradient(135deg,#4A4A4A 0%,#9A9A9A 35%,#D8D8D8 70%,#B0B0B0 100%)", accent: "#FFFFFF", ink: "#1A1A1A", stroke: "#FFFFFF" },
  gold:     { bg: "linear-gradient(135deg,#8B6914 0%,#D4A017 30%,#FFE066 65%,#F5C430 100%)", accent: "#3A2A00", ink: "#2A1F00", stroke: "#3A2A00" },
  platinum: { bg: "linear-gradient(135deg,#1F2733 0%,#43536A 35%,#B8C6DB 70%,#E2E8F0 100%)", accent: "#0B1220", ink: "#0B1220", stroke: "#0B1220" },
  diamond:  { bg: "linear-gradient(135deg,#0F172A 0%,#1E3A8A 30%,#60A5FA 65%,#E0F2FE 100%)", accent: "#0B1220", ink: "#081028", stroke: "#081028" },
  unranked: { bg: "linear-gradient(135deg,#1A1A1A 0%,#333 50%,#555 100%)", accent: "#DDD", ink: "#FFF", stroke: "#DDD" },
};

const SKILL_KEYS = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];
const SKILL_SHORT = {
  naturalezza: "NAT",
  esclusivita: "ESC",
  dipendenza: "DIP",
  conversione: "CNV",
  tono: "TON",
  gestione_obiezioni: "OBJ",
};

const SENIORITY_EMOJI = { junior: "🌱", senior: "🎖️", master: "👑" };
const CERT_EMOJI = { 0: "", 1: "🥉", 2: "🥈", 3: "🥇" };

function HexagonRadar({ skills, strokeColor, fillColor, accent, size = 180 }) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.42;
  const angles = [-90, -30, 30, 90, 150, 210]; // 6 punte, top first
  const labels = SKILL_KEYS.map((k) => SKILL_SHORT[k]);

  const toRad = (d) => (d * Math.PI) / 180;
  const point = (i, value) => {
    const a = toRad(angles[i]);
    const r = (Math.max(0, Math.min(100, value || 0)) / 100) * maxR;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const outerPoint = (i, ratio = 1) => {
    const a = toRad(angles[i]);
    return [cx + maxR * ratio * Math.cos(a), cy + maxR * ratio * Math.sin(a)];
  };

  const poly = SKILL_KEYS.map((k, i) => point(i, skills?.[k] ?? 0))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {/* Grid esagonale */}
      {gridLevels.map((lv, gi) => {
        const pts = angles.map((_, i) => outerPoint(i, lv)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        return (
          <polygon key={gi} points={pts} fill="none" stroke={strokeColor} strokeOpacity={0.25} strokeWidth={1} />
        );
      })}
      {/* Assi */}
      {angles.map((_, i) => {
        const [x, y] = outerPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={strokeColor} strokeOpacity={0.2} strokeWidth={1} />;
      })}
      {/* Poligono skill */}
      <polygon points={poly} fill={fillColor} fillOpacity={0.55} stroke={strokeColor} strokeWidth={2} />
      {/* Punti */}
      {SKILL_KEYS.map((k, i) => {
        const [x, y] = point(i, skills?.[k] ?? 0);
        return <circle key={k} cx={x} cy={y} r={3} fill={strokeColor} />;
      })}
      {/* Label */}
      {labels.map((lbl, i) => {
        const [x, y] = outerPoint(i, 1.22);
        return (
          <text key={lbl} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fontWeight={800} fill={accent} style={{ letterSpacing: "0.05em" }}>
            {lbl}
          </text>
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
  compact = false,
}) {
  const theme = TIER_THEMES[league] || TIER_THEMES.unranked;
  const w = compact ? 280 : 340;
  const h = compact ? 400 : 480;
  const radarSize = compact ? 150 : 180;
  const ovr = Math.round(overall || 0);

  const wonCerts = (certifications || []).filter((c) => c.level > 0).slice(0, 3);

  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 18,
        background: theme.bg,
        boxShadow: "0 10px 30px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.18)",
        color: theme.ink,
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Shine diagonal overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.12) 100%)",
        pointerEvents: "none",
      }} />

      {/* Inner border frame */}
      <div style={{ position: "absolute", inset: 10, border: `1px solid ${theme.stroke}55`, borderRadius: 14, pointerEvents: "none" }} />

      {/* Header: OVR + pos + emoji seniority */}
      <div style={{ position: "absolute", top: 18, left: 22, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
        <div style={{ fontSize: compact ? 48 : 58, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em", textShadow: "0 2px 0 rgba(0,0,0,0.18)" }}>
          {ovr}
        </div>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 900, letterSpacing: "0.12em" }}>
          {position}
        </div>
        <div style={{ fontSize: compact ? 18 : 22, marginTop: 2 }}>
          {SENIORITY_EMOJI[seniority] || ""}
        </div>
      </div>

      {/* Certificazioni top-right */}
      <div style={{ position: "absolute", top: 18, right: 22, display: "flex", gap: 4 }}>
        {wonCerts.map((c, i) => (
          <div key={i} title={`Livello ${c.level}`} style={{ fontSize: 22, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))" }}>
            {CERT_EMOJI[c.level]}
          </div>
        ))}
      </div>

      {/* Hexagon radar */}
      <div style={{ position: "absolute", top: compact ? 88 : 104, left: "50%", transform: "translateX(-50%)" }}>
        <HexagonRadar
          skills={skills}
          strokeColor={theme.stroke}
          fillColor={theme.stroke}
          accent={theme.ink}
          size={radarSize}
        />
      </div>

      {/* Nome */}
      <div style={{
        position: "absolute",
        left: 0, right: 0,
        bottom: compact ? 86 : 102,
        textAlign: "center",
        fontSize: compact ? 18 : 22,
        fontWeight: 900,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        borderTop: `1px solid ${theme.stroke}55`,
        padding: "10px 14px 0",
      }}>
        {name}
      </div>

      {/* Mini stats 3x2 */}
      <div style={{
        position: "absolute",
        left: 18, right: 18, bottom: 18,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: compact ? "4px 10px" : "6px 14px",
        fontSize: compact ? 11 : 12,
        fontWeight: 800,
        letterSpacing: "0.06em",
      }}>
        {SKILL_KEYS.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: compact ? 13 : 15, fontWeight: 900, minWidth: 22 }}>{Math.round(skills?.[k] ?? 0)}</span>
            <span style={{ opacity: 0.75 }}>{SKILL_SHORT[k]}</span>
          </div>
        ))}
      </div>

      {/* Total sessions micro-label */}
      {totalSessions > 0 && (
        <div style={{ position: "absolute", bottom: 4, right: 14, fontSize: 9, fontWeight: 700, opacity: 0.65, letterSpacing: "0.08em" }}>
          {totalSessions} SESS.
        </div>
      )}
    </div>
  );
}
