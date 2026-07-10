"use client";

import { useState, use, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { Target, GraduationCap, FileText, ArrowRight, AlertTriangle, Info, Sparkles } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

const TIER_COLORS = {
  Critical: "#D44545", Weak: "#E76F51", Average: "#B89158",
  Good: "#D4AF7A", Strong: "#3FB97E", Elite: "#4F8CCB",
};
const LANGUAGE_COLORS = { ita: "#3FB97E", eng: "#4F8CCB" };

function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtNum(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtPctSign(v) {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}%`;
}
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function fmtTenure(months) {
  if (months == null) return "—";
  if (months < 1) return "< 1 mese";
  if (months < 12) return `${Math.round(months)} mes${Math.round(months) === 1 ? "e" : "i"}`;
  const years = Math.floor(months / 12);
  const rem = Math.round(months - years * 12);
  if (rem === 0) return `${years} ann${years === 1 ? "o" : "i"}`;
  return `${years}a ${rem}m`;
}
function formatPeriodLabel(periodId) {
  const m = periodId?.match?.(/^(\d{4})-(\d{2})$/);
  if (m) {
    const names = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${names[parseInt(m[2]) - 1]} ${m[1]}`;
  }
  return periodId;
}

function TierBadge({ tier, size = "md" }) {
  if (!tier) return null;
  const color = TIER_COLORS[tier] || COLORS.mist;
  const padding = size === "sm" ? "2px 8px" : "3px 11px";
  const fontSize = size === "sm" ? 10 : 11;
  return (
    <span style={{
      display: "inline-block", padding, borderRadius: 999,
      fontSize, fontWeight: 600, letterSpacing: "0.05em", 
      background: color + "26", color, border: `1px solid ${color}55`,
      fontFamily: FONTS.body,
    }}>{tier}</span>
  );
}

function ActionBtn({ href, color, icon: Icon, children, onClick }) {
  const style = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px",
    background: color + "1A",
    border: `1px solid ${color}55`,
    borderRadius: 8,
    color,
    fontSize: 12, fontWeight: 700,
    cursor: "pointer", textDecoration: "none",
    fontFamily: FONTS.body,
  };
  if (href) return <Link href={href} style={style}>{Icon && <Icon size={13} />}{children}</Link>;
  return <button onClick={onClick} style={style}>{Icon && <Icon size={13} />}{children}</button>;
}

