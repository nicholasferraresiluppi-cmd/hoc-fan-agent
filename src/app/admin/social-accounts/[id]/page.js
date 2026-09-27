"use client";

/**
 * /admin/social-accounts/[id] — dettaglio account social: piattaforma, status,
 * proxy associato (con link) + selector per cambiarlo (SEED).
 *
 * Redesign 26/09/2026 sul design system: testata DS con percorso, scheda proxy
 * con lo stato spiegato (cosa vuol dire "non testato" / "errore" e cosa fare),
 * account attivo senza proxy segnalato. Cambio proxy nel Modal di cp-style.
 * Le credenziali del proxy non sono mai mostrate. API invariate.
 */
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, Notice, SectionTitle, card } from "@/components/ds";

const PLATFORM_LABEL = { twitter: "Twitter/X", reddit: "Reddit", instagram: "Instagram", tiktok: "TikTok", other: "Altro" };
const PROXY_STATUS = {
  active: { label: "Funziona", hint: "l’ultima prova di connessione è andata a buon fine" },
  error: { label: "Errore", hint: "l’ultima prova non è riuscita: controllalo in Proxy account social" },
  inactive: { label: "Mai provato", hint: "provalo da Proxy account social prima di contarci" },
};

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

export default function SocialAccountDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/admin/social-accounts/${id}` : null, fetcher, { revalidateOnFocus: false });
  const [selectorOpen, setSelectorOpen] = useState(false);
  const a = data?.account;
  const crumbs = [{ label: "Hub", href: "/admin" }, { label: "Account social", href: "/admin/social-accounts" }, { label: a?.name || "Scheda" }];

  if (error || isLoading || !a) {
    return (
      <div style={wrap}>
        <PageHead crumbs={crumbs} title="Account social" />
        {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
        {error && (
          <Notice danger={error.status !== 403 && error.status !== 404}>
            {error.status === 403 ? "Pagina riservata agli admin."
              : error.status === 404 ? <>Questo account non esiste più (forse è stato eliminato). <Link href="/admin/social-accounts" style={{ color: CP.accentSoftText }}>Torna all’elenco →</Link></>
              : `Non riesco a caricare l’account: ${error.message}`}
          </Notice>
        )}
      </div>
    );
  }

  const ps = a.proxy ? (PROXY_STATUS[a.proxy.status] || PROXY_STATUS.inactive) : null;
  const isActive = a.status === "active";

  return (
    <div style={wrap}>
      <PageHead
        crumbs={crumbs}
        title={a.name}
        subtitle={`${PLATFORM_LABEL[a.platform] || a.platform}${a.handle ? ` · ${a.handle}` : ""} · ${isActive ? "attivo" : "non attivo"}. Da qui vedi da quale proxy esce l’account e puoi cambiarlo.`}
      />

      {isActive && !a.proxy && (
        <Notice danger>Questo account è attivo ma non ha un proxy: le sue connessioni non sono separate dagli altri. Assegnagliene uno con “Cambia proxy”.</Notice>
      )}

      <section style={{ ...card, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <SectionTitle>Proxy</SectionTitle>
          <button onClick={() => setSelectorOpen(true)} style={btnGhost}>
            <RefreshCw size={13} /> Cambia proxy
          </button>
        </div>
        {a.proxy ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            <Field label="Indirizzo">
              <Link href="/admin/social-proxies" style={{ color: CP.accentSoftText, textDecoration: "none", wordBreak: "break-all" }}>{a.proxy.host}:{a.proxy.port}</Link>
            </Field>
            <Field label="Tipo">{a.proxy.type === "socks5" ? "SOCKS5" : "HTTP"}</Field>
            <Field label="Fornitore">{a.proxy.provider || <span style={{ color: CP.textMuted }}>non indicato</span>}</Field>
            <Field label="Stato">
              <span style={{ color: a.proxy.status === "error" ? CP.accentRed : CP.textPrimary }}>{ps.label}</span>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{ps.hint}</div>
            </Field>
          </div>
        ) : (
          <div style={{ color: CP.textMuted, fontSize: 14 }}>Nessun proxy associato.</div>
        )}
      </section>

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

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 15, color: CP.textPrimary, marginTop: 2 }}>{children}</div>
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
      <p style={{ margin: "0 0 12px", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>Compaiono solo i proxy che funzionano (ultima prova riuscita). Accanto, quanti account usano già ciascuno.</p>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        <button onClick={() => choose(null)} disabled={saving || currentProxyId == null} style={{ ...proxyOption, opacity: currentProxyId == null ? 0.5 : 1 }}>
          Nessun proxy{currentProxyId == null ? " (attuale)" : ""}
        </button>
        {data && proxies.length === 0 && (
          <div style={{ color: CP.textMuted, fontSize: 13, padding: "8px 2px" }}>
            Nessun proxy funzionante disponibile. Aggiungine o provane uno in <Link href="/admin/social-proxies" style={{ color: CP.accentSoftText }}>Proxy account social</Link>.
          </div>
        )}
        {!data && <div style={{ color: CP.textMuted, fontSize: 13, padding: "8px 2px" }}>Caricamento…</div>}
        {proxies.map((p) => (
          <button key={p.id} onClick={() => choose(p.id)} disabled={saving || p.id === currentProxyId} style={{ ...proxyOption, opacity: p.id === currentProxyId ? 0.5 : 1 }}>
            <span>{p.host}:{p.port}{p.id === currentProxyId ? " (attuale)" : ""}</span>
            <span style={{ color: CP.textMuted, marginLeft: 8 }}>{p.provider || "—"} · {p.accountCount} account</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const wrap = { padding: "28px 24px 64px", maxWidth: 900, margin: "0 auto", fontFamily: FONTS.body };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body };
const proxyOption = {
  textAlign: "left", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 13.5, cursor: "pointer", fontFamily: FONTS.body,
};
