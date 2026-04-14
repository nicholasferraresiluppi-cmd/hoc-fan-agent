"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

export default function TeamsAdminPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/teams");
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (action, payload = {}) => {
    setBusy(true);
    try {
      await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const allMembers = [
    ...(data?.teams || []).flatMap((t) => t.members || []),
    ...(data?.unassigned || []),
  ];

  return (
    <div style={{ background: "#08090F", minHeight: "100vh", color: "#F5F6F8", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>Team</h1>
      <p style={{ color: "#6B7080", marginBottom: "1rem" }}>
        Un operatore appartiene a 1 team. Il Team Lead del team vede le sessioni dei propri operatori.
      </p>

      {/* Create team */}
      <div style={{ background: "#1B1E26", border: "1px solid #2A2E39", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ marginRight: 8 }}>Nuovo team:</strong>
        <input
          value={newTeamId}
          onChange={(e) => setNewTeamId(e.target.value)}
          placeholder="es. team-alessia"
          style={{ padding: "0.4rem 0.6rem", background: "#08090F", border: "1px solid #2A2E39", borderRadius: 4, color: "#F5F6F8", minWidth: 220 }}
        />
        <button
          disabled={busy || !newTeamId.trim()}
          onClick={async () => { await act("create_team", { teamId: newTeamId.trim() }); setNewTeamId(""); }}
          style={{ padding: "0.4rem 0.8rem", background: "#D4AF7A", color: "#08090F", border: "none", borderRadius: 4, fontWeight: 700, cursor: "pointer" }}
        >
          Crea
        </button>
      </div>

      {loading && <p>Caricamento…</p>}

      {/* Team cards */}
      {!loading && (data?.teams || []).map((t) => (
        <div key={t.teamId} style={{ background: "#1B1E26", border: "1px solid #2A2E39", borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0, color: "#D4AF7A" }}>👥 {t.teamId}</h2>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ color: "#6B7080", fontSize: "0.8rem" }}>Lead:</label>
              <select
                value={t.lead || ""}
                onChange={(e) => act("set_lead", { teamId: t.teamId, userId: e.target.value || null })}
                disabled={busy}
                style={{ padding: "0.3rem", background: "#08090F", border: "1px solid #2A2E39", color: "#F5F6F8", borderRadius: 4 }}
              >
                <option value="">— nessuno —</option>
                {t.members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
              <button
                disabled={busy}
                onClick={() => { if (confirm(`Eliminare il team "${t.teamId}"? Gli operatori diventano non assegnati.`)) act("delete_team", { teamId: t.teamId }); }}
                style={{ padding: "0.3rem 0.6rem", background: "transparent", border: "1px solid #D44545", color: "#D44545", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}
              >
                Elimina team
              </button>
            </div>
          </div>

          <div style={{ color: "#6B7080", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            {t.members.length} membri{t.lead ? ` • lead: ${t.members.find((m) => m.userId === t.lead)?.name || t.lead}` : ""}
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {t.members.map((m) => (
              <div key={m.userId} style={{ display: "flex", gap: "0.4rem", alignItems: "center", padding: "0.3rem 0.6rem", background: "#08090F", borderRadius: 4, border: "1px solid #2A2E39" }}>
                <span>{m.name}</span>
                {m.userId === t.lead && <span style={{ color: "#D4AF7A", fontSize: "0.7rem" }}>★ lead</span>}
                <span style={{ color: "#6B7080", fontSize: "0.7rem" }}>{m.role}</span>
                <button
                  disabled={busy}
                  onClick={() => act("assign_member", { userId: m.userId, teamId: null })}
                  title="Rimuovi dal team"
                  style={{ padding: "0 0.3rem", background: "transparent", border: "none", color: "#D44545", cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Unassigned */}
      {!loading && (data?.unassigned || []).length > 0 && (
        <div style={{ background: "#1B1E26", border: "1px dashed #6B7080", borderRadius: 8, padding: "1.25rem", marginTop: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem 0", color: "#6B7080" }}>Non assegnati ({data.unassigned.length})</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.4rem" }}>
            {data.unassigned.map((m) => (
              <div key={m.userId} style={{ display: "flex", gap: "0.4rem", alignItems: "center", padding: "0.3rem 0.6rem", background: "#08090F", borderRadius: 4, border: "1px solid #2A2E39" }}>
                <span style={{ flex: 1 }}>{m.name}</span>
                <span style={{ color: "#6B7080", fontSize: "0.7rem" }}>{m.role}</span>
                <select
                  onChange={(e) => { if (e.target.value) act("assign_member", { userId: m.userId, teamId: e.target.value }); }}
                  disabled={busy}
                  defaultValue=""
                  style={{ padding: "0.2rem", background: "#08090F", border: "1px solid #2A2E39", color: "#F5F6F8", borderRadius: 4, fontSize: "0.75rem" }}
                >
                  <option value="">→ assegna a team…</option>
                  {(data?.teams || []).map((t) => (
                    <option key={t.teamId} value={t.teamId}>{t.teamId}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
