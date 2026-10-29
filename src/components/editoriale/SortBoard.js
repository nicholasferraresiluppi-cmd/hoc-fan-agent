"use client";

// Editoriale › Drive › «Per gruppi» (29/10/2026): lo smistamento del drive che si VEDE mentre
// succede. Idea presa da un reel di @viiolini che Nicholas ha trovato «più chiaro»: al centro la
// nuvola dei file ancora da smistare, ai lati i gruppi (foto a sinistra, video a destra); a ogni
// passo dell'AI i file volano dalla nuvola al loro gruppo e i numeri in alto salgono. Un gruppo
// si apre con un tocco: la griglia del drive filtrata su quel gruppo.
// Logica pura in lib/editoriale-sort-core.js, archivio e AI in lib/editoriale-sort.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Pause, RotateCcw, Sparkles } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { BTN, BTN_PRIMARY } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { SORT_CATEGORIES, sortLabel, groupOf } from "@/lib/editoriale-sort-core";

const API = "/api/admin/editoriale";
const CLOUD_MAX = 96;      // tessere disegnate nella nuvola (il resto è «+N»)
const ORDER = [...SORT_CATEGORIES.map((c) => c.key), "nd", "dup"];
const thumbUrl = (creator, id) => `${API}?creator=${encodeURIComponent(creator)}&thumb=${encodeURIComponent(id)}&v=2`;

// numero che sale fino al valore (mezzo secondo), senza saltare
function useCountUp(target) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    let raf, t0;
    const tick = (t) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / 500);
      const x = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      setV(x); from.current = x;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Counter({ label, value, strong }) {
  const v = useCountUp(value);
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", color: strong ? CP.accent : CP.textPrimary, lineHeight: 1.1 }}>{v.toLocaleString("it-IT")}</div>
    </div>
  );
}

// posizione fissa di ogni tessera nella nuvola (spirale a «girasole», sempre uguale per lo stesso indice)
function spot(i, n) {
  const r = Math.sqrt((i + 0.5) / Math.max(n, 1)) * 44; // % del raggio
  const a = i * 2.39996;
  const h = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), rot: Math.round(h * 36) - 18 };
}

