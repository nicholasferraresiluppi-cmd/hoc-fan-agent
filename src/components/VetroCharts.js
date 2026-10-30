"use client";

// Grafici dello stile vetro (26/10/2026, Nicholas sulla prova «vetro bianco e blu»: «i widget, i grafici,
// come era esposta la roba»). Disegnati in SVG senza librerie, misurati sulla larghezza vera del riquadro
// (le scritte restano nitide). Colori delle serie = variabili --vt-c* di VetroScope, in ordine fisso
// (validate_palette: separazione per daltonici e contrasto ok); «Altre» in grigio. Le scritte usano
// sempre i colori del testo, mai quelli delle serie. Ogni grafico ha la sua lettura in parole
// (aria-label) e i numeri accanto: il colore non è mai l'unico modo di capire.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CP, alpha } from "@/lib/brand";

const NUM = { fontVariantNumeric: "tabular-nums" };
const group = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const usd = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${v < 0 ? "−" : ""}$${group(Number(v))}`);
const usdShort = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(".", ",")}M` : v >= 1e3 ? `$${v < 1e4 && v % 1e3 ? (v / 1e3).toFixed(1).replace(".", ",") : Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
export const SERIES = ["var(--vt-c0)", "var(--vt-c1)", "var(--vt-c2)", "var(--vt-c3)", "var(--vt-c4)"];
export const OTHER = "var(--vt-cx)";

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const cumulate = (arr, n) => {
  let a = 0;
  return arr.slice(0, n).map((v) => (a += Number(v) || 0));
};
const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= v);
  return m * p;
};

/**
 * Il mese che sale: venduto cumulato giorno per giorno (linea piena con l'area), il mese prima
 * (tratteggiata) e, se c'è, il ritmo del traguardo (retta da 0 al traguardo, tratteggiata).
 * cur/prev = venduto di ogni giorno (indice 0 = giorno 1); upto = giorni del mese in corso da disegnare.
 */
export function MonthArea({ cur = [], prev = [], days = 30, prevDays = 30, upto, goal = null, curLabel = "Questo mese", prevLabel = "Mese prima", height = 220 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const n = Math.max(1, Math.min(upto ?? cur.length, days));
  const c = cumulate(cur, n);
  const p = cumulate(prev, prevDays);
  const max = niceMax(Math.max(c[c.length - 1] || 0, p[p.length - 1] || 0, goal || 0));
  const padL = 46, padR = 12, padT = 12, padB = 26;
  const iw = Math.max(10, w - padL - padR), ih = height - padT - padB;
  const X = (i) => padL + (days > 1 ? (i / (days - 1)) * iw : 0);
  const Y = (v) => padT + ih - (v / max) * ih;
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const area = c.length ? `${line(c)}L${X(c.length - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z` : "";
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const xt = [1, 8, 15, 22, days].filter((d, i, a) => d <= days && a.indexOf(d) === i);
  const last = c[c.length - 1] || 0;
  const prevSame = p[Math.min(n, p.length) - 1];
  const summary = `${curLabel}: ${usd(last)} in ${n} giorni${prevSame != null ? `; ${prevLabel} negli stessi giorni ${usd(prevSame)}` : ""}${goal ? `; traguardo ${usd(goal)}` : ""}.`;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / iw) * (days - 1));
    setHover(i >= 0 && i < days ? i : null);
  };
  const h = hover;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={summary} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }}>
          <defs>
            <linearGradient id="vt-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--vt-c0)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--vt-c0)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={CP.borderSoft} strokeWidth="1" />
              <text x={padL - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill={CP.textMuted} style={NUM}>{usdShort(t)}</text>
            </g>
          ))}
          {xt.map((d) => <text key={d} x={d === days ? X(d - 1) + 4 : X(d - 1)} y={height - 8} textAnchor={d === days ? "end" : "middle"} fontSize="11" fill={CP.textMuted} style={NUM}>{d}</text>)}
          {goal ? <line x1={X(0)} y1={Y(0)} x2={X(days - 1)} y2={Y(goal)} stroke={CP.textMuted} strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" /> : null}
          {p.length > 1 && <path d={line(p.slice(0, days))} fill="none" stroke={CP.textMuted} strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" opacity="0.7" />}
          {area && <path d={area} fill="url(#vt-area)" />}
          {c.length > 1 && <path d={line(c)} fill="none" stroke="var(--vt-c0)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
          {c.length > 0 && <circle cx={X(c.length - 1)} cy={Y(last)} r="5" fill="var(--vt-c0)" stroke={CP.panel} strokeWidth="2" />}
          {h != null && (
            <g>
              <line x1={X(h)} x2={X(h)} y1={padT} y2={padT + ih} stroke={CP.borderStrong} strokeWidth="1" />
              {c[h] != null && <circle cx={X(h)} cy={Y(c[h])} r="5" fill="var(--vt-c0)" stroke={CP.panel} strokeWidth="2" />}
              {p[h] != null && <circle cx={X(h)} cy={Y(p[h])} r="4" fill={CP.textMuted} stroke={CP.panel} strokeWidth="2" />}
            </g>
          )}
        </svg>
      )}
      {h != null && w > 0 && (
        <div style={{ position: "absolute", top: 6, left: Math.min(Math.max(X(h) - 90, 0), w - 180), width: 180, pointerEvents: "none", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "8px 10px", fontSize: 12, color: CP.textSecondary, boxShadow: "0 8px 24px rgba(20,30,60,.14)", ...NUM }}>
          <div style={{ color: CP.textPrimary, fontWeight: 600, marginBottom: 2 }}>Fino al giorno {h + 1}</div>
          {c[h] != null && <div>{curLabel}: <b style={{ color: CP.textPrimary }}>{usd(c[h])}</b></div>}
          {p[h] != null && <div>{prevLabel}: {usd(p[h])}</div>}
          {goal ? <div>Ritmo del traguardo: {usd((goal * (h + 1)) / days)}</div> : null}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textSecondary, marginTop: 6 }}>
        <Key swatch={<span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--vt-c0)" }} />}>{curLabel}</Key>
        {p.length > 1 && <Key swatch={<span style={{ width: 14, borderTop: `2px dashed ${CP.textMuted}` }} />}>{prevLabel}</Key>}
        {goal ? <Key swatch={<span style={{ width: 14, borderTop: `2px dotted ${CP.textMuted}` }} />}>Ritmo del traguardo</Key> : null}
      </div>
    </div>
  );
}

const Key = ({ swatch, children }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{swatch}{children}</span>;

/** Ciambella con legenda a numeri: items [{ label, value }] già in ordine; oltre `limit` voci → «Altre». `format` per i numeri della legenda (di base dollari). */
export function Donut({ items = [], center, centerSub, size = 156, format = usd, limit = 5 }) {
  const top = items.slice(0, limit);
  const rest = items.slice(limit).reduce((a, x) => a + (Number(x.value) || 0), 0);
  const all = [...top.map((x, i) => ({ ...x, color: x.color || SERIES[i] || OTHER })), ...(rest > 0 ? [{ label: `Altre ${items.length - limit}`, value: rest, color: OTHER }] : [])];
  const tot = all.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const r = size / 2 - 12, C = 2 * Math.PI * r, gap = all.length > 1 ? 3 : 0;
  let off = 0;
  const label = all.map((x) => `${x.label} ${tot ? Math.round((x.value / tot) * 100) : 0}%`).join(", ");
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={label} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CP.track} strokeWidth="18" />
          {tot > 0 && all.map((x) => {
            const len = (x.value / tot) * C;
            const el = <circle key={x.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.color} strokeWidth="18"
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: CP.textPrimary, ...NUM }}>{center}</div>
          {centerSub && <div style={{ fontSize: 11, color: CP.textMuted }}>{centerSub}</div>}
        </div>
      </div>
      <div style={{ display: "grid", gap: 7, flex: 1, minWidth: 200 }}>
        {all.map((x) => (
          <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textSecondary, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
            <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{format(x.value)}</span>
            <span style={{ width: 36, textAlign: "right", color: CP.textMuted, ...NUM }}>{tot ? Math.round((x.value / tot) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mini grafico del venduto giorno per giorno (decorazione accanto a un numero: aria-hidden). */
export function Spark({ data = [], height = 36, color = "var(--vt-c0)" }) {
  const [ref, w] = useWidth();
  const vals = data.map((v) => Number(v) || 0);
  const max = Math.max(1, ...vals);
  const X = (i) => (vals.length > 1 ? (i / (vals.length - 1)) * w : 0);
  const Y = (v) => height - 3 - (v / max) * (height - 6);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <div ref={ref} aria-hidden="true" style={{ width: "100%", height }}>
      {w > 0 && vals.length > 1 && (
        <svg width={w} height={height} style={{ display: "block" }}>
          <path d={`${d}L${w},${height}L0,${height}Z`} fill={color} opacity="0.14" />
          <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

/** Riquadro numero: tessera con l'icona, etichetta, numero grande, riga sotto, mini grafico facoltativo. */
export function KpiCard({ icon: Icon, tone = 0, label, value, sub, spark, i = 0 }) {
  return (
    <div className="vt-glass" style={{ "--vt-i": i, borderRadius: 22, padding: 18, display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {Icon && <span className="vt-ico" data-tone={tone} style={{ display: "inline-flex" }}><Icon size={17} strokeWidth={1.9} /></span>}
        <span style={{ fontSize: 13, color: CP.textSecondary }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: CP.textPrimary, ...NUM }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.4 }}>{sub}</div>}
      {spark}
    </div>
  );
}

// ─── Widget scelti sulla domanda della pagina (26/10/2026, Nicholas: «le stai facendo tutte uguali»,
// poi «per ogni pagina capiscine l'utilità») — dai reel: anelli dei traguardi (Savings & Goals),
// arco della quota (Team quota), barra del mix (Stage mix), classifica a barre. ─────────────────────────

const pctTxt = (v) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
const arcPath = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

/**
 * Arco della quota (tre quarti di cerchio): quanto del traguardo è fatto (`value`, 0-1, oltre 1 resta pieno),
 * con la tacca del ritmo ideale (`mark`, 0-1) e, se c'è, la proiezione a fine mese (`proj`, puntino vuoto).
 * Verde se `good`, altrimenti accento. Il numero al centro è la percentuale; `children` va sotto.
 */
export function Gauge({ value, mark, proj, good = false, size = 176, center, centerSub, label }) {
  const sw = 14, r = size / 2 - sw, cx = size / 2, cy = size / 2;
  const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
  const at = (f) => a0 + span * Math.max(0, Math.min(1, f));
  const col = good ? CP.accentGreen : "var(--vt-c0)";
  const tick = (f, len = 9) => {
    const a = at(f), c = Math.cos(a), s = Math.sin(a);
    return { x1: cx + (r - len) * c, y1: cy + (r - len) * s, x2: cx + (r + len) * c, y2: cy + (r + len) * s };
  };
  const v = Number.isFinite(value) ? value : 0;
  const read = [label, `fatto ${pctTxt(value)}`, mark != null && `ritmo ideale ${pctTxt(mark)}`, proj != null && `arrivo previsto ${pctTxt(proj)}`].filter(Boolean).join(", ");
  return (
    <div style={{ position: "relative", width: size, height: size * 0.86, flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={read} style={{ display: "block" }}>
        <path d={arcPath(cx, cy, r, a0, a0 + span)} fill="none" stroke={CP.track} strokeWidth={sw} strokeLinecap="round" />
        {v > 0 && <path d={arcPath(cx, cy, r, a0, at(v) + 0.0001)} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />}
        {proj != null && Number.isFinite(proj) && (() => { const a = at(proj); return <circle cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={sw / 2 - 1.5} fill={CP.panel} stroke={col} strokeWidth="2.5" />; })()}
        {mark != null && Number.isFinite(mark) && <line {...tick(mark)} stroke={CP.textPrimary} strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: size > 150 ? 32 : 22, fontWeight: 600, letterSpacing: "-0.02em", color: CP.textPrimary, ...NUM }}>{center ?? pctTxt(value)}</div>
        {centerSub && <div style={{ fontSize: 11.5, color: CP.textMuted, maxWidth: size * 0.6, lineHeight: 1.3 }}>{centerSub}</div>}
      </div>
    </div>
  );
}

/** Legenda dell'arco: le tre cose che l'arco disegna, in parole. */
export function GaugeKey({ proj = true, mark = true, good = false }) {
  const col = good ? CP.accentGreen : "var(--vt-c0)";
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: CP.textMuted }}>
      <Key swatch={<span style={{ width: 12, height: 5, borderRadius: 3, background: col }} />}>fatto</Key>
      {mark && <Key swatch={<span style={{ width: 2.5, height: 11, borderRadius: 1, background: CP.textPrimary }} />}>dove dovresti essere oggi</Key>}
      {proj && <Key swatch={<span style={{ width: 9, height: 9, borderRadius: 9, border: `2px solid ${col}`, background: CP.panel }} />}>arrivo previsto</Key>}
    </div>
  );
}

/**
 * Un anello per traguardo (come «Savings & Goals» del reel 1): percentuale fatta, tacca del ritmo ideale,
 * nome e una riga sotto. `tone`: "good" (verde, ci arriva), "near" (accento pieno), altrimenti accento tenue.
 */
export function GoalRing({ pct, mark, title, sub, badge, tone, size = 92, onClick, href, i = 0, highlight = false }) {
  const sw = 9, r = size / 2 - sw, C = 2 * Math.PI * r;
  const v = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0;
  const col = tone === "good" ? CP.accentGreen : "var(--vt-c0)";
  const markA = mark != null && Number.isFinite(mark) ? -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, mark)) : null;
  const Tag = href ? "a" : onClick ? "button" : "div";
  return (
    <Tag href={href} onClick={onClick} className="vt-glass" data-lvl={tone === "good" ? 0 : undefined}
      style={{ "--vt-i": i, all: Tag === "button" ? "unset" : undefined, boxSizing: "border-box", borderRadius: 20, padding: "14px 12px 12px", display: "grid", justifyItems: "center", gap: 8, textAlign: "center", minWidth: 0, cursor: href || onClick ? "pointer" : "default", textDecoration: "none", color: CP.textPrimary, outline: highlight ? `2px solid ${CP.accent}` : undefined, outlineOffset: highlight ? -2 : undefined }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CP.track} strokeWidth={sw} />
          {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={`${v * C} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} opacity={tone === "good" || tone === "near" ? 1 : 0.75} />}
          {markA != null && <line x1={size / 2 + (r - 7) * Math.cos(markA)} y1={size / 2 + (r - 7) * Math.sin(markA)} x2={size / 2 + (r + 7) * Math.cos(markA)} y2={size / 2 + (r + 7) * Math.sin(markA)} stroke={CP.textPrimary} strokeWidth="2.2" strokeLinecap="round" />}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, color: CP.textPrimary, ...NUM }}>{pctTxt(pct)}</div>
      </div>
      <div style={{ minWidth: 0, width: "100%" }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, ...NUM }}>{sub}</div>}
      </div>
      {badge}
    </Tag>
  );
}

