"use client";
/**
 * HOC Analytics (10/10/2026; nome del report Looker originale): le pagine dei report Looker Studio "HOC Analytics 3.0" e "KPI Sales"
 * rifatte in HOC Pro con la STESSA disposizione (stessi nomi di pagina, stesso ordine, stessi blocchi
 * negli stessi punti), così chi era abituato a Looker non deve reimparare niente. Formule e numeri:
 * lib/analisi-vendite-sql.js + lib/looker-sql.js, verificati pagina per pagina contro Looker.
 * Ognuno vede solo le creator che gli sono assegnate (stessa API di Analisi vendite).
 */
import { useEffect, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { LkStyles } from "@/components/looker/Lk";
import {
  RecapDashboard, ClicksOverall, CreatorsReach, WelcomeMassUnlocks, PerformanceKpi, DetailedKpi, TransactionsDetails,
  SubsNotifications, UserResearch, ChargebackStats, CreatorOverall, NewSubsDashboard, NewSubsRevenue, NewSubsCr,
  ConversionAnalytics, SalesRatio,
} from "@/components/looker/pages";

/* ───────── l'elenco delle pagine, come la colonna di sinistra di Looker (stessi nomi, stesso ordine) ───────── */
const REPORTS = [
  {
    name: "HOC Analytics 3.0",
    pages: [
      { id: "recap-dashboard", title: "Recap Dashboard", C: RecapDashboard },
      { id: "clicks-overall", title: "Clicks Overall", C: ClicksOverall },
      { id: "creators-reach", title: "Creators Reach", C: CreatorsReach },
      { id: "welcome-mass-unlocks", title: "Welcome mass unlocks", C: WelcomeMassUnlocks },
      { id: "performance-kpi", title: "Performance KPI per creators", C: PerformanceKpi },
      { id: "detailed-kpi", title: "Detailed Performance KPI per creators", C: DetailedKpi },
      { id: "transactions-details", title: "Transactions Details", C: TransactionsDetails },
      { id: "subs-notifications", title: "Subs Notifications Report", C: SubsNotifications },
      { id: "user-research", title: "User research", C: UserResearch },
      { id: "chargeback-stats", title: "Chargeback Stats", C: ChargebackStats },
      { id: "creator-overall", title: "Creator Overall", C: CreatorOverall },
      { id: "dashboard", title: "Dashboard", C: NewSubsDashboard },
      { id: "new-subs-revenue", title: "New Subs Revenue", C: NewSubsRevenue },
      { id: "new-subs-cr", title: "New Subs CR", C: NewSubsCr },
    ],
  },
  {
    name: "KPI Sales",
    pages: [
      { id: "conversion-analytics", title: "Conversion Analytics", C: ConversionAnalytics },
      { id: "sales-ratio", title: "Sales Ratio", C: SalesRatio },
    ],
  },
];
const ALL = REPORTS.flatMap((r) => r.pages.map((p) => ({ ...p, report: r.name })));

/* ───────── la pagina: elenco a sinistra + pagina scelta ───────── */
export default function ReportLookerPage() {
  const [pageId, setPageId] = useState(ALL[0].id);
  const [creators, setCreators] = useState([]);
  const [ready, setReady] = useState(false); // l'indirizzo si scrive solo DOPO averlo letto (link diretti a una pagina)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("pagina");
    if (p && ALL.some((x) => x.id === p)) setPageId(p);
    const c = (q.get("creators") || "").split(",").map(Number).filter(Boolean);
    if (c.length) setCreators(c);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams({ pagina: pageId });
    if (creators.length) q.set("creators", creators.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [ready, pageId, creators]);
  const page = ALL.find((p) => p.id === pageId) || ALL[0];
  const Page = page.C;

  return (
    // niente intestazione grande: come su Looker la pagina parte dall'alto e sta in uno schermo senza scorrere
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "4px 0 24px" }}>
      <div className="lk-shell" style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <nav aria-label="Pagine del report" style={{ position: "sticky", top: 12, display: "grid", gap: 12, maxHeight: "calc(100vh - 24px)", overflowY: "auto" }}>
          <div style={{ padding: "0 10px" }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>HOC Analytics</h1>
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, lineHeight: 1.4 }}>Le pagine di Looker Studio. Solo le tue creator.</div>
          </div>
          {REPORTS.map((r) => (
            <div key={r.name} style={{ display: "grid", gap: 2 }}>
              <div style={{ fontSize: 12, color: CP.textMuted, padding: "0 10px 4px" }}>{r.name}</div>
              {r.pages.map((p) => {
                const on = p.id === pageId;
                return (
                  <button key={p.id} onClick={() => { setPageId(p.id); window.scrollTo?.(0, 0); }} aria-current={on ? "page" : undefined}
                    style={{ textAlign: "left", padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONTS.body, fontSize: 13,
                      background: on ? CP.accentSoft : "transparent", color: on ? CP.accentSoftText : CP.textSecondary, fontWeight: on ? 500 : 400 }}>
                    {p.title}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <main style={{ minWidth: 0 }}>
          {ready && <Page key={page.id} creators={creators} setCreators={setCreators} />}
        </main>
      </div>
      <LkStyles />
    </div>
  );
}

