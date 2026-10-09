"use client";

// Mattoni comuni di Laura Chat Monitor: riquadri KPI col pallino di stato,
// sezioni, formati. Etichette e struttura come nel sito originale (chat.hoc.tools).

import { Info } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { NUM, card } from "@/components/ds";

export const COUNTRIES = [
  { id: "IT", label: "Italia" },
  { id: "EN", label: "English" },
  { id: "ES", label: "España" },
];
const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export const ok = (v) => v != null && Number.isFinite(Number(v));
export const div = (a, b) => (!ok(a) || !ok(b) || Number(b) === 0 ? null : Number(a) / Number(b));
export const usd = (v, d = 0) => (!ok(v) ? "–" : `$${Number(v).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const int = (v) => (!ok(v) ? "–" : Math.round(Number(v)).toLocaleString("it-IT"));
export const pct = (v, d = 1) => (!ok(v) ? "–" : `${(Number(v) * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
export const mins = (v) => (!ok(v) ? "–" : `${Math.round(Number(v)).toLocaleString("it-IT")} min`);
export const hm = (iso) => (!iso ? "–" : new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }));
export const ymdRome = (iso) => (!iso ? "–" : new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
export function ago(iso) {
  if (!iso) return "–";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "adesso";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h fa`;
  return `${Math.round(h / 24)} gg fa`;
}
export function dayLabel(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
export const shortDay = (ymd) => { const [, m, d] = ymd.split("-").map(Number); return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`; };
export const todayRome = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDays = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);

export const STATUS = { ok: "ok", warn: "warn", bad: "bad" };
const dotColor = (s) => (s === "bad" ? CP.accentRed : s === "warn" ? CP.gold : s === "ok" ? CP.accentGreen : null);

export function Tip({ text }) {
  if (!text) return null;
  return <span title={text} style={{ display: "inline-flex", color: CP.textMuted, cursor: "help" }}><Info size={12} /></span>;
}

// Tessera (09/10/2026, "più bello e amichevole"): colore morbido per lo stato al posto del
// pallino, una parola che lo dice ("tutto ok" / "da guardare"), etichetta normale, numero grande.
const STATUS_WORD = { ok: "tutto ok", warn: "attenzione", bad: "da guardare" };
export function Kpi({ label, value, sub, status, tip, onClick, active, badge }) {
  const c = dotColor(status) || CP.accent;
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined}
      style={{ background: alpha(c, active ? "26" : "12"), border: `1px solid ${alpha(c, active ? "88" : "2e")}`, borderRadius: 18, padding: "14px 16px", minHeight: 104, cursor: onClick ? "pointer" : "default", transition: "background .15s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, display: "flex", gap: 6, alignItems: "center" }}>
          {label} <Tip text={tip} />
        </div>
        {badge}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: CP.textPrimary, margin: "8px 0 2px", letterSpacing: "-0.01em", ...NUM }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.45, ...NUM }}>{sub}</div>}
      {status && <span style={{ display: "inline-block", marginTop: 8, fontSize: 11.5, fontWeight: 600, color: c, background: CP.surface, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{STATUS_WORD[status]}</span>}
    </div>
  );
}

export function Section({ title, tip, aside, badge, children, style }) {
  return (
    <section style={{ ...card, borderRadius: 20, padding: "16px 18px", marginBottom: 12, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{title}</h2>
          {badge}
          <Tip text={tip} />
          {aside && <span style={{ fontSize: 12.5, color: CP.textMuted }}>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "accent" }) {
  const c = tone === "live" ? CP.accentGreen : tone === "warn" ? CP.gold : CP.accent;
  return <span style={{ fontSize: 10.5, letterSpacing: "0.06em", fontWeight: 600, padding: "2px 7px", borderRadius: 6, color: c, background: alpha(c, "1a"), border: `1px solid ${alpha(c, "44")}` }}>{children}</span>;
}

export const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 });
export const chip = (on, tone) => {
  const c = tone === "warn" ? CP.gold : CP.accent;
  return { padding: "6px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${on ? c : CP.border}`, background: on ? alpha(c, "14") : CP.surface, color: CP.textPrimary };
};
export const th = { textAlign: "right", padding: "7px 10px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500, color: CP.textSecondary, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: CP.panel };
export const td = { textAlign: "right", padding: "7px 10px", fontSize: 13, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", color: CP.textPrimary, ...NUM };

// Link al fan su OnlyFans (chat). Il nome utente apre la conversazione, come nell'originale.
export function FanLink({ userId, username }) {
  const name = username || `u${userId}`;
  return <a href={`https://onlyfans.com/my/chats/chat/${userId}`} target="_blank" rel="noreferrer" style={{ color: CP.textPrimary, textDecoration: "underline", textUnderlineOffset: 2 }}>{name}</a>;
}
