"use client";

// Banco montaggi (1/11/2026): i video montati di una cartella Drive si guardano qui, si scelgono e i
// pronti si scaricano. Dal lettore la scelta passa da sola al video dopo: si giudicano in sequenza.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, Play, RefreshCw, RotateCcw, ThumbsUp, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { BTN, BTN_PRIMARY, EmptyState, FilterBar, FilterChip, Notice, SectionTitle, Spiega, NUM, alpha, card } from "@/components/ds";
import { BANCO_STATES, bancoCounts, bancoFolders, defaultState, filterRows, nextInQueue } from "@/lib/studio-banco-core";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const field = { padding: "8px 10px", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };
const sm = { ...BTN, padding: "6px 10px", minHeight: 36, fontSize: 13 };
const fmtSec = (s) => (Number.isFinite(s) ? `${s} s` : "");

/** Scarica a pezzi dal percorso del lettore: ogni risposta resta sotto il limite delle funzioni. */
async function scarica(src, name, onPct) {
  const parts = [];
  let start = 0, total = null;
  do {
    const r = await fetch(src, { headers: { Range: `bytes=${start}-` } });
    if (!r.ok) throw new Error(`Download non riuscito (${r.status})`);
    const range = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    total = range ? Number(range[1]) : null;
    const b = await r.blob();
    parts.push(b);
    start += b.size;
    if (total) onPct?.(Math.round((start / total) * 100));
    if (!b.size) break;
  } while (total && start < total);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function Azioni({ row, onMark, onDownload, busy, large }) {
  const s = large ? { ...BTN, minWidth: 150 } : sm;
  const p = large ? { ...BTN_PRIMARY, minWidth: 170 } : { ...sm, background: CP.accent, color: CP.accentInk, borderColor: CP.accent };
  const mark = (state) => (e) => { e.stopPropagation(); onMark(row, state); };
  if (row.state === "da_vedere") return (<>
    <button type="button" style={p} onClick={mark("scelto")}><ThumbsUp size={14} aria-hidden="true" />Mi piace</button>
    <button type="button" style={s} onClick={mark("scartato")}><X size={14} aria-hidden="true" />Scarta</button>
  </>);
  if (row.state === "scelto") return (<>
    <button type="button" style={p} onClick={mark("pronto")}><Check size={14} aria-hidden="true" />Pronto</button>
    <button type="button" style={s} onClick={mark("da_vedere")}><RotateCcw size={14} aria-hidden="true" />Rimetti</button>
  </>);
  if (row.state === "pronto") return (<>
    <button type="button" style={p} disabled={!!busy} onClick={(e) => { e.stopPropagation(); onDownload(row); }}><Download size={14} aria-hidden="true" />{busy ? `${busy.pct}%` : "Scarica"}</button>
    <button type="button" style={s} onClick={mark("scelto")}><RotateCcw size={14} aria-hidden="true" />Rimetti</button>
  </>);
  return <button type="button" style={s} onClick={mark("da_vedere")}><RotateCcw size={14} aria-hidden="true" />Ripesca</button>;
}

function Lettore({ queue, rows, startId, src, onMark, onDownload, downloading, onClose }) {
  const [id, setId] = useState(startId);
  const [broken, setBroken] = useState(false);
  const [finito, setFinito] = useState(false);
  const row = rows.find((r) => r.id === id);
  const pos = queue.indexOf(id);
  const vai = useCallback((d) => { const n = queue[pos + d]; if (n) { setId(n); setBroken(false); setFinito(false); } }, [queue, pos]);
  const giudica = useCallback((r, state) => {
    onMark(r, state);
    const n = nextInQueue(queue, r.id);
    if (n) { setId(n); setBroken(false); } else setFinito(true);
  }, [onMark, queue]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") vai(-1);
      else if (e.key === "ArrowRight") vai(1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, vai]);
  if (!row) return null;
  const arrow = (side, d, Icon, off) => (
    <button type="button" aria-label={d < 0 ? "Video prima" : "Video dopo"} disabled={off} onClick={() => vai(d)}
      style={{ position: "absolute", top: "50%", [side]: 10, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: `1px solid ${CP.border}`, background: CP.panel, color: off ? CP.textMuted : CP.textPrimary, display: "grid", placeItems: "center", cursor: off ? "default" : "pointer", opacity: off ? 0.4 : 1, zIndex: 2 }}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
  const stato = BANCO_STATES.find((s) => s.key === row.state);
  return (
    <div role="dialog" aria-modal="true" aria-label={row.title} onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: CP.panel, display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", padding: "max(12px, env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom))", fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 10px", color: CP.textPrimary }}>
        <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
        <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>{pos + 1} di {queue.length}</span>
        <button type="button" aria-label="Chiudi" onClick={onClose} style={{ ...sm, padding: "5px 8px" }}><X size={16} aria-hidden="true" /></button>
      </div>
      <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: 0, overflow: "hidden" }}>
        {arrow("left", -1, ChevronLeft, pos <= 0)}
        {finito ? (
          <div style={{ textAlign: "center", color: CP.textPrimary, fontSize: 16 }}>
            Coda finita
            <div style={{ marginTop: 12 }}><button type="button" style={BTN_PRIMARY} onClick={onClose}>Torna alla griglia</button></div>
          </div>
        ) : broken ? (
          <div style={{ textAlign: "center", color: CP.textSecondary, fontSize: 14, maxWidth: 320 }}>
            Questo video non si riesce a leggere qui.
            <div style={{ marginTop: 10 }}><a href={`https://drive.google.com/file/d/${row.id}/view`} target="_blank" rel="noreferrer" style={{ ...sm, textDecoration: "none" }}><ExternalLink size={13} aria-hidden="true" />Apri in Drive</a></div>
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center" }}>
            <video key={row.id} controls autoPlay loop playsInline preload="metadata" poster={`${src}?thumb=${encodeURIComponent(row.id)}`} src={`${src}?media=${encodeURIComponent(row.id)}`}
              onError={() => setBroken(true)} style={{ height: "100%", maxWidth: "100%", borderRadius: 10, background: CP.bgSunken }} />
          </div>
        )}
        {arrow("right", 1, ChevronRight, pos >= queue.length - 1)}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, paddingTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>{stato?.label}</span>
        {!finito && <Azioni row={row} large onMark={giudica} onDownload={onDownload} busy={downloading?.id === row.id ? downloading : null} />}
      </div>
    </div>
  );
}

