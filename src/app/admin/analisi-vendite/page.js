"use client";
/**
 * Analisi vendite (fase 1, 9/10/2026): i report Looker "HOC Analytics 3.0" e "KPI Sales"
 * portati in HOC Pro per i sales manager, con le stesse formule (verificate al centesimo,
 * vedi lib/analisi-vendite-sql.js). Ognuno vede solo le creator che gli sono assegnate.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Download, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, FilterChip, DataTable, Notice, SectionTitle, card } from "@/components/ds";

const VIEWS = [
  { id: "recap", label: "Riepilogo", hint: "Revenue e nuovi abbonati per creator, contro il periodo precedente di pari durata." },
  { id: "conversioni", label: "Conversioni", hint: "Nuovi abbonati, quanti hanno speso (convertiti), transazioni e revenue. Di default ultimi 28 giorni, come in Looker KPI Sales." },
  { id: "rapporto", label: "Rapporto vendite", hint: "Per mese: transazione media e mediana. RR = media ÷ mediana: più è alto, più il fatturato dipende da poche vendite grandi." },
  { id: "meta-mese", label: "Metà mese", hint: "Revenue, transazioni, spender e nuovi abbonati nella prima (1-15) e nella seconda metà del mese." },
  { id: "transazioni", label: "Transazioni", hint: "Le ultime 500 transazioni del periodo, con il link da cui è arrivato il fan, e i chargeback." },
  { id: "nuovi-abbonati", label: "Nuovi abbonati", hint: "Chi si è abbonato nel periodo e quanto ha speso nei primi 30 giorni: LTV, conversione e ARPPU per tipo, per creator e per link." },
  { id: "tracking", label: "Tracking link", hint: "Click, abbonati e revenue di ogni tracking link. Il traffico organico (senza link) non compare qui." },
  { id: "copertura", label: "Copertura", hint: "Quante persone ha raggiunto il profilo di ogni creator nel periodo, contro il periodo precedente." },
  { id: "notifiche", label: "Notifiche", hint: "Ogni nuovo abbonato, abbonato di ritorno e trial, in tempo reale: per creator, per giorno e per ora del giorno." },
  { id: "welcome", label: "Welcome unlock", hint: "Quanti nuovi abbonati hanno sbloccato il messaggio di benvenuto a pagamento, per creator e prezzo." },
  { id: "ricerca-fan", label: "Ricerca fan", hint: "Cerca un fan per username (o id): su quali tue creator è abbonato, da quale link, da quando e quanto ha speso." },
];
const TYPE_LABEL = { new_subscriber: "Nuovi", returning_subscriber: "Di ritorno", new_subscriber_trial: "Trial" };

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const yesterday = () => iso(Date.now() - DAY);
const PRESETS = [
  { id: "7", label: "Ultimi 7 giorni", range: () => ({ from: iso(Date.now() - 7 * DAY), to: yesterday() }) },
  { id: "14", label: "Ultimi 14 giorni", range: () => ({ from: iso(Date.now() - 14 * DAY), to: yesterday() }) },
  { id: "28", label: "Ultimi 28 giorni", range: () => ({ from: iso(Date.now() - 28 * DAY), to: yesterday() }) },
  { id: "mese", label: "Questo mese", range: () => ({ from: `${yesterday().slice(0, 7)}-01`, to: yesterday() }) },
  { id: "mese-prima", label: "Mese scorso", range: () => { const d = new Date(); const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); return { from: iso(first), to: iso(last) }; } },
];

// useGrouping "always": in it-IT il browser non separa le migliaia sotto 10.000 ("8160") — qui sì ("8.160")
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })}`);
const int = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("it-IT", { useGrouping: "always" }));
const pct = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${(Number(v) * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
// orari in UTC come in Looker: i giorni dei filtri sono giorni UTC, così una riga delle 23:59 resta nel suo giorno
const dt = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "—");
const dtLocal = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const dshort = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
const monthLabel = (m) => (m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }) : "—");

function Delta({ v }) {
  if (v == null || !Number.isFinite(v)) return <span style={{ color: CP.textMuted }}>—</span>;
  const up = v > 0;
  return <span style={{ color: up ? CP.accentGreen : v < 0 ? CP.accentRed : CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{up ? "+" : v < 0 ? "−" : ""}{Math.abs(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%</span>;
}

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "Errore"); e.info = j; throw e; }
  return j;
};

function toCsv(columns, rows) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => esc(c.label)).join(";"), ...rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(";"))].join("\n");
}
function downloadCsv(name, columns, rows) {
  const blob = new Blob(["﻿" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function CsvButton({ name, columns, rows }) {
  return (
    <button onClick={() => downloadCsv(name, columns, rows)} disabled={!rows?.length}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, fontSize: 12, cursor: rows?.length ? "pointer" : "default", fontFamily: FONTS.body }}>
      <Download size={13} /> Scarica CSV
    </button>
  );
}

/** Andamento giornaliero (SVG, senza librerie): revenue in barre, nuovi abbonati in linea. */
function DailyChart({ daily }) {
  if (!daily?.length) return null;
  const W = 760, H = 180, P = 28;
  const maxNet = Math.max(1, ...daily.map((d) => d.net));
  const maxSubs = Math.max(1, ...daily.map((d) => d.subs));
  const bw = (W - P * 2) / daily.length;
  const y = (v, max) => H - P - (v / max) * (H - P * 2);
  const line = daily.map((d, i) => `${i ? "L" : "M"}${P + bw * i + bw / 2},${y(d.subs, maxSubs)}`).join(" ");
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: CP.accent, borderRadius: 2, marginRight: 6, verticalAlign: "middle" }} />Revenue al giorno</span>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: CP.textSecondary, marginRight: 6, verticalAlign: "middle" }} />Nuovi abbonati al giorno</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Andamento giornaliero di revenue e nuovi abbonati">
        {daily.map((d, i) => (
          <g key={d.day}>
            <rect x={P + bw * i + 2} y={y(d.net, maxNet)} width={Math.max(1, bw - 4)} height={H - P - y(d.net, maxNet)} fill={CP.accent} opacity={0.75}>
              <title>{`${dshort(d.day)}: ${money(d.net)} · ${int(d.subs)} nuovi abbonati`}</title>
            </rect>
            {(daily.length <= 16 || i % Math.ceil(daily.length / 12) === 0) && (
              <text x={P + bw * i + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={CP.textMuted}>{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</text>
            )}
          </g>
        ))}
        <path d={line} fill="none" stroke={CP.textSecondary} strokeWidth="2" />
        <text x={P} y={14} fontSize="10" fill={CP.textMuted}>max {money(maxNet)} · {int(maxSubs)} abbonati</text>
      </svg>
    </div>
  );
}

