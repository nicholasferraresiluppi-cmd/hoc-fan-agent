"use client";

import { useEffect, useState } from "react";

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
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#fff", padding: "2rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <a href="/" style={{ color: "#F5A623", textDecoration: "none", fontSize: "0.85rem" }}>← Academy</a>
        </div>

        <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "2rem" }}>🎖️ Badge Wall</h1>
        <p style={{ color: "#888", marginTop: 0 }}>
          Le tue certificazioni per creator. Ogni creator ha il suo tono e le sue dinamiche: certificandoti dimostri di saperla gestire.
        </p>

        <div style={{ background: "#F5A62310", border: "1px solid #F5A62340", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.85rem", margin: "1rem 0 1.5rem 0" }}>
          <b>Requisiti</b> (badge permanenti, una volta ottenuti non si perdono):<br/>
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
                        {c.creatorName} <span style={{ color: "#F5A623", fontSize: "0.7rem", fontWeight: 400, textTransform: "uppercase", marginLeft: 8 }}>{c.creatorArchetype}</span>
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
    </div>
  );
}
