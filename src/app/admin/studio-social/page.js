"use client";

/**
 * /admin/studio-social — Studio social: i profili social delle creator gestiti dalla redazione.
 *
 * Una scheda per profilo: fase (rodaggio/lancio/crescita), quanti contenuti ci sono in ogni passo
 * della coda e il prossimo in programma. Dentro il profilo: identità, coda, lista del giorno.
 * Permesso social.manage (admin, ruoli "Social" e "Social Media Manager").
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, Notice, card, NUM } from "@/components/ds";
import { useInVetro } from "@/components/VetroScope";
import { Panel, HotTile, MixBar } from "@/components/VetroCharts";
import { PLATFORMS, PLATFORM_LABEL, STATUSES, phaseLine } from "@/lib/studio-social-core";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const input = { width: "100%", padding: "8px 10px", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "");

// Fuori dal componente: definito dentro, ogni tasto lo ricreerebbe e il campo perderebbe il fuoco.
function L({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>{label}</span>{children}
    </label>
  );
}

function NewProfile({ open, onClose, onSaved }) {
  const [f, setF] = useState({ handle: "", platform: "instagram", creator: "", format: "", phaseStart: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/admin/studio-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, phase: "rodaggio" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      onSaved(j.profile);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nuovo profilo">
      <L label="Nome dell'account"><input style={input} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="marty.tibecca" /></L>
      <L label="Piattaforma">
        <select style={input} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
      </L>
      <L label="Creator"><input style={input} value={f.creator} onChange={(e) => setF({ ...f, creator: e.target.value })} placeholder="Martina Scavo" /></L>
      <L label="Format portante"><input style={input} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} placeholder="Beccato" /></L>
      <L label="Inizio del rodaggio"><input type="date" style={input} value={f.phaseStart} onChange={(e) => setF({ ...f, phaseStart: e.target.value })} /></L>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button onClick={save} disabled={saving} style={{ padding: "9px 16px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saving ? "wait" : "pointer", fontFamily: FONTS.body }}>
        {saving ? "Salvataggio…" : "Crea profilo"}
      </button>
    </Modal>
  );
}

/*
 * Vetro: «a che punto è la coda dei contenuti, e cosa aspetta una persona?» — tutti i contenuti dei
 * profili in una barra nell'ordine del lavoro (idea → pubblicato), accanto «Da approvare».
 */
function StudioTop({ profiles }) {
  const sum = (k) => profiles.reduce((a, p) => a + (p.counts?.[k] || 0), 0);
  const items = STATUSES.filter((x) => x.key !== "scartato").map((x, k) => ({ label: x.label, value: sum(x.key), color: x.key === "pubblicato" ? CP.accentGreen : undefined, k }));
  const toApprove = sum("da_approvare");
  return (
    <div className="vt-row21" style={{ marginBottom: 16 }}>
      <Panel title="La coda dei contenuti" aside={`${profiles.length} ${profiles.length === 1 ? "profilo" : "profili"} · dall'idea al pubblicato`} i={0}>
        {items.some((x) => x.value > 0) ? <MixBar items={items} format={(v) => String(v)} /> : <div style={{ fontSize: 13, color: CP.textMuted }}>Ancora nessun contenuto in coda.</div>}
      </Panel>
      <div className="vt-side" style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <HotTile i={1} lvl={toApprove ? "ink" : "0"} label="Da approvare" value={toApprove} sub={toApprove ? "pronti: una persona li guarda prima che escano" : "niente in attesa"} />
      </div>
    </div>
  );
}

export default function StudioSocialPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/studio-social", fetcher, { revalidateOnFocus: false });
  const [creating, setCreating] = useState(false);
  const profiles = data?.profiles || [];
  const inVetro = useInVetro();

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Marketing" }, { label: "Studio social" }]}
        title="Studio social"
        subtitle="I profili social delle creator gestiti dalla redazione: chi sono, cosa pubblicano e cosa c'è da fare oggi. Ogni contenuto passa dai revisori prima di uscire; follow e commenti si fanno a mano."
        actions={
          <button onClick={() => setCreating(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>
            <Plus size={14} aria-hidden="true" /> Nuovo profilo
          </button>
        }
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14, padding: "24px 0" }}>Caricamento profili…</div>}
      {error && (
        <Notice danger={error.status !== 403}>
          {error.status === 403 ? "Questa pagina è per chi gestisce i social: il tuo account non ha il permesso." : `Errore nel caricamento: ${error.message}`}
        </Notice>
      )}

      {!isLoading && !error && profiles.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>Crea il primo profilo</div>
          <div style={{ fontSize: 14, color: CP.textSecondary, marginBottom: 14 }}>Un profilo è un account social di una creator: identità, coda dei contenuti e lista del giorno.</div>
          <button onClick={() => setCreating(true)} style={{ padding: "8px 14px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Nuovo profilo</button>
        </div>
      )}

      {inVetro && profiles.length > 0 && <StudioTop profiles={profiles} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
        {profiles.map((p) => {
          const open = STATUSES.filter((s) => !["pubblicato", "scartato"].includes(s.key)).reduce((n, s) => n + (p.counts?.[s.key] || 0), 0);
          return (
            <Link key={p.id} href={`/admin/studio-social/${encodeURIComponent(p.id)}`} style={{ ...card, padding: 16, textDecoration: "none", display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: CP.accentSoft, color: CP.accentSoftText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 14, flexShrink: 0 }}>
                  {(p.handle || "?").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>@{p.handle}</div>
                  <div style={{ fontSize: 13, color: CP.textSecondary }}>{[p.creator, PLATFORM_LABEL[p.platform], p.format && `format ${p.format}`].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>{phaseLine(p, data?.today)}</div>
              <div style={{ display: "flex", gap: 16, fontSize: 13, color: CP.textMuted }}>
                <span><span style={{ color: CP.textPrimary, ...NUM }}>{open}</span> in lavorazione</span>
                <span><span style={{ color: CP.textPrimary, ...NUM }}>{p.counts?.da_approvare || 0}</span> da approvare</span>
                <span><span style={{ color: CP.textPrimary, ...NUM }}>{p.counts?.pubblicato || 0}</span> pubblicati</span>
              </div>
              {p.next && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${CP.borderSoft}`, fontSize: 13, color: CP.textSecondary }}>
                  Prossimo: <span style={{ color: CP.textPrimary }}>{p.next.title}</span> · {fmtDay(p.next.day)}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <NewProfile open={creating} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await mutate(); }} />
    </div>
  );
}

