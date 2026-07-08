"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Radio, ArrowRight } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel, PillTab } from "@/components/cp-style";
import HowToRead from "@/components/HowToRead";

/**
 * /admin/infloww-agency — Revenue di TUTTE le creator, live (vista portfolio).
 * Fan-out concorrente sull'API Infloww: netto per creator, mix, trend, ranking.
 * Il pull tocca ~41 creator → ci vogliono ~20-40s: lo diciamo chiaro.
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));
const TYPE_LABEL = { Messages: "Messaggi", Tips: "Mance", Subscription: "Abbonamenti", RecurringSubscription: "Abb. ricorrenti", Post: "Post", Stream: "Live" };
const WINDOWS = [{ d: 7, label: "7 giorni" }, { d: 14, label: "14 giorni" }, { d: 30, label: "30 giorni" }];

export default function InflowwAgencyPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load(d = days) {
    setLoading(true); setError(null); setData(null);
    try {
      const r = await fetch(`/api/admin/infloww-agency?days=${d}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

  const t = data?.totals;
  const typeRows = useMemo(() => {
    const bt = data?.by_type || {};
    const tot = Object.values(bt).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(bt).map(([k, v]) => ({ type: k, net: v, share: (v / tot) * 100 })).sort((a, b) => b.net - a.net);
  }, [data]);
  const maxDay = useMemo(() => Math.max(1, ...(data?.trend || []).map((x) => x.net_usd)), [data]);
  const maxCreatorNet = useMemo(() => Math.max(1, ...(data?.creators || []).map((c) => c.net)), [data]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Revenue agency</span>
          </div>
        }
        section="Data · Infloww (live)"
        title="Revenue agency live"
        subtitle="Il portfolio: quanto sta incassando ogni creator del roster in questo momento, da cosa, e chi tira di più. Un colpo d'occhio sull'intera agenzia, senza aspettare la chiusura."
        toolbar={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/admin/infloww-revenue" style={{ fontSize: 12, color: CP.accentSoftText, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Dettaglio per creator <ArrowRight size={12} />
            </Link>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: CP.accentGreen, fontFamily: FONTS.mono }}>
              <Radio size={13} /> LIVE
            </span>
          </div>
        }
      />

      <HowToRead items={[
        "La pagina interroga Infloww in tempo reale per TUTTE le creator connesse: per questo ci mette ~20-40 secondi. È il dato di adesso, non una copia salvata.",
        "Netto = incasso reale dopo la trattenuta OnlyFans (20%). La tabella è ordinata per netto: in cima chi porta di più nel periodo.",
        "Finestra breve (7gg) per accuratezza: sui 30gg le creator ad alto volume possono essere troncate (segnale ⚠) — per il totale esatto apri il loro dettaglio.",
        "IL numero da guardare: il mix per tipo dell'agenzia. Se il grosso è 'Messaggi', la revenue la fa la chat degli operatori; se è 'Abbonamenti', la fa l'audience.",
      ]} />

      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Finestra</label>
            <div style={{ display: "flex", gap: 6 }}>
              {WINDOWS.map((w) => (
                <PillTab key={w.d} active={days === w.d} onClick={() => setDays(w.d)}>{w.label}</PillTab>
              ))}
            </div>
          </div>
          {loading && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: CP.textSecondary }}>
              <Loader2 size={15} className="animate-spin" /> Interrogo tutte le creator live… ~30s
            </span>
          )}
          {data && !loading && (
            <span style={{ fontSize: 11, color: CP.textMuted }}>
              {data.loaded}/{data.total_creators} creator{data.skipped > 0 ? ` · ${data.skipped} non caricate (tempo)` : ""}
            </span>
          )}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {loading && !data && (
        <div style={{ padding: "70px 20px", textAlign: "center", color: CP.textMuted, fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Loader2 size={26} className="animate-spin" style={{ color: CP.accent }} />
          Sto interrogando l'intero roster su Infloww, in parallelo. Ci vogliono ~20-40 secondi.
        </div>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Netto agenzia" value={fmt$(t.net_usd)} color={CP.accentGreen} sub={`${fmtN(t.tx_count)} transazioni · ${data.window_days}gg`} />
            <StatCard label="Lordo" value={fmt$(t.gross_usd)} sub={`fee OnlyFans ${fmt$(t.fee_usd)}`} />
            <StatCard label="Creator attive" value={fmtN((data.creators || []).filter((c) => c.net > 0).length)} sub={`su ${data.loaded} caricate`} />
            <StatCard label="Media / creator attiva" value={fmt$(avgActive(data.creators))} sub="netto medio nel periodo" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 14 }}>Da cosa arriva il netto (agenzia)</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {typeRows.map((r) => (
                  <div key={r.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                      <span style={{ color: CP.textSecondary }}>{TYPE_LABEL[r.type] || r.type}</span>
                      <span style={{ fontFamily: FONTS.mono, color: CP.textPrimary }}>{fmt$(r.net)} <span style={{ color: CP.textMuted }}>· {Math.round(r.share)}%</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: CP.borderSoft, overflow: "hidden" }}>
                      <div style={{ width: `${r.share}%`, height: "100%", background: CP.accent, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </CpCard>

            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 4 }}>Netto per giorno (agenzia)</SectionLabel>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 14 }}>ultimi {data.window_days} giorni · fuso Roma</div>
              {(data.trend || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
                  {data.trend.map((x) => (
                    <div key={x.date} title={`${x.date}: ${fmt$(x.net_usd)}`}
                      style={{ flex: 1, minWidth: 3, height: `${Math.max(2, (x.net_usd / maxDay) * 100)}%`, background: CP.accent, borderRadius: "2px 2px 0 0", opacity: 0.85 }} />
                  ))}
                </div>
              )}
            </CpCard>
          </div>

          {data.truncated_any && (
            <div style={{ marginBottom: 12, fontSize: 12, color: CP.textMuted }}>
              ⚠ Alcune creator ad alto volume sono troncate su questa finestra (segnate ⚠ in tabella): per il loro totale esatto apri il dettaglio o restringi la finestra.
            </div>
          )}

          {/* Ranking creator */}
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${CP.border}` }}>
              <SectionLabel>Creator per netto ({data.window_days}gg)</SectionLabel>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={th}>#</th>
                    <th style={th}>Creator</th>
                    <th style={{ ...th, textAlign: "right" }}>Netto</th>
                    <th style={{ ...th, textAlign: "right" }}>Lordo</th>
                    <th style={{ ...th, textAlign: "right" }}>Transazioni</th>
                    <th style={th}>Tipo prevalente</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.creators.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${CP.border}55` }}>
                      <td style={{ ...td, color: CP.textMuted, fontFamily: FONTS.mono }}>{i + 1}</td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(c.name || c.id), flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                          {c.truncated && <span title="Volume alto: netto sottostimato in questa finestra" style={{ color: "#F59E0B" }}>⚠</span>}
                          {c.error && <span title="Errore nel pull" style={{ color: CP.accentRed }}>×</span>}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: c.net > 0 ? CP.accentGreen : CP.textMuted, fontWeight: 600 }}>{fmt$(c.net)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(c.gross)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtN(c.tx)}</td>
                      <td style={{ ...td, color: CP.textSecondary }}>{c.topType ? (TYPE_LABEL[c.topType] || c.topType) : "—"}</td>
                      <td style={td}>
                        <Link href={`/admin/infloww-revenue?creatorId=${encodeURIComponent(c.id)}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 5, color: CP.accentSoftText, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                          Dettaglio <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CpCard>
        </>
      )}
    </div>
  );
}

function avgActive(creators = []) {
  const act = (creators || []).filter((c) => c.net > 0);
  if (!act.length) return 0;
  return Math.round(act.reduce((s, c) => s + c.net, 0) / act.length);
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" };
const td = { padding: "9px 12px", verticalAlign: "middle" };
