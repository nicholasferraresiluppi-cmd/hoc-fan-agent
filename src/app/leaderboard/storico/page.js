"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  yellow: "#F59E0B",
  white: "#F9FAFB",
  gray: "#9CA3AF",
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
};

const SKILL_LABELS = {
  naturalezza: "Naturalezza",
  esclusivita: "Esclusività",
  dipendenza: "Dipendenza",
  conversione: "Conversione",
  tono: "Tono creator",
  gestione_obiezioni: "Gestione obiezioni",
};

function fmtRange(startMs, endMs) {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const opt = { day: "2-digit", month: "short" };
  return `${s.toLocaleDateString("it-IT", opt)} → ${e.toLocaleDateString("it-IT", opt)}`;
}

export default function HallOfFamePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard/history?limit=26")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const snaps = data?.snapshots || [];
  const hof = data?.hallOfFame || [];

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.75rem" }}>🏛️ Hall of Fame</h1>
            <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
              Albo dei campioni settimana per settimana.
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <Link href="/leaderboard" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>← Ladder corrente</Link>
            <Link href="/" style={{ color: C.gray, textDecoration: "none", fontSize: "0.9rem" }}>Academy</Link>
          </div>
        </div>

        {loading && <div style={{ color: C.gray }}>Caricamento...</div>}

        {!loading && snaps.length === 0 && (
          <div style={{ padding: "2rem", textAlign: "center", color: C.gray, background: `${C.white}05`, borderRadius: "0.75rem", border: `1px solid ${C.purple}30` }}>
            Nessuno snapshot salvato ancora. Il primo verrà creato al prossimo run settimanale (lunedì notte).
          </div>
        )}

        {/* Hall of Fame — most wins */}
        {hof.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.75rem 0", color: C.gold }}>👑 Più vittorie settimanali</h2>
            <div style={{ background: `${C.gold}10`, border: `1px solid ${C.gold}40`, borderRadius: "0.75rem", overflow: "hidden" }}>
              {hof.map((h, i) => (
                <div key={h.userId} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.25rem", borderTop: i === 0 ? "none" : `1px solid ${C.gold}20` }}>
                  <div style={{ width: 28, textAlign: "center", fontWeight: 700, color: C.gold }}>#{i + 1}</div>
                  <div style={{ flex: 1, fontWeight: 700 }}>{h.name}</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>{h.wins} {h.wins === 1 ? "vittoria" : "vittorie"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Snapshots timeline */}
        {snaps.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {snaps.map((s) => (
              <div key={s.weekKey} style={{ background: `${C.white}05`, border: `1px solid ${C.purple}30`, borderRadius: "0.85rem", padding: "1.1rem 1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{s.weekKey}</div>
                  <div style={{ color: C.gray, fontSize: "0.8rem" }}>
                    {fmtRange(s.periodStart, s.periodEnd)} · {s.totalQualifying} qualificati · {s.totalSessions} sessioni
                  </div>
                </div>

                {/* Podium top 3 */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  {s.top3.map((e, i) => {
                    const color = [C.gold, C.silver, C.bronze][i];
                    const medal = ["🥇", "🥈", "🥉"][i];
                    return (
                      <div key={e.userId} style={{ flex: "1 1 180px", padding: "0.6rem 0.8rem", background: `${color}15`, border: `1px solid ${color}50`, borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.2rem" }}>{medal}</span>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                          <div style={{ color: C.gray, fontSize: "0.7rem" }}>{e.sessions} sess.</div>
                        </div>
                        <div style={{ fontWeight: 800, color }}>{e.overall}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Skill champions */}
                {Object.keys(s.skillChampions || {}).length > 0 && (
                  <details>
                    <summary style={{ cursor: "pointer", color: C.orange, fontSize: "0.85rem", fontWeight: 700 }}>
                      Campioni per skill ({Object.keys(s.skillChampions).length})
                    </summary>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem", marginTop: "0.6rem" }}>
                      {Object.entries(s.skillChampions).map(([k, v]) => (
                        <div key={k} style={{ padding: "0.5rem 0.7rem", background: `${C.purple}15`, border: `1px solid ${C.purple}40`, borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                          <div style={{ color: C.gray, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>{SKILL_LABELS[k] || k}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem" }}>
                            <span style={{ fontWeight: 700 }}>{v.name}</span>
                            <span style={{ fontWeight: 800, color: C.purple }}>{v.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
