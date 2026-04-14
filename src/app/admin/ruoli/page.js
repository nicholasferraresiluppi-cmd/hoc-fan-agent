"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

export default function RolesAdminPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      const j = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setRole = async (userId, role) => {
    setBusy(userId);
    try {
      await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const filtered = (data?.rows || []).filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (r.name || "").toLowerCase().includes(f) || (r.email || "").toLowerCase().includes(f) || r.userId.toLowerCase().includes(f);
  });

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#fff", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>Gestione ruoli</h1>
      <p style={{ color: "#888", marginBottom: "1rem" }}>
        Assegna un ruolo a ciascun operatore. Il ruolo determina le capability accessibili nell'app. Ruolo default: <code style={{ color: "#10B981" }}>operator</code>.
      </p>

      {data?.meta && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {data.roles.map((r) => {
            const m = data.meta[r];
            return (
              <div key={r} style={{ border: `1px solid ${m.color}55`, borderRadius: 8, padding: "0.6rem 0.8rem", background: `${m.color}10` }}>
                <div style={{ fontWeight: 700, color: m.color }}>{m.emoji} {m.label}</div>
                <div style={{ color: "#aaa", fontSize: "0.75rem" }}>{m.description}</div>
              </div>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtra per nome, email, ID…"
        style={{ padding: "0.5rem 0.75rem", background: "#111", border: "1px solid #333", borderRadius: 6, color: "#fff", marginBottom: "1rem", width: "100%", maxWidth: 400 }}
      />

      {loading && <p>Caricamento…</p>}
      {!loading && filtered.length === 0 && <p>Nessun utente trovato.</p>}
      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                <th style={{ padding: "0.5rem" }}>Operatore</th>
                <th style={{ padding: "0.5rem" }}>Ruolo attuale</th>
                <th style={{ padding: "0.5rem" }}>Cambia ruolo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const m = data.meta[r.role] || { color: "#888", label: r.role, emoji: "" };
                return (
                  <tr key={r.userId} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "#666" }}>{r.email || r.userId}</div>
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <span style={{ color: m.color, fontWeight: 700 }}>
                        {m.emoji} {m.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {data.roles.map((role) => {
                          const rm = data.meta[role];
                          const active = r.role === role;
                          return (
                            <button
                              key={role}
                              disabled={busy === r.userId || active}
                              onClick={() => setRole(r.userId, role)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                background: active ? rm.color : "transparent",
                                color: active ? "#0D0D0D" : rm.color,
                                border: `1px solid ${rm.color}`,
                                borderRadius: 4,
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: active ? "default" : "pointer",
                                opacity: busy === r.userId ? 0.5 : 1,
                              }}
                            >
                              {rm.emoji} {role}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
