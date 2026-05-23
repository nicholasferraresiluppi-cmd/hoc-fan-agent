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
  UserCircle2, IdCard, Medal, Key, Lock, Wrench,
  ArrowUpRight, Calendar, Activity, CheckCircle2, AlertCircle,
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
      { href: "/leaderboard/operational",      title: "Operativa",     desc: "KPI Infloww — sales/h, fan CVR, unlock rate", icon: BarChart3 },
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
      { href: "/admin/team",              title: "Team",          desc: "Crea team + assegna operatori + nomina lead", icon: UserCircle2 },
      { href: "/admin/employee-profiles", title: "Profili",       desc: "Anagrafica completa + override KPI", icon: IdCard },
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

  const agencySales = salesCpData.data?.agency?.total_sales;
  const totalShifts = salesCpData.data?.agency?.total_shifts;
  const operatorsCount = salesCpData.data?.eligible_total;
  const creatorsCount = creatorsData.data?.creators_count;
  const lastSync = syncStatusData.data?.meta?.last_sync_at;
  const syncPeriod = syncStatusData.data?.meta?.last_sync_period;
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
