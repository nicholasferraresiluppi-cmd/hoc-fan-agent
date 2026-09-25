"use client";
/**
 * Pezzi di design condivisi (25/09/2026), ricavati dal pilota Calendario compensi
 * testato con 5 utenti simulati. Struttura di una pagina dati:
 *   PageHead → HeroMetric (+ Metric secondarie col confronto) → FilterChip
 *   → DataTable ordinabile → Disclosure per ciò che serve di rado.
 * Tutto usa i token CP (seguono il tema) e i formati di lib/format.js.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";

const NUM = { fontVariantNumeric: "tabular-nums" };
export const card = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 };

export function PageHead({ crumbs = [], title, subtitle, actions }) {
  return (
    <header style={{ marginBottom: 20 }}>
      {crumbs.length > 0 && (
        <div style={{ display: "flex", gap: 8, fontSize: 13, color: CP.textSecondary, marginBottom: 6, flexWrap: "wrap" }}>
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
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.01em", color: CP.textPrimary }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, maxWidth: 760, lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </header>
  );
}

/** Il numero che risponde alla domanda della pagina, col suo confronto. */
export function HeroMetric({ label, value, compare, hint, children }) {
  return (
    <section style={{ ...card, padding: "20px 22px", marginBottom: 14, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ minWidth: 220 }}>
        <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
        <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: CP.textPrimary, ...NUM }}>{value}</div>
        {compare && <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 4 }}>{compare}</div>}
        {hint && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, delta, note, danger }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.25, color: danger ? CP.accentRed : CP.textPrimary, ...NUM }}>{value}</div>
      {(delta || note) && <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{[delta && `${delta} sul mese prima`, note].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}

export function FilterChip({ label, active, danger, onClick, disabled, closable }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 13, cursor: disabled ? "default" : "pointer", fontFamily: FONTS.body,
        border: `1px solid ${active ? CP.accent : danger ? CP.accentRed : CP.border}`,
        background: active ? CP.accentSoft : CP.surface,
        color: active ? CP.accentSoftText : danger ? CP.accentRed : disabled ? CP.textMuted : CP.textPrimary }}>
      {danger && !active && <AlertTriangle size={13} />}{label}{closable && <X size={12} />}
    </button>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 10px", flexWrap: "wrap" }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{children}</h2>
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
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 14, borderRadius: 10, background: CP.surface, border: `1px solid ${CP.border}`, borderLeft: `3px solid ${danger ? CP.accentRed : CP.textMuted}`, fontSize: 13, lineHeight: 1.55, color: CP.textSecondary }}>
      <AlertTriangle size={15} color={danger ? CP.accentRed : CP.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

/**
 * Tabella ordinabile. columns: [{ key, label, align, render(row), sort(row) }]
 * Righe cliccabili con onRowClick; `selected(row)` evidenzia.
 */
export function DataTable({ columns, rows, defaultSort, onRowClick, selected, minWidth = 600, empty = "Nessun dato." }) {
  const [sort, setSort] = useState(defaultSort || null);
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
  const th = { padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted, whiteSpace: "nowrap", background: CP.surface, borderBottom: `1px solid ${CP.border}`, userSelect: "none" };
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth }}>
        <thead><tr>{columns.map((c) => (
          <th key={c.key} style={{ ...th, textAlign: c.align || "left", cursor: c.sortable === false ? "default" : "pointer" }}
            onClick={() => c.sortable !== false && setSort({ key: c.key, dir: sort?.key === c.key ? -sort.dir : (c.align === "right" ? -1 : 1) })}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{c.label}{sort?.key === c.key && (sort.dir < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</span>
          </th>
        ))}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} style={{ padding: 16, color: CP.textMuted, fontSize: 13 }}>{empty}</td></tr>}
          {sorted.map((r, i) => {
            const sel = selected?.(r);
            return (
              <tr key={r.id ?? r.key ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: onRowClick ? "pointer" : "default", background: sel ? CP.accentSoft : "transparent" }}>
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "9px 12px", textAlign: c.align || "left", color: c.muted ? CP.textSecondary : CP.textPrimary, verticalAlign: "middle", ...(c.align === "right" ? NUM : {}) }}>
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

export { NUM, alpha };
