"use client";

// Pezzi d'interfaccia del warm-up (pagina /admin/warmup). Solo token CP: funziona nei 4 stili.
import { Check, Clock, X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { NUM, NumText, FilterChip, BTN_PRIMARY } from "@/components/ds";
import { mmss } from "@/lib/warmup-plan";

export const TONE = {
  ok: CP.accentGreen,
  warn: CP.attn,
  bad: CP.accentRed,
  flat: CP.textMuted,
};
export const statusColor = (s) => (s === "rosso" ? CP.accentRed : s === "arancione" ? CP.attn : CP.accentGreen);

export const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 10, padding: "9px 14px", fontSize: 14, cursor: "pointer", fontFamily: FONTS.body, minHeight: 40 };
export const btnPrimary = BTN_PRIMARY;
export const btnDanger = { ...btn, color: CP.accentRed, border: `1px solid ${alpha(CP.accentRed, "66")}` };
export const btnOk = { ...btn, color: CP.accentGreen, border: `1px solid ${alpha(CP.accentGreen, "66")}` };
export const btnSm = { ...btn, padding: "5px 10px", fontSize: 13, minHeight: 32 };
export const input = { width: "100%", boxSizing: "border-box", background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: FONTS.body };
// stesse misure delle card del resto dell'app (ds.card): bordo sottile, raggio 10
export const cardBox = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 12 };
export const eyebrow = { fontSize: 13, color: CP.textMuted, fontWeight: 400 };
export const muted = { color: CP.textMuted };
export const hint = { fontSize: 12.5, color: CP.textMuted, lineHeight: 1.5 };

/** Titolo di sezione (come SectionTitle dell'app: nello stile Casa diventa il serif grande). */
export function SectionHead({ children, aside, style }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "28px 0 12px", flexWrap: "wrap", ...style }}>
      <h2 className="ds-sect" style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{children}</h2>
      {aside && <span style={{ fontSize: 13, color: CP.textMuted }}>{aside}</span>}
    </div>
  );
}
/** Etichetta piccola sopra un gruppo di righe (sentence case, niente maiuscoletto). */
export function GroupLabel({ children, color, style }) {
  return <div style={{ fontSize: 13.5, color: color || CP.textSecondary, margin: "18px 0 8px", ...style }}>{children}</div>;
}

export function Ring({ n, total }) {
  const pct = total ? n / total : 0, r = 18, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 44, height: 44, flex: "0 0 auto" }} aria-label={`${n} di ${total}`}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke={CP.borderSoft} strokeWidth="4" />
        {n > 0 && <circle cx="22" cy="22" r={r} fill="none" stroke={n === total ? CP.accentGreen : CP.accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`} />}
      </svg>
      <b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 500, ...NUM }}>{n}/{total}</b>
    </div>
  );
}

export function Avatar({ a, size = 40 }) {
  const i = (a.displayName || a.username || "?").replace(/^@/, "").slice(0, 1).toUpperCase();
  const st = { width: size, height: size, borderRadius: "50%", flex: "0 0 auto", objectFit: "cover", background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}` };
  if (a.hasPfp) return <img src={`/api/admin/warmup?pfp=${encodeURIComponent(a.id)}&v=${a.pfpV || 0}`} alt="" style={st} />;
  return <div style={{ ...st, display: "grid", placeItems: "center", fontSize: size * 0.4, color: CP.textSecondary }}>{i}</div>;
}

export function Chip({ children, color, title }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap", border: `1px solid ${color ? alpha(color, "66") : CP.border}`, color: color || CP.textSecondary }}>
      {children}
    </span>
  );
}
export function Dot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flex: "0 0 auto" }} />;
}

/** Scelta tra poche voci: le stesse «pillole» dei filtri del resto dell'app. */
export function Seg({ items, value, onChange, style }) {
  return (
    <div role="tablist" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", ...style }}>
      {items.map(([k, l]) => <FilterChip key={k} label={l} active={value === k} onClick={() => onChange(k)} />)}
    </div>
  );
}

