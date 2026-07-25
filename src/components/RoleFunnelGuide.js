"use client";

/**
 * RoleFunnelGuide — render di UN funnel di strumenti (cfr src/lib/role-funnels.js).
 *
 * Mostra la spina dorsale del percorso come sequenza di passi numerati,
 * raggruppati per FASE (Diagnostica → Allena/Agisci → Misura). Ogni passo è
 * un link allo strumento reale con il PERCHÉ e cosa ci fai.
 *
 * Riusato da: la pagina /guida (tab per ruolo) e la modale OnboardingNudge.
 *
 * Design: token CP, pesi 400/500, sentence case, un solo accent viola, flat.
 */
import Link from "next/link";
import {
  UserCircle2, Gauge, GraduationCap, Film, Route, Radar, TrendingUp,
  Users, UserSearch, Target, RefreshCw, DollarSign, LayoutDashboard,
  Wallet, Activity, Medal, Contact, MessageSquareWarning, ArrowRight,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

// Mappa stringa → componente icona (le icone stanno come stringhe nel dato puro).
const ICONS = {
  UserCircle2, Gauge, GraduationCap, Film, Route, Radar, TrendingUp,
  Users, UserSearch, Target, RefreshCw, DollarSign, LayoutDashboard,
  Wallet, Activity, Medal, Contact, MessageSquareWarning,
};

function StepRow({ step, index, onNavigate }) {
  const Icon = ICONS[step.icon] || Target;
  return (
    <Link
      href={step.href}
      onClick={onNavigate}
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 16px",
        background: CP.surface,
        border: `1px solid ${CP.border}`,
        borderRadius: 10,
        textDecoration: "none",
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CP.surfaceAlt;
        e.currentTarget.style.borderColor = CP.accent + "55";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = CP.surface;
        e.currentTarget.style.borderColor = CP.border;
      }}
    >
      {/* Numero + icona */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 2 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: CP.accentSoft, color: CP.accentSoftText,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 500, fontFamily: FONTS.body,
          }}
        >
          {index + 1}
        </span>
        <Icon size={16} color={CP.textMuted} strokeWidth={1.8} aria-hidden="true" />
      </div>

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.body }}>
            {step.title}
          </span>
          <ArrowRight size={13} color={CP.mutedIcons} aria-hidden="true" />
        </div>
        <p style={{ margin: "4px 0 0 0", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, fontFamily: FONTS.body }}>
          {step.why}
        </p>
        {step.do && (
          <p style={{ margin: "6px 0 0 0", fontSize: 12, color: CP.textMuted, lineHeight: 1.45, fontFamily: FONTS.body }}>
            {step.do}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function RoleFunnelGuide({ funnel, onNavigate }) {
  if (!funnel) return null;

  // Raggruppo i passi consecutivi per fase, preservando la numerazione globale.
  const groups = [];
  funnel.steps.forEach((step, i) => {
    const last = groups[groups.length - 1];
    if (last && last.phase === step.phase) {
      last.items.push({ step, index: i });
    } else {
      groups.push({ phase: step.phase, items: [{ step, index: i }] });
    }
  });

  return (
    <div style={{ fontFamily: FONTS.body }}>
      {/* Intestazione funnel */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 15, color: CP.textPrimary, fontWeight: 500, lineHeight: 1.5 }}>
          {funnel.tagline}
        </p>
        <p style={{ margin: "4px 0 0 0", fontSize: 12.5, color: CP.textMuted }}>
          Per chi: {funnel.forWhom}
        </p>
      </div>

      {/* Fasi + passi */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map((group) => (
          <div key={group.phase}>
            <div
              style={{
                fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
                textTransform: "uppercase", color: CP.accentSoftText,
                marginBottom: 10, paddingLeft: 2,
              }}
            >
              {group.phase}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.items.map(({ step, index }) => (
                <StepRow key={step.href + index} step={step} index={index} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