function ScoreSpark({ history }) {
  if (!history?.length || history.length < 2) return null;
  const max = 100;
  const w = 100 / Math.max(1, history.length - 1);
  const points = history.map((h, i) => {
    const y = h.score != null ? 100 - h.score : 50;
    return `${(i * w).toFixed(2)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 50, display: "block" }}>
      <polyline fill="none" stroke={COLORS.champagne} strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={points.join(" ")} />
      {history.map((h, i) => {
        if (h.score == null) return null;
        const cx = i * w;
        const cy = 100 - h.score;
        const color = TIER_COLORS[h.tier] || COLORS.champagne;
        return <circle key={i} cx={cx} cy={cy} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

function Delta({ value, suffix = "" }) {
  if (value == null || value === 0) return <span style={{ color: COLORS.mist, fontSize: 11 }}>—</span>;
  const positive = value > 0;
  const color = positive ? CP.accentGreen : CP.accentRed;
  return (
    <span style={{ color, fontWeight: 600, fontSize: 11, fontFamily: FONTS.mono }}>
      {positive ? "↑ +" : "↓ "}{Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

export default function EmployeeDrilldownPage({ params }) {
  const resolved = typeof params?.then === "function" ? use(params) : params;
  let employee = "";
  try { employee = decodeURIComponent(resolved.employee || ""); } catch { employee = resolved.employee || ""; }

  const [periodId] = useSmartPeriod();

  // CP drill-down (current period)
  const cpUrl = employee && periodId ? `/api/leaderboard/operator-drilldown?employee=${encodeURIComponent(employee)}&period_id=${periodId}` : null;
  const { data: cpData, error: cpError, isLoading: cpLoading } = useSWR(cpUrl, fetcher, { revalidateOnFocus: false });

  // CP history (nuovo: storia CP retrocalcolata, sostituisce Infloww per trend/tenure/LTV)
  const cpHistUrl = employee ? `/api/leaderboard/operator-cp-history?employee=${encodeURIComponent(employee)}&last_n=12` : null;
  const { data: cpHist } = useSWR(cpHistUrl, fetcher, { revalidateOnFocus: false });

  // Infloww history (ancora utile per profile.note, group, language, e per il confronto Infloww score)
  const histUrl = employee ? `/api/leaderboard/employee-history?employee=${encodeURIComponent(employee)}&period_type=monthly` : null;
  const { data: histData } = useSWR(histUrl, fetcher, { revalidateOnFocus: false });

  const cp = cpData?.cp;
  const insights = cpData?.insights || [];
  const history = histData?.history || [];
  const cpHistory = cpHist?.history || [];

  // Trova score Infloww del periodo corrente
  const inflowwCurrent = useMemo(() => {
    if (!history.length || !periodId) return null;
    return history.find((h) => h.period_id === periodId) || history[history.length - 1];
  }, [history, periodId]);

  const inflowwPrev = useMemo(() => {
    if (!history.length) return null;
    const idx = history.findIndex((h) => h.period_id === periodId);
    return idx > 0 ? history[idx - 1] : null;
  }, [history, periodId]);

  // Insight client-side: confronto CP vs Infloww
  const cpInflowwInsight = useMemo(() => {
    if (!cp?.score || !inflowwCurrent?.score) return null;
    const delta = cp.score - inflowwCurrent.score;
    if (delta > 15) return {
      severity: "info",
      text: `Sales CP molto più alto dell'Infloww (Δ ${delta.toFixed(1)}). Due letture possibili: (a) iper-efficiente (vende molto con poco volume chat — top reale), (b) lavora su creator forti che si vendono da sole. La sezione "Performance per creator" sopra aiuta a distinguere.`,
    };
    if (delta < -15) return {
      severity: "warning",
      text: `Sales CP più basso dell'Infloww (Δ ${delta.toFixed(1)}). Bravo a chattare ma converte poco in $. Opportunità coaching su closing / PPV.`,
    };
    return null;
  }, [cp, inflowwCurrent]);

  const allInsights = useMemo(() => {
    const list = [...insights];
    if (cpInflowwInsight) list.unshift({ kind: "cp_vs_infloww", ...cpInflowwInsight });
    return list;
  }, [insights, cpInflowwInsight]);

  const cpTierColor = cp?.tier ? TIER_COLORS[cp.tier] : COLORS.champagne;
  const langColor = histData?.profile?.language ? LANGUAGE_COLORS[histData.profile.language] : COLORS.mist;

  // Delta vs ultimo periodo Infloww (per la sparkline)
  const deltaInfloww = inflowwCurrent?.score != null && inflowwPrev?.score != null
    ? Math.round((inflowwCurrent.score - inflowwPrev.score) * 10) / 10 : null;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 28px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary, flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Ladder</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/leaderboard/sales-cp" style={{ color: "inherit", textDecoration: "none" }}>Sales CP</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>{employee}</span>
          </div>
          <Link href="/admin/employee-profiles" style={{ color: COLORS.champagne, fontSize: 12, textDecoration: "none", padding: "6px 12px", border: `1px solid ${COLORS.champagne}44`, borderRadius: 8 }}>Anagrafica</Link>
        </div>

        {cpLoading && <p style={{ color: COLORS.fog }}>Caricamento diagnostico…</p>}
        {cpError && <p style={{ color: COLORS.signal }}>Errore di rete: {String(cpError)}</p>}
        {cpData?.error && (
          <div style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: 16, borderRadius: 12 }}>{cpData.error}</div>
        )}

        {cpData && !cpData.error && (
          <>
            {/* ===== BLOCCO 1: SNAPSHOT ===== */}
            <div style={{
              background: CP.surface,
              border: `1px solid ${cpTierColor}55`,
              borderRadius: 20, padding: "28px 32px", marginBottom: 20,
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
                boxShadow: `0 0 0 3px ${COLORS.champagne}, 0 8px 24px rgba(139,124,246,0.3)`,
                position: "relative",
              }}>{getInitials(employee)}</div>

              <div style={{ position: "relative", minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 30, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{employee}</div>
                {(cp?.top_creator || histData?.profile?.group) && (
                  <div style={{ color: COLORS.champagne, fontSize: 12, letterSpacing: "0.12em", marginBottom: 12 }}>
                    {cp?.top_creator || histData?.profile?.group}
                    {histData?.profile?.language && (
                      <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, marginLeft: 8, background: langColor + "20", color: langColor, border: `1px solid ${langColor}55`, fontFamily: FONTS.mono }}>
                        {histData.profile.language === "eng" ? "EN" : "IT"}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, marginBottom: 14 }}>
                  <StatMini l="Sales mese" v={fmtCurrency(cp?.total_sales)} color={CP.accentGreen} />
                  <StatMini l="Shift" v={cp?.total_shifts != null ? Math.round(cp.total_shifts) : "—"} />
                  <StatMini l="Creator" v={cp?.per_creator?.length ?? 0} sub={cp?.specialization_pct ? `${cp.specialization_pct}% top` : null} />
                  <StatMini l="Tempo in agency" v={fmtTenure(cpHist?.tenure_months_cp ?? histData?.tenure_months)} sub={cpHist?.first_seen_period ? `dal ${formatPeriodLabel(cpHist.first_seen_period)}` : (histData?.tenure_inferred ? "(stima)" : null)} />
                  <StatMini l="Fatturato CP totale" v={fmtCurrency(cpHist?.ltv_cp_eur ?? histData?.ltv?.ltv_eur)} sub={`${cpHist?.periods_count ?? histData?.ltv?.periods_count ?? 0} mesi`} color={CP.accentGreen} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <ActionBtn href={`/admin/action-center?period_id=${periodId}`} color={CP.accentRed} icon={Target}>Action Center</ActionBtn>
                  <ActionBtn href="#blocco-azioni" color={CP.accent} icon={GraduationCap}>Coaching</ActionBtn>
                  <ActionBtn href="/admin/employee-profiles" color={CP.accentSoftText} icon={FileText}>Anagrafica + note</ActionBtn>
                </div>
              </div>

              <div style={{ textAlign: "right", position: "relative", display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.15em", marginBottom: 2 }}>Score CP {formatPeriodLabel(periodId)}</div>
                  <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 56, lineHeight: 1, color: cpTierColor }}>
                    {cp?.score != null ? cp.score.toFixed(1) : "—"}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                    <TierBadge tier={cp?.tier} />
                    {cp?.rank_agency && (
                      <span style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 12 }}>
                        #{cp.rank_agency}/{cp.total_in_ranking}
                      </span>
                    )}
                  </div>
                </div>
                {inflowwCurrent?.score != null && (
                  <div style={{ paddingTop: 12, borderTop: `1px solid ${COLORS.charcoal}` }}>
                    <div style={{ fontSize: 10, color: COLORS.fog, letterSpacing: "0.12em" }}>Score Infw (KPI chat)</div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 20, fontWeight: 600, color: COLORS.mist, marginTop: 2 }}>{inflowwCurrent.score.toFixed(1)}</div>
                    <div style={{ marginTop: 4 }}><Delta value={deltaInfloww} suffix=" pt" /></div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== BLOCCO 2: PERFORMANCE PER CREATOR ===== */}
            <Section title="Performance per creator" subtitle="Dove è forte, dove è debole. Score CP locale = come performa rispetto agli altri operatori sulla stessa creator.">
              {!cp?.per_creator?.length ? (
                <EmptyBlock text={`Nessun dato CP attribuito a ${employee} per ${formatPeriodLabel(periodId)}. Possibili cause: non mappato in CreatorsPro, oppure nessun shift sincronizzato.`} />
              ) : (
                <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.7fr 0.7fr 0.8fr 0.9fr 0.6fr 0.6fr 0.5fr", padding: "12px 20px", background: COLORS.obsidian + "80", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}` }}>
                    <div>Creator</div>
                    <div title="Score CP percentile su quella specifica creator">Score loc.</div>
                    <div>Tier</div>
                    <div title="Sales totali attribuite (split su shift multi-creator)">Sales</div>
                    <div title="Sales medio per shift">$/Shift</div>
                    <div title="Numero shift attribuiti">Shift</div>
                    <div title="Differenza % vs sales/shift medio degli operatori sulla stessa creator">vs cohort</div>
                    <div></div>
                  </div>
                  {cp.per_creator.map((row) => {
                    const tierColor = row.tier ? TIER_COLORS[row.tier] : COLORS.mist;
                    const cohortColor = row.vs_cohort_pct == null ? COLORS.mist
                      : row.vs_cohort_pct > 0 ? CP.accentGreen : CP.accentRed;
                    return (
                      <div key={row.creator} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.7fr 0.7fr 0.8fr 0.9fr 0.6fr 0.6fr 0.5fr", padding: "12px 20px", borderBottom: `1px solid ${COLORS.charcoal}88`, alignItems: "center", fontSize: 13 }}>
                        <div>
                          <Link href={`/leaderboard/creators/${encodeURIComponent(row.creator)}`} style={{ color: COLORS.alabaster, textDecoration: "none", fontWeight: 500 }}>
                            {row.creator} <span style={{ color: COLORS.champagne, opacity: 0.5, fontSize: 11 }}>›</span>
                          </Link>
                        </div>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 700, color: tierColor }}>
                          {row.score != null ? row.score.toFixed(1) : "—"}
                          {row.low_confidence && <span title={`Solo ${row.shift_events_total} shift events: dato non affidabile`} style={{ color: COLORS.mist, fontSize: 10, marginLeft: 4 }}>⚠</span>}
                        </div>
                        <div><TierBadge tier={row.tier} size="sm" /></div>
                        <div style={{ fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 600 }}>{fmtCurrency(row.sales)}</div>
                        <div style={{ fontFamily: FONTS.mono }}>{fmtCurrency(row.sales_per_shift)}</div>
                        <div style={{ fontFamily: FONTS.mono, color: COLORS.fog }}>{Math.round(row.shifts)}</div>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: cohortColor, fontSize: 12 }}>
                          {fmtPctSign(row.vs_cohort_pct)}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <Link href={`/leaderboard/creators/${encodeURIComponent(row.creator)}`} style={{ color: COLORS.champagne, opacity: 0.6, textDecoration: "none", fontSize: 11 }}>open</Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ===== BLOCCO 3: TREND STORICO ===== */}
            <Section title="Trend storico CP" subtitle="Score CP percentile per mese (retrocalcolato dai matrix). Score Infloww affiancato per riferimento. Mesi non syncati o senza attività dell'operatore sono mostrati esplicitamente.">
              {cpHistory.length === 0 && history.length === 0 ? (
                <EmptyBlock text="Nessuno storico disponibile per questo operatore." />
              ) : (
                <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: COLORS.fog, fontFamily: FONTS.mono, letterSpacing: "0.1em" }}>
                      Andamento score CP · {cpHist?.periods_count ?? 0} mesi attivi su {cpHist?.looked_back ?? 12}
                    </span>
                    {cpHist?.periods_not_synced > 0 && (
                      <Link href="/admin/wage-audit" style={{ fontSize: 11, color: CP.accentRed, padding: "4px 10px", background: CP.accentRed + "1F", border: `1px solid ${CP.accentRed}66`, borderRadius: 999, textDecoration: "none" }}>
                        ⚠ {cpHist.periods_not_synced} mesi non syncati · audit
                      </Link>
                    )}
                  </div>
                  <ScoreSpark history={cpHistory.filter((h) => h.status === "active")} />
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 0.7fr 0.6fr 0.7fr 0.8fr 0.6fr 1fr", gap: 8, fontSize: 11, color: COLORS.fog, paddingBottom: 6, borderBottom: `1px solid ${COLORS.charcoal}` }}>
                    <div>Periodo</div><div>Score CP</div><div>Tier</div><div>Score Infw</div><div>Sales CP</div><div>Shift</div><div>Stato</div>
                  </div>
                  {cpHistory.slice().reverse().slice(0, 12).map((h, i) => {
                    const infwForPeriod = history.find((x) => x.period_id === h.period_id);
                    const isActive = h.status === "active";
                    const statusLabel = h.status === "not_synced" ? "non syncato"
                      : h.status === "no_activity" ? "nessuna attività"
                      : "attivo";
                    const statusColor = h.status === "not_synced" ? CP.accentRed
                      : h.status === "no_activity" ? COLORS.mist
                      : CP.accentGreen;
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 0.7fr 0.6fr 0.7fr 0.8fr 0.6fr 1fr", gap: 8, padding: "8px 0", borderBottom: `1px solid ${COLORS.charcoal}55`, fontSize: 12, alignItems: "center", opacity: isActive ? 1 : 0.55 }}>
                        <div style={{ fontFamily: FONTS.mono }}>{formatPeriodLabel(h.period_id)}</div>
                        <div style={{ fontFamily: FONTS.mono, fontWeight: 600, color: h.tier ? TIER_COLORS[h.tier] : COLORS.mist }}>{h.score != null ? h.score.toFixed(1) : "—"}</div>
                        <div>{h.tier ? <TierBadge tier={h.tier} size="sm" /> : <span style={{ color: COLORS.mist }}>—</span>}</div>
                        <div style={{ fontFamily: FONTS.mono, color: COLORS.mist, fontSize: 11 }}>{infwForPeriod?.score != null ? infwForPeriod.score.toFixed(1) : "—"}</div>
                        <div style={{ fontFamily: FONTS.mono, color: h.total_sales > 0 ? CP.accentGreen : COLORS.mist }}>{h.total_sales != null ? fmtCurrency(h.total_sales) : "—"}</div>
                        <div style={{ fontFamily: FONTS.mono, color: COLORS.fog }}>{h.total_shifts != null ? Math.round(h.total_shifts) : "—"}</div>
                        <div style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ===== BLOCCO 4: DIAGNOSI + AZIONI ===== */}
            <Section title="Diagnosi automatica" subtitle="Pattern derivati dai dati: usali come prompt di conversazione per le decisioni HR / coaching." id="blocco-azioni">
              {allInsights.length === 0 ? (
                <EmptyBlock text="Nessun pattern significativo rilevato. Performance allineata, niente outlier evidenti." icon={Sparkles} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {allInsights.map((ins, i) => (
                    <InsightCard key={i} insight={ins} />
                  ))}
                </div>
              )}

              {cp?.peer_strong?.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, color: COLORS.fog, fontFamily: FONTS.mono, letterSpacing: "0.1em", marginBottom: 10 }}>
                    Peer Strong+ sulle stesse creator
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {cp.peer_strong.map((p) => (
                      <Link key={p.name} href={`/leaderboard/operational/${encodeURIComponent(p.name)}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "8px 14px",
                        background: COLORS.graphite,
                        border: `1px solid ${COLORS.charcoal}`,
                        borderRadius: 999,
                        color: COLORS.alabaster,
                        textDecoration: "none",
                        fontSize: 13,
                      }}>
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontFamily: FONTS.mono, color: TIER_COLORS[p.tier] || COLORS.champagne, fontWeight: 700 }}>{p.score.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: COLORS.mist }}>{p.shared} creator condiv.</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Section>
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

function Section({ title, subtitle, children, id }) {
  return (
    <div id={id} style={{ marginBottom: 24 }}>
      <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{title}</h2>
      {subtitle && <p style={{ color: COLORS.fog, fontSize: 13, marginBottom: 14, maxWidth: 900, lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function EmptyBlock({ text, icon: Icon }) {
  return (
    <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: "32px 22px", textAlign: "center", color: COLORS.mist, fontSize: 13 }}>
      {Icon && <Icon size={28} color={COLORS.champagne} style={{ marginBottom: 8, opacity: 0.6 }} />}
      {Icon && <br />}
      {text}
    </div>
  );
}

function InsightCard({ insight }) {
  const colors = {
    warning: { bg: CP.accentRed + "14", border: CP.accentRed + "59", icon: CP.accentRed, Icon: AlertTriangle },
    info:    { bg: CP.accentSoftText + "14", border: CP.accentSoftText + "59", icon: CP.accentSoftText, Icon: Info },
  };
  const c = colors[insight.severity] || colors.info;
  return (
    <div style={{
      display: "flex", gap: 14, padding: "16px 20px",
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, alignItems: "flex-start",
    }}>
      <c.Icon size={18} color={c.icon} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.alabaster }}>{insight.text}</div>
    </div>
  );
}
