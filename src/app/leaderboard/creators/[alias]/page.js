"use client";

// Scheda creator (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Domanda: "come va questa creator e chi ci lavora meglio?" → numero principale
// col mese prima → team ordinabile (chi rende di più PER TURNO, con affidabilità
// del dato) → quando si vende (fasce in ORA ITALIANA, prima UTC e in inglese).
// Tolto "score 100 = media creator" (falso: lo score è 0-100 relativo ai colleghi
// sulla creator + agenzia, 50 ≈ metà).
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmt$, fmtInt, fmtDelta, fmtPct, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Disclosure, DataTable, Notice, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
const currentMonthId = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const prevOf = (pid) => { const [y, m] = pid.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthName = (pid) => `${MONTHS_IT[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}`;
const tierColor = (t) => (t === "Critical" || t === "Weak" ? CP.accentRed : t === "Strong" || t === "Elite" ? CP.accentGreen : CP.textSecondary);
const sc = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// Fasce CP calcolate in UTC (creatorspro-api bucketizeIntervalFromHour): mostrate in ora italiana
const BUCKETS = [["After", 2, 6], ["Morning", 6, 12], ["Afternoon", 12, 18], ["Evening", 18, 22], ["Night", 22, 2]];
const BUCKET_IT = { After: "Notte fonda", Morning: "Mattina", Afternoon: "Pomeriggio", Evening: "Sera", Night: "Notte" };
function romeOffset() {
  try {
    const d = new Date();
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(d));
    return ((h - d.getUTCHours()) + 24) % 24;
  } catch { return 2; }
}

