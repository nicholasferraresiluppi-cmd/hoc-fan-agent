"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords, Crown,
  GraduationCap, BookOpen, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders,
  UserCircle2, Contact, Medal, Key, Lock, Wrench, Link2, Gauge,
  ArrowUpRight, Calendar, Activity, CheckCircle2, AlertCircle,
  Wallet, Scale, ShieldCheck, History, FlaskConical, MessageSquareWarning,
  Signpost, Bell, ListTree, UserSquare,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, CpCard, StatCard } from "@/components/cp-style";

// Tollera 4xx/5xx: ritorna null invece di throware (stat cards mostrano "—")
const fetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtCurrencyShort(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return "$ " + (n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "k";
  return "$ " + n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtNum(v) { if (v == null) return "—"; return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function fmtRelativeTime(timestamp) {
  if (!timestamp) return "mai";
  const ms = Date.now() - timestamp;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  return `${d}g fa`;
}

const SHORTCUT_GROUPS = [
  {
    label: "Performance",
    items: [
      { href: "/leaderboard",                  title: "Ladder",        desc: "Classifica principale operatori", icon: Trophy },
      { href: "/leaderboard/sales-cp",         title: "Sales CP",      desc: "Score 0-100 da CreatorsPro", icon: DollarSign },
      { href: "/leaderboard/creators",         title: "Creator-first", desc: "Quanto rende ogni creator + team interno", icon: Users },
      { href: "/leaderboard/creators/heatmap", title: "Heat-map",      desc: "Score operatore × creator a colpo d'occhio", icon: Flame },
      { href: "/leaderboard/leghe",            title: "Leghe",         desc: "Tornei mensili + tier promozione/retrocessione", icon: Swords },
    ],
  },
  {
    label: "Training & Quality",
    items: [
      { href: "/admin/review",            title: "Review sessioni",  desc: "Valuta + correggi score AI sulle conversazioni", icon: ClipboardCheck },
      { href: "/admin/outcomes",          title: "Outcomes reali",   desc: "Revenue/PPV/retention per validare AI", icon: Target },
      { href: "/admin/sessions",          title: "Review chat",      desc: "Leggi le conversazioni complete con feedback affiancato", icon: Brain },
      { href: "/admin/qa-reviews",        title: "QA conversazioni", desc: "Rubrica §8.1: review qualità che alimentano i gate ladder", icon: ClipboardCheck },
      { href: "/profilo/certificazioni",  title: "Badge Wall",       desc: "Wall pubblico delle certificazioni operatori", icon: Award },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/dashboard",          title: "Dashboard SM",      desc: "KPI per operatore, trend 7/30g, alert", icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",     title: "Fan Archetypes",    desc: "Whale, Lonely, Negoziatore + strategie ottimali", icon: Sparkles },
      { href: "/admin/creators",           title: "Creator anagrafica", desc: "Tone card + ganci emotivi + vocabolario creator", icon: UserCog },
      { href: "/admin/roadmap",            title: "Roadmap",           desc: "Cosa è in corso, cosa viene dopo, cosa è parcheggiato e dietro quale gate", icon: Signpost },
    ],
  },
  {
    label: "People & Access",
    items: [
      { href: "/cm-cockpit",              title: "Cockpit CM",    desc: "Turno di supervisione: team live, soglie, override shadow", icon: Gauge },
      { href: "/admin/action-center",     title: "Action Center", desc: "Lista underperformers + swap + export HR", icon: Target },
      { href: "/admin/coaching-center",   title: "Coaching Center", desc: "Operatori con margini di crescita + training mirato", icon: GraduationCap },
      { href: "/admin/coaching-sessions", title: "Sessioni coaching", desc: "Sessioni strutturate: evidenze, impegni, conferma operatore", icon: GraduationCap },
      { href: "/admin/disputes",          title: "Contestazioni", desc: "Coda dispute score/compensi + risoluzione motivata", icon: MessageSquareWarning },
      { href: "/admin/team",              title: "Team",          desc: "Crea team + assegna operatori + nomina lead", icon: UserCircle2 },
      { href: "/admin/employee-profiles", title: "Profili",       desc: "Anagrafica completa + override KPI", icon: Contact },
      { href: "/admin/persone",           title: "Persone 360",   desc: "Timeline ciclo di vita operatore (assunzione → certificazioni → promozioni → uscita)", icon: UserSquare },
      { href: "/admin/seniority",         title: "Seniority",     desc: "Tier Junior/Senior/Master + override manuale", icon: Medal },
      { href: "/admin/access",            title: "Accessi",       desc: "Aggiungi/rimuovi admin via email", icon: Key },
      { href: "/admin/ruoli",             title: "Ruoli",         desc: "Capabilities multi-ruolo predefiniti", icon: Lock },
      { href: "/admin/ruoli-custom",      title: "Ruoli custom",  desc: "Crea ruoli personalizzati con scope", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
    items: [
      { href: "/admin/alerts",                 title: "Alert operativi", desc: "Check automatici: wage gap, fee, import fermi, sotto soglia", icon: Bell },
      { href: "/admin/creatorspro-sync",       title: "Sync CP",        desc: "Sincronizza wages + shifts CP (mensile)", icon: RefreshCw },
      { href: "/admin/wage-audit",             title: "Sync & Audit CP", desc: "Storico mese per mese: KV vs live CP, sync/ripara", icon: ShieldCheck },
      { href: "/admin/debug-mapping",          title: "Debug Mapping",  desc: "Perché un operatore risulta senza dati CP", icon: Link2 },
      { href: "/admin/user-mapping",           title: "Collega utenti", desc: "Utenti Clerk → operatore via roster Infloww (employeeId)", icon: Link2 },
      { href: "/admin/reports",                title: "Analytics",      desc: "Report Looker Studio dell'agency", icon: BarChart3 },
      { href: "/admin/infloww-agency",         title: "Revenue agency", desc: "Portfolio live: netto di tutte le creator, ranking", icon: Activity },
      { href: "/admin/infloww-revenue",        title: "Revenue live",   desc: "Ledger fan-by-fan di una creator, tempo reale", icon: Activity },
      { href: "/admin/infloww-reconcile",      title: "Controllo dati CP", desc: "Il venduto CP è completo? Confronto col reale Infloww", icon: ShieldCheck },
      { href: "/admin/payout-tree",            title: "Albero payout",  desc: "Turno → take CP → transazione fan + refund impact", icon: ListTree },
      { href: "/admin/leaderboard-import",     title: "Import Infloww", desc: "Carica CSV mensile/settimanale", icon: Upload },
      { href: "/admin/leaderboard-exclusions", title: "Esclusioni",     desc: "Operatori da nascondere dalle classifiche", icon: Ban },
      { href: "/admin/group-languages",        title: "Lingue Group",   desc: "Override regex per matching ITA/ENG", icon: Languages },
      { href: "/admin/group-categories",       title: "Categorie",      desc: "Classifica Group come Big/Medium/Small", icon: Tags },
      { href: "/admin/leaderboard-settings",   title: "Settings ladder", desc: "Pesi KPI + soglie + cutoff tier", icon: Sliders },
      { href: "/admin/score-config-history",   title: "Storico formula", desc: "Con quale formula è stato scorato ogni mese + drift", icon: History },
      { href: "/admin/score-config-drafts",    title: "Bozze formula",   desc: "Prova e backtest di una nuova formula prima del publish", icon: FlaskConical },
    ],
  },
];

export default function AdminHub() {
  const { user, isLoaded: userLoaded } = useUser();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const periodId = useMemo(() => currentMonthId(), []);

  useEffect(() => {
    fetch("/api/whoami")
      .then((r) => r.json())
      .then((d) => { setMe(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const notAdmin = !loading && me && !me.admin;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buonanotte";
    if (h < 12) return "Buongiorno";
    if (h < 18) return "Buon pomeriggio";
    return "Buonasera";
  }, []);

  // Stat live: sales CP + creator + sync status
  const salesCpData = useSWR(`/api/leaderboard/sales-cp?period_id=${periodId}`, fetcher);
  const creatorsData = useSWR(`/api/leaderboard/creators?period_id=${periodId}`, fetcher);
  const syncStatusData = useSWR(`/api/admin/creatorspro-sync`, fetcher);
  const closedLoopData = useSWR(`/api/admin/closed-loop-metrics?period_id=${periodId}`, fetcher);

  const agencySales = salesCpData.data?.agency?.total_sales;
  const totalShifts = salesCpData.data?.agency?.total_shifts;
  const operatorsCount = salesCpData.data?.eligible_total;
  const creatorsCount = creatorsData.data?.creators_count;
  const lastSync = syncStatusData.data?.meta?.last_sync_at;
  const syncPeriod = syncStatusData.data?.meta?.last_sync_period;
  const syncOk = lastSync && (Date.now() - lastSync) < 7 * 24 * 3600 * 1000;

  // Alert operativi (findings store — ADR docs/ALERT_OPERATIVI.md).
  // Sostituisce il vecchio banner wage hardcoded: wage-gap è il primo check migrato.
  const opsAlertsData = useSWR(`/api/admin/ops-alerts`, fetcher);
  const opsAlerts = opsAlertsData.data?.alerts || null;
  const opsOpen = (opsAlerts || []).filter((a) => a.status !== "resolved");
  const opsCrit = opsOpen.filter((a) => a.severity === "critical");
  const opsWarn = opsOpen.filter((a) => a.severity === "warning");

  const userName = user?.firstName || (me?.email || "").split("@")[0] || "Admin";

  return (
    <div style={{ padding: "32px 32px 64px 32px", maxWidth: 1500, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <SectionLabel>HUB · {periodId}</SectionLabel>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 38, margin: "8px 0 4px 0", fontWeight: 700, letterSpacing: "-0.02em", color: CP.textPrimary }}>
            {greeting}, {userName}
          </h1>
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Centro di controllo House of Creators. Tutti i tool, le metriche e le configurazioni in un unico posto.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {me?.admin && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: CP.accentGreen + "18", color: CP.accentGreen, borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Admin
            </span>
          )}
          {notAdmin && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: CP.accentRed + "18", color: CP.accentRed, borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
              <AlertCircle size={14} /> Non admin — accesso limitato
            </span>
          )}
        </div>
      </div>

      {/* Stat cards live */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 32 }}>
        <StatCard
          label="Sales agency (mese)"
          value={fmtCurrencyShort(agencySales)}
          sub={totalShifts ? `${fmtNum(totalShifts)} shift CP` : "—"}
          color={CP.accentGreen}
        />
        <StatCard
          label="Operatori attivi"
          value={fmtNum(operatorsCount)}
          sub={salesCpData.data?.no_cp_count ? `+${salesCpData.data.no_cp_count} no-CP` : null}
        />
        <StatCard
          label="Creator coperte"
          value={fmtNum(creatorsCount)}
          sub={creatorsData.data?.avg_sales_per_creator ? `avg ${fmtCurrencyShort(creatorsData.data.avg_sales_per_creator)} / creator` : null}
        />
        <StatCard
          label="Ultimo sync CP"
          value={syncOk ? fmtRelativeTime(lastSync) : "Vecchio"}
          sub={syncPeriod || "—"}
          color={syncOk ? CP.textPrimary : CP.accentRed}
        />
      </div>

      {/* ALERT OPERATIVI — top 3 dal findings store (sostituisce il banner wage) */}
      {opsAlerts !== null && (
        <div style={{
          marginBottom: 18, background: CP.surface,
          border: `1px solid ${opsCrit.length > 0 ? CP.accentRed + "55" : CP.border}`,
          borderRadius: 12, padding: "14px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Bell size={15} color={opsCrit.length > 0 ? CP.accentRed : CP.textMuted} />
              <span style={{ fontWeight: 600, fontSize: 14, color: CP.textPrimary }}>Alert operativi</span>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12, fontWeight: 600 }}>
              {opsCrit.length > 0 && <span style={{ color: CP.accentRed }}>{opsCrit.length} critici</span>}
              {opsWarn.length > 0 && <span style={{ color: CP.accentSoftText }}>{opsWarn.length} avvisi</span>}
              {opsOpen.length === 0 && <span style={{ color: CP.accentGreen, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={13} /> nessun problema rilevato</span>}
            </div>
          </div>
          {opsOpen.slice(0, 3).map((a) => (
            <div key={a.fingerprint} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, marginTop: 10, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: a.severity === "critical" ? CP.accentRed : CP.accentSoftText }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>
                    {a.value ? `${a.value} · ` : ""}{a.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 1 }}>
                    aperto {fmtRelativeTime(a.firstSeen)} · {a.status === "ack" ? `in carico: ${a.ackBy || "?"}` : "nessuno in carico"}
                  </div>
                </div>
              </div>
              {a.cta?.href && (
                <Link href={a.cta.href} style={{ color: CP.accentSoftText, fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                  {a.cta.label || "Apri"} →
                </Link>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${CP.borderSoft}`, marginTop: opsOpen.length === 0 ? 10 : 0, paddingTop: 10, textAlign: "center" }}>
            <Link href="/admin/alerts" style={{ color: CP.accentSoftText, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
              {opsOpen.length > 3 ? `Vedi tutti gli alert (${opsOpen.length} aperti) →` : "Vedi alert operativi e storico →"}
            </Link>
          </div>
        </div>
      )}

      {/* CLOSED-LOOP METRICS — il ciclo HR/coaching sta funzionando? */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div>
            <SectionLabel>Ciclo HR · Closed-loop</SectionLabel>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: CP.textPrimary, margin: "4px 0 0 0" }}>
              Le decisioni di questo mese hanno funzionato?
            </h3>
          </div>
          <span style={{ fontSize: 12, color: CP.textMuted }}>vs mese precedente</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <ClosedLoopCard
            label="Coaching effectiveness"
            value={closedLoopData.data?.coaching?.rate}
            unit="%"
            sub={closedLoopData.data?.coaching?.reason === "no_completed_coaching"
              ? "Nessun coaching completato il mese scorso"
              : closedLoopData.data?.coaching?.reason === "no_history"
              ? "Servono 2 mesi consecutivi di dati CP"
              : closedLoopData.data?.coaching
              ? `${closedLoopData.data.coaching.improved}/${closedLoopData.data.coaching.total} migliorati (≥5 pt score)`
              : "—"}
            color={CP.accentGreen}
            tooltip="% operatori che hanno completato un coaching nel mese precedente e sono migliorati di almeno 5 punti score CP nel mese corrente."
          />
          <ClosedLoopCard
            label="Swap success rate"
            value={closedLoopData.data?.swaps?.rate}
            unit="%"
            sub={closedLoopData.data?.swaps?.reason === "no_swaps_with_replacement"
              ? "Nessuna sostituzione marcata HR il mese scorso"
              : closedLoopData.data?.swaps?.reason === "no_history"
              ? "Servono 2 mesi consecutivi di dati CP"
              : closedLoopData.data?.swaps
              ? `${closedLoopData.data.swaps.success}/${closedLoopData.data.swaps.total} sostituti Good+ sulla creator`
              : "—"}
            color={CP.accentBlue}
            tooltip="% sostituzioni HR del mese precedente in cui il sostituto scelto risulta Good+ (score ≥50) sulla creator principale dell'operatore uscito."
          />
          <ClosedLoopCard
            label="Agency score trend"
            value={closedLoopData.data?.trend?.delta}
            unit=" pt"
            signed
            sub={closedLoopData.data?.trend?.reason === "no_history"
              ? "Servono 2 mesi consecutivi di dati CP"
              : closedLoopData.data?.trend?.current != null
              ? `Ora: ${closedLoopData.data.trend.current} · prima: ${closedLoopData.data.trend.previous}`
              : "—"}
            color={closedLoopData.data?.trend?.delta != null
              ? (closedLoopData.data.trend.delta >= 0 ? CP.accentGreen : CP.accentRed)
              : CP.textMuted}
            tooltip="Variazione score medio agency (media di tutti gli operatori con score CP) tra periodo corrente e precedente. È la metrica nord-stella: se sale, tutto il sistema sta migliorando."
          />
        </div>
      </div>

      {/* TUTORIAL SCORE — banner prominente */}
      <Link
        href="/welcome/score-friendly"
        style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "18px 22px",
          marginBottom: 14,
          background: CP.surface,
          border: `1px solid ${CP.accentGreen}55`,
          borderRadius: 14,
          textDecoration: "none", color: CP.textPrimary,
          transition: "transform 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = CP.accentGreen; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = CP.accentGreen + "55"; e.currentTarget.style.transform = "translateY(0)"; }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: CP.accentGreen + "22", border: `1px solid ${CP.accentGreen}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Sparkles size={20} color={CP.accentGreen} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>Capisci come funziona lo Score (tutorial)</div>
          <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
            Tutorial narrativo con esempi concreti + Q&amp;A interattivo. Puoi fare domande in qualsiasi punto se non ti torna.
          </div>
        </div>
        <ArrowUpRight size={18} color={CP.accentGreen} />
      </Link>

      {/* DATA INGESTION — banner prominente per popolare lo storico */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <Link
          href="/admin/leaderboard-import"
          style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 24px",
            background: CP.accentSoft,
            border: `1px solid ${CP.accentBlue}55`,
            borderRadius: 14,
            textDecoration: "none", color: CP.textPrimary,
            transition: "transform 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = CP.accentBlue; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = CP.accentBlue + "55"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: CP.accentBlue + "22", border: `1px solid ${CP.accentBlue}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Upload size={22} color={CP.accentBlue} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Carica file Infloww</div>
            <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
              Importa CSV/Excel &quot;By time and employee&quot; di Infloww per popolare la leaderboard Operativa.
            </div>
          </div>
          <ArrowUpRight size={18} color={CP.accentBlue} />
        </Link>

        <Link
          href="/admin/wage-audit"
          style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 24px",
            background: CP.surface,
            border: `1px solid ${CP.accentGreen}55`,
            borderRadius: 14,
            textDecoration: "none", color: CP.textPrimary,
            transition: "transform 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = CP.accentGreen; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = CP.accentGreen + "55"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: CP.accentGreen + "22", border: `1px solid ${CP.accentGreen}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <RefreshCw size={22} color={CP.accentGreen} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sync &amp; Audit CP</div>
            <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
              Storico mese per mese: confronta KV vs live CP e sincronizza/ripara i mesi con buchi.
            </div>
          </div>
          <ArrowUpRight size={18} color={CP.accentGreen} />
        </Link>
      </div>

      {/* Quick actions row */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 36 }}>
        <Link href={`/leaderboard/creators?period_id=${periodId}`} style={quickActionStyle()}>
          <Users size={16} />
          <span>Vai a Creator leaderboard</span>
          <ArrowUpRight size={14} color={CP.textMuted} />
        </Link>
        <Link href="/admin/creatorspro-sync" style={quickActionStyle()}>
          <RefreshCw size={16} />
          <span>Re-sync CP mese</span>
          <ArrowUpRight size={14} color={CP.textMuted} />
        </Link>
        <Link href={`/leaderboard/sales-cp?period_id=${periodId}`} style={quickActionStyle()}>
          <DollarSign size={16} />
          <span>Ranking Sales CP</span>
          <ArrowUpRight size={14} color={CP.textMuted} />
        </Link>
        <Link href="/admin/review" style={quickActionStyle()}>
          <ClipboardCheck size={16} />
          <span>Review sessioni AI</span>
          <ArrowUpRight size={14} color={CP.textMuted} />
        </Link>
        <Link href="/admin/action-center" style={{ ...quickActionStyle(), borderColor: CP.accentRed + "55", color: CP.textPrimary }}>
          <Target size={16} color={CP.accentRed} />
          <span>Action Center — operatori da cambiare</span>
          <ArrowUpRight size={14} color={CP.accentRed} />
        </Link>
        <Link href="/admin/coaching-center" style={{ ...quickActionStyle(), borderColor: CP.accentRed + "55", color: CP.textPrimary }}>
          <GraduationCap size={16} color={CP.accentRed} />
          <span>Coaching Center — operatori da far crescere</span>
          <ArrowUpRight size={14} color={CP.accentRed} />
        </Link>
        <Link href="/admin/pnl-live" style={{ ...quickActionStyle(), borderColor: CP.accentGreen + "55", color: CP.textPrimary }}>
          <Wallet size={16} color={CP.accentGreen} />
          <span>P&L Live — margine per creator</span>
          <ArrowUpRight size={14} color={CP.accentGreen} />
        </Link>
        <Link href="/admin/profiles-compare" style={{ ...quickActionStyle(), borderColor: CP.accent + "55", color: CP.textPrimary }}>
          <Scale size={16} color={CP.accent} />
          <span>Scaglioni a confronto — standardizzazione profili</span>
          <ArrowUpRight size={14} color={CP.accent} />
        </Link>
      </div>

      {/* Shortcut grouped */}
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 32 }}>
          <SectionLabel size={11} style={{ marginBottom: 14, display: "block" }}>{group.label}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "16px 18px",
                  background: CP.surface,
                  border: `1px solid ${CP.border}`,
                  borderRadius: 12,
                  textDecoration: "none",
                  color: CP.textPrimary,
                  transition: "background 0.15s, border-color 0.15s, transform 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CP.surfaceAlt;
                  e.currentTarget.style.borderColor = CP.borderStrong;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CP.surface;
                  e.currentTarget.style.borderColor = CP.border;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: CP.surfaceAlt,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  border: `1px solid ${CP.border}`,
                }}>
                  <item.icon size={18} color={CP.textPrimary} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: CP.textPrimary, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.45 }}>{item.desc}</div>
                </div>
                <ArrowUpRight size={14} color={CP.textMuted} />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function quickActionStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: CP.surface,
    border: `1px solid ${CP.border}`,
    borderRadius: 10,
    color: CP.textPrimary,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    transition: "background 0.15s",
  };
}

function ClosedLoopCard({ label, value, unit, sub, color, signed, tooltip }) {
  const display = value == null ? "—" : `${signed && value > 0 ? "+" : ""}${value}${unit || ""}`;
  return (
    <div
      title={tooltip || ""}
      style={{
        background: CP.surface,
        border: `1px solid ${color ? color + "33" : CP.border}`,
        borderRadius: 14,
        padding: "16px 18px",
        cursor: tooltip ? "help" : "default",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 10, color: CP.textMuted, letterSpacing: "0.12em", marginBottom: 6 }}>
        {label}{tooltip && <span style={{ marginLeft: 4, opacity: 0.4 }}>ⓘ</span>}
      </div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 32, lineHeight: 1, color: value == null ? CP.textMuted : color }}>
        {display}
      </div>
      {sub && <div style={{ fontSize: 11, color: CP.textSecondary, marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}