function RecapView({ d }) {
  const cols = [
    { key: "name", label: "Creator" },
    { key: "net", label: "Revenue", align: "right", render: (r) => money(r.net) },
    { key: "net_delta", label: "% Δ", align: "right", render: (r) => <Delta v={r.net_delta} />, csv: (r) => r.net_delta },
    { key: "subs", label: "Nuovi abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "subs_delta", label: "% Δ ", align: "right", render: (r) => <Delta v={r.subs_delta} />, csv: (r) => r.subs_delta },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Revenue netta" value={money(d.total.net)} delta={d.total.net_delta == null ? null : `${d.total.net_delta > 0 ? "+" : "−"}${Math.abs(d.total.net_delta * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} deltaLabel={`dal ${dshort(d.previous.from)} al ${dshort(d.previous.to)}`} />
        <Metric label="Nuovi abbonati" value={int(d.total.subs)} delta={d.total.subs_delta == null ? null : `${d.total.subs_delta > 0 ? "+" : "−"}${Math.abs(d.total.subs_delta * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} deltaLabel="sul periodo prima" />
      </div>
      <DailyChart daily={d.daily} />
      <TableBlock title="Per creator" name="riepilogo" columns={cols} rows={d.rows} defaultSort={{ key: "net", dir: -1 }}
        footer={`Totale: ${money(d.total.net)} · ${int(d.total.subs)} nuovi abbonati`} />
    </>
  );
}

function ConversioniView({ d }) {
  const cols = [
    { key: "name", label: "Creator" },
    { key: "new_subs", label: "Nuovi abbonati", align: "right", render: (r) => int(r.new_subs) },
    { key: "converted", label: "Convertiti", align: "right", render: (r) => int(r.converted) },
    { key: "cr", label: "CR", align: "right", render: (r) => pct(r.cr) },
    { key: "cr_delta", label: "% Δ CR", align: "right", render: (r) => <Delta v={r.cr_delta} />, csv: (r) => r.cr_delta },
    { key: "users", label: "Utenti che spendono", align: "right", render: (r) => int(r.users) },
    { key: "transactions", label: "Transazioni", align: "right", render: (r) => int(r.transactions) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money(r.revenue) },
    { key: "revenue_delta", label: "% Δ revenue", align: "right", render: (r) => <Delta v={r.revenue_delta} />, csv: (r) => r.revenue_delta },
    { key: "per_transaction", label: "Rev. per transazione", align: "right", render: (r) => money(r.per_transaction) },
  ];
  const t = d.total;
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Nuovi abbonati" value={int(t.new_subs)} />
        <Metric label="Convertiti (hanno speso)" value={int(t.converted)} note={`CR ${pct(t.cr)}`} />
        <Metric label="Transazioni" value={int(t.transactions)} />
        <Metric label="Revenue" value={money(t.revenue)} note={`${money(t.per_transaction)} a transazione`} />
      </div>
      <TableBlock title="Per creator" name="conversioni" columns={cols} rows={d.rows} defaultSort={{ key: "revenue", dir: -1 }} minWidth={1000} />
    </>
  );
}

function RapportoView({ d }) {
  const cols = [
    { key: "name", label: "Creator" },
    { key: "month", label: "Mese", render: (r) => monthLabel(r.month) },
    { key: "transactions", label: "Transazioni", align: "right", render: (r) => int(r.transactions) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money(r.revenue) },
    { key: "avg", label: "Media", align: "right", render: (r) => money(r.avg) },
    { key: "median", label: "Mediana", align: "right", render: (r) => money(r.median) },
    { key: "rr", label: "RR (media ÷ mediana)", align: "right", render: (r) => (r.rr == null ? "—" : r.rr.toLocaleString("it-IT", { minimumFractionDigits: 2 })) },
  ];
  return <TableBlock title="Per creator e mese" name="rapporto-vendite" columns={cols} rows={d.rows} minWidth={820}
    footer="Conta tutte le transazioni con netto positivo, abbonamenti compresi, sull'intero mese (come in Looker: il periodo scelto seleziona i mesi)." />;
}

function MetaMeseView({ d }) {
  const cols = [
    { key: "name", label: "Creator" },
    { key: "month", label: "Mese", render: (r) => monthLabel(r.month) },
    { key: "mid_revenue", label: "1ª metà · revenue", align: "right", render: (r) => money(r.mid_revenue) },
    { key: "mid_transactions", label: "transazioni", align: "right", render: (r) => int(r.mid_transactions) },
    { key: "mid_users", label: "spender", align: "right", render: (r) => int(r.mid_users) },
    { key: "mid_subs", label: "nuovi abbonati", align: "right", render: (r) => int(r.mid_subs) },
    { key: "end_revenue", label: "2ª metà · revenue", align: "right", render: (r) => money(r.end_revenue) },
    { key: "end_transactions", label: "transazioni ", align: "right", render: (r) => int(r.end_transactions) },
    { key: "end_users", label: "spender ", align: "right", render: (r) => int(r.end_users) },
    { key: "end_subs", label: "nuovi abbonati ", align: "right", render: (r) => int(r.end_subs) },
    { key: "total_revenue", label: "Totale mese", align: "right", render: (r) => money(r.total_revenue) },
    { key: "total_subs", label: "Abbonati mese", align: "right", render: (r) => int(r.total_subs) },
  ];
  return <TableBlock title="Prima metà (1-15) e seconda metà del mese" name="meta-mese" columns={cols} rows={d.rows} minWidth={1200}
    footer="La tabella si aggiorna una volta al giorno (verso le 7 italiane)." />;
}

function TransazioniView({ d }) {
  const tx = [
    { key: "created_at", label: "Quando (UTC)", render: (r) => dt(r.created_at) },
    { key: "name", label: "Creator" },
    { key: "user_id", label: "Fan (id)", render: (r) => r.user_id },
    { key: "subscribed_on", label: "Abbonato dal", render: (r) => dshort(r.subscribed_on) },
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—", muted: true },
    { key: "spending_id", label: "Campagna", render: (r) => r.spending_id || "—", muted: true },
    { key: "type", label: "Tipo" },
    { key: "net", label: "Netto", align: "right", render: (r) => money(r.net) },
    { key: "amount", label: "Lordo", align: "right", render: (r) => money(r.amount) },
  ];
  const cb = [
    { key: "chargeback_at", label: "Transazione del (UTC)", render: (r) => dt(r.chargeback_at) },
    { key: "name", label: "Creator" },
    { key: "username", label: "Fan", render: (r) => r.username || r.user_id },
    { key: "payment_type", label: "Tipo" },
    { key: "amount", label: "Importo", align: "right", render: (r) => money(r.amount) },
  ];
  return (
    <>
      <TableBlock title="Transazioni" name="transazioni" columns={tx} rows={d.rows} minWidth={1100} maxHeight={520}
        footer={d.truncated ? "Mostrate le 500 più recenti: restringi il periodo o le creator per vedere le altre." : null} />
      <TableBlock title="Chargeback" name="chargeback" columns={cb} rows={d.chargebacks} minWidth={700} maxHeight={420} />
    </>
  );
}

function NuoviAbbonatiView({ d }) {
  const p = d.people;
  const abs = (v) => (v == null ? null : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("it-IT", { useGrouping: "always" })}`);
  const pctTxt = (v) => (v == null ? null : `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);
  const metricCols = (first) => [
    first,
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "ltv_d0", label: "LTV 1° giorno", align: "right", render: (r) => money(r.ltv_d0) },
    { key: "cr_d0", label: "CR 1° giorno", align: "right", render: (r) => pct(r.cr_d0) },
    { key: "ltv30", label: "LTV 30 gg", align: "right", render: (r) => money(r.ltv30) },
    { key: "cr30", label: "CR 30 gg", align: "right", render: (r) => pct(r.cr30) },
    { key: "arppu30", label: "ARPPU 30 gg", align: "right", render: (r) => money(r.arppu30) },
    { key: "revenue", label: "Revenue 30 gg", align: "right", render: (r) => money(r.revenue) },
  ];
  const linkCols = [
    { key: "name", label: "Creator" },
    { key: "link_name", label: "Link", render: (r) => r.link_name || "senza link (organico)", muted: true },
    { key: "placement", label: "Placement", render: (r) => r.placement || "—", muted: true },
    { key: "alterego", label: "Alterego", render: (r) => r.alterego || "—", muted: true },
    { key: "revenue", label: "Revenue 30 gg", align: "right", render: (r) => money(r.revenue) },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "conv", label: "Convertiti", align: "right", render: (r) => int(r.conv) },
    { key: "cr", label: "CR", align: "right", render: (r) => pct(r.cr) },
    { key: "arppu", label: "ARPPU", align: "right", render: (r) => money(r.arppu) },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Persone abbonate" value={int(p.gained.value)} delta={abs(p.gained.value - p.gained.prev)} deltaLabel="sul periodo prima" note={`${int(p.gained_new.value)} nuove · ${int(p.gained_ret.value)} di ritorno`} />
        <Metric label="Revenue nei primi 30 giorni" value={money(p.revenue.value)} delta={pctTxt(p.revenue.delta)} deltaLabel="sul periodo prima" note={`${money(p.revenue_new.value)} nuove · ${money(p.revenue_ret.value)} di ritorno`} />
        <Metric label="Persone che hanno speso" value={int(p.conv.value)} delta={pctTxt(p.conv.delta)} deltaLabel="sul periodo prima" note={`${int(p.conv_new.value)} nuove · ${int(p.conv_ret.value)} di ritorno`} />
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: -12 }}>
        Qui una persona abbonata a due creator conta una volta; nelle tabelle sotto conta per ogni creator (come in Looker).
        La revenue è quella spesa da chi si è abbonato nel periodo, nei suoi primi 30 giorni: per gli ultimi giorni cresce ancora.
      </div>
      <TableBlock title="Per tipo di abbonamento" name="nuovi-abbonati-tipo" columns={metricCols({ key: "label", label: "Tipo" })} rows={[...d.byType, ...(d.total ? [{ type: "zz", label: "Totale", ...d.total }] : [])]} minWidth={900} />
      <TableBlock title="Per creator" name="nuovi-abbonati-creator" columns={metricCols({ key: "name", label: "Creator" })} rows={d.byCreator} defaultSort={{ key: "revenue", dir: -1 }} minWidth={900} />
      <TableBlock title="Per link" name="nuovi-abbonati-link" columns={linkCols} rows={d.byLink} defaultSort={{ key: "revenue", dir: -1 }} minWidth={1100} maxHeight={520} />
    </>
  );
}

