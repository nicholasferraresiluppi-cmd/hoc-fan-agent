"use client";

/**
 * /admin/roadmap — Roadmap di prodotto HOC Pro.
 *
 * Le idee/feature future vivono qui, visibili, invece che come pagine
 * placeholder in navigazione (regola anti-polverone). Quattro colonne:
 * in corso / prossime / più avanti / parcheggiate (con gate esplicito).
 * Admin-only: il contenuto è strategia interna di prodotto.
 */
import { useState } from "react";
import useSWR from "swr";
import {
  Signpost, Plus, Trash2, ExternalLink, Pencil, Lock, X,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel } from "@/components/cp-style";

const COLUMNS = [
  { key: "now",    label: "In corso",     hint: "Ci stiamo lavorando adesso" },
  { key: "next",   label: "Prossime",     hint: "Le prossime in coda" },
  { key: "later",  label: "Più avanti",   hint: "Decise ma non urgenti" },
  { key: "parked", label: "Parcheggiate", hint: "Ferme dietro un gate esplicito" },
];

const EMPTY_FORM = { id: "", title: "", desc: "", status: "later", area: "", gate: "", link: "", source: "" };

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

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  background: CP.surface,
  border: `1px solid ${CP.border}`,
  borderRadius: 8,
  color: CP.textPrimary,
  fontSize: 12,
  fontFamily: FONTS.body,
  outline: "none",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 11, color: CP.textMuted, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

