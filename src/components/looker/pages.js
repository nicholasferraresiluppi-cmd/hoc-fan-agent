"use client";
/**
 * Le pagine del Report Looker (10/10/2026): una funzione per pagina Looker, con la stessa disposizione
 * dei blocchi. Dati: API di Analisi vendite (viste "lk-*" + quelle esistenti), formule in
 * lib/analisi-vendite-sql.js e lib/looker-sql.js, verificate contro i numeri di Looker.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { CP } from "@/lib/brand";
import { Notice } from "@/components/ds";
import PeriodPicker from "@/components/PeriodPicker";
import { fmt, LkDelta, LkPage, LkTitle, LkSelect, LkInput, LkTable, LkLine, LkBars, LkDonut, LkScore, LkGrid, lkCard, seriesColor } from "@/components/looker/Lk";

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const yesterday = () => iso(Date.now() - DAY);

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "Errore"); e.info = j; throw e; }
  return j;
};

/* ───────── dati di una pagina: vista + periodo + creator ───────── */
function useLk(view, range, creators, extra = {}) {
  const [refresh, setRefresh] = useState(0);
  const url = useMemo(() => {
    const q = new URLSearchParams({ view });
    if (range) { q.set("from", range.from); q.set("to", range.to); }
    if (creators?.length) q.set("creators", creators.join(","));
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    if (refresh) q.set("refresh", "1");
    return `/api/admin/analisi-vendite?${q}`;
  }, [view, range?.from, range?.to, creators?.join(","), JSON.stringify(extra), refresh]);
  const swr = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  return { ...swr, reload: () => setRefresh((n) => n + 1) };
}

/** Filtri comuni (creator + periodo) e stato di caricamento/errore di una pagina. */
function Filters({ data, creators, setCreators, range, setRange, maxToday = false, isLoading }) {
  const options = (data?.creators || []).map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <LkSelect label="creator_name" options={options} value={creators} onChange={setCreators} width={240} />
      <PeriodPicker value={range || data?.range || null} onChange={setRange} max={maxToday ? iso(Date.now()) : yesterday()} loading={isLoading && Boolean(data)} />
    </>
  );
}

