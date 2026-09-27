"use client";

/**
 * /admin/social-accounts — account social (Twitter/Reddit/Instagram/TikTok)
 * usati per la promozione ufficiale dei creator (SEED).
 *
 * Redesign 26/09/2026 sul design system: testata DS, riepilogo (quanti attivi,
 * quanti senza proxy = da sistemare), tabella ordinabile al posto della griglia
 * (che a 390px si rompeva), stato vuoto che spiega l'ordine giusto (prima i
 * proxy, poi gli account). Creazione nel Modal di cp-style, API invariate.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { Modal } from "@/components/cp-style";
import { PageHead, Metric, Notice, DataTable, card } from "@/components/ds";

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
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/social-accounts", fetcher, { revalidateOnFocus: false });
  const [modalOpen, setModalOpen] = useState(false);
  const items = data?.items || [];
  const active = items.filter((a) => a.status === "active").length;
  const noProxy = items.filter((a) => a.status === "active" && !a.proxy).length;

  const columns = [
    { key: "name", label: "Account", render: (a) => <span style={{ fontWeight: 500 }}>{a.name}</span> },
    { key: "platform", label: "Piattaforma", sort: (a) => PLATFORM_LABEL[a.platform] || a.platform, render: (a) => PLATFORM_LABEL[a.platform] || a.platform },
    { key: "handle", label: "Handle", muted: true, render: (a) => a.handle || "—" },
    { key: "status", label: "Stato", render: (a) => <span style={{ color: a.status === "active" ? CP.textPrimary : CP.textMuted }}>{a.status === "active" ? "Attivo" : "Non attivo"}</span> },
    {
      key: "proxy", label: "Proxy", sort: (a) => (a.proxy ? `${a.proxy.host}:${a.proxy.port}` : ""),
      render: (a) => a.proxy ? (
        <Link href="/admin/social-proxies" onClick={(e) => e.stopPropagation()} style={{ color: CP.accentSoftText, textDecoration: "none" }}>
          {a.proxy.host}:{a.proxy.port}
        </Link>
      ) : <span style={{ color: a.status === "active" ? CP.accentRed : CP.textMuted }}>Nessuno</span>,
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Marketing" }, { label: "Account social" }]}
        title="Account social"
        subtitle="Gli account ufficiali con cui promuoviamo le creator. Ognuno esce su internet da un proxy dedicato, per tenere separate le connessioni: se non lo scegli, gli viene dato quello attivo con meno account."
        actions={!error && (
          <button onClick={() => setModalOpen(true)} style={btnPrimary}>
            <Plus size={15} /> Nuovo account
          </button>
        )}
      />

      {error && (
        <Notice danger={error.status !== 403}>
          {error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare gli account: ${error.message}`}
        </Notice>
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!error && !isLoading && items.length === 0 && (
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessun account ancora</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
            <li>Prima aggiungi e prova almeno un proxy in <Link href="/admin/social-proxies" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Proxy account social</Link>: solo i proxy attivi vengono assegnati.</li>
            <li>Poi crea qui l’account con “Nuovo account”: il proxy gli viene assegnato da solo.</li>
            <li>Se serve, cambi il proxy dalla scheda dell’account.</li>
          </ol>
        </section>
      )}

      {!error && items.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Account" value={fmtInt(items.length)} />
            <Metric label="Attivi" value={fmtInt(active)} />
            <Metric label="Attivi senza proxy" value={fmtInt(noProxy)} danger={noProxy > 0} note={noProxy > 0 ? "aprili e assegna un proxy" : "tutti coperti"} />
          </section>
          <DataTable columns={columns} rows={items} defaultSort={{ key: "name", dir: 1 }} onRowClick={(a) => router.push(`/admin/social-accounts/${a.id}`)} minWidth={640} maxHeight={640} />
          <div style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 8 }}>Clicca un account per vederne la scheda e cambiare il proxy.</div>
        </>
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
    if (!name.trim()) { setFormError("Scrivi un nome per riconoscere l’account."); return; }
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
        <span style={lbl}>Nome (lo vedete solo voi)</span>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Gaja — promo Twitter" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
        <label>
          <span style={lbl}>Piattaforma</span>
          <select style={input} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.entries(PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          <span style={lbl}>Handle (facoltativo)</span>
          <input style={input} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" />
        </label>
      </div>
      <p style={{ color: CP.textMuted, fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
        Il proxy viene assegnato da solo (quello attivo con meno account). Puoi cambiarlo dopo dalla scheda dell’account.
      </p>
      {formError && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{formError}</div>}
      <button onClick={submit} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Creo…" : "Crea account"}
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