function TrackingView({ d }) {
  const creatorCols = [
    { key: "name", label: "Creator" },
    { key: "links", label: "Link attivi", align: "right", render: (r) => int(r.links) },
    { key: "clicks", label: "Click", align: "right", render: (r) => int(r.clicks) },
    { key: "clicks_delta", label: "% Δ", align: "right", render: (r) => <Delta v={r.clicks_delta} />, csv: (r) => r.clicks_delta },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "subs_delta", label: "% Δ ", align: "right", render: (r) => <Delta v={r.subs_delta} />, csv: (r) => r.subs_delta },
    { key: "cr", label: "CR abbonati/click", align: "right", render: (r) => pct(r.cr) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money(r.revenue) },
    { key: "new_sub_revenue", label: "di cui nuovi", align: "right", render: (r) => money(r.new_sub_revenue) },
  ];
  const linkCols = [
    { key: "name", label: "Creator" },
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—" },
    { key: "placement", label: "Placement", render: (r) => r.placement || "—", muted: true },
    { key: "spending_id", label: "Campagna", render: (r) => r.spending_id || "—", muted: true },
    { key: "clicks", label: "Click", align: "right", render: (r) => int(r.clicks) },
    { key: "clicks_delta", label: "% Δ", align: "right", render: (r) => <Delta v={r.clicks_delta} />, csv: (r) => r.clicks_delta },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "subs_delta", label: "% Δ ", align: "right", render: (r) => <Delta v={r.subs_delta} />, csv: (r) => r.subs_delta },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money(r.revenue) },
    { key: "revenue_delta", label: "% Δ  ", align: "right", render: (r) => <Delta v={r.revenue_delta} />, csv: (r) => r.revenue_delta },
    { key: "cr", label: "CR", align: "right", render: (r) => pct(r.cr) },
    { key: "new_sub_revenue", label: "Revenue nuovi", align: "right", render: (r) => money(r.new_sub_revenue) },
    { key: "link_url", label: "Indirizzo", render: (r) => r.link_url || "—", muted: true },
  ];
  const t = d.total;
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Click" value={int(t.clicks)} delta={t.clicks_delta == null ? null : `${t.clicks_delta > 0 ? "+" : "−"}${Math.abs(t.clicks_delta * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} deltaLabel="sul periodo prima" />
        <Metric label="Abbonati dai link" value={int(t.subs)} delta={t.subs_delta == null ? null : `${t.subs_delta > 0 ? "+" : "−"}${Math.abs(t.subs_delta * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} deltaLabel="sul periodo prima" note={`CR ${pct(t.cr)}`} />
        <Metric label="Revenue dai fan dei link" value={money(t.revenue)} note={`${money(t.new_sub_revenue)} dai nuovi`} />
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: -12 }}>
        La revenue di un link è quanto hanno speso nel periodo tutti i fan entrati da quel link, anche se si erano abbonati prima.
      </div>
      <TableBlock title="Per creator" name="tracking-creator" columns={creatorCols} rows={d.byCreator} defaultSort={{ key: "clicks", dir: -1 }} minWidth={950} />
      <TableBlock title="Per link" name="tracking-link" columns={linkCols} rows={d.links} defaultSort={{ key: "clicks", dir: -1 }} minWidth={1400} maxHeight={560}
        footer="Solo i link con click, abbonati o revenue nel periodo o in quello precedente." />
    </>
  );
}

function ReachChart({ daily }) {
  if (!daily?.length) return null;
  const W = 760, H = 160, P = 28;
  const max = Math.max(1, ...daily.map((d) => d.reach));
  const bw = (W - P * 2) / daily.length;
  return (
    <div style={{ ...card, padding: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Copertura giorno per giorno">
        {daily.map((d, i) => {
          const h = (d.reach / max) * (H - P * 2);
          return (
            <g key={d.day}>
              <rect x={P + bw * i + 2} y={H - P - h} width={Math.max(1, bw - 4)} height={h} fill={CP.accent} opacity={0.75}><title>{`${dshort(d.day)}: ${int(d.reach)}`}</title></rect>
              {(daily.length <= 16 || i % Math.ceil(daily.length / 12) === 0) && <text x={P + bw * i + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={CP.textMuted}>{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</text>}
            </g>
          );
        })}
        <text x={P} y={14} fontSize="10" fill={CP.textMuted}>max {int(max)} al giorno</text>
      </svg>
    </div>
  );
}

function CoperturaView({ d }) {
  const cols = [
    { key: "name", label: "Creator" },
    { key: "reach", label: "Copertura", align: "right", render: (r) => int(r.reach) },
    { key: "delta", label: "% Δ", align: "right", render: (r) => <Delta v={r.delta} />, csv: (r) => r.delta },
    { key: "reach_prev", label: "Periodo prima", align: "right", render: (r) => int(r.reach_prev), muted: true },
  ];
  return (
    <>
      <Metric label="Copertura totale" value={int(d.total.reach)} delta={d.total.delta == null ? null : `${d.total.delta > 0 ? "+" : "−"}${Math.abs(d.total.delta * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} deltaLabel={`dal ${dshort(d.previous.from)} al ${dshort(d.previous.to)}`} />
      <ReachChart daily={d.daily} />
      <TableBlock title="Per creator" name="copertura" columns={cols} rows={d.rows} defaultSort={{ key: "reach", dir: -1 }} minWidth={600}
        footer="Somma dei valori giornalieri di copertura del profilo (come Looker Creators Reach)." />
    </>
  );
}

