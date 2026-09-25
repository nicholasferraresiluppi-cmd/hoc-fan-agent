"use client";

// Scheda operatore (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Da qui si decide su una PERSONA: prima i fatti giusti, poi il resto.
// Correzioni di sostanza rispetto alla versione precedente:
//  - il confronto CP↔Infloww avveniva anche tra MESI DIVERSI (se Infloww non
//    aveva il mese corrente prendeva l'ultimo disponibile): Francesco Caporusso
//    risultava "bravo a chattare ma converte poco" con lo score CP di settembre
//    contro l'Infloww di agosto. Ora solo stesso mese, altrimenti niente.
//  - "in agenzia da" era contato dai soli mesi CP sincronizzati (da giugno 2026):
//    ora prende la data d'inizio in anagrafica o il primo mese visto in QUALSIASI
//    fonte (CP o Infloww).
//  - i mesi "non sincronizzati" non sono un allarme sull'operatore: dichiarato
//    da dove parte lo storico, righe vuote tolte.
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, DataTable, Notice, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
const REVIEW = 25;
const sc = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const pts = (d) => (d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`);
const monthName = (pid) => (pid ? `${MONTHS_IT[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : "");
const tierColor = (t) => (t === "Critical" || t === "Weak" ? CP.accentRed : t === "Strong" || t === "Elite" ? CP.accentGreen : CP.textSecondary);
function monthsBetween(a, b) { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return (by - ay) * 12 + (bm - am); }
function fmtTenure(m) {
  if (m == null) return "—";
  if (m < 1) return "meno di un mese";
  if (m < 12) return `${m} ${m === 1 ? "mese" : "mesi"}`;
  const y = Math.floor(m / 12), r = m % 12;
  return `${y} ${y === 1 ? "anno" : "anni"}${r ? ` e ${r} ${r === 1 ? "mese" : "mesi"}` : ""}`;
}
function monthOpts(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}

export default function EmployeeDrilldownPage({ params }) {
  const resolved = typeof params?.then === "function" ? use(params) : params;
  let employee = "";
  try { employee = decodeURIComponent(resolved.employee || ""); } catch { employee = resolved.employee || ""; }
  const [periodId, setPeriodId] = useSmartPeriod();
  const [showAllMonths, setShowAllMonths] = useState(false);
  const months = useMemo(() => monthOpts(), []);
  const isCurrent = periodId === months[0];

  const q = encodeURIComponent(employee);
  const { data: cpData, isLoading } = useSWR(employee && periodId ? `/api/leaderboard/operator-drilldown?employee=${q}&period_id=${periodId}` : null, fetcher, { revalidateOnFocus: false });
  const { data: cpHist } = useSWR(employee ? `/api/leaderboard/operator-cp-history?employee=${q}&last_n=12` : null, fetcher, { revalidateOnFocus: false });
  const { data: histData } = useSWR(employee ? `/api/leaderboard/employee-history?employee=${q}&period_type=monthly` : null, fetcher, { revalidateOnFocus: false });

  const cp = cpData?.cp;
  const cpHistory = cpHist?.history || [];
  const infw = histData?.history || [];
  const infwBy = useMemo(() => new Map(infw.map((h) => [h.period_id, h])), [infw]);
  const infwSame = infwBy.get(periodId) || null; // SOLO stesso mese

  // mese prima dallo storico CP
  const prevId = useMemo(() => { const [y, m] = (periodId || "2000-01").split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }, [periodId]);
  const prevCp = cpHistory.find((h) => h.period_id === prevId);
  const prevScore = prevCp?.status === "active" ? prevCp.score : null;

  // anzianità: anagrafica, altrimenti primo mese visto in qualsiasi fonte
  const tenure = useMemo(() => {
    if (histData?.profile?.start_date) return { months: histData.tenure_months, source: "anagrafica" };
    const firsts = [cpHist?.first_seen_period, histData?.ltv?.first_seen, ...infw.map((h) => h.period_id)].filter((x) => /^\d{4}-\d{2}$/.test(x || ""));
    if (!firsts.length) return null;
    const first = firsts.sort()[0];
    return { months: monthsBetween(first, months[0]), source: `primo mese nei dati: ${monthName(first)}` };
  }, [histData, cpHist, infw, months]);

  // mesi sotto soglia consecutivi (fino al mese scelto)
  const streak = useMemo(() => {
    const act = cpHistory.filter((h) => h.status === "active" && h.period_id <= periodId).sort((a, b) => b.period_id.localeCompare(a.period_id));
    let n = 0;
    for (const h of act) { if (h.score != null && h.score <= REVIEW) n++; else break; }
    return n;
  }, [cpHistory, periodId]);

  // Da considerare: diagnosi del server + confronto CP↔Infloww SOLO stesso mese
  const notes = useMemo(() => {
    const out = [];
    if (cp?.score != null && cp.score <= REVIEW) {
      out.push({ severity: "warning", text: streak >= 2 ? `Sotto soglia da ${streak} mesi di fila.` : prevScore != null ? `Primo mese sotto soglia: a ${monthName(prevId)} aveva ${sc(prevScore)}. Un mese storto può dipendere dalla creator o dai turni: guarda “Dove lavora” prima di decidere.` : "Sotto soglia; non c'è un mese prima con cui confrontare." });
    }
    if (isCurrent) out.push({ severity: "info", text: `${monthName(periodId)} è ancora in corso: lo score può cambiare fino a fine mese.` });
    if (cp?.score != null && infwSame?.score != null) {
      const d = cp.score - infwSame.score;
      if (d < -15) out.push({ severity: "warning", text: `Nello stesso mese lo score vendite (${sc(cp.score)}) è molto più basso dello score chat Infloww (${sc(infwSame.score)}): chatta bene ma converte poco in vendite. Possibile coaching su chiusura e PPV.` });
      if (d > 15) out.push({ severity: "info", text: `Nello stesso mese lo score vendite (${sc(cp.score)}) è molto più alto dello score chat Infloww (${sc(infwSame.score)}): vende molto con poca chat, oppure lavora su creator che si vendono da sole — controlla “Dove lavora”.` });
    }
    for (const i of cpData?.insights || []) out.push(i);
    return out;
  }, [cp, infwSame, cpData, streak, prevScore, prevId, isCurrent, periodId]);

  const perCreator = (cp?.per_creator || []).map((r) => ({ ...r, id: r.creator }));
  const creatorCols = [
    { key: "creator", label: "Creator", render: (r) => <Link href={`/leaderboard/creators/${encodeURIComponent(r.creator)}?period_id=${periodId}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{r.creator}</Link> },
    { key: "score", label: "Score su questa creator", align: "right", render: (r) => r.low_confidence
      ? <span style={{ color: CP.textMuted }} title="Troppo pochi turni per uno score affidabile">pochi turni</span>
      : <span style={{ color: tierColor(r.tier), fontWeight: 500 }}>{sc(r.score)}</span> },
    { key: "sales", label: "Venduto", align: "right", render: (r) => fmt$(r.sales) },
    { key: "sales_per_shift", label: "Per turno", align: "right", render: (r) => fmt$(r.sales_per_shift) },
    { key: "vs_cohort_pct", label: "Rispetto agli altri su questa creator", align: "right", render: (r) => (
      <span style={{ color: r.vs_cohort_pct == null || r.low_confidence ? CP.textMuted : r.vs_cohort_pct < 0 ? CP.accentRed : CP.accentGreen }} title={r.low_confidence ? "Troppo pochi turni: non è un segnale" : ""}>
        {r.vs_cohort_pct == null ? "—" : `${r.vs_cohort_pct > 0 ? "+" : r.vs_cohort_pct < 0 ? "−" : ""}${Math.abs(r.vs_cohort_pct)}% per turno`}
      </span>
    ) },
    { key: "shifts", label: "Turni", align: "right", render: (r) => fmtInt(r.shifts) },
  ];

  const active = cpHistory.filter((h) => h.status === "active");
  const firstCp = cpHistory.find((h) => h.status !== "not_synced")?.period_id;
  const histRows = cpHistory.slice().reverse()
    .filter((h) => showAllMonths || h.status === "active" || infwBy.get(h.period_id)?.score != null)
    .map((h) => ({ ...h, id: h.period_id, infw: infwBy.get(h.period_id)?.score ?? null }));

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Sales CP", href: "/leaderboard/sales-cp" }, { label: employee }]}
        title={employee}
        subtitle={[cp?.top_creator ? `Lavora soprattutto su ${cp.top_creator}${cp.specialization_pct ? ` (${cp.specialization_pct}% del suo venduto)` : ""}` : null, tenure ? `in agenzia da ${fmtTenure(tenure.months)}` : null].filter(Boolean).join(" · ")}
        actions={<>
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={ctl}>
            {months.map((m, i) => <option key={m} value={m}>{monthName(m)}{i === 0 ? " (in corso)" : ""}</option>)}
          </select>
          {cp?.score != null && cp.score <= REVIEW && <Link href={`/admin/action-center?period_id=${periodId}`} style={{ ...ctl, textDecoration: "none" }}>Action Center</Link>}
          <Link href="/admin/employee-profiles" style={{ ...ctl, textDecoration: "none" }}>Anagrafica e note</Link>
        </>}
      />

      {isLoading && !cpData && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {cpData?.error && <Notice danger>{cpData.error}</Notice>}

      {cpData && !cpData.error && (<>
        {!cp ? (
          <Notice>Nessun dato CreatorsPro per {employee} a {monthName(periodId)}: non collegato a CreatorsPro o nessun turno nel mese. <Link href="/admin/creatorspro-sync#collega" style={{ color: CP.accentSoftText }}>Persone da collegare →</Link></Notice>
        ) : (
          <HeroMetric
            label={`Score vendite · ${monthName(periodId)}${isCurrent ? " (in corso)" : ""}`}
            value={<span style={{ color: tierColor(cp.tier) }}>{sc(cp.score)}</span>}
            compare={[cp.tier, cp.rank_agency ? `${cp.rank_agency}º su ${cp.total_in_ranking}` : null, prevScore != null ? `${monthName(prevId)}: ${sc(prevScore)} (${pts(cp.score - prevScore)})` : null].filter(Boolean).join(" · ")}
            hint="0-100: venduto per turno rispetto a chi lavora sulle stesse creator (70%) e a tutta l'agenzia (30%)."
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label={isCurrent ? "Venduto finora" : "Venduto"} value={fmt$(cp.total_sales)} note={prevCp?.total_sales != null && prevCp.status === "active" ? `${monthName(prevId)}: ${fmt$(prevCp.total_sales)}` : null} />
              <Metric label="Turni" value={fmtInt(cp.total_shifts)} />
              <Metric label="Per turno" value={fmt$(cp.total_shifts ? cp.total_sales / cp.total_shifts : null)} note={prevCp?.status === "active" && prevCp.total_shifts ? `${monthName(prevId)}: ${fmt$(prevCp.total_sales / prevCp.total_shifts)}` : null} />
              {infwSame?.score != null && <Metric label="Score chat Infloww" value={sc(infwSame.score)} note="stesso mese" />}
            </div>
          </HeroMetric>
        )}

        {notes.length > 0 && (
          <section style={{ ...card, padding: "12px 16px", marginBottom: 18 }}>
            <SectionTitle aside="letture automatiche: spunti per la conversazione, non verdetti">Da considerare</SectionTitle>
            {notes.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 14, lineHeight: 1.5, color: CP.textPrimary }}>
                {n.severity === "warning" ? <AlertTriangle size={15} color={CP.accentRed} style={{ flexShrink: 0, marginTop: 3 }} /> : <Info size={15} color={CP.textMuted} style={{ flexShrink: 0, marginTop: 3 }} />}
                <span>{n.text}</span>
              </div>
            ))}
          </section>
        )}

        {perCreator.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle aside="dove rende e dove no, rispetto a chi lavora sulle stesse creator">Dove lavora</SectionTitle>
            <DataTable columns={creatorCols} rows={perCreator} defaultSort={{ key: "sales", dir: -1 }} minWidth={760} />
          </section>
        )}

        <section style={{ marginBottom: 18 }}>
          <SectionTitle aside={firstCp ? `storico CreatorsPro disponibile da ${monthName(firstCp)}` : null}>Andamento</SectionTitle>
          {active.length >= 2 && <Spark points={active} />}
          {histRows.length === 0 ? (
            <div style={{ ...card, padding: 16, fontSize: 14, color: CP.textMuted }}>Nessuno storico disponibile.</div>
          ) : (
            <DataTable rows={histRows} minWidth={640} columns={[
              { key: "period_id", label: "Mese", render: (h) => monthName(h.period_id) },
              { key: "score", label: "Score vendite", align: "right", render: (h) => h.status === "active" ? <span style={{ color: tierColor(h.tier), fontWeight: 500 }}>{sc(h.score)}</span> : <span style={{ color: CP.textMuted }}>{h.status === "no_activity" ? "nessun turno" : "dati CP non disponibili"}</span> },
              { key: "total_sales", label: "Venduto", align: "right", render: (h) => h.status === "active" ? fmt$(h.total_sales) : "—" },
              { key: "total_shifts", label: "Turni", align: "right", render: (h) => h.status === "active" ? fmtInt(h.total_shifts) : "—" },
              { key: "infw", label: "Score chat Infloww", align: "right", muted: true, render: (h) => sc(h.infw) },
            ]} />
          )}
          <button onClick={() => setShowAllMonths((v) => !v)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
            {showAllMonths ? "Mostra solo i mesi con dati" : "Mostra tutti gli ultimi 12 mesi"}
          </button>
        </section>

        {cp?.peer_strong?.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle aside="utili come riferimento o affiancamento">Chi rende meglio sulle stesse creator</SectionTitle>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {cp.peer_strong.map((p) => (
                <Link key={p.name} href={`/leaderboard/operational/${encodeURIComponent(p.name)}`} style={{ ...card, padding: "8px 12px", textDecoration: "none", color: CP.textPrimary, fontSize: 14, display: "inline-flex", gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span style={{ color: tierColor(p.tier) }}>{sc(p.score)}</span>
                  <span style={{ color: CP.textMuted, fontSize: 13 }}>{p.shared} {p.shared === 1 ? "creator in comune" : "creator in comune"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </>)}
    </div>
  );
}

// Andamento dello score sui mesi con dati: linea + soglia di revisione.
function Spark({ points }) {
  const W = 600, H = 90, pad = 8;
  const xs = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, points.length - 1);
  const ys = (v) => H - pad - ((v ?? 0) / 100) * (H - 2 * pad);
  return (
    <div style={{ ...card, padding: "10px 14px", marginBottom: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 90, display: "block" }} role="img" aria-label="Andamento score">
        <line x1={pad} x2={W - pad} y1={ys(REVIEW)} y2={ys(REVIEW)} stroke={CP.accentRed} strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
        <polyline fill="none" stroke={CP.accent} strokeWidth="2" points={points.map((p, i) => `${xs(i)},${ys(p.score)}`).join(" ")} />
        {points.map((p, i) => <circle key={p.period_id} cx={xs(i)} cy={ys(p.score)} r="4" fill={CP.surface} stroke={CP.accent} strokeWidth="2" />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: CP.textMuted }}>
        <span>{monthName(points[0].period_id)}</span>
        <span>linea tratteggiata = soglia di revisione ({REVIEW})</span>
        <span>{monthName(points[points.length - 1].period_id)}</span>
      </div>
    </div>
  );
}

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
