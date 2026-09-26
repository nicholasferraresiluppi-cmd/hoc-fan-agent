"use client";

/**
 * /admin/social-proxies — gestione proxy SOCKS5/HTTP per gli account social
 * di promozione dei creator (SEED).
 *
 * Ogni account social ufficiale (Twitter/Reddit/Instagram/TikTok collegati
 * alle pagine dei creator) può usare un proxy dedicato per isolare le
 * connessioni — igiene/sicurezza dell'account, non evasione di rilevazione.
 */
import { useState, useEffect } from "react";
import useSWR from "swr";
import { Shield, Plus, Wifi, Pencil, Trash2, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, Modal } from "@/components/cp-style";

const PROVIDERS = ["coronium", "proxycaro", "nsocks"];

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
};

function fmtDateTime(ts) {
  if (!ts) return "Mai";
  return new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_META = {
  active: { label: "Attivo", color: CP.accentGreen },
  inactive: { label: "Non testato", color: CP.textMuted },
  error: { label: "Errore", color: CP.accentRed },
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 9px",
      background: color + "1c", color, borderRadius: 999,
      fontSize: 11.5, fontWeight: 500, fontFamily: FONTS.body, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default function SocialProxiesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const qs = new URLSearchParams({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(providerFilter ? { provider: providerFilter } : {}),
  }).toString();

  const { data, error, isLoading, mutate } = useSWR(`/api/admin/social-proxies?${qs}`, fetcher, { revalidateOnFocus: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // proxy record o null (crea)
  const [testingId, setTestingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const items = data?.items || [];
  const knownProviders = [...new Set([...PROVIDERS, ...items.map((p) => p.provider).filter(Boolean)])];

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p) => { setEditing(p); setModalOpen(true); };

  const runTest = async (id) => {
    setTestingId(id);
    setRowError(null);
    try {
      const r = await fetch(`/api/admin/social-proxies/${id}/test`, { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await mutate();
    } catch (e) {
      setRowError({ id, message: e.message });
    } finally {
      setTestingId(null);
    }
  };

  const runDelete = async (p) => {
    if (!window.confirm(`Eliminare il proxy ${p.host}:${p.port}?`)) return;
    setDeletingId(p.id);
    setRowError(null);
    try {
      const r = await fetch(`/api/admin/social-proxies/${p.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await mutate();
    } catch (e) {
      setRowError({ id: p.id, message: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
        <SectionLabel>Data & Integrations</SectionLabel>
        <h1 style={h1}>Proxy account social</h1>
        <div style={errBox}>
          {error.status === 403 ? "Accesso riservato agli admin (capability SEED)." : `Errore: ${error.message}`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <SectionLabel>Data & Integrations</SectionLabel>
          <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 12 }}>
            <Shield size={26} color={CP.accent} aria-hidden="true" />
            Proxy account social
          </h1>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            Un proxy SOCKS5/HTTP dedicato per ogni account social ufficiale, per isolare le connessioni.
            Le credenziali sono cifrate a riposo.
          </p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>
          <Plus size={15} /> Nuovo proxy
        </button>
      </div>

      {/* Filtri */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select style={{ ...input, width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tutti gli status</option>
          <option value="active">Attivo</option>
          <option value="inactive">Non testato</option>
          <option value="error">Errore</option>
        </select>
        <select style={{ ...input, width: 180 }} value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          <option value="">Tutti i provider</option>
          {knownProviders.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ color: CP.textMuted, padding: 24 }}>Caricamento…</div>
      ) : items.length === 0 ? (
        <div style={{ ...panel, color: CP.textSecondary, textAlign: "center" }}>
          Nessun proxy ancora. Crea il primo col pulsante &ldquo;Nuovo proxy&rdquo;.
        </div>
      ) : (
        <div style={{ border: `1px solid ${CP.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ ...rowGrid, background: CP.bgSunken, color: CP.textMuted, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", padding: "10px 14px" }}>
            <span>Host:porta</span>
            <span>Tipo</span>
            <span>Provider</span>
            <span>Status</span>
            <span>Account</span>
            <span>Ultimo test</span>
            <span></span>
          </div>
          {items.map((p) => {
            const sm = STATUS_META[p.status] || STATUS_META.inactive;
            const err = rowError?.id === p.id ? rowError.message : null;
            return (
              <div key={p.id} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                <div style={{ ...rowGrid, padding: "12px 14px", alignItems: "center" }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary }}>{p.host}:{p.port}</span>
                  <span><Badge label={p.type === "socks5" ? "SOCKS5" : "HTTP"} color={CP.accentSoftText} /></span>
                  <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{p.provider || "—"}</span>
                  <span title={p.status === "error" ? (p.lastError || "Errore sconosciuto") : ""}>
                    <Badge label={sm.label} color={sm.color} />
                  </span>
                  <span style={{ fontSize: 12.5, color: CP.textSecondary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.accounts?.length
                      ? p.accounts.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && ", "}
                            <a href={`/admin/social-accounts/${a.id}`} style={{ color: CP.accentSoftText, textDecoration: "none" }}>{a.name}</a>
                          </span>
                        ))
                      : <span style={{ color: CP.textMuted }}>Nessuno</span>}
                  </span>
                  <span style={{ fontSize: 12, color: CP.textMuted }}>
                    {fmtDateTime(p.lastCheckedAt)}
                    {p.lastLatencyMs != null && p.status === "active" && (
                      <span style={{ marginLeft: 6, color: CP.textSecondary }}>· {p.lastLatencyMs}ms</span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => runTest(p.id)} disabled={testingId === p.id} style={btnGhost} title="Test connessione">
                      {testingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                    </button>
                    <button onClick={() => openEdit(p)} style={btnGhost} title="Modifica">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => runDelete(p)} disabled={deletingId === p.id} style={{ ...btnGhost, color: CP.accentRed }} title="Elimina">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                {err && (
                  <div style={{ padding: "0 14px 10px", color: CP.accentRed, fontSize: 12 }}>{err}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProxyFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        knownProviders={knownProviders}
        onSaved={async () => { setModalOpen(false); await mutate(); }}
      />
    </div>
  );
}

function ProxyFormModal({ open, onClose, editing, knownProviders, onSaved }) {
  const isEdit = !!editing;
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [type, setType] = useState("socks5");
  const [provider, setProvider] = useState("");
  const [customProvider, setCustomProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Reset/precompila il form ogni volta che il modal si apre (crea o modifica).
  useEffect(() => {
    if (!open) return;
    setHost(editing?.host || "");
    setPort(editing?.port ? String(editing.port) : "");
    setUsername(editing?.username || "");
    setPassword("");
    setType(editing?.type || "socks5");
    const p = editing?.provider || "";
    setProvider(p && !knownProviders.includes(p) ? "altro" : p);
    setCustomProvider(p && !knownProviders.includes(p) ? p : "");
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const effectiveProvider = provider === "altro" ? customProvider.trim() : provider;

  const submit = async () => {
    setFormError(null);
    if (!host.trim() || !port) { setFormError("Host e porta sono richiesti."); return; }
    setSaving(true);
    try {
      const body = {
        host: host.trim(),
        port: Number(port),
        username: username.trim() || null,
        type,
        provider: effectiveProvider || null,
      };
      if (password) body.password = password;
      const url = isEdit ? `/api/admin/social-proxies/${editing.id}` : "/api/admin/social-proxies";
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await onSaved();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Modifica proxy" : "Nuovo proxy"}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Host</span>
          <input style={input} value={host} onChange={(e) => setHost(e.target.value)} placeholder="proxy.provider.com" />
        </label>
        <label>
          <span style={lbl}>Porta</span>
          <input style={input} type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} placeholder="1080" />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Username (opzionale)</span>
          <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          <span style={lbl}>Password {isEdit ? "(lascia vuoto per non cambiarla)" : "(opzionale)"}</span>
          <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Tipo</span>
          <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <label>
          <span style={lbl}>Provider</span>
          <select style={input} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">—</option>
            {knownProviders.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="altro">Altro…</option>
          </select>
        </label>
      </div>
      {provider === "altro" && (
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={lbl}>Nome provider</span>
          <input style={input} value={customProvider} onChange={(e) => setCustomProvider(e.target.value)} placeholder="Nome provider" />
        </label>
      )}
      {formError && <div style={{ color: CP.accentRed, fontSize: 12.5, marginBottom: 10 }}>{formError}</div>}
      <button onClick={submit} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Salvo…" : isEdit ? "Salva modifiche" : "Crea proxy"}
      </button>
    </Modal>
  );
}

const h1 = { fontFamily: FONTS.display, fontSize: 32, margin: "8px 0 6px", fontWeight: 500, letterSpacing: "-0.02em", color: CP.textPrimary };
const panel = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 18, marginBottom: 20 };
const rowGrid = { display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.9fr 0.9fr 1.3fr 1.1fr 1fr", gap: 10 };
const lbl = { display: "block", fontSize: 11, color: CP.textMuted, marginBottom: 4 };
const errBox = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 16, color: CP.textSecondary, marginTop: 16 };
const input = {
  width: "100%", padding: "8px 10px", background: CP.bg, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none",
};
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 9px", background: "transparent", color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 7, cursor: "pointer" };
