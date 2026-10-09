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

export default function AnalisiVenditePage() {
  const [view, setView] = useState("recap");
  const [preset, setPreset] = useState(null); // null = periodo di default della vista
  const [custom, setCustom] = useState(null);
  const [picked, setPicked] = useState([]); // [] = tutte le creator visibili
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    try { const v = localStorage.getItem("analisi-vendite:view"); if (v && VIEWS.some((x) => x.id === v)) setView(v); } catch {}
  }, []);
  const chooseView = (v) => { setView(v); setPreset(null); setCustom(null); try { localStorage.setItem("analisi-vendite:view", v); } catch {} };

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
    <div style={{ display: "grid", gap: 20, maxWidth: 1280, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }]} title="Analisi vendite"
        subtitle="I report di Looker, con le stesse formule e solo le tue creator." />

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
