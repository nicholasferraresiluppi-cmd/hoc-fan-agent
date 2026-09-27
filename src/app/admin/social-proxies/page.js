"use client";

/**
 * /admin/social-proxies — gestione proxy SOCKS5/HTTP per gli account social
 * di promozione dei creator (SEED).
 *
 * Ogni account social ufficiale (Twitter/Reddit/Instagram/TikTok collegati
 * alle pagine dei creator) può usare un proxy dedicato per isolare le
 * connessioni — igiene/sicurezza dell'account, non evasione di rilevazione.
 *
 * Redesign 26/09/2026 sul design system: testata DS, filtri a chip, tabella
 * ordinabile (la griglia a 7 colonne non stava a 390px), azioni con parole al
 * posto delle sole icone ("Prova connessione" era un'icona wifi), motivo
 * dell'errore visibile in riga (prima solo al passaggio del mouse), stato vuoto
 * che distingue "nessun proxy" da "nessun proxy con questo filtro". Password mai
 * mostrate; il test di connessione resta. Modal di cp-style, API invariate.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, FilterChip, Notice, DataTable, card } from "@/components/ds";

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
  if (!ts) return "mai";
  return new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_META = {
  active: { label: "Funziona" },
  inactive: { label: "Mai provato" },
  error: { label: "Errore" },
};

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
  const filtered = !!(statusFilter || providerFilter);

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
    if (!window.confirm(`Eliminare il proxy ${p.host}:${p.port}?\n\nNon si può eliminare se lo usa un account attivo; gli account non attivi che lo usano restano senza proxy.`)) return;
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

  const errProxy = rowError ? items.find((p) => p.id === rowError.id) : null;

  const columns = [
    { key: "host", label: "Indirizzo", sort: (p) => `${p.host}:${p.port}`, render: (p) => <span style={{ fontWeight: 500 }}>{p.host}:{p.port}</span> },
    { key: "type", label: "Tipo", render: (p) => (p.type === "socks5" ? "SOCKS5" : "HTTP") },
    { key: "provider", label: "Fornitore", muted: true, render: (p) => p.provider || "—" },
    {
      key: "status", label: "Stato", sort: (p) => (STATUS_META[p.status] || STATUS_META.inactive).label,
      render: (p) => (
        <div style={{ maxWidth: 260, whiteSpace: "normal" }}>
          <span style={{ color: p.status === "error" ? CP.accentRed : p.status === "active" ? CP.textPrimary : CP.textMuted }}>{(STATUS_META[p.status] || STATUS_META.inactive).label}</span>
          {p.status === "active" && p.lastLatencyMs != null && <span style={{ color: CP.textMuted, fontSize: 12 }}> · risponde in {p.lastLatencyMs} ms</span>}
          {p.status === "error" && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{p.lastError || "Errore sconosciuto"}</div>}
        </div>
      ),
    },
    {
      key: "accounts", label: "Usato da", sort: (p) => p.accounts?.length || 0,
      render: (p) => p.accounts?.length ? (
        <span style={{ display: "inline-block", maxWidth: 240, whiteSpace: "normal" }}>
          {p.accounts.map((a, i) => (
            <span key={a.id}>{i > 0 && ", "}<Link href={`/admin/social-accounts/${a.id}`} style={{ color: CP.accentSoftText, textDecoration: "none" }}>{a.name}</Link></span>
          ))}
        </span>
      ) : <span style={{ color: CP.textMuted }}>Nessun account</span>,
    },
    { key: "lastCheckedAt", label: "Ultima prova", muted: true, render: (p) => fmtDateTime(p.lastCheckedAt), sort: (p) => p.lastCheckedAt ?? 0 },
    {
      key: "actions", label: "", sortable: false,
      render: (p) => (
        <span style={{ display: "flex", gap: 6, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
          <button onClick={() => runTest(p.id)} disabled={testingId === p.id} style={btnSmall}>
            {testingId === p.id ? <><Loader2 size={13} className="animate-spin" /> Provo…</> : "Prova connessione"}
          </button>
          <button onClick={() => openEdit(p)} style={btnSmall}>Modifica</button>
          <button onClick={() => runDelete(p)} disabled={deletingId === p.id} style={{ ...btnSmall, color: CP.accentRed }}>
            {deletingId === p.id ? "Elimino…" : "Elimina"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Marketing" }, { label: "Proxy account social" }]}
        title="Proxy account social"
        subtitle="I proxy da cui escono gli account social ufficiali, per tenere separate le loro connessioni. Un proxy viene assegnato agli account solo dopo che la prova di connessione è riuscita. Le password sono cifrate e non vengono mai mostrate."
        actions={!error && (
          <button onClick={openCreate} style={btnPrimary}>
            <Plus size={15} /> Nuovo proxy
          </button>
        )}
      />

      {error && (
        <Notice danger={error.status !== 403}>
          {error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare i proxy: ${error.message}`}
        </Notice>
      )}

      {!error && (items.length > 0 || filtered) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <FilterChip label="Tutti" active={!statusFilter} onClick={() => setStatusFilter("")} />
          <FilterChip label="Funzionano" active={statusFilter === "active"} onClick={() => setStatusFilter(statusFilter === "active" ? "" : "active")} />
          <FilterChip label="Mai provati" active={statusFilter === "inactive"} onClick={() => setStatusFilter(statusFilter === "inactive" ? "" : "inactive")} />
          <FilterChip label="Con errore" active={statusFilter === "error"} onClick={() => setStatusFilter(statusFilter === "error" ? "" : "error")} />
          <span style={{ flex: 1 }} />
          <select style={{ ...input, width: 200 }} value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} aria-label="Fornitore">
            <option value="">Tutti i fornitori</option>
            {knownProviders.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {rowError && (
        <Notice danger>{errProxy ? `${errProxy.host}:${errProxy.port} — ` : ""}{rowError.message}</Notice>
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!error && !isLoading && items.length === 0 && (
        filtered ? (
          <Notice>Nessun proxy con questo filtro. <button onClick={() => { setStatusFilter(""); setProviderFilter(""); }} style={linkBtn}>Togli i filtri</button></Notice>
        ) : (
          <section style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessun proxy ancora</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
              <li>Aggiungi un proxy con “Nuovo proxy” (indirizzo, porta e, se il fornitore le dà, utente e password).</li>
              <li>Premi “Prova connessione”: se riesce diventa “Funziona” e può essere assegnato.</li>
              <li>Poi crea gli account in <Link href="/admin/social-accounts" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Account social</Link>: ognuno riceve da solo il proxy funzionante con meno account.</li>
            </ol>
          </section>
        )
      )}

      {!error && items.length > 0 && (
        <DataTable columns={columns} rows={items} defaultSort={{ key: "host", dir: 1 }} minWidth={1040} maxHeight={640} />
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
    if (!host.trim() || !port) { setFormError("Servono indirizzo e porta."); return; }
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 12 }}>
        <label style={{ gridColumn: "span 2", minWidth: 0 }}>
          <span style={lbl}>Indirizzo (host)</span>
          <input style={input} value={host} onChange={(e) => setHost(e.target.value)} placeholder="proxy.provider.com" />
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={lbl}>Porta</span>
          <input style={input} type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} placeholder="1080" />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Utente (facoltativo)</span>
          <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          <span style={lbl}>Password {isEdit ? "(vuota = resta quella salvata)" : "(facoltativa)"}</span>
          <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Tipo</span>
          <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <label>
          <span style={lbl}>Fornitore</span>
          <select style={input} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">—</option>
            {knownProviders.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="altro">Altro…</option>
          </select>
        </label>
      </div>
      {provider === "altro" && (
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={lbl}>Nome del fornitore</span>
          <input style={input} value={customProvider} onChange={(e) => setCustomProvider(e.target.value)} placeholder="Nome fornitore" />
        </label>
      )}
      {!isEdit && <p style={{ margin: "0 0 12px", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>Dopo averlo creato, premi “Prova connessione”: finché la prova non riesce il proxy non viene assegnato agli account.</p>}
      {formError && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{formError}</div>}
      <button onClick={submit} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Salvo…" : isEdit ? "Salva modifiche" : "Crea proxy"}
      </button>
    </Modal>
  );
}

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none",
};
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnSmall = { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontFamily: FONTS.body };
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body };