function BarsChart({ points, valueKey, label, fmt, max: maxIn }) {
  if (!points?.length) return null;
  const W = 760, H = 150, P = 26;
  const max = Math.max(1, maxIn || 0, ...points.map((p) => p[valueKey]));
  const bw = (W - P * 2) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={label}>
      {points.map((p, i) => {
        const h = (p[valueKey] / max) * (H - P * 2);
        return (
          <g key={p.key}>
            <rect x={P + bw * i + 2} y={H - P - h} width={Math.max(1, bw - 4)} height={h} fill={CP.accent} opacity={0.75}><title>{`${p.label}: ${fmt(p[valueKey])}`}</title></rect>
            {(points.length <= 24 || i % Math.ceil(points.length / 12) === 0) && <text x={P + bw * i + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={CP.textMuted}>{p.short}</text>}
          </g>
        );
      })}
      <text x={P} y={14} fontSize="10" fill={CP.textMuted}>{label} · max {fmt(max)}</text>
    </svg>
  );
}

function NotificheView({ d }) {
  const t = d.totals;
  const creatorCols = [
    { key: "name", label: "Creator" },
    { key: "new_subscriber", label: "Nuovi", align: "right", render: (r) => int(r.new_subscriber) },
    { key: "returning_subscriber", label: "Di ritorno", align: "right", render: (r) => int(r.returning_subscriber) },
    { key: "new_subscriber_trial", label: "Trial", align: "right", render: (r) => int(r.new_subscriber_trial) },
    { key: "total", label: "Totale", align: "right", render: (r) => int(r.total) },
  ];
  const listCols = [
    { key: "created_at", label: "Quando (UTC)", render: (r) => dt(r.created_at) },
    { key: "name", label: "Creator" },
    { key: "username", label: "Fan" },
    { key: "sub_type", label: "Tipo", render: (r) => TYPE_LABEL[r.sub_type] || r.sub_type, csv: (r) => TYPE_LABEL[r.sub_type] || r.sub_type },
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—", muted: true },
    { key: "spending_id", label: "Campagna", render: (r) => r.spending_id || "—", muted: true },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Nuovi abbonati" value={int(t.new_subscriber)} />
        <Metric label="Di ritorno" value={int(t.returning_subscriber)} />
        <Metric label="Trial" value={int(t.new_subscriber_trial)} />
        <Metric label="Totale" value={int(t.total)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={{ ...card, padding: 16 }}>
          <BarsChart label="Abbonamenti al giorno" valueKey="total" fmt={int}
            points={d.daily.map((x) => ({ key: x.day, label: dshort(x.day), short: `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}`, total: x.total }))} />
        </div>
        <div style={{ ...card, padding: 16 }}>
          <BarsChart label="Per ora del giorno (UTC)" valueKey="n" fmt={int}
            points={d.hourly.map((x) => ({ key: x.hour, label: `ore ${x.hour}`, short: String(x.hour).padStart(2, "0"), n: x.n }))} />
        </div>
      </div>
      <TableBlock title="Per creator" name="notifiche-creator" columns={creatorCols} rows={d.byCreator} defaultSort={{ key: "total", dir: -1 }} minWidth={640}
        footer="I trial qui sono tutti. Looker (Free Trials) ne perde circa il 4%: conta solo l'ultima notifica del giorno di ogni fan, quindi un trial seguito da un acquisto nello stesso giorno sparisce." />
      <TableBlock title="Ultime 500" name="notifiche" columns={listCols} rows={d.list} minWidth={900} maxHeight={520}
        footer="Il link di provenienza compare dal giorno dopo (la tabella dei link si aggiorna una volta al giorno)." />
    </>
  );
}

function WelcomeView({ d }) {
  const priced = d.rows.filter((r) => r.amount > 0);
  const missing = d.rows.filter((r) => !(r.amount > 0));
  const cols = [
    { key: "name", label: "Creator" },
    { key: "amount", label: "Prezzo welcome", align: "right", render: (r) => money(r.amount) },
    { key: "subs", label: "Nuovi abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "unlocks", label: "Sblocchi", align: "right", render: (r) => int(r.unlocks) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money(r.revenue) },
    { key: "cr", label: "CR sblocchi/abbonati", align: "right", render: (r) => pct(r.cr) },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Sblocchi del welcome" value={int(d.total.unlocks)} />
        <Metric label="Revenue dal welcome" value={money(d.total.revenue)} />
      </div>
      <TableBlock title="Per creator e prezzo" name="welcome-unlock" columns={cols} rows={priced} defaultSort={{ key: "revenue", dir: -1 }} minWidth={760}
        footer="Revenue = prezzo × sblocchi. Una creator compare più volte se il prezzo del welcome è cambiato." />
      {missing.length > 0 && (
        <Notice>
          Senza prezzo welcome registrato, quindi senza sblocchi misurabili: {missing.map((r) => r.name).join(", ")}.
          Il dato dipende dall'elenco dei prezzi welcome tenuto dall'altra parte, che non comprende queste creator.
        </Notice>
      )}
    </>
  );
}

function RicercaFanView({ d, query, setQuery }) {
  const [text, setText] = useState(query || "");
  const cols = [
    { key: "username", label: "Fan" },
    { key: "name", label: "Creator" },
    { key: "started_at", label: "Abbonato dal", render: (r) => (r.started_at ? dshort(r.started_at.slice(0, 10)) : "—") },
    { key: "ended_at", label: "Attivo fino al", render: (r) => (r.ended_at ? dshort(r.ended_at.slice(0, 10)) : "—"), muted: true },
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—", muted: true },
    { key: "sub_type", label: "Tipo", render: (r) => TYPE_LABEL[r.sub_type] || r.sub_type || "—" },
    { key: "transactions", label: "Transazioni", align: "right", render: (r) => int(r.transactions) },
    { key: "spent", label: "Speso in tutto", align: "right", render: (r) => money(r.spent) },
  ];
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setQuery(text.trim()); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="username (es. u5912…) o id del fan" aria-label="Username o id del fan"
          style={{ ...dateInput, minWidth: 280, padding: "8px 10px", fontSize: 14 }} />
        <button type="submit" style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 14, cursor: "pointer", fontFamily: FONTS.body }}>Cerca</button>
      </form>
      {d?.needsQuery ? (
        <div style={{ fontSize: 13, color: CP.textMuted }}>Scrivi almeno 3 caratteri: l'inizio dello username (senza @) o l'id numerico del fan.</div>
      ) : (
        <TableBlock title={`Risultati per «${d.q}»`} name={`ricerca-${d.q}`} columns={cols} rows={d.rows} defaultSort={{ key: "spent", dir: -1 }} minWidth={1000}
          footer={d.rows.length >= 200 ? "Mostrati i primi 200: scrivi più caratteri per restringere." : "Solo le tue creator. «Speso in tutto» è la spesa netta del fan su quella creator da quando è abbonato."} />
      )}
    </>
  );
}

