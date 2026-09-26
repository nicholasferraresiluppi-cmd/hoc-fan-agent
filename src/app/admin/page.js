"use client";

// Hub (redesign 25/09/2026, struttura del pilota Calendario compensi):
// UNA domanda — "come va l'agenzia questo mese e cosa guardo oggi?".
// Numero principale col confronto → cosa guardare (alert aperti) → il ciclo
// coaching funziona? → strumenti, filtrati per ciò che il ruolo può aprire
// (nav-access) e cercabili. Tolti i banner e le "azioni rapide" doppioni.
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords,
  GraduationCap, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders,
  UserCircle2, Contact, Medal, Key, Lock, Wrench, Link2, Gauge,
  Calendar, Activity, MessagesSquare, Search,
  Wallet, Scale, ShieldCheck, History, FlaskConical, MessageSquareWarning,
  Signpost, Bell, ListTree, Inbox, Clapperboard, TrendingUp, UserSearch, UserCheck, Rocket,
  HandCoins, MessageCircle,
  Snowflake, Megaphone, Share2, Shield,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { canSee } from "@/lib/nav-access";
import { fmt$, fmtInt, fmtDelta, fmtAgo, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, ActionRow, card } from "@/components/ds";

// Tollera 4xx/5xx: ritorna null invece di throware (le metriche mostrano "—")
const fetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

