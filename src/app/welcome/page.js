"use client";

import Link from "next/link";
import {
  BarChart3, GraduationCap, Workflow, Users,
  ArrowRight, Sparkles, Trophy, Brain, Award,
  LayoutDashboard, Layers,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, CpCard } from "@/components/cp-style";

/**
 * /welcome — Landing onboarding/demo per chi entra la prima volta.
 *
 * Pensata per consulenti esterni / nuovi onboarding / demo: spiega
 * cosa fa HOC Pro in 30 secondi e mostra 4 moduli macro con CTA chiare.
 *
 * Per chi vuole "vedere tutto", c'è il link a /admin (Hub) e il toggle
 * "Advanced" in sidebar.
 */

const MODULES = [
  {
    key: "performance",
    icon: BarChart3,
    color: "#10B981",
    title: "Performance Analytics",
    subtitle: "Quanto vendono i tuoi operatori e creator",
    description:
      "Tre leaderboard complementari: KPI Infloww (sales/h, fan CVR), score CreatorsPro (sales reali per shift), e classifica creator-first (chi rende di più su quale creator).",
    primaryCta: { href: "/leaderboard/sales-cp", label: "Apri Sales CP" },
    secondaryCtas: [
      { href: "/leaderboard/operational", label: "Leaderboard Operativa" },
      { href: "/leaderboard/creators", label: "Vista per Creator" },
    ],
  },
  {
    key: "training",
    icon: GraduationCap,
    color: "#3B82F6",
    title: "Training Academy",
    subtitle: "Allena i chatter con AI + valuta automaticamente",
    description:
      "Academy con scenari training, valutazione AI 6-skill (naturalezza/esclusività/conversione…), playbook di esempi reali curati, sistema certificazioni per creator (L1/L2/L3).",
    primaryCta: { href: "/", label: "Apri Academy" },
    secondaryCtas: [
      { href: "/playbook", label: "Playbook" },
      { href: "/profilo/certificazioni", label: "Badge Wall" },
    ],
  },
  {
    key: "pipeline",
    icon: Workflow,
    color: "#A855F7",
    title: "Content Pipeline",
    subtitle: "Flow di content production per i canali Telegram",
    description:
      "Pipeline draft → approval → schedule → publish per i canali Telegram di ciascun creator. Multi-creator, multi-bot, history pubblicati.",
    primaryCta: { href: "/content-pipeline", label: "Apri Pipeline" },
    secondaryCtas: [
      { href: "/content-pipeline/queue", label: "Code attive" },
      { href: "/content-pipeline/creators", label: "Creator pipeline" },
    ],
  },
  {
    key: "team",
    icon: Users,
    color: "#F59E0B",
    title: "Team Management",
    subtitle: "Organizzazione, ruoli, anagrafica, accessi",
    description:
      "Team con team lead, anagrafica operatori + seniority auto-calcolata, ruoli predefiniti + custom multi-scope (own/team/all), gestione accessi admin via email.",
    primaryCta: { href: "/admin/team", label: "Gestisci Team" },
    secondaryCtas: [
      { href: "/admin/employee-profiles", label: "Profili" },
      { href: "/admin/ruoli", label: "Ruoli" },
    ],
  },
];

const HIGHLIGHTS = [
  { icon: Trophy,    label: "1240+ shift CP tracciati / mese" },
  { icon: Brain,     label: "60k+ messaggi Infloww analizzati" },
  { icon: Award,     label: "Certificazioni creator L1→L3" },
  { icon: Sparkles,  label: "AI scoring + match suggestions" },
];

