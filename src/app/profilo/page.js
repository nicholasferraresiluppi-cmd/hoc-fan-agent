"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FONTS, CP } from "@/lib/brand";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { useUser } from "@clerk/nextjs";
import { Sparkles, TrendingUp, GraduationCap, BookOpen, Mail, ArrowRight, Award } from "lucide-react";
import SignalsStrip from "@/components/SignalsStrip";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, DataTable, Notice, card, NUM } from "@/components/ds";

// Ridisegno sul design system 26/09/2026: contenuti e logica del 25/09 invariati
// (anzianità da tutte le fonti, score vendite con un decimale it-IT, hero che
// sul telefono mette lo score in cima). Cambiano solo struttura e segni visivi.

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_PERCENTILE_NEXT = {
  Critical: { next: "Weak", pct: 10 },
  Weak: { next: "Average", pct: 25 },
  Average: { next: "Good", pct: 50 },
  Good: { next: "Strong", pct: 75 },
  Strong: { next: "Elite", pct: 90 },
  Elite: { next: null, pct: 100 },
};

// Percorsi Academy mostrati in fondo (id = categoria del simulatore)
const ACADEMY_PATHS = [
  { id: "le-basi-della-chat", label: "Le basi della chat", diff: 1 },
  { id: "mass-e-conversione", label: "Mass e conversione", diff: 2 },
  { id: "custom-e-upsell", label: "Custom e upsell", diff: 3 },
  { id: "recuperi-e-retention", label: "Recuperi e retention", diff: 4 },
  { id: "script-avanzati", label: "Script avanzati", diff: 5 },
];

const dec1 = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
function fmtPctSign(v) { if (v == null) return "—"; return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("it-IT")}%`; }
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatPeriodLabel(periodId) {
  const m = periodId?.match?.(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS_IT[parseInt(m[2]) - 1]} ${m[1]}`;
  return periodId;
}

const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" };
const tierChip = { display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, background: CP.surfaceAlt, color: CP.textSecondary, border: `1px solid ${CP.border}` };

