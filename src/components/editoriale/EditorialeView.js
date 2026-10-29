"use client";

// Editoriale Instagram (26/10/2026) — dal drive della creator al calendario del profilo.
// Il disegno di Nicholas: si smista il materiale del drive (foto → caroselli, video → reel da
// montare), i contenuti finiti diventano «pronti», i pronti si mettono in calendario con giorno e
// ora, e il Warm-up mostra a chi pubblica cosa esce oggi. Una foto usata non si può più scegliere
// (per creator): niente doppioni. Logica in lib/editoriale-core.js, archivio in editoriale-store.js.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Copy, ExternalLink, Film, FolderOpen,
  Image as ImageIcon, Images, Layers, Lock, Maximize2, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import VetroScope, { useVetro, VetroNum } from "@/components/VetroScope";
import { KpiCard } from "@/components/VetroCharts";
import { confirmDialog } from "@/components/AppDialogs";
import PublishDownload from "@/components/PublishDownload";
import Lightbox from "@/components/MediaLightbox";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, FilterChip } from "@/components/ds";
import { btn, btnPrimary, btnDanger, btnSm, input, cardBox, hint, muted, SectionHead, Chip, Seg, ModalBox, Field } from "@/components/warmup/ui";
import {
  TYPES, STAGES, stageOf, readyProblems, needsFromTaskIds, coverage, dayItems, monthGrid, shiftMonth, usageMap,
} from "@/lib/editoriale-core";
import { planForDate, visibleItems, dayNumberFor, todayKey, WINDOWS, estToIt } from "@/lib/warmup-plan";

const API = "/api/admin/editoriale";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const CREATOR_KEY = "hoc:editoriale:creator";
const PAGE = 120;
const fmtDay = (k, o = { weekday: "short", day: "numeric", month: "short" }) => new Date(k + "T12:00:00").toLocaleDateString("it-IT", o);
// le finestre USA in ora italiana; quella delle 19 USA cade dopo mezzanotte da noi
const windowTimes = () => WINDOWS.map((w) => { const t = estToIt(w.h); return { n: w.n, it: t.slice(0, 5), night: /domani/.test(t), est: w.est }; });

// ── pezzi piccoli ─────────────────────────────────────────────────────────────

