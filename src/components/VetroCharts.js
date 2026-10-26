"use client";

// Grafici dello stile vetro (26/10/2026, Nicholas sulla prova «vetro bianco e blu»: «i widget, i grafici,
// come era esposta la roba»). Disegnati in SVG senza librerie, misurati sulla larghezza vera del riquadro
// (le scritte restano nitide). Colori delle serie = variabili --vt-c* di VetroScope, in ordine fisso
// (validate_palette: separazione per daltonici e contrasto ok); «Altre» in grigio. Le scritte usano
// sempre i colori del testo, mai quelli delle serie. Ogni grafico ha la sua lettura in parole
// (aria-label) e i numeri accanto: il colore non è mai l'unico modo di capire.
import { useEffect, useRef, useState } from "react";
import { CP } from "@/lib/brand";

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
          {xt.map((d) => <text key={d} x={X(d - 1)} y={height - 8} textAnchor="middle" fontSize="11" fill={CP.textMuted} style={NUM}>{d}</text>)}
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

/** Ciambella con legenda a numeri: items [{ label, value }] già in ordine; oltre 5 voci → «Altre». */
export function Donut({ items = [], center, centerSub, size = 156 }) {
  const top = items.slice(0, 5);
  const rest = items.slice(5).reduce((a, x) => a + (Number(x.value) || 0), 0);
  const all = [...top.map((x, i) => ({ ...x, color: SERIES[i] })), ...(rest > 0 ? [{ label: `Altre ${items.length - 5}`, value: rest, color: OTHER }] : [])];
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
            <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{usd(x.value)}</span>
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
