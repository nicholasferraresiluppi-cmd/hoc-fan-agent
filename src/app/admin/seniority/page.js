"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

const TIER_EMOJI = { junior: "🌱", senior: "⭐", master: "👑" };
const TIER_COLOR = { junior: "#3FB97E", senior: "#D4AF7A", master: "#4F8CCB" };

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
    <div style={{ background: "#08090F", minHeight: "100vh", color: "#F5F6F8", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>Seniority operatori</h1>
      <p style={{ color: "#6B7080", marginBottom: "1rem" }}>
        Tier auto-calcolato da sessioni totali + overall medio recente. Override manuale disponibile.
      </p>
      <div style={{ background: "#D4AF7A10", border: "1px solid #D4AF7A40", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.85rem", marginBottom: "1.5rem", color: "#B9BDC7" }}>
        <b>Soglie:</b> Senior = ≥30 sessioni totali + overall medio ultime 30 ≥ 70 • Master = ≥100 sessioni totali + overall medio ultime 50 ≥ 80
      </div>

      {loading && <p>Caricamento…</p>}
      {data?.rows?.length === 0 && <p>Nessun operatore con sessioni.</p>}
      {data?.rows?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #2A2E39" }}>
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
                <tr key={r.userId} style={{ borderBottom: "1px solid #2A2E39" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "#6B7080" }}>{r.userId}</div>
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{ color: TIER_COLOR[r.tier], fontWeight: 700 }}>
                      {TIER_EMOJI[r.tier]} {r.tier}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem", color: "#B9BDC7" }}>{r.auto}</td>
                  <td style={{ padding: "0.5rem", color: r.override ? "#D4AF7A" : "#6B7080" }}>{r.override || "—"}</td>
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
                          color: r.override === t ? "#08090F" : TIER_COLOR[t],
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
                        color: "#6B7080",
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