export default function BancoMontaggi({ pid }) {
  const url = `/api/admin/studio-social/${encodeURIComponent(pid)}/banco`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [state, setState] = useState(null);
  const [path, setPath] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);
  const [viewer, setViewer] = useState(null); // { id, queue } fotografata all'apertura: i giudizi non spostano i video sotto il dito
  const [downloading, setDownloading] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const rows = useMemo(() => data?.rows || [], [data]);
  const counts = useMemo(() => bancoCounts(rows, path || null), [rows, path]);
  const folders = useMemo(() => bancoFolders(rows), [rows]);
  const current = state || defaultState(counts);
  const visible = useMemo(() => filterRows(rows, { state: current, path: path || null }), [rows, current, path]);

  const post = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
    return j;
  };
  const collega = async () => {
    setSaving(true); setErr(null);
    try { await post({ action: "folder", url: link }); setLink(""); await mutate(); } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const aggiorna = async () => {
    setRefreshing(true); setErr(null);
    try { await mutate(await fetcher(`${url}?refresh=1`), { revalidate: false }); } catch (e) { setErr(e.message); } finally { setRefreshing(false); }
  };
  const onMark = useCallback(async (row, next) => {
    setErr(null);
    const cur = dataRef.current;
    mutate({ ...cur, rows: cur.rows.map((r) => (r.id === row.id ? { ...r, state: next } : r)) }, { revalidate: false });
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark", fileId: row.id, state: next }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Errore ${r.status}`);
    } catch (e) { setErr(`«${row.title}» non salvato: ${e.message}`); mutate(); }
  }, [mutate, url]);
  const onDownload = useCallback(async (row) => {
    setDownloading({ id: row.id, pct: 0 }); setErr(null);
    try { await scarica(`${url}?media=${encodeURIComponent(row.id)}`, row.name, (pct) => setDownloading({ id: row.id, pct })); }
    catch (e) { setErr(`«${row.title}»: ${e.message}`); }
    finally { setDownloading(null); }
  }, [url]);

  const title = "Banco montaggi";
  if (isLoading) return (<><SectionTitle>{title}</SectionTitle><div style={{ fontSize: 14, color: CP.textMuted, marginBottom: 24 }}>Caricamento…</div></>);
  if (error) return (<><SectionTitle>{title}</SectionTitle><div style={{ marginBottom: 24 }}><Notice danger>{`Errore nel caricamento: ${error.message}`}</Notice></div></>);

  if (!data?.folder) {
    return (
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>{title}</SectionTitle>
        <EmptyState title="Nessuna cartella collegata" action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <input style={{ ...field, flex: "1 1 280px", maxWidth: 420 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link della cartella Drive" aria-label="Link della cartella Drive" />
            <button type="button" style={BTN_PRIMARY} disabled={saving || !link.trim()} onClick={collega}>{saving ? "Collego…" : "Collega"}</button>
          </div>
        }>
          {data?.drive?.email ? <>I video montati si guardano qui. La cartella va condivisa, in sola lettura, con {data.drive.email}.</> : "Drive non è configurato in questo ambiente."}
        </EmptyState>
        {err && <div style={{ marginTop: 10 }}><Notice danger>{err}</Notice></div>}
      </div>
    );
  }

  const stato = BANCO_STATES.find((s) => s.key === current);
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle aside={
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <a href={data.folder.url} target="_blank" rel="noreferrer" style={{ ...sm, textDecoration: "none" }}><ExternalLink size={13} aria-hidden="true" />{data.folder.name}</a>
          <button type="button" style={sm} disabled={refreshing} onClick={aggiorna}><RefreshCw size={13} aria-hidden="true" />{refreshing ? "Rileggo…" : "Rileggi"}</button>
        </span>
      }>{title}</SectionTitle>
      {data.error && <div style={{ marginBottom: 10 }}><Notice danger>{`Drive non risponde: ${data.error}. Qui sotto l'ultimo elenco letto.`}</Notice></div>}
      {data.truncated && <div style={{ marginBottom: 10 }}><Notice>La cartella ha più file di quanti se ne possano leggere: l'elenco è parziale.</Notice></div>}
      {err && <div style={{ marginBottom: 10 }}><Notice danger>{err}</Notice></div>}
      <FilterBar onReset={state || path ? () => { setState(null); setPath(""); } : undefined}>
        {BANCO_STATES.map((s) => <FilterChip key={s.key} label={`${s.label} ${counts[s.key]}`} active={current === s.key} onClick={() => setState(s.key)} />)}
        {folders.length > 1 && (
          <select style={{ ...field, padding: "6px 8px", fontSize: 13 }} value={path} onChange={(e) => setPath(e.target.value)} aria-label="Cartella">
            <option value="">Tutte le cartelle ({rows.length})</option>
            {folders.map((f) => <option key={f.path} value={f.path}>{f.label} ({f.n})</option>)}
          </select>
        )}
      </FilterBar>
      {visible.length === 0 ? (
        <EmptyState title={rows.length ? `Niente in «${stato.label}»` : "Nessun video nella cartella"} action={rows.length ? null : <button type="button" style={BTN} disabled={refreshing} onClick={aggiorna}>Rileggi la cartella</button>}>
          {rows.length ? stato.hint : "Carica i video montati nella cartella Drive, poi rileggila."}
        </EmptyState>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(46%, 170px), 1fr))", gap: 10 }}>
          {visible.map((r) => (
            <div key={r.id} style={{ ...card, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column" }}>
              <button type="button" aria-label={`Guarda ${r.title}`} onClick={() => setViewer({ id: r.id, queue: visible.map((x) => x.id) })}
                style={{ position: "relative", display: "block", width: "100%", aspectRatio: "9 / 16", padding: 0, border: "none", background: CP.bgSunken, cursor: "pointer" }}>
                <img src={`${url}?thumb=${encodeURIComponent(r.id)}`} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 44, height: 44, borderRadius: "50%", background: alpha(CP.panel, "E6"), color: CP.textPrimary, display: "grid", placeItems: "center" }}><Play size={18} aria-hidden="true" /></span>
              </button>
              <div style={{ padding: "8px 8px 10px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ fontSize: 13, color: CP.textPrimary, lineHeight: 1.3, minHeight: 34 }}>
                  {r.title}
                  {r.dur != null && <span style={{ color: CP.textMuted, ...NUM }}> · {fmtSec(r.dur)}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                  <Azioni row={r} onMark={onMark} onDownload={onDownload} busy={downloading?.id === r.id ? downloading : null} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Spiega style={{ marginTop: 10 }}>
        Tocca un video per guardarlo: dal lettore, «Mi piace» e «Scarta» passano da soli al video dopo. Il drive non cambia mai: le scelte restano qui. I «Pronti» si scaricano per pubblicarli.
      </Spiega>
      {viewer && <Lettore queue={viewer.queue} rows={rows} startId={viewer.id} src={url} onMark={onMark} onDownload={onDownload} downloading={downloading} onClose={() => setViewer(null)} />}
    </div>
  );
}
