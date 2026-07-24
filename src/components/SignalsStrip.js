"use client";

import Link from "next/link";
import { Target, TrendingUp, GraduationCap, Compass } from "lucide-react";
import { CP } from "@/lib/brand";

/**
 * Il TUO profilo-segnali (scope own): dove sei forte, dove migliorare, e gli
 * scenari che allenano proprio quel gap. Cuce diagnostica (#70) + allenamento
 * (#73). Componente condiviso: montato nel cockpit turno (/me/turno) e nel
 * profilo operatore (/profilo) — così la diagnostica personale è raggiungibile
 * anche senza il pilot-link, via /api/me/signals (match email). Fuori dagli score.
 *
 * @param {{ sig: {linked:boolean, profile?:object, path?:object} }} props
 */
export default function SignalsStrip({ sig }) {
  if (!sig?.linked || !sig?.profile) return null;
  const { top_gap: gap, top_strength: strength, shifts } = sig.profile;
  const path = sig.path;
  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Target size={14} color={CP.accent} />
        <span style={{ fontSize: 12, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Il tuo profilo · dal tuo lavoro vero{shifts ? ` (${shifts} turni singoli)` : ""}
        </span>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {strength ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: CP.textSecondary }}>
            <TrendingUp size={14} color={CP.accentGreen} /> Punto di forza: <span style={{ color: CP.textPrimary }}>{strength.label}</span>
          </span>
        ) : null}
        {gap ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: CP.textSecondary }}>
            <Compass size={14} color={CP.accentSoftText} /> Da migliorare: <span style={{ color: CP.textPrimary }}>{gap.label}</span>
          </span>
        ) : null}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12.5, color: CP.textMuted, lineHeight: 1.5 }}>
        {gap ? (path?.focus || gap.coaching) : "Nessun punto debole marcato questo periodo — presidia e continua così."}
      </p>
      {path?.scenarios?.length > 0 ? (
        <div style={{ marginTop: 12, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: CP.textMuted }}>
              <GraduationCap size={14} color={CP.textMuted} /> Scenari che allenano questo
            </span>
            <Link href="/" style={{ fontSize: 12.5, color: CP.accentSoftText, textDecoration: "none" }}>Apri il simulatore →</Link>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {path.scenarios.map((s) => (
              <span key={s.id} title={`difficoltà ${s.difficulty}/5`} style={{ fontSize: 12, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 7, padding: "4px 10px" }}>
                {s.title.length > 42 ? s.title.slice(0, 40) + "…" : s.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