function TableBlock({ title, name, columns, rows, defaultSort, minWidth = 700, maxHeight, footer }) {
  return (
    <section>
      <SectionTitle aside={<CsvButton name={name} columns={columns} rows={rows} />}>{title}</SectionTitle>
      <DataTable columns={columns} rows={rows || []} defaultSort={defaultSort} minWidth={minWidth} maxHeight={maxHeight} empty="Nessun dato nel periodo." />
      {footer && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>{footer}</div>}
    </section>
  );
}

function DatiCompleti({ initialView, initialPicked, onBack, onState }) {
  const [view, setView] = useState(initialView && VIEWS.some((x) => x.id === initialView) ? initialView : "recap");
  const [preset, setPreset] = useState(null); // null = periodo di default della vista
  const [custom, setCustom] = useState(null);
  const [picked, setPicked] = useState(initialPicked || []); // [] = tutte le creator visibili
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");

  // link diretto a ogni scheda: ?vista=dati&scheda=<id>[&creators=…]
  useEffect(() => { onState?.({ scheda: view, creators: picked }); }, [view, picked]);
  const chooseView = (v) => { setView(v); setPreset(null); setCustom(null); };

  const range = custom || (preset ? PRESETS.find((p) => p.id === preset)?.range() : null);
  const url = useMemo(() => {
    const q = new URLSearchParams({ view });
    if (range) { q.set("from", range.from); q.set("to", range.to); }
    if (picked.length) q.set("creators", picked.join(","));
    if (view === "ricerca-fan" && search) q.set("q", search);
    if (refresh) q.set("refresh", "1");
    return `/api/admin/analisi-vendite?${q}`;
  }, [view, range?.from, range?.to, picked, refresh, search]);
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const creators = data?.creators || error?.info?.creators || [];
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const current = VIEWS.find((v) => v.id === view);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <button onClick={onBack} style={linkBtn}>← Torna alle creator</button>
        <span style={{ fontSize: 13, color: CP.textMuted }}>Dati completi: le tabelle dei report Looker, stesse formule, da scaricare in CSV.</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Viste">
        {VIEWS.map((v) => <FilterChip key={v.id} label={v.label} active={view === v.id} onClick={() => chooseView(v.id)} />)}
      </div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: -8 }}>{current.hint}</div>

      <div style={{ ...card, padding: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: CP.textMuted, minWidth: 64 }}>Periodo</span>
          {PRESETS.map((p) => <FilterChip key={p.id} label={p.label} active={preset === p.id && !custom} onClick={() => { setPreset(p.id); setCustom(null); }} />)}
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
            dal <input type="date" value={data?.range?.from || ""} onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: data?.range?.to || e.target.value })} style={dateInput} />
            al <input type="date" value={data?.range?.to || ""} onChange={(e) => e.target.value && setCustom({ from: data?.range?.from || e.target.value, to: e.target.value })} style={dateInput} />
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: CP.textMuted, minWidth: 64 }}>Creator</span>
          <FilterChip label={`Tutte (${creators.length})`} active={!picked.length} onClick={() => setPicked([])} />
          {creators.map((c) => <FilterChip key={c.id} label={c.name} active={picked.includes(c.id)} onClick={() => togglePick(c.id)} />)}
        </div>
      </div>

      {data && !data.empty && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: CP.textMuted }}>
          <span>{dshort(data.range?.from)} – {dshort(data.range?.to)} (giorni UTC, come Looker)</span>
          <span>·</span>
          <span>{data.source === "backup" ? "Fonte: copia di sicurezza nostra (aggiornata ogni notte): il warehouse dell'altra parte non risponde" : "Fonte: warehouse, dati aggiornati in tempo quasi reale"}</span>
          <span>·</span>
          <span>calcolato {dtLocal(data.computed_at)}{data.cached ? " (dalla cache, 10 min)" : ""}</span>
          <button onClick={() => setRefresh((n) => n + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", color: CP.accentSoftText, cursor: "pointer", fontSize: 12, fontFamily: FONTS.body }}>
            <RefreshCw size={12} /> ricalcola
          </button>
        </div>
      )}

      {error && <Notice danger>{error.message}</Notice>}
      {data?.empty && <Notice>{data.message}</Notice>}
      {!data && !error && isLoading && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso…</div>}

      {data && !data.empty && data.view === view && (
        <div style={{ display: "grid", gap: 24, opacity: isLoading ? 0.6 : 1, transition: "opacity .15s" }}>
          {view === "recap" && <RecapView d={data} />}
          {view === "conversioni" && <ConversioniView d={data} />}
          {view === "rapporto" && <RapportoView d={data} />}
          {view === "meta-mese" && <MetaMeseView d={data} />}
          {view === "transazioni" && <TransazioniView d={data} />}
          {view === "nuovi-abbonati" && <NuoviAbbonatiView d={data} />}
          {view === "tracking" && <TrackingView d={data} />}
          {view === "copertura" && <CoperturaView d={data} />}
          {view === "notifiche" && <NotificheView d={data} />}
          {view === "welcome" && <WelcomeView d={data} />}
          {view === "ricerca-fan" && <RicercaFanView d={data} query={search} setQuery={setSearch} />}
        </div>
      )}
    </div>
  );
}

