"use client";

// Grafici SVG minimi per Laura Chat Monitor (niente librerie: pochi punti, tema via CP).

import { useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { NUM } from "@/components/ds";

const W = 640;

export function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textSecondary, marginBottom: 6 }}>
      {items.map((it) => (
        <span key={it.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: it.line ? 2 : 10, borderRadius: 2, background: it.color, display: "inline-block", borderTop: it.dashed ? `2px dashed ${it.color}` : undefined }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

function scaleY(vals, { log = false, min0 = true, max: forcedMax } = {}) {
  const v = vals.filter((x) => x != null && Number.isFinite(x));
  let lo = min0 ? 0 : Math.min(...v, Infinity);
  let hi = forcedMax ?? Math.max(...v, 0);
  if (!Number.isFinite(lo)) lo = 0;
  if (log) {
    lo = Math.max(0.1, Math.min(...v.filter((x) => x > 0), 1));
    hi = Math.max(hi, lo * 10);
    const L = (x) => Math.log10(Math.max(lo, x));
    return { f: (x, H, top) => top + (H - top) * (1 - (L(x) - L(lo)) / (L(hi) - L(lo) || 1)), ticks: [lo, Math.sqrt(lo * hi), hi] };
  }
  if (hi === lo) hi = lo + 1;
  hi *= 1.08;
  return { f: (x, H, top) => top + (H - top) * (1 - (x - lo) / (hi - lo)), ticks: [lo, (lo + hi) / 2, hi] };
}

/** Linee multiple su asse x categoriale. series: [{name,color,values:[number|null], dashed}] */
export function LineChart({ labels, series, height = 180, yFmt = (v) => v, thresholds = [], log = false, max }) {
  const [hover, setHover] = useState(null);
  const H = height, padL = 46, padR = 10, top = 8, bottom = 22;
  const all = series.flatMap((s) => s.values).concat(thresholds.map((t) => t.y));
  const sy = scaleY(all, { log, max });
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, labels.length - 1);
  const y = (v) => sy.f(v, H - bottom, top);
  const every = Math.ceil(labels.length / 6);
  return (
    <div style={{ position: "relative" }}>
      {hover != null && (
        <div style={{ position: "absolute", right: 4, top: -2, fontSize: 11.5, color: CP.textSecondary, background: CP.surface, padding: "1px 6px", borderRadius: 6, border: `1px solid ${CP.border}`, ...NUM }}>
          {labels[hover]}: {series.map((s) => `${s.name} ${s.values[hover] == null ? "—" : yFmt(s.values[hover])}`).join(" · ")}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {sy.ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={CP.borderSoft} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill={CP.textMuted}>{yFmt(t)}</text>
          </g>
        ))}
        {thresholds.map((t, i) => (
          <g key={`t${i}`}>
            <line x1={padL} x2={W - padR} y1={y(t.y)} y2={y(t.y)} stroke={t.color} strokeDasharray="4 4" strokeWidth="1.2" />
            {t.label && <text x={W - padR} y={y(t.y) - 3} textAnchor="end" fontSize="10" fill={t.color}>{t.label}</text>}
          </g>
        ))}
        {series.map((s) => {
          let d = "", pen = false;
          s.values.forEach((v, i) => {
            if (v == null || !Number.isFinite(v)) { pen = false; return; }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
            pen = true;
          });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />;
        })}
        {labels.map((l, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - (W - padL) / labels.length / 2} y={top} width={(W - padL) / labels.length} height={H - top - bottom} fill="transparent" />
            {(i % every === 0 || i === labels.length - 1) && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill={CP.textMuted}>{l}</text>}
            {hover === i && series.map((s) => s.values[i] != null && <circle key={s.name} cx={x(i)} cy={y(s.values[i])} r="3" fill={s.color} />)}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Barre impilate (+ linea opzionale su asse destro 0..lineMax). stacks: [{name,color,values}] */
export function StackBars({ labels, stacks, height = 190, yFmt = (v) => v, line, lineMax, lineFmt = (v) => v }) {
  const [hover, setHover] = useState(null);
  const H = height, padL = 52, padR = line ? 40 : 10, top = 8, bottom = 22;
  const totals = labels.map((_, i) => stacks.reduce((a, s) => a + (s.values[i] || 0), 0));
  const sy = scaleY(totals);
  const y = (v) => sy.f(v, H - bottom, top);
  const bw = (W - padL - padR) / labels.length;
  const ly = (v) => top + (H - bottom - top) * (1 - v / (lineMax || 1));
  const every = Math.ceil(labels.length / 6);
  return (
    <div style={{ position: "relative" }}>
      {hover != null && (
        <div style={{ position: "absolute", right: 4, top: -2, fontSize: 11.5, color: CP.textSecondary, background: CP.surface, padding: "1px 6px", borderRadius: 6, border: `1px solid ${CP.border}`, ...NUM }}>
          {labels[hover]}: {stacks.map((s) => `${s.name} ${yFmt(s.values[hover] || 0)}`).join(" · ")}{line ? ` · ${line.name} ${line.values[hover] == null ? "—" : lineFmt(line.values[hover])}` : ""}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {sy.ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={CP.borderSoft} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill={CP.textMuted}>{yFmt(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - top - bottom} fill={hover === i ? alpha(CP.textMuted, "14") : "transparent"} />
              {stacks.map((s) => {
                const v = s.values[i] || 0;
                const y1 = y(acc + v), y0 = y(acc);
                acc += v;
                return <rect key={s.name} x={padL + i * bw + bw * 0.14} y={y1} width={bw * 0.72} height={Math.max(0, y0 - y1)} fill={s.color} />;
              })}
              {(i % every === 0 || i === labels.length - 1) && <text x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill={CP.textMuted}>{l}</text>}
            </g>
          );
        })}
        {line && (
          <>
            <path d={line.values.map((v, i) => (v == null ? "" : `${i && line.values[i - 1] != null ? "L" : "M"}${(padL + i * bw + bw / 2).toFixed(1)},${ly(v).toFixed(1)}`)).join(" ")} fill="none" stroke={line.color} strokeWidth="2" />
            {[0, lineMax / 2, lineMax].map((t, i) => <text key={i} x={W - padR + 4} y={ly(t) + 4} fontSize="10.5" fill={line.color}>{lineFmt(t)}</text>)}
          </>
        )}
      </svg>
    </div>
  );
}

/** Mappa 7×24 (righe Lun..Dom). cells: {[`${dow}-${hr}`]: number}; dow BigQuery 1=dom..7=sab. */
export function HeatGrid({ cells, fmt = (v) => v, colorFor, title }) {
  const days = [[2, "Lun"], [3, "Mar"], [4, "Mer"], [5, "Gio"], [6, "Ven"], [7, "Sab"], [1, "Dom"]];
  const vals = Object.values(cells).filter((v) => v != null);
  const max = Math.max(...vals, 1);
  return (
    <div style={{ overflowX: "auto" }}>
      {title && <div style={{ fontSize: 12, color: CP.textSecondary, marginBottom: 6 }}>{title}</div>}
      <table style={{ borderCollapse: "separate", borderSpacing: 2, fontSize: 10.5, ...NUM }}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => <th key={h} style={{ color: CP.textMuted, fontWeight: 400, width: 26 }}>{h % 3 === 0 ? h : ""}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map(([dow, label]) => (
            <tr key={dow}>
              <td style={{ color: CP.textSecondary, paddingRight: 6 }}>{label}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const v = cells[`${dow}-${h}`];
                const c = colorFor ? colorFor(v, max) : null;
                return (
                  <td key={h} title={`${label} ${h}:00 — ${v == null ? "nessun dato" : fmt(v)}`}
                    style={{ width: 26, height: 22, textAlign: "center", borderRadius: 3, background: c?.bg || CP.surfaceAlt, color: c?.fg || CP.textSecondary }}>
                    {v == null ? "" : fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
