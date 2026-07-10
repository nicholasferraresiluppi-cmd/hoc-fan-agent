"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { useUser } from "@clerk/nextjs";
import { Sparkles, TrendingUp, GraduationCap, BookOpen, Mail, ArrowRight, Target, Award } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};
const TIER_ORDER = ["Critical", "Weak", "Average", "Good", "Strong", "Elite"];
const TIER_PERCENTILE_NEXT = {
  Critical: { next: "Weak", pct: 10 },
  Weak: { next: "Average", pct: 25 },
  Average: { next: "Good", pct: 50 },
  Good: { next: "Strong", pct: 75 },
  Strong: { next: "Elite", pct: 90 },
  Elite: { next: null, pct: 100 },
};

function fmtCurrency(v) { if (v == null) return "—"; return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }
function fmtPctSign(v) { if (v == null) return "—"; return `${v > 0 ? "+" : ""}${v}%`; }
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatPeriodLabel(periodId) {
  const m = periodId?.match?.(/^(\d{4})-(\d{2})$/);
  if (m) {
    const names = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${names[parseInt(m[2]) - 1]} ${m[1]}`;
  }
  return periodId;
}

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

  // Coaching assignment se esiste
  const coachingUrl = periodId ? `/api/admin/coaching-center?period_id=${periodId}` : null;
  const { data: coachingData } = useSWR(coachingUrl, fetcher, { revalidateOnFocus: false });
  const myCoaching = employee && coachingData?.assignments?.[employee] ? coachingData.assignments[employee] : null;

  const cp = drill?.cp;
  const tierColor = cp?.tier ? TIER_COLORS[cp.tier] : COLORS.champagne;
  const nextTier = cp?.tier ? TIER_PERCENTILE_NEXT[cp.tier] : null;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buonanotte";
    if (h < 12) return "Buongiorno";
    if (h < 18) return "Buon pomeriggio";
    return "Buonasera";
  }, []);
  const displayName = user?.firstName || employee?.split(" ")[0] || "";

  return (
    <div style={{ minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 28px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.textMuted, letterSpacing: "0.12em", marginBottom: 4 }}>
            Il mio profilo · {formatPeriodLabel(periodId)}
          </div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 36, margin: "4px 0 4px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {greeting}{displayName ? `, ${displayName}` : ""}
          </h1>
        </div>

        {/* Loading / Errore match */}
        {(!isLoaded || meEmpLoading) && <p style={{ color: COLORS.fog }}>Caricamento profilo…</p>}
        {meEmpError && <p style={{ color: COLORS.signal }}>Errore di rete: {String(meEmpError)}</p>}

        {/* Email non matchata */}
        {meEmp && !employee && (
          <NotMatchedBlock data={meEmp} />
        )}

        {/* Employee matchato */}
        {employee && (
          <>
            {meEmp.source !== "override" && (
              <div style={{ marginBottom: 16, padding: "8px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 10, fontSize: 12, color: COLORS.fog, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Mail size={12} /> Account collegato a <strong style={{ color: COLORS.alabaster }}>{employee}</strong> via email{" "}
                {meEmp.email && <span style={{ color: COLORS.mist }}>({meEmp.email})</span>}
              </div>
            )}

            {/* HERO CARD */}
            {cp ? (
              <div style={{
                background: CP.surface,
                border: `1px solid ${tierColor}55`,
                borderRadius: 20, padding: "30px 32px", marginBottom: 24,
                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 28, alignItems: "center",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  width: 100, height: 100, borderRadius: "50%",
                  background: COLORS.champagne,
                  color: COLORS.obsidian,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: FONTS.display, fontWeight: 600, fontSize: 36,
                  border: `3px solid ${COLORS.graphite}`,
                  boxShadow: `0 0 0 3px ${COLORS.champagne}`,
                }}>{getInitials(employee)}</div>

                <div style={{ position: "relative" }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{employee}</div>
                  {cp.top_creator && (
                    <div style={{ color: COLORS.champagne, fontSize: 12, letterSpacing: "0.12em", marginBottom: 14 }}>
                      Principale: {cp.top_creator}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
                    <StatMini l="Sales mese" v={fmtCurrency(cp.total_sales)} color={CP.accentGreen} />
                    <StatMini l="Shift" v={Math.round(cp.total_shifts || 0)} />
                    <StatMini l="Creator attive" v={cp.per_creator?.length || 0} />
                    {cp.rank_agency && <StatMini l="Posizione" v={`#${cp.rank_agency}`} sub={`su ${cp.total_in_ranking}`} />}
                    {cpHist?.tenure_months_cp != null && <StatMini l="Sei in agency da" v={`${cpHist.tenure_months_cp} mesi`} sub={cpHist.first_seen_period ? `dal ${formatPeriodLabel(cpHist.first_seen_period)}` : null} />}
                    {cpHist?.ltv_cp_eur != null && <StatMini l="Fatturato CP totale" v={fmtCurrency(cpHist.ltv_cp_eur)} sub={`${cpHist.periods_count} mesi`} color={CP.accentGreen} />}
                  </div>
                </div>

                <div style={{ textAlign: "right", position: "relative" }}>
                  <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.15em" }}>Il tuo score</div>
                  <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 64, lineHeight: 1, color: tierColor }}>
                    {cp.score?.toFixed(1) ?? "—"}
                  </div>
                  <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", background: tierColor + "26", color: tierColor, border: `1px solid ${tierColor}55`, marginTop: 8, fontFamily: FONTS.body }}>
                    {cp.tier}
                  </span>
                </div>
              </div>
            ) : drill ? (
              <NoDataBlock employee={employee} periodId={periodId} />
            ) : (
              <p style={{ color: COLORS.fog }}>Caricamento dati performance…</p>
            )}

            {/* COSA TI SERVE PER SALIRE */}
            {cp && nextTier?.next && (
              <NextTierBlock cp={cp} nextTier={nextTier} />
            )}

            {/* COACHING ASSEGNATO */}
            {myCoaching && myCoaching.status === "assigned" && (
              <CoachingBlock assignment={myCoaching} />
            )}

            {/* PERFORMANCE PER CREATOR */}
            {cp?.per_creator?.length > 0 && (
              <Section title="Le tue creator" subtitle="Dove stai andando forte, dove c'è margine. Lavora con il tuo Team Lead sui punti deboli.">
                <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.7fr 0.9fr 0.6fr 0.8fr", padding: "12px 20px", background: COLORS.obsidian + "80", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}` }}>
                    <div>Creator</div><div>Score loc.</div><div>Tier</div><div>$/shift</div><div>Shift</div><div>vs cohort</div>
                  </div>
                  {cp.per_creator.map((row) => {
                    const tCol = row.tier ? TIER_COLORS[row.tier] : COLORS.mist;
                    const cohortColor = row.vs_cohort_pct == null ? COLORS.mist : row.vs_cohort_pct > 0 ? CP.accentGreen : CP.accentRed;
                    return (
                      <div key={row.creator} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.7fr 0.9fr 0.6fr 0.8fr", padding: "12px 20px", borderBottom: `1px solid ${COLORS.charcoal}88`, alignItems: "center", fontSize: 13 }}>
                        <div style={{ fontWeight: 500 }}>{row.creator}</div>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 700, color: tCol }}>{row.score != null ? row.score.toFixed(1) : "—"}</div>
                        <div>{row.tier ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: tCol + "26", color: tCol, border: `1px solid ${tCol}55` }}>{row.tier}</span> : <span style={{ color: COLORS.mist }}>—</span>}</div>
                        <div style={{ fontFamily: FONTS.mono }}>{fmtCurrency(row.sales_per_shift)}</div>
                        <div style={{ fontFamily: FONTS.mono, color: COLORS.fog }}>{Math.round(row.shifts)}</div>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: cohortColor }}>{fmtPctSign(row.vs_cohort_pct)}</div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* TRAINING CATEGORIES */}
            <Section title="Cresci con l'Academy" subtitle="5 percorsi tematici dai basi agli script avanzati. Più sei nei tier alti, più valore conta lavorare sugli script avanzati.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <AcademyCard id="le-basi-della-chat" label="Le Basi della Chat" diff={1} color="#10B981" />
                <AcademyCard id="mass-e-conversione" label="Mass & Conversione" diff={2} color="#3B82F6" />
                <AcademyCard id="custom-e-upsell" label="Custom & Upsell" diff={3} color="#F59E0B" />
                <AcademyCard id="recuperi-e-retention" label="Recuperi & Retention" diff={4} color="#A855F7" />
                <AcademyCard id="script-avanzati" label="Script Avanzati" diff={5} color="#EF4444" />
              </div>
            </Section>

            {/* DEEPER LINK */}
            <div style={{ marginTop: 32, padding: "18px 22px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, color: COLORS.alabaster, fontWeight: 600 }}>Vuoi più dettagli?</div>
                <div style={{ fontSize: 12, color: COLORS.fog, marginTop: 2 }}>Apri il drill-down completo per insight, peer compare e diagnosi automatica.</div>
              </div>
              <Link href={`/leaderboard/operational/${encodeURIComponent(employee)}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", background: COLORS.champagne, color: COLORS.obsidian, borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Apri drill-down <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatMini({ l, v, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em" }}>{l}</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 600, marginTop: 2, color: color || COLORS.alabaster }}>{v}</div>
      {sub && <div style={{ fontSize: 10, color: COLORS.mist, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{title}</h2>
      {subtitle && <p style={{ color: COLORS.fog, fontSize: 13, marginBottom: 14, maxWidth: 900, lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function NextTierBlock({ cp, nextTier }) {
  const nextColor = TIER_COLORS[nextTier.next];
  const ptsToGo = Math.max(1, Math.ceil(nextTier.pct - cp.score));
  return (
    <div style={{
      padding: "20px 24px",
      marginBottom: 24,
      background: CP.surface,
      border: `1px solid ${nextColor}44`,
      borderRadius: 14,
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
    }}>
      <TrendingUp size={28} color={nextColor} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 12, color: COLORS.fog, letterSpacing: "0.12em", marginBottom: 4 }}>
          Prossimo obiettivo
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.alabaster }}>
          Sali al tier <strong style={{ color: nextColor }}>{nextTier.next}</strong>: ti servono ~<strong>{ptsToGo} punti</strong> in più di score CP
        </div>
        <div style={{ fontSize: 12, color: COLORS.mist, marginTop: 4 }}>
          Lo score sale soprattutto su <strong>sales per shift</strong> (85% del peso). Lavora sulle creator dove il tuo cohort % è negativo.
        </div>
      </div>
    </div>
  );
}

function CoachingBlock({ assignment }) {
  return (
    <div style={{
      padding: "20px 24px",
      marginBottom: 24,
      background: CP.accentSoft,
      border: `1px solid ${CP.accentDim}`,
      borderRadius: 14,
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
    }}>
      <GraduationCap size={28} color={CP.accentSoftText} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 12, color: COLORS.fog, letterSpacing: "0.12em", marginBottom: 4 }}>
          Hai un coaching assegnato
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.alabaster, marginBottom: 4 }}>
          Categoria: <strong style={{ color: CP.accentSoftText }}>{assignment.training_category_id}</strong>
        </div>
        {assignment.owner && <div style={{ fontSize: 12, color: COLORS.fog }}>Owner: <strong>{assignment.owner}</strong>{assignment.deadline && ` · deadline ${assignment.deadline}`}</div>}
        {assignment.note && <div style={{ fontSize: 12, color: COLORS.mist, marginTop: 6, fontStyle: "italic" }}>"{assignment.note}"</div>}
      </div>
      <Link href={`/academy?category=${assignment.training_category_id}`} style={{ padding: "10px 16px", background: CP.accent, color: CP.accentInk, borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        Inizia <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function AcademyCard({ id, label, diff, color }) {
  return (
    <Link href={`/academy?category=${id}`} style={{
      padding: 18,
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 12,
      textDecoration: "none", color: COLORS.alabaster,
      transition: "border-color 0.15s, transform 0.15s",
      display: "block",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <BookOpen size={16} color={color} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color, fontWeight: 700, letterSpacing: "0.08em" }}>DIFF {diff}/5</span>
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: COLORS.fog, display: "inline-flex", alignItems: "center", gap: 4 }}>
        Apri categoria <ArrowRight size={11} />
      </div>
    </Link>
  );
}

function NoDataBlock({ employee, periodId }) {
  return (
    <div style={{ padding: "32px 28px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, marginBottom: 24, textAlign: "center" }}>
      <Award size={32} color={COLORS.champagne} style={{ opacity: 0.5, marginBottom: 10 }} />
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Nessun dato per {formatPeriodLabel(periodId)}</div>
      <div style={{ fontSize: 13, color: COLORS.fog, maxWidth: 480, margin: "0 auto" }}>
        Per <strong style={{ color: COLORS.alabaster }}>{employee}</strong> non ci sono ancora dati CP sincronizzati nel periodo selezionato.
        Se hai lavorato e non vedi i tuoi numeri, segnalalo all'admin.
      </div>
    </div>
  );
}

function NotMatchedBlock({ data }) {
  const candidates = data?.candidates || [];
  return (
    <div style={{ padding: "32px 28px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14 }}>
      <Sparkles size={32} color={COLORS.champagne} style={{ opacity: 0.5, marginBottom: 10 }} />
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Account non collegato a un operatore</div>
      <div style={{ fontSize: 13, color: COLORS.fog, lineHeight: 1.6, marginBottom: 14, maxWidth: 640 }}>
        {data?.reason === "ambiguous" && (
          <>L'email <strong style={{ color: COLORS.alabaster }}>{data.email}</strong> matcha più nomi operatore: <strong>{candidates.join(", ")}</strong>. Chiedi all'admin di assegnarti il nome giusto via override manuale.</>
        )}
        {data?.reason === "no_match" && (
          <>L'email <strong style={{ color: COLORS.alabaster }}>{data.email}</strong> non matcha nessun operatore noto nel database CP. Se sei un operatore, chiedi all'admin di assegnare il tuo account.</>
        )}
        {data?.reason === "no_email" && <>Non riesco a leggere l'email del tuo account Clerk. Contatta l'admin.</>}
        {data?.reason === "no_cp_data" && <>Non ci sono ancora dati CP sincronizzati nel sistema. Riprova dopo il prossimo sync.</>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/" style={{ padding: "10px 16px", background: COLORS.charcoal, color: COLORS.alabaster, borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>← Home</Link>
        <Link href="/leaderboard/sales-cp" style={{ padding: "10px 16px", background: COLORS.champagne, color: COLORS.obsidian, borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Apri leaderboard pubblica</Link>
      </div>
    </div>
  );
}
