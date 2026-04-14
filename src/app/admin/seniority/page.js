"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

const TIER_EMOJI = { junior: "🌱", senior: "⭐", master: "👑" };
const TIER_COLOR = { junior: "#10B981", senior: "#F5A623", master: "#8B5CF6" };

export default function SeniorityAdminPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seniority");
      const j = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setTier = async (userId, tier) => {
    setBusy(userId);
    try {
      await fetch("/api/admin/seniority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#fff", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>Seniority operatori</h1>
      <p style={{ color: "#888", marginBottom: "1rem" }}>
        Tier auto-calcolato da sessioni totali + overall medio recente. Override manuale disponibile.
      </p>
      <div style={{ background: "#F5A62310", border: "1px solid #F5A62340", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.85rem", marginBottom: "1.5rem", color: "#ddd" }}>
        <b>Soglie:</b> Senior = ≥30 sessioni totali + overall medio ultime 30 ≥ 70 • Master = ≥100 sessioni totali + overall medio ultime 50 ≥ 80
      </div>

      {loading && <p>Caricamento…</p>}
      {data?.rows?.length === 0 && <p>Nessun operatore con sessioni.</p>}
      {data?.rows?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                <th style={{ padding: "0.5rem" }}>Operatore</th>
                <th style={{ padding: "0.5rem" }}>Tier attivo</th>
                <th style={{ padding: "0.5rem" }}>Auto</th>
                <th style={{ padding: "0.5rem" }}>Override</th>
                <th style={{ padding: "0.5rem" }}>Sessioni</th>
                <th style={{ padding: "0.5rem" }}>Avg 30</th>
                <th style={{ padding: "0.5rem" }}>Avg 50</th>
                <th style={{ padding: "0.5rem" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "#666" }}>{r.userId}</div>
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{ color: TIER_COLOR[r.tier], fontWeight: 700 }}>
                      {TIER_EMOJI[r.tier]} {r.tier}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem", color: "#aaa" }}>{r.auto}</td>
                  <td style={{ padding: "0.5rem", color: r.override ? "#F5A623" : "#555" }}>{r.override || "—"}</td>
                  <td style={{ padding: "0.5rem" }}>{r.totalSessions}</td>
                  <td style={{ padding: "0.5rem" }}>{r.avgRecent30 || "—"}</td>
                  <td style={{ padding: "0.5rem" }}>{r.avgRecent50 || "—"}</td>
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                    {["junior", "senior", "master"].map((t) => (
                      <button
                        key={t}
                        disabled={busy === r.userId}
                        onClick={() => setTier(r.userId, t)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: r.override === t ? TIER_COLOR[t] : "transparent",
                          color: r.override === t ? "#0D0D0D" : TIER_COLOR[t],
                          border: `1px solid ${TIER_COLOR[t]}`,
                          borderRadius: 4,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                    <button
                      disabled={busy === r.userId || !r.override}
                      onClick={() => setTier(r.userId, null)}
                      style={{
                        padding: "0.25rem 0.5rem",
                        background: "transparent",
                        color: "#888",
                        border: "1px solid #444",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        cursor: r.override ? "pointer" : "not-allowed",
                      }}
                    >
                      reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
