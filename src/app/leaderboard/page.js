"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#EF4444",
  white: "#F9FAFB",
  gray: "#9CA3AF",
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
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
  const medal = medalForRank(place);
  const heights = { 1: 140, 2: 110, 3: 90 };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", flex: 1 }}>
      <div style={{ fontSize: "2rem" }}>{medal?.emoji}</div>
      <div
        style={{
          width: "100%",
          maxWidth: 180,
          padding: "0.9rem 0.6rem",
          background: entry?.isMe ? `${C.orange}25` : `${C.white}06`,
          border: `2px solid ${entry?.isMe ? C.orange : medal?.color || C.purple}`,
          borderRadius: "0.75rem",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.white, marginBottom: "0.35rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry?.name || "—"}
        </div>
        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: medal?.color || C.white }}>
          {entry?.avg ?? "—"}
        </div>
        <div style={{ fontSize: "0.7rem", color: C.gray, marginTop: "0.2rem" }}>
          {entry?.sessions ?? 0} sess.
        </div>
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 180,
          height: heights[place],
          background: `linear-gradient(180deg, ${medal?.color}40 0%, ${medal?.color}15 100%)`,
          borderTop: `3px solid ${medal?.color}`,
          borderRadius: "0.25rem 0.25rem 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: medal?.color,
          fontSize: "1.75rem",
          fontWeight: 800,
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
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.75rem" }}>🏆 Classifica</h1>
            <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
              I migliori operatori per score medio. Minimo {data?.minSessions || 2} sessioni per qualificarsi.
            </p>
          </div>
          <a href="/" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>
            ← Home
          </a>
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
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "2rem", padding: "1rem 0" }}>
                <PodiumCard entry={podium[1]} place={2} />
                <PodiumCard entry={podium[0]} place={1} />
                <PodiumCard entry={podium[2]} place={3} />
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
