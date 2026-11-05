"use client";

/**
 * Studio social — sezione "Telegram e landing" del profilo (16/10/2026).
 *
 * Percorso: link in bio / storie in evidenza → landing (pagina nostra) → canale Telegram → link di
 * tracciamento OnlyFans. Qui si collega il canale (quelli mappati in /admin/telegram, dove il bot HOC
 * è amministratore), si prepara la landing, si caricano le foto e si programmano i post del canale.
 * Un post parte da solo all'ora scelta SOLO dopo «Approva e programma» (conformità e qualità «ok»).
 */
import { useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Trash2, Check, Copy, Upload, ExternalLink, Star } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { Notice, SectionTitle, card, NUM, alpha } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { TG_ROLES } from "@/lib/studio-editorial-core";
import { TG_REVIEWERS, TG_STATUSES, TG_MAX_PHOTOS, TG_TEXT_MAX_PHOTO, canApproveTg, msToRomeLocal, romeLocalToMs } from "@/lib/studio-telegram-core";

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
const OUTCOME = { ok: { label: "Ok", color: CP.accentGreen }, attenzione: { label: "Attenzione", color: CP.textSecondary }, blocca: { label: "Blocca", color: CP.accentRed } };
const STATUS_COLOR = { bozza: CP.textSecondary, programmato: CP.accent, inviato: CP.accentGreen, errore: CP.accentRed, annullato: CP.textMuted };
const fmtWhen = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "senza ora");
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString("it-IT") : "—");

function L({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: CP.textMuted, marginTop: 3 }}>{hint}</span>}
    </label>
  );
}

/** I tre numeri del percorso, per i riquadri in cima alla pagina del profilo. */
export function FunnelTiles({ data }) {
  const f = data?.funnel || {};
  const cfg = data?.config || {};
  const tile = (label, value, note) => (
    <div style={{ ...card, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: CP.textPrimary, marginTop: 2, ...NUM }}>{value}</div>
      <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 4, lineHeight: 1.4 }}>{note}</div>
    </div>
  );
  return (
    <>
      {tile("Landing, 7 giorni",
        f.landing ? `${fmtInt(f.landing.visits)} visite` : "—",
        f.landing ? `${fmtInt(f.landing.clicks)} verso Telegram${f.landing.rate != null ? ` (${Math.round(f.landing.rate * 100)}%)` : ""}` : cfg.landing ? "Landing non ancora attiva" : "Prepara la landing qui sotto")}
      {tile("Telegram, 7 giorni",
        f.telegram ? `${fmtInt(f.telegram.joins7)} entrati` : "—",
        f.telegram ? (f.telegram.connected ? `${fmtInt(f.telegram.members)} iscritti a ${f.telegram.title}` : "Il bot non è ancora nel canale") : "Collega il canale qui sotto")}
      {tile("OnlyFans dal canale, 30 giorni",
        f.onlyfans?.subs_30 != null ? `${fmtInt(f.onlyfans.subs_30)} abbonati` : "—",
        f.onlyfans?.subs_30 != null ? `${fmtInt(f.onlyfans.clicks_30)} clic sul link` : f.onlyfans?.missing ? "Link non ancora nel warehouse (arriva in 1-2 giorni; il nome deve contenere «Telegram» o «TG»)" : f.onlyfans?.unavailable ? "Dati OnlyFans non raggiungibili ora" : "Indica il link di tracciamento OF del canale")}
    </>
  );
}

