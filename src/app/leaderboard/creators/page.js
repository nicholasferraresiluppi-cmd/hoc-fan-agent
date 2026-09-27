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
import { PageHead, HeroMetric, Metric, FilterChip, Disclosure, DataTable, Notice } from "@/components/ds";

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
  const [periodId, setPeriodId] = useSmartPeriod();
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const periodOptions = useMemo(() => monthOpts(), []);
  const prevId = prevOf(periodId);
  const isCurrent = periodId === periodOptions[0].value;

  const { data, isLoading } = useSWR(periodId ? `/api/leaderboard/creators?period_id=${periodId}&include_suggestions=1` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prev } = useSWR(prevId ? `/api/leaderboard/creators?period_id=${prevId}` : null, fetcher, { revalidateOnFocus: false });

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
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Creator" }]}
        title="Creator"
        subtitle="Quanto rende ogni creator e chi ci lavora meglio. Clic su una creator per il suo team, su un operatore per la sua scheda."
        actions={<>
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={ctl}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Link href={`/leaderboard/creators/heatmap?period_id=${periodId}`} style={{ ...ctl, textDecoration: "none" }}>Mappa operatore × creator</Link>
          <button onClick={() => setTutorialOpen(true)} style={{ ...ctl, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Info size={14} /> Lo score</button>
        </>}
      />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error} <Link href="/admin/creatorspro-sync" style={{ color: CP.accentSoftText }}>Sync CP →</Link></Notice>}

      {ok && (<>
        <HeroMetric
          label={`Venduto delle creator · ${monthLabel}${isCurrent ? " finora" : ""}`}
          value={fmt$(total)}
          compare={prev?.total_sales_agency ? (isCurrent ? `${prevName} intero: ${fmt$(prev.total_sales_agency)}` : `${prevName}: ${fmt$(prev.total_sales_agency)} (${fmtDelta(total, prev.total_sales_agency)})`) : null}
          hint="Solo i turni di operatori collegati: le persone CreatorsPro non collegate restano fuori (vedi Alert)."
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Creator attive" value={fmtInt(data.creators_count)} note={prev?.creators_count ? `${prevName}: ${prev.creators_count}` : null} />
            <Metric label="Operatori" value={fmtInt(data.operators_count)} />
            <Metric label="Venduto per turno" value={fmt$(data.avg_sales_per_shift_agency)} delta={fmtDelta(data.avg_sales_per_shift_agency, prev?.avg_sales_per_shift_agency)} />
            <Metric label="Venduto medio per creator" value={fmt$(data.avg_sales_per_creator)} />
          </div>
        </HeroMetric>

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
  );
}

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
