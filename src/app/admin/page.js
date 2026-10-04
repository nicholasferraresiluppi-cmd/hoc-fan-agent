"use client";

// Hub (redesign 25/09/2026, struttura del pilota Calendario compensi):
// UNA domanda — "come va l'agenzia questo mese e cosa guardo oggi?".
// Numero principale col confronto → cosa guardare (alert aperti) → il ciclo
// coaching funziona? → strumenti, filtrati per ciò che il ruolo può aprire
// (nav-access) e cercabili. Tolti i banner e le "azioni rapide" doppioni.
import { collapseItems } from "@/lib/page-groups";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import {
  Trophy, BarChart3, DollarSign, Users, Flame, Swords,
  GraduationCap, ClipboardCheck, Target, Brain, Award,
  LayoutDashboard, UserCog, Sparkles, Bot,
  RefreshCw, Ban, Languages, Tags, Upload, Sliders,
  UserCircle2, Contact, Medal, Key, Lock, Wrench, Link2, Gauge,
  Calendar, Activity, MessagesSquare, Search,
  Wallet, Scale, ShieldCheck, History, FlaskConical, MessageSquareWarning,
  Signpost, Bell, ListTree, Inbox, Clapperboard, TrendingUp, UserSearch, UserCheck, Rocket,
  HandCoins, MessageCircle,
  Snowflake, Megaphone, Share2, Shield, Building2, BookUser,
  BookMarked,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { canSee } from "@/lib/nav-access";
import { WORKSPACES, workspaceSections } from "@/lib/workspaces";
import { fmt$, fmtInt, fmtDelta, fmtAgo, MONTHS_IT } from "@/lib/format";
import { useStyle } from "@/lib/theme-client";
import { PageHead, HeroMetric, Metric, SectionTitle, ActionRow, card } from "@/components/ds";
import { isEarlyMonth } from "@/lib/use-smart-period";

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

const SHORTCUT_GROUPS_RAW = [
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
      { href: "/leaderboard/sales-cp",         title: "Classifica vendite", desc: "Score 0-100 da CreatorsPro", icon: DollarSign },
      { href: "/leaderboard/creators",         title: "Creator", desc: "Quanto rende ogni creator + team interno", icon: Users },
      { href: "/leaderboard/creators/heatmap", title: "Mappa operatore×creator",      desc: "Score operatore × creator a colpo d'occhio", icon: Flame },
      { href: "/admin/conversation-intelligence", title: "Presidio chat", desc: "Latenza risposta, % entro 5 min e response rate per creator (dai transcript, solo metadati)", icon: Activity },
      { href: "/admin/sales-coaching", title: "Coaching vendite", desc: "Per split: quanto comprano in chat i fan mai paganti, chi vende meglio a parità di pagina, cosa fa vendere, pagine e operatori modello di HOC, test in corso ed esempi da far studiare", icon: HandCoins },
      { href: "/admin/sales-ai", title: "Sales manager AI", desc: "Ogni notte: due manager AI leggono i turni del giorno prima, un arbitro scrive il feedback, il Garante blocca gli errori. Li rivedi qui prima che arrivino agli operatori", icon: Bot },
      { href: "/admin/manuale-vendite", title: "Manuale vendite", desc: "Cosa fa vendere davvero, su 26 mesi di chat: capitoli del manuale, guide di profilo con le risposte da provare e prove sul campo misurate ogni lunedì", icon: BookMarked },
      { href: "/admin/shift-quality", title: "Qualità turni", desc: "Turno×operatore: conversazioni, funnel PPV, venduto e analisi contenuto — attribuzione onesta singolo/duo", icon: MessagesSquare },
      { href: "/leaderboard/leghe",            title: "Leghe",         desc: "Tornei mensili + tier promozione/retrocessione", icon: Swords },
    ],
  },
  {
    label: "Training & Quality",
    items: [
      { href: "/cultura",                 title: "Come lavoriamo",   desc: "Cinque pratiche, feedback e Spark: la cultura di HOC, come invito", icon: Users },
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
      { href: "/admin/transfer",          title: "Transfer (Kirkpatrick 3-4)", desc: "Il comportamento di ogni operatore si muove sul campo, mese per mese? Traiettoria reale + eventi di coaching. Osservazionale, non causale", icon: Activity },
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
      { href: "/admin/sede",               title: "La Sede",           desc: "L'azienda come uffici (persone, codice, AI): chi ha lavorato davvero, chi controlla chi, chi ne risponde e dove manca un pezzo", icon: Building2 },
      { href: "/admin/citta",              title: "La città",          desc: "L'azienda come una città: un palazzo per ogni creator e area, altezza = cose aperte, luci = ritardi (da ClickUp)", icon: Building2 },
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
      { href: "/admin/hr",                title: "Persone HR",    desc: "CRM persone (HOC Pro è il master): anagrafica, rapporto, contratto, documenti e storico, sincronizzato con la lista HR di ClickUp; link di compilazione per la persona", icon: BookUser },
      { href: "/admin/hr/sync",           title: "Sincronizzazione ClickUp", desc: "Lista configurata, webhook, ultimo import, conflitti: import completo e registrazione webhook", icon: RefreshCw },
      { href: "/admin/candidate-assessments", title: "Assessment candidati", desc: "Simulatore Academy come test pre-assunzione: crea link, leggi il report (segnale per HR, non gate), registra l'esito", icon: UserCheck },
      { href: "/admin/priority-queue",    title: "Fan da seguire ora", desc: "Quale fan seguire ora per creator: whale in attesa o in raffreddamento, ordinati per valore", icon: Inbox },
      { href: "/admin/settimana",          title: "Da seguire", desc: "Chi seguire questa settimana: sotto soglia, cali forti, chi può crescere", icon: Target },
      { href: "/admin/coaching-center",   title: "Da far crescere", desc: "Operatori con margini di crescita + training mirato", icon: GraduationCap },
      { href: "/admin/coaching-sessions", title: "Sessioni coaching", desc: "Sessioni strutturate: evidenze, impegni, conferma operatore", icon: GraduationCap },
      { href: "/admin/disputes",          title: "Contestazioni", desc: "Coda dispute score/compensi + risoluzione motivata", icon: MessageSquareWarning },
      { href: "/admin/team",              title: "Team",          desc: "Crea team + assegna operatori + nomina lead", icon: UserCircle2 },
      { href: "/admin/employee-profiles", title: "Profili operatori",       desc: "Anagrafica completa + override KPI", icon: Contact },
      { href: "/admin/seniority",         title: "Seniority",     desc: "Tier Junior/Senior/Master + override manuale", icon: Medal },
      { href: "/admin/ruoli",             title: "Membri",        desc: "Chi ha accesso, chi è admin, con che ruolo + Aggiungi membro", icon: Lock },
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
      { href: "/admin/infloww-agency",         title: "Incassi Infloww", desc: "Portfolio live: netto di tutte le creator, ranking", icon: Activity },
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
// pagine dello stesso compito unite come schede (lib/page-groups): una sola voce per gruppo
const SHORTCUT_GROUPS = SHORTCUT_GROUPS_RAW.map((g) => ({ ...g, items: collapseItems(g.items, "title") }));
// descrizione e icona di ogni strumento (anche quelli raccolti in schede), per "I tuoi strumenti" della mansione
const TOOL_BY_HREF = new Map(SHORTCUT_GROUPS_RAW.flatMap((g) => g.items.map((i) => [i.href, i])));

export default function AdminHub() {
  const { user } = useUser();
  const [q, setQ] = useState("");
  const now = useMemo(() => new Date(), []);
  const periodId = monthId(now);
  const prevId = monthId(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const monthName = MONTHS_IT[now.getMonth()];

  const { data: me } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: false });
  // Mansione (lib/workspaces): HR non ha bisogno del venduto; chi vede solo alcune creator vede i LORO numeri
  const ws = me?.workspace?.id;
  const wsOn = Boolean(ws && ws !== "all");
  const isHr = ws === "hr";
  const partial = Boolean(me?.creators && !me.creators.all);
  const noCreators = partial && !me.creators.count;
  const wantSales = Boolean(me) && !isHr && !noCreators;
  // venduto UFFICIALE (tutti i turni CP, = P&L Live) e confronto allo stesso giorno del mese prima (lib/agency-sales-core)
  const { data: agency } = useSWR(wantSales ? `/api/leaderboard/agency-sales?period_id=${periodId}` : null, fetcher);
  const { data: sync } = useSWR(`/api/admin/creatorspro-sync`, fetcher);
  // il ciclo coaching/sostituzioni è di tutta l'agenzia: solo per chi vede tutte le creator
  // a inizio mese il ciclo si legge sul mese chiuso, come la Classifica (prima: 51,1 qui e 47,4 lì, due mesi diversi)
  const loopPeriod = isEarlyMonth(now) ? prevId : periodId;
  const { data: loop } = useSWR(me && !isHr && !partial ? `/api/admin/closed-loop-metrics?period_id=${loopPeriod}` : null, fetcher);
  // Decisioni in attesa (prova d'uso Board, 3ª: "per sapere cosa aspetta me devo scorrere 53 schede"): le voci
  // "Da decidere" della Roadmap, le più vecchie prima. Solo per le viste Board e Tutti (la Roadmap è admin).
  const wantDecisions = ws === "board" || ws === "all";
  const { data: roadmap } = useSWR(wantDecisions ? "/api/admin/roadmap" : null, fetcher, { revalidateOnFocus: false });
  const [showAll, setShowAll] = useState(false);
  const { data: alertsData } = useSWR(`/api/admin/ops-alerts`, fetcher);

  const greeting = useMemo(() => {
    const h = now.getHours();
    return h < 6 ? "Buonanotte" : h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  }, [now]);
  const userName = user?.firstName || (me?.email || "").split("@")[0] || "";

  // Numero principale: il venduto ufficiale del mese finora. Il confronto onesto è con lo STESSO numero di
  // giorni chiusi del mese prima (prova d'uso 03/10: "2 giorni contro settembre intero" dava un −37% falso).
  const prevName = MONTHS_IT[(now.getMonth() + 11) % 12];
  const curName = monthName ? monthName[0].toUpperCase() + monthName.slice(1) : "";
  const cmp = agency?.compare;
  const dSales = cmp?.delta_pct?.sales;
  const fmtPct = (v) => (v == null ? null : `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(Math.abs(v)).replace(".", ",")}%`);
  // Verdetto in una riga (prova d'uso Board: "mi dai −16% e lasci a me il giudizio"): prima l'affidabilità
  // del dato, poi la direzione. Sotto i 5 giorni chiusi il confronto è dichiarato provvisorio.
  const FEW_DAYS = 5;
  const dir = dSales == null ? null : dSales < -3 ? "sotto" : dSales > 3 ? "sopra" : "in linea con";
  const paceLine = !cmp || !cmp.until_day || dir == null ? null
    : agency?.incomplete ? `Dato da verificare: ci sono controlli aperti sui dati di vendita (vedi "Dati incompleti").`
    : cmp.until_day < FEW_DAYS ? `Per ora ${dir} ${prevName}, ma con ${cmp.until_day} ${cmp.until_day === 1 ? "giorno chiuso" : "giorni chiusi"} è un'indicazione, non un giudizio.`
    : `${curName} è ${dir} ${prevName} allo stesso giorno (${fmtPct(dSales)}).`;
  const compareLine = !agency?.current ? null
    : cmp && cmp.until_day === 0 ? `Il confronto con ${prevName} parte da domani, col primo giorno chiuso · ${prevName} intero: ${fmt$(agency.prev_full?.sales)}`
    : cmp ? `Allo stesso giorno: ${fmtPct(dSales) || "—"} su ${prevName} (1-${cmp.until_day} ${monthName}: ${fmt$(cmp.current.sales)} contro ${fmt$(cmp.prev.sales)})`
    : `${prevName} intero: ${fmt$(agency.prev_full?.sales)}`;
  // added_at in KV è una data ISO (stringa), non un numero
  const ts = (v) => (typeof v === "number" ? v : Date.parse(v || "") || 0);
  const decisions = Object.values(roadmap?.items || {})
    .filter((i) => /decidere/i.test(i.area || "") && (i.status === "now" || i.status === "next"))
    .sort((a, b) => (a.status === b.status ? ts(a.added_at) - ts(b.added_at) : a.status === "now" ? -1 : 1));
  const daysAgo = (t) => (ts(t) ? Math.max(0, Math.floor((Date.now() - ts(t)) / 86400000)) : null);
  // metriche sulla stessa base del confronto (giorni chiusi), o sul mese intero se il mese è passato
  const base = cmp?.until_day ? cmp.current : agency?.current;
  const basePrev = cmp?.until_day ? cmp.prev : agency?.prev_full;
  const perShift = (x) => (x?.shifts ? x.sales / x.shifts : null);
  const dl = cmp?.until_day ? `su ${prevName}, stessi giorni` : "sul mese prima";
  const lastSync = sync?.meta?.last_sync_at;
  const syncStale = !lastSync || Date.now() - lastSync > 36 * 3600 * 1000;

  const open = (alertsData?.alerts || []).filter((a) => a.status !== "resolved")
    .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));

  const [st] = useStyle();
  const allowed = (href) => !me?.authenticated || canSee(href, me.capabilities, me.admin);
  const needle = q.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => allowed(it.href) && (!needle || `${it.title} ${it.desc}`.toLowerCase().includes(needle))),
  })).filter((g) => g.items.length);

  // "I tuoi strumenti": le voci della mansione per prime, il resto dietro "Tutti gli strumenti"
  const mine = wsOn ? workspaceSections(ws, allowed).flatMap((x) => x.items)
    .filter((i) => i.href !== "/admin")
    .map((i) => ({ href: i.href, title: i.label, desc: TOOL_BY_HREF.get(i.href)?.desc || i.desc || "", icon: TOOL_BY_HREF.get(i.href)?.icon || LayoutDashboard }))
    .filter((it) => !needle || `${it.title} ${it.desc}`.toLowerCase().includes(needle)) : [];
  const mineHrefs = new Set(mine.map((i) => i.href));
  const others = groups.map((g) => ({ ...g, items: g.items.filter((it) => !mineHrefs.has(it.href)) })).filter((g) => g.items.length);
  const othersOpen = !wsOn || showAll || Boolean(needle);

  const trend = loop?.trend;
  const loopNote = (x, fallback) => x?.reason === "no_history" ? "servono 2 mesi di dati" : x?.reason ? fallback : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        title={`${greeting}${userName ? `, ${userName}` : ""}.`}
        line2={isHr ? null : paceLine}
        subtitle={isHr ? "Persone, accessi e contestazioni: da qui parti per il lavoro di oggi."
          : paceLine ? (st === "v3" ? null : paceLine) : `Come va ${partial ? "il tuo perimetro" : "l'agenzia"} a ${monthName} e cosa guardare oggi.`}
      />

      {noCreators && !isHr && (
        <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <SectionTitle>Non hai ancora creator assegnate</SectionTitle>
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
            Le pagine di vendita mostrano solo le creator che segui. Finché un admin non te le assegna (Membri e ruoli → la tua scheda → Creator visibili), qui e nelle classifiche non vedrai numeri.
          </div>
        </section>
      )}

      {!isHr && !noCreators && <HeroMetric
        label={`${partial ? `Venduto delle tue ${me.creators.count} creator` : "Venduto agenzia"} · ${monthName} finora`}
        value={fmt$(agency?.current?.sales)}
        compare={compareLine}
        hint={<>
          {agency?.incomplete && (
            <Link href={agency.warnings?.[0]?.href || "/admin/alerts"} style={{ display: "inline-block", marginRight: 8, padding: "1px 8px", borderRadius: 999, border: `1px solid ${CP.border}`, color: CP.textSecondary, textDecoration: "none", fontSize: 12 }}
              title={(agency.warnings || []).map((w) => w.title).join(" · ") || "Ci sono controlli aperti sui dati di vendita"}>
              Dati incompleti
            </Link>
          )}
          {sync ? `Tutti i turni CreatorsPro, come il P&L · aggiornati ${fmtAgo(lastSync)}${syncStale ? " — più vecchi del solito, controlla il sync" : ""}` : "Tutti i turni CreatorsPro, come il P&L"}
        </>}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Metric label="Operatori attivi" value={fmtInt(base?.operators)} delta={fmtDelta(base?.operators, basePrev?.operators)} deltaLabel={dl} />
          <Metric label="Creator" value={fmtInt(base?.creators)} />
          <Metric label="Turni" value={fmtInt(base?.shifts)} delta={fmtDelta(base?.shifts, basePrev?.shifts)} deltaLabel={dl} />
          <Metric label="Venduto per turno" value={fmt$(perShift(base))} delta={fmtDelta(perShift(base), perShift(basePrev))} deltaLabel={dl} />
        </div>
      </HeroMetric>}

      {alertsData && !isHr && (
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

      {wantDecisions && decisions.length > 0 && (
        <section className="ds-open" style={{ ...card, marginBottom: 14 }}>
          <div className="ds-open-h" style={{ padding: "14px 16px 10px" }}>
            <SectionTitle aside={`${decisions.length} in attesa, le più vecchie prima`}>Decisioni che aspettano</SectionTitle>
          </div>
          {decisions.slice(0, 5).map((d) => (
            <ActionRow key={d.id} severity={d.status === "now" ? "warning" : "info"}
              title={d.title}
              detail={[daysAgo(d.added_at) != null && `da ${daysAgo(d.added_at)} ${daysAgo(d.added_at) === 1 ? "giorno" : "giorni"}`, d.gate && d.gate !== "—" && `serve: ${d.gate}`].filter(Boolean).join(" · ")}
              href="/admin/roadmap" cta="Apri" />
          ))}
          <div className="ds-open-f" style={{ padding: "10px 16px", borderTop: `1px solid ${CP.borderSoft}` }}>
            <Link href="/admin/roadmap" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>
              {decisions.length > 5 ? `Tutte le decisioni (${decisions.length}) →` : "Roadmap →"}
            </Link>
          </div>
        </section>
      )}

      {loop && (
        <section className="ds-open" style={{ ...card, padding: "14px 16px", marginBottom: 24 }}>
          <SectionTitle aside={loopPeriod === prevId ? `${prevName}: il mese appena chiuso, come la Classifica` : "coaching e sostituzioni del mese scorso, misurati su questo"}>Le decisioni sulle persone funzionano?</SectionTitle>
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
      {groups.length === 0 && mine.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted }}>Nessuno strumento corrisponde a “{q}”.</div>}
      {mine.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>I tuoi strumenti · {WORKSPACES[ws]?.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {mine.map((it) => <ToolCard key={it.href} it={it} />)}
          </div>
        </section>
      )}
      {wsOn && !needle && (
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
          style={{ display: "block", margin: "4px 0 18px", padding: "8px 14px", background: "transparent", border: `1px dashed ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" }}>
          {showAll ? "Nascondi gli altri strumenti" : `Tutti gli strumenti (${others.reduce((n, g) => n + g.items.length, 0)})`}
        </button>
      )}
      {othersOpen && others.map((g) => (
        <section key={g.label} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {g.items.map((it) => <ToolCard key={it.href} it={it} />)}
          </div>
        </section>
      ))}
      <style>{`.hub-tool:hover{background:${CP.surfaceAlt} !important}`}</style>
    </div>
  );
}

function ToolCard({ it }) {
  const Icon = it.icon;
  return (
    <Link href={it.href} className="hub-tool"
      style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", ...card, textDecoration: "none", color: CP.textPrimary }}>
      <Icon size={16} color={CP.textMuted} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{it.title}</div>
        {it.desc && <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.45, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.desc}</div>}
      </div>
    </Link>
  );
}