export function PostModal({ post, photos, cfg, pid, onClose, onDone, arcs = [] }) {
  const [f, setF] = useState(() => ({
    text: "", photoIds: [], poll: null, pin: false, role: null, slot: null, arcId: null, buttonLabel: cfg?.ofLinkUrl ? "Vieni a trovarmi" : "", buttonUrl: cfg?.ofLinkUrl || "",
    sendAtLocal: msToRomeLocal(Date.now() + 3600e3).slice(0, 14) + "00", ai: false, reviews: {},
    ...post, ...(post?.sendAt ? { sendAtLocal: msToRomeLocal(post.sendAt) } : {}),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const url = `/api/admin/studio-social/${encodeURIComponent(pid)}/telegram`;
  const call = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  };
  const save = async (approve) => {
    setBusy(true); setErr(null);
    try {
      const { sendAt: _drop, ...rest } = f; // eslint-disable-line no-unused-vars
      if (rest.poll) rest.poll = { question: rest.poll.question, options: (rest.poll.options || []).map((o) => o.trim()).filter(Boolean) };
      if (rest.poll && !rest.poll.question && !rest.poll.options.length) rest.poll = null;
      const res = await call({ action: "post", post: rest });
      if (approve) await call({ action: "approve", postId: res.post.id });
      await onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const act = async (body) => {
    setBusy(true); setErr(null);
    try { await call(body); await onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const setReview = (key, patch) => setF((x) => {
    const reviews = { ...(x.reviews || {}) };
    const next = { ...(reviews[key] || {}), ...patch };
    if (!next.outcome) delete reviews[key]; else reviews[key] = next;
    return { ...x, reviews };
  });
  const togglePhoto = (id) => setF((x) => {
    const has = x.photoIds.includes(id);
    if (!has && x.photoIds.length >= TG_MAX_PHOTOS) return x;
    return { ...x, photoIds: has ? x.photoIds.filter((p) => p !== id) : [...x.photoIds, id] };
  });
  const sent = post?.status === "inviato";
  const approvable = canApproveTg({ ...f, sendAt: romeLocalToMs(f.sendAtLocal) });
  const textMax = f.photoIds.length ? TG_TEXT_MAX_PHOTO : 4096;
  return (
    <Modal open onClose={onClose} title={post?.id ? (sent ? "Post uscito" : "Post Telegram") : "Nuovo post Telegram"} maxWidth={720}>
      {sent && <Notice>Uscito {fmtWhen(post.sentAt)}. Un post uscito non si modifica più.</Notice>}
      {post?.status === "errore" && post.error && <Notice danger>{post.error}</Notice>}
      <L label="Testo" hint={`${f.text.length} di ${textMax} caratteri${f.photoIds.length ? " (con le foto il limite è più basso)" : ""}. OnlyFans si può nominare qui, mai sul profilo social.`}>
        <textarea style={{ ...field, minHeight: 120, lineHeight: 1.5 }} value={f.text} disabled={sent} onChange={(e) => setF({ ...f, text: e.target.value })} />
      </L>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Foto ({f.photoIds.length} di {TG_MAX_PHOTOS}; più di una = album)</div>
      {photos.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 12 }}>Carica le foto nella sezione «Foto» qui sotto.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6, marginBottom: 14 }}>
        {photos.map((p) => {
          const i = f.photoIds.indexOf(p.id);
          return (
            <button key={p.id} type="button" disabled={sent} onClick={() => togglePhoto(p.id)} aria-pressed={i >= 0} aria-label={i >= 0 ? `Togli foto ${i + 1}` : "Aggiungi foto"}
              style={{ position: "relative", padding: 0, border: `2px solid ${i >= 0 ? CP.accent : "transparent"}`, borderRadius: 8, overflow: "hidden", cursor: sent ? "default" : "pointer", aspectRatio: "3 / 4", background: CP.bgSunken }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/studio-social/${encodeURIComponent(pid)}/photo?p=${p.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: i >= 0 || f.photoIds.length === 0 ? 1 : 0.55 }} />
              {i >= 0 && <span style={{ position: "absolute", top: 4, left: 4, background: CP.accent, color: CP.accentInk, borderRadius: 10, fontSize: 11, padding: "1px 6px", ...NUM }}>{i + 1}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <L label="Pulsante: testo"><input style={field} value={f.buttonLabel} disabled={sent} onChange={(e) => setF({ ...f, buttonLabel: e.target.value })} placeholder="Vieni a trovarmi" /></L>
        <L label="Pulsante: link" hint="Il link di tracciamento OnlyFans del canale"><input style={field} value={f.buttonUrl} disabled={sent} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} placeholder="https://onlyfans.com/…" /></L>
        <L label="Esce" hint="Ora di Roma"><input type="datetime-local" style={field} value={f.sendAtLocal || ""} disabled={sent} onChange={(e) => setF({ ...f, sendAtLocal: e.target.value })} /></L>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textPrimary, marginBottom: 12 }}>
        <input type="checkbox" checked={!!f.ai} disabled={sent} onChange={(e) => setF({ ...f, ai: e.target.checked })} /> Foto con parti generate con l'AI (scrivilo nel testo)
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <L label="Ruolo nel racconto">
          <select style={field} value={f.role || ""} disabled={sent} onChange={(e) => setF({ ...f, role: e.target.value || null })}>
            <option value="">—</option>
            {TG_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </L>
        <L label="Esce solo se" hint="Es. «Se vince Sì»: le versioni alternative restano in bozza">
          <input style={field} value={f.condition || ""} disabled={sent} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder="Sempre" />
        </L>
        <L label="Storia della settimana">
          <select style={field} value={f.arcId || ""} disabled={sent} onChange={(e) => setF({ ...f, arcId: e.target.value || null })}>
            <option value="">Nessuna</option>
            {arcs.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </L>
      </div>
      <details open={!!f.poll} style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 13, color: CP.textSecondary, cursor: "pointer", marginBottom: 8 }}>Sondaggio (nel canale è l'unico modo per far rispondere chi legge)</summary>
        <L label="Domanda"><input style={field} disabled={sent} value={f.poll?.question || ""} onChange={(e) => setF({ ...f, poll: { options: f.poll?.options || [], question: e.target.value } })} placeholder="Gli rispondo stavolta?" /></L>
        <L label="Risposte" hint="Una per riga, da 2 a 10"><textarea style={{ ...field, minHeight: 70 }} disabled={sent} value={(f.poll?.options || []).join("\n")} onChange={(e) => setF({ ...f, poll: { question: f.poll?.question || "", options: e.target.value.split("\n") } })} /></L>
        {f.poll && <button type="button" style={{ ...btn(false), padding: "3px 8px" }} disabled={sent} onClick={() => setF({ ...f, poll: null })}>Togli il sondaggio</button>}
      </details>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textPrimary, marginBottom: 12 }}>
        <input type="checkbox" checked={!!f.pin} disabled={sent} onChange={(e) => setF({ ...f, pin: e.target.checked })} /> Fissalo in alto nel canale (il messaggio di benvenuto)
      </label>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "6px 0 8px" }}>Revisori</div>
      {TG_REVIEWERS.map((r) => {
        const rv = f.reviews?.[r.key] || {};
        return (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 120px) minmax(0, 130px) minmax(0, 1fr)", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, paddingTop: 8 }} title={r.hint}>{r.label}</div>
            <select style={field} value={rv.outcome || ""} disabled={sent} onChange={(e) => setReview(r.key, { outcome: e.target.value || null, at: Date.now() })} aria-label={`Esito ${r.label}`}>
              <option value="">Non ancora</option>
              {Object.entries(OUTCOME).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
            <input style={field} value={rv.note || ""} disabled={sent} onChange={(e) => setReview(r.key, { note: e.target.value })} placeholder={r.hint} aria-label={`Nota ${r.label}`} />
          </div>
        );
      })}
      {!sent && !approvable.ok && <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 10 }}>Per programmarlo: {approvable.reason.toLowerCase()}.</div>}
      {post?.status === "programmato" && <div style={{ fontSize: 12, color: CP.textSecondary, marginBottom: 10 }}>Programmato: parte da solo {fmtWhen(post.sendAt)}. Se lo modifichi torna in bozza e va riapprovato.</div>}
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!sent && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btn(false)} disabled={busy} onClick={() => save(false)}>{busy ? "Salvataggio…" : "Salva in bozza"}</button>
          {approvable.ok && <button style={btn(true)} disabled={busy} onClick={() => save(true)}><Check size={14} aria-hidden="true" /> Approva e programma</button>}
          {post?.id && post.status !== "annullato" && <button style={btn(false)} disabled={busy} onClick={() => act({ action: "status", postId: post.id, status: "annullato" })}>Annulla</button>}
          {post?.id && <button style={{ ...btn(false), marginLeft: "auto", color: CP.accentRed }} disabled={busy} onClick={async () => { if (await confirmDialog({ title: "Eliminare il post?", ok: "Elimina", danger: true })) act({ action: "deletePost", postId: post.id }); }}><Trash2 size={14} aria-hidden="true" /> Elimina</button>}
        </div>
      )}
    </Modal>
  );
}

