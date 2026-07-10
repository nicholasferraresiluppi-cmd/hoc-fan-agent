"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

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
const SCOPE_COLOR = { own: "#4ade80", team: "#b9aef9", all: "#8b7cf6" };

const PALETTE = ["#8c95a8", "#f08c8c", "#8b7cf6", "#4ade80", "#b9aef9", "#b9aef9", "#cdd3de", "#4ade80"];
const EMOJIS = ["🎖️", "🛡️", "⚡", "🎯", "🚀", "🔧", "📊", "🧭", "🏆", "🕹️", "👔", "🧩"];

function emptyRole() {
  return { id: "", name: "", emoji: "🎖️", color: "#8c95a8", description: "", capabilities: {} };
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
    <div style={{ background: "#0c0f14", minHeight: "100vh", color: "#f2f4f8", padding: "32px 28px 64px 28px", maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Ruoli custom</span>
          </div>
        }
        section="People · Permissions"
        title="Ruoli custom"
        subtitle={<>Crea ruoli personalizzati affiancati ai 5 predefiniti. Per ogni capability scegli lo scope: <b style={{ color: SCOPE_COLOR.own }}>own</b> · <b style={{ color: SCOPE_COLOR.team }}>team</b> · <b style={{ color: SCOPE_COLOR.all }}>all</b>.</>}
      />

      {/* Editor */}
      <div style={{ border: "1px solid #232b3a", borderRadius: 10, padding: "1rem", background: "#1B1E26", marginBottom: "2rem" }}>
        <h3 style={{ marginTop: 0 }}>{draft.id?.startsWith("c:") ? `Modifica ${draft.id}` : "Nuovo ruolo"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <label>
            <div style={{ fontSize: "0.72rem", color: "#8c95a8" }}>ID (snake_case, univoco)</div>
            <input
              value={draft.id.replace(/^c:/, "")}
              onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })}
              placeholder="es. content_reviewer"
              disabled={draft.id?.startsWith("c:")}
              style={{ width: "100%", padding: "0.45rem", background: "#0c0f14", color: "#f2f4f8", border: "1px solid #232b3a", borderRadius: 6 }}
            />
          </label>
          <label>
            <div style={{ fontSize: "0.72rem", color: "#8c95a8" }}>Nome</div>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="es. Content Reviewer"
              style={{ width: "100%", padding: "0.45rem", background: "#0c0f14", color: "#f2f4f8", border: "1px solid #232b3a", borderRadius: 6 }}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#8c95a8" }}>Descrizione</div>
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="A cosa serve questo ruolo?"
            style={{ width: "100%", padding: "0.45rem", background: "#0c0f14", color: "#f2f4f8", border: "1px solid #232b3a", borderRadius: 6 }}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "#8c95a8" }}>Emoji:</span>
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setDraft({ ...draft, emoji: e })}
              style={{ padding: "0.25rem 0.45rem", background: draft.emoji === e ? "#232b3a" : "transparent", border: "1px solid #232b3a", borderRadius: 6, cursor: "pointer" }}>
              {e}
            </button>
          ))}
          <span style={{ fontSize: "0.72rem", color: "#8c95a8", marginLeft: "1rem" }}>Colore:</span>
          {PALETTE.map((c) => (
            <button key={c} onClick={() => setDraft({ ...draft, color: c })}
              style={{ width: 22, height: 22, background: c, border: draft.color === c ? "2px solid #f2f4f8" : "1px solid #232b3a", borderRadius: 999, cursor: "pointer" }} />
          ))}
        </div>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>Capabilities</h4>
        <div style={{ border: "1px solid #232b3a", borderRadius: 8, overflow: "hidden" }}>
          {caps.map((cap) => {
            const active = !!draft.capabilities?.[cap];
            const scope = draft.capabilities?.[cap];
            return (
              <div key={cap} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #232b3a", background: active ? "#101820" : "transparent" }}>
                <input type="checkbox" checked={active} onChange={() => toggleCap(cap)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{CAP_LABELS[cap] || cap}</div>
                  <div style={{ fontSize: "0.68rem", color: "#8c95a8" }}>{cap}</div>
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
                        color: scope === s ? "#14101f" : active ? SCOPE_COLOR[s] : "#444",
                        border: `1px solid ${active ? SCOPE_COLOR[s] : "#232b3a"}`,
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
            style={{ padding: "0.5rem 1rem", background: "#4ade80", color: "#14101f", border: 0, borderRadius: 6, fontWeight: 800, cursor: "pointer" }}>
            {busy ? "Salvo…" : "Salva ruolo"}
          </button>
          <button onClick={resetDraft}
            style={{ padding: "0.5rem 1rem", background: "transparent", color: "#cdd3de", border: "1px solid #232b3a", borderRadius: 6, cursor: "pointer" }}>
            Reset
          </button>
        </div>
      </div>

      {/* Lista esistenti */}
      <h3>Ruoli custom esistenti</h3>
      {loading && <p>Caricamento…</p>}
      {!loading && (data?.roles || []).length === 0 && <p style={{ color: "#8c95a8" }}>Nessun ruolo custom. Creane uno sopra.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
        {(data?.roles || []).map((r) => (
          <div key={r.id} style={{ border: `1px solid ${r.color}55`, borderRadius: 10, padding: "0.75rem", background: `${r.color}10` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontWeight: 800, color: r.color }}>{r.emoji} {r.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#8c95a8" }}>{r.id}</div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button onClick={() => editRole(r)} style={{ padding: "0.2rem 0.5rem", background: "transparent", color: "#cdd3de", border: "1px solid #232b3a", borderRadius: 4, cursor: "pointer", fontSize: "0.7rem" }}>✎</button>
                <button onClick={() => remove(r.id)} style={{ padding: "0.2rem 0.5rem", background: "transparent", color: "#f08c8c", border: "1px solid #f08c8c", borderRadius: 4, cursor: "pointer", fontSize: "0.7rem" }}>×</button>
              </div>
            </div>
            {r.description && <div style={{ fontSize: "0.75rem", color: "#cdd3de", marginTop: "0.35rem" }}>{r.description}</div>}
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
