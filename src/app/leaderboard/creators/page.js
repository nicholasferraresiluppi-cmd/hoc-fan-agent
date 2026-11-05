"use client";

// Creator (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Domanda: "quanto rende ogni creator e chi ci lavora meglio?".
// Numero principale col riferimento al mese prima → filtri (in calo/in
// crescita per venduto a turno, nuove) + ricerca → tabella ordinabile →
// abbinamenti operatore↔creator spiegati in parole (prima: 5 di 8, etichette
// criptiche). Confronto sul mese in corso fatto su una misura a turno, mai sul
// totale del mese prima intero.
import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Info, Shuffle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmt$, fmtInt, fmtPct, fmtDelta, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Disclosure, DataTable, Notice, EarlyMonthNote, NUM } from "@/components/ds";
import VetroScope, { useVetro, VetroSwitch, VetroNum, useInVetro } from "@/components/VetroScope";
import { RankBars } from "@/components/VetroCharts";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
const MOVE = 0.15; // ±15% di venduto a turno = si è mosso davvero

function monthOpts(n = 18) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` };
  });
}
const prevOf = (pid) => { if (!pid) return null; const [y, m] = pid.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const num1 = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }));

export default function CreatorsLeaderboardPage() {
  const [periodId, setPeriodId, periodInfo] = useSmartPeriod();
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [vetro, setVetro] = useVetro();
  const periodOptions = useMemo(() => monthOpts(), []);
  const prevId = prevOf(periodId);
  const isCurrent = periodId === periodOptions[0].value;

  const { data, isLoading } = useSWR(periodId ? `/api/leaderboard/creators?period_id=${periodId}&include_suggestions=1` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prev } = useSWR(prevId ? `/api/leaderboard/creators?period_id=${prevId}` : null, fetcher, { revalidateOnFocus: false });
  // il venduto ufficiale (tutti i turni CP, = hub e P&L) per dire quanta parte è qui
  const { data: official } = useSWR(periodId ? `/api/leaderboard/agency-sales?period_id=${periodId}` : null, fetcher, { revalidateOnFocus: false });

  const ok = data && !data.error;
  const total = data?.total_sales_agency || 0;
  const prevBy = useMemo(() => new Map((prev?.creators || []).map((c) => [c.alias, c])), [prev]);
  const rows = useMemo(() => (ok ? data.creators : []).map((c) => {
    const p = prevBy.get(c.alias);
    const per = c.avg_sales_per_shift ?? (c.total_shifts ? c.total_sales / c.total_shifts : null);
    const pPer = p ? (p.avg_sales_per_shift ?? (p.total_shifts ? p.total_sales / p.total_shifts : null)) : null;
    return {
      ...c, id: c.alias, per,
      share: total > 0 ? c.total_sales / total : null,
      move: per != null && pPer ? (per - pPer) / pPer : null,
      isNew: prev?.creators && !p,
      prevSales: p?.total_sales ?? null,
    };
  }), [ok, data, prevBy, prev, total]);

  const counts = {
    down: rows.filter((r) => r.move != null && r.move <= -MOVE).length,
    up: rows.filter((r) => r.move != null && r.move >= MOVE).length,
    fresh: rows.filter((r) => r.isNew).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !`${r.alias} ${r.top_operator?.name || ""}`.toLowerCase().includes(needle)) return false;
    if (view === "down") return r.move != null && r.move <= -MOVE;
    if (view === "up") return r.move != null && r.move >= MOVE;
    if (view === "new") return r.isNew;
    return true;
  });
  const suggestions = data?.suggestions || [];
  const prevName = prevId ? MONTHS_IT[Number(prevId.slice(5)) - 1] : "";
  const monthLabel = periodOptions.find((p) => p.value === periodId)?.label || periodId;

  const columns = [
    { key: "rank", label: "#", align: "right", muted: true },
    { key: "alias", label: "Creator", render: (r) => (
      <Link href={`/leaderboard/creators/${encodeURIComponent(r.alias)}?period_id=${periodId}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>
        {r.alias}{r.isNew && <span style={{ marginLeft: 8, fontSize: 12, color: CP.accentSoftText }}>nuova</span>}
      </Link>
    ) },
    { key: "total_sales", label: "Venduto", align: "right", render: (r) => fmt$(r.total_sales) },
    { key: "share", label: "Quota", align: "right", muted: true, render: (r) => fmtPct(r.share, 1) },
    { key: "per", label: "Per turno", align: "right", render: (r) => fmt$(r.per) },
    { key: "move", label: "Per turno sul mese prima", align: "right", render: (r) => (
      <span style={{ color: r.move == null ? CP.textMuted : r.move <= -MOVE ? CP.accentRed : r.move >= MOVE ? CP.accentGreen : CP.textSecondary }}>
        {r.move == null ? "—" : `${r.move > 0 ? "+" : r.move < 0 ? "−" : ""}${Math.abs(Math.round(r.move * 100))}%`}
      </span>
    ) },
    { key: "total_shifts", label: "Turni", align: "right", render: (r) => fmtInt(r.total_shifts) },
    { key: "operators_count", label: "Operatori", align: "right" },
    { key: "top", label: "Chi vende di più", sort: (r) => r.top_operator?.sales || 0, render: (r) => r.top_operator ? (
      <span><Link href={`/leaderboard/operational/${encodeURIComponent(r.top_operator.name)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{r.top_operator.name}</Link>
        <span style={{ color: CP.textMuted, marginLeft: 6 }}>{fmt$(r.top_operator.sales)}</span></span>
    ) : "—" },
  ];

  return (
    <VetroScope on={vetro}>
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Creator" }]}
        title="Creator"
        subtitle="Quanto rende ogni creator e chi ci lavora meglio. Clic su una creator per il suo team, su un operatore per la sua scheda."
        actions={<>
          <VetroSwitch on={vetro} set={setVetro} />
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={ctl}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Link href={`/leaderboard/creators/heatmap?period_id=${periodId}`} style={{ ...ctl, textDecoration: "none" }}>Mappa operatore × creator</Link>
          <button onClick={() => setTutorialOpen(true)} style={{ ...ctl, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Info size={14} /> Lo score</button>
        </>}
      />
      <EarlyMonthNote info={periodInfo} periodId={periodId} onSwitch={setPeriodId} />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error} <Link href="/admin/creatorspro-sync" style={{ color: CP.accentSoftText }}>Sync CP →</Link></Notice>}
      {data?.visibility && !data.visibility.all && (
        <Notice>
          {(data.visibility.creators || []).length
            ? `Vedi le ${data.visibility.creators.length} creator assegnate a te.`
            : "Non hai ancora creator assegnate, quindi qui non c'è niente da mostrare. Chiedi a un admin di assegnartele in Membri e ruoli."}
        </Notice>
      )}

      {ok && (<>
        <VetroOverview data={data} prev={prev} official={official} rows={rows} total={total} isCurrent={isCurrent} prevName={prevName} monthLabel={monthLabel} periodId={periodId} onView={setView} />
        {!vetro && <HeroMetric
          label={`Venduto delle creator · ${monthLabel}${isCurrent ? " finora" : ""}`}
          value={fmt$(total)}
          compare={prev?.total_sales_agency ? (isCurrent ? `${prevName} intero: ${fmt$(prev.total_sales_agency)} · il confronto allo stesso giorno è nell'hub` : `${prevName}: ${fmt$(prev.total_sales_agency)} (${fmtDelta(total, prev.total_sales_agency)})`) : null}
          hint={official?.current?.sales ? `Venduto ufficiale ${official.visibility?.all === false ? "delle tue creator" : "dell'agenzia"} (hub e P&L): ${fmt$(official.current.sales)}. Qui solo i turni di operatori collegati: ${fmt$(Math.max(0, official.current.sales - total))} restano fuori (vedi Alert).` : "Solo i turni di operatori collegati: le persone CreatorsPro non collegate restano fuori (vedi Alert)."}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Creator attive" value={fmtInt(data.creators_count)} note={prev?.creators_count ? `${prevName}: ${prev.creators_count}` : null} />
            <Metric label="Operatori" value={fmtInt(data.operators_count)} />
            <Metric label="Venduto per turno" value={fmt$(data.avg_sales_per_shift_agency)} delta={fmtDelta(data.avg_sales_per_shift_agency, prev?.avg_sales_per_shift_agency)} />
            <Metric label="Venduto medio per creator" value={fmt$(data.avg_sales_per_creator)} />
          </div>
        </HeroMetric>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <FilterChip label={`Tutte (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`In calo (${counts.down})`} danger={counts.down > 0} disabled={!counts.down} active={view === "down"} onClick={() => setView(view === "down" ? "all" : "down")} />
          <FilterChip label={`In miglioramento (${counts.up})`} disabled={!counts.up} active={view === "up"} onClick={() => setView(view === "up" ? "all" : "up")} />
          <FilterChip label={`Nuove (${counts.fresh})`} disabled={!counts.fresh} active={view === "new"} onClick={() => setView(view === "new" ? "all" : "new")} />
          <span style={{ flex: 1 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca creator o operatore" aria-label="Cerca creator o operatore" style={{ ...ctl, width: 240 }} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          In calo / in crescita = venduto per turno cambiato di almeno {MOVE * 100}% rispetto a {prevName} (misura a turno: vale anche a mese in corso).
        </div>
        <div style={{ marginBottom: 14 }}>
          <DataTable columns={columns} rows={shown} defaultSort={{ key: "total_sales", dir: -1 }} minWidth={980} maxHeight="calc(100vh - 120px)"
            empty={needle ? `Nessuna creator corrisponde a “${q}”.` : "Nessuna creator in questa vista."} />
        </div>

        {suggestions.length > 0 && (
          <Disclosure open={matchOpen} onToggle={() => setMatchOpen((v) => !v)} icon={<Shuffle size={15} />}
            title={`Abbinamenti da valutare (${suggestions.length})`}
            summary="operatori che rendono molto di più su una creator che nella loro media">
            <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>
              Operatori il cui score su una creator supera di molto la loro media: candidati a lavorarci di più. È un segnale da verificare (turni, disponibilità), non un ordine.
            </div>
            {suggestions.map((s, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14, lineHeight: 1.5 }}>
                <Link href={`/leaderboard/operational/${encodeURIComponent(s.employee)}`} style={{ color: CP.textPrimary, fontWeight: 500, textDecoration: "none" }}>{s.employee}</Link>
                {" rende molto di più su "}
                <Link href={`/leaderboard/creators/${encodeURIComponent(s.top_creator)}?period_id=${periodId}`} style={{ color: CP.textPrimary, fontWeight: 500, textDecoration: "none" }}>{s.top_creator}</Link>
                <div style={{ fontSize: 13, color: CP.textMuted }}>
                  score {num1(s.top_score)} su di lei contro {num1(s.avg_score)} di media sua (+{num1(s.gap)} punti) · {fmt$(s.top_sales)} venduti lì questo mese
                </div>
              </div>
            ))}
          </Disclosure>
        )}
        <div style={{ fontSize: 12, color: CP.textMuted }}>
          Nei turni su più creator il venduto è attribuito con le singole vendite di CreatorsPro quando ci sono, altrimenti diviso in parti uguali (stima).
        </div>
      </>)}
    </div>
    </VetroScope>
  );
}

// Colpo d'occhio delle creator (solo col vetro, 26/10/2026): quattro riquadri al posto del numero grande,
// chi porta il venduto (ciambella) e chi si è mosso di più nel venduto a turno sul mese prima (misura
// a turno, quindi onesta anche a mese in corso). Stessi numeri della pagina, nessuna richiesta nuova.
function VetroOverview({ data, prev, official, rows, total, isCurrent, prevName, monthLabel, periodId, onView }) {
  const inVetro = useInVetro();
  if (!inVetro) return null;
  const pt = prev?.avg_sales_per_shift_agency;
  const perDelta = pt ? (data.avg_sales_per_shift_agency - pt) / pt : null;
  const pctTxt = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
  // 26/10/2026 («per ogni pagina capiscine l'utilità»): la pagina Creator serve a «dove si vende, e dove si
  // vende meglio a turno» → al posto di quattro riquadri e di una ciambella con troppe fette, due classifiche
  // a barre: chi porta il venduto (quota sul totale) e il venduto per turno con la tacca della media
  // dell'agenzia (verde chi sta sopra, almeno MIN_PER_SHIFTS turni); sotto chi si è mosso.
  const MIN_PER_SHIFTS = 5;
  const href = (r) => `/leaderboard/creators/${encodeURIComponent(r.alias)}?period_id=${periodId}`;
  const avgPer = data.avg_sales_per_shift_agency;
  const bySales = [...rows].filter((r) => r.total_sales > 0).sort((a, b) => b.total_sales - a.total_sales).map((r) => ({ label: r.alias, value: r.total_sales, href: href(r) }));
  const byPer = [...rows].filter((r) => r.per != null && (r.total_shifts || 0) >= MIN_PER_SHIFTS).sort((a, b) => b.per - a.per)
    .map((r) => ({ label: r.alias, value: r.per, href: href(r), good: avgPer != null && r.per >= avgPer }));
  const moved = rows.filter((r) => r.move != null);
  const ups = [...moved].filter((r) => r.move > 0).sort((a, b) => b.move - a.move).slice(0, 5);
  const downs = [...moved].filter((r) => r.move < 0).sort((a, b) => a.move - b.move).slice(0, 5);
  const maxM = Math.max(0.01, ...ups.map((r) => r.move), ...downs.map((r) => -r.move));
  const bar = (r, up) => (
    <Link key={r.id} href={href(r)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr) 52px", gap: 10, alignItems: "center", fontSize: 13, color: CP.textPrimary, textDecoration: "none", padding: "3px 0" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.alias}</span>
      <span style={{ height: 8, borderRadius: 99, background: CP.track, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${(Math.abs(r.move) / maxM) * 100}%`, borderRadius: 99, background: up ? "var(--vt-c1)" : "var(--vt-c2)" }} />
      </span>
      <span style={{ textAlign: "right", color: up ? CP.accentGreen : CP.textSecondary, ...NUM }}>{pctTxt(r.move)}</span>
    </Link>
  );
  const head = (title, sub) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>{title}</div>
      <div style={{ fontSize: 12.5, color: CP.textMuted, ...NUM }}>{sub}</div>
    </div>
  );
  return (
    <>
      <div style={{ fontSize: 13, color: CP.textSecondary, margin: "0 2px 10px", ...NUM }}>
        {fmtInt(data.creators_count)} creator attive, {fmtInt(data.operators_count)} operatori · venduto <b style={{ color: CP.textPrimary, fontWeight: 500 }}><VetroNum value={fmt$(total)} /></b>
        {official?.current?.sales ? ` di ${fmt$(official.current.sales)} ufficiali` : ""}{isCurrent ? " finora" : ""}
      </div>
      {(bySales.length > 0 || byPer.length > 0) && (
        <div className="vt-row21" style={{ marginBottom: 14 }}>
          {bySales.length > 0 && (
            <section className="vt-glass" style={{ "--vt-i": 1, borderRadius: 22, padding: 18, minWidth: 0 }}>
              {head("Chi porta il venduto", `${monthLabel} · quota sul totale`)}
              <RankBars items={bySales} limit={10} />
            </section>
          )}
          {byPer.length > 0 && (
            <section className="vt-glass" style={{ "--vt-i": 2, borderRadius: 22, padding: 18, minWidth: 0 }}>
              {head("Venduto per turno", perDelta == null ? `almeno ${MIN_PER_SHIFTS} turni` : <><span style={{ color: perDelta >= 0 ? CP.accentGreen : CP.textMuted }}>{pctTxt(perDelta)}</span> sul {prevName}, agenzia</>)}
              <RankBars items={byPer} limit={10} mark={avgPer} markLabel={`media dell'agenzia ${fmt$(avgPer)} a turno · in verde chi sta sopra`} />
            </section>
          )}
        </div>
      )}
      {moved.length > 0 && (
        <section className="vt-glass" style={{ "--vt-i": 3, borderRadius: 22, padding: 18, minWidth: 0, marginBottom: 14 }}>
          {head("Chi si è mosso di più", `venduto per turno sul ${prevName || "mese prima"}`)}
          {ups.length === 0 && downs.length === 0 ? (
            <div style={{ fontSize: 13, color: CP.textMuted }}>Ancora nessun confronto col mese prima.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
              <div>
                <button onClick={() => onView("up")} style={moveHead}>In miglioramento</button>
                {ups.length ? ups.map((r) => bar(r, true)) : <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna.</div>}
              </div>
              <div>
                <button onClick={() => onView("down")} style={moveHead}>In calo</button>
                {downs.length ? downs.map((r) => bar(r, false)) : <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna.</div>}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
const moveHead = { display: "block", background: "none", border: "none", padding: 0, margin: "0 0 6px", fontSize: 12.5, color: CP.textSecondary, cursor: "pointer", fontFamily: FONTS.body };

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