function GroupBox({ creator, g, files, onOpen, boxRef }) {
  const shown = files.slice(0, 6);
  return (
    <button type="button" ref={boxRef} onClick={onOpen} className="hoc-sort-box"
      style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "block", background: CP.surface, border: `1px solid ${g.key === "dup" ? alpha(CP.attn, "66") : CP.border}`, borderRadius: 14, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13.5, color: CP.textSecondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sortLabel(g.key)}</span>
        <span key={g.n} className="hoc-sort-pop" style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{g.n}</span>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 8, minHeight: 30 }}>
        {shown.map((f) => (
          <img key={f.id} src={thumbUrl(creator, f.id)} alt="" loading="lazy" draggable={false}
            style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>
        {g.key === "dup" ? "stesso file caricato due volte" : g.key === "nd" ? "l'AI non ha potuto guardarli" : g.free === g.n ? "tutti liberi" : !g.free ? "nessuno libero" : `${g.free} ${g.free === 1 ? "libero" : "liberi"}`}
      </div>
    </button>
  );
}

/**
 * files: foto e video del drive (con usedBy/uses). sort: { labels, dups, spent, cap, usdPerFile }.
 * onLabels(merge): aggiorna i gruppi nella pagina. onOpen(kind, key): apre la griglia filtrata.
 */
export default function SortBoard({ creator, files, sort, isFree, onLabels, onOpen, onMessage }) {
  const labels = sort?.labels || {};
  const dups = useMemo(() => new Map(Object.entries(sort?.dups || {})), [sort?.dups]);
  const [running, setRunning] = useState(false);
  const [flights, setFlights] = useState([]);   // { id, kind, key, fx, fy, tx, ty, delay }
  const stopRef = useRef(false);
  const tileRefs = useRef(new Map());
  const boxRefs = useRef(new Map());
  const cloudRef = useRef(null);
  const flyingIds = useMemo(() => new Set(flights.map((f) => f.id)), [flights]);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 900px)");
    const f = () => setNarrow(m.matches);
    f(); m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  useEffect(() => () => { stopRef.current = true; }, []);

  // file per gruppo (quelli in volo non sono ancora arrivati: il numero sale quando atterrano)
  const { pending, groups, nPhoto, nVideo } = useMemo(() => {
    const pending = [];
    const by = new Map();
    let nPhoto = 0, nVideo = 0;
    for (const f of files) {
      if (f.kind === "photo") nPhoto++; else nVideo++;
      const g = groupOf(f, labels, dups);
      if (!g) { pending.push(f); continue; }
      const k = `${f.kind}|${g}`;
      if (!by.has(k)) by.set(k, { kind: f.kind, key: g, n: 0, free: 0, files: [] });
      const b = by.get(k);
      if (flyingIds.has(f.id)) continue;
      b.n++; if (isFree(f)) b.free++;
      b.files.push(f);
    }
    return { pending, groups: [...by.values()].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)), nPhoto, nVideo };
  }, [files, labels, dups, flyingIds, isFree]);

  const cloud = pending.slice(0, CLOUD_MAX);
  const nGroups = new Set(groups.filter((g) => g.key !== "dup" && g.key !== "nd").map((g) => g.key)).size;
  const nd = groups.filter((g) => g.key === "nd").reduce((s, g) => s + g.n, 0);
  const done = files.length - pending.length;
  const aiDone = files.filter((f) => labels[f.id] != null && !dups.has(f.id)).length; // i doppioni non sono lavoro dell'AI
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function launch(newLabels) {
    const byId = new Map(files.map((f) => [f.id, f]));
    const cRect = cloudRef.current?.getBoundingClientRect();
    const ids = Object.keys(newLabels).filter((id) => byId.has(id));
    const span = Math.min(3200, ids.length * 65);
    const list = [];
    if (!reduce && cRect) {
      ids.forEach((id, i) => {
        const f = byId.get(id);
        const t = tileRefs.current.get(id)?.getBoundingClientRect();
        const from = t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : { x: cRect.left + cRect.width / 2, y: cRect.top + cRect.height / 2 };
        list.push({ id, kind: f.kind, key: newLabels[id], fx: from.x, fy: from.y, delay: Math.round((i / Math.max(ids.length, 1)) * span) });
      });
    }
    if (list.length) setFlights((x) => [...x, ...list]);
    onLabels(newLabels);
  }

  // dopo che i riquadri di arrivo esistono, si calcola dove atterrare
  const [targets, setTargets] = useState({});
  useEffect(() => {
    if (!flights.length) return;
    const t = {};
    for (const f of flights) {
      if (targets[f.id]) continue;
      const r = boxRefs.current.get(`${f.kind}|${f.key}`)?.getBoundingClientRect();
      t[f.id] = r ? { x: r.left + 26, y: r.top + 46 } : { x: f.fx, y: f.fy };
    }
    if (Object.keys(t).length) setTargets((x) => ({ ...x, ...t }));
  }, [flights]); // targets letti solo per non ricalcolare i voli già partiti

  function landed(id) {
    setFlights((x) => x.filter((f) => f.id !== id));
    setTargets((x) => { const y = { ...x }; delete y[id]; return y; });
  }

  async function run(retry = false) {
    stopRef.current = false;
    setRunning(true);
    try {
      let first = true;
      while (!stopRef.current) {
        const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creator, action: "sort", retry: retry && first }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Smistamento non riuscito");
        first = false;
        const got = Object.keys(d.labels || {}).length;
        if (got) launch(d.labels);
        if (!d.remaining || !got) break;
      }
    } catch (e) {
      onMessage?.(e.message, true);
    } finally {
      setRunning(false);
    }
  }

  async function reset() {
    const ok = await confirmDialog({ title: "Rimettere tutto da smistare?", message: "I gruppi fatti dall'AI (e le correzioni a mano) si cancellano. Il drive non si tocca.", ok: "Rimetti da smistare", danger: true });
    if (!ok) return;
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creator, action: "sortReset" }) });
    if (r.ok) onLabels(null); else onMessage?.("Non riuscito", true);
  }

  const toSort = pending.length;
  const usd = toSort * (sort?.usdPerFile || 0.0004);
  const cost = usd < 1 ? `circa ${Math.max(1, Math.round(usd * 100))} centesimi` : `circa ${usd.toFixed(2).replace(".", ",")} $`;
  const photoGroups = groups.filter((g) => g.kind === "photo");
  const videoGroups = groups.filter((g) => g.kind === "video");
  // riquadri che servono subito come arrivo dei file in volo (anche se ancora a zero)
  for (const f of flights) {
    const list = f.kind === "photo" ? photoGroups : videoGroups;
    if (!list.some((g) => g.key === f.key)) list.push({ kind: f.kind, key: f.key, n: 0, free: 0, files: [] });
  }
  photoGroups.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  videoGroups.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  const column = (title, list, kind) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, color: CP.textMuted, margin: "0 2px 8px" }}>{title}</div>
      {!list.length && <div style={{ fontSize: 13, color: CP.textMuted, padding: "10px 2px" }}>{toSort ? "I gruppi compaiono qui mentre smisto." : "Niente."}</div>}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(auto-fill, minmax(150px, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {list.map((g) => (
          <GroupBox key={g.key} creator={creator} g={g} files={g.files} onOpen={() => onOpen(kind, g.key)}
            boxRef={(el) => { const k = `${kind}|${g.key}`; if (el) boxRefs.current.set(k, el); else boxRefs.current.delete(k); }} />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", borderRadius: 20, border: `1px solid ${CP.borderSoft}`, padding: narrow ? "16px 14px" : "22px 24px", background: `radial-gradient(ellipse at 50% 35%, ${alpha(CP.accent, "16")}, transparent 62%), ${CP.surface}`, fontFamily: FONTS.body, color: CP.textPrimary, overflow: "hidden" }}>
      <style>{`
        @keyframes hocSortFloat { 0%,100% { transform: translate(-50%,-50%) rotate(var(--r)) } 50% { transform: translate(-50%,-56%) rotate(var(--r)) } }
        @keyframes hocSortPop { 0% { transform: scale(1.35); color: ${CP.accent} } 100% { transform: scale(1) } }
        @keyframes hocSortFly { 0% { transform: translate(-50%,-50%) scale(1); opacity: 1 } 70% { opacity: 1 } 100% { transform: translate(calc(var(--tx) - var(--fx) - 50%), calc(var(--ty) - var(--fy) - 50%)) scale(.55); opacity: .2 } }
        .hoc-sort-pop { display: inline-block; animation: hocSortPop .45s ease-out }
        .hoc-sort-box { transition: transform .15s, border-color .15s }
        .hoc-sort-box:hover { transform: translateY(-1px); border-color: ${CP.accent} !important }
        @media (prefers-reduced-motion: reduce) { .hoc-sort-pop, .hoc-sort-tile { animation: none !important } }
      `}</style>

      {/* titolo e numeri */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 13, color: CP.textMuted }}>{running ? "Smisto…" : toSort ? "Da smistare" : "Smistato"}</div>
          <h2 style={{ margin: "2px 0 0", fontSize: narrow ? 22 : 26, fontWeight: 500, letterSpacing: -0.3 }}>Il drive di <span style={{ color: CP.accent }}>{creator}</span></h2>
        </div>
        <div style={{ display: "flex", gap: narrow ? 14 : 26, flexWrap: "wrap" }}>
          <Counter label="File" value={files.length} />
          <Counter label="Foto" value={nPhoto} />
          {nVideo > 0 && <Counter label="Video" value={nVideo} />}
          <Counter label="Gruppi" value={nGroups} strong />
          {dups.size > 0 && <Counter label="Doppioni" value={dups.size} />}
        </div>
      </div>

      {/* comandi */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        {running ? (
          <>
            <button type="button" style={BTN} onClick={() => { stopRef.current = true; }}><Pause size={15} />Ferma</button>
            <div style={{ flex: "1 1 200px", maxWidth: 420, height: 6, borderRadius: 3, background: alpha(CP.accent, "22"), overflow: "hidden" }}>
              <div style={{ width: `${files.length ? (done / files.length) * 100 : 0}%`, height: "100%", background: CP.accent, transition: "width .6s" }} />
            </div>
            <span style={{ fontSize: 13, color: CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{done.toLocaleString("it-IT")} su {files.length.toLocaleString("it-IT")}</span>
          </>
        ) : toSort > 0 ? (
          <>
            <button type="button" style={BTN_PRIMARY} onClick={() => run(false)}><Sparkles size={15} />{aiDone ? "Continua a smistare" : "Smista con l'AI"}</button>
            <span style={{ fontSize: 13, color: CP.textMuted }}>{toSort.toLocaleString("it-IT")} file da guardare · {cost} · puoi fermarti quando vuoi</span>
          </>
        ) : (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: CP.accentGreen }}><CircleCheck size={16} />Tutto smistato: tocca un gruppo per aprirlo</span>
            {nd > 0 && <button type="button" style={BTN} onClick={() => run(true)}><RotateCcw size={14} />Riprova i {nd} non letti</button>}
          </>
        )}
        <span style={{ flex: 1 }} />
        {aiDone > 0 && !running && <button type="button" onClick={reset} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: CP.textMuted, textDecoration: "underline", textUnderlineOffset: 3 }}>Rimetti tutto da smistare</button>}
      </div>

      {/* foto · nuvola · video */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : nVideo ? "minmax(0,1fr) minmax(260px,0.9fr) minmax(0,1fr)" : "minmax(0,1.2fr) minmax(260px,1fr)", gap: narrow ? 16 : 22, alignItems: "start" }}>
        {!narrow && column("Foto", photoGroups, "photo")}
        <div style={{ order: narrow ? -1 : 0 }}>
          <div ref={cloudRef} style={{ position: "relative", width: "100%", maxWidth: narrow ? 300 : 420, margin: "0 auto", aspectRatio: "1 / 1" }}>
            {cloud.map((f, i) => {
              const p = spot(i, cloud.length);
              return (
                <img key={f.id} ref={(el) => { if (el) tileRefs.current.set(f.id, el); else tileRefs.current.delete(f.id); }}
                  className="hoc-sort-tile" src={thumbUrl(creator, f.id)} alt="" loading="lazy" draggable={false}
                  style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: narrow ? 26 : 34, height: narrow ? 26 : 34, objectFit: "cover", borderRadius: 7, border: `2px solid ${CP.surface}`, boxShadow: `0 3px 10px ${alpha(CP.bgSunken, "55")}`, background: CP.surfaceAlt, "--r": `${p.rot}deg`, transform: `translate(-50%,-50%) rotate(${p.rot}deg)`, animation: running ? `hocSortFloat ${2.4 + (i % 5) * 0.3}s ease-in-out ${(i % 7) * 0.2}s infinite` : "none" }} />
              );
            })}
            {!cloud.length && (
              <div style={{ position: "absolute", inset: "18%", borderRadius: "50%", display: "grid", placeItems: "center", textAlign: "center", background: alpha(CP.accentGreen, "12"), border: `1px solid ${alpha(CP.accentGreen, "44")}` }}>
                <div><CircleCheck size={30} color={CP.accentGreen} /><div style={{ fontSize: 14, marginTop: 6 }}>{files.length.toLocaleString("it-IT")} file<br />in {nGroups} gruppi</div></div>
              </div>
            )}
          </div>
          {pending.length > CLOUD_MAX && <div style={{ textAlign: "center", fontSize: 12.5, color: CP.textMuted, marginTop: 6 }}>e altri {(pending.length - CLOUD_MAX).toLocaleString("it-IT")} da smistare</div>}
        </div>
        {narrow && column("Foto", photoGroups, "photo")}
        {nVideo > 0 && column("Video", videoGroups, "video")}
      </div>

      {/* file in volo dalla nuvola al gruppo: sul body, così un contenitore col vetro (backdrop-filter)
          non sposta il riferimento delle coordinate */}
      {flights.length > 0 && typeof document !== "undefined" && createPortal(flights.map((f) => {
        const t = targets[f.id];
        if (!t) return null;
        return (
          <img key={f.id} src={thumbUrl(creator, f.id)} alt="" draggable={false} onAnimationEnd={() => landed(f.id)}
            style={{ position: "fixed", left: f.fx, top: f.fy, width: 34, height: 34, objectFit: "cover", borderRadius: 7, border: `2px solid ${CP.surface}`, boxShadow: `0 6px 16px ${alpha(CP.bgSunken, "66")}`, zIndex: 80, pointerEvents: "none", "--fx": `${f.fx}px`, "--fy": `${f.fy}px`, "--tx": `${t.x}px`, "--ty": `${t.y}px`, transform: "translate(-50%,-50%)", animation: `hocSortFly .75s cubic-bezier(.5,0,.3,1) ${f.delay}ms both` }} />
        );
      }), document.body)}
    </div>
  );
}