/** Riquadro richiudibile (regole, "oggi non si fa"). */
export function Fold({ title, children, danger, open }) {
  return (
    <details open={open} style={{ ...cardBox, padding: 0, marginTop: 12, background: "transparent" }}>
      <summary style={{ cursor: "pointer", padding: "13px 16px", fontSize: 14, fontWeight: 500, color: danger ? CP.accentRed : CP.textPrimary, listStyle: "revert" }}>{title}</summary>
      <div style={{ padding: "0 16px 14px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>{children}</div>
    </details>
  );
}

export function Bullets({ items, ordered }) {
  const T = ordered ? "ol" : "ul";
  return <T style={{ margin: 0, paddingLeft: 20 }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</T>;
}

/** Riga di una task: casella, testo, timer, "perché". */
export function TaskRow({ item, done, open, onToggle, onWhy, timer, compact }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: compact ? "10px 14px" : "12px 14px", borderTop: `1px solid ${CP.borderSoft}`, background: done ? alpha(CP.accentGreen, "0d") : "transparent" }}>
      <button type="button" onClick={onToggle} aria-label={done ? "Riapri" : "Completa"} aria-pressed={done}
        style={{ width: 26, height: 26, flex: "0 0 auto", borderRadius: 8, border: `1.5px solid ${done ? CP.accentGreen : CP.borderStrong}`, background: done ? CP.accentGreen : "transparent", color: CP.accentInk, display: "grid", placeItems: "center", cursor: "pointer", marginTop: 1 }}>
        {done && <Check size={16} strokeWidth={3} color={CP.surface} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, lineHeight: 1.4, color: done ? CP.textMuted : CP.textPrimary, textDecoration: done ? "line-through" : "none" }}>{item.t}{item.opt && <span style={{ ...muted, fontSize: 12.5 }}> · facoltativa</span>}</div>
        {timer}
        {open && item.why && <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55, marginTop: 6 }}>{item.why}</div>}
      </div>
      {item.why && (
        <button type="button" onClick={onWhy} aria-label="Perché" title="Perché"
          style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: "50%", border: `1px solid ${CP.borderSoft}`, background: CP.surfaceAlt, color: CP.textSecondary, cursor: "pointer", fontSize: 13 }}>
          {open ? <X size={13} /> : "?"}
        </button>
      )}
    </div>
  );
}

/** Pulsante del timer sotto una task. */
export function TimerChip({ item, running, left, doneMin, onStart, onPause }) {
  const acc = item.timer.mode === "accum";
  const lab = running ? mmss(left) : acc ? `${doneMin}/${item.timer.min} min` : `${item.timer.min} min`;
  return (
    <button type="button" onClick={running ? onPause : onStart}
      style={{ ...btnSm, marginTop: 7, gap: 5, background: running ? CP.accent : CP.surfaceAlt, color: running ? CP.accentInk : CP.textPrimary, border: `1px solid ${running ? CP.accent : CP.border}`, ...NUM }}>
      <Clock size={13} />{lab}
    </button>
  );
}

export function TaskList({ children }) {
  return <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, overflow: "hidden" }}><div style={{ marginTop: -1 }}>{children}</div></div>;
}

export function KV({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 14 }}>
      <span style={muted}>{k}</span><b style={{ fontWeight: 500, textAlign: "right", overflowWrap: "anywhere" }}>{v || "—"}</b>
    </div>
  );
}

export function Field({ label, children, hint: h }) {
  return (
    <label style={{ display: "grid", gap: 5, marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, color: CP.textSecondary, fontWeight: 500 }}>{label}</span>
      {children}
      {h && <span style={hint}>{h}</span>}
    </label>
  );
}

/** Numero con etichetta, come Metric dell'app (nello stile Casa: numero serif grande). */
export function Metric2({ value, label, color, sub, children }) {
  return (
    <div style={{ minWidth: 0, padding: "4px 0" }}>
      <div className="ds-lbl" style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div className="ds-metric-v" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.25, color: color || CP.textPrimary, ...NUM }}><NumText value={value} /></div>
      {sub && <div style={{ ...hint, marginTop: 2 }}>{sub}</div>}
      {children}
    </div>
  );
}

export function Delta({ d }) {
  if (d == null) return <span style={{ fontSize: 12, ...muted }}>—</span>;
  if (d === 0) return <span style={{ fontSize: 12, ...muted }}>=</span>;
  return <span style={{ fontSize: 12, color: d > 0 ? CP.accentGreen : CP.accentRed, ...NUM }}>{d > 0 ? "▲ +" : "▼ "}{Number(d).toLocaleString("it-IT")}</span>;
}

export function ModalBox({ title, sub, children, foot, onClose }) {
  return (
    <div role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 80, background: alpha(CP.bgSunken, "cc"), display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 16, padding: "20px 20px 16px", width: "100%", maxWidth: 520, maxHeight: "86vh", overflowY: "auto", boxShadow: `0 20px 50px ${alpha(CP.bgSunken, "99")}` }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 500 }}>{title}</h3>
        {sub && <p style={{ ...hint, margin: "0 0 14px", fontSize: 13.5 }}>{sub}</p>}
        {children}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>{foot}</div>
      </div>
    </div>
  );
}

export function Opt({ checked, onChange, title, desc, right }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, border: `1px solid ${checked ? CP.accent : CP.borderSoft}`, background: checked ? CP.accentSoft : "transparent", marginBottom: 8, cursor: "pointer" }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14.5, fontWeight: 500 }}>{title}{right}</span>
        {desc && <span style={{ display: "block", ...hint, fontSize: 13 }}>{desc}</span>}
      </span>
    </label>
  );
}
