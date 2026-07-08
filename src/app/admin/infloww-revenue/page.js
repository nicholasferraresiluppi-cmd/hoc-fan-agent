"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Radio } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel, RankedItem, PillTab } from "@/components/cp-style";
import HowToRead from "@/components/HowToRead";

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

  // Roster all'avvio
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/infloww-revenue");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setCreators(j.creators || []);
      } catch (e) { setError(e.message); }
    })();
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

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Revenue live</span>
          </div>
        }
        section="Data · Infloww (live)"
        title="Revenue live per creator"
        subtitle="Il ledger vero, fan per fan, direttamente da Infloww: quanto ha incassato una creator nel periodo, da cosa (chat, mance, abbonamenti), da chi, al netto della trattenuta OnlyFans. Nessuna attesa della chiusura: è il dato di adesso."
        toolbar={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: CP.accentGreen, fontFamily: FONTS.mono }}>
            <Radio size={13} /> LIVE
          </span>
        }
      />

      <HowToRead items={[
        "Scegli una creator e la finestra temporale: la pagina interroga Infloww in tempo reale e ti mostra la revenue vera di quel periodo.",
        "Netto = quello che entra DAVVERO dopo la trattenuta OnlyFans (20%). È il numero che conta, non il lordo.",
        "Ogni creator ha profili separati per lingua (Laura ESP, Laura ENG, Laura Sommaruga sono TRE profili distinti): qui vedi un profilo alla volta, mai fusi.",
        "IL numero da guardare: da COSA arriva il netto (mix per tipo). Se il 90% è 'Messaggi', la revenue la fanno gli operatori in chat — non gli abbonamenti.",
        "Whale = i fan che spendono di più. Se pochi fan fanno gran parte del netto (concentrazione top-10 alta), c'è rischio: se se ne vanno, cala tutto.",
      ]} />

      <CpCard accent="#F59E0B" padding="12px 16px" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
          ⚠ <b>Dato live in $</b>, con ritardo di sync OnlyFans ~1h. Le transazioni in stato <i>loading</i> sono ancora in sincronizzazione (l'importo può salire). Il <b>netto</b> è già al netto del 20% OnlyFans, ma <b>lordo di</b> fee del deal, marketing e costo operatori: per il margine vero usa il P&L. Chiave su <code>creatorId</code>: profili di team diversi non vengono mai fusi.
        </div>
      </CpCard>

      {/* Controlli */}
      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Creator {creators ? `(${creators.length})` : ""}</label>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              style={{ ...input, minWidth: 280, cursor: "pointer" }}
              disabled={!creators}
            >
              <option value="" style={{ background: CP.surface }}>{creators ? "scegli creator…" : "carico roster…"}</option>
              {(creators || []).map((c) => (
                <option key={c.id} value={c.id} style={{ background: CP.surface }}>
                  {c.name}{c.userName ? `  ·  ${c.userName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Finestra</label>
            <div style={{ display: "flex", gap: 6 }}>
              {WINDOWS.map((w) => (
                <PillTab key={w.d} active={days === w.d} onClick={() => setDays(w.d)}>{w.label}</PillTab>
              ))}
            </div>
          </div>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginBottom: 8 }} />}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {!creatorId && !error && (
        <div style={{ padding: "60px 20px", textAlign: "center", color: CP.textMuted, fontSize: 14 }}>
          Scegli una creator per vedere il ledger live.
        </div>
      )}

      {data && creatorId && (
        <>
          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Netto (post-OF)" value={fmt$(t.net_usd)} color={CP.accentGreen}
              sub={`${fmtN(t.tx_count)} transazioni · ${fmtN(t.fan_count)} fan`} />
            <StatCard label="Lordo" value={fmt$(t.gross_usd)} sub={`fee OnlyFans ${fmt$(t.fee_usd)}`} />
            <StatCard label="Rimborsi" value={fmt$(data.refunds.total_usd)} color={data.refunds.total_usd > 0 ? CP.accentRed : CP.textMuted}
              sub={`${fmtN(data.refunds.count)} chargeback`} />
            <StatCard label="Netto − rimborsi" value={fmt$(data.refunds.net_after_refund_usd)} color={CP.textPrimary}
              sub="la revenue che resta davvero" />
            <StatCard label="Concentrazione" value={`${t.top10_share_pct}%`}
              color={t.top10_share_pct >= 60 ? CP.accentRed : t.top10_share_pct >= 40 ? "#F59E0B" : CP.accentGreen}
              sub="quota netto dai top-10 fan" tooltip="Se alta, la revenue dipende da pochi fan (rischio)." />
          </div>

          {(t.truncated || t.loading_count > 0) && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: CP.textMuted }}>
              {t.truncated && <span>⚠ Volume alto: mostrati i primi {fmtN(t.tx_count)} movimenti del periodo — restringi la finestra per il totale esatto.</span>}
              {t.loading_count > 0 && <span>⏳ {fmtN(t.loading_count)} transazioni ancora in sync (<i>loading</i>): il netto può salire.</span>}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
            {/* Mix per tipo */}
            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 4 }}>Da cosa arriva il netto</SectionLabel>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 14 }}>{selected?.name}</div>
              {typeRows.length === 0 && <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento nel periodo.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {typeRows.map((r) => (
                  <div key={r.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                      <span style={{ color: CP.textSecondary }}>{TYPE_LABEL[r.type] || r.type} <span style={{ color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 11 }}>· {r.count}</span></span>
                      <span style={{ fontFamily: FONTS.mono, color: CP.textPrimary }}>{fmt$(r.net_usd)} <span style={{ color: CP.textMuted }}>· {Math.round(r.share)}%</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: CP.borderSoft, overflow: "hidden" }}>
                      <div style={{ width: `${r.share}%`, height: "100%", background: CP.accent, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </CpCard>

            {/* Trend giornaliero */}
            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 4 }}>Netto per giorno</SectionLabel>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 14 }}>ultimi {days} giorni · fuso Roma</div>
              {(data.trend || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento nel periodo.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
                  {data.trend.map((x) => (
                    <div key={x.date} title={`${x.date}: ${fmt$(x.net_usd)}`}
                      style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (x.net_usd / maxDay) * 100)}%`, background: CP.accent, borderRadius: "2px 2px 0 0", opacity: 0.85 }} />
                  ))}
                </div>
              )}
            </CpCard>
          </div>

          {/* Whale */}
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${CP.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel>Top fan per spesa (whale)</SectionLabel>
              <span style={{ fontSize: 11, color: CP.textMuted }}>i top-10 fanno il {t.top10_share_pct}% del netto</span>
            </div>
            {data.top_fans.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: CP.textMuted, fontSize: 13 }}>Nessun fan nel periodo.</div>
            ) : (
              data.top_fans.map((f, i) => (
                <RankedItem
                  key={f.fanId}
                  rank={i + 1}
                  dotColor={creatorDotColor(f.fanId)}
                  name={f.fanName || "—"}
                  cols={[
                    { value: `${f.count} tx`, color: CP.textMuted, minWidth: 60 },
                    { value: fmt$(f.net_usd), color: CP.accentGreen, minWidth: 80 },
                  ]}
                />
              ))
            )}
          </CpCard>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
