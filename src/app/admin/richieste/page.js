"use client";

/**
 * /admin/richieste — Richieste alla modella (26/11/2026, permesso social.manage).
 *
 * Il pezzo PRIMA dell'Editing. La SMM prepara la lista di riprese (cosa fare, outfit, cosa dire,
 * link di esempio), poi nella scheda aggiunge a ogni ripresa il video di esempio e una nota vocale,
 * copia il messaggio per WhatsApp e lo manda. La modella gira e carica dal telefono; qui si guarda
 * ogni file e si approva o si chiede di rifare con una nota (al massimo due volte per ripresa).
 * Lo stato non si cambia a mano: viene dai file e dai giudizi.
 * Logica in lib/richieste*.js, pagina della modella in app/richiesta/[token].
 */
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Plus, X, Copy, Check, ExternalLink, Trash2, Pencil, ArrowUp, ArrowDown, Mic, Square, Upload, MessageCircle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, DataTable, SectionTitle, EmptyState, card, BTN, BTN_PRIMARY, ATTN } from "@/components/ds";
import { REQUEST_STATE, SHOT_STATE, MAX_REDO, MAX_SHOTS, whatsappText, fmtBytes } from "@/lib/richieste-core";
import { uploadMedia } from "@/lib/richieste-upload-client";

const API = "/api/admin/richieste";
const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status });
  return j;
};
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const input = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 12.5, color: CP.textSecondary, marginBottom: 5 };
const small = { fontSize: 12.5, color: CP.textMuted };

async function send(url, method, body) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { errors: j?.errors });
  return j;
}

// Scadenza di default: il primo venerdì alle 18 che lasci almeno due giorni per girare
function defaultDeadline(now = new Date()) {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  while (d.getTime() - now.getTime() < 2 * 86400e3) d.setDate(d.getDate() + 7);
  return d.getTime();
}
const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function StateTag({ state, kind = "request" }) {
  const label = kind === "request" ? REQUEST_STATE[state]?.label : SHOT_STATE[state]?.app;
  // forma oltre al colore: approvata ha la spunta, da guardare il bordo tratteggiato
  const look = state === "approvata" ? { color: CP.accentGreen, border: `1px solid ${CP.accentGreen}` }
    : state === "da_rifare" ? { color: CP.attn, border: `1px solid ${CP.attn}` }
    : state === "da_vedere" || state === "consegnata" ? { color: CP.textPrimary, border: `1px dashed ${CP.accent}` }
    : { color: CP.textSecondary, border: `1px solid ${CP.border}` };
  const style = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap", background: CP.surfaceAlt, ...look };
  return <span style={style}>{state === "approvata" ? <Check size={12} /> : null}{label || state}</span>;
}

