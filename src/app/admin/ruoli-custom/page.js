"use client";

import { useEffect, useMemo, useState } from "react";
import AdminNav from "@/components/AdminNav";

const CAP_LABELS = {
  "training.do": "Training — fare sessioni",
  "scores.view": "Score — visualizzare",
  "scores.override": "Score — override/correzione",
  review: "Review sessioni",
  "outcomes.write": "Outcomes — scrittura",
  "analytics.view": "Analytics — dashboard",
  "creators.manage": "Creator — gestione persona",
  seed: "Seed dati demo",
  "access.mgmt": "Gestione accessi & ruoli",
  "seniority.override": "Seniority — override tier",
  "leagues.snapshot": "Leagues — snapshot manuale",
  "leaderboard.snapshot": "Leaderboard — snapshot manuale",
};

const SCOPE_LABEL = { own: "own (sé)", team: "team", all: "all" };
const SCOPE_COLOR = { own: "#3FB97E", team: "#4F8CCB", all: "#B89158" };

const PALETTE = ["#6B7080", "#D44545", "#B89158", "#3FB97E", "#4F8CCB", "#4F8CCB", "#E8D4B0", "#3FB97E"];
const EMOJIS = ["🎖️", "🛡️", "⚡", "🎯", "🚀", "🔧", "📊", "🧭", "🏆", "🕹️", "👔", "🧩"];

function emptyRole() {
  return { id: "", name: "", emoji: "🎖️", color: "#6B7080", description: "", capabilities: {} };
}