export default function CreatorDrilldownPage({ params, searchParams }) {
  const rp = typeof params?.then === "function" ? use(params) : params;
  const rs = typeof searchParams?.then === "function" ? use(searchParams) : searchParams;
  let alias = "";
  try { alias = decodeURIComponent(rp.alias || ""); } catch { alias = rp.alias || ""; }
  const periodId = rs?.period_id || currentMonthId();
  const isCurrent = periodId === currentMonthId();
  const prevId = prevOf(periodId);
  const [showThin, setShowThin] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  const q = encodeURIComponent(alias);
  const { data, isLoading } = useSWR(`/api/leaderboard/creators/${q}?period_id=${periodId}`, fetcher, { revalidateOnFocus: false });
  const { data: prev } = useSWR(`/api/leaderboard/creators/${q}?period_id=${prevId}`, fetcher, { revalidateOnFocus: false });

  const c = data?.creator;
  const pc = prev?.creator;
  const ops = (data?.operators || []).map((o) => ({ ...o, id: o.employee }));
  const reliable = ops.filter((o) => !o.low_confidence);
  const shown = showThin ? ops : reliable;
  const est = ops.filter((o) => (o.split_pct || 0) >= 30).length;

  const off = useMemo(() => romeOffset(), []);
  const hours = (a, b) => `${String((a + off) % 24).padStart(2, "0")}-${String((b + off) % 24).padStart(2, "0")}`;
  const iv = c?.interval_sales || {};
  const ivTot = Object.values(iv).reduce((s, v) => s + v, 0);
  const ivMax = Math.max(1, ...Object.values(iv));
  const top = Object.entries(iv).sort((a, b) => b[1] - a[1])[0]?.[0];

  const columns = [
    { key: "employee", label: "Operatore", render: (o) => (
      <span>
        <Link href={`/leaderboard/operational/${encodeURIComponent(o.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{o.employee}</Link>
        {(o.split_pct || 0) >= 30 && <span title={`${o.split_pct}% dei turni su più creator senza vendite singole: venduto stimato dividendo in parti uguali`} style={{ marginLeft: 8, fontSize: 12, color: CP.textMuted }}>stima</span>}
      </span>
    ) },
    { key: "score", label: "Score su di lei", align: "right", sort: (o) => (o.low_confidence ? -1 : o.score), render: (o) => o.low_confidence
      ? <span style={{ color: CP.textMuted }} title="Meno di 3 turni: score non affidabile">pochi turni</span>
      : <span><span style={{ color: tierColor(o.tier), fontWeight: 500 }}>{sc(o.score)}</span> <span style={{ fontSize: 12, color: CP.textMuted }}>{o.tier}</span></span> },
    { key: "sales_per_shift", label: "Per turno", align: "right", render: (o) => fmt$(o.sales_per_shift) },
    { key: "sales", label: "Venduto", align: "right", render: (o) => fmt$(o.sales) },
    { key: "sales_share_pct", label: "Quota", align: "right", muted: true, render: (o) => fmtPct(o.sales_share_pct != null ? o.sales_share_pct / 100 : null, 1) },
    { key: "shifts", label: "Turni", align: "right", render: (o) => fmtInt(o.shifts) },
    { key: "sales_per_hour", label: "Per ora", align: "right", muted: true, render: (o) => fmt$(o.sales_per_hour) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Creator", href: `/leaderboard/creators?period_id=${periodId}` }, { label: alias }]}
        title={alias}
        subtitle={c ? `${c.operators_count} operatori · ${monthName(periodId)}${isCurrent ? " (in corso)" : ""}` : null}
        actions={
          <select value={periodId} aria-label="Mese" onChange={(e) => { window.location.href = `/leaderboard/creators/${encodeURIComponent(alias)}?period_id=${e.target.value}`; }}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body }}>
            {Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; return <option key={v} value={v}>{monthName(v)}</option>; })}
          </select>
        }
      />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {c && (<>
        <HeroMetric
          label={`Venduto per turno · ${monthName(periodId)}${isCurrent ? " finora" : ""}`}
          value={fmt$(c.avg_sales_per_shift)}
          compare={pc?.avg_sales_per_shift ? `${monthName(prevId)}: ${fmt$(pc.avg_sales_per_shift)} (${fmtDelta(c.avg_sales_per_shift, pc.avg_sales_per_shift)})` : null}
          hint="Misura a turno: si confronta anche a mese in corso."
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label={isCurrent ? "Venduto finora" : "Venduto"} value={fmt$(c.total_sales)} note={pc?.total_sales ? `${monthName(prevId)}${isCurrent ? " intero" : ""}: ${fmt$(pc.total_sales)}` : null} />
            <Metric label="Turni" value={fmtInt(c.total_shifts)} />
            <Metric label="Operatori" value={fmtInt(c.operators_count)} note={`${reliable.length} con almeno 3 turni`} />
            {top && <Metric label="Quando vende di più" value={BUCKET_IT[top]} note={`${Math.round((iv[top] / ivTot) * 100)}% del venduto`} />}
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <FilterChip label={`Con almeno 3 turni (${reliable.length})`} active={!showThin} onClick={() => setShowThin(false)} />
          <FilterChip label={`Tutti (${ops.length})`} active={showThin} onClick={() => setShowThin(true)} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          Score su di lei: 0-100, quanto rende per turno rispetto agli altri su questa creator (70%) e a tutta l&apos;agenzia (30%). {est ? `“stima” = ${est} operatori con molti turni su più creator senza il dettaglio delle vendite: il loro venduto qui è diviso in parti uguali.` : ""}
        </div>
        <div style={{ marginBottom: 14 }}>
          <DataTable columns={columns} rows={shown} defaultSort={{ key: "score", dir: -1 }} minWidth={820} empty="Nessun operatore." />
        </div>

        {ivTot > 0 && (
          <Disclosure open={hoursOpen} onToggle={() => setHoursOpen((v) => !v)} icon={<Clock size={15} />}
            title="Quando si vende" summary={top ? `soprattutto ${BUCKET_IT[top].toLowerCase()} (${Math.round((iv[top] / ivTot) * 100)}%)` : null}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
              {BUCKETS.map(([b, a, e]) => {
                const v = iv[b] || 0;
                return (
                  <div key={b} style={{ ...card, padding: "10px 12px" }}>
                    <div style={{ fontSize: 13, color: CP.textSecondary }}>{BUCKET_IT[b]} <span style={{ color: CP.textMuted }}>{hours(a, e)}</span></div>
                    <div style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{fmt$(v)}</div>
                    <div style={{ height: 6, background: CP.surfaceAlt, borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
                      <div style={{ width: `${(v / ivMax) * 100}%`, height: "100%", background: b === top ? CP.accent : CP.textMuted, borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>{Math.round((v / ivTot) * 100)}% del venduto</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Orari in ora italiana, per ora di inizio del turno.</div>
          </Disclosure>
        )}
      </>)}
    </div>
  );
}