function Thumb({ creator, id, kind, size = "100%", ratio, dim, onClick, children, title }) {
  const [err, setErr] = useState(false);
  return (
    <div title={title} onClick={onClick} style={{ position: "relative", width: size, aspectRatio: ratio || (kind === "video" ? "9 / 14" : "4 / 5"), borderRadius: 8, overflow: "hidden", background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, cursor: onClick ? "pointer" : "default", opacity: dim ? 0.35 : 1, flex: "0 0 auto" }}>
      {!err && id
        ? <img src={`${API}?creator=${encodeURIComponent(creator)}&thumb=${encodeURIComponent(id)}&v=2`} alt="" loading="lazy" draggable={false} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : kind === "video" && id
          // Drive non ha ancora la miniatura (video appena caricato): si mostra il primo fotogramma
          ? <video src={`${API}?creator=${encodeURIComponent(creator)}&media=${encodeURIComponent(id)}#t=0.5`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
          : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CP.textMuted }}>{kind === "video" ? <Film size={20} /> : <ImageIcon size={20} />}</div>}
      {kind === "video" && !err && <span style={{ position: "absolute", left: 5, bottom: 5, background: alpha(CP.bgSunken, "cc"), color: CP.textPrimary, borderRadius: 6, padding: "1px 5px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3 }}><Film size={11} /></span>}
      {children}
    </div>
  );
}

function StageCols({ type, items, creator, onOpen, onPlace }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, alignItems: "start" }}>
      {STAGES.map((st) => {
        const list = items.filter((it) => it.type === type && stageOf(it) === st.key)
          .sort((a, b) => st.key === "calendario" ? `${a.slot.date}${a.slot.time || ""}`.localeCompare(`${b.slot.date}${b.slot.time || ""}`) : (b.updatedAt || 0) - (a.updatedAt || 0));
        return (
          <div key={st.key} className="vt-glass" style={{ background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 14, padding: 10, minHeight: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: CP.textSecondary, margin: "2px 4px 10px" }}><span>{st.label[type]}</span><span style={muted}>{list.length}</span></div>
            {!list.length && <div style={{ ...hint, padding: "6px 4px" }}>{st.key === "lavorazione" ? "Si crea dalla scheda Drive scegliendo i file." : "Niente qui."}</div>}
            {(st.key === "pubblicato" ? list.slice(0, 12) : list).map((it) => (
              <ItemCard key={it.id} it={it} creator={creator} onOpen={() => onOpen(it)} onPlace={st.key === "pronto" ? () => onPlace(it) : null} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ItemCard({ it, creator, onOpen, onPlace, compact }) {
  const covers = it.type === "carosello" ? it.files.slice(0, 4) : [it.final || it.files[0]].filter(Boolean);
  const probs = readyProblems(it);
  return (
    <div onClick={onOpen} style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 8, marginBottom: 8, cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {covers.map((f) => <Thumb key={f} creator={creator} id={f} kind={it.type === "carosello" ? "photo" : "video"} size={compact ? 34 : 46} ratio="1 / 1" />)}
        {it.type === "carosello" && it.files.length > 4 && <span style={{ ...hint, alignSelf: "center" }}>+{it.files.length - 4}</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: "anywhere" }}>{it.title}</div>
      <div style={{ ...hint, marginTop: 2 }}>
        {it.type === "carosello" ? `${it.files.length} foto` : it.final ? "montato" : it.noEdit ? "senza montaggio" : `${it.files.length} video grezzi`}
        {it.slot && ` · ${fmtDay(it.slot.date)}${it.slot.time ? " " + it.slot.time : ""}`}
        {it.status === "lavorazione" && probs.length > 0 && <span style={{ color: CP.attn }}> · {probs[0].toLowerCase()}</span>}
      </div>
      {onPlace && <button type="button" style={{ ...btnSm, marginTop: 8, width: "100%" }} onClick={(e) => { e.stopPropagation(); onPlace(); }}><CalendarDays size={13} />Metti in calendario</button>}
    </div>
  );
}

function PlaceModal({ place, items, itemById, profiles, pid, creator, busy, onClose, onConfirm }) {
  const preset = place.itemId ? itemById.get(place.itemId) : null;
  const choices = items.filter((it) => stageOf(it) === "pronto" && (!place.type || it.type === place.type));
  const [itemId, setItemId] = useState(preset?.id || choices[0]?.id || "");
  const [date, setDate] = useState(place.date || preset?.slot?.date || todayKey());
  const [time, setTime] = useState(preset?.slot?.time || windowTimes()[1].it);
  const [prof, setProf] = useState(preset?.slot?.profileId || pid);
  const it = itemById.get(itemId);
  const close = onClose;
  return (
    <ModalBox title={place.type ? `Un ${place.type} per ${fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}` : preset ? `Metti in calendario «${preset.title}»` : `Cosa esce ${fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}?`}
      onClose={close}
      foot={<>
        <button type="button" style={btn} onClick={close}>Annulla</button>
        <button type="button" style={btnPrimary} disabled={busy || !it || !prof} onClick={() => onConfirm(itemId, { profileId: prof, date, time })}><CalendarDays size={15} />Metti in calendario</button>
      </>}>
      {!preset && (choices.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>
          {choices.map((c) => (
            <div key={c.id} onClick={() => setItemId(c.id)} style={{ borderRadius: 10, outline: c.id === itemId ? `2px solid ${CP.accent}` : "none" }}>
              <ItemCard it={c} creator={creator} compact onOpen={() => setItemId(c.id)} />
            </div>
          ))}
        </div>
      ) : <Notice>Non c'è niente di pronto{place.type ? ` (${place.type})` : ""}. Prepara un contenuto dalla scheda Drive e segnalo pronto.</Notice>)}
      {preset && <div style={{ marginBottom: 12 }}><ItemCard it={preset} creator={creator} compact onOpen={() => {}} /></div>}
      {profiles.length > 1 && (
        <Field label="Profilo">
          <select style={input} value={prof || ""} onChange={(e) => setProf(e.target.value)}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.username}</option>)}</select>
        </Field>
      )}
      <Field label="Giorno"><input type="date" style={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Ora (italiana)" hint="Le tre finestre USA del Warm-up, già convertite in ora italiana. Quella di notte è dopo la mezzanotte del giorno che hai scelto: per la sera USA scegli il giorno dopo. Puoi scrivere un'altra ora.">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {windowTimes().map((w) => <FilterChip key={w.n} label={`${w.it}${w.night ? " di notte" : ""} · ${w.est} USA`} active={time === w.it} onClick={() => setTime(w.it)} />)}
          <input type="time" style={{ ...input, width: 120 }} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </Field>
    </ModalBox>
  );
}

// Ordine delle foto trascinandole (Nicholas, 28/10: «meglio trascinarle» al posto delle frecce).
// Puntatore unico per mouse e dito: si muove la foto, le altre si spostano mentre passa; un tocco
// senza spostamento è un clic (ingrandisce). La griglia va a capo, così sul telefono non deve
// scorrere di lato mentre si trascina.
function SortableFiles({ files, disabled, render, onReorder, onTap }) {
  const [drag, setDrag] = useState(null); // { id, x0, y0, moved }
  const down = (e, id) => {
    if (disabled || e.button > 0 || e.target.closest("[data-nodrag]")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, x0: e.clientX, y0: e.clientY, moved: false });
  };
  const move = (e) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
    if (moved !== drag.moved) setDrag({ ...drag, moved });
    if (!moved) return;
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset?.sortid && n.dataset.sortid !== drag.id);
    if (!el) return;
    const from = files.indexOf(drag.id), to = files.indexOf(el.dataset.sortid);
    if (from < 0 || to < 0) return;
    const next = [...files];
    next.splice(from, 1);
    next.splice(to, 0, drag.id);
    onReorder(next);
  };
  const up = () => {
    if (drag && !drag.moved) onTap(drag.id);
    setDrag(null);
  };
  return files.map((f, i) => {
    const on = drag?.id === f && drag.moved;
    return (
      <div key={f} data-sortid={f} onPointerDown={(e) => down(e, f)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
        style={{ width: 96, flex: "0 0 auto", touchAction: disabled ? "auto" : "none", cursor: disabled ? "pointer" : on ? "grabbing" : "grab",
          transform: on ? "scale(1.06)" : "none", opacity: on ? 0.85 : 1, transition: "transform .12s", zIndex: on ? 2 : 0, position: "relative", userSelect: "none" }}>
        {render(f, i, on)}
      </div>
    );
  });
}

// Cerchio di scelta in alto a sinistra della foto (decisione di Nicholas, 28/10): il tocco al
// centro ingrandisce, il cerchio sceglie. Area di tocco 36 px anche se il cerchio ne mostra 24.
function SelectDot({ n, locked, onClick }) {
  return (
    <button type="button" aria-label={locked ? "Già usata" : n ? `Scelta numero ${n}: togli` : "Scegli"} aria-pressed={Boolean(n)} disabled={locked}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, padding: 6, border: "none", background: "transparent", cursor: locked ? "default" : "pointer", display: "grid", placeItems: "start" }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 500,
        background: n ? CP.accent : alpha(CP.bgSunken, "99"), color: n ? CP.accentInk : CP.textPrimary,
        border: `2px solid ${n ? CP.accent : alpha(CP.surface, "ee")}`, boxShadow: `0 1px 4px ${alpha(CP.bgSunken, "66")}` }}>
        {locked ? <Lock size={12} /> : n || ""}
      </span>
    </button>
  );
}

// ── pagina ────────────────────────────────────────────────────────────────────

// 29/10/2026: è la scheda «Contenuti» di Social (la pagina del Warm-up): `embedded` toglie
// intestazione e margini della pagina. /admin/editoriale porta lì.
export default function EditorialeView({ embedded = false } = {}) {
  const { data: base, error: baseErr } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [creator, setCreatorState] = useState(null);
  useEffect(() => { if (!creator && base?.creators?.length) { const saved = ls.get(CREATOR_KEY); setCreatorState(base.creators.find((c) => c.creator === saved)?.creator || base.creators[0].creator); } }, [base, creator]);
  const setCreator = (c) => { setCreatorState(c); ls.set(CREATOR_KEY, c); setSel([]); setAddTo(null); setTab("calendario"); setProfileId(null); };
  const key = creator ? `${API}?creator=${encodeURIComponent(creator)}` : null;
  const { data, error, mutate, isValidating } = useSWR(key, fetcher, { revalidateOnFocus: true });
  const { data: wu } = useSWR("/api/admin/warmup", fetcher, { revalidateOnFocus: false });

  const [tab, setTab] = useState("calendario");
  const [sel, setSel] = useState([]);              // file scelti nel drive (in ordine di clic)
  const [kind, setKind] = useState("photo");
  const [freeOnly, setFreeOnly] = useState(true);
  const [path, setPath] = useState("*");          // "*" = tutte, "" = cartella principale
  const [shown, setShown] = useState(PAGE);
  const [addTo, setAddTo] = useState(null);         // id del contenuto a cui si aggiungono file
  const [edit, setEdit] = useState(null);           // bozza del contenuto aperto
  const [place, setPlace] = useState(null);         // { itemId?, date?, type? }
  const [preview, setPreview] = useState(null);     // file ingrandito
  const [profileId, setProfileId] = useState(null);
  const [ym, setYm] = useState(() => todayKey().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [vetro] = useVetro();

  const files = data?.files || [];
  const items = data?.items || [];
  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const profiles = data?.profiles || [];
  const pid = profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id || null;
  const wuById = useMemo(() => new Map((wu?.profiles || []).map((p) => [p.id, p])), [wu]);
  const addItem = addTo ? itemById.get(addTo) : null;
  const pickKind = addItem ? TYPES[addItem.type].kind : kind;

  useEffect(() => { setShown(PAGE); }, [kind, freeOnly, path, creator]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4500); return () => clearTimeout(t); }, [msg]);

  // Dopo un'azione la pagina si aggiorna SUBITO con il contenuto che il server restituisce
  // (prima rileggeva tutto: profili, drive e contenuti a ogni clic). Si rilegge per intero solo
  // quando si collega la cartella; un controllo completo parte comunque in sottofondo.
  function applyLocal(d, body, r) {
    if (!d) return d;
    let items = d.items || [];
    if (body.action === "delete") items = items.filter((it) => it.id !== body.id);
    else if (r?.item) items = items.some((it) => it.id === r.item.id) ? items.map((it) => (it.id === r.item.id ? r.item : it)) : [r.item, ...items];
    const used = usageMap(items);
    return { ...d, items, files: (d.files || []).map((f) => ({ ...f, usedBy: used.get(f.id) || null })) };
  }
  async function act(body, ok) {
    setBusy(true);
    try {
      const r = await post({ creator, ...body });
      if (body.action === "folder") await mutate();
      else { mutate((d) => applyLocal(d, body, r), { revalidate: false }); setTimeout(() => mutate(), 1500); }
      if (ok) setMsg({ t: ok });
      return r;
    }
    catch (e) { setMsg({ t: e.message, bad: true }); return null; }
    finally { setBusy(false); }
  }

  // ── drive: scelta dei file ──
  const paths = useMemo(() => [...new Set(["", ...(data?.folders || []), ...files.map((f) => f.path)])].sort((a, b) => a.localeCompare(b, "it")), [files, data?.folders]);
  const visible = files.filter((f) => f.kind === pickKind && (path === "*" || f.path === path) && (!freeOnly || !f.usedBy || (addTo && f.usedBy === addTo)));
  const toggle = (f) => {
    if (f.usedBy) return;
    setSel((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id]));
  };
  async function createFromSel() {
    const type = pickKind === "photo" ? "carosello" : "reel";
    if (addItem) {
      const r = await act({ action: "save", item: { id: addItem.id, files: [...addItem.files, ...sel] } }, `${sel.length} file aggiunti a «${addItem.title}»`);
      if (r) { setSel([]); setAddTo(null); setTab(addItem.type === "carosello" ? "caroselli" : "reel"); setEdit({ ...r.item }); }
      return;
    }
    const n = items.filter((it) => it.type === type).length + 1;
    const r = await act({ action: "save", item: { type, files: sel, title: `${TYPES[type].label} ${n}` } }, type === "carosello" ? "Carosello creato: completalo e segnalo pronto" : "Reel creato: è nella colonna Da montare");
    if (r) { setSel([]); setTab(type === "carosello" ? "caroselli" : "reel"); setEdit({ ...r.item }); }
  }

  // ── viste ──
  function viewSetup() {
    const email = data?.drive?.email || base?.drive?.email;
    return (
      <div className="vt-glass" style={{ ...cardBox, maxWidth: 680 }}>
        <h3 style={{ margin: "0 0 6px", fontWeight: 500 }}>Collega il drive di {creator}</h3>
        <p style={{ ...hint, fontSize: 13.5, margin: "0 0 14px" }}>HOC Pro legge la cartella e basta: non sposta, non copia e non cancella niente. Lo stato di ogni foto (libera, in un carosello, pubblicata) lo tiene qui.</p>
        <div style={{ fontSize: 14, marginBottom: 6 }}>1. In Google Drive, condividi la cartella della creator con questo indirizzo (basta «Visualizzatore»):</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <code style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, overflowWrap: "anywhere" }}>{email || "service account non configurato"}</code>
          {email && <button type="button" style={btnSm} onClick={() => { navigator.clipboard?.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={13} />{copied ? "Copiato" : "Copia"}</button>}
        </div>
        <div style={{ fontSize: 14, marginBottom: 6 }}>2. Incolla qui il link della cartella:</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: "1 1 320px" }} placeholder="https://drive.google.com/drive/folders/…" value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)} />
          <button type="button" style={btnPrimary} disabled={busy || !folderUrl.trim()} onClick={async () => { const r = await act({ action: "folder", url: folderUrl }, "Cartella collegata"); if (r) { setFolderUrl(""); setTab("drive"); } }}>{busy ? "Controllo…" : "Collega"}</button>
        </div>
      </div>
    );
  }

  function viewDrive() {
    const nSel = sel.length;
    const type = pickKind === "photo" ? "carosello" : "reel";
    return (
      <>
        {addItem && (
          <Notice>Stai aggiungendo {pickKind === "photo" ? "foto" : "video"} a «{addItem.title}». <button type="button" style={{ ...btnSm, marginLeft: 8 }} onClick={() => { setAddTo(null); setSel([]); }}>Annulla</button></Notice>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 12px" }}>
          {!addItem && <Seg items={[["photo", `Foto · ${files.filter((f) => f.kind === "photo" && !f.usedBy).length} libere`], ["video", `Video · ${files.filter((f) => f.kind === "video" && !f.usedBy).length} liberi`]]} value={kind} onChange={(v) => { setKind(v); setSel([]); }} />}
          <FilterChip label={freeOnly ? "Solo liberi" : "Anche gli usati"} active={freeOnly} onClick={() => setFreeOnly((v) => !v)} />

          <span style={{ flex: 1 }} />
          <span style={hint}>{data?.filesAt ? `letto ${new Date(data.filesAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          <button type="button" style={btnSm} disabled={isValidating} onClick={() => mutate(fetcher(`${key}&refresh=1`), { revalidate: false })}><RefreshCw size={13} />Rileggi il drive</button>
          {data?.folder && <a href={`https://drive.google.com/drive/folders/${data.folder.folderId}`} target="_blank" rel="noreferrer" style={{ ...btnSm, textDecoration: "none" }}><FolderOpen size={13} />{data.folder.folderName}</a>}
        </div>
        {paths.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "0 0 12px" }}>
            <FolderOpen size={15} color={CP.textMuted} />
            <FilterChip label={`Tutte · ${files.filter((f) => f.kind === pickKind).length}`} active={path === "*"} onClick={() => setPath("*")} />
            {paths.map((p) => <FilterChip key={p || "_root"} label={`${p || "Cartella principale"} · ${files.filter((f) => f.kind === pickKind && f.path === p).length}`} active={path === p} onClick={() => setPath(p)} />)}
          </div>
        )}
        {data?.filesError && <Notice danger>{data.filesError}{data.filesAt ? " — sto mostrando l'ultimo elenco letto." : ""}</Notice>}
        {data?.truncated && <Notice>La cartella ha più di 6.000 file: ne mostro una parte. Conviene collegare una sottocartella.</Notice>}
        {!visible.length && !data?.filesError && <div style={{ ...cardBox, textAlign: "center", ...hint, fontSize: 14 }}>{path !== "*" && !files.some((f) => f.path === path) ? `La cartella «${path || "principale"}» è vuota: carica i file in Drive e premi «Rileggi il drive».` : files.length ? (freeOnly ? "Tutti usati: niente di libero qui." : `Niente ${pickKind === "photo" ? "foto" : "video"} qui.`) : "La cartella è vuota, o non ci sono foto e video."}</div>}
        {visible.length > 0 && <p style={{ ...hint, margin: "0 0 8px" }}>Tocca la foto per ingrandirla, il cerchio in alto a sinistra per sceglierla.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
          {visible.slice(0, shown).map((f) => {
            const i = sel.indexOf(f.id);
            const owner = f.usedBy ? itemById.get(f.usedBy) : null;
            return (
              <Thumb key={f.id} creator={creator} id={f.id} kind={f.kind} dim={Boolean(f.usedBy) && f.usedBy !== addTo} onClick={() => setPreview(f)} title={owner ? `Già in «${owner.title}»` : f.name}>
                {i >= 0 && <div style={{ position: "absolute", inset: 0, border: `3px solid ${CP.accent}`, borderRadius: 8, background: alpha(CP.accent, "1a"), pointerEvents: "none" }} />}
                <SelectDot n={i >= 0 ? i + 1 : null} locked={Boolean(owner)} onClick={() => toggle(f)} />
                {owner && <span style={{ position: "absolute", left: 4, right: 4, bottom: 4, background: alpha(CP.bgSunken, "dd"), color: CP.textPrimary, borderRadius: 6, padding: "2px 5px", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{stageOf(owner) === "pubblicato" ? "Pubblicata" : "In"} «{owner.title}»</span>}
              </Thumb>
            );
          })}
        </div>
        {visible.length > shown && <div style={{ textAlign: "center", marginTop: 14 }}><button type="button" style={btn} onClick={() => setShown((n) => n + PAGE)}>Mostra altri ({visible.length - shown})</button></div>}
        {nSel > 0 && (
          <div className="vt-glass" style={{ position: "sticky", bottom: 12, marginTop: 16, zIndex: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 14, padding: "10px 14px", boxShadow: `0 10px 30px ${alpha(CP.bgSunken, "88")}` }}>
            <span style={{ fontSize: 14 }}>{nSel} {pickKind === "photo" ? (nSel === 1 ? "foto scelta" : "foto scelte") : (nSel === 1 ? "video scelto" : "video scelti")}</span>
            {type === "carosello" && !addItem && nSel < 2 && <span style={hint}>un carosello ne vuole almeno 2</span>}
            <span style={{ flex: 1 }} />
            <button type="button" style={btn} onClick={() => setSel([])}>Deseleziona</button>
            <button type="button" style={btnPrimary} disabled={busy} onClick={createFromSel}>
              <Plus size={15} />{addItem ? `Aggiungi a «${addItem.title}»` : type === "carosello" ? "Crea carosello" : nSel > 1 ? "Crea un reel con questi video" : "Crea reel"}
            </button>
          </div>
        )}
      </>
    );
  }

  function viewCalendar() {
    const prof = profiles.find((p) => p.id === pid);
    const wp = pid ? wuById.get(pid) : null;
    const grid = monthGrid(ym);
    const tk = todayKey();
    const ready = items.filter((it) => stageOf(it) === "pronto");
    const needsOn = (d) => {
      if (!wp || wp.archived || d < tk || dayNumberFor(wp, d) < 1) return null;
      try { return needsFromTaskIds(visibleItems(wp, planForDate(wp, d)).map((i) => i.id)); } catch { return null; }
    };
    let missing = 0;
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {profiles.length > 1 ? <Seg items={profiles.map((p) => [p.id, p.username])} value={pid} onChange={setProfileId} /> : <Chip>{prof?.username}</Chip>}
          {wp && <span style={hint}>in Warm-up: le caselle tratteggiate sono quello che il piano chiede e manca</span>}
          <span style={{ flex: 1 }} />
          <button type="button" style={btnSm} aria-label="Mese prima" onClick={() => setYm((m) => shiftMonth(m, -1))}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 15, minWidth: 130, textAlign: "center" }}>{new Date(ym + "-15T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span>
          <button type="button" style={btnSm} aria-label="Mese dopo" onClick={() => setYm((m) => shiftMonth(m, 1))}><ChevronRight size={14} /></button>
          {ym !== tk.slice(0, 7) && <button type="button" style={btnSm} onClick={() => setYm(tk.slice(0, 7))}>Oggi</button>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(92px, 1fr))", gap: 4, minWidth: 660 }}>
              {["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((d) => <div key={d} style={{ ...hint, padding: "0 4px" }}>{d}</div>)}
              {grid.map((d) => {
                const its = pid ? dayItems(items, pid, d) : [];
                const needs = needsOn(d);
                const cov = needs ? coverage(items, pid, d, needs) : null;
                if (cov) missing += cov.carosello.missing + cov.reel.missing;
                const out = d.slice(0, 7) !== ym;
                return (
                  <div key={d}
                    onDragOver={(e) => { if (pid) e.preventDefault(); }}
                    onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id && pid) setPlace({ itemId: id, date: d }); }}
                    style={{ background: d === tk ? alpha(CP.accent, "14") : CP.surface, border: `1px solid ${d === tk ? CP.accent : CP.borderSoft}`, borderRadius: 8, padding: 5, minHeight: 92, opacity: out ? 0.45 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: CP.textSecondary, marginBottom: 3 }}>
                      <span>{Number(d.slice(8))}</span>
                      {pid && <button type="button" aria-label="Aggiungi" onClick={() => setPlace({ date: d })} style={{ border: "none", background: "transparent", color: CP.textMuted, cursor: "pointer", padding: 0, display: "grid" }}><Plus size={13} /></button>}
                    </div>
                    {its.map((it) => {
                      const pub = it.status === "pubblicato";
                      const col = it.type === "carosello" ? CP.accent : CP.accentGreen;
                      return (
                        <button key={it.id} type="button" onClick={() => setEdit({ ...it })} title={it.title}
                          style={{ display: "block", width: "100%", textAlign: "left", margin: "0 0 3px", padding: "2px 5px", borderRadius: 5, border: `1px solid ${alpha(col, "55")}`, background: alpha(col, pub ? "10" : "22"), color: CP.textPrimary, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: FONTS.body, textDecoration: pub ? "line-through" : "none" }}>
                          {it.slot.time ? it.slot.time + " " : ""}{it.type === "carosello" ? "Car." : "Reel"} · {it.title}
                        </button>
                      );
                    })}
                    {cov && [["carosello", cov.carosello.missing], ["reel", cov.reel.missing]].map(([t, n]) => Array.from({ length: n }).map((_, i) => (
                      <button key={t + i} type="button" onClick={() => setPlace({ date: d, type: t })}
                        style={{ display: "block", width: "100%", textAlign: "left", margin: "0 0 3px", padding: "2px 5px", borderRadius: 5, border: `1px dashed ${CP.borderStrong}`, background: "transparent", color: CP.textMuted, fontSize: 11.5, cursor: "pointer", fontFamily: FONTS.body }}>
                        manca {t === "carosello" ? "carosello" : "reel"}
                      </button>
                    )))}
                    {cov && cov.reel.max > cov.reel.need && cov.reel.have < cov.reel.max && cov.reel.missing === 0 && <div style={{ fontSize: 10.5, color: CP.textMuted }}>fino a {cov.reel.max} reel</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <SectionHead aside={ready.length ? "trascina su un giorno, o premi «Metti in calendario»" : null} style={{ marginTop: 6 }}>Pronti da mettere in calendario · {ready.length}</SectionHead>
            {missing > 0 && <p style={{ ...hint, fontSize: 13, margin: "-4px 0 10px" }}>Al piano del Warm-up mancano {missing} contenuti in questo mese (da oggi in poi).</p>}
            {!ready.length && <div style={{ ...hint, fontSize: 13.5 }}>Niente di pronto. Si parte dalla scheda Drive: scegli le foto, crea il carosello, segnalo pronto.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {ready.map((it) => (
                <div key={it.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}>
                  <ItemCard it={it} creator={creator} compact onOpen={() => setEdit({ ...it })} onPlace={() => setPlace({ itemId: it.id })} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── finestre: contenuto aperto, messa in calendario, anteprima ──
  function editModal() {
    const it = edit;
    const saved = itemById.get(it.id) || it;
    const pub = saved.status === "pubblicato";
    const isCar = it.type === "carosello";
    const dirty = ["title", "caption", "sound", "city", "notes", "final", "noEdit"].some((k) => (it[k] || "") !== (saved[k] || "")) || it.files.join() !== saved.files.join();
    const set = (k, v) => setEdit((e) => ({ ...e, [k]: v }));
    // prima i video delle cartelle dei montati («video editati», «Montati»…), poi gli altri
    const editedDir = (f) => /edit|montat|final|pront/i.test(f.path || "") && !/da\s*edit|da\s*mont/i.test(f.path || "");
    const freeVideos = files.filter((f) => f.kind === "video" && (!f.usedBy || f.id === saved.final) && !it.files.includes(f.id))
      .sort((a, b) => Number(editedDir(b)) - Number(editedDir(a)));
    const probs = readyProblems(it);
    const save = async (extra) => {
      const r = await act({ action: "save", item: { id: it.id, title: it.title, files: it.files, final: it.final || null, noEdit: Boolean(it.noEdit), caption: it.caption, sound: it.sound, city: it.city, notes: it.notes, ...extra } }, "Salvato");
      if (r) setEdit({ ...r.item });
      return r;
    };
    const step = async (action, extra, ok) => {
      if (dirty && !pub) { const r = await save(); if (!r) return; }
      const r = await act({ action, id: it.id, ...extra }, ok);
      if (r) setEdit({ ...r.item });
    };
    const prof = saved.slot ? profiles.find((p) => p.id === saved.slot.profileId) : null;
    return (
      <ModalBox title={pub ? `${it.title} · pubblicato` : it.title} onClose={() => setEdit(null)}
        sub={`${TYPES[it.type].label} · ${STAGES.find((s) => s.key === stageOf(saved))?.label[it.type]}${saved.slot ? ` · ${prof?.username || ""} ${fmtDay(saved.slot.date, { weekday: "long", day: "numeric", month: "long" })}${saved.slot.time ? " alle " + saved.slot.time : ""}` : ""}`}
        foot={<>
          {!pub && <button type="button" style={btnDanger} disabled={busy} onClick={async () => { if (!(await confirmDialog({ title: `Smontare «${it.title}»?`, message: "Il contenuto si cancella e le sue foto e i suoi video tornano liberi, sceglibili per altri contenuti.", ok: "Smonta", danger: true }))) return; const r = await act({ action: "delete", id: it.id }, "Smontato: i file tornano liberi"); if (r) setEdit(null); }}><Trash2 size={14} />Smonta</button>}
          <span style={{ flex: 1 }} />
          {!pub && dirty && <button type="button" style={btn} disabled={busy} onClick={() => save()}>Salva</button>}
          {saved.status === "lavorazione" && <button type="button" style={btnPrimary} disabled={busy || probs.length > 0} title={probs.join(", ")} onClick={() => step("ready", { on: true }, isCar ? "Carosello pronto" : "Reel pronto")}><Check size={15} />Segna pronto</button>}
          {saved.status === "pronto" && !saved.slot && <button type="button" style={btnPrimary} onClick={() => { setPlace({ itemId: it.id }); setEdit(null); }}><CalendarDays size={15} />Metti in calendario</button>}
          {saved.status === "pronto" && saved.slot && <button type="button" style={btnPrimary} disabled={busy} onClick={() => step("publish", { on: true, today: todayKey() }, "Segnato pubblicato")}><Check size={15} />Segna pubblicato</button>}
          {pub && <button type="button" style={btn} disabled={busy} onClick={() => step("publish", { on: false }, "Riaperto")}>Non è uscito, riapri</button>}
        </>}>
        {!pub && <Field label="Nome (lo vedi solo tu)"><input style={input} value={it.title} onChange={(e) => set("title", e.target.value)} /></Field>}
        <div style={{ fontSize: 12.5, color: CP.textSecondary, fontWeight: 500, marginBottom: 6 }}>{isCar ? `Foto, nell'ordine in cui escono · ${it.files.length}` : `Video grezzi · ${it.files.length}`}</div>
        {!pub && it.files.length > 1 && <p style={{ ...hint, margin: "0 0 6px" }}>Trascina una foto per cambiarne il posto. Toccala per ingrandirla.</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 6, marginBottom: 6 }}>
          <SortableFiles files={it.files} disabled={pub} render={(f, i, dragging) => (
            <Thumb creator={creator} id={f} kind={isCar ? "photo" : "video"}>
              <span style={{ position: "absolute", top: 4, left: 4, background: dragging ? CP.accent : alpha(CP.bgSunken, "cc"), color: dragging ? CP.accentInk : CP.textPrimary, borderRadius: 6, padding: "0 6px", fontSize: 11.5 }}>{i + 1}</span>
              {!pub && (
                <button type="button" aria-label="Togli" data-nodrag="1" onClick={(e) => { e.stopPropagation(); setEdit((x) => ({ ...x, files: x.files.filter((y) => y !== f) })); }}
                  style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", border: "none", background: alpha(CP.bgSunken, "cc"), color: CP.textPrimary, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={13} /></button>
              )}
            </Thumb>
          )}
            onReorder={(files) => setEdit((x) => ({ ...x, files }))}
            onTap={(f) => setPreview(fileById.get(f) || { id: f, kind: isCar ? "photo" : "video", name: "" })} />
          {!pub && (
            <button type="button" onClick={async () => { if (dirty) { const r = await save(); if (!r) return; } setAddTo(it.id); setSel([]); setTab("drive"); setEdit(null); }}
              style={{ width: 92, flex: "0 0 auto", aspectRatio: "4 / 5", borderRadius: 8, border: `1px dashed ${CP.borderStrong}`, background: "transparent", color: CP.textSecondary, cursor: "pointer", fontSize: 12.5, display: "grid", placeItems: "center", fontFamily: FONTS.body }}>
              <span><Plus size={16} /><br />Aggiungi</span>
            </button>
          )}
        </div>
        {!isCar && (
          <div style={{ ...cardBox, padding: "12px 14px", background: CP.bgSunken }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Reel montato</div>
            {it.final ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Thumb creator={creator} id={it.final} kind="video" size={64} onClick={() => setPreview(fileById.get(it.final) || { id: it.final, kind: "video", name: "" })} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflowWrap: "anywhere" }}>{fileById.get(it.final)?.name || "file nel drive"}</div>
                {!pub && <button type="button" style={btnSm} onClick={() => set("final", null)}>Cambia</button>}
              </div>
            ) : pub ? <div style={hint}>Uscito senza montaggio.</div> : (
              <>
                <p style={{ ...hint, margin: "0 0 8px" }}>Montalo, caricalo nel drive della creator (anche in una cartella «Montati») e sceglilo qui. Se il video va bene così com'è, spunta la casella sotto.</p>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 10 }}><input type="checkbox" checked={Boolean(it.noEdit)} onChange={(e) => set("noEdit", e.target.checked)} />Va bene così, senza montaggio</label>
                {!it.noEdit && (freeVideos.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                    {freeVideos.slice(0, 60).map((f) => <Thumb key={f.id} creator={creator} id={f.id} kind="video" title={f.name} onClick={() => set("final", f.id)} />)}
                  </div>
                ) : <div style={hint}>Nessun video libero nel drive: caricalo e premi «Rileggi il drive».</div>)}
              </>
            )}
          </div>
        )}
        {readyProblems(saved).length === 0 && (
          <div className="vt-glass" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${CP.border}`, background: CP.bgSunken, marginBottom: 12 }}>
            <PublishDownload creator={creator} kind={it.type} title={it.title} caption={saved.caption}
              files={it.type === "carosello" ? saved.files : [saved.final || saved.files[0]].filter(Boolean)} style={btnPrimary} />
            <span style={{ ...hint, flex: 1, minWidth: 180 }}>{isCar ? "Foto in JPG già dritte, nell'ordine del carosello." : "Il video intero."} Dal telefono vanno nel rullino; la didascalia si copia da sola.</span>
          </div>
        )}
        {isCar && !pub && <p style={{ ...hint, margin: "0 0 10px" }}>Dal Warm-up: minimo 2 immagini, tutte forti, sempre un sound adatto e il tag della città USA assegnata.</p>}
        <Field label="Didascalia">{pub ? <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{it.caption || "—"}</div> : <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={it.caption || ""} onChange={(e) => set("caption", e.target.value)} />}</Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 10px" }}>
          <Field label="Sound">{pub ? <div style={{ fontSize: 14 }}>{it.sound || "—"}</div> : <input style={input} value={it.sound || ""} onChange={(e) => set("sound", e.target.value)} placeholder="nome del sound" />}</Field>
          <Field label="Tag della città">{pub ? <div style={{ fontSize: 14 }}>{it.city || "—"}</div> : <input style={input} value={it.city || ""} onChange={(e) => set("city", e.target.value)} placeholder="Miami - United States" />}</Field>
        </div>
        {saved.slot && !pub && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btnSm} onClick={() => { setPlace({ itemId: it.id, date: saved.slot.date }); setEdit(null); }}><CalendarDays size={13} />Sposta</button>
            <button type="button" style={btnSm} disabled={busy} onClick={() => step("schedule", { slot: null }, "Tolto dal calendario")}>Togli dal calendario</button>
          </div>
        )}
        {pub && saved.publishedBy && <p style={{ ...hint, marginTop: 10 }}>Segnato pubblicato da {saved.publishedBy}{saved.pubTask ? " dal to-do di Oggi" : ""}, {new Date(saved.publishedAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
      </ModalBox>
    );
  }

  // ── corpo ──
  const nCar = items.filter((it) => it.type === "carosello" && stageOf(it) !== "pubblicato").length;
  const nReel = items.filter((it) => it.type === "reel" && stageOf(it) !== "pubblicato").length;
  let body;
  if (baseErr) body = <Notice danger>{baseErr.message}</Notice>;
  else if (!base) body = <div style={hint}>Carico…</div>;
  else if (!base.creators.length) body = <div style={{ ...cardBox, ...hint, fontSize: 14 }}>Nessuna creator ha profili Instagram in Account social. Il profilo si registra da lì (o dal Warm-up) con il nome della creator.</div>;
  else if (error) body = <Notice danger>{error.message}</Notice>;
  else if (!data) body = <div style={hint}>Carico {creator}…</div>;
  else if (!data.drive?.configured) body = <Notice danger>Il service account Google di HOC Pro non è configurato: senza, il drive non si legge.</Notice>;
  else if (!data.folder) body = viewSetup();
  else if (tab === "drive") body = viewDrive();
  else if (tab === "caroselli") body = <StageCols type="carosello" items={items} creator={creator} onOpen={(it) => setEdit({ ...it })} onPlace={(it) => setPlace({ itemId: it.id })} />;
  else if (tab === "reel") body = <StageCols type="reel" items={items} creator={creator} onOpen={(it) => setEdit({ ...it })} onPlace={(it) => setPlace({ itemId: it.id })} />;
  else body = viewCalendar();

  // riquadri in alto (solo col vetro): dove sta il lavoro, in quattro numeri
  const tk0 = todayKey();
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const kpis = data?.folder ? {
    free: files.filter((f) => !f.usedBy).length,
    prep: items.filter((it) => stageOf(it) === "lavorazione").length,
    ready: items.filter((it) => stageOf(it) === "pronto").length,
    week: items.filter((it) => stageOf(it) === "calendario" && it.slot.date >= tk0 && it.slot.date <= in7).length,
    pub: items.filter((it) => stageOf(it) === "pubblicato").length,
  } : null;

  return (
    <VetroScope on={vetro}>
    <div style={embedded ? { fontFamily: FONTS.body, color: CP.textPrimary } : { maxWidth: 1600, margin: "0 auto", padding: "20px 16px 60px", fontFamily: FONTS.body, color: CP.textPrimary }}>
      {!embedded && <PageHead crumbs={[{ label: "Marketing" }, { label: "Social" }]} title="Contenuti Instagram"
        subtitle="Dal drive della creator al calendario del profilo: smisti foto e video, prepari caroselli e reel, li metti in calendario. Una foto usata non si può più scegliere." />}
      {base?.creators?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {base.creators.map((c) => <FilterChip key={c.ck} label={c.creator} active={c.creator === creator} onClick={() => setCreator(c.creator)} />)}
        </div>
      )}
      {vetro && kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 18 }}>
          <KpiCard i={0} icon={Images} tone={0} label="Foto e video liberi" value={<VetroNum value={String(kpis.free)} />} sub={`su ${files.length} nel drive`} />
          <KpiCard i={1} icon={Layers} tone={1} label="In preparazione" value={<VetroNum value={String(kpis.prep)} />} sub="caroselli da finire e reel da montare" />
          <KpiCard i={2} icon={CircleCheck} tone={3} label="Pronti da mettere in calendario" value={<VetroNum value={String(kpis.ready)} />} sub={kpis.ready ? "trascinali su un giorno" : "niente in attesa"} />
          <KpiCard i={3} icon={CalendarCheck} tone={4} label="In calendario nei prossimi 7 giorni" value={<VetroNum value={String(kpis.week)} />} sub={`${kpis.pub} già pubblicati`} />
        </div>
      )}
      {data?.folder && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 18, borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 14 }}>
          {[["calendario", "Calendario"], ["drive", `Drive · ${files.filter((f) => !f.usedBy).length} liberi`], ["caroselli", `Caroselli · ${nCar}`], ["reel", `Reel · ${nReel}`]].map(([k, l]) => (
            <FilterChip key={k} label={l} active={tab === k} onClick={() => { setTab(k); if (k !== "drive") { setAddTo(null); } }} />
          ))}
        </div>
      )}
      {msg && <div role="status" className="hoc-dock" style={{ position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 90, background: CP.panel, border: `1px solid ${msg.bad ? CP.accentRed : CP.border}`, color: msg.bad ? CP.accentRed : CP.textPrimary, borderRadius: 12, padding: "10px 16px", fontSize: 14, boxShadow: `0 10px 30px ${alpha(CP.bgSunken, "88")}`, maxWidth: "90vw" }}>{msg.t}</div>}
      {body}
      {edit && editModal()}
      {place && <PlaceModal key={`${place.itemId || ""}${place.date || ""}${place.type || ""}`} place={place} items={items} itemById={itemById} profiles={profiles} pid={pid} creator={creator} busy={busy} onClose={() => setPlace(null)}
        onConfirm={async (id, slot) => { const r = await act({ action: "schedule", id, slot }, `In calendario: ${fmtDay(slot.date)}${slot.time ? " alle " + slot.time : ""}`); if (r) setPlace(null); }} />}
      {preview && (() => {
        const list = visible.some((f) => f.id === preview.id) ? visible : [preview];
        const idx = list.findIndex((f) => f.id === preview.id);
        const cur = fileById.get(preview.id) || preview;
        return (
          <Lightbox creator={creator} file={cur} pos={idx} total={list.length}
            selected={sel.indexOf(cur.id)} owner={cur.usedBy && cur.usedBy !== addTo ? itemById.get(cur.usedBy) : null}
            canPick={tab === "drive" && cur.kind === pickKind}
            onPick={() => toggle(cur)}
            onPrev={idx > 0 ? () => setPreview(list[idx - 1]) : null}
            onNext={idx >= 0 && idx < list.length - 1 ? () => setPreview(list[idx + 1]) : null}
            onClose={() => setPreview(null)} />
        );
      })()}
    </div>
    </VetroScope>
  );
}
