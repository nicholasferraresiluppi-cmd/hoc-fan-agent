"use client";

// Ruoli custom — ruoli su misura oltre ai 5 predefiniti.
// Ridisegno 26/09/2026 (design system): prima i ruoli che esistono già (tabella
// con Modifica/Elimina), poi l'editor. Gli scope own/team/all sono spiegati a
// parole ("solo i propri dati", "il proprio team", "tutti"). API, validazione e
// conferma di eliminazione invariate; i limiti anti-escalation stanno lato API.

import { CAP_LABELS as CAP_LABELS_SHARED, SCOPE_LABELS } from "@/lib/capability-labels";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, DataTable, card } from "@/components/ds";

const CAP_LABELS = CAP_LABELS_SHARED;

const SCOPE_LABEL = { own: "Solo i propri", team: "Il suo team", all: "Tutti" };
const SCOPE_HINT = {
  own: "vede e usa solo i propri dati",
  team: "vede i dati del proprio team",
  all: "vede i dati di tutti",
};

const PALETTE = [CP.textMuted, CP.accentRed, CP.accent, CP.accentGreen, CP.accentSoftText, CP.accentSoftText, CP.textSecondary, CP.accentGreen];
const EMOJIS = ["🎖️", "🛡️", "⚡", "🎯", "🚀", "🔧", "📊", "🧭", "🏆", "🕹️", "👔", "🧩"];

function emptyRole() {
  return { id: "", name: "", emoji: "🎖️", color: CP.textMuted, description: "", capabilities: {} };
}

const field = { width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 14, fontFamily: FONTS.body };
const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 };
const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" });
const smallBtn = { ...btn(false), padding: "5px 10px", fontSize: 12, fontWeight: 400 };

