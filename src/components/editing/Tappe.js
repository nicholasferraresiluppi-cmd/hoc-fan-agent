"use client";

// Le sette tappe di una scrivania e la riga «Adesso» (6/11/2026). Logica in editing-core.js.
// Stesso ordine ovunque; la tappa ferma si accende; ogni tappa dice chi ce l'ha in mano.
import { AlertTriangle, CircleCheck, Info } from "lucide-react";
import { CP } from "@/lib/brand";
import { NUM, alpha } from "@/components/ds";

const GIRATO_BIG = { ok: "Sì", poco: "In calo", finito: "Finito" };
const OWNER = { creator: "creator", AI: "AI", persona: "persona", codice: "codice" };
const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("it-IT", { useGrouping: "always" }));

export function Adesso({ adesso, compact = false }) {
  if (!adesso) return null;
  const warn = adesso.tone === "warn", ok = adesso.tone === "ok";
  const Icon = warn ? AlertTriangle : ok ? CircleCheck : Info;
  const color = warn ? CP.attn : ok ? CP.accentGreen : CP.accentSoftText;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: compact ? "8px 10px" : "12px 14px", borderRadius: 10, background: alpha(color, "1F"), border: `1px solid ${alpha(color, "55")}`, fontSize: compact ? 13 : 14.5, color: CP.textPrimary, lineHeight: 1.45 }}>
      <Icon size={compact ? 15 : 17} color={color} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{!compact && <span style={{ fontWeight: 500 }}>Adesso: </span>}{adesso.text}</span>
    </div>
  );
}

/** onPick(stageId): la tappa toccata (la scrivania scorre alla sua sezione). */
export function Tappe({ stages = [], compact = false, onPick }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
      {stages.map((s, i) => {
        const hot = s.stuck, warm = s.warn;
        const border = hot ? CP.attn : warm ? alpha(CP.attn, "88") : CP.border;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={s.id} type={onPick ? "button" : undefined} onClick={onPick ? () => onPick(s.id) : undefined}
            aria-label={onPick ? `${s.label}: ${s.n ?? s.sub}` : undefined}
            style={{ textAlign: "left", background: hot ? alpha(CP.attn, "14") : CP.surface, border: `${hot ? 2 : 1}px solid ${border}`, borderRadius: 10, padding: compact ? "6px 7px" : "10px 10px 9px", minWidth: 0, cursor: onPick ? "pointer" : "default", fontFamily: "inherit", color: CP.textPrimary }}>
            <div style={{ fontSize: compact ? 10.5 : 12, color: CP.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i + 1} {s.label}</div>
            <div style={{ fontSize: compact ? 16 : 22, fontWeight: 500, lineHeight: 1.2, margin: "2px 0", color: (s.id === "girato" ? !s.stato : s.n == null) ? CP.textMuted : hot ? CP.attn : CP.textPrimary, ...NUM }}>
              {s.id === "girato" ? (GIRATO_BIG[s.stato] || "–") : fmt(s.n)}
              {s.id === "misura" && s.of > 0 && <span style={{ fontSize: compact ? 11 : 13, color: CP.textMuted }}> di {fmt(s.of)}</span>}
            </div>
            {(!compact || s.id === "girato") && <div style={{ fontSize: compact ? 10.5 : 12, color: hot ? CP.attn : CP.textSecondary, lineHeight: 1.3 }}>{s.sub}</div>}
            {!compact && <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 4 }}>{OWNER[s.owner] || s.owner}</div>}
          </Tag>
        );
      })}
    </div>
  );
}
