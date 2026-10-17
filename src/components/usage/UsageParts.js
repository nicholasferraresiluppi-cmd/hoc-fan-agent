"use client";
// Pezzi della sezione Utilizzo (/admin/utilizzo, ridisegno 17/10/2026):
// striscia d'uso di una persona, percorso di una pagina (da dove si arriva →
// dove si va), barre delle aree, righe "cosa fare". Solo token CP.

import { CP, FONTS, alpha } from "@/lib/brand";
import { NUM, card } from "@/components/ds";
import { fmtInt } from "@/lib/format";
import { PERSON_STATUS, ENTRY, EXIT } from "@/lib/usage-core";

export const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");

export function fmtSeconds(s) {
  if (s == null) return "—";
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r && m < 10 ? `${m} min ${r} s` : `${m} min`;
}

/** Schede interne della sezione. */
export function SectionTabs({ tabs, value, onChange }) {
  return (
    <nav aria-label="Viste della sezione" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${CP.border}`, marginBottom: 20 }}>
      {tabs.map(([id, label, count]) => {
        const on = id === value;
        return (
          <button key={id} onClick={() => onChange(id)} aria-current={on ? "page" : undefined}
            style={{ padding: "10px 14px", marginBottom: -1, background: "transparent", border: "none", borderBottom: `2px solid ${on ? CP.accent : "transparent"}`, color: on ? CP.textPrimary : CP.textSecondary, fontSize: 14, fontFamily: FONTS.body, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {label}
            {count > 0 && <span style={{ fontSize: 12, padding: "1px 7px", borderRadius: 999, background: on ? CP.accentSoft : CP.surfaceAlt, color: on ? CP.accentSoftText : CP.textMuted, ...NUM }}>{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** Le ultime 4 settimane di una persona: un quadratino per giorno, pieno = ha aperto l'app. */
export function HabitStrip({ strip, days }) {
  return (
    // 4 settimane separate da uno spazio: si legge "quante settimane su 4", il criterio dell'abitudine
    <div role="img" aria-label={`Attiva ${strip.filter(Boolean).length} giorni sugli ultimi 28`} style={{ display: "flex", gap: 6, maxWidth: 320 }}>
      {[0, 1, 2, 3].map((w) => (
        <div key={w} style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}>
          {strip.slice(w * 7, w * 7 + 7).map((on, j) => {
            const i = w * 7 + j;
            return <span key={i} title={days?.[i] ? `${fmtDay(days[i])}${on ? ": attiva" : ""}` : undefined} style={{ aspectRatio: "1", borderRadius: 2, background: on ? CP.scale : CP.borderSoft }} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function StatusPill({ status }) {
  const s = PERSON_STATUS[status];
  if (!s) return null;
  const strong = status === "abitudine";
  const warn = status === "fermo" || status === "mai";
  return (
    <span style={{ fontSize: 12, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap",
      background: strong ? CP.accentSoft : warn ? alpha(CP.attn, "1f") : CP.surfaceAlt,
      color: strong ? CP.accentSoftText : warn ? CP.attn : CP.textSecondary }}>
      {s.short}
    </span>
  );
}

/** Barra orizzontale con etichetta e numero (aree, sorgenti, destinazioni). */
export function BarRow({ label, value, max, sub, muted, onClick }) {
  const w = max ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 0", cursor: onClick ? "pointer" : "default", fontFamily: FONTS.body }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: muted ? CP.textMuted : CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: CP.textSecondary, ...NUM, whiteSpace: "nowrap" }}>{sub ?? fmtInt(value)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: CP.borderSoft }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 999, background: muted ? CP.textMuted : CP.scale, opacity: muted ? 0.5 : 1 }} />
      </div>
    </Tag>
  );
}

/** Percorso di una pagina: da dove arriva la gente, dove va dopo. */
export function FlowView({ row, onPick }) {
  const maxF = Math.max(1, ...row.from.map((f) => f.count));
  const maxT = Math.max(1, ...row.to.map((f) => f.count));
  const col = (title, list, max, empty) => (
    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>{title}</div>
      {list.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted, padding: "6px 0" }}>{empty}</div>}
      {list.map((f) => {
        const special = f.page === ENTRY || f.page === EXIT;
        return <BarRow key={f.page} label={f.label} value={f.count} max={max} sub={`${fmtInt(f.count)} · ${Math.round((f.count / row.views) * 100)}%`} muted={special} onClick={special || !onPick ? undefined : () => onPick(f.page)} />;
      })}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch" }}>
      {col("Da dove arriva", row.from, maxF, "Ancora nessun passaggio registrato.")}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
        <div style={{ ...card, padding: "10px 14px", textAlign: "center", minWidth: 140 }}>
          <div style={{ fontSize: 12, color: CP.textMuted }}>questa pagina</div>
          <div style={{ fontSize: 14, color: CP.textPrimary, marginTop: 2 }}>{row.label}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, ...NUM }}>{fmtInt(row.views)} aperture</div>
        </div>
      </div>
      {col("Dove va dopo", row.to, maxT, "Ancora nessun passaggio registrato.")}
    </div>
  );
}

/** Riga "cosa fare": pallino di gravità, titolo, dettaglio, azione opzionale. */
export function TodoRow({ kind, title, text, action, onAction, first }) {
  const color = kind === "warn" ? CP.accentRed : kind === "good" ? CP.accentGreen : CP.textMuted;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", borderTop: first ? "none" : `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.45 }}>{title}</div>
        {text && <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 3, lineHeight: 1.5 }}>{text}</div>}
      </div>
      {action && onAction && (
        <button onClick={onAction} style={{ background: "transparent", border: "none", color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, whiteSpace: "nowrap", padding: "2px 0" }}>{action} →</button>
      )}
    </div>
  );
}
