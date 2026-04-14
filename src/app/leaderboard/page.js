"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { COLORS, FONTS } from "@/lib/brand";

const C = {
  bgDark: COLORS.obsidian,
  orange: COLORS.champagne,
  purple: COLORS.cobalt,
  green: COLORS.verdant,
  yellow: COLORS.champagneDeep,
  red: COLORS.signal,
  white: COLORS.alabaster,
  gray: COLORS.mist,
  gold: "#F2D488",
  silver: "#DADEE6",
  bronze: "#C87D46",
};

const PODIUM_TIER = {
  1: { grad: "linear-gradient(165deg, #7A5A1F 0%, #C59436 45%, #F2CC72 100%)", accent: "#F2D488", label: "CHAMPION", ink: "#2C1E06" },
  2: { grad: "linear-gradient(165deg, #4A4F5B 0%, #8A93A3 45%, #C9D0DC 100%)", accent: "#DADEE6", label: "RUNNER-UP", ink: "#15181E" },
  3: { grad: "linear-gradient(165deg, #6B3E1F 0%, #A8612F 45%, #D1833D 100%)", accent: "#C87D46", label: "THIRD", ink: "#2B1709" },
};

const PERIODS = [
  { key: "week", label: "Settimana" },
  { key: "month", label: "Mese" },
  { key: "all", label: "All-time" },
];

const SKILLS = [
  { key: "overall", label: "Overall" },
  { key: "naturalezza", label: "Naturalezza" },
  { key: "esclusivita", label: "Esclusività" },
  { key: "dipendenza", label: "Dipendenza" },
  { key: "conversione", label: "Conversione" },
  { key: "tono", label: "Tono creator" },
  { key: "gestione_obiezioni", label: "Gestione obiezioni" },
];

function medalForRank(r) {
  if (r === 1) return { emoji: "👑", color: C.gold };
  if (r === 2) return { emoji: "🥈", color: C.silver };
  if (r === 3) return { emoji: "🥉", color: C.bronze };
  return null;
}

