"use client";
/**
 * Pezzi di design condivisi (25/09/2026), ricavati dal pilota Calendario compensi
 * testato con 5 utenti simulati. Struttura di una pagina dati:
 *   PageHead → HeroMetric (+ Metric secondarie col confronto) → FilterChip
 *   → DataTable ordinabile → Disclosure per ciò che serve di rado.
 * Tutto usa i token CP (seguono il tema) e i formati di lib/format.js.
 */
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { useStyle } from "@/lib/theme-client";
import { tierLabel, TIER_ORDER } from "@/lib/tier-label";

/*
 * Stile v3 "Notte / Carta" (anteprima, passo 3 — 26/09/2026).
 * Regola: lo stile attuale NON cambia. Ogni differenza visiva sta in regole CSS
 * sotto [data-style="v3"] (globals.css, classi ds-*: fuori da v3 non hanno
 * regole) oppure in markup emesso solo quando useStyle() === "v3".
 * Eccezione dichiarata: la navigazione da tastiera di DataTable vale in entrambi
 * gli stili, ma si vede solo con la tastiera (:focus-visible).
 */

const NUM = { fontVariantNumeric: "tabular-nums" };
export const card = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 };

export function PageHead({ crumbs = [], title, subtitle, actions }) {
  return (
    <header className="ds-head" style={{ marginBottom: 20 }}>
      {crumbs.length > 0 && (
        <div className="ds-crumbs" style={{ display: "flex", gap: 8, fontSize: 13, color: CP.textSecondary, marginBottom: 6, flexWrap: "wrap" }}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 8 }}>
              {i > 0 && <span style={{ color: CP.textMuted }}>›</span>}
              {c.href ? <Link href={c.href} style={{ color: "inherit", textDecoration: "none" }}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <h1 className="ds-h1" style={{ fontSize: 28, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.01em", color: CP.textPrimary }}>{title}</h1>
          {subtitle && <p className="ds-sub" style={{ fontSize: 14, color: CP.textSecondary, margin: 0, maxWidth: 760, lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </header>
  );
}

/** Il numero che risponde alla domanda della pagina, col suo confronto. */
export function HeroMetric({ label, value, compare, hint, children, footer }) {
  const [st] = useStyle();
  return (
    <section className="ds-hero" style={{ ...card, padding: "20px 22px", marginBottom: 14, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ minWidth: 220 }}>
        <div className="ds-lbl" style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
        <div className="ds-hero-v" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: CP.textPrimary, ...NUM }}>{st === "v3" ? <NumText value={value} count /> : value}</div>
        {compare && <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 4 }}>{compare}</div>}
        {hint && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
      {/* footer: a tutta larghezza sotto il numero (es. BandBar). Chi non lo passa resta identico */}
      {footer && <div style={{ flexBasis: "100%", minWidth: 0 }}>{footer}</div>}
    </section>
  );
}

/*
 * Numero tipografico v3: nei valori STRINGA riconosciuti i decimali (",4",
 * ",00") scendono a 0.55em — stesso colore negli score, --text-2 nella valuta —
 * e il simbolo di valuta sale all'altezza delle maiuscole, a 0.55em.
 * Gli importi abbreviati ("$1,83M", "$430k", "12 mila") restano tutti alla
 * stessa taglia: lì ",83" non è un decimale da rimpicciolire.
 * Formato non riconosciuto → la stringa com'è (mai indovinare).
 */
const NUM_RE = /^([+\-−]?)\s?([$€£])?\s?(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?(\s?%)?$/;
const ABBR_RE = /\d\s?(k|K|M|B|mln|Mln|mld|Mld|mila)\.?$/;
export function parseDisplayNumber(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || ABBR_RE.test(s)) return null;
  const m = NUM_RE.exec(s);
  if (!m) return null;
  const [, sign, sym, int, dec, pct] = m;
  if (!dec && !sym) return null; // niente da comporre
  return { sign: sign || "", sym: sym || "", int, dec: dec || "", pct: pct || "", money: Boolean(sym) };
}
/** Stile Casa: il numero protagonista conta fino al valore (1,4s), una volta per montaggio. */
function useCount(intStr, on) {
  const target = on && intStr ? Number(String(intStr).replace(/\./g, "")) : null;
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (target == null || !Number.isFinite(target) || target > 1e12) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const q = Math.min(1, (now - t0) / 1400);
      setShown(Math.round(target * (1 - Math.pow(1 - q, 3))));
      if (q < 1) raf = requestAnimationFrame(tick); else setShown(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown == null ? intStr : String(shown).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function NumText({ value, count = false }) {
  const p = parseDisplayNumber(value);
  const int = useCount(p?.int, count && Boolean(p));
  if (!p) return value ?? null;
  const tone = p.money ? CP.textSecondary : "inherit";
  return (
    <>
      {p.sign}
      {/* vertical-align .57em (della taglia piccola) ≈ cima del simbolo all'altezza delle maiuscole */}
      {p.sym && <span style={{ fontSize: "0.55em", verticalAlign: "0.57em", letterSpacing: 0, marginRight: "0.04em", color: tone }}>{p.sym}</span>}
      {int}
      {p.dec && <span style={{ fontSize: "0.55em", letterSpacing: "-0.02em", color: tone }}>{p.dec}{p.pct}</span>}
      {!p.dec && p.pct}
    </>
  );
}

/** Segnale d'attenzione su PERSONE (cella sotto soglia, calo): mai rosso in Couture → colore attn + sottolineato puntinato. */
export const ATTN = { color: CP.attn, fontWeight: 600, textDecoration: "underline dotted", textUnderlineOffset: 3 };

export function Metric({ label, value, delta, note, danger, attn }) {
  const [st] = useStyle();
  return (
    <div style={{ minWidth: 130 }}>
      <div className="ds-lbl" style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div className="ds-metric-v" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.25, color: danger ? CP.accentRed : attn ? CP.attn : CP.textPrimary, ...NUM }}>{st === "v3" ? <NumText value={value} /> : value}</div>
      {(delta || note) && <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{[delta && `${delta} sul mese prima`, note].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}

export function FilterChip({ label, active, danger, attn, onClick, disabled, closable }) {
  return (
    <button className="ds-chip" onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 13, cursor: disabled ? "default" : "pointer", fontFamily: FONTS.body,
        border: `1px solid ${active ? CP.accent : danger ? CP.accentRed : attn ? CP.attn : CP.border}`,
        background: active ? CP.accentSoft : CP.surface,
        color: active ? CP.accentSoftText : danger ? CP.accentRed : attn ? CP.attn : disabled ? CP.textMuted : CP.textPrimary }}>
      {(danger || attn) && !active && <AlertTriangle size={13} />}{label}{closable && <X size={12} />}
    </button>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 10px", flexWrap: "wrap" }}>
      <h2 className="ds-sect" style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{children}</h2>
      {aside && <span style={{ fontSize: 13, color: CP.textMuted }}>{aside}</span>}
    </div>
  );
}

export function Disclosure({ open, onToggle, title, summary, icon, children }) {
  return (
    <section style={{ ...card, marginBottom: 14 }}>
      <button onClick={onToggle} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: CP.textPrimary, fontFamily: FONTS.body }}>
        {open ? <ChevronDown size={16} color={CP.textMuted} /> : <ChevronRight size={16} color={CP.textMuted} />}
        {icon && <span style={{ color: CP.textMuted, display: "inline-flex" }}>{icon}</span>}
        <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
        {!open && summary && <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{summary}</span>}
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </section>
  );
}

export function Notice({ children, danger }) {
  return (
    <div className="ds-notice" data-danger={danger ? "1" : undefined} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 14, borderRadius: 10, background: CP.surface, border: `1px solid ${CP.border}`, borderLeft: `3px solid ${danger ? CP.accentRed : CP.textMuted}`, fontSize: 13, lineHeight: 1.55, color: CP.textSecondary }}>
      <AlertTriangle size={15} color={danger ? CP.accentRed : CP.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

/**
 * Tabella ordinabile. columns: [{ key, label, align, render(row), sort(row) }]
 * Righe cliccabili con onRowClick; `selected(row)` evidenzia.
 */
export function DataTable({ columns, rows, defaultSort, onRowClick, selected, minWidth = 600, empty = "Nessun dato.", maxHeight, density }) {
  const [sort, setSort] = useState(defaultSort || null);
  // Navigazione da tastiera (solo con onRowClick): j/k o frecce spostano la riga
  // attiva, Invio la apre. Il focus sta sulla tabella (tabIndex 0); la riga
  // attiva è annunciata con aria-activedescendant. Visibile solo da tastiera.
  const [active, setActive] = useState(-1);
  const uid = useId().replace(/:/g, "");
  const rowId = (i) => `ds-r-${uid}-${i}`;
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sort || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (typeof x === "string" || typeof y === "string") return String(x ?? "").localeCompare(String(y ?? "")) * sort.dir;
      return ((x ?? -Infinity) - (y ?? -Infinity)) * sort.dir;
    });
  }, [rows, sort, columns]);
  const nav = Boolean(onRowClick) && sorted.length > 0;
  // righe cambiate (filtro/ordinamento) → la riga attiva resta dentro i limiti
  useEffect(() => { setActive((a) => (a >= sorted.length ? sorted.length - 1 : a)); }, [sorted.length]);
  const onKeyDown = (e) => {
    if (!nav || e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    let next = null;
    if (k === "j" || k === "ArrowDown") next = Math.min(sorted.length - 1, active + 1);
    else if (k === "k" || k === "ArrowUp") next = Math.max(0, active < 0 ? 0 : active - 1);
    else if (k === "Home") next = 0;
    else if (k === "End") next = sorted.length - 1;
    else if (k === "Enter" && active >= 0 && sorted[active]) { e.preventDefault(); onRowClick(sorted[active]); return; }
    if (next == null) return;
    e.preventDefault();
    setActive(next);
    document.getElementById(rowId(next))?.scrollIntoView({ block: "nearest" });
  };
  // Prima colonna "di testo" ferma quando la tabella scorre di lato (telefono):
  // resta visibile di chi è la riga. Salta una colonna di rango numerica (#).
  const stickyIdx = columns.findIndex((c) => c.align !== "right");
  const th = { position: "sticky", top: 0, zIndex: 1, padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted, whiteSpace: "nowrap", background: CP.surface, borderBottom: `1px solid ${CP.border}`, userSelect: "none" };
  return (
    // maxHeight: la tabella scorre dentro di sé e l'intestazione resta visibile
    <div className="ds-tbl-wrap" style={{ ...card, overflow: "auto", ...(maxHeight ? { maxHeight } : {}) }}>
      <table className="ds-tbl" data-density={density === "compact" ? "compact" : undefined}
        {...(nav ? { tabIndex: 0, role: "grid", onKeyDown, "aria-activedescendant": active >= 0 ? rowId(active) : undefined } : {})}
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth }}>
        <thead><tr>{columns.map((c, ci) => (
          <th key={c.key} style={{ ...th, textAlign: c.align || "left", cursor: c.sortable === false ? "default" : "pointer", ...(ci === stickyIdx ? { left: 0, zIndex: 2 } : {}) }}
            onClick={() => c.sortable !== false && setSort({ key: c.key, dir: sort?.key === c.key ? -sort.dir : (c.align === "right" ? -1 : 1) })}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{c.label}{sort?.key === c.key && (sort.dir < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
          </th>
        ))}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} style={{ padding: 16, color: CP.textMuted, fontSize: 13 }}>{empty}</td></tr>}
          {sorted.map((r, i) => {
            const sel = selected?.(r);
            return (
              <tr key={r.id ?? r.key ?? i} id={nav ? rowId(i) : undefined} className="ds-tr"
                data-sel={sel ? "1" : undefined} data-active={nav && i === active ? "1" : undefined} aria-selected={nav ? Boolean(sel) : undefined}
                onClick={onRowClick ? () => { if (nav) setActive(i); onRowClick(r); } : undefined}
                style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: onRowClick ? "pointer" : "default", background: sel ? CP.accentSoft : "transparent" }}>
                {columns.map((c, ci) => (
                  <td key={c.key} style={{ padding: "9px 12px", textAlign: c.align || "left", color: c.muted ? CP.textSecondary : CP.textPrimary, verticalAlign: "middle", ...(c.align === "right" ? NUM : {}), ...(ci === stickyIdx ? { position: "sticky", left: 0, zIndex: 1, background: sel ? CP.accentSoft : CP.surface } : {}) }}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Riga di "cosa guardare": icona severità, testo, azione. */
export function ActionRow({ severity = "info", title, detail, href, cta }) {
  const color = severity === "critical" ? CP.accentRed : severity === "warning" ? CP.accentSoftText : CP.textMuted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <div style={{ fontSize: 14, color: CP.textPrimary }}>{title}</div>
        {detail && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{detail}</div>}
      </div>
      {href && <Link href={href} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>{cta || "Apri"} →</Link>}
    </div>
  );
}

const fmt1 = (v) => Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

/**
 * Fasce 0-100 normalizzate: accetta [{label,min,max}] oppure soglie numeriche
 * [15,27,44,61,75] (nomi = TIER_ORDER se il conto torna). Restituisce segmenti
 * contigui {key, name, from, to} ordinati, con nome italiano da tierLabel.
 */
export function normalizeBands(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return [];
  let items;
  if (typeof tiers[0] === "number") {
    const th = [...tiers].filter((x) => Number.isFinite(x) && x > 0 && x < 100).sort((a, b) => a - b);
    const mins = [0, ...th];
    const names = mins.length === TIER_ORDER.length ? TIER_ORDER : mins.map((_, i) => `Fascia ${i + 1}`);
    items = mins.map((min, i) => ({ key: names[i], min }));
  } else {
    items = tiers.filter((t) => t && Number.isFinite(Number(t.min))).map((t) => ({ key: t.label, min: Number(t.min) })).sort((a, b) => a.min - b.min);
  }
  return items.map((t, i) => ({ key: t.key, name: tierLabel(t.key) || t.key, from: i === 0 ? 0 : t.min, to: i + 1 < items.length ? items[i + 1].min : 100 }))
    .filter((b) => b.to > b.from);
}

/**
 * Barra delle fasce: segmenti larghi quanto le fasce, il segmento corrente è più
 * alto e contornato; nomi solo per la fascia corrente e la successiva.
 * Neutra (CP.neu su CP.track): qui non esistono colori-giudizio.
 */
export function BandBar({ value, tiers, label = "Fascia", style }) {
  const bands = normalizeBands(tiers);
  const v = Number(value);
  if (!bands.length || !Number.isFinite(v)) return null;
  const x = Math.max(0, Math.min(100, v));
  let cur = bands.findIndex((b) => x >= b.from && x < b.to);
  if (cur < 0) cur = x >= 100 ? bands.length - 1 : 0;
  const nx = bands[cur + 1];
  const gap = nx ? Math.max(0.1, nx.from - x) : null;
  const valuetext = `${fmt1(x)}, fascia ${bands[cur].name}${nx ? `, mancano ${fmt1(gap)} punti a ${nx.name}` : ""}`;
  const cols = bands.map((b) => `${b.to - b.from}fr`).join(" ");
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={x} aria-valuetext={valuetext} style={{ marginTop: 14, ...style }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 3, height: 10, alignItems: "center" }}>
        {bands.map((b, i) => {
          const fill = i < cur ? 100 : i === cur ? ((x - b.from) / (b.to - b.from)) * 100 : 0;
          const isCur = i === cur;
          return (
            <span key={b.key + i} style={{ position: "relative", overflow: "hidden", height: isCur ? 10 : 6, borderRadius: isCur ? 4 : 3, background: CP.track, boxShadow: isCur ? `0 0 0 1.5px ${CP.textPrimary}` : "none" }}>
              <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill.toFixed(1)}%`, background: isCur ? CP.textPrimary : CP.neu }} />
            </span>
          );
        })}
      </div>
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: cols, gap: 3, marginTop: 8, fontSize: 12, color: CP.textMuted }}>
        {bands.map((b, i) => {
          const show = i === cur || i === cur + 1;
          // le ultime due fasce sono strette: nome allineato a destra, deborda verso sinistra
          const right = i >= bands.length - 2;
          return (
            <span key={b.key + i} style={{ whiteSpace: "nowrap", overflow: "visible", textAlign: right ? "right" : "left", direction: right ? "rtl" : "ltr", color: i === cur ? CP.textPrimary : CP.textMuted, fontWeight: i === cur ? 500 : 400 }}>
              {show ? b.name : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Andamento 0-100 di UN solo score. SVG per linee/aree, testo in HTML (≥12px).
 *   points     = [{ label, value | null }]  (null = mese non lavorato: buco etichettato)
 *   thresholds = [{ label, min }]           (soglie delle fasce, riferimenti a destra)
 * Su schermi <520px restano solo le soglie subito sopra e subito sotto il valore
 * attuale. Area riempita perché la scala parte da 0. Tabella sr-only coi valori.
 */
export function ScoreChart({ points = [], thresholds = [], height = 160, caption = "Andamento dello score", gapLabel = "non lavorato" }) {
  const n = points.length;
  if (!n) return null;
  const W = 1000, H = 100;
  const xp = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const yp = (v) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const valid = (v) => v != null && Number.isFinite(Number(v));
  let last = -1;
  points.forEach((p, i) => { if (valid(p.value)) last = i; });
  const lastV = last >= 0 ? Number(points[last].value) : null;
  const ths = thresholds.filter((t) => Number.isFinite(Number(t.min)) && t.min > 0 && t.min < 100).map((t) => ({ ...t, min: Number(t.min) })).sort((a, b) => a.min - b.min);
  const below = lastV == null ? null : [...ths].reverse().find((t) => t.min <= lastV);
  const above = lastV == null ? null : ths.find((t) => t.min > lastV);
  // segmenti contigui di valori: il buco interrompe linea E area
  const segs = []; let cur = [];
  points.forEach((p, i) => { if (valid(p.value)) cur.push([xp(i), yp(Number(p.value))]); else { if (cur.length) segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const d = (sg) => sg.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const pct = (v, tot) => `${(v / tot) * 100}%`;
  return (
    <div className="ds-sc" style={{ position: "relative" }}>
      <div role="img" aria-label={`${caption}${lastV != null ? `: ultimo valore ${fmt1(lastV)}` : ""}`}>
        <div style={{ position: "relative", height, marginRight: ths.length ? 92 : 0, marginTop: 22 }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            {ths.map((t) => (
              <line key={t.label + t.min} x1="0" x2={W} y1={yp(t.min)} y2={yp(t.min)} stroke={CP.ruleData} strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke"
                className={t === below || t === above ? undefined : "ds-sc-far"} />
            ))}
            <line x1="0" x2={W} y1={H} y2={H} stroke={CP.ruleData} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {segs.map((sg, i) => (
              <g key={i}>
                {sg.length > 1 && <path d={`${d(sg)} L${sg[sg.length - 1][0]} ${H} L${sg[0][0]} ${H} Z`} fill={alpha(CP.textPrimary, "12")} stroke="none" />}
                <path d={d(sg)} fill="none" stroke={CP.textPrimary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
          {/* soglie delle fasce, etichettate a destra */}
          {ths.map((t) => (
            <span key={t.label + t.min} className={t === below || t === above ? undefined : "ds-sc-far"}
              style={{ position: "absolute", left: "calc(100% + 10px)", top: pct(yp(t.min), H), transform: "translateY(-50%)", fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {t.label} {t.min}
            </span>
          ))}
          {/* punti; l'ultimo pieno con l'etichetta del valore */}
          {points.map((p, i) => valid(p.value) && (
            <span key={i} style={{ position: "absolute", left: pct(xp(i), W), top: pct(yp(Number(p.value)), H),
              width: i === last ? 11 : 8, height: i === last ? 11 : 8, margin: i === last ? "-5.5px 0 0 -5.5px" : "-4px 0 0 -4px", borderRadius: "50%",
              background: i === last ? CP.textPrimary : CP.surface, boxShadow: i === last ? `0 0 0 3px ${CP.surface}` : `0 0 0 2px ${CP.textPrimary}` }} />
          ))}
          {lastV != null && (
            <span style={{ position: "absolute", left: pct(xp(last), W), top: pct(yp(lastV), H), transform: `translate(${last === n - 1 && n > 1 ? "-100%" : "-50%"}, -150%)`, fontSize: 13, fontWeight: 500, color: CP.textPrimary, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {fmt1(lastV)}
            </span>
          )}
          {/* buchi: mese senza dati, nessuna area, solo l'etichetta */}
          {points.map((p, i) => !valid(p.value) && (
            <span key={`g${i}`} style={{ position: "absolute", left: pct(xp(i), W), bottom: 4, transform: `translateX(${i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})`, fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap" }}>
              {gapLabel}
            </span>
          ))}
        </div>
        <div aria-hidden="true" style={{ position: "relative", height: 18, marginTop: 8, marginRight: ths.length ? 92 : 0, fontSize: 12, color: CP.textMuted }}>
          {points.map((p, i) => (
            <span key={i} className={n > 6 && i % 2 === 1 && i !== n - 1 ? "ds-sc-far" : undefined} style={{ position: "absolute", top: 0, left: pct(xp(i), W), whiteSpace: "nowrap", transform: `translateX(${n === 1 ? "-50%" : i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})` }}>{p.label}</span>
          ))}
        </div>
      </div>
      <table style={SR_ONLY}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Mese</th><th scope="col">Score</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{valid(p.value) ? fmt1(p.value) : gapLabel}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export { NUM, alpha };
