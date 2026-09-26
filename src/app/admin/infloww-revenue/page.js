"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, Radio } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";

/**
 * /admin/infloww-revenue — Ledger revenue fan-by-fan da Infloww API, LIVE.
 * Read-through: a ogni apertura pesca le transazioni reali del periodo per una
 * creator e le aggrega (mix per tipo, trend, whale, rimborsi). Nessuno storage:
 * il dato è quello vero di adesso (ritardo di sync OnlyFans ~1h).
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));

const TYPE_LABEL = {
  Messages: "Messaggi (PPV/chat)",
  Tips: "Mance",
  Subscription: "Abbonamenti",
  RecurringSubscription: "Abbonamenti ricorrenti",
  Post: "Post",
  Stream: "Live",
};
const WINDOWS = [
  { d: 7, label: "7 giorni" },
  { d: 30, label: "30 giorni" },
  { d: 90, label: "90 giorni" },
];

export default function InflowwRevenuePage() {
  const [creators, setCreators] = useState(null);
  const [creatorId, setCreatorId] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  // Roster all'avvio + preselect da ?creatorId= (drill-down dalla vista agency)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/infloww-revenue");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setCreators(j.creators || []);
      } catch (e) { setError(e.message); }
    })();
    const cid = new URLSearchParams(window.location.search).get("creatorId");
    if (cid) setCreatorId(cid);
  }, []);

  async function load(cid = creatorId, d = days) {
    if (!cid) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/infloww-revenue?creatorId=${encodeURIComponent(cid)}&days=${d}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (creatorId) load(creatorId, days); /* eslint-disable-next-line */ }, [creatorId, days]);

  const selected = useMemo(() => (creators || []).find((c) => c.id === creatorId), [creators, creatorId]);
  const t = data?.totals;
  const byType = data?.by_type || {};
  const typeRows = useMemo(() => {
    const totNet = Object.values(byType).reduce((s, v) => s + (v.net_usd || 0), 0) || 1;
    return Object.entries(byType)
      .map(([k, v]) => ({ type: k, ...v, share: (v.net_usd / totNet) * 100 }))
      .sort((a, b) => b.net_usd - a.net_usd);
  }, [byType]);
  const maxDay = useMemo(() => Math.max(1, ...(data?.trend || []).map((x) => x.net_usd)), [data]);

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX): prima si apriva su una
  // pagina vuota con un avviso giallo pieno di gergo (ledger, loading, creatorId).
  // Ora: si sceglie la creator anche con un clic sui nomi, il netto è il numero
  // principale con la sua scomposizione, gli avvisi tecnici stanno in fondo.
  const fans = (data?.top_fans || []).map((f, i) => ({ ...f, id: f.fanId, rank: i + 1 }));
  const conc = t?.top10_share_pct;
  const fanCols = [
    { key: "rank", label: "#", align: "right", muted: true },
    { key: "fanName", label: "Fan", render: (f) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(f.fanId), flexShrink: 0 }} />
        {f.fanName || "—"}
      </span>
    ) },
    { key: "count", label: "Transazioni", align: "right", muted: true, render: (f) => fmtN(f.count) },
    { key: "net_usd", label: "Netto", align: "right", render: (f) => <span style={{ fontWeight: 500 }}>{fmt$(f.net_usd)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Revenue agency", href: "/admin/infloww-agency" }, { label: "Revenue live" }]}
        title="Revenue live per creator"
        subtitle="Quanto ha incassato una creator adesso, direttamente da Infloww: da cosa (chat, mance, abbonamenti), quanto è stato rimborsato e quanto dipende da pochi fan."
        actions={<>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ ...ctl, minWidth: 240, cursor: "pointer" }} disabled={!creators} aria-label="Creator">
            <option value="">{creators ? `Scegli la creator (${creators.length})` : "Carico l'elenco…"}</option>
            {(creators || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.userName ? `  ·  ${c.userName}` : ""}</option>
            ))}
          </select>
        </>}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {WINDOWS.map((w) => (
          <FilterChip key={w.d} label={`Ultimi ${w.label}`} active={days === w.d} onClick={() => setDays(w.d)} />
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textMuted, marginLeft: 4 }}>
          <Radio size={14} /> dato di adesso (ritardo OnlyFans circa 1 ora)
        </span>
        {loading && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textSecondary }}><Loader2 size={14} className="animate-spin" /> Leggo da Infloww…</span>}
      </div>

      {error && <Notice danger>Non riesco a leggere i dati da Infloww: {error}</Notice>}

      {!creatorId && !error && (
        <section style={{ ...card, padding: "18px 18px", marginBottom: 14 }}>
          <SectionTitle>Scegli una creator</SectionTitle>
          <div style={{ fontSize: 13, color: CP.textSecondary, margin: "-4px 0 12px" }}>
            Ogni profilo è separato (per esempio Laura ESP e Laura ENG sono due profili diversi): qui ne vedi uno alla volta. Per il confronto tra tutte usa <Link href="/admin/infloww-agency" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Revenue agency</Link>.
          </div>
          {!creators ? (
            <div style={{ fontSize: 13, color: CP.textMuted }}>Carico l&apos;elenco…</div>
          ) : creators.length === 0 ? (
            <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna creator nel roster Infloww.</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {creators.map((c) => <FilterChip key={c.id} label={c.name} onClick={() => setCreatorId(c.id)} />)}
            </div>
          )}
        </section>
      )}

      {creatorId && loading && !data && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14, padding: "20px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Leggo le transazioni di {selected?.name || "questa creator"}…
        </div>
      )}

      {data && creatorId && (
        <>
          <HeroMetric
            label={`Netto ${selected?.name ? `di ${selected.name} ` : ""}· ultimi ${days} giorni`}
            value={fmt$(t.net_usd)}
            compare={`Lordo ${fmt$(t.gross_usd)} meno ${fmt$(t.fee_usd)} di trattenuta OnlyFans (20%) · ${fmtN(t.tx_count)} transazioni da ${fmtN(t.fan_count)} fan`}
            hint="Prima di fee del deal, marketing e costo operatori: per il margine vero usa il P&L.">
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Rimborsi" value={fmt$(data.refunds.total_usd)} danger={data.refunds.total_usd > 0} note={`${fmtN(data.refunds.count)} tra rimborsi e chargeback`} />
              <Metric label="Resta dopo i rimborsi" value={fmt$(data.refunds.net_after_refund_usd)} />
              <Metric label="Quota dai 10 fan migliori" value={conc == null ? "—" : `${conc}%`} danger={conc >= 60} note={conc >= 60 ? "dipende da pochi fan: rischio" : conc >= 40 ? "da tenere d'occhio" : "incasso ben distribuito"} />
            </div>
          </HeroMetric>

          {t.truncated && <Notice>Volume alto: ho letto solo i primi {fmtN(t.tx_count)} movimenti del periodo, quindi il totale è sottostimato. Scegli una finestra più corta per il numero esatto.</Notice>}
          {t.loading_count > 0 && <Notice>{fmtN(t.loading_count)} transazioni sono ancora in arrivo da OnlyFans: il netto può salire nelle prossime ore.</Notice>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 18, alignItems: "start" }}>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Da cosa arriva il netto</SectionTitle>
              <div style={{ fontSize: 12, color: CP.textMuted, margin: "-4px 0 12px", lineHeight: 1.5 }}>Se prevalgono i messaggi, la revenue la fanno gli operatori in chat; se prevalgono gli abbonamenti, la fa il pubblico.</div>
              {typeRows.length === 0 && <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento nel periodo.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {typeRows.map((r) => (
                  <div key={r.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, gap: 8 }}>
                      <span style={{ color: CP.textSecondary }}>{TYPE_LABEL[r.type] || r.type} <span style={{ color: CP.textMuted, fontSize: 12, ...NUM }}>· {fmtN(r.count)}</span></span>
                      <span style={{ color: CP.textPrimary, ...NUM }}>{fmt$(r.net_usd)} <span style={{ color: CP.textMuted }}>· {Math.round(r.share)}%</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: CP.surfaceAlt, overflow: "hidden" }}>
                      <div style={{ width: `${r.share}%`, height: "100%", background: CP.accent, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle aside="fuso Roma">Netto per giorno</SectionTitle>
              {(data.trend || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento nel periodo.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
                  {data.trend.map((x) => (
                    <div key={x.date} title={`${x.date}: ${fmt$(x.net_usd)}`}
                      style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (x.net_usd / maxDay) * 100)}%`, background: CP.accent, borderRadius: "2px 2px 0 0" }} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <SectionTitle aside={conc != null ? `i primi 10 fanno il ${conc}% del netto` : null}>Fan che spendono di più</SectionTitle>
          <DataTable columns={fanCols} rows={fans} minWidth={480} maxHeight={560} empty="Nessun fan nel periodo." />

          <div style={{ height: 14 }} />
          <Disclosure open={howOpen} onToggle={() => setHowOpen((v) => !v)} title="Come si legge questa pagina" summary="da dove vengono i numeri e cosa non includono">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
              <li>I numeri arrivano da Infloww al momento dell&apos;apertura, in dollari, con circa 1 ora di ritardo rispetto a OnlyFans. Le transazioni ancora in arrivo possono far salire il netto.</li>
              <li>Netto = quello che entra davvero dopo la trattenuta OnlyFans (20%). Non toglie fee del deal, marketing e costo operatori: per il margine usa il P&amp;L.</li>
              <li>Ogni profilo è tenuto separato per codice Infloww: profili di team o lingue diverse non vengono mai sommati.</li>
              <li>Se pochi fan fanno gran parte del netto (quota dei primi 10 alta), l&apos;incasso è fragile: se quei fan se ne vanno, cala tutto.</li>
            </ul>
          </Disclosure>
        </>
      )}
    </div>
  );
}

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
