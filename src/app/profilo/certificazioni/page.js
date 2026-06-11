"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LEVEL_META = {
  0: { label: "Non certificato", emoji: "⚪", color: "#666" },
  1: { label: "L1 Base", emoji: "🥉", color: "#CD7F32" },
  2: { label: "L2 Expert", emoji: "🥈", color: "#C0C0C0" },
  3: { label: "L3 Master", emoji: "🥇", color: "#FFD700" },
};

const REQUIREMENTS = [
  { level: 1, sessions: 10, avg: 65 },
  { level: 2, sessions: 25, avg: 75 },
  { level: 3, sessions: 50, avg: 85 },
];

export default function CertificationsPage() {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile");
        const j = await r.json();
        setCerts(j?.certifications || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ background: "#08090F", minHeight: "100vh", color: "#fff", padding: "32px 28px 64px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 18, fontSize: 13, color: "#9CA3AF" }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
          <span style={{ color: "#6B7080", margin: "0 8px" }}>›</span>
          <span style={{ color: "#F5F6F8" }}>Badge Wall</span>
        </div>

        <div style={{ marginBottom: 24 }}>
          <span style={{ color: "#6B7080", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em" }}>Certificazioni</span>
          <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 34, margin: "8px 0 6px 0", fontWeight: 700, letterSpacing: "-0.02em" }}>🎖️ Badge Wall</h1>
          <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0, lineHeight: 1.5, maxWidth: 760 }}>
            Le tue certificazioni per creator. Ogni creator ha il suo tono e le sue dinamiche: certificandoti dimostri di saperla gestire.
          </p>
        </div>

        <div style={{ background: "#13151C", border: "1px solid #23262F", borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 24, color: "#B9BDC7" }}>
          <b>Requisiti</b> (badge permanenti):<br/>
          L1 Base → ≥10 sessioni con quella creator, overall medio ≥65<br/>
          L2 Expert → ≥25 sessioni, overall medio ≥75<br/>
          L3 Master → ≥50 sessioni, overall medio ≥85
        </div>

        {loading && <p>Caricamento…</p>}

        {!loading && (
          <div style={{ display: "grid", gap: "1rem" }}>
            {certs.map((c) => {
              const meta = LEVEL_META[c.level] || LEVEL_META[0];
              const nextLevel = REQUIREMENTS.find((r) => r.level === c.level + 1);
              const progressSess = nextLevel ? Math.min(100, Math.round((c.stats.sessions / nextLevel.sessions) * 100)) : 100;
              return (
                <div
                  key={c.creatorId}
                  style={{
                    background: `${meta.color}10`,
                    border: `2px solid ${meta.color}55`,
                    borderRadius: 12,
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "1.3rem" }}>
                        {c.creatorName} <span style={{ color: "#F5A623", fontSize: "0.7rem", fontWeight: 400, marginLeft: 8 }}>{c.creatorArchetype}</span>
                      </h2>
                      <div style={{ color: meta.color, fontWeight: 800, fontSize: "1.1rem", marginTop: 6 }}>
                        {meta.emoji} {meta.label}
                      </div>
                      {c.achievedAt && c.level > 0 && (
                        <div style={{ color: "#888", fontSize: "0.75rem", marginTop: 4 }}>
                          Ottenuta il {new Date(c.achievedAt).toLocaleDateString("it-IT")}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", color: "#aaa", fontSize: "0.85rem" }}>
                      <div>{c.stats.sessions} sessioni</div>
                      <div>avg {c.stats.avgOverall}</div>
                    </div>
                  </div>

                  {nextLevel && (
                    <div style={{ marginTop: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#888", marginBottom: 4 }}>
                        <span>Prossimo: {LEVEL_META[nextLevel.level].emoji} {LEVEL_META[nextLevel.level].label}</span>
                        <span>{c.stats.sessions}/{nextLevel.sessions} sessioni • avg {c.stats.avgOverall}/{nextLevel.avg}</span>
                      </div>
                      <div style={{ height: 6, background: "#222", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progressSess}%`, background: meta.color, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