const dateInput = { background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit" };
const linkBtn = { border: "none", background: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 14, fontFamily: FONTS.body };

/* ───────── v2 (9/10/2026): si parte dalle creator, non dalle tabelle ───────── */

const STATUS = {
  "in-calo": { label: "In calo", color: CP.accentRed },
  stabile: { label: "Stabile", color: CP.textMuted },
  "in-crescita": { label: "In crescita", color: CP.accentGreen },
  "pochi-dati": { label: "Pochi dati", color: CP.textMuted },
};
const DIAG_PERIODS = [7, 14, 28];

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.stabile;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: CP.textSecondary, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />{s.label}
    </span>
  );
}

function deltaText(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
}
const moneyShort = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString("it-IT", { useGrouping: "always" })}`);

function Sparkline({ points, height = 36 }) {
  if (!points?.length) return null;
  const W = 240, H = height;
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const path = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(H - 3 - (p.revenue / max) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden="true">
      <path d={path} fill="none" stroke={CP.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PersonCard({ p, onOpen }) {
  const m = p.metrics;
  const [main, ...more] = p.reasons;
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      style={{ ...card, padding: 16, display: "grid", gap: 10, cursor: "pointer", alignContent: "start" }} aria-label={`Apri ${p.name}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{p.name}</div>
          {p.accounts.length > 1 && <div style={{ fontSize: 12, color: CP.textMuted }}>{p.accounts.map((a) => a.market || a.alias).join(" · ")}</div>}
        </div>
        <StatusChip status={p.status} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{moneyShort(m.revenue)}</span>
        {deltaText(m.revenue_delta) && <span style={{ fontSize: 13, color: CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>{deltaText(m.revenue_delta)} ({m.revenue_diff >= 0 ? "+" : "−"}{moneyShort(Math.abs(m.revenue_diff))})</span>}
      </div>
      <Sparkline points={p.daily} />
      {main && <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.45 }}>{main.text}</div>}
      {more.slice(0, 2).map((r) => <div key={r.kind} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{r.text}</div>)}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textMuted, borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 8 }}>
        <span>{int(m.subs)} nuovi abbonati</span>
        <span>{int(m.spenders)} fan che spendono</span>
        {m.spend_per_fan != null && <span>{moneyShort(m.spend_per_fan)} a testa</span>}
      </div>
    </div>
  );
}

