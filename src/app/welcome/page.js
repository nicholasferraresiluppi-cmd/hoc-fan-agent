"use client";

import Link from "next/link";
import {
  BarChart3, GraduationCap, Users, Layers,
  ArrowRight, Sparkles, LayoutDashboard,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, card } from "@/components/ds";

/**
 * /welcome — Prima pagina per chi entra in HOC Pro (board, manager, operatori).
 *
 * Redesign 26/09/2026 sul design system: testata PageHead, un solo accento,
 * moduli come card neutre. Spiega in 30 secondi cosa c'è nella console e porta
 * alla guida dei due score (Vendite e Mestiere). Link e destinazioni invariati.
 */

const MODULES = [
  {
    key: "performance",
    icon: BarChart3,
    title: "Performance",
    subtitle: "Quanto rendono operatori e creator",
    description:
      "Tre viste che si completano: Sales CP (score Vendite, dalle vendite reali registrate in CreatorsPro), la classifica operativa (score Mestiere, dai dati di Infloww come vendite all'ora e quota di fan che comprano) e la vista per creator (chi rende di più su quale creator).",
    primaryCta: { href: "/leaderboard/sales-cp", label: "Apri Sales CP" },
    secondaryCtas: [
      { href: "/leaderboard/operational", label: "Classifica operativa" },
      { href: "/leaderboard/creators", label: "Vista per creator" },
    ],
  },
  {
    key: "training",
    icon: GraduationCap,
    title: "Training Academy",
    subtitle: "Allenati in chat con un fan simulato",
    description:
      "Scenari di allenamento con un fan simulato dall'AI e una valutazione su 6 abilità (naturalezza, esclusività, conversione…), un playbook di esempi reali scelti a mano e le certificazioni per creator, dal livello L1 al L3.",
    primaryCta: { href: "/", label: "Apri Academy" },
    secondaryCtas: [
      { href: "/playbook", label: "Playbook" },
      { href: "/profilo/certificazioni", label: "Badge e certificazioni" },
    ],
  },
  {
    key: "comp",
    icon: Layers,
    title: "Comp & Ben",
    subtitle: "Compensi, scaglioni e margine per creator",
    description:
      "Il conto economico live di ogni creator (venduto × fee − costo degli operatori), gli scaglioni messi a confronto tra creator, la lista delle anomalie sui compensi e l'esame di una creator su più mesi.",
    primaryCta: { href: "/admin/pnl-live", label: "Apri P&L live" },
    secondaryCtas: [
      { href: "/admin/profiles-compare", label: "Scaglioni a confronto" },
      { href: "/admin/comp-review", label: "Comp review" },
    ],
  },
  {
    key: "team",
    icon: Users,
    title: "Team",
    subtitle: "Organizzazione, ruoli, anagrafica, accessi",
    description:
      "I team con i loro team lead, l'anagrafica degli operatori con l'anzianità calcolata in automatico, i ruoli (predefiniti o personalizzati, con visibilità su di sé, sul team o su tutti) e la gestione degli accessi admin via email.",
    primaryCta: { href: "/admin/team", label: "Gestisci il team" },
    secondaryCtas: [
      { href: "/admin/employee-profiles", label: "Profili" },
      { href: "/admin/ruoli", label: "Membri" },
    ],
  },
];

const linkAccent = { color: CP.accentSoftText, fontSize: 14, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 };
const chip = { padding: "5px 10px", background: CP.surfaceAlt, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 6, fontSize: 12, textDecoration: "none" };
const iconBox = { width: 36, height: 36, borderRadius: 8, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export default function WelcomePage() {
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body, color: CP.textPrimary }}>
      <PageHead
        title="HOC Pro, la console di House of Creators"
        subtitle="Qui trovi i risultati del lavoro in chat, la formazione, i compensi e l'organizzazione del team. I dati arrivano da CreatorsPro (vendite reali) e da Infloww (attività in chat)."
      />

      {/* Da dove partire: i due score */}
      <Link
        href="/welcome/score-friendly"
        style={{ ...card, display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", marginBottom: 28, textDecoration: "none", color: CP.textPrimary, flexWrap: "wrap" }}
      >
        <div style={{ ...iconBox, background: CP.accentSoft, border: "none" }}>
          <Sparkles size={18} color={CP.accentSoftText} />
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Prima volta qui? Parti dagli score</div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
            Ci sono due score: Vendite e Mestiere. Una guida in 7 passi con un esempio concreto spiega come si calcola Vendite; in ogni passo puoi fare domande.
          </div>
        </div>
        <span style={linkAccent}>Apri la guida <ArrowRight size={14} /></span>
      </Link>

      <SectionTitle aside="Ognuno vede le parti che servono al suo ruolo">I quattro moduli</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        {MODULES.map((m) => (
          <section key={m.key} style={{ ...card, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={iconBox}><m.icon size={18} strokeWidth={1.8} color={CP.textSecondary} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{m.title}</h3>
                <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 2 }}>{m.subtitle}</div>
              </div>
            </div>
            <p style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.55, margin: 0, flex: 1 }}>{m.description}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href={m.primaryCta.href} style={linkAccent}>{m.primaryCta.label} <ArrowRight size={14} /></Link>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {m.secondaryCtas.map((c) => (
                  <Link key={c.href} href={c.href} style={chip}>{c.label}</Link>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <Notice>
        Alcune pagine sono riservate a chi gestisce team e compensi. Se una pagina ti dice che non hai accesso, è normale: non è un errore.
      </Notice>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <LayoutDashboard size={16} color={CP.textMuted} />
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Cerchi il pannello di controllo?</h3>
          </div>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
            L&apos;hub admin raccoglie i numeri aggiornati, le azioni rapide e le scorciatoie a tutte le sezioni di amministrazione.
          </p>
          <Link href="/admin" style={{ ...linkAccent, fontSize: 13 }}>Vai all&apos;hub admin <ArrowRight size={13} /></Link>
        </section>

        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Layers size={16} color={CP.textMuted} />
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Ti servono tutti gli strumenti?</h3>
          </div>
          <p style={{ color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Nel menu a sinistra c&apos;è un selettore Essential / Advanced (icona a strati). In Advanced compaiono tutte le voci di ogni sezione, compresi Insights e Data &amp; Integrations.
          </p>
        </section>
      </div>
    </div>
  );
}