export default function RoadmapPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/roadmap", fetcher, { revalidateOnFocus: false });
  const [form, setForm] = useState(null); // null = chiuso, oggetto = form aperto
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const items = data?.items ? Object.values(data.items) : [];

  const upsert = async (payload) => {
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/admin/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await mutate();
      setForm(null);
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Rimuovere "${item.title}" dalla roadmap?`)) return;
    try {
      const r = await fetch(`/api/admin/roadmap?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await mutate();
    } catch (e) {
      setFeedback(e.message);
    }
  };

  const moveTo = (item, status) => {
    if (status === item.status) return;
    upsert({ ...item, status });
  };

  return (
    <div style={{ padding: "32px 32px 64px 32px", maxWidth: 1500, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <SectionLabel>Prodotto</SectionLabel>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 34, margin: "8px 0 4px 0", fontWeight: 500, letterSpacing: "-0.02em", color: CP.textPrimary, display: "flex", alignItems: "center", gap: 12 }}>
            <Signpost size={28} color={CP.accent} aria-hidden="true" />
            Roadmap
          </h1>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.5, maxWidth: 640 }}>
            Le idee future di HOC Pro vivono qui, visibili — niente pagine placeholder in navigazione.
            Le voci parcheggiate riportano il gate che le sblocca.
          </p>
        </div>
        <button
          onClick={() => setForm(form ? null : { ...EMPTY_FORM })}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 14px",
            background: form ? CP.surfaceAlt : CP.accent,
            color: form ? CP.textSecondary : CP.accentInk,
            border: form ? `1px solid ${CP.border}` : "1px solid transparent",
            borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer",
          }}
        >
          {form ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          {form ? "Chiudi" : "Nuova voce"}
        </button>
      </div>

      {/* Form nuova voce / modifica */}
      {form && (
        <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, marginBottom: 12 }}>
            {form.id ? "Modifica voce" : "Nuova voce"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Field label="Titolo (obbligatorio)">
              <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Es. Viste venduto live da API Infloww" />
            </Field>
            <Field label="Stato">
              <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Area">
              <input style={inputStyle} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Es. Comp, People, Integrazioni" />
            </Field>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Field label="Descrizione (1 riga)">
              <input style={inputStyle} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Cosa fa / perché interessa" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
            <Field label="Gate (cosa la sblocca, per le parcheggiate)">
              <input style={inputStyle} value={form.gate} onChange={(e) => setForm({ ...form, gate: e.target.value })} placeholder="Es. decisione board su risk appetite" />
            </Field>
            <Field label="Link dossier / doc">
              <input style={inputStyle} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Fonte">
              <input style={inputStyle} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Es. sessione 19/07, benchmark #8" />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => upsert(form)}
              disabled={saving || !form.title.trim()}
              style={{
                padding: "8px 16px", background: CP.accent, color: CP.accentInk,
                border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500,
                fontFamily: FONTS.body, cursor: saving ? "wait" : "pointer",
                opacity: saving || !form.title.trim() ? 0.6 : 1,
              }}
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
            {feedback && <span style={{ fontSize: 12, color: CP.accentRed }}>{feedback}</span>}
          </div>
        </div>
      )}

      {feedback && !form && (
        <div style={{ fontSize: 12, color: CP.accentRed, marginBottom: 14 }}>{feedback}</div>
      )}

      {/* Stati di caricamento / errore */}
      {isLoading && (
        <div style={{ color: CP.textMuted, fontSize: 13, padding: "40px 0" }}>Caricamento roadmap…</div>
      )}
      {error && (
        <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 24, color: CP.textSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <Lock size={16} color={CP.textMuted} aria-hidden="true" />
          {error.status === 403
            ? "Vista riservata agli admin: il tuo account non ha la capability necessaria."
            : `Errore nel caricamento: ${error.message}`}
        </div>
      )}

      {/* Colonne */}
      {!isLoading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, alignItems: "start" }}>
          {COLUMNS.map((col) => {
            const colItems = items
              .filter((it) => it.status === col.key)
              .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
            return (
              <div key={col.key} style={{ background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 12, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 8px 10px 8px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>{col.label}</div>
                    <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>{col.hint}</div>
                  </div>
                  <span style={{ fontSize: 11, color: CP.textMuted, fontFamily: FONTS.mono }}>{colItems.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colItems.length === 0 && (
                    <div style={{ fontSize: 12, color: CP.mutedIcons, padding: "14px 8px 18px 8px" }}>
                      Niente qui.
                    </div>
                  )}
                  {colItems.map((item) => (
                    <div key={item.id} style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 12px 10px 12px" }}>
                      {item.area && (
                        <span style={{ display: "inline-block", background: CP.accentSoft, color: CP.accentSoftText, borderRadius: 6, fontSize: 11, padding: "2px 6px", marginBottom: 7 }}>
                          {item.area}
                        </span>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.35 }}>{item.title}</div>
                      {item.desc && (
                        <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.45, marginTop: 4 }}>{item.desc}</div>
                      )}
                      {item.gate && (
                        <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 7, display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.4 }}>
                          <Lock size={11} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                          <span>Gate: {item.gate}</span>
                        </div>
                      )}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: CP.accentSoftText, textDecoration: "none", marginTop: 7 }}>
                          <ExternalLink size={11} aria-hidden="true" /> Dossier
                        </a>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${CP.borderSoft}` }}>
                        <select
                          value={item.status}
                          onChange={(e) => moveTo(item, e.target.value)}
                          aria-label={`Sposta "${item.title}"`}
                          style={{ ...inputStyle, width: "auto", padding: "4px 6px", fontSize: 11, color: CP.textSecondary }}
                        >
                          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <span style={{ flex: 1, fontSize: 10, color: CP.mutedIcons, textAlign: "right" }} title={item.source ? `Fonte: ${item.source}` : ""}>
                          {fmtDate(item.updated_at)}
                        </span>
                        <button
                          onClick={() => { setForm({ ...EMPTY_FORM, ...item }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          aria-label={`Modifica ${item.title}`}
                          style={{ background: "transparent", border: "none", color: CP.mutedIcons, cursor: "pointer", padding: 3, display: "flex" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = CP.textSecondary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = CP.mutedIcons)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => remove(item)}
                          aria-label={`Rimuovi ${item.title}`}
                          style={{ background: "transparent", border: "none", color: CP.mutedIcons, cursor: "pointer", padding: 3, display: "flex" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = CP.accentRed)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = CP.mutedIcons)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