function State({ swr, children }) {
  if (swr.error) return <Notice danger>{swr.error.message}</Notice>;
  if (swr.data?.empty) return <Notice>{swr.data.message}</Notice>;
  if (!swr.data) return <div style={{ ...lkCard, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso…</div>;
  return <div style={{ display: "grid", gap: 14, opacity: swr.isLoading ? 0.6 : 1, transition: "opacity .15s" }}>{children}</div>;
}

/* ───────── HOC Analytics 3.0 › Recap Dashboard ───────── */
export function RecapDashboard({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-recap", range, creators);
  const d = swr.data;
  const block = (rows, key, deltaKey, series, valueFmt, total) => (
    <LkGrid cols="minmax(max-content, 1fr) minmax(0, 1.2fr) minmax(0, 0.85fr)">
      <LkTable numbered maxHeight={250} pageSize={100}
        columns={[
          { key: "name", label: "creator_name", width: 150 },
          { key, label: key === "net" ? "net" : "subs_count", align: "right", render: (r) => valueFmt(r[key]) },
          { key: deltaKey, label: "% Δ", align: "right", render: (r) => <LkDelta v={r[deltaKey]} /> },
        ]}
        rows={rows} total={{ name: "", [key]: total[key], [deltaKey]: total[deltaKey] }} initialSort={{ key, dir: "desc" }} />
      <LkLine x={d.days} xFmt={fmt.day} series={series.slice(0, 6)} yFmt={fmt.short} height={250} />
      <LkDonut items={rows.slice(0, 14).map((r, i) => ({ label: r.name, value: r[key] })).concat(rows.slice(14).some((r) => r[key] > 0) ? [{ label: "Altro", value: rows.slice(14).reduce((s, r) => s + r[key], 0) }] : [])} valueFmt={valueFmt} height={220} />
    </LkGrid>
  );
  return (
    <LkPage title="MAIN DASHBOARD"
      description="The following dashboard provides a summary of the main metrics for all our creators. All data can be filtered by date using the filter on the right side, and it's also possible to filter by one or more specific creators"
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-recap" && (
          <>
            <LkTitle>Revenue per Creator</LkTitle>
            {block(d.net, "net", "net_delta", d.netSeries, fmt.money, d.total)}
            <LkTitle>New Subs per Creator</LkTitle>
            {block(d.subs, "subs", "subs_delta", d.subsSeries, fmt.int, d.total)}
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Clicks Overall ───────── */
export function ClicksOverall({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-clicks", range, creators);
  const d = swr.data;
  return (
    <LkPage title="Tracking Links Stats Overall"
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-clicks" && (
          <LkGrid cols="minmax(max-content, 1.6fr) minmax(260px, 1fr)">
            <LkTable maxHeight={520}
              columns={[
                { key: "name", label: "creator_name", width: 170 },
                { key: "month_label", label: "calendar_date (Anno e mese)", sort: (r) => r.month },
                { key: "clicks", label: "clicks_diff", align: "right", render: (r) => fmt.int(r.clicks) },
                { key: "clicks_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.clicks_delta} /> },
                { key: "subs", label: "subs_diff", align: "right", render: (r) => fmt.int(r.subs) },
                { key: "subs_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.subs_delta} /> },
                { key: "cr", label: "CR Clicks/Subs", align: "right", render: (r) => fmt.pct(r.cr) },
                { key: "cr_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.cr_delta} /> },
              ]}
              rows={d.rows} total={{ name: "", month_label: "", ...d.total }} initialSort={{ key: "clicks", dir: "desc" }} />
            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <LkDonut title="Clicks" items={d.rows.slice(0, 14).map((r) => ({ label: r.name, value: r.clicks })).concat(d.rows.slice(14).some((r) => r.clicks > 0) ? [{ label: "Altro", value: d.rows.slice(14).reduce((s, r) => s + r.clicks, 0) }] : [])} height={200} />
              <LkBars items={d.rows.slice(0, 24).map((r) => ({ label: r.name, values: [r.clicks] }))} series={[{ label: d.rows[0]?.month_label || "clicks" }]} height={230} />
            </div>
          </LkGrid>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Creators Reach ───────── */
export function CreatorsReach({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("copertura", range, creators);
  const d = swr.data;
  return (
    <LkPage title="Creators Reach"
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "copertura" && (
          <LkGrid cols="1fr 1.15fr">
            <LkTable maxHeight={460}
              columns={[
                { key: "name", label: "creator_name", width: 200 },
                { key: "reach", label: "total", align: "right", render: (r) => fmt.int(r.reach) },
                { key: "delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.delta} /> },
              ]}
              rows={d.rows} total={{ name: "", reach: d.total.reach, delta: d.total.delta }} initialSort={{ key: "reach", dir: "desc" }} />
            <LkLine x={d.daily.map((p) => p.day)} xFmt={fmt.day} series={[{ label: "total", values: d.daily.map((p) => p.reach), color: CP.accent }]} yFmt={fmt.short} height={360} />
          </LkGrid>
        )}
      </State>
    </LkPage>
  );
}


/* ───────── utilità comuni ───────── */
const top = (rows, key, n = 14, label = (r) => r.name) => {
  const head = rows.slice(0, n).map((r) => ({ label: label(r), value: r[key] }));
  const rest = rows.slice(n).reduce((s, r) => s + (Number(r[key]) || 0), 0);
  return rest > 0 ? head.concat([{ label: "Altro", value: rest }]) : head;
};
const sortedBy = (rows, key) => [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0));
const note = (t) => <div style={{ fontSize: 13, color: CP.textSecondary }}>{t}</div>;
// RR come Looker: verde vicino a 1, poi giallo, arancio, rosso sopra 2,5
const rrColor = (rr) => (rr == null ? null : `color-mix(in srgb, ${CP.accentRed} ${Math.round(Math.max(0, Math.min(1, (rr - 1.3) / 1.4)) * 100)}%, ${CP.accentGreen})`);

/* ───────── HOC Analytics 3.0 › Welcome mass unlocks ───────── */
export function WelcomeMassUnlocks({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-welcome", range, creators);
  const d = swr.data;
  return (
    <LkPage title="Welcome mass unlocks"
      description={'This dashboard displays the number of welcome unlocks that have been carried out, based on the specified amount (indicated in the sheet\'s table under "price_tag") for a specific date range. Subs_count refers to the number of subscriptions made since the new amount was entered (in the selected date range).'}
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-welcome" && (() => {
          // come Looker: solo le pagine con un prezzo di benvenuto impostato (amount > 0)
          const rows = d.rows.filter((r) => r.amount > 0);
          const subs = rows.reduce((s, r) => s + r.subs, 0);
          const unlocks = rows.reduce((s, r) => s + r.unlocks, 0);
          return (
          <LkGrid cols="minmax(max-content, 1.2fr) minmax(0, 1fr)">
            <LkTable maxHeight={440}
              columns={[
                { key: "name", label: "creator_name", width: 180 },
                { key: "amount", label: "amount", align: "right", render: (r) => fmt.num(r.amount) },
                { key: "subs", label: "subs_count", align: "right", render: (r) => fmt.int(r.subs) },
                { key: "unlocks", label: "unlocks_count", align: "right", render: (r) => fmt.int(r.unlocks) },
                { key: "revenue", label: "Revenue", align: "right", render: (r) => fmt.num(r.revenue) },
                { key: "cr", label: "CR Subs/Unlocks", align: "right", render: (r) => fmt.pct(r.cr), heat: true, heatColor: CP.accentGreen },
              ]}
              rows={rows} total={{ name: "", amount: "", subs, unlocks, revenue: rows.reduce((s, r) => s + r.revenue, 0), cr: subs ? unlocks / subs : null }}
              initialSort={{ key: "name", dir: "desc" }} />
            <LkLine x={d.daily.map((p) => p.day)} xFmt={fmt.day} height={380}
              series={[{ label: "unlocks_count", values: d.daily.map((p) => p.unlocks), color: CP.accentRed }, { label: "subs_count", values: d.daily.map((p) => p.subs), color: seriesColor(9), axis: "right" }]} />
          </LkGrid>
          );
        })()}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Performance KPI per creators ───────── */
export function PerformanceKpi({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-perf", range, creators);
  const d = swr.data;
  const pair = (key, label, f) => [
    { key, label, align: "right", render: (r) => f(r[key]) },
    { key: `${key}_delta`, label: "% Δ", align: "right", render: (r) => <LkDelta v={r[`${key}_delta`]} /> },
  ];
  return (
    <LkPage title="Performance KPI per creator"
      description="Here we can see metrics about each creator regarding revenue (without subscriptions), number of transactions, spending users, revenue per transactions, revenue per users and new subs. % Δ refers to the previous date range."
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-perf" && (
          <>
            <LkTable numbered maxHeight={250}
              columns={[
                { key: "name", label: "creator_name", width: 190 },
                ...pair("new_subs", "new_subs", fmt.int), ...pair("tx", "num_transactions", fmt.int), ...pair("revenue", "tot_revenue", fmt.num),
                ...pair("users", "spending users", fmt.int), ...pair("rpt", "revenue per transaction", fmt.num), ...pair("rpu", "revenue per user", fmt.num),
              ]}
              rows={d.rows} total={{ name: "", ...d.total }} initialSort={{ key: "name", dir: "asc" }} />
            <LkGrid cols="1fr 1fr">
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Spent by Subscription Date Range</LkTitle>
                <LkDonut hole={0} items={d.bySubsRange.map((r) => ({ label: r.range, value: r.revenue }))} valueFmt={fmt.num} height={170} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Avg Revenue per Conv. Users per Subscription Range</LkTitle>
                <LkTable maxHeight={185}
                  columns={[
                    { key: "range", label: "subscription_range" },
                    { key: "arppu", label: "ARPPU", align: "right", render: (r) => fmt.num(r.arppu) },
                    { key: "arppu_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.arppu_delta} /> },
                    { key: "users", label: "conv_users", align: "right", render: (r) => fmt.int(r.users) },
                    { key: "users_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.users_delta} /> },
                  ]}
                  rows={d.bySubsRange} total={d.subsRangeTotal ? { range: "", ...d.subsRangeTotal } : null} initialSort={{ key: "range", dir: "asc" }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Converted Users per Subscriptions Date Range</LkTitle>
                <LkTable numbered maxHeight={185}
                  columns={[
                    { key: "name", label: "creator_name", width: 130 },
                    { key: "arppu", label: "ARPPU", align: "right", render: (r) => fmt.num(r.arppu) },
                    { key: "arppu_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.arppu_delta} /> },
                  ]}
                  rows={d.byCreatorArppu} total={d.creatorArppuTotal ? { name: "", ...d.creatorArppuTotal } : null} initialSort={{ key: "arppu", dir: "desc" }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Num. Transactions per Amount Range</LkTitle>
                <LkDonut hole={0} items={sortedBy(d.byAmount, "tx").map((r) => ({ label: r.range, value: r.tx }))} height={170} />
              </div>
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Detailed Performance KPI per creators ───────── */
export function DetailedKpi({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("meta-mese", range, creators);
  const d = swr.data;
  const rows = (d?.rows || []).map((r) => ({ ...r, total_subs: (Number(r.mid_subs) || 0) + (Number(r.end_subs) || 0) }));
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return (
    <LkPage title="Detailed performance KPI per creator" description="Similar to the Performance KPI view but split for the 1st and 2nd half of the month."
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "meta-mese" && (
          <>
            <LkTable maxHeight={330}
              columns={[
                { key: "name", label: "Name", width: 170 },
                { key: "month", label: "Month", render: (r) => fmt.month(r.month) },
                { key: "mid_revenue", label: "1° Half Month Revenue", align: "right", render: (r) => fmt.num(r.mid_revenue), heat: true, heatColor: CP.accentRed },
                { key: "mid_transactions", label: "1° Half Month Trans.", align: "right", render: (r) => fmt.int(r.mid_transactions) },
                { key: "mid_users", label: "1° Half Month Spending Users", align: "right", render: (r) => fmt.int(r.mid_users) },
                { key: "mid_subs", label: "1° Half Month New Subs", align: "right", render: (r) => fmt.int(r.mid_subs) },
                { key: "end_revenue", label: "2° Half Month Revenue", align: "right", render: (r) => fmt.num(r.end_revenue), heat: true, heatColor: CP.gold },
                { key: "end_transactions", label: "2° Half Month Trans.", align: "right", render: (r) => fmt.int(r.end_transactions) },
                { key: "end_users", label: "2° Half Month Spending Users", align: "right", render: (r) => fmt.int(r.end_users) },
                { key: "end_subs", label: "2° Half Month New Subs", align: "right", render: (r) => fmt.int(r.end_subs) },
                { key: "total_revenue", label: "Total Month Revenue", align: "right", render: (r) => fmt.num(r.total_revenue) },
                { key: "total_subs", label: "Total Month Subs", align: "right", render: (r) => fmt.int(r.total_subs) },
              ]}
              rows={rows} total={Object.fromEntries(["mid_revenue", "mid_transactions", "mid_users", "mid_subs", "end_revenue", "end_transactions", "end_users", "end_subs", "total_revenue", "total_subs"].map((k) => [k, sum(k)]).concat([["name", ""], ["month", ""]]))}
              initialSort={{ key: "name", dir: "asc" }} />
            <LkGrid cols="1fr 1fr">
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Revenue distribution 1° Half / 2° Half</LkTitle>
                <LkBars items={rows.map((r) => ({ label: r.name, values: [r.mid_revenue, r.end_revenue] }))} series={[{ label: "mid_month_revenue" }, { label: "end_month_revenue", color: seriesColor(9) }]} valueLabels height={260} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>New Sub distribution 1° Half / 2° Half</LkTitle>
                <LkBars items={rows.map((r) => ({ label: r.name, values: [r.mid_subs, r.end_subs] }))} series={[{ label: "mid_new_subs" }, { label: "end_new_subs", color: seriesColor(9) }]} valueLabels height={260} />
              </div>
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Transactions Details ───────── */
const TX_TYPES = ["message", "post", "tip", "subscription", "recurring_subscription", "stream"];
export function TransactionsDetails({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const [f, setF] = useState({ link: "", user: "", type: [], spending: "" });
  const swr = useLk("lk-tx", range, creators, { link: f.link, user: f.user, type: f.type[0] || "", spending: f.spending });
  const d = swr.data;
  return (
    <LkPage title="Transactions Details"
      description="The following table displays the transactions along with any corresponding tracking links. You can order all the columns by time, creator and link name for any specific date range."
      filters={<>
        <LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={200} />
        <LkInput label="link_name" value={f.link} onChange={(v) => setF({ ...f, link: v })} />
        <LkInput label="user_id" value={f.user} onChange={(v) => setF({ ...f, user: v.replace(/\D/g, "") })} width={150} />
        <LkSelect label="type" options={TX_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(v) => setF({ ...f, type: v.slice(-1) })} width={160} search={false} />
        <LkInput label="spending_id" value={f.spending} onChange={(v) => setF({ ...f, spending: v })} width={150} />
        <PeriodPicker value={range || d?.range || null} onChange={setRange} max={iso(Date.now())} compare loading={swr.isLoading && Boolean(d)} />
      </>}>
      <State swr={swr}>
        {d && d.view === "lk-tx" && (
          <>
            <LkGrid cols="minmax(0, 2.4fr) minmax(280px, 1fr)">
              <LkTable maxHeight={340}
                columns={[
                  { key: "created_at", label: "created_at", render: (r) => fmt.dt(r.created_at) },
                  { key: "name", label: "creator_name", width: 160 },
                  { key: "user_id", label: "user_id" },
                  { key: "subscribed_on", label: "user_subscription_date", render: (r) => (r.subscribed_on ? fmt.dayFull(r.subscribed_on) : "null") },
                  { key: "link_name", label: "link_name", width: 170 },
                  { key: "spending_id", label: "spending_id" },
                  { key: "type", label: "type" },
                  { key: "net", label: "net", align: "right", render: (r) => fmt.num(r.net) },
                  { key: "amount", label: "amount", align: "right", render: (r) => fmt.num(r.amount) },
                ]}
                rows={d.rows} total={{ created_at: "", net: d.totals.net, amount: d.rows.reduce((s, r) => s + (r.amount || 0), 0) }} initialSort={{ key: "created_at", dir: "desc" }} />
              <LkTable maxHeight={340}
                columns={[
                  { key: "name", label: "creator_name", width: 140 },
                  { key: "user_id", label: "user_id" },
                  { key: "net", label: "net", align: "right", render: (r) => fmt.num(r.net) },
                ]}
                rows={d.topUsers} total={{ name: "", user_id: "", net: d.totals.net }} initialSort={{ key: "net", dir: "desc" }} />
            </LkGrid>
            {d.truncated && note("Mostrate le ultime 1.000 transazioni del periodo: i totali, i grafici e i riquadri contano tutte le transazioni.")}
            <LkGrid cols="minmax(0, 1.25fr) minmax(0, 1.15fr) minmax(200px, 0.5fr)">
              <LkLine x={d.byDay.map((p) => p.day)} xFmt={fmt.day} series={[{ label: "net", values: d.byDay.map((p) => p.net), color: CP.accent }]} yFmt={fmt.short} height={220} />
              <LkLine x={d.byHour.map((p) => String(p.hour).padStart(2, "0"))} series={[{ label: "net", values: d.byHour.map((p) => p.net), color: CP.accent }]} yFmt={fmt.short} height={220} />
              <div style={{ display: "grid", gap: 10 }}>
                <LkScore label="net" value={fmt.num(d.totals.net)} delta={d.totals.net_delta} />
                <LkScore label="spending users" value={fmt.int(d.totals.users)} delta={d.totals.users_delta} />
                <LkScore label="LTV" value={fmt.num(d.totals.ltv)} delta={d.totals.ltv_delta} />
              </div>
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Subs Notifications Report ───────── */
const SUB_TYPES = ["new_subscriber", "returning_subscriber", "new_subscriber_trial"];
export function SubsNotifications({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const [f, setF] = useState({ link: "", username: "", spending: "" });
  const swr = useLk("notifiche", range, creators);
  const d = swr.data;
  const list = useMemo(() => (d?.list || []).filter((r) =>
    (!f.link || String(r.link_name || "").toLowerCase().includes(f.link.toLowerCase()))
    && (!f.username || String(r.username || "").toLowerCase().startsWith(f.username.toLowerCase()))
    && (!f.spending || String(r.spending_id || "") === f.spending)), [d, f]);
  const byCT = (d?.byCreator || []).flatMap((c) => SUB_TYPES.filter((t) => c[t]).map((t) => ({ name: c.name, sub_type: t, n: c[t] })));
  const days = (d?.daily || []).map((p) => p.day);
  const cumul = days.slice(-10).reverse().map((day, i) => {
    let acc = 0;
    return { label: fmt.dayFull(day), values: Array.from({ length: 24 }, (_, h) => (acc += d.dayHour?.[`${day}|${h}`] || 0)), color: seriesColor(i) };
  });
  return (
    <LkPage title="Subs notifications report"
      filters={<>
        <LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={200} />
        <LkInput label="link_name" value={f.link} onChange={(v) => setF({ ...f, link: v })} width={150} />
        <LkInput label="username" value={f.username} onChange={(v) => setF({ ...f, username: v })} width={150} />
        <LkInput label="spending_id" value={f.spending} onChange={(v) => setF({ ...f, spending: v })} width={150} />
        <PeriodPicker value={range || d?.range || null} onChange={setRange} max={iso(Date.now())} compare={false} loading={swr.isLoading && Boolean(d)} />
      </>}>
      <State swr={swr}>
        {d && d.view === "notifiche" && (
          <>
            <LkGrid cols="minmax(0, 1.9fr) minmax(300px, 1fr)">
              <LkTable maxHeight={340}
                columns={[
                  { key: "created_at", label: "created_at", render: (r) => fmt.dt(r.created_at) },
                  { key: "name", label: "creator_name", width: 160 },
                  { key: "username", label: "username" },
                  { key: "sub_type", label: "sub_type" },
                  { key: "link_name", label: "link_name", width: 160 },
                  { key: "spending_id", label: "spending_id" },
                ]}
                rows={list} initialSort={{ key: "created_at", dir: "desc" }} />
              <LkTable maxHeight={340}
                columns={[
                  { key: "name", label: "creator_name", width: 150 },
                  { key: "sub_type", label: "sub_type" },
                  { key: "n", label: "Record Count", align: "right", render: (r) => fmt.int(r.n) },
                ]}
                rows={byCT} total={{ name: "", sub_type: "", n: d.totals.total }} initialSort={{ key: "n", dir: "desc" }} />
            </LkGrid>
            {note("La lista mostra le ultime 500 notifiche del periodo; i filtri link/username/spending agiscono su queste. I conteggi a destra e i grafici contano tutte le notifiche.")}
            <LkGrid cols="1fr 1fr">
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Subs per date</LkTitle>
                <LkLine x={days} xFmt={fmt.day} series={[{ label: "Record Count", values: d.daily.map((p) => p.total), color: CP.accent }]} height={230} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <LkTitle>Subs per hour</LkTitle>
                <LkLine x={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))} series={cumul} height={230} />
              </div>
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › User research ───────── */
export function UserResearch({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const [f, setF] = useState({ user: "", username: "" });
  const swr = useLk("lk-users", range, creators, f);
  const d = swr.data;
  return (
    <LkPage title="User research"
      description="Insert the username (e.g., onlyfans.com/__________), and the dashboard will display the creators, tracking links, subscription date, and total revenue associated with the user."
      filters={<>
        <LkInput label="user_id" value={f.user} onChange={(v) => setF({ ...f, user: v.replace(/\D/g, "") })} />
        <LkInput label="username" value={f.username} onChange={(v) => setF({ ...f, username: v })} />
        <LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={220} />
        <PeriodPicker value={range || d?.range || null} onChange={setRange} max={iso(Date.now())} compare={false} loading={swr.isLoading && Boolean(d)} />
      </>}>
      <State swr={swr}>
        {d && d.view === "lk-users" && (
          <>
            <LkTable maxHeight={560}
              columns={[
                { key: "name", label: "creator_name", width: 160 },
                { key: "user_id", label: "user_id" },
                { key: "username", label: "username" },
                { key: "fan_name", label: "name" },
                { key: "started_at", label: "started_at", render: (r) => fmt.dt(r.started_at) },
                { key: "ended_at", label: "ended_at", render: (r) => fmt.dt(r.ended_at) },
                { key: "spending_id", label: "spending_id" },
                { key: "spent", label: "total_net_expenses", align: "right", render: (r) => (r.spent == null ? "null" : fmt.num(r.spent)) },
                { key: "transactions", label: "transaction_count", align: "right", render: (r) => fmt.int(r.transactions) },
              ]}
              rows={d.rows} total={{ name: "", spent: d.total.spent, transactions: d.total.transactions }} initialSort={{ key: "started_at", dir: "desc" }} />
            {d.truncated && note("Mostrati i 1.000 abbonamenti più recenti del periodo: cerca per username o user_id per trovare un fan preciso.")}
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Chargeback Stats ───────── */
export function ChargebackStats({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const [f, setF] = useState({ user: "", username: "", payment: [] });
  const swr = useLk("lk-chargebacks", range, creators, { user: f.user, username: f.username, payment: f.payment[0] || "" });
  const d = swr.data;
  return (
    <LkPage title="Chargebacks Stats"
      filters={<>
        <LkInput label="user_id" value={f.user} onChange={(v) => setF({ ...f, user: v.replace(/\D/g, "") })} />
        <LkInput label="username" value={f.username} onChange={(v) => setF({ ...f, username: v })} />
        <LkSelect label="payment_type" options={["chat_messages", "subscribes", "tips", "posts", "stream"].map((t) => ({ value: t, label: t }))} value={f.payment} onChange={(v) => setF({ ...f, payment: v.slice(-1) })} width={180} search={false} />
        <LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={200} />
        <PeriodPicker value={range || d?.range || null} onChange={setRange} max={iso(Date.now())} compare={false} loading={swr.isLoading && Boolean(d)} />
      </>}>
      <State swr={swr}>
        {d && d.view === "lk-chargebacks" && (
          <LkGrid cols="minmax(0, 1.9fr) minmax(260px, 0.9fr)">
            <LkTable maxHeight={560}
              columns={[
                { key: "chargeback_at", label: "chargeback_at", render: (r) => fmt.dt(r.chargeback_at) },
                { key: "name", label: "creator_name", width: 130 },
                { key: "username", label: "username", width: 110 },
                { key: "link_name", label: "link_name", width: 110 },
                { key: "payment_type", label: "payment_type" },
                { key: "amount", label: "amount", align: "right", render: (r) => fmt.num(r.amount), heat: true, heatColor: CP.accentRed },
              ]}
              rows={d.rows} total={{ chargeback_at: "", amount: d.total }} initialSort={{ key: "chargeback_at", dir: "desc" }} />
            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <LkTable maxHeight={260}
                columns={[{ key: "username", label: "username" }, { key: "amount", label: "amount", align: "right", render: (r) => fmt.num(r.amount), heat: true, heatColor: CP.accentRed }]}
                rows={d.byUser} total={{ username: "", amount: d.total }} initialSort={{ key: "amount", dir: "desc" }} />
              <LkTable numbered maxHeight={260}
                columns={[{ key: "name", label: "creator_name", width: 160 }, { key: "amount", label: "amount", align: "right", render: (r) => fmt.num(r.amount), heat: true, heatColor: CP.accentRed }]}
                rows={d.byCreator} total={{ name: "", amount: d.total }} initialSort={{ key: "amount", dir: "desc" }} />
            </div>
          </LkGrid>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── HOC Analytics 3.0 › Creator Overall ───────── */
export function CreatorOverall({ creators, setCreators }) {
  const swr = useLk("lk-overall", null, creators);
  const d = swr.data;
  const w = d?.windows;
  const spark = (k, n) => (d?.daily || []).slice(-n).map((p) => p[k]);
  const row = (label, k, f, sk = k) => [7, 14, 28].map((n) => <LkScore key={`${k}${n}`} label={`Last ${n}d ${label}`} value={f(w[n][k].value)} delta={w[n][k].delta} spark={spark(sk, n)} />);
  return (
    <LkPage title="CREATOR OVERALL"
      filters={<LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={260} />}>
      <State swr={swr}>
        {d && d.view === "lk-overall" && w && (
          <>
            <LkGrid cols="minmax(0, 1fr) minmax(0, 1fr)">
              <div style={{ display: "grid", gap: 12, alignContent: "end" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  {[7, 14, 28].map((n) => <LkScore key={`v${n}`} label={`Last ${n}d Links Visits`} value="n/d" />)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{row("Reach", "reach", fmt.int)}</div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{row("Subs", "subs", fmt.int)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{row("Spend. User", "users", fmt.int)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{row("Revenue", "rev", fmt.num)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>{row("Rev. x User", "rpu", fmt.num)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  {[7, 14, 28].map((n) => <LkScore key={`h${n}`} label={`HOC AVG ${n}d Rev. x User`} value={fmt.num(w[n].hoc_rpu.value)} delta={w[n].hoc_rpu.delta} />)}
                </div>
              </div>
            </LkGrid>
            {note(`Ultimi 7/14/28 giorni fino a ieri (${fmt.dayFull(d.as_of)} escluso), contro i giorni prima; non dipende dal periodo. "HOC AVG" è la media di tutte le creator. Le "Links Visits" non sono disponibili: in Looker vengono da un foglio Google che il nostro accesso non può leggere.`)}
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── nuovi abbonati: Dashboard, New Subs Revenue, New Subs CR (una sola vista "lk-newsubs") ───────── */
const SUBTYPE_LABEL = { returning_subscriber: "Returning", new_subscriber: "New", new_subscriber_trial: "Trial" };
const PAID_NOTE = "Le revenue generate dalle paid subscription sono escluse da questi conteggi.";

export function NewSubsDashboard({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-newsubs", range, creators);
  const d = swr.data;
  const t = d?.total;
  return (
    <LkPage title="Dashboard"
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-newsubs" && t && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <LkScore big label="Unique Subs" value={fmt.int(t.subs)} />
              <LkScore big label="CR 30gg" value={fmt.pct(t.cr30)} />
              <LkScore big label="LTV 30D" value={fmt.money(t.ltv30)} />
              <LkScore big label="ARPPU 30gg" value={fmt.money(t.arppu30)} />
              <LkScore big label="revenue" value={fmt.money(t.revenue)} />
            </div>
            <LkGrid cols="minmax(0, 1fr) minmax(max-content, 1.4fr)">
              <LkLine x={d.daily.map((p) => p.day)} xFmt={fmt.dayFull} height={220}
                series={[{ label: "Unique Subs", kind: "bar", values: d.daily.map((p) => p.subs), color: CP.accent }, { label: "LTV FirstDay", values: d.daily.map((p) => p.ltv_d0), color: seriesColor(9), axis: "right" }]}
                yFmtRight={(v) => fmt.num(v, 0)} />
              <LkTable maxHeight={240}
                columns={[
                  { key: "label", label: "Sub type", render: (r) => SUBTYPE_LABEL[r.type] || r.label },
                  { key: "subs", label: "Unique Subs", align: "right", render: (r) => fmt.int(r.subs) },
                  { key: "ltv_d0", label: "LTV FirstDay", align: "right", render: (r) => fmt.money(r.ltv_d0) },
                  { key: "cr_d0", label: "CR FirstDay", align: "right", render: (r) => fmt.pct(r.cr_d0) },
                  { key: "ltv30", label: "LTV 30D", align: "right", render: (r) => fmt.money(r.ltv30) },
                  { key: "cr30", label: "CR 30gg", align: "right", render: (r) => fmt.pct(r.cr30) },
                  { key: "arppu30", label: "ARPPU 30gg", align: "right", render: (r) => fmt.money(r.arppu30) },
                ]}
                rows={d.byType} total={{ label: "", ...t }} initialSort={{ key: "subs", dir: "desc" }} />
            </LkGrid>
            <LkTable maxHeight={300}
              columns={[
                { key: "name", label: "creator_name", width: 220 },
                { key: "subs", label: "Unique Subs", align: "right", render: (r) => fmt.int(r.subs) },
                { key: "ltv30", label: "LTV 30D", align: "right", render: (r) => fmt.money(r.ltv30) },
                { key: "cr30", label: "CR 30gg", align: "right", render: (r) => fmt.pct(r.cr30) },
                { key: "arppu30", label: "ARPPU 30gg", align: "right", render: (r) => fmt.money(r.arppu30) },
              ]}
              rows={d.byCreator} total={{ name: "", subs: t.subs, ltv30: t.ltv30, cr30: t.cr30, arppu30: t.arppu30 }} initialSort={{ key: "arppu30", dir: "desc" }} />
          </>
        )}
      </State>
    </LkPage>
  );
}

export function NewSubsRevenue({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const [f, setF] = useState({ sub_type: [], link: "", username: "", placement: "" });
  const swr = useLk("lk-newsubs", range, creators);
  const d = swr.data;
  const list = useMemo(() => (d?.list || []).filter((r) =>
    (!f.sub_type.length || f.sub_type.includes(r.sub_type))
    && (!f.link || String(r.link_name || "").toLowerCase().includes(f.link.toLowerCase()))
    && (!f.username || String(r.username || "").toLowerCase().startsWith(f.username.toLowerCase()))
    && (!f.placement || String(r.placement || "").toLowerCase().includes(f.placement.toLowerCase()))), [d, f]);
  const p = d?.people;
  const abs = (m) => (m ? m.value - m.prev : null);
  const arppu = (rev, conv) => (rev?.value && conv?.value ? rev.value / conv.value : null);
  const arppuD = (rev, conv) => (rev?.prev && conv?.prev && arppu(rev, conv) != null ? arppu(rev, conv) / (rev.prev / conv.prev) - 1 : null);
  const Score = ({ label, value, delta, abs: isAbs }) => <LkScore label={label} value={value} delta={delta} deltaFmt={isAbs ? "abs" : "pct"} />;
  return (
    <LkPage title="New Subs Revenue" description={PAID_NOTE}
      filters={<>
        <LkSelect label="creator_name" options={(d?.creators || []).map((c) => ({ value: c.id, label: c.name }))} value={creators} onChange={setCreators} width={200} />
        <LkSelect label="sub_type" options={Object.keys(SUBTYPE_LABEL).map((t) => ({ value: t, label: t }))} value={f.sub_type} onChange={(v) => setF({ ...f, sub_type: v })} width={170} search={false} />
        <LkInput label="link_name" value={f.link} onChange={(v) => setF({ ...f, link: v })} width={150} />
        <LkInput label="username" value={f.username} onChange={(v) => setF({ ...f, username: v })} width={150} />
        <LkInput label="placement_username" value={f.placement} onChange={(v) => setF({ ...f, placement: v })} width={160} />
        <PeriodPicker value={range || d?.range || null} onChange={setRange} max={yesterday()} loading={swr.isLoading && Boolean(d)} />
      </>}>
      <State swr={swr}>
        {d && d.view === "lk-newsubs" && p && (
          <LkGrid cols="minmax(0, 1.6fr) minmax(340px, 1fr)">
            <div style={{ display: "grid", gap: 8 }}>
              <LkTable numbered maxHeight={520}
                columns={[
                  { key: "name", label: "creator_name", width: 150 },
                  { key: "day", label: "calendar_date", render: (r) => fmt.dayFull(r.day) },
                  { key: "username", label: "username" },
                  { key: "sub_type", label: "sub_type" },
                  { key: "link_name", label: "link_name", width: 150 },
                  { key: "placement", label: "placement_username" },
                  { key: "revenue", label: "revenue", align: "right", render: (r) => fmt.num(r.revenue) },
                  { key: "spend_d0", label: "spend_d0", align: "right", render: (r) => fmt.num(r.spend_d0) },
                ]}
                rows={list} total={{ name: "", revenue: list.reduce((s, r) => s + r.revenue, 0), spend_d0: list.reduce((s, r) => s + r.spend_d0, 0) }} initialSort={{ key: "revenue", dir: "desc" }} />
              {note("La lista mostra i 500 nuovi abbonati che hanno speso di più nel periodo; i riquadri a destra contano tutti.")}
            </div>
            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <LkLine x={d.daily.map((q) => q.day)} xFmt={fmt.day} height={200}
                series={[{ label: "revenue", values: d.daily.map((q) => q.revenue), color: seriesColor(3) }, { label: "subs", values: d.daily.map((q) => q.subs), color: seriesColor(9), axis: "right" }, { label: "spend_d0", values: d.daily.map((q) => q.spend_d0), color: seriesColor(5) }]} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <Score label="New Subs Gained" value={fmt.int(p.gained_new.value)} delta={abs(p.gained_new)} abs />
                <Score label="Returning Subs" value={fmt.int(p.gained_ret.value)} delta={abs(p.gained_ret)} abs />
                <Score label="Total Gained" value={fmt.int(p.gained.value)} delta={abs(p.gained)} abs />
                <Score label="New Subs Converted" value={fmt.int(p.conv_new.value)} delta={p.conv_new.delta} />
                <Score label="Returning Converted" value={fmt.int(p.conv_ret.value)} delta={p.conv_ret.delta} />
                <Score label="Total Converted" value={fmt.int(p.conv.value)} delta={p.conv.delta} />
                <Score label="New Subs Revenue" value={fmt.money(p.revenue_new.value)} delta={p.revenue_new.delta} />
                <Score label="Returning Revenue" value={fmt.money(p.revenue_ret.value)} delta={p.revenue_ret.delta} />
                <Score label="Total Revenue" value={fmt.money(p.revenue.value)} delta={p.revenue.delta} />
                <Score label="ARPPU New Sub" value={fmt.money(arppu(p.revenue_new, p.conv_new))} delta={arppuD(p.revenue_new, p.conv_new)} />
                <Score label="ARPPU Returning" value={fmt.money(arppu(p.revenue_ret, p.conv_ret))} delta={arppuD(p.revenue_ret, p.conv_ret)} />
                <Score label="ARPPU Total" value={fmt.money(arppu(p.revenue, p.conv))} delta={arppuD(p.revenue, p.conv)} />
              </div>
            </div>
          </LkGrid>
        )}
      </State>
    </LkPage>
  );
}

export function NewSubsCr({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("lk-newsubs", range, creators);
  const d = swr.data;
  const byAlter = useMemo(() => Object.values((d?.byLink || []).reduce((acc, r) => {
    const k = r.alterego ?? "null";
    const a = (acc[k] ||= { alterego: k, subs: 0, conv: 0 });
    a.subs += r.subs; a.conv += r.conv;
    return acc;
  }, {})).map((a) => ({ ...a, cr: a.subs ? a.conv / a.subs : null })).sort((a, b) => b.subs - a.subs), [d]);
  const t = d?.total;
  return (
    <LkPage title="New Subs CR" description={PAID_NOTE}
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "lk-newsubs" && t && (
          <>
            <LkTable maxHeight={320}
              columns={[
                { key: "name", label: "creator_name", width: 150 },
                { key: "link_name", label: "link_name", width: 150 },
                { key: "placement", label: "placement_username" },
                { key: "alterego", label: "alterego" },
                { key: "revenue", label: "revenue", align: "right", render: (r) => fmt.num(r.revenue) },
                { key: "subs", label: "Subs Gained", align: "right", render: (r) => fmt.int(r.subs) },
                { key: "conv", label: "Subs Converted", align: "right", render: (r) => fmt.int(r.conv) },
                { key: "cr", label: "CR Converted", align: "right", render: (r) => fmt.pct(r.cr) },
                { key: "arppu", label: "ARPPU", align: "right", render: (r) => fmt.num(r.arppu) },
              ]}
              rows={d.byLink} total={{ name: "", link_name: "", placement: "", alterego: "", revenue: t.revenue, subs: t.subs, conv: t.conv, cr: t.cr30, arppu: t.arppu30 }} initialSort={{ key: "revenue", dir: "desc" }} />
            <LkGrid cols="minmax(0, 1.35fr) minmax(0, 1fr)">
              <LkTable maxHeight={250}
                columns={[
                  { key: "name", label: "creator_name", width: 130 },
                  { key: "arppu", label: "ARPPU", align: "right", render: (r) => fmt.num(r.arppu) },
                  { key: "subs", label: "Subs Gained", align: "right", render: (r) => fmt.int(r.subs) },
                  { key: "conv", label: "Subs Converted", align: "right", render: (r) => fmt.int(r.conv), heat: true, heatColor: CP.gold },
                  { key: "conv_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.conv_delta} /> },
                  { key: "cr", label: "CR Converted", align: "right", render: (r) => fmt.pct(r.cr) },
                  { key: "cr_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.cr_delta} /> },
                ]}
                rows={d.creatorCr} total={{ name: "", arppu: t.arppu30, subs: t.subs, conv: t.conv, cr: t.cr30 }} initialSort={{ key: "cr", dir: "desc" }} />
              <LkTable maxHeight={250}
                columns={[
                  { key: "alterego", label: "alterego" },
                  { key: "subs", label: "Subs Gained", align: "right", render: (r) => fmt.int(r.subs) },
                  { key: "conv", label: "Subs Converted", align: "right", render: (r) => fmt.int(r.conv) },
                  { key: "cr", label: "CR Converted", align: "right", render: (r) => fmt.pct(r.cr) },
                ]}
                rows={byAlter} total={{ alterego: "", subs: t.subs, conv: t.conv, cr: t.cr30 }} initialSort={{ key: "subs", dir: "desc" }} />
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}

/* ───────── KPI Sales › Conversion Analytics ───────── */
export function ConversionAnalytics({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("conversioni", range, creators);
  const d = swr.data;
  return (
    <LkPage title="Conversion Analytics"
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "conversioni" && (
          <LkTable maxHeight={620}
            columns={[
              { key: "name", label: "creator_name", width: 200 },
              { key: "new_subs", label: "New Subs", align: "right", render: (r) => fmt.int(r.new_subs) },
              { key: "converted", label: "New Subs Converted", align: "right", render: (r) => fmt.int(r.converted) },
              { key: "cr", label: "CR New Sub Converted", align: "right", render: (r) => fmt.pct(r.cr) },
              { key: "cr_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.cr_delta} /> },
              { key: "users", label: "Converted Users", align: "right", render: (r) => fmt.int(r.users) },
              { key: "transactions", label: "Num. Transaction", align: "right", render: (r) => fmt.int(r.transactions) },
              { key: "revenue", label: "Total Revenue", align: "right", render: (r) => fmt.num(r.revenue), heat: true, heatColor: CP.accentGreen },
              { key: "revenue_delta", label: "% Δ", align: "right", render: (r) => <LkDelta v={r.revenue_delta} /> },
            ]}
            rows={d.rows} total={{ name: "", ...d.total }} initialSort={{ key: "name", dir: "asc" }} />
        )}
      </State>
    </LkPage>
  );
}

/* ───────── KPI Sales › Sales Ratio ───────── */
export function SalesRatio({ creators, setCreators }) {
  const [range, setRange] = useState(null);
  const swr = useLk("rapporto", range, creators);
  const d = swr.data;
  const rows = d?.rows || [];
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const byCreator = [...new Set(rows.map((r) => r.name))];
  return (
    <LkPage title="Sales Ratio" description="RR = AVG ÷ MED: più è alto, più il fatturato dipende da poche vendite grandi."
      filters={<Filters data={d} creators={creators} setCreators={setCreators} range={range} setRange={setRange} isLoading={swr.isLoading} />}>
      <State swr={swr}>
        {d && d.view === "rapporto" && (
          <>
            <LkTable maxHeight={360}
              columns={[
                { key: "name", label: "creator_name", width: 200 },
                { key: "month", label: "Mese", render: (r) => fmt.month(r.month) },
                { key: "transactions", label: "Num. Trans.", align: "right", render: (r) => fmt.int(r.transactions) },
                { key: "revenue", label: "Tot. Revenue", align: "right", render: (r) => fmt.num(r.revenue) },
                { key: "avg", label: "AVG Trans.", align: "right", render: (r) => fmt.num(r.avg) },
                { key: "median", label: "MED Trans.", align: "right", render: (r) => fmt.num(r.median) },
                { key: "rr", label: "RR", align: "right", render: (r) => fmt.num(r.rr), cellBg: (r) => rrColor(r.rr) },
              ]}
              rows={rows} initialSort={{ key: "name", dir: "asc" }} />
            <LkGrid cols="1fr 1fr 1fr">
              <LkLine title="RR per creator" x={months} xFmt={fmt.month} height={220} refLine={{ value: 1.2 }}
                series={byCreator.slice(0, 8).map((n, i) => ({ label: n, values: months.map((m) => rows.find((r) => r.name === n && r.month === m)?.rr ?? null), color: seriesColor(i) }))} yFmt={(v) => fmt.num(v, 1)} />
              <LkLine title="avg_transaction / median_transaction" x={months} xFmt={fmt.month} height={220}
                series={[
                  { label: "avg_transaction", values: months.map((m) => { const r = rows.filter((x) => x.month === m); const tx = r.reduce((s, x) => s + x.transactions, 0); return tx ? r.reduce((s, x) => s + x.revenue, 0) / tx : null; }), color: CP.accent },
                  { label: "median_transaction", values: months.map((m) => { const r = rows.filter((x) => x.month === m).map((x) => x.median).sort((a, b) => a - b); return r.length ? r[Math.floor(r.length / 2)] : null; }), color: seriesColor(7), axis: "right" },
                ]} yFmt={(v) => fmt.num(v, 0)} />
              <LkBars title="RR (ultimo mese)" items={sortedBy(rows.filter((r) => r.month === months[months.length - 1]), "rr").map((r) => ({ label: r.name, values: [r.rr] }))} series={[{ label: "RR" }]} yFmt={(v) => fmt.num(v, 1)} height={220} legend={false} />
            </LkGrid>
          </>
        )}
      </State>
    </LkPage>
  );
}