function Fact({ label, now, prev, delta, hint }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{now}</div>
      <div style={{ fontSize: 12, color: CP.textSecondary }}>{prev != null ? `prima ${prev}` : ""}{delta ? ` · ${delta}` : ""}</div>
      {hint && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function CreatorDetail({ d, onBack, onDati }) {
  const p = d.person;
  if (!p) return <Notice>Nessun dato per questa creator nel periodo.</Notice>;
  const m = p.metrics;
  const pctOrDash = (v) => (v == null ? "—" : pct(v, 1));
  const linkCols = [
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—" },
    { key: "clicks", label: "Click", align: "right", render: (r) => int(r.clicks) },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "subs_delta", label: "rispetto a prima", align: "right", render: (r) => <Delta v={r.subs_delta} />, csv: (r) => r.subs_delta },
    { key: "cr", label: "Abbonati ogni 100 click", align: "right", render: (r) => (r.cr == null ? "—" : (r.cr * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })) },
    { key: "revenue", label: "Speso dai suoi fan", align: "right", render: (r) => money(r.revenue) },
  ];
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <button onClick={onBack} style={{ ...linkBtn, justifySelf: "start" }}>← Tutte le creator</button>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: CP.textPrimary }}>{p.name}</h2>
          <div style={{ fontSize: 13, color: CP.textMuted }}>{p.accounts.map((a) => a.alias).join(" · ")}</div>
        </div>
        <StatusChip status={p.status} />
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "baseline" }}>
        <Metric label="Revenue netta" value={money(m.revenue)} delta={deltaText(m.revenue_delta)} deltaLabel={`dal ${dshort(d.previous.from)} al ${dshort(d.previous.to)} (${money(m.revenue_prev)})`} />
      </div>
      <section style={{ ...card, padding: 16, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: CP.textMuted }}>Perché</div>
        {p.reasons.map((r, i) => <div key={r.kind + i} style={{ fontSize: i ? 14 : 15, color: i ? CP.textSecondary : CP.textPrimary, lineHeight: 1.5 }}>{r.text}</div>)}
      </section>
      <div style={{ ...card, padding: 16 }}>
        <BarsChart label="Revenue al giorno" valueKey="revenue" fmt={moneyShort}
          points={p.daily.map((x) => ({ key: x.day, label: dshort(x.day), short: `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}`, revenue: x.revenue }))} />
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <SectionTitle>I numeri che spiegano la revenue</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          <Fact label="Fan che hanno speso" now={int(m.spenders)} prev={int(m.spenders_prev)} delta={deltaText(m.spenders_delta)} />
          <Fact label="Spesa media per fan" now={money(m.spend_per_fan)} prev={money(m.spend_per_fan_prev)} delta={deltaText(m.spend_per_fan_delta)} />
          <Fact label="Nuovi abbonati" now={int(m.subs)} prev={int(m.subs_prev)} delta={deltaText(m.subs_delta)} />
          <Fact label="Nuovi che hanno comprato" now={pctOrDash(m.cr)} prev={pctOrDash(m.cr_prev)} hint="Su 100 nuovi abbonati, quanti hanno speso qualcosa." />
          <Fact label="Speso il primo giorno da un nuovo abbonato" now={money(m.d0_per_sub)} prev={money(m.d0_per_sub_prev)} hint="In media, nel giorno in cui si abbona." />
          <Fact label="Click sui tracking link" now={int(m.clicks)} prev={int(m.clicks_prev)} delta={deltaText(m.clicks_delta)} />
          <Fact label="Chargeback" now={moneyShort(m.chargeback_amount)} prev={moneyShort(m.chargeback_amount_prev)} hint={m.chargebacks ? `${int(m.chargebacks)} nel periodo` : "Nessuno nel periodo"} />
        </div>
      </section>

      {p.accounts.length > 1 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Per mercato</SectionTitle>
          {p.accounts.map((a) => (
            <div key={a.creator_id} style={{ fontSize: 14, color: CP.textSecondary }}>
              <span style={{ color: CP.textPrimary }}>{a.alias}</span>: {money(a.revenue)} <span style={{ color: CP.textMuted }}>(prima {money(a.revenue_prev)}, {deltaText((a.revenue - a.revenue_prev) / (a.revenue_prev || 1)) || "—"})</span>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: "grid", gap: 10 }}>
        <SectionTitle aside={`${d.links.total} link attivi`}>Da dove arrivano gli abbonati</SectionTitle>
        {d.links.falling.length > 0 && (
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            In calo: {d.links.falling.map((l) => `«${l.link_name || "senza nome"}» ${int(l.subs)} abbonati invece di ${int(l.subs_prev)}`).join("; ")}.
          </div>
        )}
        {d.links.fresh?.length > 0 && (
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            Link nuovi (nessun abbonato nel periodo prima): {d.links.fresh.map((l) => `«${l.link_name || "senza nome"}» ${int(l.subs)} abbonati, ${l.cr == null ? "—" : (l.cr * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} ogni 100 click`).join("; ")}.
            {" "}Un traffico nuovo spesso converte in modo diverso: guardalo accanto a «nuovi che hanno comprato».
          </div>
        )}
        <DataTable columns={linkCols} rows={d.links.top} minWidth={700} empty="Nessun tracking link attivo nel periodo." />
        <div style={{ fontSize: 12, color: CP.textMuted }}>«Speso dai suoi fan» è quanto hanno speso nel periodo tutti i fan entrati da quel link, anche prima.</div>
      </section>

      {d.ticket.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle aside="mese in corso">Come spendono</SectionTitle>
          {d.ticket.map((t) => (
            <div key={t.name} style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
              <span style={{ color: CP.textPrimary }}>{t.name}</span>: metà delle {int(t.transactions)} transazioni è sotto {money(t.median)}; la media è {money(t.avg)}
              {t.median && t.avg / t.median >= 1.8 ? " — buona parte dell'incasso viene da poche vendite grandi." : "."}
            </div>
          ))}
        </section>
      )}

      {(d.welcome.length > 0 || d.welcomeMissing.length > 0) && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Messaggio di benvenuto a pagamento</SectionTitle>
          {d.welcome.map((w) => (
            <div key={`${w.name}-${w.amount}`} style={{ fontSize: 14, color: CP.textSecondary }}>
              <span style={{ color: CP.textPrimary }}>{w.name}</span> a {money(w.amount)}: sbloccato da {int(w.unlocks)} nuovi abbonati su {int(w.subs)} ({pct(w.subs ? w.unlocks / w.subs : 0, 1)}), {money(w.revenue)}.
            </div>
          ))}
          {d.welcomeMissing.length > 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun prezzo welcome registrato per {d.welcomeMissing.join(", ")}: gli sblocchi non si possono misurare.</div>}
        </section>
      )}

      {d.chargebacks.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Ultimi chargeback</SectionTitle>
          {d.chargebacks.map((c, i) => (
            <div key={i} style={{ fontSize: 14, color: CP.textSecondary }}>{dt(c.chargeback_at)} · {c.username || c.user_id} · {c.payment_type} · {money(c.amount)}</div>
          ))}
        </section>
      )}

      <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {p.live && <a href={`/admin/le-mie-creator?creator=${encodeURIComponent(p.live)}`} style={actionBtn}>Chat e revenue dal vivo</a>}
        <a href="/admin/sales-coaching" style={actionBtn}>Coaching vendite</a>
        <button onClick={() => onDati(p.ids)} style={actionBtn}>Tutte le tabelle di {p.name}</button>
      </section>
    </div>
  );
}
const actionBtn = { display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, textDecoration: "none", cursor: "pointer", fontFamily: FONTS.body };