function monthId(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SHORTCUT_GROUPS = [
  {
    label: "Compensi e margini",
    items: [
      { href: "/admin/pnl-live",          title: "P&L Live",            desc: "Margine per creator: venduto, costo operatori, fee", icon: Wallet },
      { href: "/admin/comp-calendar",     title: "Calendario compensi", desc: "Quanto costa ogni giorno di turni e perché, con simulatore", icon: Calendar },
      { href: "/admin/profiles-compare",  title: "Scaglioni a confronto", desc: "Standardizzazione dei profili di pagamento", icon: Scale },
    ],
  },
  {
    label: "Performance",
    items: [
      { href: "/leaderboard",                  title: "Classifica allenamento",        desc: "Classifica principale operatori", icon: Trophy },
      { href: "/leaderboard/sales-cp",         title: "Sales CP",      desc: "Score 0-100 da CreatorsPro", icon: DollarSign },
      { href: "/leaderboard/creators",         title: "Creator-first", desc: "Quanto rende ogni creator + team interno", icon: Users },
      { href: "/leaderboard/creators/heatmap", title: "Mappa operatore×creator",      desc: "Score operatore × creator a colpo d'occhio", icon: Flame },
      { href: "/admin/conversation-intelligence", title: "Presidio chat", desc: "Latenza risposta, % entro 5 min e response rate per creator (dai transcript, solo metadati)", icon: Activity },
      { href: "/admin/sales-coaching", title: "Coaching vendite", desc: "Per split: quanto comprano in chat i fan mai paganti, chi vende meglio a parità di pagina, cosa fa vendere, pagine e operatori modello di HOC, test in corso ed esempi da far studiare", icon: HandCoins },
      { href: "/admin/shift-quality", title: "Qualità turni", desc: "Turno×operatore: conversazioni, funnel PPV, venduto e analisi contenuto — attribuzione onesta singolo/duo", icon: MessagesSquare },
      { href: "/leaderboard/leghe",            title: "Leghe",         desc: "Tornei mensili + tier promozione/retrocessione", icon: Swords },
    ],
  },
  {
    label: "Training & Quality",
    items: [
      { href: "/guida",                   title: "Guida strumenti",  desc: "Il funnel degli strumenti per ruolo (operatore, manager, leadership, HR) — onboarding e reference", icon: Signpost },
      { href: "/admin/review",            title: "Revisione voti AI",  desc: "Valuta + correggi score AI sulle conversazioni", icon: ClipboardCheck },
      { href: "/admin/outcomes",          title: "Risultati reali",   desc: "Revenue/PPV/retention per validare AI", icon: Target },
      { href: "/admin/sessions",          title: "Sessioni simulatore",      desc: "Leggi le conversazioni complete con feedback affiancato", icon: Brain },
      { href: "/admin/qa-reviews",        title: "QA conversazioni", desc: "Rubrica §8.1: review qualità che alimentano i gate ladder", icon: ClipboardCheck },
      { href: "/academy/vendere",         title: "Vendere in chat",  desc: "Per gli operatori: le quattro abitudini che fanno comprare chi non ha mai comprato, checklist, esercizi ed esempi approvati", icon: MessageCircle },
      { href: "/admin/academy-tapes",     title: "Game tape",        desc: "Estrai le migliori azioni di vendita reali dal warehouse e pubblicale in Academy", icon: Clapperboard },
      { href: "/admin/creator-difficulty", title: "Difficoltà creator", desc: "Quanto è 'freddo' o 'caldo' il pubblico di ogni creator: il contesto prima di giudicare chi ci lavora", icon: Snowflake },
      { href: "/admin/academy-signals",   title: "Cosa fa vendere",          desc: "Quali comportamenti operatore correlano col revenue/ora, dai turni reali — informa il coaching", icon: TrendingUp },
      { href: "/admin/operator-signals",  title: "Profilo operatore", desc: "Dove ogni operatore è carente, dal suo lavoro vero (turni singoli): diagnosi per il coaching su misura", icon: UserSearch },
      { href: "/admin/activation",        title: "Attivazione",       desc: "L'aha moment dell'operatore (gap diagnosticato + allenato) come leading indicator: funnel, rate, latenza — strumentato, validato in avanti sui segnali reali", icon: Rocket },
      { href: "/admin/infloww-ingest",    title: "Carica export Infloww",    desc: "Carica l'export Message Dashboard per operatore → estende la copertura dei segnali ai turni in duo", icon: Upload },
      { href: "/profilo/certificazioni",  title: "Certificazioni",       desc: "Wall pubblico delle certificazioni operatori", icon: Award },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/utilizzo",           title: "Utilizzo app",      desc: "Chi usa HOC Pro, pagine più usate e mai aperte, cosa migliorare", icon: Activity },
      { href: "/admin/dashboard",          title: "Allenamento operatori",      desc: "KPI per operatore, trend 7/30g, alert", icon: LayoutDashboard },
      { href: "/admin/fan-archetypes",     title: "Tipi di fan",    desc: "Whale, Lonely, Negoziatore + strategie ottimali", icon: Sparkles },
      { href: "/admin/creators",           title: "Voce delle creator", desc: "Tone card + ganci emotivi + vocabolario creator", icon: UserCog },
      { href: "/admin/loop",               title: "Loop azione→esito", desc: "La coda registrata giorno per giorno e l'esito 48h (risposta + acquisto): il dataset proprietario che si accumula", icon: RefreshCw },
      { href: "/admin/roadmap",            title: "Roadmap",           desc: "Cosa è in corso, cosa viene dopo, cosa è parcheggiato e dietro quale gate", icon: Signpost },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/ads", title: "Studio bio-funnel", desc: "Come lavorano gli altri sulla landing-ponte OF e cosa converte meglio: 112 landing reali analizzate + template per le creator", icon: Megaphone },
      { href: "/admin/social-accounts", title: "Account social", desc: "Account di promozione dei creator + proxy assegnato", icon: Share2 },
      { href: "/admin/social-proxies", title: "Proxy account social", desc: "Proxy SOCKS5/HTTP per isolare le connessioni degli account social ufficiali dei creator", icon: Shield },
    ],
  },
  {
    label: "People & Access",
    items: [
      { href: "/cm-cockpit",              title: "Cockpit CM",    desc: "Turno di supervisione: team live, soglie, override shadow", icon: Gauge },
      { href: "/admin/candidate-assessments", title: "Assessment candidati", desc: "Simulatore Academy come test pre-assunzione: crea link, leggi il report (segnale per HR, non gate), registra l'esito", icon: UserCheck },
      { href: "/admin/priority-queue",    title: "Fan da seguire ora", desc: "Quale fan seguire ora per creator: whale in attesa o in raffreddamento, ordinati per valore", icon: Inbox },
      { href: "/admin/action-center",     title: "Action Center", desc: "Lista underperformers + swap + export HR", icon: Target },
      { href: "/admin/coaching-center",   title: "Coaching Center", desc: "Operatori con margini di crescita + training mirato", icon: GraduationCap },
      { href: "/admin/coaching-sessions", title: "Sessioni coaching", desc: "Sessioni strutturate: evidenze, impegni, conferma operatore", icon: GraduationCap },
      { href: "/admin/disputes",          title: "Contestazioni", desc: "Coda dispute score/compensi + risoluzione motivata", icon: MessageSquareWarning },
      { href: "/admin/team",              title: "Team",          desc: "Crea team + assegna operatori + nomina lead", icon: UserCircle2 },
      { href: "/admin/employee-profiles", title: "Profili",       desc: "Anagrafica completa + override KPI", icon: Contact },
      { href: "/admin/seniority",         title: "Seniority",     desc: "Tier Junior/Senior/Master + override manuale", icon: Medal },
      { href: "/admin/access",            title: "Accessi",       desc: "Aggiungi/rimuovi admin via email", icon: Key },
      { href: "/admin/ruoli",             title: "Membri",        desc: "Chi ha accesso e con che ruolo + Aggiungi membro (invito via email)", icon: Lock },
      { href: "/admin/ruoli-custom",      title: "Ruoli custom",  desc: "Crea ruoli personalizzati con scope", icon: Wrench },
    ],
  },
  {
    label: "Data & Integrations",
    items: [
      { href: "/admin/alerts",                 title: "Alert operativi", desc: "Check automatici: wage gap, fee, import fermi, sotto soglia", icon: Bell },
      { href: "/admin/creatorspro-sync",       title: "Sync CP",        desc: "Sincronizza wages + shifts CP (mensile)", icon: RefreshCw },
      { href: "/admin/wage-audit",             title: "Sync & Audit CP", desc: "Storico mese per mese: KV vs live CP, sync/ripara", icon: ShieldCheck },
      { href: "/admin/creatorspro-sync-history", title: "Storico sync CP", desc: "Storico dei job di sincronizzazione CreatorsPro", icon: History },
      { href: "/admin/debug-mapping",          title: "Operatori senza dati CP",  desc: "Perché un operatore risulta senza dati CP", icon: Link2 },
      { href: "/admin/user-mapping",           title: "Collega utenti", desc: "Utenti Clerk → operatore via roster Infloww (employeeId)", icon: Link2 },
      { href: "/admin/reports",                title: "Report Looker",      desc: "Report Looker Studio dell'agency", icon: BarChart3 },
      { href: "/admin/infloww-agency",         title: "Revenue agency", desc: "Portfolio live: netto di tutte le creator, ranking", icon: Activity },
      { href: "/admin/infloww-revenue",        title: "Revenue live",   desc: "Ledger fan-by-fan di una creator, tempo reale", icon: Activity },
      { href: "/admin/infloww-reconcile",      title: "Controllo dati CP", desc: "Il venduto CP è completo? Confronto col reale Infloww", icon: ShieldCheck },
      { href: "/admin/payout-tree",            title: "Albero payout",  desc: "Turno → take CP → transazione fan + refund impact", icon: ListTree },
      { href: "/admin/leaderboard-import",     title: "Import Infloww", desc: "Carica CSV mensile/settimanale", icon: Upload },
      { href: "/admin/leaderboard-exclusions", title: "Esclusioni",     desc: "Operatori da nascondere dalle classifiche", icon: Ban },
      { href: "/admin/group-languages",        title: "Lingua dei gruppi",   desc: "Override regex per matching ITA/ENG", icon: Languages },
      { href: "/admin/group-categories",       title: "Categorie dei gruppi",      desc: "Classifica Group come Big/Medium/Small", icon: Tags },
      { href: "/admin/leaderboard-settings",   title: "Impostazioni mestiere", desc: "Pesi KPI + soglie + cutoff tier", icon: Sliders },
      { href: "/admin/score-config-history",   title: "Storico formula", desc: "Con quale formula è stato scorato ogni mese + drift", icon: History },
      { href: "/admin/score-config-drafts",    title: "Bozze formula",   desc: "Prova e backtest di una nuova formula prima del publish", icon: FlaskConical },
    ],
  },
];

export default function AdminHub() {
  const { user } = useUser();
  const [q, setQ] = useState("");
  const now = useMemo(() => new Date(), []);
  const periodId = monthId(now);
  const prevId = monthId(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const monthName = MONTHS_IT[now.getMonth()];

  const { data: me } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: false });
  const { data: sales } = useSWR(`/api/leaderboard/sales-cp?period_id=${periodId}`, fetcher);
  const { data: salesPrev } = useSWR(`/api/leaderboard/sales-cp?period_id=${prevId}`, fetcher);
  const { data: creators } = useSWR(`/api/leaderboard/creators?period_id=${periodId}`, fetcher);
  const { data: sync } = useSWR(`/api/admin/creatorspro-sync`, fetcher);
  const { data: loop } = useSWR(`/api/admin/closed-loop-metrics?period_id=${periodId}`, fetcher);
  const { data: alertsData } = useSWR(`/api/admin/ops-alerts`, fetcher);

  const greeting = useMemo(() => {
    const h = now.getHours();
    return h < 6 ? "Buonanotte" : h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  }, [now]);
  const userName = user?.firstName || (me?.email || "").split("@")[0] || "";

  // Numero principale: venduto del mese + ritmo. Il mese scorso è intero, questo
  // no: il confronto onesto è la PROIEZIONE al ritmo dei giorni chiusi (stima).
  const soFar = sales?.agency?.total_sales;
  const prevTotal = salesPrev?.agency?.total_sales;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysClosed = Math.max(1, now.getDate() - 1);
  const projection = soFar ? (soFar / daysClosed) * daysInMonth : null;
  // Stile Casa: la frase sotto il saluto dice com'è andata, dalla stessa proiezione del numero
  const prevName = MONTHS_IT[(now.getMonth() + 11) % 12];
  const curName = monthName ? monthName[0].toUpperCase() + monthName.slice(1) : "";
  const paceLine = projection && prevTotal
    ? projection < prevTotal * 0.97 ? `${curName} corre un po' più piano di ${prevName}.`
      : projection > prevTotal * 1.03 ? `${curName} corre più veloce di ${prevName}.`
      : `${curName} va al passo di ${prevName}.`
    : null;
  const lastSync = sync?.meta?.last_sync_at;
  const syncStale = !lastSync || Date.now() - lastSync > 36 * 3600 * 1000;

  const open = (alertsData?.alerts || []).filter((a) => a.status !== "resolved")
    .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));

  const allowed = (href) => !me?.authenticated || canSee(href, me.capabilities, me.admin);
  const needle = q.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => allowed(it.href) && (!needle || `${it.title} ${it.desc}`.toLowerCase().includes(needle))),
  })).filter((g) => g.items.length);

  const trend = loop?.trend;
  const loopNote = (x, fallback) => x?.reason === "no_history" ? "servono 2 mesi di dati" : x?.reason ? fallback : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        title={`${greeting}${userName ? `, ${userName}` : ""}.`}
        line2={paceLine}
        subtitle={`Come va l'agenzia a ${monthName} e cosa guardare oggi.`}
      />

      <HeroMetric
        label={`Venduto agenzia · ${monthName} finora`}
        value={fmt$(soFar)}
        compare={projection && prevTotal ? `A questo ritmo ~${fmt$(projection)} a fine mese · ${MONTHS_IT[(now.getMonth() + 11) % 12]} intero: ${fmt$(prevTotal)} (${fmtDelta(projection, prevTotal)})` : prevTotal ? `${MONTHS_IT[(now.getMonth() + 11) % 12]} intero: ${fmt$(prevTotal)}` : null}
        hint={sync ? `Dati CreatorsPro aggiornati ${fmtAgo(lastSync)}${syncStale ? " — più vecchi del solito, controlla il sync" : ""}` : null}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Metric label="Operatori attivi" value={fmtInt(sales?.eligible_total)} delta={fmtDelta(sales?.eligible_total, salesPrev?.eligible_total)} />
          <Metric label="Creator" value={fmtInt(creators?.creators_count)} />
          <Metric label="Turni" value={fmtInt(sales?.agency?.total_shifts)} />
          <Metric label="Venduto per turno" value={fmt$(sales?.agency?.avg_sales_per_shift)} delta={fmtDelta(sales?.agency?.avg_sales_per_shift, salesPrev?.agency?.avg_sales_per_shift)} />
        </div>
      </HeroMetric>

      {alertsData && (
        <section className="ds-open" style={{ ...card, marginBottom: 14 }}>
          <div className="ds-open-h" style={{ padding: "14px 16px 10px" }}>
            <SectionTitle aside={open.length ? `${open.length} aperti, i più gravi prima` : null}>Da guardare oggi</SectionTitle>
          </div>
          {open.length === 0 && (
            <div style={{ padding: "12px 16px 16px", fontSize: 14, color: CP.textSecondary, borderTop: `1px solid ${CP.borderSoft}` }}>
              Nessun problema rilevato dai controlli automatici (dati, sync, compensi).
            </div>
          )}
          {open.slice(0, 5).map((a) => (
            <ActionRow key={a.fingerprint} severity={a.severity}
              title={`${a.value ? `${a.value} · ` : ""}${a.title}`}
              detail={`aperto ${fmtAgo(a.firstSeen)} · ${a.status === "ack" ? `in carico a ${a.ackBy || "?"}` : "nessuno in carico"}`}
              href={a.cta?.href && allowed(a.cta.href.split("?")[0]) ? a.cta.href : null} cta={a.cta?.label} />
          ))}
          <div className="ds-open-f" style={{ padding: "10px 16px", borderTop: `1px solid ${CP.borderSoft}` }}>
            <Link href="/admin/alerts" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>
              {open.length > 5 ? `Tutti gli alert (${open.length}) →` : "Alert e storico →"}
            </Link>
          </div>
        </section>
      )}

      {loop && (
        <section className="ds-open" style={{ ...card, padding: "14px 16px", marginBottom: 24 }}>
          <SectionTitle aside="coaching e sostituzioni del mese scorso, misurati su questo">Le decisioni sulle persone funzionano?</SectionTitle>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <Metric label="Migliorati dopo il coaching" value={loop.coaching?.rate != null ? `${loop.coaching.rate}%` : "—"}
              note={loop.coaching?.total ? `${loop.coaching.improved} su ${loop.coaching.total}, almeno +5 punti` : loopNote(loop.coaching, "nessun coaching completato")} />
            <Metric label="Sostituzioni riuscite" value={loop.swaps?.rate != null ? `${loop.swaps.rate}%` : "—"}
              note={loop.swaps?.total ? `${loop.swaps.success} su ${loop.swaps.total}, sostituto con score ≥ 50` : loopNote(loop.swaps, "nessuna sostituzione")} />
            <Metric label="Score medio agenzia" value={trend?.current != null ? String(trend.current).replace(".", ",") : "—"}
              note={trend?.delta != null ? `${trend.delta > 0 ? "+" : trend.delta < 0 ? "−" : ""}${String(Math.abs(trend.delta)).replace(".", ",")} punti sul mese prima` : loopNote(trend, "")} />
          </div>
        </section>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 className="ds-sect" style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary, flex: "1 1 auto" }}>Strumenti</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", border: `1px solid ${CP.border}`, borderRadius: 8, background: CP.surface, flex: "0 1 320px" }}>
          <Search size={14} color={CP.textMuted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca uno strumento…" aria-label="Cerca uno strumento"
            style={{ border: "none", outline: "none", background: "transparent", color: CP.textPrimary, fontSize: 14, width: "100%", fontFamily: FONTS.body }} />
        </label>
      </div>
      {groups.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted }}>Nessuno strumento corrisponde a “{q}”.</div>}
      {groups.map((g) => (
        <section key={g.label} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className="hub-tool"
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", ...card, textDecoration: "none", color: CP.textPrimary }}>
                <it.icon size={16} color={CP.textMuted} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{it.title}</div>
                  <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.45, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <style>{`.hub-tool:hover{background:${CP.surfaceAlt} !important}`}</style>
    </div>
  );
}
