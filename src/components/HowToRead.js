"use client";

/**
 * HowToRead — "Come si legge questa pagina".
 * Disciplina audience-check: ogni pagina-strumento dichiara in linguaggio
 * piano cosa mostra e qual è IL numero da guardare, per chi la apre la
 * prima volta. Chiuso di default: non disturba chi la usa ogni giorno.
 *
 * Uso: <HowToRead items={["frase semplice", ...]} />
 */
import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

export default function HowToRead({ items = [], title = "Come si legge questa pagina" }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "6px 12px",
          background: open ? CP.surfaceAlt : CP.surface,
          border: `1px solid ${CP.border}`,
          borderRadius: open ? "8px 8px 0 0" : 8,
          color: CP.textSecondary,
          fontSize: 12, fontWeight: 500, fontFamily: FONTS.body,
          cursor: "pointer",
        }}
      >
        <HelpCircle size={13} color={CP.mutedIcons} />
        {title}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div style={{
          background: CP.surface,
          border: `1px solid ${CP.border}`,
          borderTop: "none",
          borderRadius: "0 8px 8px 8px",
          padding: "12px 16px",
          maxWidth: 760,
        }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it, i) => (
              <li key={i} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.55 }}>{it}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
