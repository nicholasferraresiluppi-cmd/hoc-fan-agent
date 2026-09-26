"use client";

/**
 * /admin/social-accounts/[id] — dettaglio account social: piattaforma, status,
 * proxy associato (con link) + selector per cambiarlo (SEED).
 */
import { useState } from "react";
import useSWR from "swr";
import { Share2, ArrowLeft, Shield, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, Modal, CpCard } from "@/components/cp-style";

const PLATFORM_LABEL = { twitter: "Twitter/X", reddit: "Reddit", instagram: "Instagram", tiktok: "TikTok", other: "Altro" };

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

export default function SocialAccountDetailPage({ params }) {
  const { id } = params;
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/social-accounts/${id}`, fetcher, { revalidateOnFocus: false });
  const [selectorOpen, setSelectorOpen] = useState(false);

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <SectionLabel>Data & Integrations</SectionLabel>
        <h1 style={h1}>Account social</h1>
        <div style={errBox}>
          {error.status === 403 ? "Accesso riservato agli admin (capability SEED)."
            : error.status === 404 ? "Account non trovato."
            : `Errore: ${error.message}`}
        </div>
      </div>
    );
  }

  if (isLoading) return <div style={{ padding: 32, color: CP.textMuted }}>Caricamento…</div>;

  const a = data?.account;
  if (!a) return null;

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 800, margin: "0 auto" }}>
      <a href="/admin/social-accounts" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.textMuted, fontSize: 12.5, textDecoration: "none", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Account social
      </a>

      <SectionLabel>Data & Integrations</SectionLabel>
      <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 12 }}>
        <Share2 size={24} color={CP.accent} aria-hidden="true" />
        {a.name}
      </h1>
      <p style={{ color: CP.textSecondary, fontSize: 13, margin: "0 0 24px" }}>
        {PLATFORM_LABEL[a.platform] || a.platform}{a.handle ? ` · ${a.handle}` : ""} ·{" "}
        <span style={{ color: a.status === "active" ? CP.accentGreen : CP.textMuted }}>
          {a.status === "active" ? "Attivo" : "Inattivo"}
        </span>
      </p>

      <CpCard style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: a.proxy ? 12 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textPrimary, fontSize: 14, fontWeight: 500 }}>
            <Shield size={16} color={CP.accent} /> Proxy associato
          </div>
          <button onClick={() => setSelectorOpen(true)} style={btnGhost}>
            <RefreshCw size={13} /> Cambia proxy
          </button>
        </div>
        {a.proxy ? (
          <div>
            <a href="/admin/social-proxies" style={{ fontFamily: FONTS.mono, fontSize: 15, color: CP.accentSoftText, textDecoration: "none" }}>
              {a.proxy.host}:{a.proxy.port}
            </a>
            <div style={{ marginTop: 6, fontSize: 12.5, color: CP.textSecondary }}>
              {a.proxy.type === "socks5" ? "SOCKS5" : "HTTP"} · {a.proxy.provider || "provider non specificato"} ·{" "}
              <span style={{ color: a.proxy.status === "active" ? CP.accentGreen : a.proxy.status === "error" ? CP.accentRed : CP.textMuted }}>
                {a.proxy.status === "active" ? "Attivo" : a.proxy.status === "error" ? "Errore" : "Non testato"}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun proxy associato.</div>
        )}
      </CpCard>

      <ProxySelectorModal
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        accountId={id}
        currentProxyId={a.proxyId}
        onChanged={async () => { setSelectorOpen(false); await mutate(); }}
      />
    </div>
  );
}

function ProxySelectorModal({ open, onClose, accountId, currentProxyId, onChanged }) {
  const { data } = useSWR(open ? "/api/admin/social-proxies?status=active&limit=200" : null, fetcher);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const proxies = data?.items || [];

  const choose = async (proxyId) => {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/social-accounts/${accountId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cambia proxy">
      {err && <div style={{ color: CP.accentRed, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        <button
          onClick={() => choose(null)}
          disabled={saving || currentProxyId == null}
          style={{ ...proxyOption, opacity: currentProxyId == null ? 0.5 : 1 }}
        >
          Nessun proxy
        </button>
        {proxies.length === 0 && (
          <div style={{ color: CP.textMuted, fontSize: 12.5, padding: "8px 2px" }}>Nessun proxy attivo disponibile.</div>
        )}
        {proxies.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p.id)}
            disabled={saving || p.id === currentProxyId}
            style={{ ...proxyOption, opacity: p.id === currentProxyId ? 0.5 : 1 }}
          >
            <span style={{ fontFamily: FONTS.mono }}>{p.host}:{p.port}</span>
            <span style={{ color: CP.textMuted, marginLeft: 8 }}>{p.provider || "—"} · {p.accountCount} account</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const h1 = { fontFamily: FONTS.display, fontSize: 28, margin: "8px 0 6px", fontWeight: 500, letterSpacing: "-0.02em", color: CP.textPrimary };
const errBox = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 16, color: CP.textSecondary, marginTop: 16 };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "transparent", color: CP.accentSoftText, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const proxyOption = {
  textAlign: "left", padding: "9px 12px", background: CP.bg, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 13, cursor: "pointer",
};
