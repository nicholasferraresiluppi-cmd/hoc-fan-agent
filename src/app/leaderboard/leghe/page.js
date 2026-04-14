"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const TIER_ORDER = ["diamond", "platinum", "gold", "silver", "bronze"];
const TIER_META = {
  diamond: { label: "Diamond", emoji: "💎", color: "#60A5FA" },
  platinum: { label: "Platinum", emoji: "💠", color: "#E5E4E2" },
  gold: { label: "Gold", emoji: "🥇", color: "#FFD700" },
  silver: { label: "Silver", emoji: "🥈", color: "#C0C0C0" },
  bronze: { label: "Bronze", emoji: "🥉", color: "#CD7F32" },
  unranked: { label: "Unranked", emoji: "⚪", color: "#666" },
};

export default function LeaguesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/leagues/standings");
        const j = await r.json();
        setData(j);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#fff", padding: "2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#F5A623", textDecoration: "none", fontSize: "0.85rem" }}>← Academy</Link>
          <span style={{ color: "#444" }}>•</span>
          <Link href="/leaderboard" style={{ color: "#F5A623", textDecoration: "none", fontSize: "0.85rem" }}>Ladder</Link>
          <span style={{ color: "#444" }}>•</span>
          <Link href="/leaderboard/storico" style={{ color: "#F5A623", textDecoration: "none", fontSize: "0.85rem" }}>Hall of Fame</Link>
        </div>

        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "2rem" }}>Leghe — Stagione {data?.seasonKey || "…"}</h1>
        <p style={{ color: "#888", marginTop: 0 }}>
          Ladder competitiva mensile. Tier assegnato per percentile (top 10% Diamond, poi Platinum, Gold, Silver, Bronze). Min 5 sessioni nel mese per essere classificati.
        </p>

        {loading && <p>Caricamento…</p>}

        {data && !loading && data.totalRanked === 0 && (
          <div style={{ padding: "2rem", background: "#111", border: "1px solid #333", borderRadius: 8, textAlign: "center" }}>
            Nessun operatore classificato in questa stagione. Servono almeno 5 sessioni nel mese.
          </div>
        )}

        {data && data.totalRanked > 0 && (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            {TIER_ORDER.map((tier) => {
              const entries = data.byTier?.[tier] || [];
              if (!entries.length) return null;
              const meta = TIER_META[tier];
              return (
                <div
                  key={tier}
                  style={{
                    background: `${meta.color}10`,
                    border: `2px solid ${meta.color}55`,
                    borderRadius: 12,
                    padding: "1.25rem",
                  }}
                >
                  <h2 style={{ margin: "0 0 0.75rem 0", color: meta.color, fontSize: "1.25rem" }}>
                    {meta.emoji} {meta.label} <span style={{ color: "#777", fontSize: "0.85rem", fontWeight: 400 }}>({entries.length})</span>
                  </h2>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#888", fontSize: "0.75rem" }}>
                        <th style={{ padding: "0.3rem 0.5rem" }}>#</th>
                        <th style={{ padding: "0.3rem 0.5rem" }}>Operatore</th>
                        <th style={{ padding: "0.3rem 0.5rem" }}>Avg</th>
                        <th style={{ padding: "0.3rem 0.5rem" }}>Sessioni</th>
                        <th style={{ padding: "0.3rem 0.5rem" }}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => {
                        const isMe = e.userId === data.me;
                        return (
                          <tr
                            key={e.userId}
                            style={{
                              background: isMe ? `${meta.color}25` : "transparent",
                              borderBottom: "1px solid #222",
                            }}
                          >
                            <td style={{ padding: "0.4rem 0.5rem", color: "#aaa" }}>{e.rank ?? "—"}</td>
                            <td style={{ padding: "0.4rem 0.5rem", fontWeight: isMe ? 800 : 500 }}>
                              {e.name}
                              {isMe && <span style={{ marginLeft: 8, color: "#F5A623", fontSize: "0.75rem" }}>(tu)</span>}
                            </td>
                            <td style={{ padding: "0.4rem 0.5rem" }}>{e.avgOverall}</td>
                            <td style={{ padding: "0.4rem 0.5rem" }}>{e.sessions}</td>
                            <td style={{ padding: "0.4rem 0.5rem" }}>
                              {e.delta == null ? (
                                <span style={{ color: "#555" }}>—</span>
                              ) : e.delta > 0 ? (
                                <span style={{ color: "#10B981" }}>↑ +{e.delta}</span>
                              ) : e.delta < 0 ? (
                                <span style={{ color: "#EF4444" }}>↓ {e.delta}</span>
                              ) : (
                                <span style={{ color: "#888" }}>=</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {(data.byTier?.unranked || []).length > 0 && (
              <div style={{ color: "#666", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {data.byTier.unranked.length} operatori non classificati (meno di 5 sessioni questo mese).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