function SetupModal({ data, pid, onClose, onDone }) {
  const cfg = data.config || {};
  const [f, setF] = useState(() => ({
    channelId: cfg.channelId || "", ofLinkUrl: cfg.ofLinkUrl || "",
    landing: { slug: "", title: "", subtitle: "", buttonLabel: "Entra nel canale", photoId: null, target: "", active: false, ...(cfg.landing || {}) },
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ch = data.channels.find((c) => c.id === f.channelId);
  const setL = (patch) => setF((x) => ({ ...x, landing: { ...x.landing, ...patch } }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { action: "config", channelId: f.channelId || null, ofLinkUrl: f.ofLinkUrl };
      if (f.landing.slug) body.landing = f.landing;
      const r = await fetch(`/api/admin/studio-social/${encodeURIComponent(pid)}/telegram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Telegram e landing" maxWidth={680}>
      <L label="Canale Telegram" hint="I canali si aggiungono in Canali Telegram: lì il bot HOC diventa amministratore (deve poter pubblicare).">
        <select style={field} value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })}>
          <option value="">Nessuno</option>
          {data.channels.map((c) => <option key={c.id} value={c.id}>{c.title}{c.creators?.length ? ` · ${c.creators.join(", ")}` : ""}{c.connected ? "" : " (bot non collegato)"}</option>)}
        </select>
      </L>
      <L label="Link di tracciamento OnlyFans del canale" hint="Crealo su OnlyFans con «Telegram» o «TG» nel nome: così i suoi abbonati si contano da soli.">
        <input style={field} value={f.ofLinkUrl} onChange={(e) => setF({ ...f, ofLinkUrl: e.target.value })} placeholder="https://onlyfans.com/…/c12" />
      </L>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "8px 0 8px" }}>Landing (il link in bio e nelle storie in evidenza)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
        <L label="Indirizzo" hint={f.landing.slug ? `houseofcreators.app/l/${f.landing.slug}` : "es. marty"}><input style={field} value={f.landing.slug} onChange={(e) => setL({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></L>
        <L label="Titolo"><input style={field} value={f.landing.title} onChange={(e) => setL({ title: e.target.value })} placeholder="Marty" /></L>
        <L label="Pulsante"><input style={field} value={f.landing.buttonLabel} onChange={(e) => setL({ buttonLabel: e.target.value })} /></L>
      </div>
      <L label="Riga sotto il titolo"><input style={field} value={f.landing.subtitle} onChange={(e) => setL({ subtitle: e.target.value })} placeholder="Le cose che su Instagram non posso raccontare" /></L>
      <L label="Destinazione" hint="Un link d'invito del canale creato dal bot (fonte Instagram): così si contano gli entrati dalla landing. Si crea in Canali Telegram.">
        <select style={field} value={f.landing.target} onChange={(e) => setL({ target: e.target.value })}>
          <option value="">Scegli il link d'invito</option>
          {(ch?.links || []).map((l) => <option key={l.url} value={l.url}>{l.name}</option>)}
          {f.landing.target && !(ch?.links || []).some((l) => l.url === f.landing.target) && <option value={f.landing.target}>{f.landing.target}</option>}
        </select>
      </L>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Foto della landing (l'unica che diventa pubblica)</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {data.photos.map((p) => (
          <button key={p.id} type="button" onClick={() => setL({ photoId: f.landing.photoId === p.id ? null : p.id })} aria-pressed={f.landing.photoId === p.id}
            style={{ width: 56, height: 56, padding: 0, borderRadius: "50%", overflow: "hidden", border: `2px solid ${f.landing.photoId === p.id ? CP.accent : "transparent"}`, cursor: "pointer", background: CP.bgSunken }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/studio-social/${encodeURIComponent(pid)}/photo?p=${p.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
        {!data.photos.length && <span style={{ fontSize: 13, color: CP.textMuted }}>Nessuna foto caricata.</span>}
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textPrimary, marginBottom: 14 }}>
        <input type="checkbox" checked={f.landing.active} onChange={(e) => setL({ active: e.target.checked })} /> Landing attiva (visibile a chiunque abbia il link)
      </label>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button style={btn(true)} disabled={busy} onClick={save}>{busy ? "Salvataggio…" : "Salva"}</button>
    </Modal>
  );
}

export default function TelegramPanel({ pid, arcs = [] }) {
  const url = `/api/admin/studio-social/${encodeURIComponent(pid)}/telegram`;
  const { data, error, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [editing, setEditing] = useState(null);
  const [setup, setSetup] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  if (error) return <Notice danger>{error.status === 403 ? "Non hai il permesso per la parte Telegram." : `Telegram: ${error.message}`}</Notice>;
  if (!data) return <div style={{ color: CP.textMuted, fontSize: 14, padding: "12px 0" }}>Caricamento Telegram…</div>;

  const cfg = data.config || {};
  const ch = data.channels.find((c) => c.id === cfg.channelId);
  const landingUrl = cfg.landing?.slug ? `https://houseofcreators.app/l/${cfg.landing.slug}` : null;
  const posts = data.posts || [];
  const upcoming = posts.filter((p) => p.status !== "inviato" && p.status !== "annullato");
  const done = posts.filter((p) => p.status === "inviato" || p.status === "annullato").sort((a, b) => (b.sentAt || b.updatedAt || 0) - (a.sentAt || a.updatedAt || 0)).slice(0, 10);

  const upload = async (files) => {
    setMsg({ text: "Carico…" });
    const { shrinkImage } = await import("@/lib/hr-upload-client");
    let n = 0;
    for (const file of [...files]) {
      const small = await shrinkImage(file);
      const fd = new FormData();
      fd.append("file", small, small.name || "foto.jpg");
      const r = await fetch(url, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setMsg({ danger: true, text: j?.error || "Caricamento non riuscito" }); await mutate(); return; }
      n++;
    }
    setMsg({ text: n === 1 ? "Foto caricata" : `${n} foto caricate` });
    await mutate();
  };
  const removePhoto = async (id) => {
    if (!(await confirmDialog({ title: "Togliere la foto?", ok: "Togli", danger: true }))) return;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deletePhoto", photoId: id }) });
    const j = await r.json().catch(() => null);
    setMsg(r.ok ? { text: "Foto tolta" } : { danger: true, text: j?.error || "Non riuscito" });
    await mutate();
  };
  const refs = cfg.referencePhotoIds || [];
  const toggleRef = async (id) => {
    const next = refs.includes(id) ? refs.filter((x) => x !== id) : [...refs, id];
    if (next.length > 4) { setMsg({ danger: true, text: "Al massimo 4 foto di riferimento" }); return; }
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "config", referencePhotoIds: next }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) setMsg({ danger: true, text: j?.error || "Non riuscito" });
    await mutate();
  };
  const duplicate = (p) => setEditing({ text: p.text, photoIds: p.photoIds, buttonLabel: p.buttonLabel, buttonUrl: p.buttonUrl, ai: p.ai, reviews: {}, sendAt: Number.isFinite(p.sendAt) ? p.sendAt + 86400e3 : null });

  const Row = ({ p }) => (
    <button onClick={() => setEditing(p)} style={{ display: "grid", gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr) auto", gap: 10, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${CP.borderSoft}`, padding: "9px 0", cursor: "pointer", fontFamily: FONTS.body }}>
      <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>{fmtWhen(p.sentAt || p.sendAt)}</span>
      <span style={{ fontSize: 13, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.condition ? `${p.condition} · ` : ""}{p.photoIds?.length ? `${p.photoIds.length} foto · ` : ""}{p.poll ? `Sondaggio: ${p.poll.question}` : p.text || "(solo foto)"}
      </span>
      <span style={{ fontSize: 12, color: STATUS_COLOR[p.status] || CP.textSecondary, border: `1px solid ${alpha(STATUS_COLOR[p.status] || CP.textSecondary, "55")}`, borderRadius: 6, padding: "1px 6px" }}>
        {TG_STATUSES.find((s) => s.key === p.status)?.label || p.status}
      </span>
    </button>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle aside={<button style={btn(false)} onClick={() => setSetup(true)}><Pencil size={13} aria-hidden="true" /> Imposta</button>}>Telegram e landing</SectionTitle>
      <div style={{ fontSize: 13, color: CP.textMuted, margin: "-4px 0 12px" }}>Link in bio e storie in evidenza → landing → canale Telegram → link di tracciamento OnlyFans. Un post parte da solo all’ora scelta, ma solo dopo «Approva e programma».</div>
      {!data.botConfigured && <Notice danger>Il bot Telegram non è configurato in questo ambiente: i post non partirebbero.</Notice>}
      {msg && <Notice danger={msg.danger}>{msg.text}</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Canale</div>
          {ch ? (
            <div style={{ fontSize: 14, color: CP.textPrimary }}>{ch.title} <span style={{ color: ch.connected && ch.botAdmin ? CP.accentGreen : CP.accentRed, fontSize: 12 }}>· {ch.connected && ch.botAdmin ? "bot amministratore" : "bot non collegato"}</span></div>
          ) : <div style={{ fontSize: 14, color: CP.textMuted }}>Nessun canale collegato</div>}
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 4px" }}>Link OnlyFans del canale</div>
          <div style={{ fontSize: 13, color: cfg.ofLinkUrl ? CP.textPrimary : CP.textMuted, wordBreak: "break-all" }}>{cfg.ofLinkUrl || "Da indicare"}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 4px" }}>Landing</div>
          {landingUrl ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: CP.textPrimary, wordBreak: "break-all" }}>{landingUrl}</span>
              <span style={{ fontSize: 12, color: cfg.landing.active ? CP.accentGreen : CP.textMuted }}>{cfg.landing.active ? "attiva" : "spenta"}</span>
              <button style={{ ...btn(false), padding: "3px 8px" }} onClick={() => { navigator.clipboard?.writeText(landingUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={12} aria-hidden="true" /> {copied ? "Copiato" : "Copia"}</button>
              {cfg.landing.active && <a href={`/l/${cfg.landing.slug}`} target="_blank" rel="noreferrer" style={{ ...btn(false), padding: "3px 8px", textDecoration: "none" }}><ExternalLink size={12} aria-hidden="true" /> Apri</a>}
            </div>
          ) : <div style={{ fontSize: 13, color: CP.textMuted }}>Da preparare</div>}
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: CP.textMuted }}>Foto ({data.photos.length}) · stella = riferimento del volto ({refs.length} di 4)</div>
            <label style={{ ...btn(false), padding: "4px 10px", opacity: data.blobReady ? 1 : 0.5 }}>
              <Upload size={13} aria-hidden="true" /> Carica
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={!data.blobReady} onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {!data.blobReady && <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Lo spazio per le foto è attivo solo online, non in locale.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6 }}>
            {data.photos.map((p) => (
              <div key={p.id} style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: 8, overflow: "hidden", background: CP.bgSunken }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/studio-social/${encodeURIComponent(pid)}/photo?p=${p.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button onClick={() => toggleRef(p.id)} aria-pressed={refs.includes(p.id)} aria-label={refs.includes(p.id) ? "Togli dai riferimenti del volto" : "Usa come riferimento del volto"} title="Riferimento del volto per il controllo qualità"
                  style={{ position: "absolute", top: 3, left: 3, background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 6, padding: 2, cursor: "pointer", display: "flex", color: refs.includes(p.id) ? CP.accent : CP.textMuted }}><Star size={12} fill={refs.includes(p.id) ? "currentColor" : "none"} /></button>
                <button onClick={() => removePhoto(p.id)} aria-label="Togli la foto" style={{ position: "absolute", top: 3, right: 3, background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 6, padding: 2, cursor: "pointer", display: "flex", color: CP.textSecondary }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          {!data.photos.length && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna foto: caricale da qui.</div>}
        </div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <SectionTitle aside={<button style={btn(true)} onClick={() => setEditing({})}><Plus size={14} aria-hidden="true" /> Nuovo post</button>}>Post del canale</SectionTitle>
        {upcoming.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted, padding: "6px 0" }}>Nessun post in programma.</div>}
        {upcoming.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Row p={p} /></div>
            <button onClick={() => duplicate(p)} title="Duplica al giorno dopo" aria-label="Duplica al giorno dopo" style={{ background: "none", border: "none", color: CP.mutedIcons, cursor: "pointer", display: "flex", padding: 4 }}><Copy size={13} /></button>
          </div>
        ))}
        {done.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: CP.textMuted, margin: "14px 0 2px" }}>Usciti e annullati (ultimi 10)</div>
            {done.map((p) => <Row key={p.id} p={p} />)}
          </>
        )}
      </div>

      {editing && <PostModal post={editing} photos={data.photos} cfg={cfg} pid={pid} arcs={arcs} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await mutate(); }} />}
      {setup && <SetupModal data={data} pid={pid} onClose={() => setSetup(false)} onDone={async () => { setSetup(false); await mutate(); }} />}
    </div>
  );
}