/**
 * Barra del mix (come «Stage mix» del reel 3): una barra a pezzi, nell'ordine dato (per categorie che hanno
 * un ordine: fasce, fasi, paesi), con la legenda a numeri sotto. items [{ label, value, color? }].
 */
export function MixBar({ items = [], format = usd, height = 34 }) {
  const all = items.filter((x) => Number(x.value) > 0).map((x, i) => ({ ...x, color: x.color || SERIES[i] || OTHER }));
  const tot = all.reduce((a, x) => a + Number(x.value), 0);
  const read = all.map((x) => `${x.label} ${tot ? Math.round((x.value / tot) * 100) : 0}%`).join(", ");
  if (!tot) return null;
  return (
    <div>
      <div role="img" aria-label={read} style={{ display: "flex", gap: 4, height }}>
        {all.map((x) => (
          <div key={x.label} title={`${x.label}: ${format(x.value)}`} style={{ flex: `${x.value} 1 0`, minWidth: 6, borderRadius: 10, background: x.color }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "8px 16px", marginTop: 14 }}>
        {all.map((x) => (
          <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textSecondary, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
            <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{format(x.value)}</span>
            <span style={{ width: 34, textAlign: "right", color: CP.textMuted, ...NUM }}>{Math.round((x.value / tot) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Classifica a barre orizzontali (al posto di una ciambella con troppe fette): items [{ label, value, sub?, onClick? }]
 * già in ordine; la barra è la quota sul primo, a destra il numero e la quota sul totale. `good` = verde, `bad` = rosso.
 */
export function RankBars({ items = [], format = usd, limit = 8, total, mark, markLabel, valueWidth }) {
  const vw = valueWidth ?? (mark != null ? 60 : 124);
  const top = items.slice(0, limit);
  const rest = items.slice(limit).reduce((a, x) => a + (Number(x.value) || 0), 0);
  const tot = total ?? items.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const max = (Math.max(mark || 0, ...top.map((x) => Number(x.value) || 0)) || 1) * (mark != null ? 1.08 : 1);
  const row = (x, k, muted) => {
    const Tag = x.href ? Link : x.onClick ? "button" : "div";
    return (
      <Tag key={k} href={x.href} onClick={x.onClick} style={{ all: Tag === "button" ? "unset" : undefined, boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: `minmax(90px, 30%) 1fr ${vw}px`, alignItems: "center", gap: 10, fontSize: 13, color: CP.textSecondary, textDecoration: "none", cursor: x.href || x.onClick ? "pointer" : "default" }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CP.textPrimary }}>{x.label}</span>
        <span style={{ position: "relative", height: 12, borderRadius: 6, background: CP.track }}>
          <span style={{ display: "block", height: "100%", width: `${Math.max(2, (Number(x.value) / max) * 100)}%`, borderRadius: 6, background: muted ? OTHER : x.bad ? CP.accentRed : x.good ? CP.accentGreen : "var(--vt-c0)", opacity: muted ? 1 : 0.9 }} />
          {mark != null && <span aria-hidden="true" style={{ position: "absolute", left: `${(mark / max) * 100}%`, top: -3, bottom: -3, width: 2, borderRadius: 1, background: CP.textPrimary }} />}
        </span>
        <span style={{ ...NUM, whiteSpace: "nowrap", textAlign: "right" }}><b style={{ color: CP.textPrimary, fontWeight: 500 }}>{format(x.value)}</b>{tot && mark == null ? <span style={{ color: CP.textMuted }}> · {Math.round((x.value / tot) * 100)}%</span> : null}</span>
      </Tag>
    );
  };
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {top.map((x, i) => row(x, x.label + i))}
      {rest > 0 && mark == null && row({ label: `Altre ${items.length - limit}`, value: rest }, "rest", true)}
      {mark != null && markLabel && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: CP.textMuted, marginTop: 2 }}><span style={{ width: 2, height: 11, borderRadius: 1, background: CP.textPrimary }} />{markLabel}</div>}
    </div>
  );
}

/**
 * Colonne giorno per giorno (come «New customers per month» del reel 3): colonne scure, quella evidenziata
 * (`hi`, di base l'ultima) in colore pieno; `partial` la disegna tratteggiata (giorno in corso).
 * data = numeri; labels = etichette sotto (se mancano, 1..n e solo alcune). Lettura al passaggio.
 */
export function Bars({ data = [], labels, hi, partial = false, height = 150, format = (v) => String(Math.round(v)), unit = "" }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const vals = data.map((v) => Number(v) || 0);
  const n = vals.length;
  const max = niceMax(Math.max(1, ...vals));
  const padB = 20, padT = 8;
  const ih = height - padB - padT;
  const gap = n > 20 ? 3 : 6;
  const bw = n ? Math.max(2, (w - gap * (n - 1)) / n) : 0;
  const hiI = hi ?? n - 1;
  const lab = (i) => (labels ? labels[i] : String(i + 1));
  const showLab = (i) => (labels && n <= 12) || i === 0 || i === n - 1 || ((i + 1) % 7 === 1 && i < n - 3); // niente etichetta della settimana addosso all'ultima
  const read = `${n} colonne; ${lab(hiI)}: ${format(vals[hiI] || 0)}${unit}; massimo ${format(Math.max(0, ...vals))}${unit}`;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={read} style={{ display: "block" }} onPointerLeave={() => setHover(null)}>
          {vals.map((v, i) => {
            const h = Math.max(v > 0 ? 3 : 0, (v / max) * ih);
            const x = i * (bw + gap), yv = padT + ih - h;
            const isHi = i === hiI;
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={x} y={padT} width={bw} height={ih} fill="transparent" />
                <rect x={x} y={yv} width={bw} height={h} rx={Math.min(6, bw / 2)}
                  fill={isHi ? "var(--vt-c0)" : CP.textPrimary} opacity={isHi ? 1 : hover === i ? 0.75 : 0.55}
                  strokeDasharray={isHi && partial ? "3 3" : undefined} stroke={isHi && partial ? "var(--vt-c0)" : undefined} fillOpacity={isHi && partial ? 0.45 : 1} />
                {showLab(i) && <text x={i === n - 1 && n > 12 ? x + bw : i === 0 && n > 12 ? x : x + bw / 2} y={height - 5} textAnchor={i === n - 1 && n > 12 ? "end" : i === 0 && n > 12 ? "start" : "middle"} fontSize="10.5" fill={isHi ? CP.textPrimary : CP.textMuted} style={NUM}>{lab(i)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div style={{ position: "absolute", top: -4, left: Math.min(Math.max(hover * (bw + gap) - 50, 0), w - 120), width: 120, pointerEvents: "none", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "6px 9px", fontSize: 12, color: CP.textSecondary, boxShadow: "0 8px 24px rgba(20,30,60,.14)", ...NUM }}>
          <span style={{ color: CP.textPrimary, fontWeight: 600 }}>{lab(hover)}</span> · {format(vals[hover])}{unit}
        </div>
      )}
    </div>
  );
}

/* ─── Pezzi comuni delle pagine di lavoro (30/10/2026, gruppo Compensi) ────────────────────────────
 * Panel: un riquadro di vetro con titolo e riga di lettura. HotTile: scheda piena di colore per uno
 * stato (rosso = da guardare, inchiostro = da fare, verde = a posto, vetro = nessun giudizio), che
 * può aprire un filtro. CompareBars: due o tre valori dello stesso numero a barre (es. questo mese e
 * il mese prima). DeviationBars: scarto dalla media, a destra chi sta sopra e a sinistra chi sta
 * sotto, con le fasce di tolleranza. TargetStrip: dove cade un valore rispetto a una fascia obiettivo.
 * Il pulsante non usa «all: unset», che toglierebbe lo sfondo pieno delle schede `.vt-hot`. */
const BTN_RESET = { boxSizing: "border-box", cursor: "pointer", border: 0, margin: 0, font: "inherit", color: "inherit" };

export function Panel({ title, aside, children, i = 0, style }) {
  return (
    <section className="vt-glass" style={{ "--vt-i": i, borderRadius: 20, padding: "16px 18px", minWidth: 0, ...style }}>
      {(title || aside) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {title && <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{title}</h2>}
          {aside && <span style={{ fontSize: 12.5, color: CP.textMuted }}>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function HotTile({ label, value, sub, lvl, onClick, href, active, i = 0, children }) {
  const cls = lvl == null ? "vt-hot vt-glass" : "vt-hot";
  const style = { "--vt-i": i, textAlign: "left", outline: active ? `2px solid ${CP.textPrimary}` : "none", outlineOffset: 2, minWidth: 0 };
  const body = (
    <>
      <span style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: CP.textPrimary, ...NUM }}>{value}</span>
      {sub && <span style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.4 }}>{sub}</span>}
      {children}
    </>
  );
  if (href) return <Link href={href} className={cls} data-lvl={lvl ?? undefined} style={style}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} data-lvl={lvl ?? undefined} style={{ ...BTN_RESET, ...style }}>{body}</button>;
  return <div className={cls} data-lvl={lvl ?? undefined} style={style}>{body}</div>;
}

/** items [{ label, value, color? }]: la prima di solito è il periodo scelto. */
export function CompareBars({ items = [], format = (v) => String(v) }) {
  const all = items.filter((x) => x.value != null && Number.isFinite(Number(x.value)));
  const max = Math.max(...all.map((x) => Math.abs(Number(x.value))), 0) * 1.12 || 1;
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {all.map((x, k) => (
        <div key={x.label} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: CP.textSecondary, ...NUM }}>
            <span>{x.label}</span><b style={{ color: CP.textPrimary, fontWeight: 600 }}>{format(x.value)}</b>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: CP.track, overflow: "hidden" }}>
            <div style={{ width: `${(Math.abs(Number(x.value)) / max) * 100}%`, height: "100%", borderRadius: 6, background: x.color || (k === 0 ? "var(--vt-c0)" : OTHER) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Scarto dalla media: items [{ label, dev, value?, href?, onClick? }] con dev = (valore − media) ÷ media.
 * Fasce: entro `ok` in grigio, fino a `far` in accento, oltre in rosso. La scala è simmetrica.
 */
export function DeviationBars({ items = [], ok = 0.15, far = 0.35, format, limit = 12 }) {
  const top = items.slice(0, limit);
  const span = Math.max(far * 1.3, ...top.map((x) => Math.abs(x.dev || 0))) || 1;
  const pos = (d) => 50 + (Math.max(-span, Math.min(span, d)) / span) * 50;
  const col = (d) => (Math.abs(d) > far ? CP.accentRed : Math.abs(d) > ok ? "var(--vt-c0)" : OTHER);
  const sign = (d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) * 100)}%`;
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {top.map((x, k) => {
        const Tag = x.href ? Link : x.onClick ? "button" : "div";
        const d = x.dev || 0;
        return (
          <Tag key={x.label + k} href={x.href} onClick={x.onClick} type={Tag === "button" ? "button" : undefined}
            style={{ ...(Tag === "button" ? { ...BTN_RESET, background: "transparent" } : {}), width: "100%", display: "grid", gridTemplateColumns: "minmax(90px, 30%) 1fr 92px", alignItems: "center", gap: 10, fontSize: 13, color: CP.textSecondary, textDecoration: "none", textAlign: "left" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CP.textPrimary }}>{x.label}</span>
            <span style={{ position: "relative", height: 14, borderRadius: 7, background: CP.track }}>
              <span aria-hidden="true" style={{ position: "absolute", left: `${pos(-ok)}%`, right: `${100 - pos(ok)}%`, top: 0, bottom: 0, background: alpha(CP.textPrimary, "10") }} />
              <span style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 5, left: `${Math.min(50, pos(d))}%`, width: `${Math.max(1, Math.abs(pos(d) - 50))}%`, background: col(d) }} />
              <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, background: CP.textPrimary }} />
            </span>
            <span style={{ ...NUM, textAlign: "right", whiteSpace: "nowrap" }}><b style={{ color: CP.textPrimary, fontWeight: 500 }}>{sign(d)}</b>{format && x.value != null ? <span style={{ color: CP.textMuted }}> · {format(x.value)}</span> : null}</span>
          </Tag>
        );
      })}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: CP.textMuted, marginTop: 2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 2, height: 11, borderRadius: 1, background: CP.textPrimary }} />media</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 9, borderRadius: 3, background: alpha(CP.textPrimary, "10") }} />entro {Math.round(ok * 100)}%: in linea</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 9, borderRadius: 3, background: CP.accentRed }} />oltre {Math.round(far * 100)}%</span>
      </div>
    </div>
  );
}

/** items [{ label, value, sub? }] su una scala 0..max, con la fascia obiettivo [lo, hi] evidenziata. */
export function TargetStrip({ items = [], lo, hi, max, format = (v) => String(v), targetLabel }) {
  const m = max ?? Math.max(hi * 1.6, ...items.map((x) => x.value || 0)) * 1.05;
  const p = (v) => Math.max(0, Math.min(100, (v / m) * 100));
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {items.map((x, k) => {
        const inT = x.value != null && x.value >= lo && x.value <= hi;
        return (
          <div key={x.label + k} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 34%) 1fr 64px", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CP.textPrimary }} title={x.sub}>{x.label}</span>
            <span style={{ position: "relative", height: 14, borderRadius: 7, background: CP.track }}>
              <span aria-hidden="true" style={{ position: "absolute", left: `${p(lo)}%`, width: `${p(hi) - p(lo)}%`, top: 0, bottom: 0, background: alpha(CP.accentGreen, "30") }} />
              {x.value != null && <span style={{ position: "absolute", left: `${p(x.value)}%`, top: "50%", width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 999, background: inT ? CP.accentGreen : CP.accentRed, border: `2px solid ${CP.surface}` }} />}
            </span>
            <span style={{ ...NUM, textAlign: "right", color: inT ? CP.textPrimary : CP.accentRed, fontWeight: 500 }}>{x.value != null ? format(x.value) : "—"}</span>
          </div>
        );
      })}
      {targetLabel && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: CP.textMuted, marginTop: 2 }}><span style={{ width: 14, height: 9, borderRadius: 3, background: alpha(CP.accentGreen, "30") }} />{targetLabel}</div>}
    </div>
  );
}