export default function CustomRolesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyRole());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/custom-roles");
      const j = await r.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const editRole = (r) => setDraft(JSON.parse(JSON.stringify(r)));
  const resetDraft = () => setDraft(emptyRole());

  const toggleCap = (cap) => {
    const caps = { ...(draft.capabilities || {}) };
    if (caps[cap]) delete caps[cap];
    else caps[cap] = "own";
    setDraft({ ...draft, capabilities: caps });
  };
  const setCapScope = (cap, scope) => {
    setDraft({ ...draft, capabilities: { ...(draft.capabilities || {}), [cap]: scope } });
  };

  const save = async () => {
    if (!draft.id || !draft.name) { alert("id e name richiesti"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/custom-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok) alert(j?.error || "errore");
      else {
        resetDraft();
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(`Eliminare il ruolo "${id}"?`)) return;
    await fetch(`/api/admin/custom-roles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  const caps = data?.capabilities || [];
  const scopes = data?.scopes || ["own", "team", "all"];

  return (
    <div style={{ background: "#08090F", minHeight: "100vh", color: "#F5F6F8", padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ marginTop: 0 }}>🎖️ Ruoli custom</h1>
      <p style={{ color: "#6B7080", marginBottom: "1.5rem" }}>
        Crea ruoli personalizzati affiancati ai 5 predefiniti. Per ogni capability scegli lo scope: <b style={{ color: SCOPE_COLOR.own }}>own</b> (solo sé), <b style={{ color: SCOPE_COLOR.team }}>team</b> (proprio team), <b style={{ color: SCOPE_COLOR.all }}>all</b> (tutti).
      </p>

      {/* Editor */}
      <div style={{ border: "1px solid #2A2E39", borderRadius: 10, padding: "1rem", background: "#1B1E26", marginBottom: "2rem" }}>
        <h3 style={{ marginTop: 0 }}>{draft.id?.startsWith("c:") ? `Modifica ${draft.id}` : "Nuovo ruolo"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <label>
            <div style={{ fontSize: "0.72rem", color: "#6B7080" }}>ID (snake_case, univoco)</div>
            <input
              value={draft.id.replace(/^c:/, "")}
              onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })}
              placeholder="es. content_reviewer"
              disabled={draft.id?.startsWith("c:")}
              style={{ width: "100%", padding: "0.45rem", background: "#08090F", color: "#F5F6F8", border: "1px solid #2A2E39", borderRadius: 6 }}
            />
          </label>
          <label>
            <div style={{ fontSize: "0.72rem", color: "#6B7080" }}>Nome</div>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="es. Content Reviewer"
              style={{ width: "100%", padding: "0.45rem", background: "#08090F", color: "#F5F6F8", border: "1px solid #2A2E39", borderRadius: 6 }}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#6B7080" }}>Descrizione</div>
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="A cosa serve questo ruolo?"
            style={{ width: "100%", padding: "0.45rem", background: "#08090F", color: "#F5F6F8", border: "1px solid #2A2E39", borderRadius: 6 }}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "#6B7080" }}>Emoji:</span>
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setDraft({ ...draft, emoji: e })}
              style={{ padding: "0.25rem 0.45rem", background: draft.emoji === e ? "#2A2E39" : "transparent", border: "1px solid #2A2E39", borderRadius: 6, cursor: "pointer" }}>
              {e}
            </button>
          ))}
          <span style={{ fontSize: "0.72rem", color: "#6B7080", marginLeft: "1rem" }}>Colore:</span>
          {PALETTE.map((c) => (
            <button key={c} onClick={() => setDraft({ ...draft, color: c })}
              style={{ width: 22, height: 22, background: c, border: draft.color === c ? "2px solid #F5F6F8" : "1px solid #2A2E39", borderRadius: 999, cursor: "pointer" }} />
          ))}
        </div>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>Capabilities</h4>
        <div style={{ border: "1px solid #2A2E39", borderRadius: 8, overflow: "hidden" }}>
          {caps.map((cap) => {
            const active = !!draft.capabilities?.[cap];
            const scope = draft.capabilities?.[cap];
            return (
              <div key={cap} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #2A2E39", background: active ? "#101820" : "transparent" }}>
                <input type="checkbox" checked={active} onChange={() => toggleCap(cap)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{CAP_LABELS[cap] || cap}</div>
                  <div style={{ fontSize: "0.68rem", color: "#6B7080" }}>{cap}</div>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {scopes.map((s) => (
                    <button
                      key={s}
                      disabled={!active}
                      onClick={() => setCapScope(cap, s)}
                      style={{
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        background: scope === s ? SCOPE_COLOR[s] : "transparent",
                        color: scope === s ? "#08090F" : active ? SCOPE_COLOR[s] : "#444",
                        border: `1px solid ${active ? SCOPE_COLOR[s] : "#2A2E39"}`,
                        borderRadius: 4,
                        cursor: active ? "pointer" : "not-allowed",
                      }}
                    >
                      {SCOPE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button onClick={save} disabled={busy}
            style={{ padding: "0.5rem 1rem", background: "#3FB97E", color: "#08090F", border: 0, borderRadius: 6, fontWeight: 800, cursor: "pointer" }}>
            {busy ? "Salvo…" : "Salva ruolo"}
          </button>
          <button onClick={resetDraft}
            style={{ padding: "0.5rem 1rem", background: "transparent", color: "#B9BDC7", border: "1px solid #2A2E39", borderRadius: 6, cursor: "pointer" }}>
            Reset
          </button>
        </div>
      </div>

      {/* Lista esistenti */}
      <h3>Ruoli custom esistenti</h3>
      {loading && <p>Caricamento…</p>}
      {!loading && (data?.roles || []).length === 0 && <p style={{ color: "#6B7080" }}>Nessun ruolo custom. Creane uno sopra.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
        {(data?.roles || []).map((r) => (
          <div key={r.id} style={{ border: `1px solid ${r.color}55`, borderRadius: 10, padding: "0.75rem", background: `${r.color}10` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontWeight: 800, color: r.color }}>{r.emoji} {r.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#6B7080" }}>{r.id}</div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button onClick={() => editRole(r)} style={{ padding: "0.2rem 0.5rem", background: "transparent", color: "#B9BDC7", border: "1px solid #2A2E39", borderRadius: 4, cursor: "pointer", fontSize: "0.7rem" }}>✎</button>
                <button onClick={() => remove(r.id)} style={{ padding: "0.2rem 0.5rem", background: "transparent", color: "#D44545", border: "1px solid #D44545", borderRadius: 4, cursor: "pointer", fontSize: "0.7rem" }}>×</button>
              </div>
            </div>
            {r.description && <div style={{ fontSize: "0.75rem", color: "#B9BDC7", marginTop: "0.35rem" }}>{r.description}</div>}
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {Object.entries(r.capabilities || {}).map(([c, s]) => (
                <span key={c} style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4, background: `${SCOPE_COLOR[s]}22`, border: `1px solid ${SCOPE_COLOR[s]}`, color: SCOPE_COLOR[s] }}>
                  {c}:{s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
