"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Loader2, Radio, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";

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
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const g = Math.floor(h / 24);
  return `${g} ${g === 1 ? "giorno" : "giorni"} fa`;
}

export default function InflowwAgencyPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProg, setSyncProg] = useState(null);
  const drivingRef = useRef(false);
  const [howOpen, setHowOpen] = useState(false);

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

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX). Problema principale: con
  // l'ultimo sync vecchio (es. 79 giorni) la pagina mostrava $0 ovunque come se
  // l'agenzia non avesse incassato nulla. Ora l'età del dato è dichiarata e, se
  // copre meno della finestra, lo si dice PRIMA dei numeri, con l'azione da fare.
  const syncAgeDays = data?.last_sync_at ? (Date.now() - data.last_sync_at) / 86400000 : null;
  const staleVsWindow = !isLive && data && !needsSync && syncAgeDays != null && syncAgeDays >= (data.window_days || days);
  const staleSome = !isLive && data && !needsSync && syncAgeDays != null && syncAgeDays >= 2 && !staleVsWindow;
  const creators = (data?.creators || []).map((c, i) => ({ ...c, rank: i + 1 }));
  const active = creators.filter((c) => c.net > 0);
  const topType = typeRows[0];

  const columns = [
    { key: "rank", label: "#", align: "right", muted: true },
    { key: "name", label: "Creator", render: (c) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(c.name || c.id), flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{c.name}</span>
        {c.truncated && <span title="Volume alto: netto sottostimato in questa finestra" style={{ fontSize: 12, color: CP.textMuted }}>troncata</span>}
        {c.error && <span title="Errore nel pull" style={{ fontSize: 12, color: CP.accentRed }}>errore</span>}
      </span>
    ) },
    { key: "net", label: "Netto", align: "right", render: (c) => <span style={{ color: c.net > 0 ? CP.textPrimary : CP.textMuted, fontWeight: 500 }}>{fmt$(c.net)}</span> },
    { key: "gross", label: "Lordo", align: "right", muted: true, render: (c) => fmt$(c.gross) },
    { key: "tx", label: "Transazioni", align: "right", muted: true, render: (c) => fmtN(c.tx) },
    { key: "topType", label: "Tipo prevalente", muted: true, render: (c) => (c.topType ? (TYPE_LABEL[c.topType] || c.topType) : "—") },
    { key: "go", label: "", sortable: false, render: (c) => (
      <Link href={`/admin/infloww-revenue?creatorId=${encodeURIComponent(c.id)}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: CP.accentSoftText, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
        Dettaglio <ArrowRight size={12} />
      </Link>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Revenue agency" }]}
        title="Revenue agency"
        subtitle="Quanto incassa ogni creator del roster, da cosa e chi porta di più. Serve a vedere il portafoglio in un colpo d'occhio; il dettaglio di una creator è in Revenue live."
        actions={<>
          <Link href="/admin/infloww-revenue" style={{ ...btnGhost, textDecoration: "none" }}>Revenue live per creator <ArrowRight size={13} /></Link>
        </>}
      />

      {/* Finestra + stato del dato + sync */}
      <section style={{ ...card, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WINDOWS.map((w) => (
              <FilterChip key={w.d} label={`Ultimi ${w.label}`} active={days === w.d} onClick={() => setDays(w.d)} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {syncing ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textSecondary }}>
              <Loader2 size={15} className="animate-spin" color={CP.accent} />
              Sincronizzo… {syncProg ? `${syncProg.synced} di ${syncProg.total} creator` : ""}
            </span>
          ) : (
            <>
              {!isLive && data && !needsSync && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textMuted }}>
                  <CheckCircle2 size={14} color={staleVsWindow || staleSome ? CP.textMuted : CP.accentGreen} /> Ultimo sync {relTime(data.last_sync_at)}
                </span>
              )}
              {isLive && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textSecondary }}>
                  <Radio size={14} /> Dato live (creator grandi troncate)
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
          <>
            <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: CP.surfaceAlt, overflow: "hidden" }}>
              <div style={{ height: "100%", background: CP.scale, transition: "width .3s", width: syncProg && syncProg.total ? `${Math.round((syncProg.synced / syncProg.total) * 100)}%` : "8%" }} />
            </div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Dura qualche minuto. Puoi ricaricare la pagina: il lavoro riprende da dove era.</div>
          </>
        )}
      </section>

      {error && <Notice danger>Qualcosa non ha funzionato: {error}</Notice>}

      {loading && !data && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14, padding: "20px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Carico gli incassi…
        </div>
      )}

      {needsSync && !syncing && (
        <section style={{ ...card, padding: "24px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 16, color: CP.textPrimary, marginBottom: 6, fontWeight: 500 }}>Nessun dato ancora sincronizzato</div>
          <div style={{ fontSize: 14, color: CP.textSecondary, marginBottom: 16, maxWidth: 560, lineHeight: 1.5 }}>
            Lancia la prima sincronizzazione: scarica le transazioni delle ultime 4 settimane per tutte le creator. Dura qualche minuto e resta salvata, poi la pagina si apre subito.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={runSync} style={btnPrimary}><RefreshCw size={14} /> Sincronizza ora</button>
            <button onClick={() => loadLive(days)} style={btnGhost}><Radio size={13} /> Guarda il dato live (lento, tronca le creator grandi)</button>
          </div>
        </section>
      )}

      {data && !needsSync && (
        <>
          {staleVsWindow && (
            <Notice danger>
              <span style={{ color: CP.textPrimary }}>I dati sono fermi a {relTime(data.last_sync_at)}</span>, prima dell&apos;inizio di questa finestra: i numeri qui sotto sono a zero perché mancano le transazioni, non perché le creator non hanno incassato. Premi “Sincronizza” per scaricarle (qualche minuto), oppure “Dato live” per un controllo veloce.
            </Notice>
          )}
          {staleSome && (
            <Notice>
              Ultimo sync {relTime(data.last_sync_at)}: gli ultimi giorni della finestra non sono ancora qui. Sincronizza per averli.
            </Notice>
          )}
          {isLive && data.truncated_any && (
            <Notice>Dato live: alcune creator ad alto volume sono troncate (segnate “troncata” in tabella). Per i totali esatti usa Sincronizza.</Notice>
          )}
          {!isLive && data.failed_creators?.length > 0 && (
            <Notice danger>
              {data.failed_creators.length} creator non sincronizzate nell&apos;ultimo sync (errore lato Infloww): {data.failed_creators.slice(0, 5).join(", ")}{data.failed_creators.length > 5 ? "…" : ""}. Rilancia Sincronizza per recuperarle.
            </Notice>
          )}

          <HeroMetric
            label={`Netto agenzia · ultimi ${data.window_days} giorni`}
            value={fmt$(t.net_usd)}
            compare={`Lordo ${fmt$(t.gross_usd)} meno ${fmt$(t.fee_usd)} di trattenuta OnlyFans (20%) · ${fmtN(t.tx_count)} transazioni`}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Creator che hanno incassato" value={fmtN(active.length)} note={`su ${fmtN(data.loaded)} nel roster`} />
              <Metric label="Netto medio per creator attiva" value={fmt$(avgActive(data.creators))} />
              {topType && t.net_usd > 0 && <Metric label="Prima fonte di incasso" value={TYPE_LABEL[topType.type] || topType.type} note={`${Math.round(topType.share)}% del netto`} />}
            </div>
          </HeroMetric>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 18, alignItems: "start" }}>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Da cosa arriva il netto</SectionTitle>
              <div style={{ fontSize: 12, color: CP.textMuted, margin: "-4px 0 12px", lineHeight: 1.5 }}>Se prevalgono i messaggi, la revenue la fa la chat degli operatori; se prevalgono gli abbonamenti, la fa il pubblico della creator.</div>
              {typeRows.length === 0 || t.net_usd === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun incasso nella finestra.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {typeRows.map((r) => (
                    <div key={r.type}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, gap: 8 }}>
                        <span style={{ color: CP.textSecondary }}>{TYPE_LABEL[r.type] || r.type}</span>
                        <span style={{ color: CP.textPrimary, ...NUM }}>{fmt$(r.net)} <span style={{ color: CP.textMuted }}>· {Math.round(r.share)}%</span></span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: CP.surfaceAlt, overflow: "hidden" }}>
                        <div style={{ width: `${r.share}%`, height: "100%", background: CP.scale, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle aside="fuso Roma">Netto per giorno</SectionTitle>
              {(data.trend || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun movimento nella finestra.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
                  {data.trend.map((x) => (
                    <div key={x.date} title={`${x.date}: ${fmt$(x.net_usd)}`}
                      style={{ flex: 1, minWidth: 3, height: `${Math.max(2, (x.net_usd / maxDay) * 100)}%`, background: CP.scale, borderRadius: "2px 2px 0 0" }} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <SectionTitle aside="in cima chi porta di più · clicca le colonne per riordinare">Creator per netto</SectionTitle>
          <DataTable columns={columns} rows={creators} minWidth={760} maxHeight={640} empty="Nessuna creator nel roster." />

          <Disclosure open={howOpen} onToggle={() => setHowOpen((v) => !v)} title="Come si legge questa pagina" summary="sync, dato live, netto e lordo">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
              <li>Il dato è salvato in HOC Pro: la pagina è immediata. “Sincronizza” riscarica tutte le transazioni da Infloww e aggiorna i totali (qualche minuto, sopravvive al ricaricamento della pagina).</li>
              <li>Netto = incasso reale dopo la trattenuta OnlyFans (20%).</li>
              <li>“Dato live” legge direttamente da Infloww (più fresco) ma tronca le creator ad alto volume: va bene per un controllo rapido, non per i totali.</li>
            </ul>
          </Disclosure>
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

const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "transparent", color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" };
