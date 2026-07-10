"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { SectionLabel, StatCard, TrendPill, CreatorDot, MiniInsight, CpCard } from "@/components/cp-style";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { Info } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
function fmtCurrency(v, dec = 0) { if (v == null) return "—"; return "$ " + Number(v).toLocaleString("it-IT", { maximumFractionDigits: dec }); }
function fmtCurrencyShort(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return "$ " + (n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "k";
  return "$ " + n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
function fmtNum(v) { if (v == null) return "—"; return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }); }

export default function CreatorsLeaderboardPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [search, setSearch] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const periodOptions = useMemo(() => monthOpts(), []);

  const url = periodId ? `/api/leaderboard/creators?period_id=${periodId}&include_suggestions=1` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const creators = data?.creators || [];
  const filtered = useMemo(() => {
    if (!search.trim()) return creators;
    const q = search.toLowerCase();
    return creators.filter((c) =>
      c.alias.toLowerCase().includes(q) ||
      (c.top_operator?.name || "").toLowerCase().includes(q)
    );
  }, [creators, search]);

  const suggestions = data?.suggestions || [];

  // Calcoli derivati per la vista
  const totalSales = data?.total_sales_agency || 0;
  const topCreator = creators[0] || null;
  const top5 = filtered.slice(0, 5);
  const rest = filtered.slice(5);

  const styles = {
    page: { minHeight: "100vh", background: CP.bg, color: CP.textPrimary, fontFamily: FONTS.body, padding: "32px 28px" },
    container: { maxWidth: 1500, margin: "0 auto" },
    backLink: { color: CP.textSecondary, fontSize: 13, textDecoration: "none" },
    headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28 },
    title: { fontFamily: FONTS.display, fontSize: 36, margin: "0 0 6px 0", fontWeight: 700, letterSpacing: "-0.02em" },
    sub: { color: CP.textSecondary, fontSize: 14, lineHeight: 1.5, maxWidth: 720 },
    toolbar: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    input: { padding: "9px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" },
    button: { padding: "9px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, color: CP.textSecondary, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
    primaryBtn: { padding: "9px 14px", background: CP.accentGreen, border: `1px solid ${CP.accentGreen}`, borderRadius: 10, color: CP.bg, fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 },
  };

  return (
    <div style={styles.page}>
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}
      <div style={styles.container}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/leaderboard" style={styles.backLink}>Ladder</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <Link href="/leaderboard/operational" style={styles.backLink}>Operativa</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <Link href="/leaderboard/sales-cp" style={styles.backLink}>Sales CP</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <span style={{ color: CP.textPrimary }}>Creator</span>
        </div>

        {/* Header */}
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Creator Leaderboard</h1>
            <p style={styles.sub}>
              Chi sono le creator più redditizie del mese, chi è il loro top chatter e quanti operatori ci lavorano. Click su una creator per il drill-down del team interno.
            </p>
          </div>
          <div style={styles.toolbar}>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...styles.input, minWidth: 180, cursor: "pointer" }}>
              {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
            <button
              onClick={() => setTutorialOpen(true)}
              style={{ ...styles.button, color: CP.accentGreen, gap: 6 }}
              title="Come funziona lo score"
            >
              <Info size={14} /> Score?
            </button>
            <button onClick={() => url && mutate(url)} style={styles.button}>↻ Aggiorna</button>
            <Link href={`/leaderboard/creators/heatmap?period_id=${periodId}`} style={styles.primaryBtn}>Heat-map →</Link>
          </div>
        </div>

        {isLoading && !data && <p style={{ color: CP.textSecondary }}>Caricamento…</p>}
        {error && <p style={{ color: CP.accentRed }}>Errore: {String(error)}</p>}
        {data?.error && <div style={{ background: CP.accentRed + "20", color: CP.accentRed, padding: 16, borderRadius: 12 }}>{data.error}{" "}<Link href="/admin/creatorspro-sync" style={{ color: CP.accentGreen }}>Sync CP →</Link></div>}

        {data && !data.error && (
          <>
            {/* STAT CARDS top */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
              <StatCard label="Creator attive" value={fmtNum(data.creators_count)} />
              <StatCard label="Sales agency totale" value={fmtCurrencyShort(totalSales)} sub={`${fmtNum(data.operators_count)} operatori`} color={CP.accentGreen} />
              <StatCard label="Avg sales / creator" value={fmtCurrencyShort(data.avg_sales_per_creator)} />
              <StatCard
                label="Top creator"
                value={topCreator?.alias || "—"}
                sub={topCreator ? `${fmtCurrencyShort(topCreator.total_sales)} · ${topCreator.operators_count} op` : null}
                color={topCreator ? creatorDotColor(topCreator.alias) : null}
              />
            </div>

            {/* RANKED LIST CP-STYLE: Revenue Split by Creator */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Sinistra: Big stat card */}
              <CpCard padding="24px 28px" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 320 }}>
                <SectionLabel>My Agency Revenue</SectionLabel>
                <div style={{ fontFamily: FONTS.display, fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color: CP.textPrimary, marginTop: 12 }}>
                  {fmtCurrencyShort(totalSales)}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
                  <span>{data.creators_count} creator</span>
                  <span style={{ color: CP.textMuted }}>·</span>
                  <span>{data.operators_count} operatori</span>
                </div>
                {data.total_shifts != null && (
                  <div style={{ marginTop: 6, fontSize: 12, color: CP.textMuted }}>
                    {fmtNum(data.total_shifts)} shift totali · avg {fmtCurrency(data.avg_sales_per_shift_agency)} / shift
                  </div>
                )}
              </CpCard>

              {/* Destra: Revenue Split by Creator (top 5) */}
              <CpCard padding="20px 0 8px 0">
                <div style={{ padding: "0 24px 14px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 600, color: CP.textPrimary, marginBottom: 4 }}>Revenue Split by Creator</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>Top creator del periodo (cliccabili)</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <SectionLabel size={9}>Avg Revenue</SectionLabel>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 700, color: CP.textPrimary, marginTop: 2 }}>
                      {fmtCurrencyShort(data.avg_sales_per_creator)}
                    </div>
                  </div>
                </div>
                <div>
                  {top5.map((c, i) => {
                    const pctShare = totalSales > 0 ? (c.total_sales / totalSales) * 100 : 0;
                    return (
                      <Link
                        key={c.alias}
                        href={`/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "32px 14px 1fr auto auto",
                          gap: 14,
                          alignItems: "center",
                          padding: "11px 24px",
                          borderTop: `1px solid ${CP.border}`,
                          color: CP.textPrimary,
                          textDecoration: "none",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = CP.surfaceAlt}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textMuted, textAlign: "right" }}>{i + 1}.</span>
                        <CreatorDot alias={c.alias} size={11} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ fontWeight: 500, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.alias}</span>
                          {i === 0 && (
                            <span style={{ padding: "2px 7px", background: CP.accentGreen + "22", color: CP.accentGreen, fontSize: 10, fontWeight: 700, borderRadius: 4, letterSpacing: "0.04em" }}>🏆 TOP</span>
                          )}
                        </div>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: CP.textPrimary }}>{fmtCurrencyShort(c.total_sales)}</span>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.textSecondary, minWidth: 50, textAlign: "right" }}>{pctShare.toFixed(1)}%</span>
                      </Link>
                    );
                  })}
                </div>
              </CpCard>
            </div>

            {/* MATCH SUGGESTIONS (insight strip) */}
            {suggestions.length > 0 && (
              <CpCard padding="20px 24px" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <SectionLabel>Match Suggestions — Specializzazioni</SectionLabel>
                  <span style={{ fontSize: 11, color: CP.textMuted }}>Top {Math.min(5, suggestions.length)} di {suggestions.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 12 }}>
                  {suggestions.slice(0, 5).map((s, i) => (
                    <div key={i} style={{ background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <Link href={`/leaderboard/operational/${encodeURIComponent(s.employee)}`} style={{ color: CP.textPrimary, fontWeight: 600, textDecoration: "none" }}>{s.employee}</Link>
                        {" → "}
                        <CreatorDot alias={s.top_creator} size={8} style={{ verticalAlign: "middle", margin: "0 4px" }} />
                        <Link href={`/leaderboard/creators/${encodeURIComponent(s.top_creator)}?period_id=${periodId}`} style={{ color: CP.textPrimary, fontWeight: 600, textDecoration: "none" }}>{s.top_creator}</Link>
                        <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 4 }}>
                          score <b style={{ color: CP.accentGreen }}>{s.top_score}</b> · media sua {s.avg_score} · <TrendPill value={s.gap} suffix="" size="sm" />
                        </div>
                      </div>
                      <span style={{ color: CP.textPrimary, fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700 }}>{fmtCurrencyShort(s.top_sales)}</span>
                    </div>
                  ))}
                </div>
              </CpCard>
            )}

            {/* SEARCH + RANKED LIST RESTO CREATOR */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <SectionLabel size={11}>Tutte le creator ({filtered.length}{search ? ` su ${creators.length}` : ""})</SectionLabel>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca creator o operatore…" style={{ ...styles.input, width: 320 }} />
            </div>

            <CpCard padding="0">
              {/* Header tabella */}
              <div style={{ display: "grid", gridTemplateColumns: "40px 14px 1.6fr 1fr 0.8fr 0.8fr 1.2fr", gap: 16, padding: "14px 22px", borderBottom: `1px solid ${CP.borderStrong}` }}>
                <SectionLabel>#</SectionLabel>
                <span></span>
                <SectionLabel>Creator</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Sales totale</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Shift</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Operatori</SectionLabel>
                <SectionLabel style={{ textAlign: "right" }}>Top operator</SectionLabel>
              </div>
              {filtered.map((c, i) => (
                <Link
                  key={c.alias}
                  href={`/leaderboard/creators/${encodeURIComponent(c.alias)}?period_id=${periodId}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 14px 1.6fr 1fr 0.8fr 0.8fr 1.2fr",
                    gap: 16,
                    alignItems: "center",
                    padding: "12px 22px",
                    borderBottom: `1px solid ${CP.border}`,
                    color: CP.textPrimary,
                    textDecoration: "none",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = CP.surfaceAlt}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textMuted, textAlign: "right" }}>{String(c.rank).padStart(2, "0")}</div>
                  <CreatorDot alias={c.alias} size={11} />
                  <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.alias}
                    <span style={{ color: CP.textMuted, marginLeft: 6, fontSize: 12 }}>›</span>
                  </div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: CP.accentGreen, textAlign: "right" }}>{fmtCurrencyShort(c.total_sales)}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, textAlign: "right" }}>{fmtNum(c.total_shifts)}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, textAlign: "right" }}>{c.operators_count}</div>
                  <div style={{ fontSize: 13, color: CP.textPrimary, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.top_operator ? (
                      <>
                        {c.top_operator.name}
                        <span style={{ color: CP.textMuted, fontSize: 11, marginLeft: 6, fontFamily: FONTS.mono }}>{fmtCurrencyShort(c.top_operator.sales)}</span>
                      </>
                    ) : "—"}
                  </div>
                </Link>
              ))}
            </CpCard>

            <p style={{ fontSize: 11, color: CP.textMuted, marginTop: 16, fontStyle: "italic" }}>
              Le sales degli shift multi-creator sono attribuite usando i singoli <code style={{ background: CP.surfaceAlt, padding: "1px 6px", borderRadius: 3 }}>takes</code> di CP quando disponibili (attribuzione esatta), altrimenti split 50/50 (stima). Re-sync CP per aggiornare.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
