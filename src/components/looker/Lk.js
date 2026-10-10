"use client";
/**
 * Blocchi del "Report Looker" (10/10/2026): gli stessi widget dei report Looker Studio
 * (tabella con totale e % Δ, linee per creator, ciambella, barre, riquadri numerici, menu filtro)
 * disegnati con i token di HOC Pro, così chi arriva da Looker ritrova la stessa disposizione.
 *
 * Regole: tutto ciò che si apre sopra la pagina usa CP.panel (pieno nei 4 stili, vedi
 * scripts/check-overlay-bg.mjs); i colori per creator vengono da CREATOR_DOT_PALETTE (funzionali).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Check, Download } from "lucide-react";
import { CP, FONTS, CREATOR_DOT_PALETTE } from "@/lib/brand";

/* ───────── formati (it-IT, migliaia sempre separate, come Looker in italiano) ───────── */
const nf = (d) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
export const fmt = {
  int: (v) => (v == null || !Number.isFinite(Number(v)) ? "null" : nf(0).format(Math.round(Number(v)))),
  num: (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "null" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: d, useGrouping: "always" }).format(Number(v))),
  money: (v) => (v == null || !Number.isFinite(Number(v)) ? "null" : `$${nf(2).format(Number(v))}`),
  money0: (v) => (v == null || !Number.isFinite(Number(v)) ? "null" : `$${nf(0).format(Math.round(Number(v)))}`),
  pct: (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "null" : `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: d }).format(Number(v) * 100)}%`),
  short: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    if (Math.abs(n) >= 1e6) return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n / 1e6)} Mln`;
    if (Math.abs(n) >= 1e3) return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n / 1e3)}K`;
    return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);
  },
  day: (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" }) : ""),
  dayFull: (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "null"),
  dt: (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) : "null"),
  month: (s) => (s ? new Date(`${String(s).slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "numeric", timeZone: "UTC" }) : "null"),
};

/** % Δ come Looker: "−8,6% ↓" rosso / "5,0% ↑" verde; null = "-". */
export function LkDelta({ v, d = 1 }) {
  if (v == null || !Number.isFinite(Number(v))) return <span style={{ color: CP.textMuted }}>-</span>;
  const n = Number(v);
  const up = n > 0;
  const c = up ? CP.accentGreen : n < 0 ? CP.accentRed : CP.textMuted;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontVariantNumeric: "tabular-nums", color: CP.textPrimary }}>
      {new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n * 100)}%
      {n !== 0 && (up ? <ArrowUp size={11} color={c} /> : <ArrowDown size={11} color={c} />)}
    </span>
  );
}

/* ───────── pagina e riquadro ───────── */
export const lkCard = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, minWidth: 0 };

export function LkPage({ title, description, filters, actions, children }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: CP.textPrimary, letterSpacing: "-0.01em" }}>{title}</h2>
          {description && <p style={{ margin: "6px 0 0", fontSize: 14, color: CP.textSecondary, lineHeight: 1.5, maxWidth: 820 }}>{description}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {filters && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>{filters}</div>}
      {children}
    </div>
  );
}

export function LkTitle({ children }) {
  return <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{children}</h3>;
}

/* ───────── menu a tendina (filtro come quelli di Looker) ───────── */
function useOutside(ref, on, open) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) on(); };
    const key = (e) => { if (e.key === "Escape") on(); };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [open]);
}

/** Menu a scelta multipla. options: [{value, label}], value: array (vuoto = tutti). */
export function LkSelect({ label, options, value = [], onChange, width = 220, search = true }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);
  useOutside(box, () => setOpen(false), open);
  const shown = useMemo(() => options.filter((o) => !q || String(o.label).toLowerCase().includes(q.toLowerCase())), [options, q]);
  const summary = !value.length ? label : value.length === 1 ? options.find((o) => o.value === value[0])?.label || label : `${label} (${value.length})`;
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div ref={box} style={{ position: "relative", width, maxWidth: "100%" }}>
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13,
          border: `1px solid ${open || value.length ? CP.accent : CP.border}`, background: CP.surface, color: value.length ? CP.textPrimary : CP.textSecondary }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <ChevronDown size={14} color={CP.textMuted} />
      </button>
      {open && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 70, width: Math.max(260, width), maxHeight: 360, display: "flex", flexDirection: "column",
          background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,.3)", overflow: "hidden" }}>
          {search && (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca"
              style={{ margin: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surfaceAlt, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" }} />
          )}
          <div style={{ display: "flex", gap: 8, padding: "0 12px 6px", fontSize: 12 }}>
            <button onClick={() => onChange([])} style={linkish}>Tutti</button>
            {value.length > 0 && <button onClick={() => onChange([])} style={linkish}>Azzera</button>}
          </div>
          <div style={{ overflowY: "auto", padding: "0 4px 6px" }}>
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <button key={o.value} role="option" aria-selected={on} onClick={() => toggle(o.value)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", border: "none", borderRadius: 6, background: on ? CP.accentSoft : "transparent", color: CP.textPrimary, cursor: "pointer", textAlign: "left", fontSize: 13, fontFamily: FONTS.body }}>
                  <span style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: 4, border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <Check size={12} color={CP.accentInk} />}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                </button>
              );
            })}
            {!shown.length && <div style={{ padding: 10, fontSize: 13, color: CP.textMuted }}>Nessun risultato</div>}
          </div>
        </div>
      )}
    </div>
  );
}
const linkish = { border: "none", background: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 12, fontFamily: FONTS.body };

/** Campo di testo per filtro (user_id, username): applica su Invio o all'uscita. */
export function LkInput({ label, value, onChange, width = 190 }) {
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  return (
    <label style={{ display: "grid", gap: 2, width, padding: "6px 12px", borderRadius: 8, border: `1px solid ${value ? CP.accent : CP.border}`, background: CP.surface }}>
      <span style={{ fontSize: 11, color: CP.textMuted }}>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || "") && onChange(v.trim())} onKeyDown={(e) => e.key === "Enter" && onChange(v.trim())}
        placeholder="Inserisci un valore" style={{ border: "none", outline: "none", background: "transparent", color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, padding: 0 }} />
    </label>
  );
}

/* ───────── tabella ───────── */
/**
 * columns: [{key, label, align?, render?(row), sort?: (row)=>value, heat?: true, width?}]
 * total: riga del totale (oggetto con le stesse chiavi) o null. pageSize come Looker (default 100).
 */
export function LkTable({ columns, rows, total, pageSize = 100, initialSort, numbered = false, maxHeight = 420, empty = "Nessun dato", name = "report" }) {
  const [sort, setSort] = useState(initialSort || null); // {key, dir}
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = col?.sort || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a); const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it");
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const slice = sorted.slice(page * pageSize, page * pageSize + pageSize);
  // colonne "heat": intensità rispetto al massimo della colonna (come la formattazione condizionale di Looker)
  const heatMax = useMemo(() => Object.fromEntries(columns.filter((c) => c.heat).map((c) => [c.key, Math.max(0, ...rows.map((r) => Number((c.sort || ((x) => x[c.key]))(r)) || 0))])), [columns, rows]);
  const cell = { padding: "7px 10px", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 13, color: CP.textPrimary, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const clickSort = (c) => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: c.key, dir: c.align === "right" ? "desc" : "asc" }));
  return (
    <div style={{ ...lkCard, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ overflow: "auto", maxHeight }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {numbered && <th style={{ ...cell, position: "sticky", top: 0, background: CP.panel, width: 32 }} />}
              {columns.map((c) => (
                <th key={c.key} onClick={() => clickSort(c)} style={{ ...cell, position: "sticky", top: 0, zIndex: 1, background: CP.panel, cursor: "pointer", fontWeight: 500, color: CP.textSecondary, textAlign: c.align || "left", width: c.width, whiteSpace: "normal", lineHeight: 1.25 }}>
                  {c.label}{sort?.key === c.key ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i}>
                {numbered && <td style={{ ...cell, color: CP.textMuted }}>{page * pageSize + i + 1}.</td>}
                {columns.map((c) => {
                  const raw = c.heat ? Number((c.sort || ((x) => x[c.key]))(r)) || 0 : 0;
                  const a = c.heat && heatMax[c.key] ? Math.min(1, raw / heatMax[c.key]) : 0;
                  const bg = c.cellBg ? c.cellBg(r) : c.heat ? `color-mix(in srgb, ${c.heatColor || CP.accent} ${Math.round(8 + a * 52)}%, transparent)` : null;
                  return (
                    <td key={c.key} style={{ ...cell, textAlign: c.align || "left", maxWidth: c.width || 280, overflow: "hidden", textOverflow: "ellipsis",
                      ...(bg ? { background: bg } : {}) }}>
                      {c.render ? c.render(r) : r[c.key] ?? "null"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={columns.length + (numbered ? 1 : 0)} style={{ ...cell, color: CP.textMuted, textAlign: "center", padding: 24 }}>{empty}</td></tr>}
          </tbody>
          {total && (
            <tfoot>
              <tr>
                {numbered && <td style={{ ...cell, position: "sticky", bottom: 0, background: CP.panel }} />}
                {columns.map((c, j) => (
                  <td key={c.key} style={{ ...cell, position: "sticky", bottom: 0, background: CP.panel, fontWeight: 500, textAlign: c.align || "left", borderTop: `1px solid ${CP.border}` }}>
                    {j === 0 ? "Totale complessivo" : total[c.key] === undefined || total[c.key] === "" ? "" : c.render ? c.render(total) : total[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "6px 10px", fontSize: 12, color: CP.textMuted, borderTop: `1px solid ${CP.borderSoft}` }}>
        {sorted.length > 0 && (
          <button onClick={() => downloadCsv(name, columns, sorted)} title="Scarica tutte le righe in CSV" style={{ ...pagerBtn(false), gap: 4, marginRight: "auto", fontSize: 12, fontFamily: FONTS.body }}>
            <Download size={13} /> CSV
          </button>
        )}
        {sorted.length ? `${page * pageSize + 1} - ${Math.min(sorted.length, (page + 1) * pageSize)} / ${fmt.int(sorted.length)}` : "0 / 0"}
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Pagina prima" style={pagerBtn(page === 0)}><ChevronLeft size={14} /></button>
        <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Pagina dopo" style={pagerBtn(page >= pages - 1)}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}
/** CSV di tutte le righe (non solo la pagina): valori grezzi, separatore ";" e decimali con la virgola per Excel in italiano. */
function downloadCsv(name, columns, rows) {
  const cell = (v) => {
    if (v == null) return "";
    const t = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = columns.map((c) => cell(typeof c.label === "string" ? c.label : c.key)).join(";");
  const body = rows.map((r) => columns.map((c) => cell(c.csv ? c.csv(r) : r[c.key])).join(";")).join("\n");
  const blob = new window.Blob([`\ufeff${head}\n${body}`], { type: "text/csv;charset=utf-8" });
  const a = window.document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  window.setTimeout(() => window.URL.revokeObjectURL(a.href), 1000);
}
const pagerBtn = (off) => ({ border: "none", background: "none", padding: 2, color: off ? CP.mutedIcons : CP.textSecondary, cursor: off ? "default" : "pointer", display: "inline-flex" });

/* ───────── grafici (SVG, niente librerie) ───────── */
export const seriesColor = (i) => CREATOR_DOT_PALETTE[i % CREATOR_DOT_PALETTE.length];

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
// curva morbida come Looker (Catmull-Rom → Bézier)
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function Legend({ items, max = 8 }) {
  const [off, setOff] = useState(0);
  const shown = items.slice(off, off + max);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", fontSize: 12, color: CP.textSecondary, minHeight: 20 }}>
      {shown.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 180, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          <span style={{ width: it.bar ? 10 : 14, height: it.bar ? 10 : 2, borderRadius: it.bar ? 2 : 1, background: it.color, flex: "0 0 auto" }} />{it.label}
        </span>
      ))}
      {items.length > max && (
        <span style={{ display: "inline-flex", gap: 2 }}>
          <button onClick={() => setOff(Math.max(0, off - max))} style={pagerBtn(off === 0)} aria-label="Legenda indietro"><ChevronLeft size={13} /></button>
          <button onClick={() => setOff(Math.min(items.length - 1, off + max))} style={pagerBtn(off + max >= items.length)} aria-label="Legenda avanti"><ChevronRight size={13} /></button>
        </span>
      )}
    </div>
  );
}

/**
 * Linee. x: array di etichette (es. giorni). series: [{label, values:[...], color?, axis?: "right"}].
 * xFmt formatta le etichette dell'asse; yFmt i valori.
 */
export function LkLine({ title, x, series, xFmt = (v) => v, yFmt = fmt.short, yFmtRight, height = 230, area = false, legend = true, refLine }) {
  const W = 640, H = height, L = 46, R = series.some((s) => s.axis === "right") ? 46 : 14, T = 12, B = 40;
  const maxL = niceMax(Math.max(0, ...series.filter((s) => s.axis !== "right").flatMap((s) => s.values.map(Number).filter(Number.isFinite))));
  const maxR = niceMax(Math.max(0, ...series.filter((s) => s.axis === "right").flatMap((s) => s.values.map(Number).filter(Number.isFinite))));
  const n = Math.max(1, x.length);
  const px = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const py = (v, right) => T + (H - T - B) * (1 - Number(v) / (right ? maxR : maxL));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.ceil(n / 12);
  const [hover, setHover] = useState(null);
  return (
    <div style={{ ...lkCard, padding: 12, display: "grid", gap: 6 }}>
      {title && <div style={{ fontSize: 13, color: CP.textSecondary }}>{title}</div>}
      {legend && <Legend items={series.map((s, i) => ({ label: s.label, color: s.color || seriesColor(i), bar: s.kind === "bar" }))} />}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={T + (H - T - B) * (1 - t)} y2={T + (H - T - B) * (1 - t)} stroke={CP.borderSoft} />
            <text x={L - 6} y={T + (H - T - B) * (1 - t) + 4} textAnchor="end" fontSize="10" fill={CP.textMuted}>{yFmt(maxL * t)}</text>
            {R > 14 && <text x={W - R + 6} y={T + (H - T - B) * (1 - t) + 4} fontSize="10" fill={CP.textMuted}>{(yFmtRight || yFmt)(maxR * t)}</text>}
          </g>
        ))}
        {refLine != null && <line x1={L} x2={W - R} y1={py(refLine.value)} y2={py(refLine.value)} stroke={CP.textMuted} strokeDasharray="6 4" />}
        {x.map((v, i) => (i % every === 0 || i === n - 1) && (
          <text key={i} x={px(i)} y={H - B + 16} textAnchor="end" fontSize="10" fill={CP.textMuted} transform={`rotate(-35 ${px(i)} ${H - B + 16})`}>{xFmt(v)}</text>
        ))}
        {series.map((s, si) => {
          const color = s.color || seriesColor(si);
          if (s.kind === "bar") {
            const bw = Math.max(3, ((W - L - R) / n) * 0.6);
            return (
              <g key={s.label}>
                {s.values.map((v, i) => Number.isFinite(Number(v)) && (
                  <rect key={i} x={px(i) - bw / 2} y={py(v, s.axis === "right")} width={bw} height={Math.max(0, H - B - py(v, s.axis === "right"))} fill={color} opacity={0.85} />
                ))}
              </g>
            );
          }
          const pts = s.values.map((v, i) => (Number.isFinite(Number(v)) ? [px(i), py(v, s.axis === "right")] : null)).filter(Boolean);
          return (
            <g key={s.label}>
              {area && pts.length > 1 && <path d={`${smooth(pts)} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`} fill={color} opacity={0.12} />}
              <path d={smooth(pts)} fill="none" stroke={color} strokeWidth={1.8} />
              {pts.length === 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r={3} fill={color} />}
            </g>
          );
        })}
        {x.map((v, i) => (
          <rect key={`h${i}`} x={px(i) - (W - L - R) / n / 2} y={T} width={(W - L - R) / n} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && <line x1={px(hover)} x2={px(hover)} y1={T} y2={H - B} stroke={CP.textMuted} strokeDasharray="3 3" />}
      </svg>
      {hover != null && (
        <div style={{ fontSize: 12, color: CP.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
          <span style={{ color: CP.textPrimary }}>{xFmt(x[hover])}</span>
          {series.slice(0, 8).map((s, si) => <span key={s.label}><span style={{ color: s.color || seriesColor(si) }}>●</span> {s.label}: {yFmt(s.values[hover])}</span>)}
        </div>
      )}
    </div>
  );
}

/** Barre verticali. items: [{label, values:[v1, v2?]}], series: [{label, color?}] (1 o 2 serie affiancate). */
export function LkBars({ title, items, series, yFmt = fmt.short, height = 230, valueLabels = false, legend = true }) {
  const W = 640, H = height, L = 46, R = 10, T = 12, B = 56;
  const max = niceMax(Math.max(0, ...items.flatMap((it) => it.values.map(Number).filter(Number.isFinite))));
  const n = Math.max(1, items.length);
  const gw = (W - L - R) / n;
  const k = series.length;
  const bw = Math.max(2, Math.min(28, (gw - 4) / k));
  const py = (v) => T + (H - T - B) * (1 - Number(v || 0) / max);
  const every = Math.ceil(n / 24);
  return (
    <div style={{ ...lkCard, padding: 12, display: "grid", gap: 6 }}>
      {title && <div style={{ fontSize: 13, color: CP.textSecondary }}>{title}</div>}
      {legend && <Legend items={series.map((s, i) => ({ label: s.label, color: s.color || (i ? CP.accentDim : CP.accent), bar: true }))} />}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={T + (H - T - B) * (1 - t)} y2={T + (H - T - B) * (1 - t)} stroke={CP.borderSoft} />
            <text x={L - 6} y={T + (H - T - B) * (1 - t) + 4} textAnchor="end" fontSize="10" fill={CP.textMuted}>{yFmt(max * t)}</text>
          </g>
        ))}
        {items.map((it, i) => (
          <g key={`${it.label}-${i}`}>
            {it.values.map((v, j) => {
              const x0 = L + gw * i + (gw - bw * k) / 2 + bw * j;
              return (
                <g key={j}>
                  <rect x={x0} y={py(v)} width={bw - 1} height={H - B - py(v)} fill={series[j]?.color || (j ? CP.accentDim : CP.accent)}><title>{`${it.label} · ${series[j]?.label}: ${yFmt(v)}`}</title></rect>
                  {valueLabels && <text x={x0 + bw / 2} y={py(v) - 3} textAnchor="middle" fontSize="9" fill={CP.textSecondary}>{yFmt(v)}</text>}
                </g>
              );
            })}
            {(i % every === 0) && <text x={L + gw * i + gw / 2} y={H - B + 14} textAnchor="end" fontSize="10" fill={CP.textMuted} transform={`rotate(-35 ${L + gw * i + gw / 2} ${H - B + 14})`}>{String(it.label).length > 14 ? `${String(it.label).slice(0, 13)}…` : it.label}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Ciambella (o torta piena) con legenda a destra e % sulle fette grandi. */
export function LkDonut({ title, items, hole = 0.55, valueFmt = fmt.int, height = 220 }) {
  const total = items.reduce((s, it) => s + Math.max(0, Number(it.value) || 0), 0);
  const R = 90, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = items.map((it, i) => {
    const frac = total ? Math.max(0, Number(it.value) || 0) / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)];
    const [x0, y0] = p(a0, R); const [x1, y1] = p(a1, R);
    const [x2, y2] = p(a1, R * hole); const [x3, y3] = p(a0, R * hole);
    const mid = (a0 + a1) / 2;
    const d = frac >= 0.9999
      ? `M${C},${C - R} A${R},${R} 0 1 1 ${C - 0.01},${C - R} ${hole ? `M${C},${C - R * hole} A${R * hole},${R * hole} 0 1 0 ${C + 0.01},${C - R * hole}` : ""} Z`
      : `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} ${hole ? `L${x2},${y2} A${R * hole},${R * hole} 0 ${large} 0 ${x3},${y3}` : `L${C},${C}`} Z`;
    const label = frac >= 0.04 ? { x: C + (R * (1 + hole) / 2) * Math.cos(mid), y: C + (R * (1 + hole) / 2) * Math.sin(mid), t: fmt.pct(frac, 1) } : null;
    a0 = a1;
    return { d, color: it.color || seriesColor(i), label, it, frac };
  });
  return (
    <div style={{ ...lkCard, padding: 12, display: "grid", gap: 6 }}>
      {title && <div style={{ fontSize: 13, color: CP.textSecondary }}>{title}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", minHeight: height }}>
        <svg viewBox="0 0 200 200" style={{ width: "55%", maxWidth: height, height: "auto", flex: "0 0 auto" }}>
          {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} stroke={CP.panel} strokeWidth="1"><title>{`${a.it.label}: ${valueFmt(a.it.value)} (${fmt.pct(a.frac, 1)})`}</title></path>)}
          {arcs.map((a, i) => a.label && <text key={`t${i}`} x={a.label.x} y={a.label.y + 3} textAnchor="middle" fontSize="9" fill="#fff" style={{ pointerEvents: "none" }}>{a.label.t}</text>)}
        </svg>
        <div style={{ display: "grid", gap: 3, fontSize: 12, color: CP.textSecondary, minWidth: 0, maxHeight: height, overflowY: "auto" }}>
          {arcs.map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: a.color, flex: "0 0 auto" }} />{a.it.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Riquadro numerico: titolo, valore grande, % Δ, mini andamento opzionale. */
export function LkScore({ label, value, delta, deltaFmt = "pct", spark, big = false }) {
  const pts = (spark || []).map(Number).filter(Number.isFinite);
  const max = Math.max(1, ...pts);
  const path = pts.length > 1 ? pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ") : "";
  return (
    <div style={{ ...lkCard, padding: "12px 14px", display: "grid", gap: 2, alignContent: "start", textAlign: "center" }}>
      <div style={{ fontSize: big ? 18 : 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: big ? "clamp(22px, 2.3vw, 36px)" : "clamp(15px, 1.35vw, 24px)", fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(value)}>{value}</div>
      {delta != null && Number.isFinite(Number(delta)) && (
        <div style={{ fontSize: 12, color: Number(delta) > 0 ? CP.accentGreen : Number(delta) < 0 ? CP.accentRed : CP.textMuted, fontVariantNumeric: "tabular-nums" }}>
          {Number(delta) > 0 ? "↑" : Number(delta) < 0 ? "↓" : ""} {deltaFmt === "pct" ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Number(delta) * 100)}%` : fmt.int(delta)}
        </div>
      )}
      {path && (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, marginTop: 4 }}>
          <path d={`${path} L100,30 L0,30 Z`} fill={CP.accent} opacity={0.15} />
          <path d={path} fill="none" stroke={CP.accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

/** Griglia: colonne su desktop (ogni colonna può stringersi: minmax(0, …)), una sotto l'altra su schermo stretto. */
export function LkGrid({ cols = "1fr 1fr", gap = 14, children }) {
  const template = cols.includes("minmax") ? cols : cols.split(/\s+/).map((c) => (/fr$/.test(c) ? `minmax(0, ${c})` : c)).join(" ");
  return <div className="lk-grid" style={{ display: "grid", gridTemplateColumns: template, gap }}>{children}</div>;
}

/**
 * Le regole CSS del report, UNA volta per pagina. Scritte con dangerouslySetInnerHTML: dentro un
 * <style>{...}</style> React esegue l'escape di ">" sul server ma non sul client → errore di
 * idratazione (visto il 10/10 con i selettori "nav>div").
 */
export function LkStyles() {
  const css = [
    "@media (max-width: 900px){",
    ".lk-grid{grid-template-columns:1fr !important}",
    ".lk-shell{grid-template-columns:1fr !important}",
    ".lk-shell nav{position:static !important;display:flex !important;overflow-x:auto;gap:6px !important}",
    ".lk-shell nav>div{display:flex !important;gap:6px !important}",
    ".lk-shell nav>div>div{display:none}",
    ".lk-shell nav button{white-space:nowrap}",
    "}",
  ].join("");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
