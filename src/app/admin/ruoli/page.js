"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  useEffect(() => { load(); }, []);

  const toggleRole = async (userId, currentRoles, roleId) => {
    const set = new Set(currentRoles || []);
    if (set.has(roleId)) set.delete(roleId);
    else set.add(roleId);
    setBusy(userId);
    try {
      await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, roles: Array.from(set) }),
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

  const customMap = Object.fromEntries((data?.custom || []).map((c) => [c.id, c]));

  const roleChip = (rid) => {
    if (data?.meta?.[rid]) {
      const m = data.meta[rid];
      return { label: m.label, emoji: m.emoji, color: m.color };
    }
    if (customMap[rid]) {
      const c = customMap[rid];
      return { label: c.name, emoji: c.emoji, color: c.color };
    }
    return { label: rid, emoji: "?", color: "#6B7080" };
  };

  return (
    <div style={{ background: "#08090F", minHeight: "100vh", color: "#F5F6F8", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>🛡️ Gestione ruoli</h1>
      <p style={{ color: "#6B7080", marginBottom: "1rem" }}>
        Un utente può avere <b>più ruoli</b> contemporaneamente — le capability si sommano (scope più ampio vince).
        I ruoli custom si creano in <Link href="/admin/ruoli-custom" style={{ color: "#4F8CCB" }}>/admin/ruoli-custom</Link>.
      </p>

      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
        {(data?.predefined || []).map((r) => {
          const m = data.meta[r]; if (!m) return null;
          return (
            <div key={r} style={{ border: `1px solid ${m.color}55`, borderRadius: 8, padding: "0.5rem 0.7rem", background: `${m.color}10` }}>
              <div style={{ fontWeight: 700, color: m.color, fontSize: "0.8rem" }}>{m.emoji} {m.label}</div>
              <div style={{ color: "#B9BDC7", fontSize: "0.7rem" }}>{m.description}</div>
            </div>
          );
        })}
        {(data?.custom || []).map((c) => (
          <div key={c.id} style={{ border: `1px solid ${c.color}55`, borderRadius: 8, padding: "0.5rem 0.7rem", background: `${c.color}10` }}>
            <div style={{ fontWeight: 700, color: c.color, fontSize: "0.8rem" }}>{c.emoji} {c.name} <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>CUSTOM</span></div>
            <div style={{ color: "#B9BDC7", fontSize: "0.7rem" }}>{c.description}</div>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtra per nome, email, ID…"
        style={{ padding: "0.5rem 0.75rem", background: "#1B1E26", border: "1px solid #2A2E39", borderRadius: 6, color: "#F5F6F8", marginBottom: "1rem", width: "100%", maxWidth: 400 }}
      />

      {loading && <p>Caricamento…</p>}
      {!loading && filtered.length === 0 && <p>Nessun utente trovato.</p>}
      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #2A2E39" }}>
                <th style={{ padding: "0.5rem" }}>Operatore</th>
                <th style={{ padding: "0.5rem" }}>Ruoli attivi</th>
                <th style={{ padding: "0.5rem" }}>Toggle ruoli</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.userId} style={{ borderBottom: "1px solid #2A2E39" }}>
                  <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "#6B7080" }}>{r.email || r.userId}</div>
                  </td>
                  <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {(r.roles || []).map((rid) => {
                        const c = roleChip(rid);
                        return (
                          <span key={rid} style={{ padding: "0.15rem 0.45rem", borderRadius: 999, background: `${c.color}22`, border: `1px solid ${c.color}`, color: c.color, fontSize: "0.72rem", fontWeight: 700 }}>
                            {c.emoji} {c.label}
                          </span>
                        );
                      })}
                      {(!r.roles || r.roles.length === 0) && <span style={{ color: "#6B7080", fontSize: "0.72rem" }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {[...(data.predefined || []), ...(data?.custom || []).map((c) => c.id)].map((rid) => {
                        const c = roleChip(rid);
                        const active = (r.roles || []).includes(rid);
                        return (
                          <button
                            key={rid}
                            disabled={busy === r.userId}
                            onClick={() => toggleRole(r.userId, r.roles, rid)}
                            title={active ? "Rimuovi" : "Aggiungi"}
                            style={{
                              padding: "0.2rem 0.5rem",
                              background: active ? c.color : "transparent",
                              color: active ? "#08090F" : c.color,
                              border: `1px solid ${c.color}`,
                              borderRadius: 4,
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              cursor: busy === r.userId ? "wait" : "pointer",
                              opacity: busy === r.userId ? 0.5 : 1,
                            }}
                          >
                            {active ? "✓" : "+"} {c.emoji} {c.label}
                          </button>
                        );
                      })}
                    </div>
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
