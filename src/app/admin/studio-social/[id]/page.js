"use client";

/**
 * /admin/studio-social/[id] — un profilo social della redazione.
 *
 * Dall'alto: fase e numeri, cosa fare oggi a mano, la settimana (calendario fisso + contenuti del
 * giorno), la coda dei contenuti a colonne con gli esiti dei revisori, e l'identità (la "bibbia")
 * da cui tutto deve discendere, poi Telegram e landing (TelegramPanel). Un contenuto va in
 * "Programmati" solo col video montato, i quattro revisori, la qualità «ok» con tutte le voci e
 * nessun blocco: la regola la applica il server.
 */
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, Notice, SectionTitle, card, NUM, alpha } from "@/components/ds";
import {
  PLATFORM_LABEL, PHASES, STATUSES, KINDS, REVIEWERS, qualityChecksFor, WEEKDAYS, WEEKDAY_LABEL,
  phaseLine, phaseDay, canSchedule, weekdayOf,
} from "@/lib/studio-social-core";
import TelegramPanel, { FunnelTiles, PostModal } from "@/components/studio/TelegramPanel";
import EditorialSection from "@/components/studio/EditorialSection";
import { IG_ROLES } from "@/lib/studio-editorial-core";
import QualityAgent from "@/components/studio/QualityAgent";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const field = { width: "100%", padding: "8px 10px", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };
const btn = (primary) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  fontFamily: FONTS.body, cursor: "pointer",
  background: primary ? CP.accent : "transparent", color: primary ? CP.accentInk : CP.textPrimary,
  border: primary ? "none" : `1px solid ${CP.border}`,
});
const OUTCOME = {
  ok: { label: "Ok", color: CP.accentGreen },
  attenzione: { label: "Attenzione", color: CP.textSecondary },
  blocca: { label: "Blocca", color: CP.accentRed },
};

function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "senza data");

function L({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: CP.textMuted, marginTop: 3 }}>{hint}</span>}
    </label>
  );
}

function ReviewChips({ item }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {REVIEWERS.map((r) => {
        const rv = item.reviews?.[r.key];
        const o = rv ? OUTCOME[rv.outcome] : null;
        return (
          <span key={r.key} title={rv?.note || r.hint} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, border: `1px solid ${o ? alpha(o.color, "66") : CP.borderSoft}`, color: o ? o.color : CP.textMuted }}>
            {r.label}{o ? `: ${o.label.toLowerCase()}` : ""}
          </span>
        );
      })}
    </div>
  );
}