export default function CustomRolesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyRole());
  const [busy, setBusy] = useState(false);
  const editorRef = useRef(null);

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

  const editRole = (r) => {
    setDraft(JSON.parse(JSON.stringify(r)));
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
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
    if (!draft.id || !draft.name) { alert("Servono un ID e un nome."); return; }
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
  const roles = data?.roles || [];
  const editingExisting = draft.id?.startsWith("c:");
  const activeCount = Object.keys(draft.capabilities || {}).length;

  const columns = [
    {
      key: "name", label: "Ruolo", sort: (r) => (r.name || "").toLowerCase(),
      render: (r) => (
        <div>
          <div style={{ color: CP.textPrimary }}>{r.emoji} {r.name}</div>
          <div style={{ fontSize: 12, color: CP.textMuted }}>{r.id}</div>
        </div>
      ),
    },
    { key: "description", label: "A cosa serve", muted: true, sort: (r) => r.description || "", render: (r) => r.description || "—" },
    {
      key: "caps", label: "Permessi", sort: (r) => Object.keys(r.capabilities || {}).length,
      render: (r) => {
        const e = Object.entries(r.capabilities || {});
        if (!e.length) return <span style={{ color: CP.textMuted }}>nessuno</span>;
        return (
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
            {e.map(([c, s]) => (
              <div key={c}>{CAP_LABELS[c] || c} <span style={{ color: CP.textMuted }}>· {SCOPE_LABELS[s] || s}</span></div>
            ))}
          </div>
        );
      },
    },
    {
      key: "actions", label: "", sortable: false, align: "right",
      render: (r) => (
        <div style={{ display: "inline-flex", gap: 6 }}>
          <button onClick={() => editRole(r)} style={smallBtn}><Pencil size={12} /> Modifica</button>
          <button onClick={() => remove(r.id)} style={{ ...smallBtn, color: CP.accentRed }}><Trash2 size={12} /> Elimina</button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Ruoli custom" }]}
        title="Ruoli custom"
        subtitle="Ruoli su misura, oltre ai 5 predefiniti. Per ogni permesso scegli fin dove arriva: solo i propri dati, il proprio team o tutti. Poi assegni il ruolo alle persone da Membri."
        actions={<button style={btn(true)} onClick={() => { resetDraft(); setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}><Plus size={14} /> Nuovo ruolo</button>}
      />

      {data?.error && <Notice danger>{data.error}</Notice>}

      {/* Ruoli esistenti */}
      <section style={{ marginBottom: 28 }}>
        <SectionTitle aside={loading ? "caricamento…" : `${roles.length} ${roles.length === 1 ? "ruolo" : "ruoli"}`}>Ruoli custom esistenti</SectionTitle>
        {!loading && roles.length === 0 && !data?.error ? (
          <div style={{ ...card, padding: 16, fontSize: 14, color: CP.textSecondary }}>
            Nessun ruolo custom. Servono quando un ruolo predefinito dà troppo o troppo poco (es. un team lead che può anche invitare persone): crealo qui sotto.
          </div>
        ) : (
          <DataTable columns={columns} rows={roles} defaultSort={{ key: "name", dir: 1 }} minWidth={720} maxHeight={480} empty={loading ? "Caricamento…" : "Nessun ruolo."} />
        )}
      </section>

      {/* Editor */}
      <section ref={editorRef} style={{ ...card, padding: "18px 18px 16px", scrollMarginTop: 16 }}>
        <SectionTitle aside={editingExisting ? draft.id : "compila e salva"}>{editingExisting ? `Modifica: ${draft.name || draft.id}` : "Nuovo ruolo"}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
          <label>
            <span style={lbl}>ID (minuscole e trattini bassi, unico)</span>
            <input
              value={draft.id.replace(/^c:/, "")}
              onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })}
              placeholder="es. content_reviewer"
              disabled={editingExisting}
              style={{ ...field, opacity: editingExisting ? 0.6 : 1 }}
            />
          </label>
          <label>
            <span style={lbl}>Nome</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="es. Content reviewer" style={field} />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={lbl}>Descrizione</span>
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="A cosa serve questo ruolo?" style={field} />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: CP.textSecondary }}>Simbolo</span>
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setDraft({ ...draft, emoji: e })} aria-pressed={draft.emoji === e}
              style={{ padding: "3px 7px", background: draft.emoji === e ? CP.accentSoft : "transparent", border: `1px solid ${draft.emoji === e ? CP.accent : CP.border}`, borderRadius: 6, cursor: "pointer" }}>
              {e}
            </button>
          ))}
          <span style={{ fontSize: 13, color: CP.textSecondary, marginLeft: 8 }}>Colore</span>
          {PALETTE.map((c, i) => (
            <button key={`${c}-${i}`} onClick={() => setDraft({ ...draft, color: c })} aria-label={`Colore ${i + 1}`}
              style={{ width: 20, height: 20, background: c, border: draft.color === c ? `2px solid ${CP.textPrimary}` : `1px solid ${CP.border}`, borderRadius: 999, cursor: "pointer" }} />
          ))}
        </div>

        <SectionTitle aside={`${activeCount} ${activeCount === 1 ? "attivo" : "attivi"} · spunta un permesso, poi scegli fin dove arriva`}>Permessi</SectionTitle>
        <div style={{ border: `1px solid ${CP.border}`, borderRadius: 8, overflow: "hidden" }}>
          {caps.length === 0 && <div style={{ padding: 12, fontSize: 13, color: CP.textMuted }}>{loading ? "Caricamento…" : "Elenco dei permessi non disponibile."}</div>}
          {caps.map((cap, i) => {
            const active = !!draft.capabilities?.[cap];
            const scope = draft.capabilities?.[cap];
            return (
              <div key={cap} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", background: active ? CP.surfaceAlt : "transparent", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 260px", cursor: "pointer", minWidth: 0 }}>
                  <input type="checkbox" checked={active} onChange={() => toggleCap(cap)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, color: active ? CP.textPrimary : CP.textSecondary }}>{CAP_LABELS[cap] || cap}</span>
                    <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>{cap}</span>
                  </span>
                </label>
                <div style={{ display: "flex", gap: 4 }} role="group" aria-label={`Fin dove arriva: ${CAP_LABELS[cap] || cap}`}>
                  {scopes.map((s) => (
                    <button
                      key={s}
                      disabled={!active}
                      onClick={() => setCapScope(cap, s)}
                      title={SCOPE_HINT[s]}
                      aria-pressed={scope === s}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        fontFamily: FONTS.body,
                        background: scope === s ? CP.accentSoft : "transparent",
                        color: scope === s ? CP.accentSoftText : active ? CP.textSecondary : CP.textMuted,
                        border: `1px solid ${scope === s ? CP.accent : CP.border}`,
                        borderRadius: 999,
                        cursor: active ? "pointer" : "not-allowed",
                        opacity: active ? 1 : 0.5,
                      }}
                    >
                      {SCOPE_LABEL[s] || s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>
            {busy ? "Salvo…" : editingExisting ? "Salva modifiche" : "Salva ruolo"}
          </button>
          <button onClick={resetDraft} style={btn(false)}>{editingExisting ? "Annulla e svuota" : "Svuota"}</button>
        </div>
      </section>
    </div>
  );
}
