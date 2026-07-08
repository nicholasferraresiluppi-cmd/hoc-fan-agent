"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Radio, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel, PillTab } from "@/components/cp-style";
import HowToRead from "@/components/HowToRead";

/**
 * /admin/infloww-agency — Revenue di TUTTE le creator (vista portfolio).
 * Default: aggregati KV (esatto, istantaneo). Un job server-side pesca tutte le
 * transazioni e salva aggregati giornalieri per creator; la pagina somma la
 * finestra. "Sincronizza" guida il job (sopravvive al reload). "Dato live"
 * fa il read-through on-demand (più fresco ma tronca le big creator).
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));
const TYPE_LABEL = { Messages: "Messaggi", Tips: "Mance", Subscription: "Abbonamenti", RecurringSubscription: "Abb. ricorrenti", Post: "Post", Stream: "Live" };
const WINDOWS = [{ d: 7, label: "7 giorni" }, { d: 14, label: "14 giorni" }, { d: 30, label: "30 giorni" }];

function relTime(ts) {
  if (!ts) return "mai";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

export default function InflowwAgencyPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProg, setSyncProg] = useState(null);
  const drivingRef = useRef(false);

  async function load(d = days) {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/infloww-agency?days=${d}&source=kv`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadLive(d = days) {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/infloww-agency?days=${d}&source=live`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

  // Guida il job in loop (start già fatto o job in corso): chiama step finché finisce.
  async function driveSteps() {
    if (drivingRef.current) return;
    drivingRef.current = true;
    setSyncing(true);
    try {
      let more = true, guard = 0;
      while (more && guard++ < 200) {
        const r = await fetch("/api/admin/infloww-sync-job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "step" }) });
        const j = await r.json();
        setSyncProg(j.progress);
        more = j.has_more;
      }
    } finally {
      drivingRef.current = false;
      setSyncing(false);
      load();
    }
  }

  async function runSync() {
    setError(null);
    try {
      const r = await fetch("/api/admin/infloww-sync-job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", days: 31 }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSyncProg(j.progress);
      driveSteps();
    } catch (e) { setError(e.message); }
  }

  // Ripresa al mount: se un job è già running, riprendi a guidarlo.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/infloww-sync-job");
        const j = await r.json();
        if (j?.job?.status === "running") { setSyncProg(j.progress); driveSteps(); }
      } catch {}
    })();
    /* eslint-disable-next-line */
  }, []);

  const t = data?.totals;
  const needsSync = data?.needs_sync;
  const isLive = data?.source === "live";
  const typeRows = useMemo(() => {
    const bt = data?.by_type || {};
    const tot = Object.values(bt).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(bt).map(([k, v]) => ({ type: k, net: v, share: (v / tot) * 100 })).sort((a, b) => b.net - a.net);
  }, [data]);
  const maxDay = useMemo(() => Math.max(1, ...(data?.trend || []).map((x) => x.net_usd)), [data]);

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
        section="Data · Infloww"
        title="Revenue agency"
        subtitle="Il portfolio: quanto sta incassando ogni creator del roster, da cosa, e chi tira di più. Dato esatto, sincronizzato: la pagina è immediata."
        toolbar={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/admin/infloww-revenue" style={{ fontSize: 12, color: CP.accentSoftText, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Dettaglio per creator <ArrowRight size={12} />
            </Link>
          </div>
        }
      />

      <HowToRead items={[
        "Il dato è esatto e sincronizzato in KV: la pagina è immediata. 'Sincronizza' ripesca tutte le transazioni da Infloww e aggiorna gli aggregati (dura qualche minuto, sopravvive al reload).",
        "Netto = incasso reale dopo la trattenuta OnlyFans (20%). La tabella è ordinata per netto: in cima chi porta di più nel periodo.",
        "'Dato live' fa una lettura on-demand direttamente da Infloww (più fresca) ma tronca le creator ad alto volume: usalo per un check rapido, non per i totali.",
        "IL numero da guardare: il mix per tipo dell'agenzia. Se il grosso è 'Messaggi', la revenue la fa la chat degli operatori; se è 'Abbonamenti', la fa l'audience.",
      ]} />

      {/* Barra sync + controlli */}
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

          <div style={{ flex: 1 }} />

          {syncing ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: CP.textSecondary }}>
              <Loader2 size={15} className="animate-spin" />
              Sincronizzo… {syncProg ? `${syncProg.synced}/${syncProg.total} creator` : ""}
            </span>
          ) : (
            <>
              {!isLive && data && !needsSync && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: CP.textMuted }}>
                  <CheckCircle2 size={13} color={CP.accentGreen} /> esatto · sync {relTime(data.last_sync_at)}
                </span>
              )}
              {isLive && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#F59E0B" }}>
                  <Radio size={13} /> dato live (big creator troncate)
                </span>
              )}
              <button onClick={() => loadLive(days)} style={btnGhost} title="Lettura on-demand da Infloww, più fresca ma tronca le big creator">
                <Radio size={13} /> Dato live
              </button>
              <button onClick={runSync} style={btnPrimary}>
                <RefreshCw size={13} /> Sincronizza
              </button>
            </>
          )}
        </div>
        {syncing && (
          <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: CP.borderSoft, overflow: "hidden" }}>
            <div style={{ height: "100%", background: CP.accent, borderRadius: 3, transition: "width .3s", width: syncProg && syncProg.total ? `${Math.round((syncProg.synced / syncProg.total) * 100)}%` : "8%" }} />
          </div>
        )}
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {loading && !data && (
        <div style={{ padding: "50px", textAlign: "center", color: CP.textMuted }}>
          <Loader2 size={22} className="animate-spin" style={{ color: CP.accent }} />
        </div>
      )}

      {needsSync && !syncing && (
        <CpCard padding="30px" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, color: CP.textPrimary, marginBottom: 8, fontWeight: 500 }}>Nessun dato ancora sincronizzato</div>
          <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 18, maxWidth: 460, margin: "0 auto 18px" }}>
            Lancia la prima sincronizzazione: pesca le transazioni delle ultime 4 settimane per tutte le creator. Dura qualche minuto e resta salvata — dopo la pagina è immediata.
          </div>
          <button onClick={runSync} style={{ ...btnPrimary, margin: "0 auto" }}>
            <RefreshCw size={14} /> Sincronizza ora
          </button>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => loadLive(days)} style={{ ...btnGhost, margin: "0 auto" }}>
              <Radio size={13} /> Oppure guarda il dato live adesso (lento, tronca le big)
            </button>
          </div>
        </CpCard>
      )}

      {data && !needsSync && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Netto agenzia" value={fmt$(t.net_usd)} color={CP.accentGreen} sub={`${fmtN(t.tx_count)} transazioni · ${data.window_days}gg`} />
            <StatCard label="Lordo" value={fmt$(t.gross_usd)} sub={`fee OnlyFans ${fmt$(t.fee_usd)}`} />
            <StatCard label="Creator attive" value={fmtN((data.creators || []).filter((c) => c.net > 0).length)} sub={`su ${data.loaded} totali`} />
            <StatCard label="Media / creator attiva" value={fmt$(avgActive(data.creators))} sub="netto medio nel periodo" />
          </div>

          {isLive && data.truncated_any && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#F59E0B" }}>
              ⚠ Dato live: alcune creator ad alto volume sono troncate (⚠ in tabella). Per i totali esatti usa Sincronizza.
            </div>
          )}

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
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "transparent", color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONTS.body, cursor: "pointer" };