export default function RichiestePage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: true });
  const [editor, setEditor] = useState(null); // { token?, initial }
  const [sel, setSel] = useState(null);

  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get("t"); if (t) setSel(t); } catch { /* niente */ }
  }, []);
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (sel) u.searchParams.set("t", sel); else u.searchParams.delete("t");
      window.history.replaceState(null, "", u.toString());
    } catch { /* niente */ }
  }, [sel]);

  const list = data?.requests || [];
  const toReview = list.reduce((s, r) => s + (r.counts?.da_vedere || 0), 0);
  const late = list.filter((r) => r.late).length;
  const open = list.filter((r) => r.state !== "approvata").length;

  const columns = [
    { key: "creator", label: "Creator", sort: (r) => r.creator?.name || "", render: (r) => <span style={{ fontWeight: 500 }}>{r.creator?.name}</span> },
    { key: "title", label: "Richiesta", render: (r) => r.title },
    { key: "deadline", label: "Scadenza", sort: (r) => r.deadline || 0, render: (r) => <span style={r.late ? ATTN : { color: CP.textSecondary }}>{r.deadlineText?.text}</span> },
    { key: "state", label: "Stato", sort: (r) => REQUEST_STATE[r.state]?.order ?? 0, render: (r) => <StateTag state={r.state} /> },
    { key: "delivered", label: "Caricate", align: "right", sort: (r) => r.delivered, render: (r) => `${r.delivered}/${r.total}` },
    { key: "review", label: "Da guardare", align: "right", sort: (r) => r.counts?.da_vedere || 0, render: (r) => (r.counts?.da_vedere ? <strong>{r.counts.da_vedere}</strong> : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "lastUploadAt", label: "Ultimo file", align: "right", sort: (r) => r.lastUploadAt || 0, render: (r) => <span style={{ color: CP.textSecondary }}>{fmtWhen(r.lastUploadAt)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Editing", href: "/admin/editing" }, { label: "Richieste alla modella" }]}
        title="Richieste alla modella"
        subtitle="Le riprese da chiedere alla creator, con il video di esempio per ognuna e una scadenza. Lei apre un link dal telefono, gira e carica; qui guardi ogni file e lo approvi o chiedi di rifarlo."
        actions={!error && (
          <button onClick={() => { setEditor(editor ? null : { initial: null }); }} style={editor ? BTN : BTN_PRIMARY}>
            {editor ? <X size={15} /> : <Plus size={15} />}{editor ? "Chiudi" : "Nuova richiesta"}
          </button>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata a chi gestisce i social delle creator." : `Non riesco a caricare le richieste: ${error.message}`}</Notice>}
      {data && !data.uploads && <Notice>Il caricamento dei file non è attivo in questo ambiente (manca il collegamento allo spazio privato): le richieste si creano ma nessuno può caricare.</Notice>}

      {!error && editor && (
        <Editor key={editor.token || "new"} token={editor.token} initial={editor.initial} creators={data?.creators || []}
          onCancel={() => setEditor(null)}
          onSaved={async (token) => { setEditor(null); setSel(token); await mutate(); }} />
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!error && !isLoading && list.length === 0 && !editor && (
        <EmptyState title="Nessuna richiesta ancora" action={<button style={BTN_PRIMARY} onClick={() => setEditor({ initial: null })}><Plus size={15} />Nuova richiesta</button>}>
          Prepara la lista delle riprese con una scadenza, aggiungi il video di esempio a ognuna e manda il link alla creator su WhatsApp. Quello che carica compare qui.
        </EmptyState>
      )}

      {!error && list.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Riprese da guardare" value={fmtInt(toReview)} attn={toReview > 0} />
            <Metric label="Richieste aperte" value={fmtInt(open)} />
            <Metric label="In ritardo" value={fmtInt(late)} attn={late > 0} note="scadenza passata, non tutto caricato" />
          </section>
          <DataTable columns={columns} rows={list.map((r) => ({ ...r, id: r.token }))} defaultSort={{ key: "deadline", dir: 1 }}
            onRowClick={(r) => setSel(sel === r.token ? null : r.token)} selected={(r) => r.token === sel} minWidth={760} maxHeight={420} />
          <div style={{ ...small, margin: "8px 0 14px" }}>Clicca una riga per aprire la richiesta: video di esempio, file caricati, approva o da rifare.</div>
        </>
      )}

      {sel && !editor && (
        <Detail key={sel} token={sel} onClose={() => setSel(null)} onChanged={mutate}
          onEdit={(d) => setEditor({ token: d.token, initial: d })} onDeleted={async () => { setSel(null); await mutate(); }} />
      )}
    </div>
  );
}

// ── Crea / modifica ─────────────────────────────────────────────────────────
let tmp = 0;
const blankShot = () => ({ key: `n${++tmp}`, title: "", what: "", outfit: "", line: "", refLink: "" });

function Editor({ token, initial, creators, onCancel, onSaved }) {
  const known = creators.some((c) => c.slug === initial?.creator?.slug);
  const [creatorSlug, setCreatorSlug] = useState(initial ? (known ? initial.creator.slug : "__altra") : "");
  const [otherName, setOtherName] = useState(initial && !known ? initial.creator?.name || "" : "");
  const [title, setTitle] = useState(initial?.title || "");
  const [deadline, setDeadline] = useState(toLocalInput(initial?.deadline || defaultDeadline()));
  const [note, setNote] = useState(initial?.note || "");
  const [shots, setShots] = useState(initial?.shots?.length ? initial.shots.map((s) => ({ key: s.id, id: s.id, title: s.title, what: s.what || "", outfit: s.outfit || "", line: s.line || "", refLink: s.refLink || "", hasMedia: Boolean(s.ref || s.voice), takes: s.takes?.length || 0 })) : [blankShot()]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState([]);

  const setShot = (i, patch) => setShots((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => setShots((xs) => { const a = [...xs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  async function save() {
    setBusy(true); setErrs([]);
    const creator = creatorSlug === "__altra" ? { name: otherName.trim() } : creators.find((c) => c.slug === creatorSlug) ? { slug: creatorSlug, name: creators.find((c) => c.slug === creatorSlug).name } : { name: "" };
    const ms = deadline ? new Date(deadline).getTime() : NaN;
    const data = { creator, title, note, deadline: ms, shots: shots.map(({ id, title: t, what, outfit, line, refLink }) => ({ id, title: t, what, outfit, line, refLink })) };
    try {
      if (token) { await send(`${API}/${token}`, "PATCH", { action: "update", data }); onSaved(token); }
      else { const j = await send(API, "POST", data); onSaved(j.token); }
    } catch (e) { setErrs(e.errors?.length ? e.errors : [e.message]); } finally { setBusy(false); }
  }

  return (
    <section style={{ ...card, padding: "18px 20px", marginBottom: 16, display: "grid", gap: 16 }}>
      <SectionTitle>{token ? "Modifica la richiesta" : "Nuova richiesta"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
        <label style={{ minWidth: 0 }}><span style={lbl}>Creator</span>
          <select style={input} value={creatorSlug} onChange={(e) => setCreatorSlug(e.target.value)}>
            <option value="">Scegli…</option>
            {creators.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            <option value="__altra">Un'altra (scrivi il nome)</option>
          </select>
        </label>
        {creatorSlug === "__altra" && <label style={{ minWidth: 0 }}><span style={lbl}>Nome (lei lo vede nel saluto)</span><input style={input} value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Es. Giulia" /></label>}
        <label style={{ minWidth: 0 }}><span style={lbl}>Titolo (lei lo vede)</span><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Reel della settimana 48" /></label>
        <label style={{ minWidth: 0 }}><span style={lbl}>Scadenza per caricare</span><input type="datetime-local" style={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      </div>
      <label><span style={lbl}>Nota generale per lei (facoltativa: luce, location, cosa evitare)</span>
        <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. luce naturale vicino alla finestra, niente filtri, telefono in verticale" />
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        <SectionTitle aside={<span style={small}>{shots.length} di massimo {MAX_SHOTS}</span>}>Riprese</SectionTitle>
        {shots.map((s, i) => (
          <div key={s.key} style={{ border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 14px", display: "grid", gap: 10, background: CP.surfaceAlt }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13.5 }}>Ripresa {i + 1}</strong>
              {s.takes > 0 && <span style={small}>· {s.takes} file della modella</span>}
              <span style={{ flex: 1 }} />
              <button style={{ ...BTN, padding: "6px 8px", minHeight: 32, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Sposta su"><ArrowUp size={14} /></button>
              <button style={{ ...BTN, padding: "6px 8px", minHeight: 32, opacity: i === shots.length - 1 ? 0.4 : 1 }} disabled={i === shots.length - 1} onClick={() => move(i, 1)} aria-label="Sposta giù"><ArrowDown size={14} /></button>
              <button style={{ ...BTN, padding: "6px 8px", minHeight: 32, opacity: shots.length === 1 || s.takes > 0 ? 0.4 : 1 }} disabled={shots.length === 1 || s.takes > 0} title={s.takes > 0 ? "Ha già file della modella" : "Togli"} onClick={() => setShots((xs) => xs.filter((_, j) => j !== i))} aria-label="Togli la ripresa"><Trash2 size={14} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
              <label style={{ minWidth: 0 }}><span style={lbl}>Nome della ripresa</span><input style={input} value={s.title} onChange={(e) => setShot(i, { title: e.target.value })} placeholder="Es. Aggancio in camera" /></label>
              <label style={{ minWidth: 0 }}><span style={lbl}>Outfit</span><input style={input} value={s.outfit} onChange={(e) => setShot(i, { outfit: e.target.value })} placeholder="Es. felpa grigia, capelli raccolti" /></label>
              <label style={{ minWidth: 0 }}><span style={lbl}>Link al video di esempio (facoltativo)</span><input style={input} value={s.refLink} onChange={(e) => setShot(i, { refLink: e.target.value })} placeholder="https://www.instagram.com/reel/…" /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 10 }}>
              <label style={{ minWidth: 0 }}><span style={lbl}>Cosa fare</span><textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={s.what} onChange={(e) => setShot(i, { what: e.target.value })} placeholder="Es. guarda in camera, 3 secondi, poi giri il telefono verso lo specchio" /></label>
              <label style={{ minWidth: 0 }}><span style={lbl}>Cosa dire (facoltativo)</span><textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={s.line} onChange={(e) => setShot(i, { line: e.target.value })} placeholder="Es. Nessuno mi crede quando dico che…" /></label>
            </div>
          </div>
        ))}
        <div><button style={BTN} disabled={shots.length >= MAX_SHOTS} onClick={() => setShots((xs) => [...xs, blankShot()])}><Plus size={14} />Aggiungi ripresa</button></div>
      </div>

      {errs.length > 0 && <div role="alert" style={{ color: CP.accentRed, fontSize: 13, display: "grid", gap: 2 }}>{errs.map((e) => <span key={e}>{e}</span>)}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? "Salvo…" : token ? "Salva le modifiche" : "Crea la richiesta"}</button>
        <button style={BTN} onClick={onCancel}>Annulla</button>
        <span style={small}>{token ? "Lei vede le modifiche alla prossima apertura del link." : "Il video di esempio e la nota vocale di ogni ripresa si aggiungono subito dopo, nella scheda della richiesta."}</span>
      </div>
    </section>
  );
}

// ── Scheda della richiesta ──────────────────────────────────────────────────
function Detail({ token, onClose, onChanged, onEdit, onDeleted }) {
  const { data, error, mutate } = useSWR(`${API}/${token}`, fetcher, { revalidateOnFocus: true });
  const [copied, setCopied] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState(null);
  if (error) return <Notice danger>{error.status === 404 ? "Richiesta non trovata (forse cancellata)." : error.message}</Notice>;
  if (!data) return <div style={{ color: CP.textMuted, fontSize: 14 }}>Apro la richiesta…</div>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/richiesta/${token}`;
  const reload = async () => { await mutate(); await onChanged(); };
  const copy = async (what) => {
    const text = what === "msg" ? whatsappText(data, link) : link;
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); } catch { setMsg("Non riesco a copiare: seleziona il link a mano."); }
    if (!data.sentAt) { await send(`${API}/${token}`, "PATCH", { action: "sent" }).catch(() => {}); await reload(); }
  };
  async function del() {
    try { await send(`${API}?t=${token}`, "DELETE"); await onDeleted(); } catch (e) { setMsg(e.message); }
  }
  const missingRef = data.state === "approvata" ? 0 : data.shots.filter((s) => !s.ref && !s.refLink && s.state !== "approvata").length;

  return (
    <section style={{ ...card, padding: "18px 20px", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "grid", gap: 4 }}>
          <span style={small}>{data.creator?.name}</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: CP.textPrimary }}>{data.title}</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
            <StateTag state={data.state} />
            <span style={data.late ? ATTN : { color: CP.textSecondary }}>{data.deadlineText?.text}{data.deadlineText?.left ? ` · ${data.deadlineText.left}` : ""}</span>
            <span style={{ color: CP.textSecondary }}>{data.delivered}/{data.total} caricate</span>
          </div>
          <span style={small}>
            {data.sentAt ? `Mandata il ${fmtWhen(data.sentAt)}` : "Non ancora mandata"}
            {data.openedAt ? ` · aperta da lei il ${fmtWhen(data.openedAt)}` : data.sentAt ? " · lei non l'ha ancora aperta" : ""}
            {data.lastSeenAt && data.lastSeenAt !== data.openedAt ? ` · ultima visita ${fmtWhen(data.lastSeenAt)}` : ""}
          </span>
        </div>
        <button style={{ ...BTN, padding: "6px 8px" }} onClick={onClose} aria-label="Chiudi la richiesta"><X size={15} /></button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={data.sentAt ? BTN : BTN_PRIMARY} onClick={() => copy("msg")}>{copied === "msg" ? <Check size={14} /> : <MessageCircle size={14} />}{copied === "msg" ? "Messaggio copiato" : "Copia il messaggio per WhatsApp"}</button>
        <button style={BTN} onClick={() => copy("link")}>{copied === "link" ? <Check size={14} /> : <Copy size={14} />}{copied === "link" ? "Copiato" : "Copia il link"}</button>
        <a style={BTN} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Apri come la vede lei</a>
        <button style={BTN} onClick={() => onEdit(data)}><Pencil size={14} />Modifica</button>
        {!confirmDel
          ? <button style={BTN} onClick={() => setConfirmDel(true)}><Trash2 size={14} />Cancella</button>
          : <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>Cancella richiesta e tutti i file, per sempre?
              <button style={{ ...BTN, color: CP.accentRed, borderColor: CP.accentRed }} onClick={del}>Sì, cancella</button>
              <button style={BTN} onClick={() => setConfirmDel(false)}>No</button></span>}
      </div>
      {!data.sentAt && <div style={small}>«Copia il messaggio» prepara il testo con il link: incollalo nella chat della creator su WhatsApp. Da quel momento la richiesta risulta mandata.</div>}
      {missingRef > 0 && <Notice>{missingRef === 1 ? "Una ripresa non ha" : `${missingRef} riprese non hanno`} ancora un video di esempio: è la cosa che le serve di più per girare giusto.</Notice>}
      {msg && <Notice danger>{msg}</Notice>}
      {data.note && <div style={{ fontSize: 13.5, color: CP.textSecondary, whiteSpace: "pre-wrap" }}><strong style={{ color: CP.textPrimary, fontWeight: 500 }}>Nota per lei: </strong>{data.note}</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {data.shots.map((s) => <ShotPanel key={s.id} token={token} s={s} total={data.total} onChanged={reload} uploads={data.uploads} />)}
      </div>
    </section>
  );
}

function ShotPanel({ token, s, total, onChanged, uploads }) {
  const [redoOpen, setRedoOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [refPct, setRefPct] = useState(null);
  const canRedo = s.redoUsed < MAX_REDO;

  async function review(verdict) {
    setBusy(true); setErr(null);
    try { await send(`${API}/${token}`, "PATCH", { action: "review", shotId: s.id, verdict, note }); setRedoOpen(false); setNote(""); await onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function upRef(file) {
    if (!file) return;
    setErr(null); setRefPct(0);
    try { await uploadMedia({ base: `${API}/${token}`, kind: "ref", shotId: s.id, file, onProgress: setRefPct }); await onChanged(); }
    catch (e) { setErr(e.message); } finally { setRefPct(null); }
  }
  async function removeMedia(kind) {
    setErr(null);
    try { await send(`${API}/${token}`, "PATCH", { action: "removeMedia", shotId: s.id, kind }); await onChanged(); } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ border: s.state === "da_vedere" ? `1px dashed ${CP.accent}` : `1px solid ${CP.border}`, borderRadius: 10, padding: "14px 16px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={small}>Ripresa {s.n} di {total}</span>
        <strong style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</strong>
        <StateTag state={s.state} kind="shot" />
        {s.redoUsed > 0 && <span style={small}>modifiche chieste {s.redoUsed} di {MAX_REDO}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16 }}>
        {/* Cosa le chiediamo */}
        <div style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
          <div style={{ display: "grid", gap: 4, fontSize: 13.5, color: CP.textSecondary }}>
            {s.what && <div style={{ whiteSpace: "pre-wrap" }}><span style={{ color: CP.textPrimary, fontWeight: 500 }}>Cosa fare: </span>{s.what}</div>}
            {s.outfit && <div><span style={{ color: CP.textPrimary, fontWeight: 500 }}>Outfit: </span>{s.outfit}</div>}
            {s.line && <div style={{ whiteSpace: "pre-wrap" }}><span style={{ color: CP.textPrimary, fontWeight: 500 }}>Cosa dire: </span>«{s.line}»</div>}
            {s.refLink && <a href={s.refLink} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary, fontSize: 13 }}>Link di esempio ↗</a>}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={lbl}>Video di esempio</span>
            {s.ref?.url && s.ref.family === "video" && <video src={s.ref.url} controls muted playsInline preload="metadata" style={{ width: "100%", maxWidth: 260, maxHeight: 380, borderRadius: 8, background: "#000" }} />}
            {s.ref?.url && s.ref.family === "photo" && <img src={s.ref.url} alt="Esempio" style={{ width: "100%", maxWidth: 260, borderRadius: 8 }} />}
            {s.ref && !s.ref.url && <span style={small}>Anteprima non disponibile in questo momento.</span>}
            {refPct != null
              ? <span style={small}>Carico il video di esempio… {refPct}%</span>
              : uploads && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ ...BTN, position: "relative" }}><Upload size={14} />{s.ref ? "Cambia il video di esempio" : "Carica il video di esempio"}
                    <input type="file" accept="video/*,image/*" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upRef(f); }} />
                  </label>
                  {s.ref && <button style={BTN} onClick={() => removeMedia("ref")}><Trash2 size={14} />Togli</button>}
                </div>
              )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={lbl}>Nota vocale («dilla così»)</span>
            {s.voice?.url && <audio src={s.voice.url} controls preload="none" style={{ width: "100%", maxWidth: 340 }} />}
            {uploads && <VoiceRecorder token={token} shotId={s.id} has={Boolean(s.voice)} onDone={onChanged} onRemove={() => removeMedia("voce")} onError={setErr} />}
          </div>
        </div>

        {/* Cosa ha caricato lei */}
        <div style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
          <span style={lbl}>{s.takes.length ? `File caricati (${s.takes.length})` : "File caricati"}</span>
          {!s.takes.length && <span style={small}>Ancora niente.</span>}
          {s.takes.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {s.takes.map((t) => (
                <div key={t.pathname} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  {t.url && t.family === "video" && <video src={`${t.url}#t=0.1`} controls playsInline preload="metadata" style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8, background: "#000" }} />}
                  {t.url && t.family === "photo" && <img src={t.url} alt="Ripresa" style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8 }} />}
                  {!t.url && <div style={{ ...small, aspectRatio: "9 / 16", display: "grid", placeItems: "center", border: `1px solid ${CP.border}`, borderRadius: 8 }}>Anteprima non disponibile</div>}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                    {t.new && s.state === "da_vedere" && <span style={{ fontWeight: 600, color: CP.textPrimary, border: `1px dashed ${CP.accent}`, borderRadius: 999, padding: "0 6px" }}>nuovo</span>}
                    <span style={{ color: CP.textMuted }}>{fmtWhen(t.at)} · {fmtBytes(t.size)}</span>
                    {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary }}>Apri ↗</a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {s.state === "da_vedere" && (
            <div style={{ display: "grid", gap: 8 }}>
              {!redoOpen && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => review("ok")}><Check size={14} />Approva</button>
                  <button style={{ ...BTN, opacity: canRedo ? 1 : 0.5 }} disabled={busy || !canRedo} onClick={() => setRedoOpen(true)} title={canRedo ? "" : `Già chiesto ${MAX_REDO} volte`}>Chiedi di rifarla</button>
                </div>
              )}
              {!canRedo && <span style={small}>Hai già chiesto di rifarla {MAX_REDO} volte: si approva così o se ne parla con lei.</span>}
              {redoOpen && (
                <div style={{ display: "grid", gap: 8 }}>
                  <label><span style={lbl}>Cosa rifare (lei vede questa nota accanto alla ripresa). Solo su ciò che era scritto nella richiesta.</span>
                    <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. il viso è tagliato in alto: un passo indietro e più luce dalla finestra" autoFocus />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={{ ...BTN_PRIMARY, opacity: busy || !note.trim() ? 0.6 : 1 }} disabled={busy || !note.trim()} onClick={() => review("redo")}>Manda la nota</button>
                    <button style={BTN} onClick={() => { setRedoOpen(false); setNote(""); }}>Annulla</button>
                    <span style={small}>Giro {s.redoUsed + 1} di {MAX_REDO}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {s.reviews.length > 0 && (
            <div style={{ display: "grid", gap: 2, fontSize: 12.5, color: CP.textSecondary, borderTop: `1px solid ${CP.border}`, paddingTop: 8 }}>
              {s.reviews.map((r) => (
                <span key={r.at}>{r.verdict === "ok" ? "✓ Approvata" : "↺ Chiesto di rifarla"} il {fmtWhen(r.at)}{r.note ? `: ${r.note}` : ""}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

// ── Nota vocale registrata dal browser ─────────────────────────────────────
const VOICE_MAX_S = 120;
const Recorder = () => (typeof window !== "undefined" ? window.MediaRecorder : undefined);
function pickAudioType() {
  const MR = Recorder();
  if (!MR) return null;
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    try { if (MR.isTypeSupported(t)) return t; } catch { /* niente */ }
  }
  return "";
}
function VoiceRecorder({ token, shotId, has, onDone, onRemove, onError }) {
  const [state, setState] = useState("idle"); // idle | rec | up
  const [secs, setSecs] = useState(0);
  const rec = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => { clearInterval(timer.current); try { rec.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* niente */ } }, []);

  async function start() {
    onError(null);
    const type = pickAudioType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) { onError("Questo browser non registra l'audio: prova con Chrome o Safari aggiornati."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { onError("Serve il permesso al microfono per registrare la nota."); return; }
    const MR = Recorder();
    const mr = new MR(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      const raw = (mr.mimeType || type || "audio/webm").split(";")[0];
      const ct = raw.includes("mp4") ? "audio/mp4" : raw.includes("ogg") ? "audio/ogg" : "audio/webm";
      const ext = ct === "audio/mp4" ? "m4a" : ct === "audio/ogg" ? "ogg" : "webm";
      const file = new File(chunks, `nota.${ext}`, { type: ct });
      if (!file.size) { setState("idle"); onError("La registrazione è vuota: riprova."); return; }
      setState("up");
      try { await uploadMedia({ base: `${API}/${token}`, kind: "voce", shotId, file }); await onDone(); }
      catch (e) { onError(e.message); } finally { setState("idle"); }
    };
    rec.current = { mr, stream };
    mr.start(1000);
    setSecs(0); setState("rec");
    timer.current = setInterval(() => setSecs((x) => { if (x + 1 >= VOICE_MAX_S) { try { mr.stop(); } catch { /* niente */ } } return x + 1; }), 1000);
  }
  const stop = () => { try { rec.current?.mr.stop(); } catch { /* niente */ } };

  if (state === "rec") return <div style={{ display: "flex", gap: 8, alignItems: "center" }}><button style={{ ...BTN, color: CP.accentRed, borderColor: CP.accentRed }} onClick={stop}><Square size={13} />Ferma ({secs}s)</button><span style={small}>Registro… massimo {VOICE_MAX_S / 60} minuti</span></div>;
  if (state === "up") return <span style={small}>Salvo la nota vocale…</span>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={BTN} onClick={start}><Mic size={14} />{has ? "Registra di nuovo" : "Registra una nota"}</button>
      {has && <button style={BTN} onClick={onRemove}><Trash2 size={14} />Togli</button>}
    </div>
  );
}