function useDiag(view, days, ids, enabled = true) {
  const url = useMemo(() => {
    const to = yesterday();
    const from = iso(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY);
    const q = new URLSearchParams({ view, from, to });
    if (ids?.length) q.set("creators", ids.join(","));
    return `/api/admin/analisi-vendite?${q}`;
  }, [view, days, ids?.join(",")]);
  return useSWR(enabled ? url : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
}

function readUrl() {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  return { vista: q.get("vista"), scheda: q.get("scheda"), creator: q.get("creator"), creators: (q.get("creators") || "").split(",").map(Number).filter(Boolean), giorni: Number(q.get("giorni")) || null };
}
function writeUrl(params) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const s = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
}

export default function AnalisiVenditePage() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("creator"); // creator | dati
  const [days, setDays] = useState(7);
  const [person, setPerson] = useState(null); // nome della persona aperta
  const [datiInit, setDatiInit] = useState({ scheda: null, creators: [] });

  useEffect(() => {
    const u = readUrl();
    if (u.vista === "dati") { setMode("dati"); setDatiInit({ scheda: u.scheda, creators: u.creators }); }
    if (u.creator) setPerson(u.creator);
    if (DIAG_PERIODS.includes(u.giorni)) setDays(u.giorni);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || mode !== "creator") return;
    writeUrl({ creator: person, giorni: days !== 7 ? days : null });
  }, [ready, mode, person, days]);

  const list = useDiag("diagnosi", days, null);
  const persons = list.data?.persons || [];
  const open = persons.find((p) => p.name === person) || null;
  const detail = useDiag("creator", days, open ? open.ids : null, Boolean(open));
  const showDetail = Boolean(person && open);

  const goDati = (ids) => { setDatiInit({ scheda: null, creators: ids || [] }); setMode("dati"); writeUrl({ vista: "dati", creators: ids || [] }); window.scrollTo?.(0, 0); };

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1280, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }]} title="Analisi vendite"
        subtitle={mode === "dati" ? "Le tabelle dei report Looker, con le stesse formule e solo le tue creator." : "Come vanno le tue creator e perché. Prima chi sta perdendo di più."} />

      {mode === "dati" ? (
        ready && <DatiCompleti initialView={datiInit.scheda} initialPicked={datiInit.creators} onBack={() => { setMode("creator"); writeUrl({}); }}
          onState={({ scheda, creators }) => writeUrl({ vista: "dati", scheda, creators })} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {DIAG_PERIODS.map((n) => <FilterChip key={n} label={`Ultimi ${n} giorni`} active={days === n} onClick={() => setDays(n)} />)}
            <span style={{ fontSize: 13, color: CP.textMuted }}>contro i {days} giorni prima · fino a ieri</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => goDati(open ? open.ids : [])} style={linkBtn}>Dati completi (tabelle Looker) →</button>
          </div>

          {list.error && <Notice danger>{list.error.message}</Notice>}
          {list.data?.empty && <Notice>{list.data.message}</Notice>}
          {!list.data && !list.error && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso…</div>}

          {showDetail ? (
            detail.data?.person && detail.data.view === "creator" ? (
              <div style={{ opacity: detail.isLoading ? 0.6 : 1 }}>
                <CreatorDetail d={detail.data} onBack={() => setPerson(null)} onDati={goDati} />
              </div>
            ) : detail.error ? <Notice danger>{detail.error.message}</Notice> : <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Apro {person}…</div>
          ) : list.data?.persons && (
            <>
              <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
                {list.data.summary.down > 0 && <><span style={{ color: CP.textPrimary }}>{list.data.summary.down} in calo</span>, </>}
                {list.data.summary.steady} stabili, {list.data.summary.up} in crescita{list.data.summary.few ? `, ${list.data.summary.few} con pochi dati` : ""}.
                {" "}In tutto {moneyShort(list.data.summary.revenue)}{deltaText(list.data.summary.revenue_delta) ? ` (${deltaText(list.data.summary.revenue_delta)} sul periodo prima)` : ""}.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 14, opacity: list.isLoading ? 0.6 : 1 }}>
                {persons.map((p) => <PersonCard key={p.name} p={p} onOpen={() => { setPerson(p.name); window.scrollTo?.(0, 0); }} />)}
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>
                «In calo» = almeno −10% e almeno −$300 rispetto al periodo prima. Revenue netta come in Looker; i fan che spendono sono persone distinte nel periodo.
                {list.data.source === "backup" ? " Fonte: copia di sicurezza nostra (il warehouse dell'altra parte non risponde)." : ""}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
