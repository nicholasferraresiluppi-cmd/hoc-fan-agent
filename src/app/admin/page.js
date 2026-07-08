"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords, Crown,
  GraduationCap, BookOpen, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles,
  Workflow, RefreshCw, Ban, Languages, Tags, Upload, Sliders,
  UserCircle2, Contact, Medal, Key, Lock, Wrench,
  ArrowUpRight, Calendar, Activity, CheckCircle2, AlertCircle,
  Wallet, Scale,
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
      { href: "/profilo/certificazioni",  title: "Badge Wall",       desc: "Wall pubblico delle certificazioni operatori", icon: Award },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/dashboard",          title: "Dashboard SM",      desc: "KPI per operatore, trend 7/30g, alert", icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",     title: "Fan Archetypes",    desc: "Whale, Lonely, Negoziatore + strategie ottimali", icon: Sparkles },
      { href: "/admin/creators",           title: "Creator anagrafica", desc: "Tone card + ganci emotivi + vocabolario creator", icon: UserCog },
    ],
  },
  {
    label: "Content Pipeline",
    items: [
      { href: "/content-pipeline",          title: "Pipeline",  desc: "Flusso di content production end-to-end", icon: Workflow },
      { href: "/content-pipeline/queue",    title: "Queue",     desc: "Code attive: foto, edit, approval", icon: Activity },
    ],
  },
  {
    label: "People & Access",
    items: [
      { href: "/admin/action-center",     title: "Action Center", desc: "Lista underperformers + swap + export HR", icon: Target },
      { href: "/admin/coaching-center",   title: "Coaching Center", desc: "Operatori con margini di crescita + training mirato", icon: GraduationCap },
      { href: "/admin/team",              title: "Team",          desc: "Crea team + assegna operatori + nomina lead", icon: UserCircle2 },
      { href: "/admin/employee-profiles", title: "Profili",       desc: "Anagrafica completa + override KPI", icon: Contact },
      { href: "/admin/seniority",         title: "Seniority",     desc: "Tier Junior/Senior/Master + override manuale", icon: Medal },
      { href: "/admin/access",            title: "Accessi",       desc: "Aggiungi/rimuovi admin via email", icon: Key },
      { href: "/admin/ruoli",             title: "Ruoli",         desc: "Capabilities multi-ruolo predefiniti", icon: Lock },
      { href: "/admin/ruoli-custom",      title: "Ruoli custom",  desc: "Crea ruoli personalizzati con scope", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
    items: [
      { href: "/admin/creatorspro-sync",       title: "Sync CP",        desc: "Sincronizza wages + shifts CP (mensile)", icon: RefreshCw },
      { href: "/admin/infloww-agency",         title: "Revenue agency", desc: "Portfolio live: netto di tutte le creator, ranking", icon: Activity },
      { href: "/admin/infloww-revenue",        title: "Revenue live",   desc: "Ledger fan-by-fan di una creator, tempo reale", icon: Activity },
      { href: "/admin/leaderboard-import",     title: "Import Infloww", desc: "Carica CSV mensile/settimanale", icon: Upload },
      { href: "/admin/leaderboard-exclusions", title: "Esclusioni",     desc: "Operatori da nascondere dalle classifiche", icon: Ban },
      { href: "/admin/group-languages",        title: "Lingue Group",   desc: "Override regex per matching ITA/ENG", icon: Languages },
      { href: "/admin/group-categories",       title: "Categorie",      desc: "Classifica Group come Big/Medium/Small", icon: Tags },
      { href: "/admin/leaderboard-settings",   title: "Settings ladder", desc: "Pesi KPI + soglie + cutoff tier", icon: Sliders },
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
  const gapCheck = syncStatusData.data?.meta?.gap_check;
  const hasGap = gapCheck?.gap > 0;
  const syncOk = lastSync && (Date.now() - lastSync) < 7 * 24 * 3600 * 1000;

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

      {/* WAGE GAP BANNER — alert se l'ultimo sync ha lasciato wage mancanti */}
      {hasGap && (
        <Link
          href="/admin/wage-audit"
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 20px",
            marginBottom: 18,
            background: "linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.04) 100%)",
            border: "1px solid rgba(245,158,11,0.45)",
            borderRadius: 12,
            textDecoration: "none", color: CP.textPrimary,
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.20)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertCircle size={20} color="#F59E0B" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
              {gapCheck.gap} wage mancanti nel sync di {syncPeriod}
            </div>
            <div style={{ fontSize: 12, color: CP.textSecondary }}>
              KV: {gapCheck.kv_count} · CP API live: {gapCheck.cp_live_count}. Apri Wage Audit e clicca "Recupera tutti i mesi con gap" per riallineare lo storico.
            </div>
          </div>
          <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Vai a Wage Audit →</span>
        </Link>
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
          background: `linear-gradient(135deg, ${CP.accentGreen}18 0%, #A855F715 100%)`,
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>📚 Capisci come funziona lo Score (tutorial)</div>
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
            background: `linear-gradient(135deg, ${CP.accentBlue}18 0%, ${CP.accentBlue}05 100%)`,
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
          href="/admin/creatorspro-sync-history"
          style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 24px",
            background: `linear-gradient(135deg, ${CP.accentGreen}18 0%, ${CP.accentGreen}05 100%)`,
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
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sync CP storico (24 mesi)</div>
            <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
              Wizard automatico che popola lo storico CreatorsPro mese per mese (~1-3 min per mese).
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
        <Link href="/admin/coaching-center" style={{ ...quickActionStyle(), borderColor: "#F59E0B55", color: CP.textPrimary }}>
          <GraduationCap size={16} color="#F59E0B" />
          <span>Coaching Center — operatori da far crescere</span>
          <ArrowUpRight size={14} color="#F59E0B" />
        </Link>
        <Link href="/admin/pnl-live" style={{ ...quickActionStyle(), borderColor: "#3FB97E55", color: CP.textPrimary }}>
          <Wallet size={16} color="#3FB97E" />
          <span>P&L Live — margine per creator</span>
          <ArrowUpRight size={14} color="#3FB97E" />
        </Link>
        <Link href="/admin/profiles-compare" style={{ ...quickActionStyle(), borderColor: "#8b7cf655", color: CP.textPrimary }}>
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