const fmtWhen = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** Instagram via Postiz: ora di uscita, stato del post, riprova. Il video è quello del controllo AI. */
function InstagramBlock({ pid, f, setF, postizOn, rodaggio, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const pz = f.postiz;
  const publish = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/studio-social/${encodeURIComponent(pid)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publishIg", itemId: f.id, publishAtLocal: f.publishAtLocal }) });
      const j = await r.json().catch(() => null);
      if (j?.item) setF((x) => ({ ...x, postiz: j.item.postiz, publishAtLocal: j.item.publishAtLocal }));
      if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
      setMsg("Programmato su Instagram");
      onRefresh?.();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ border: `1px solid ${CP.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>Instagram</div>
      {!postizOn && <div style={{ fontSize: 12, color: CP.textMuted }}>Postiz non è collegato in questo ambiente.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, alignItems: "end" }}>
        <L label="Esce su Instagram" hint="Ora di Roma">
          <input type="datetime-local" style={field} value={f.publishAtLocal || (f.day ? `${f.day}T18:30` : "")} disabled={!!pz?.postId && pz.state !== "ERROR"} onChange={(e) => setF({ ...f, publishAtLocal: e.target.value })} />
        </L>
        <div style={{ fontSize: 13, color: CP.textSecondary, paddingBottom: 12, lineHeight: 1.45 }}>
          {f.video?.path ? <>Video: {f.video.name || "salvato"}</> : <span style={{ color: CP.textMuted }}>Il video si salva facendo il controllo AI qui sopra</span>}
        </div>
      </div>
      {pz?.state === "QUEUE" && <div style={{ fontSize: 13, color: CP.accentGreen }}>In coda su Instagram per {fmtWhen(pz.scheduledFor)}. Se lo riporti indietro nella coda, il post si toglie da solo.</div>}
      {pz?.state === "PUBLISHED" && <div style={{ fontSize: 13, color: CP.accentGreen }}>Pubblicato{pz.releaseURL ? <> · <a href={pz.releaseURL} target="_blank" rel="noreferrer" style={{ color: CP.accent }}>apri su Instagram</a></> : null}</div>}
      {pz?.state === "ERROR" && <div style={{ fontSize: 13, color: CP.accentRed }}>Non partito: {pz.error || "errore di Postiz"}</div>}
      {f.status === "programmato" && postizOn && (!pz?.postId || pz.state === "ERROR") && (
        <button style={{ ...btn(true), marginTop: 8 }} disabled={busy || !f.video?.path} onClick={publish}>{busy ? "Invio a Postiz…" : pz?.state === "ERROR" ? "Riprova su Instagram" : "Programma su Instagram"}</button>
      )}
      {f.status !== "programmato" && f.status !== "pubblicato" && <div style={{ fontSize: 12, color: CP.textMuted }}>Con «Approva e programma» va in coda su Instagram all'ora scelta.</div>}
      {rodaggio && <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 6 }}>Il profilo è in rodaggio: consigliato pubblicare a mano dal telefono fino all'8º giorno.</div>}
      {msg && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function ItemModal({ item, onClose, onSave, onDelete, saving, err, pid, refs, onRefresh, arcs = [], onApprove, postizOn, rodaggio }) {
  const [f, setF] = useState(() => ({ kind: "reel", status: "idea", ...item, reviews: { ...(item?.reviews || {}) } }));
  const setReview = (key, patch) => setF((x) => {
    const cur = x.reviews?.[key] || {};
    const next = { ...cur, ...patch };
    const reviews = { ...x.reviews };
    if (!next.outcome && !(next.checks || []).length) delete reviews[key]; else reviews[key] = next;
    return { ...x, reviews };
  });
  const gate = canSchedule(f);
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12 };
  return (
    <Modal open onClose={onClose} title={f.id ? "Contenuto" : "Nuovo contenuto"} maxWidth={720}>
      <L label="Titolo"><input style={field} value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Beccato #1 · Marco delle 3 di notte" /></L>
      <div style={grid}>
        <L label="Tipo">
          <select style={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
        </L>
        <L label="Passo">
          <select style={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </L>
        <L label="Giorno di uscita"><input type="date" style={field} value={f.day || ""} onChange={(e) => setF({ ...f, day: e.target.value })} /></L>
        <L label="Format"><input style={field} value={f.format || ""} onChange={(e) => setF({ ...f, format: e.target.value })} placeholder="Beccato" /></L>
      </div>
      <div style={grid}>
        <L label="Storia della settimana">
          <select style={field} value={f.arcId || ""} onChange={(e) => setF({ ...f, arcId: e.target.value || null })}>
            <option value="">Nessuna</option>
            {arcs.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </L>
        <L label="Ruolo nella storia">
          <select style={field} value={f.arcRole || ""} onChange={(e) => setF({ ...f, arcRole: e.target.value || null })}>
            <option value="">—</option>
            {IG_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </L>
      </div>
      <L label="Gancio a schermo" hint="Massimo 6 parole, si legge in un secondo senza audio"><input style={field} value={f.hook || ""} onChange={(e) => setF({ ...f, hook: e.target.value })} /></L>
      <L label="Script"><textarea style={{ ...field, minHeight: 180, fontFamily: FONTS.mono || FONTS.body, fontSize: 13, lineHeight: 1.5 }} value={f.script || ""} onChange={(e) => setF({ ...f, script: e.target.value })} /></L>
      <div style={grid}>
        <L label="Ripresa"><textarea style={{ ...field, minHeight: 70 }} value={f.shooting || ""} onChange={(e) => setF({ ...f, shooting: e.target.value })} /></L>
        <L label="Didascalia" hint="Una riga, senza domande, 0-2 hashtag"><textarea style={{ ...field, minHeight: 70 }} value={f.caption || ""} onChange={(e) => setF({ ...f, caption: e.target.value })} /></L>
      </div>
      <L label="Perché dovrebbe funzionare"><input style={field} value={f.why || ""} onChange={(e) => setF({ ...f, why: e.target.value })} /></L>
      <L label="Video montato (link)" hint="Serve per approvare: qualità e controllo tecnico si fanno sul video, non sullo script"><input style={field} value={f.mediaUrl || ""} onChange={(e) => setF({ ...f, mediaUrl: e.target.value })} placeholder="https://…" /></L>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textPrimary, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={!!f.ai} onChange={(e) => setF({ ...f, ai: e.target.checked })} />
        Ha parti generate con l'AI (va pubblicato con l'etichetta AI)
      </label>

      <QualityAgent pid={pid} item={f} refs={refs} onResult={(it) => { setF((x) => ({ ...x, reviews: it.reviews, aiReview: it.aiReview })); onRefresh?.(); }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 8px" }}>Revisori</div>
      {REVIEWERS.map((r) => {
        const rv = f.reviews?.[r.key] || {};
        return (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 150px) minmax(0, 130px) minmax(0, 1fr)", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, paddingTop: 8 }} title={r.hint}>{r.label}</div>
            <select style={field} value={rv.outcome || ""} onChange={(e) => setReview(r.key, { outcome: e.target.value || null, at: Date.now() })} aria-label={`Esito ${r.label}`}>
              <option value="">Non ancora</option>
              {Object.entries(OUTCOME).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
            <input style={field} value={rv.note || ""} onChange={(e) => setReview(r.key, { note: e.target.value })} placeholder="Nota del revisore" aria-label={`Nota ${r.label}`} />
            {r.key === "qualita" && (
              <div style={{ gridColumn: "1 / -1", padding: "8px 10px", border: `1px solid ${CP.borderSoft}`, borderRadius: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Ok solo con tutte le voci spuntate, guardando il video intero</div>
                {qualityChecksFor(f).map((c) => {
                  const on = (rv.checks || []).includes(c.key);
                  return (
                    <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: CP.textPrimary, padding: "3px 0", cursor: "pointer", lineHeight: 1.4 }}>
                      <input type="checkbox" checked={on} style={{ marginTop: 3 }} onChange={() => setReview("qualita", { checks: on ? (rv.checks || []).filter((k) => k !== c.key) : [...(rv.checks || []), c.key] })} />
                      {c.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {f.id && <InstagramBlock pid={pid} f={f} setF={setF} postizOn={postizOn} rodaggio={rodaggio} onRefresh={onRefresh} />}
      {!gate.ok && <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 10 }}>Per programmarlo: {gate.reason.toLowerCase()}.</div>}
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn(true)} disabled={saving} onClick={() => onSave(f)}>{saving ? "Salvataggio…" : "Salva"}</button>
        {f.status === "da_approvare" && gate.ok && (
          <button style={btn(false)} disabled={saving} onClick={() => onApprove({ ...f, status: "programmato", publishAtLocal: f.publishAtLocal || (f.day ? `${f.day}T18:30` : null) })}><Check size={14} aria-hidden="true" /> Approva e programma</button>
        )}
        {f.id && (
          <button style={{ ...btn(false), marginLeft: "auto", color: CP.accentRed }} onClick={() => onDelete(f)}><Trash2 size={14} aria-hidden="true" /> Elimina</button>
        )}
      </div>
    </Modal>
  );
}

function IdentityModal({ profile, onClose, onSave, saving, err }) {
  const [f, setF] = useState(() => ({
    ...profile,
    identity: { ...profile.identity, racconto: (profile.identity?.racconto || []).join("\n"), maiFare: (profile.identity?.maiFare || []).join("\n") },
    daily: (profile.daily || []).join("\n"),
  }));
  const setId = (k, v) => setF((x) => ({ ...x, identity: { ...x.identity, [k]: v } }));
  return (
    <Modal open onClose={onClose} title="Identità del profilo" maxWidth={720}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <L label="Fase">
          <select style={field} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })}>{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        </L>
        <L label="Inizio della fase"><input type="date" style={field} value={f.phaseStart || ""} onChange={(e) => setF({ ...f, phaseStart: e.target.value })} /></L>
        <L label="Format portante"><input style={field} value={f.format || ""} onChange={(e) => setF({ ...f, format: e.target.value })} /></L>
        <L label="Tracking link" hint="Nome del link CreatorsPro di questo profilo"><input style={field} value={f.trackingLink || ""} onChange={(e) => setF({ ...f, trackingLink: e.target.value })} /></L>
      </div>
      <L label="Chi è (cosa raccontiamo)"><textarea style={{ ...field, minHeight: 80 }} value={f.identity.personaggio || ""} onChange={(e) => setId("personaggio", e.target.value)} /></L>
      <L label="La promessa a chi guarda"><input style={field} value={f.identity.promessa || ""} onChange={(e) => setId("promessa", e.target.value)} /></L>
      <L label="Come lo raccontiamo" hint="Una regola per riga: serie, personaggi ricorrenti, struttura del reel"><textarea style={{ ...field, minHeight: 100 }} value={f.identity.racconto} onChange={(e) => setId("racconto", e.target.value)} /></L>
      <L label="Voce"><textarea style={{ ...field, minHeight: 60 }} value={f.identity.voce || ""} onChange={(e) => setId("voce", e.target.value)} /></L>
      <L label="Estetica"><textarea style={{ ...field, minHeight: 60 }} value={f.identity.estetica || ""} onChange={(e) => setId("estetica", e.target.value)} /></L>
      <L label="Cosa non fa mai" hint="Una regola per riga"><textarea style={{ ...field, minHeight: 80 }} value={f.identity.maiFare} onChange={(e) => setId("maiFare", e.target.value)} /></L>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 8px" }}>Calendario fisso</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
        {WEEKDAYS.map((d) => (
          <L key={d} label={WEEKDAY_LABEL[d]}><input style={field} value={f.calendar?.[d] || ""} onChange={(e) => setF({ ...f, calendar: { ...f.calendar, [d]: e.target.value } })} /></L>
        ))}
      </div>
      <L label="Da fare a mano ogni giorno" hint="Una voce per riga; vuoto = la lista di base"><textarea style={{ ...field, minHeight: 90 }} value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} /></L>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button style={btn(true)} disabled={saving} onClick={() => onSave(f)}>{saving ? "Salvataggio…" : "Salva"}</button>
    </Modal>
  );
}

export default function StudioProfilePage() {
  const { id } = useParams();
  const url = `/api/admin/studio-social/${encodeURIComponent(id)}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const { data: tg, mutate: mutateTg } = useSWR(`${url}/telegram`, fetcher, { revalidateOnFocus: false }); // stessa chiave del pannello: una sola richiesta
  const [editing, setEditing] = useState(null); // contenuto aperto
  const [editId, setEditId] = useState(false);  // identità aperta
  const [postEditing, setPostEditing] = useState(null); // messaggio Telegram aperto dall'Editoriale
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const profile = data?.profile;
  const items = useMemo(() => data?.items || [], [data]);
  const today = data?.today;

  const post = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  };
  const saveItem = async (item) => {
    setSaving(true); setErr(null);
    try { await post({ action: "item", item }); await mutate(); setEditing(null); } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  // approvazione: il contenuto va in «Programmati» e, se c'è il video controllato, parte la coda su Instagram
  const approveItem = async (item) => {
    setSaving(true); setErr(null);
    try {
      const saved = await post({ action: "item", item });
      if (data?.postiz && saved.item?.video?.path) {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publishIg", itemId: saved.item.id, publishAtLocal: item.publishAtLocal }) });
        const j = await r.json().catch(() => null);
        if (!r.ok) { await mutate(); setEditing(j?.item || saved.item); setErr(`Approvato, ma Instagram non è partito: ${j?.error || r.status}`); return; }
      }
      await mutate(); setEditing(null);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const deleteItem = async (item) => {
    if (!confirm(`Eliminare "${item.title}"?`)) return;
    try { await post({ action: "deleteItem", itemId: item.id }); await mutate(); setEditing(null); } catch (e) { setErr(e.message); }
  };
  const moveItem = async (item, status) => {
    setErr(null);
    try { await post({ action: "item", item: { ...item, status } }); await mutate(); } catch (e) { setErr(e.message); }
  };
  const toggle = async (row) => {
    mutate({ ...data, checklist: data.checklist.map((c) => (c.i === row.i ? { ...c, done: !c.done } : c)) }, false);
    try { await post({ action: "check", index: row.i, done: !row.done }); } finally { mutate(); }
  };
  const saveProfile = async (f) => {
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/admin/studio-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await mutate(); setEditId(false);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const saveArc = async (arc) => { await post({ action: "arc", arc }); await mutate(); };
  const deleteArc = async (arc) => { await post({ action: "deleteArc", arcId: arc.id }); await mutate(); };

  if (isLoading) return <div style={{ padding: 28, color: CP.textMuted, fontFamily: FONTS.body }}>Caricamento profilo…</div>;
  if (error) {
    return (
      <div style={{ padding: 28, fontFamily: FONTS.body }}>
        <Notice danger={error.status !== 403}>
          {error.status === 403 ? "Questa pagina è per chi gestisce i social: il tuo account non ha il permesso." : error.status === 404 ? "Profilo non trovato." : `Errore nel caricamento: ${error.message}`}
        </Notice>
      </div>
    );
  }
  if (!profile) return null;

  const phase = PHASES.find((p) => p.key === profile.phase) || PHASES[0];
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const doneCount = (data.checklist || []).filter((c) => c.done).length;
  const idn = profile.identity || {};

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Studio social", href: "/admin/studio-social" }, { label: `@${profile.handle}` }]}
        title={`@${profile.handle}`}
        subtitle={[profile.creator, PLATFORM_LABEL[profile.platform], profile.format && `format ${profile.format}`].filter(Boolean).join(" · ")}
        actions={<button style={btn(true)} onClick={() => setEditing({ day: today, format: profile.format || "" })}><Plus size={14} aria-hidden="true" /> Nuovo contenuto</button>}
      />
      {err && !editing && !editId && <Notice danger>{err}</Notice>}

      {/* Fase e numeri */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ ...card, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: CP.textMuted }}>Fase</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginTop: 2 }}>{phaseLine(profile, today)}</div>
          <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 4, lineHeight: 1.4 }}>{phase.hint}</div>
        </div>
        {/* Percorso: landing → Telegram → OnlyFans (numeri veri, o cosa manca per averli) */}
        <FunnelTiles data={tg} />
      </div>

      {/* Oggi a mano + settimana */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ ...card, padding: 16 }}>
          <SectionTitle aside={<span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{doneCount} di {data.checklist.length}</span>}>Oggi, a mano</SectionTitle>
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "-4px 0 10px" }}>Follow, commenti e storie non si automatizzano: li fa una persona dal telefono.</div>
          {data.checklist.map((c) => (
            <label key={c.i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer" }}>
              <input type="checkbox" checked={c.done} onChange={() => toggle(c)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 14, color: c.done ? CP.textMuted : CP.textPrimary, textDecoration: c.done ? "line-through" : "none" }}>{c.text}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Editoriale: la settimana come una storia, Instagram e Telegram insieme */}
      <EditorialSection
        today={today} items={items} posts={tg?.posts || []} arcs={data.arcs || []}
        onOpenItem={(it) => setEditing(it)}
        onNewItem={(prefill) => setEditing({ format: profile.format || "", ...prefill })}
        onOpenPost={(p) => setPostEditing(p)}
        onNewPost={(prefill) => setPostEditing(prefill)}
        onSaveArc={saveArc} onDeleteArc={deleteArc}
      />

      {/* Coda */}
      <SectionTitle>Coda dei contenuti</SectionTitle>
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(230px, 1fr)", gap: 10, alignItems: "start", overflowX: "auto", paddingBottom: 8, marginBottom: 24 }}>
        {STATUSES.filter((s) => s.key !== "scartato").map((col) => {
          const colItems = items.filter((it) => it.status === col.key).sort((a, b) => String(a.day || "9").localeCompare(String(b.day || "9")));
          return (
            <div key={col.key} style={{ background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 10, padding: 8, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 6px 8px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>{col.label}</div>
                  <div style={{ fontSize: 11, color: CP.textMuted }}>{col.hint}</div>
                </div>
                <span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{colItems.length}</span>
              </div>
              {colItems.length === 0 && <div style={{ fontSize: 12, color: CP.textMuted, padding: "8px 6px 12px" }}>Niente qui.</div>}
              {colItems.map((it) => (
                <div key={it.id} style={{ background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, padding: 10, marginBottom: 6 }}>
                  <button onClick={() => setEditing(it)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", width: "100%", fontFamily: FONTS.body }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.35 }}>{it.title}</div>
                    <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 2 }}>{[fmtDay(it.day), KINDS.find((k) => k.key === it.kind)?.label, it.hook && `"${it.hook}"`].filter(Boolean).join(" · ")}</div>
                  </button>
                  <ReviewChips item={it} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <select value={it.status} onChange={(e) => moveItem(it, e.target.value)} aria-label={`Sposta ${it.title}`} style={{ ...field, width: "auto", padding: "3px 6px", fontSize: 12, color: CP.textSecondary }}>
                      {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button onClick={() => setEditing(it)} aria-label={`Apri ${it.title}`} style={{ marginLeft: "auto", background: "none", border: "none", color: CP.mutedIcons, cursor: "pointer", display: "flex", padding: 3 }}><Pencil size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {items.some((it) => it.status === "scartato") && (
        <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 24 }}>
          Scartati: {items.filter((it) => it.status === "scartato").map((it) => (
            <button key={it.id} onClick={() => setEditing(it)} style={{ background: "none", border: "none", color: CP.textSecondary, cursor: "pointer", textDecoration: "underline", fontSize: 13, fontFamily: FONTS.body }}>{it.title}</button>
          ))}
        </div>
      )}

      {/* Telegram e landing */}
      <TelegramPanel pid={id} arcs={data.arcs || []} />

      {/* Identità */}
      <SectionTitle aside={<button style={btn(false)} onClick={() => setEditId(true)}><Pencil size={13} aria-hidden="true" /> Modifica</button>}>Identità</SectionTitle>
      <div style={{ ...card, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Chi è</div>
          <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.55 }}>{idn.personaggio || "Da scrivere"}</div>
          {idn.promessa && <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, marginTop: 8 }}>La promessa: {idn.promessa}</div>}
          {idn.voce && <><div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 4px" }}>Voce</div><div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{idn.voce}</div></>}
          {idn.estetica && <><div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 4px" }}>Estetica</div><div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{idn.estetica}</div></>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Come lo raccontiamo</div>
          {(idn.racconto || []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{idn.racconto.map((r, i) => <li key={i}>{r}</li>)}</ul>
          ) : <div style={{ fontSize: 14, color: CP.textMuted }}>Da scrivere</div>}
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 4px" }}>Calendario fisso</div>
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
            {WEEKDAYS.filter((d) => profile.calendar?.[d]).map((d) => <div key={d}>{WEEKDAY_LABEL[d]}: {profile.calendar[d]}</div>)}
            {!WEEKDAYS.some((d) => profile.calendar?.[d]) && <span style={{ color: CP.textMuted }}>Da impostare</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Cosa non fa mai</div>
          {(idn.maiFare || []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{idn.maiFare.map((r, i) => <li key={i}>{r}</li>)}</ul>
          ) : <div style={{ fontSize: 14, color: CP.textMuted }}>Da scrivere</div>}
        </div>
      </div>

      {editing && <ItemModal key={`${editing.id || "nuovo"}-${editing.updatedAt || ""}`} item={editing} onClose={() => { setEditing(null); setErr(null); }} onSave={saveItem} onDelete={deleteItem} saving={saving} err={err} pid={id} refs={tg?.config?.referencePhotoIds || []} onRefresh={mutate} arcs={data.arcs || []} onApprove={approveItem} postizOn={!!data.postiz} rodaggio={profile.phase === "rodaggio" && (phaseDay(profile, today) || 99) <= 7} />}
      {postEditing && tg && <PostModal post={postEditing} photos={tg.photos || []} cfg={tg.config || {}} pid={id} arcs={data.arcs || []} onClose={() => setPostEditing(null)} onDone={async () => { setPostEditing(null); await mutateTg(); }} />}
      {editId && <IdentityModal profile={profile} onClose={() => { setEditId(false); setErr(null); }} onSave={saveProfile} saving={saving} err={err} />}
    </div>
  );
}