function PodiumCard({ entry, place }) {
  const tier = PODIUM_TIER[place];
  const heights = { 1: 170, 2: 130, 3: 100 };
  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const isWinner = place === 1;
  const glowKeyframes = isWinner ? {
    animation: "hocGlow 2.4s ease-in-out infinite",
  } : {};
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem", flex: 1, position: "relative" }}>
      {isWinner && (
        <div style={{ position: "absolute", top: -18, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: "0.3em", color: tier.accent, fontWeight: 800 }}>
          ★ {tier.label} ★
        </div>
      )}
      {!isWinner && (
        <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: "0.26em", color: tier.accent, fontWeight: 800, opacity: 0.75 }}>
          {tier.label}
        </div>
      )}
      <div style={{ fontSize: isWinner ? "2.2rem" : "1.7rem", filter: `drop-shadow(0 0 12px ${tier.accent}88)` }}>
        {medals[place]}
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: isWinner ? 200 : 170,
          padding: isWinner ? "1rem 0.75rem" : "0.8rem 0.6rem",
          background: tier.grad,
          border: `1px solid ${tier.accent}88`,
          borderRadius: 12,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          boxShadow: entry?.isMe
            ? `0 0 0 2px ${C.orange}, 0 10px 30px rgba(0,0,0,0.45)`
            : `0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)`,
          ...glowKeyframes,
        }}
      >
        <div style={{ position: "absolute", top: 0, left: "-20%", right: "-20%", height: "55%", background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))", pointerEvents: "none" }} />
        <div style={{ fontFamily: FONTS.mono, fontSize: isWinner ? 48 : 38, fontWeight: 800, letterSpacing: "-0.02em", color: tier.ink, lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
          {entry?.avg ?? "—"}
        </div>
        <div style={{ width: 24, height: 2, background: tier.ink, margin: "0.45rem auto 0.4rem", opacity: 0.55, borderRadius: 2 }} />
        <div style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: isWinner ? "0.95rem" : "0.85rem", color: tier.ink, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry?.name || "—"}
        </div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, color: tier.ink, opacity: 0.7, marginTop: 4, letterSpacing: "0.14em" }}>
          {entry?.sessions ?? 0} SESS
        </div>
        {entry?.isMe && (
          <div style={{ position: "absolute", top: 6, right: 6, fontFamily: FONTS.mono, fontSize: 8, padding: "2px 5px", background: C.orange, color: C.bgDark, fontWeight: 800, letterSpacing: "0.14em", borderRadius: 2 }}>
            TU
          </div>
        )}
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 200,
          height: heights[place],
          background: `linear-gradient(180deg, ${tier.accent}55 0%, ${tier.accent}18 60%, ${tier.accent}08 100%)`,
          borderTop: `4px solid ${tier.accent}`,
          borderLeft: `1px solid ${tier.accent}30`,
          borderRight: `1px solid ${tier.accent}30`,
          borderRadius: "4px 4px 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tier.accent,
          fontFamily: FONTS.mono,
          fontSize: isWinner ? "2.4rem" : "2rem",
          fontWeight: 800,
          textShadow: `0 0 20px ${tier.accent}88`,
        }}
      >
        {place}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { isLoaded, user } = useUser();
  const [period, setPeriod] = useState("week");
  const [skill, setSkill] = useState("overall");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}&skill=${skill}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.top10) setError(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [isLoaded, period, skill]);

  const top10 = data?.top10 || [];
  const me = data?.me;
  const podium = [top10[0], top10[1], top10[2]];
  const rest = top10.slice(3);

  const percentileBadge = (p) => {
    if (p === null || p === undefined) return null;
    const topX = 100 - p + 1;
    let color = C.gray;
    if (topX <= 10) color = C.gold;
    else if (topX <= 25) color = C.green;
    else if (topX <= 50) color = C.yellow;
    else color = C.gray;
    return (
      <span
        style={{
          padding: "0.25rem 0.6rem",
          background: `${color}25`,
          border: `1px solid ${color}`,
          borderRadius: "0.4rem",
          color,
          fontWeight: 700,
          fontSize: "0.8rem",
        }}
      >
        Top {topX}%
      </span>
    );
  };

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <style>{`
        @keyframes hocGlow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(242,212,136,0.35), 0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 4px rgba(242,212,136,0.55), 0 10px 40px rgba(242,212,136,0.35), inset 0 1px 0 rgba(255,255,255,0.25); }
        }
        @keyframes hocRise {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .hoc-podium-item { animation: hocRise 0.5s ease-out both; }
      `}</style>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.75rem" }}>🏆 Ladder</h1>
            <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
              I migliori operatori per score medio. Minimo {data?.minSessions || 2} sessioni per qualificarsi.
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <a href="/leaderboard/storico" style={{ color: C.gold, textDecoration: "none", fontSize: "0.9rem" }}>
              🏛️ Hall of Fame
            </a>
            <a href="/" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>
              ← Home
            </a>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: "0.45rem 0.9rem",
                  background: period === p.key ? C.orange : `${C.white}08`,
                  color: period === p.key ? C.bgDark : C.white,
                  border: `1px solid ${period === p.key ? C.orange : C.purple + "40"}`,
                  borderRadius: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            style={{
              padding: "0.45rem 0.75rem",
              background: `${C.white}08`,
              color: C.white,
              border: `1px solid ${C.purple}40`,
              borderRadius: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {SKILLS.map((s) => (
              <option key={s.key} value={s.key} style={{ background: C.bgDark }}>
                {s.label}
              </option>
            ))}
          </select>
          <div style={{ color: C.gray, fontSize: "0.8rem", marginLeft: "auto" }}>
            {data?.totalQualifying || 0} operatori qualificati
          </div>
        </div>

        {loading && <div style={{ color: C.gray }}>Caricamento...</div>}
        {error && !loading && <div style={{ color: C.red }}>Errore: {error}</div>}

        {!loading && !error && (
          <>
            {/* Me card */}
            {me && (
              <div
                style={{
                  background: me.rank ? `${C.orange}15` : `${C.white}05`,
                  border: `2px solid ${me.rank ? C.orange : C.purple + "40"}`,
                  borderRadius: "0.85rem",
                  padding: "1rem 1.25rem",
                  marginBottom: "1.5rem",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "1rem",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ fontSize: "1.5rem" }}>{me.rank ? "📍" : "🎯"}</div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: C.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      La tua posizione
                    </div>
                    {me.rank ? (
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.2rem" }}>
                        #{me.rank} su {me.totalOperators} — {me.avg}/100 · {me.sessions} sessioni
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.95rem", color: C.gray, marginTop: "0.2rem" }}>
                        Non qualificato. {me.reason}
                      </div>
                    )}
                  </div>
                </div>
                {me.rank && percentileBadge(me.percentile)}
              </div>
            )}

            {/* Podium */}
            {top10.length >= 3 && (
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "2.5rem", padding: "1.5rem 0 0", justifyContent: "center" }}>
                <div className="hoc-podium-item" style={{ flex: 1, animationDelay: "0.15s", maxWidth: 200 }}>
                  <PodiumCard entry={podium[1]} place={2} />
                </div>
                <div className="hoc-podium-item" style={{ flex: 1, animationDelay: "0s", maxWidth: 220 }}>
                  <PodiumCard entry={podium[0]} place={1} />
                </div>
                <div className="hoc-podium-item" style={{ flex: 1, animationDelay: "0.3s", maxWidth: 200 }}>
                  <PodiumCard entry={podium[2]} place={3} />
                </div>
              </div>
            )}

            {/* Rest of top 10 */}
            {rest.length > 0 && (
              <div
                style={{
                  background: `${C.white}05`,
                  border: `1px solid ${C.purple}30`,
                  borderRadius: "0.75rem",
                  overflow: "hidden",
                }}
              >
                {rest.map((e) => (
                  <div
                    key={e.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "0.75rem 1.25rem",
                      borderTop: `1px solid ${C.purple}20`,
                      background: e.isMe ? `${C.orange}15` : "transparent",
                    }}
                  >
                    <div style={{ width: 32, textAlign: "center", color: C.gray, fontWeight: 700 }}>
                      #{e.rank}
                    </div>
                    <div style={{ flex: 1, fontWeight: 700 }}>
                      {e.name} {e.isMe && <span style={{ color: C.orange, fontSize: "0.75rem", marginLeft: "0.4rem" }}>(tu)</span>}
                    </div>
                    <div style={{ color: C.gray, fontSize: "0.8rem" }}>{e.sessions} sess.</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: e.avg >= 75 ? C.green : e.avg >= 60 ? C.yellow : C.white, minWidth: 50, textAlign: "right" }}>
                      {e.avg}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {top10.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", color: C.gray, background: `${C.white}05`, borderRadius: "0.75rem", border: `1px solid ${C.purple}30` }}>
                Nessun operatore qualificato in questo periodo. Servono almeno {data?.minSessions || 2} sessioni con valutazione.
              </div>
            )}

            {top10.length > 0 && top10.length < 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {top10.map((e) => {
                  const medal = medalForRank(e.rank);
                  return (
                    <div
                      key={e.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "0.85rem 1.25rem",
                        background: e.isMe ? `${C.orange}15` : `${C.white}05`,
                        border: `2px solid ${medal?.color || C.purple}40`,
                        borderRadius: "0.75rem",
                      }}
                    >
                      <div style={{ fontSize: "1.5rem" }}>{medal?.emoji}</div>
                      <div style={{ flex: 1, fontWeight: 700 }}>{e.name} {e.isMe && <span style={{ color: C.orange, fontSize: "0.75rem" }}>(tu)</span>}</div>
                      <div style={{ color: C.gray, fontSize: "0.8rem" }}>{e.sessions} sess.</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: medal?.color || C.white }}>{e.avg}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
