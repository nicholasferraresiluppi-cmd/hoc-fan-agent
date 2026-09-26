"use client";

/**
 * /admin/social-accounts — account social (Twitter/Reddit/Instagram/TikTok)
 * usati per la promozione ufficiale dei creator (SEED).
 */
import { useState } from "react";
import useSWR from "swr";
import { Share2, Plus } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, Modal } from "@/components/cp-style";

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

export default function SocialAccountsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/social-accounts", fetcher, { revalidateOnFocus: false });
  const [modalOpen, setModalOpen] = useState(false);
  const items = data?.items || [];

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
        <SectionLabel>Data & Integrations</SectionLabel>
        <h1 style={h1}>Account social</h1>
        <div style={errBox}>
          {error.status === 403 ? "Accesso riservato agli admin (capability SEED)." : `Errore: ${error.message}`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <SectionLabel>Data & Integrations</SectionLabel>
          <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 12 }}>
            <Share2 size={26} color={CP.accent} aria-hidden="true" />
            Account social
          </h1>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
            Account ufficiali usati per la promozione dei creator. Ogni account può avere un proxy
            dedicato — se non lo specifichi, viene assegnato automaticamente quello meno carico.
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} style={btnPrimary}>
          <Plus size={15} /> Nuovo account
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: CP.textMuted, padding: 24 }}>Caricamento…</div>
      ) : items.length === 0 ? (
        <div style={{ ...panel, color: CP.textSecondary, textAlign: "center" }}>
          Nessun account ancora. Crea il primo col pulsante &ldquo;Nuovo account&rdquo;.
        </div>
      ) : (
        <div style={{ border: `1px solid ${CP.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ ...rowGrid, background: CP.bgSunken, color: CP.textMuted, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", padding: "10px 14px" }}>
            <span>Nome</span>
            <span>Piattaforma</span>
            <span>Handle</span>
            <span>Status</span>
            <span>Proxy</span>
          </div>
          {items.map((a) => (
            <a
              key={a.id}
              href={`/admin/social-accounts/${a.id}`}
              style={{ ...rowGrid, padding: "12px 14px", alignItems: "center", borderTop: `1px solid ${CP.borderSoft}`, textDecoration: "none", color: "inherit" }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{PLATFORM_LABEL[a.platform] || a.platform}</span>
              <span style={{ fontSize: 12.5, color: CP.textMuted }}>{a.handle || "—"}</span>
              <span style={{ fontSize: 12, color: a.status === "active" ? CP.accentGreen : CP.textMuted }}>
                {a.status === "active" ? "Attivo" : "Inattivo"}
              </span>
              <span style={{ fontSize: 12.5 }}>
                {a.proxy ? (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontFamily: FONTS.mono, color: CP.accentSoftText }}
                  >
                    <a href={`/admin/social-proxies`} style={{ color: CP.accentSoftText, textDecoration: "none" }}>
                      {a.proxy.host}:{a.proxy.port}
                    </a>
                  </span>
                ) : (
                  <span style={{ color: CP.textMuted }}>Nessuno</span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}

      <AccountFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={async () => { setModalOpen(false); await mutate(); }} />
    </div>
  );
}

function AccountFormModal({ open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("twitter");
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const submit = async () => {
    setFormError(null);
    if (!name.trim()) { setFormError("Il nome è richiesto."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), platform, handle: handle.trim() || null }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setName(""); setHandle(""); setPlatform("twitter");
      await onSaved();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuovo account social">
      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={lbl}>Nome (interno)</span>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Gaja — promo Twitter" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Piattaforma</span>
          <select style={input} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.entries(PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          <span style={lbl}>Handle (opzionale)</span>
          <input style={input} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" />
        </label>
      </div>
      <p style={{ color: CP.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
        Il proxy viene assegnato automaticamente (quello attivo con meno account) — puoi cambiarlo dopo dalla scheda account.
      </p>
      {formError && <div style={{ color: CP.accentRed, fontSize: 12.5, marginBottom: 10 }}>{formError}</div>}
      <button onClick={submit} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Creo…" : "Crea account"}
      </button>
    </Modal>
  );
}

const h1 = { fontFamily: FONTS.display, fontSize: 32, margin: "8px 0 6px", fontWeight: 500, letterSpacing: "-0.02em", color: CP.textPrimary };
const panel = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 18, marginBottom: 20 };
const rowGrid = { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr 1.2fr", gap: 10 };
const lbl = { display: "block", fontSize: 11, color: CP.textMuted, marginBottom: 4 };
const errBox = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 16, color: CP.textSecondary, marginTop: 16 };
const input = {
  width: "100%", padding: "8px 10px", background: CP.bg, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none",
};
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