export default function WelcomePage() {
  return (
    <div style={{ padding: "40px 32px 80px 32px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      {/* HERO */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel>Benvenuto / Welcome</SectionLabel>
        <h1 style={{
          fontFamily: FONTS.display, fontSize: 48, fontWeight: 700,
          margin: "12px 0 12px 0", letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          HOC Pro — il sistema operativo di <span style={{ color: CP.accentGreen }}>House of Creators</span>
        </h1>
        <p style={{ color: CP.textSecondary, fontSize: 17, margin: 0, lineHeight: 1.6, maxWidth: 900 }}>
          Performance analytics, training AI, content pipeline e team management — in un'unica console.
          Connesso a <b style={{ color: CP.textPrimary }}>CreatorsPro</b> (sales reali) e <b style={{ color: CP.textPrimary }}>Infloww</b> (KPI chat).
        </p>

        {/* Highlights row */}
        <div style={{ display: "flex", gap: 22, marginTop: 24, flexWrap: "wrap" }}>
          {HIGHLIGHTS.map((h) => (
            <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textSecondary, fontSize: 13 }}>
              <h.icon size={15} strokeWidth={1.8} color={CP.accentGreen} />
              <span>{h.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 MODULE CARDS */}
      <div style={{ marginBottom: 40 }}>
        <SectionLabel style={{ marginBottom: 14, display: "block" }}>I 4 moduli principali</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
          {MODULES.map((m) => (
            <div
              key={m.key}
              style={{
                background: CP.surface,
                border: `1px solid ${CP.border}`,
                borderRadius: 16,
                padding: "26px 28px",
                display: "flex", flexDirection: "column", gap: 18,
                transition: "border-color 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = m.color + "66";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = CP.border;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: `linear-gradient(135deg, ${m.color}33, ${m.color}11)`,
                  border: `1px solid ${m.color}55`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <m.icon size={26} strokeWidth={1.8} color={m.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: CP.textPrimary, fontFamily: FONTS.display, letterSpacing: "-0.01em" }}>
                    {m.title}
                  </div>
                  <div style={{ color: m.color, fontSize: 12, fontWeight: 600, marginTop: 3, letterSpacing: "0.01em" }}>
                    {m.subtitle}
                  </div>
                </div>
              </div>

              <p style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.55, margin: 0, flex: 1 }}>
                {m.description}
              </p>

              {/* CTAs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link
                  href={m.primaryCta.href}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px",
                    background: m.color,
                    color: "#0a0a0a",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  <span>{m.primaryCta.label}</span>
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {m.secondaryCtas.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      style={{
                        padding: "5px 10px",
                        background: CP.surfaceAlt,
                        color: CP.textSecondary,
                        border: `1px solid ${CP.border}`,
                        borderRadius: 6,
                        fontSize: 11,
                        textDecoration: "none",
                      }}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Score primer banner */}
      <Link
        href="/welcome/score-friendly"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px",
          marginBottom: 16,
          background: `linear-gradient(135deg, ${CP.accentGreen}15 0%, ${CP.accentBlue}10 100%)`,
          border: `1px solid ${CP.accentGreen}44`,
          borderRadius: 14,
          color: CP.textPrimary,
          textDecoration: "none",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: CP.accentGreen + "22",
            border: `1px solid ${CP.accentGreen}66`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Sparkles size={22} color={CP.accentGreen} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: CP.textPrimary }}>
              Prima volta in HOC Pro? Capisci come funziona lo Score in 7 step
            </div>
            <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4 }}>
              Tutorial narrativo con esempi concreti e Q&amp;A interattivo. Puoi fare domande in qualsiasi punto.
            </div>
          </div>
        </div>
        <span style={{ color: CP.accentGreen, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Apri guida <ArrowRight size={14} />
        </span>
      </Link>

      {/* FOOTER hints */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <LayoutDashboard size={16} color={CP.accentGreen} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Cerchi il control center?</div>
          </div>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: "0 0 12px 0", lineHeight: 1.5 }}>
            L'Hub <code style={{ background: CP.surfaceAlt, padding: "1px 6px", borderRadius: 3 }}>/admin</code> raccoglie le stat live, le quick actions e gli shortcut a tutte le sezioni amministrative.
          </p>
          <Link href="/admin" style={{ color: CP.accentGreen, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Vai all'Hub Admin <ArrowRight size={13} />
          </Link>
        </CpCard>

        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Layers size={16} color={CP.accentBlue} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Hai bisogno di TUTTI gli strumenti?</div>
          </div>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: "0 0 12px 0", lineHeight: 1.5 }}>
            La sidebar in alto a sinistra ha un toggle <b>Essential / Advanced</b>. In modalità Advanced compaiono anche le sezioni Insights, Content Pipeline e Data &amp; Integrations.
          </p>
          <span style={{ color: CP.textMuted, fontSize: 12, fontStyle: "italic" }}>
            Click sull'icona <b>Layers</b> in sidebar per passare a Advanced.
          </span>
        </CpCard>
      </div>
    </div>
  );
}