export default function MyProfilePage() {
  const { user, isLoaded } = useUser();
  const [periodId] = useSmartPeriod();

  // Match email → employee
  const { data: meEmp, error: meEmpError, isLoading: meEmpLoading } = useSWR("/api/me/employee", fetcher, { revalidateOnFocus: false });
  const employee = meEmp?.employee;

  // Drill-down completo per l'employee matchato
  const drillUrl = employee && periodId ? `/api/leaderboard/operator-drilldown?employee=${encodeURIComponent(employee)}&period_id=${periodId}` : null;
  const { data: drill } = useSWR(drillUrl, fetcher, { revalidateOnFocus: false });

  // CP history (per tenure + LTV CP)
  const cpHistUrl = employee ? `/api/leaderboard/operator-cp-history?employee=${encodeURIComponent(employee)}&last_n=12` : null;
  const { data: cpHist } = useSWR(cpHistUrl, fetcher, { revalidateOnFocus: false });
  // Anzianità: primo mese in QUALSIASI fonte (CP parte da giugno 2026, lo storico
  // Infloww da gennaio) — prima contava solo i mesi CP ("4 mesi" per chi c'è da gennaio).
  const { data: myScore } = useSWR(employee ? "/api/me/score" : null, fetcher, { revalidateOnFocus: false });
  const firstSeen = useMemo(() => {
    const cands = [cpHist?.first_seen_period, ...((myScore?.history || []).filter((h) => h.score != null).map((h) => h.period_id))].filter((x) => /^\d{4}-\d{2}$/.test(x || ""));
    return cands.length ? cands.sort()[0] : null;
  }, [cpHist, myScore]);
  const tenureMonths = useMemo(() => {
    if (!firstSeen) return null;
    const [y, m] = firstSeen.split("-").map(Number); const d = new Date();
    return (d.getFullYear() - y) * 12 + (d.getMonth() + 1 - m);
  }, [firstSeen]);

  // Coaching assignment se esiste
  const coachingUrl = periodId ? `/api/admin/coaching-center?period_id=${periodId}` : null;
  const { data: coachingData } = useSWR(coachingUrl, fetcher, { revalidateOnFocus: false });
  const myCoaching = employee && coachingData?.assignments?.[employee] ? coachingData.assignments[employee] : null;

  // Profilo-segnali comportamentale (metodo dal lavoro vero + percorso di training),
  // self-serve via match email — stessa diagnostica del cockpit turno.
  const { data: sig } = useSWR("/api/me/signals", fetcher, { revalidateOnFocus: false });

  const cp = drill?.cp;
  const nextTier = cp?.tier ? TIER_PERCENTILE_NEXT[cp.tier] : null;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buonanotte";
    if (h < 12) return "Buongiorno";
    if (h < 18) return "Buon pomeriggio";
    return "Buonasera";
  }, []);
  const displayName = meEmp?.source === "view_as" ? employee?.split(" ")[0] : (user?.firstName || employee?.split(" ")[0] || "");

  const creatorRows = (cp?.per_creator || []).map((r) => ({ ...r, id: r.creator }));
  const creatorCols = [
    { key: "creator", label: "Creator", render: (r) => <span style={{ fontWeight: 500 }}>{r.creator}</span> },
    { key: "score", label: "Score su questa creator", align: "right", render: (r) => dec1(r.score) },
    { key: "tier", label: "Fascia", render: (r) => (r.tier ? <span style={tierChip}>{r.tier}</span> : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "sales_per_shift", label: "Venduto per turno", align: "right", render: (r) => fmt$(r.sales_per_shift) },
    { key: "shifts", label: "Turni", align: "right", render: (r) => fmtInt(r.shifts) },
    { key: "vs_cohort_pct", label: "Rispetto alla media della creator", align: "right",
      render: (r) => <span style={{ color: r.vs_cohort_pct == null ? CP.textMuted : r.vs_cohort_pct > 0 ? CP.accentGreen : r.vs_cohort_pct < 0 ? CP.accentRed : CP.textPrimary }}>{fmtPctSign(r.vs_cohort_pct)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio profilo" }, { label: formatPeriodLabel(periodId) || "…" }]}
        title={`${greeting}${displayName ? `, ${displayName}` : ""}`}
        subtitle="Come sta andando il tuo mese, cosa ti serve per salire di fascia e dove allenarti."
      />

      {/* Loading / Errore match */}
      {(!isLoaded || meEmpLoading) && <p style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento profilo…</p>}
      {meEmpError && <Notice danger>Errore di rete: il profilo non si è caricato. Riprova tra poco.</Notice>}

      {/* Email non matchata */}
      {meEmp && !employee && <NotMatchedBlock data={meEmp} />}

      {/* Employee matchato */}
      {employee && (
        <>
          {/* Chi sei: nome, creator principale e (se automatico) come è stato fatto il collegamento */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span aria-hidden style={{ width: 40, height: 40, borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 500, flexShrink: 0 }}>
              {getInitials(employee)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{employee}</div>
              <div style={{ fontSize: 12, color: CP.textMuted, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {cp?.top_creator && <span>Creator principale: {cp.top_creator}</span>}
                {cp?.top_creator && meEmp.source !== "override" && meEmp.source !== "view_as" && <span>·</span>}
                {meEmp.source !== "override" && meEmp.source !== "view_as" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, overflowWrap: "anywhere" }}>
                    <Mail size={12} /> Collegato tramite email{meEmp.email ? ` (${meEmp.email})` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* NUMERO PRINCIPALE: score vendite del mese */}
          {cp ? (
            <HeroMetric
              label={`Il tuo score vendite · ${formatPeriodLabel(periodId)}`}
              value={dec1(cp.score)}
              compare={cp.tier ? `Fascia: ${cp.tier}` : null}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px 24px", flex: "1 1 420px" }}>
                <Metric label="Venduto nel mese" value={fmt$(cp.total_sales)} />
                <Metric label="Turni" value={fmtInt(cp.total_shifts || 0)} />
                <Metric label="Creator attive" value={fmtInt(cp.per_creator?.length || 0)} />
                {cp.rank_agency && <Metric label="Posizione" value={`#${fmtInt(cp.rank_agency)}`} note={`su ${fmtInt(cp.total_in_ranking)}`} />}
                {tenureMonths != null && <Metric label="In agenzia da" value={`${fmtInt(tenureMonths)} ${tenureMonths === 1 ? "mese" : "mesi"}`} note={`da ${formatPeriodLabel(firstSeen)}`} />}
                {cpHist?.ltv_cp_eur != null && <Metric label="Fatturato CP totale" value={fmt$(cpHist.ltv_cp_eur)} note={`${fmtInt(cpHist.periods_count)} mesi`} />}
              </div>
            </HeroMetric>
          ) : drill ? (
            <NoDataBlock employee={employee} periodId={periodId} />
          ) : (
            <p style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento dati del mese…</p>
          )}

          {/* COSA TI SERVE PER SALIRE */}
          {cp && nextTier?.next && <NextTierBlock cp={cp} nextTier={nextTier} />}

          {/* COACHING ASSEGNATO */}
          {myCoaching && myCoaching.status === "assigned" && <CoachingBlock assignment={myCoaching} />}

          {/* PROFILO-SEGNALI — metodo dal lavoro vero + percorso (self-serve, own) */}
          <SignalsStrip sig={sig} />

          {/* PERFORMANCE PER CREATOR */}
          {creatorRows.length > 0 && (
            <section style={{ margin: "24px 0 28px" }}>
              <SectionTitle>Le tue creator</SectionTitle>
              <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 760 }}>
                Dove stai andando forte e dove c&apos;è margine. L&apos;ultima colonna confronta il tuo venduto per turno con la media di tutti gli operatori su quella creator. Lavora con il tuo team lead dove sei sotto.
              </p>
              <DataTable columns={creatorCols} rows={creatorRows} minWidth={720} />
            </section>
          )}

          {/* PERCORSI ACADEMY */}
          <section style={{ marginBottom: 28 }}>
            <SectionTitle>Cresci con l&apos;Academy</SectionTitle>
            <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 760 }}>
              5 percorsi a tema, dalle basi agli script avanzati. Più sali di fascia, più conviene allenarsi sugli script avanzati.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {ACADEMY_PATHS.map((p) => <AcademyCard key={p.id} {...p} />)}
            </div>
          </section>

          {/* SCHEDA COMPLETA */}
          <section style={{ ...card, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>Vuoi più dettagli?</div>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 2 }}>La scheda completa ha il confronto con gli altri operatori e una diagnosi automatica.</div>
            </div>
            <Link href={`/leaderboard/operational/${encodeURIComponent(employee)}`} style={btnPrimary}>
              Apri la scheda completa <ArrowRight size={14} />
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

function NextTierBlock({ cp, nextTier }) {
  const ptsToGo = Math.max(1, Math.ceil(nextTier.pct - cp.score));
  return (
    <section style={{ ...card, padding: "16px 20px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 14 }}>
      <TrendingUp size={20} color={CP.accent} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>Prossimo obiettivo</div>
        <div style={{ fontSize: 16, color: CP.textPrimary, lineHeight: 1.4 }}>
          Per salire alla fascia <span style={{ fontWeight: 500 }}>{nextTier.next}</span> ti servono circa <span style={{ fontWeight: 500, ...NUM }}>{fmtInt(ptsToGo)} punti</span> in più di score vendite.
        </div>
        <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          Lo score sale soprattutto con il venduto per turno, che pesa per l&apos;85%. Parti dalle creator dove sei sotto la media (ultima colonna della tabella qui sotto).
        </div>
      </div>
    </section>
  );
}

function CoachingBlock({ assignment }) {
  const path = ACADEMY_PATHS.find((p) => p.id === assignment.training_category_id);
  return (
    <section style={{ ...card, padding: "16px 20px", marginBottom: 14, borderLeft: `3px solid ${CP.accent}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <GraduationCap size={20} color={CP.accent} style={{ flexShrink: 0 }} />
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>Hai un percorso di coaching assegnato</div>
        <div style={{ fontSize: 16, color: CP.textPrimary, marginBottom: 4 }}>
          Percorso: <span style={{ fontWeight: 500 }}>{path?.label || assignment.training_category_id}</span>
        </div>
        {assignment.owner && (
          <div style={{ fontSize: 13, color: CP.textMuted }}>
            Ti segue: {assignment.owner}{assignment.deadline && ` · da completare entro il ${assignment.deadline}`}
          </div>
        )}
        {assignment.note && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>“{assignment.note}”</div>}
      </div>
      <Link href="/" /* /academy non esiste (404): l'Academy è la home */ style={btnPrimary}>
        Inizia <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function AcademyCard({ id, label, diff }) {
  return (
    <Link href="/" style={{ ...card, padding: 16, textDecoration: "none", color: CP.textPrimary, display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: CP.textMuted, ...NUM }}>
        <BookOpen size={15} color={CP.textMuted} /> Difficoltà {diff} su 5
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: CP.accentSoftText, display: "inline-flex", alignItems: "center", gap: 4 }}>
        Apri il percorso <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function NoDataBlock({ employee, periodId }) {
  return (
    <section style={{ ...card, padding: "28px 20px", marginBottom: 14, textAlign: "center" }}>
      <Award size={28} color={CP.mutedIcons} style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: CP.textPrimary }}>Nessun dato per {formatPeriodLabel(periodId)}</div>
      <div style={{ fontSize: 13, color: CP.textSecondary, maxWidth: 480, margin: "0 auto", lineHeight: 1.55 }}>
        Per <span style={{ fontWeight: 500, color: CP.textPrimary }}>{employee}</span> non ci sono ancora dati di CreatorsPro sincronizzati per questo mese.
        Se hai lavorato e non vedi i tuoi numeri, segnalalo a un admin.
      </div>
    </section>
  );
}

function NotMatchedBlock({ data }) {
  const candidates = data?.candidates || [];
  const strong = { fontWeight: 500, color: CP.textPrimary };
  return (
    <section style={{ ...card, padding: "24px 22px" }}>
      <Sparkles size={24} color={CP.mutedIcons} style={{ marginBottom: 8 }} />
      <h2 style={{ fontSize: 17, fontWeight: 500, margin: "0 0 8px", color: CP.textPrimary }}>Account non collegato a un operatore</h2>
      <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.6, marginBottom: 14, maxWidth: 640, overflowWrap: "anywhere" }}>
        {data?.reason === "ambiguous" && (
          <>L&apos;email <span style={strong}>{data.email}</span> corrisponde a più nomi operatore: <span style={strong}>{candidates.join(", ")}</span>. Chiedi a un admin di assegnarti il nome giusto a mano.</>
        )}
        {data?.reason === "no_match" && (
          <>L&apos;email <span style={strong}>{data.email}</span> non corrisponde a nessun operatore presente in CreatorsPro. Se lavori come operatore, chiedi a un admin di collegare il tuo account.</>
        )}
        {data?.reason === "no_email" && <>Non riusciamo a leggere l&apos;email del tuo account. Contatta un admin.</>}
        {data?.reason === "needs_link" && (
          <>Il tuo account (<span style={strong}>{data.email}</span>) va collegato al tuo nome operatore da un admin: per sicurezza il collegamento automatico vale solo per le email aziendali.</>
        )}
        {data?.reason === "email_not_verified" && <>La tua email non risulta verificata. Esci e rientra con il codice che ti arriva via email.</>}
        {data?.reason === "no_cp_data" && <>Non ci sono ancora dati di CreatorsPro sincronizzati nel sistema. Riprova dopo il prossimo aggiornamento.</>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/" style={btnGhost}>← Home</Link>
      </div>
    </section>
  );
}
