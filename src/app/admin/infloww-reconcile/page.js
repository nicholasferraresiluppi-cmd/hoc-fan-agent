"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { CP, FONTS, creatorDotColor, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, Disclosure, Notice, DataTable, ActionRow, card, NUM } from "@/components/ds";
import { fmtInt, fmtAgo } from "@/lib/format";

/**
 * /admin/infloww-reconcile — Controllo dati CP: il venduto registrato in
 * CreatorsPro è completo? Confronto per creator col lordo REALE da Infloww
 * (fonte indipendente), sugli STESSI giorni. Rapporto ≈ 1 = ok; molto sotto
 * = buco nei dati CP. Nato dal caso "buste di aprile sparite": questo
 * controllo lo avrebbe beccato da solo.
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const NO_CP_MIN_GROSS = 500; // sotto questa soglia un profilo senza CP è rumore, non allarme

function monthOpts(n = 13) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " · in corso" : ""}`,
    });
  }
  return out;
}
function fmtDayIt(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_IT[Number(m) - 1].toLowerCase().slice(0, 3)} ${y}`;
}

// Avviso (né ok né buco): stesso colore dell'avviso di ActionRow nel DS.
const WARN = CP.accentSoftText;
const WARN_BG = CP.accentSoft;

// Semaforo sul rapporto CP/lordo-reale. Tolleranza fisiologica: gli
// abbonamenti (~1-2%) non passano dagli operatori. Caso speciale: la creator
// ESISTE nei turni ma $0 attribuiti → "vendite non attribuite" (takes mancanti).
function health(row) {
  const ratio = row.ratio_cp_over_gross;
  if (ratio == null) return { label: "n/d", color: CP.textMuted, bg: "transparent" };
  if (row.cp_sales === 0 && (row.cp_shifts || 0) > 0) {
    return { label: "vendite non attribuite", color: CP.accentRed, bg: alpha(CP.accentRed, "18"), tip: `Esiste in CP (${row.cp_shifts} turni) ma nessuna vendita è registrata a suo nome: takes non registrati.` };
  }
  // Buco INVERSO: l'analytics CP vede nettamente più di Infloww → l'"Incasso
  // reale" della riga è probabilmente sottostimato, quindi anche un rapporto
  // verde non è garantito. Da verificare la connessione Infloww dell'account.
  if (row.social_vs_infloww != null && row.social_vs_infloww > 1.25) {
    return { label: "Infloww incompleto?", color: WARN, bg: WARN_BG, tip: "L'analytics CP vede molto più di Infloww su questo account: l'incasso reale mostrato è probabilmente sottostimato (account scollegato da Infloww o ritardo di sync). Da verificare prima di fidarsi del rapporto." };
  }
  if (ratio > 1.15) return { label: "anomalo", color: WARN, bg: WARN_BG };
  if (ratio >= 0.9) return { label: "ok", color: CP.accentGreen, bg: alpha(CP.accentGreen, "18") };
  if (ratio >= 0.75) return { label: "da controllare", color: WARN, bg: WARN_BG };
  return { label: "probabile buco", color: CP.accentRed, bg: alpha(CP.accentRed, "18") };
}

export default function InflowwReconcilePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  async function load(pid = periodId) {
    setLoading(true); setError(null); setData(null); // mai numeri del mese vecchio sotto il selettore nuovo
    try {
      const res = await fetch(`/api/admin/infloww-reconcile?period_id=${pid}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(periodId); /* eslint-disable-next-line */ }, [periodId]);

  // Abbinamento manuale: collega un profilo Infloww a un alias CP (o scollega).
  async function saveOverride(inflowwId, inflowwName, cpAlias) {
    try {
      const res = await fetch("/api/admin/infloww-reconcile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infloww_id: inflowwId, infloww_name: inflowwName, cp_alias: cpAlias }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      load(); // ricalcola col nuovo abbinamento
    } catch (e) { setError(e.message); }
  }

  // Righe abbinate ordinate: peggiori in cima (il problema si vede subito)
  const rows = useMemo(() => {
    return [...(data?.matched || [])].sort((a, b) => {
      const ra = a.ratio_cp_over_gross ?? 99, rb = b.ratio_cp_over_gross ?? 99;
      return ra - rb;
    });
  }, [data]);
  // Profili Infloww che incassano ma non hanno NESSUNA traccia CP nel mese:
  // il caso peggiore (buco totale). Mai nasconderli.
  const noCp = useMemo(() => (data?.unmatched_infloww || []).filter((u) => u.gross >= NO_CP_MIN_GROSS), [data]);
  const noCpGross = noCp.reduce((s, u) => s + u.gross, 0);
  const holes = rows.filter((r) => r.ratio_cp_over_gross != null && r.ratio_cp_over_gross < 0.75);
  const holesGap = holes.reduce((s, r) => s + Math.max(0, r.gap_gross), 0);
  const agencyRatio = data?.agency?.ratio_cp_over_infgross_matched;
  const matchCov = data?.match_coverage;

  const hasData = data && !data.needs_sync;

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX). Problemi trovati:
  // (1) sul mese in corso con sync Infloww vecchio (79 giorni) diceva "Infloww
  // non copre questo mese … conserva fino a 60 giorni": la causa vera era il sync
  // fermo, e l'azione giusta (sincronizzare) era nascosta dietro una spiegazione
  // sbagliata; (2) il numero che risponde alla domanda ("CP è completo?") era
  // una card tra cinque; (3) sei paragrafi di "come si legge" prima dei dati.
  const periodLabel = periods.find((p) => p.value === periodId)?.label || periodId;
  const monthStartTs = periodId ? new Date(`${periodId}-01T00:00:00`).getTime() : null;
  const syncBeforeMonth = data?.last_sync_at != null && monthStartTs != null && data.last_sync_at < monthStartTs;
  const verdictColor = agencyRatio == null ? CP.textPrimary : agencyRatio < 0.75 ? CP.accentRed : agencyRatio >= 0.9 && agencyRatio <= 1.1 ? CP.accentGreen : CP.textPrimary;
  const third = data?.third_source?.available;

  const tableRows = hasData ? [
    ...noCp.map((u) => ({ ...u, kind: "nocp", id: `nocp:${u.id}` })),
    ...rows.map((mm) => ({ ...mm, kind: "match", id: `m:${mm.infloww_id}` })),
  ] : [];

  const socialTip = (mm) => (mm.social_gross_eq == null
    ? "Questo alias non compare nell'analytics CP per il periodo."
    : mm.social_vs_infloww == null
    ? "Dato Infloww troncato su questa riga: confronto non affidabile, mostro solo il valore analytics (lordo stimato)."
    : (mm.social_vs_infloww >= 0.85 && mm.social_vs_infloww <= 1.15
      ? "Le due fonti indipendenti sono coerenti (±15%): buon segnale che l'incasso reale sia quello mostrato."
      : mm.social_vs_infloww > 1.15
      ? "L'analytics CP vede più di Infloww (↑): può indicare un account non collegato a Infloww o un ritardo di sync — da verificare."
      : "L'analytics CP vede meno di Infloww (↓): può indicare un account non collegato all'analytics o un ritardo di sync — da verificare."));

  const columns = [
    { key: "esito", label: "Esito", sort: (r) => (r.kind === "nocp" ? -1 : (r.ratio_cp_over_gross ?? 99)), render: (r) => {
      if (r.kind === "nocp") return <Badge color={CP.accentRed} bg={alpha(CP.accentRed, "18")} tip="Nel MODULO TURNI/BUSTE di CP questo mese non ha né turni né vendite. Come talent può comunque esistere in CP (Social Analytics). Se sai il suo alias turni, collegala dal riquadro 'non abbinati'.">senza turni in CP</Badge>;
      const h = health(r);
      return <Badge color={h.color} bg={h.bg} tip={h.tip}>{h.label}</Badge>;
    } },
    { key: "name", label: "Creator", sort: (r) => (r.kind === "nocp" ? r.name : r.cp_alias), render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(r.kind === "nocp" ? r.name : r.cp_alias), flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{r.kind === "nocp" ? r.name : r.cp_alias}</span>
        {r.kind === "match" && r.infloww_name !== r.cp_alias && <span style={{ fontSize: 12, color: CP.textMuted }}>↔ {r.infloww_name}</span>}
        {r.kind === "match" && r.manual && (
          <span style={{ fontSize: 12, color: CP.accentSoftText, background: CP.accentSoft, padding: "1px 7px", borderRadius: 999 }} title="Abbinamento impostato a mano">
            manuale
            <button onClick={() => saveOverride(r.infloww_id, r.infloww_name, null)} title="Rimuovi abbinamento manuale" aria-label="Rimuovi abbinamento manuale"
              style={{ marginLeft: 5, background: "none", border: "none", color: CP.accentSoftText, cursor: "pointer", padding: 0, fontSize: 12 }}>×</button>
          </span>
        )}
        {r.truncated && <span title="Dato Infloww troncato (volume altissimo): lordo sottostimato" style={{ fontSize: 12, color: CP.textMuted }}>troncato</span>}
      </span>
    ) },
    { key: "gross", label: "Incasso reale", align: "right", muted: true, sort: (r) => (r.kind === "nocp" ? r.gross : r.infloww_gross), render: (r) => fmt$(r.kind === "nocp" ? r.gross : r.infloww_gross) },
    ...(third ? [{ key: "social", label: "Controprova", align: "right", muted: true, sort: (r) => (r.kind === "nocp" ? r.social?.gross_eq : r.social_gross_eq) ?? null, render: (r) => {
      if (r.kind === "nocp") return (
        <span title={r.social ? `L'analytics CP la conosce (talent "${r.social.talent}"): conferma indipendente che la revenue esiste. NB: il valore è il totale della PERSONA su tutti i suoi account (lordo stimato), non del singolo profilo.` : "Non trovata nemmeno nell'analytics CP per questo periodo."} style={{ whiteSpace: "nowrap" }}>
          {r.social ? <>≈{fmt$(r.social.gross_eq)} <span style={{ fontSize: 11, color: CP.textMuted }}>persona</span></> : "—"}
        </span>
      );
      if (r.social_gross_eq == null) return <span title={socialTip(r)}>—</span>;
      const agree = r.social_vs_infloww != null && r.social_vs_infloww >= 0.85 && r.social_vs_infloww <= 1.15;
      return (
        <span title={socialTip(r)} style={{ whiteSpace: "nowrap" }}>
          {r.social_vs_infloww != null && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 6, background: agree ? CP.accentGreen : CP.accentSoftText }} />}
          ≈{fmt$(r.social_gross_eq)}
          {r.social_vs_infloww != null && (r.social_vs_infloww > 1.15 ? " ↑" : r.social_vs_infloww < 0.85 ? " ↓" : "")}
        </span>
      );
    } }] : []),
    { key: "cp", label: "Registrato CP", align: "right", sort: (r) => (r.kind === "nocp" ? 0 : r.cp_sales), render: (r) => (r.kind === "nocp" ? <span style={{ color: CP.accentRed }}>$0</span> : fmt$(r.cp_sales)) },
    { key: "ratio", label: "Cattura", align: "right", sort: (r) => (r.kind === "nocp" ? -1 : (r.ratio_cp_over_gross ?? 99)), render: (r) => {
      if (r.kind === "nocp") return <span style={{ color: CP.accentRed, fontWeight: 500 }}>0%</span>;
      const h = health(r);
      return <span style={{ color: h.color, fontWeight: 500 }}>{r.ratio_cp_over_gross != null ? `${Math.round(r.ratio_cp_over_gross * 100)}%` : "—"}</span>;
    } },
    { key: "missing", label: "Mancante", align: "right", sort: (r) => (r.kind === "nocp" ? r.gross : Math.max(0, r.gap_gross)), render: (r) => {
      if (r.kind === "nocp") return <span style={{ color: CP.accentRed }}>{fmt$(r.gross)}</span>;
      const missing = Math.max(0, r.gap_gross);
      const isBad = r.ratio_cp_over_gross != null && r.ratio_cp_over_gross < 0.9;
      return <span style={{ color: isBad && missing > 0 ? CP.accentRed : CP.textMuted }}>{missing > 0 ? fmt$(missing) : "—"}</span>;
    } },
    { key: "go", label: "", sortable: false, render: (r) => (
      <span style={{ display: "inline-flex", gap: 12, whiteSpace: "nowrap" }}>
        {r.kind === "match" && (
          <Link href={`/admin/attribution-drilldown?${new URLSearchParams({ alias: r.cp_alias, period_id: data.period_id, infloww_id: r.infloww_id })}`} style={detailLink}
            title="Drill-down turni: chi non ha registrato i takes, giorno per giorno (con CSV per il backfill)">
            Turni <ArrowRight size={12} />
          </Link>
        )}
        <Link href={`/admin/infloww-revenue?creatorId=${encodeURIComponent(r.kind === "nocp" ? r.id.slice(5) : r.infloww_id)}`} style={detailLink}>
          Incassi <ArrowRight size={12} />
        </Link>
      </span>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Controllo dati CP" }]}
        title="Controllo dati CP"
        subtitle="Il venduto registrato in CreatorsPro è completo? Per ogni creator lo confrontiamo con l'incasso reale su Infloww negli stessi giorni: se CP registra molto meno, c'è un buco da sistemare prima che finisca in buste, P&L e classifiche."
        actions={<>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...ctl, minWidth: 190, cursor: "pointer" }} aria-label="Mese">
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </>}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: CP.textMuted, marginBottom: 14 }}>
        {data?.last_sync_at != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={14} /> Dati Infloww aggiornati {fmtAgo(data.last_sync_at)} ·{" "}
            <Link href="/admin/infloww-agency" style={{ color: CP.accentSoftText, textDecoration: "none" }}>aggiorna da Revenue agency</Link>
          </span>
        )}
        {loading && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.textSecondary }}><Loader2 size={14} className="animate-spin" /> Confronto le due fonti…</span>}
      </div>

      {error && <Notice danger>Qualcosa non ha funzionato: {error}</Notice>}

      {/* Stati "manca una delle due fonti" — mai un verdetto su dati inesistenti */}
      {data?.needs_sync === "infloww" && (
        <section style={{ ...card, padding: "22px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>
            Nessun verdetto per {periodLabel}: manca il dato Infloww
          </div>
          <div style={{ fontSize: 14, color: CP.textSecondary, maxWidth: 640, lineHeight: 1.55, marginBottom: 14 }}>
            {syncBeforeMonth
              ? <>L&apos;ultimo sync Infloww è di {fmtAgo(data.last_sync_at)}, prima dell&apos;inizio del mese: per questo mese non c&apos;è ancora nessun giorno da confrontare. Sincronizza da Revenue agency (qualche minuto), poi torna qui.</>
              : data.reason === "month_out_of_coverage"
              ? "Il sync Infloww conserva solo gli ultimi 60 giorni circa: per questo mese non ci sono giorni sincronizzati, quindi non posso dire se i dati CP sono completi."
              : "Per confrontare serve prima sincronizzare la revenue reale da Infloww."}
            {" "}Nessun verdetto non vuol dire che è tutto a posto.
          </div>
          <Link href="/admin/infloww-agency" style={btnLink}><RefreshCw size={14} /> Vai a Revenue agency e sincronizza</Link>
        </section>
      )}
      {data?.needs_sync === "cp" && (
        <section style={{ ...card, padding: "22px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>Nessun verdetto per {periodLabel}: manca il dato CP</div>
          <div style={{ fontSize: 14, color: CP.textSecondary, maxWidth: 600, lineHeight: 1.55, marginBottom: 14 }}>
            Le buste di {periodLabel} non sono in archivio: sincronizza il mese da Sync &amp; Audit CP, poi torna qui.
          </div>
          <Link href="/admin/wage-audit" style={btnLink}><RefreshCw size={14} /> Vai a Sync &amp; Audit CP</Link>
        </section>
      )}

      {hasData && (
        <>
          {/* SENTINELLA PARSER: se scatta, i numeri CP sotto non sono affidabili */}
          {data.data_quality?.parser_warning && (
            <Notice danger>
              <span style={{ color: CP.textPrimary }}>Non fidarti dei numeri “Registrato CP” qui sotto.</span> Il sistema legge solo il {Math.round((data.data_quality.parse_rate || 0) * 100)}% delle vendite grezze nelle buste (su {data.data_quality.takes_raw.toLocaleString("it-IT")}): probabile cambio di formato lato CreatorsPro, come a luglio 2026. Va aggiornata la lettura prima di usare questa pagina — verifica con <code>/api/admin/cp-wage-raw-probe</code>.
            </Notice>
          )}

          <HeroMetric
            label={`Quanto del venduto reale è registrato in CP · ${periodLabel}`}
            value={agencyRatio != null ? <span style={{ color: verdictColor }}>{Math.round(agencyRatio * 100)}%</span> : "—"}
            compare={`CP registra ${fmt$(data.agency.matched_cp_sales)} su ${fmt$(data.agency.matched_infloww_gross)} incassati davvero (stesse creator, stessi giorni) · sano tra 95% e 100%`}
            hint={`Confronto sui giorni ${fmtDayIt(data.coverage_from)} → ${fmtDayIt(data.coverage_to)}, gli stessi su entrambe le fonti${data.coverage_partial ? " (copertura parziale del mese)" : ""}.`}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Probabili buchi" value={fmtInt(holes.length + noCp.length)} danger={holes.length + noCp.length > 0}
                note={holes.length + noCp.length === 0 ? "nessuna creator sotto il 75%" : `≈ ${fmt$(holesGap + noCpGross)} non registrati`} />
              <Metric label="Creator abbinate" value={matchCov?.profiles != null ? `${Math.round(matchCov.profiles * 100)}%` : "—"}
                note={`${data.counts.matched} di ${data.counts.infloww_active} profili · ${matchCov?.gross_share != null ? Math.round(matchCov.gross_share * 100) : "—"}% dell'incasso · obiettivo 100%`} />
              {third && <Metric label="Controprova analytics CP" value={`${data.third_source.agree} di ${data.third_source.compared}`} note="righe dove conferma Infloww" />}
            </div>
          </HeroMetric>

          {data.coverage_partial && <Notice>Copertura parziale: il confronto vale solo per i giorni {fmtDayIt(data.coverage_from)} → {fmtDayIt(data.coverage_to)}. I turni CP fuori da questa finestra sono esclusi.</Notice>}

          {/* DA SISTEMARE: tutte le incongruenze rilevate, in un'unica lista azionabile */}
          {(() => {
            const unattrib = rows.filter((r) => r.cp_sales === 0 && (r.cp_shifts || 0) > 0);
            const infIncompleti = rows.filter((r) => r.social_vs_infloww != null && r.social_vs_infloww > 1.25);
            const troncate = rows.filter((r) => r.truncated);
            const items = [
              holes.length > 0 && { severity: "critical", title: `${holes.length} probabili buchi di registrazione (≈ ${fmt$(holesGap)} mancanti)`, detail: "righe “probabile buco” in tabella → apri “Turni” per vedere chi non ha registrato le vendite" },
              unattrib.length > 0 && { severity: "critical", title: `${unattrib.length} creator con turni ma nessuna vendita attribuita`, detail: "le vendite (takes) vanno registrate in CP" },
              noCp.length > 0 && { severity: "critical", title: `${noCp.length} creator che incassano ma senza turni in CP (≈ ${fmt$(noCpGross)})`, detail: "configurare turni e creator in CP, o collegarle qui sotto se hanno un altro nome" },
              infIncompleti.length > 0 && { severity: "warning", title: `${infIncompleti.length} account dove l'analytics CP vede più di Infloww`, detail: "verificare che l'account sia collegato a Infloww" },
              (data.unmatched_infloww.length + data.unmatched_cp.length) > 0 && { severity: "warning", title: `${data.unmatched_infloww.length + data.unmatched_cp.length} profili non abbinati tra le due piattaforme`, detail: "usa “collega a…” nella sezione in fondo" },
              data.failed_creators?.length > 0 && { severity: "critical", title: `${data.failed_creators.length} creator non sincronizzate da Infloww`, detail: "i loro numeri possono mancare: rilancia il sync da Revenue agency" },
              troncate.length > 0 && { severity: "warning", title: `${troncate.length} righe con dato Infloww troncato`, detail: "incasso sottostimato su volumi altissimi" },
            ].filter(Boolean);
            if (items.length === 0) {
              return (
                <section style={{ ...card, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: CP.textSecondary }}>
                  <CheckCircle2 size={16} color={CP.accentGreen} /> Nessuna incongruenza per questo mese: le due fonti si trovano.
                </section>
              );
            }
            return (
              <section style={{ ...card, marginBottom: 18, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px 10px" }}>
                  <SectionTitle aside={`${items.length} ${items.length === 1 ? "incongruenza" : "incongruenze"}`}>Da sistemare</SectionTitle>
                </div>
                {items.map((it, i) => <ActionRow key={i} severity={it.severity} title={it.title} detail={it.detail} />)}
              </section>
            );
          })()}

          <SectionTitle aside="le peggiori in cima · clicca le colonne per riordinare">Creator a confronto</SectionTitle>
          <DataTable columns={columns} rows={tableRows} defaultSort={{ key: "ratio", dir: 1 }} minWidth={third ? 1060 : 940} maxHeight={640} empty="Nessuna creator abbinata per questo mese." />
          {data.agency.cp_unattributed > 0 && (
            <div style={{ padding: "8px 2px", fontSize: 12, color: CP.textMuted }}>
              ≈ {fmt$(data.agency.cp_unattributed)} di venduto CP non attribuibile a una creator specifica (turni su più creator senza dettaglio): esclusi dai rapporti, non dai totali CP.
            </div>
          )}

          {/* Non abbinati */}
          {(data.unmatched_infloww.length > 0 || data.unmatched_cp.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 18, marginBottom: 14 }}>
              <section style={{ ...card, padding: "16px 18px" }}>
                <SectionTitle aside={`${data.unmatched_infloww.length}`}>Su Infloww ma non abbinati</SectionTitle>
                <div style={{ fontSize: 13, color: CP.textMuted, margin: "-4px 0 10px", lineHeight: 1.5 }}>
                  Incassano su Infloww ma non ho trovato con certezza il loro nome in CP. Se sai chi sono (per esempio un nome d&apos;arte diverso), collegali qui: l&apos;abbinamento resta salvato.
                </div>
                {data.unmatched_infloww.map((u) => (
                  <div key={u.id} style={{ ...unmRow, alignItems: "center" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ color: CP.textSecondary, ...NUM }}>{fmt$(u.gross)}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) saveOverride(u.id, u.name, e.target.value); }}
                        style={{ ...ctl, padding: "4px 8px", fontSize: 13, maxWidth: 200, cursor: "pointer" }}
                        title="Collega manualmente a un alias CP (qualsiasi alias del mese, anche senza vendite)"
                        aria-label={`Collega ${u.name} a un alias CP`}
                      >
                        <option value="">collega a…</option>
                        {(data.unmatched_cp || []).map((c) => (
                          <option key={c.alias} value={c.alias}>
                            {c.alias}{c.shifts ? ` · ${c.shifts} turni` : ""}{c.sales ? ` · ${fmt$(c.sales)}` : ""}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
                {data.unmatched_infloww.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuno.</div>}
              </section>
              <section style={{ ...card, padding: "16px 18px" }}>
                <SectionTitle aside={`${data.unmatched_cp.length}`}>In CP ma non abbinati</SectionTitle>
                <div style={{ fontSize: 13, color: CP.textMuted, margin: "-4px 0 10px" }}>Hanno venduto in CP ma non ho trovato con certezza il loro profilo Infloww.</div>
                {data.unmatched_cp.map((u) => (
                  <div key={u.alias} style={unmRow}>
                    <span>
                      {u.alias}
                      {u.talent && <span style={{ fontSize: 12, color: CP.textMuted }}> · talent: {u.talent}</span>}
                    </span>
                    <span style={{ color: CP.textSecondary, ...NUM }}>{fmt$(u.sales)}</span>
                  </div>
                ))}
                {data.unmatched_cp.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuno.</div>}
              </section>
            </div>
          )}
        </>
      )}

      <div style={{ height: 8 }} />
      <Disclosure open={howOpen} onToggle={() => setHowOpen((v) => !v)} title="Come si legge questa pagina" summary="cattura, esiti, controprova">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
          <li>Ogni riga confronta due fonti sugli stessi giorni: quanto CP dice che una creator ha venduto, e quanto ha incassato davvero (lordo Infloww).</li>
          <li>Cattura = registrato in CP ÷ incasso reale. Vicino al 100% = CP completo (ok). Tra 75% e 90% manca qualcosa (da controllare). Sotto il 75% = probabile buco: turni o vendite non registrati. Sopra il 115% è anomalo quanto sotto.</li>
          <li>Qualche punto sotto il 100% è normale: gli abbonamenti (1-2% del lordo) non passano dagli operatori. È un allarme che indica la direzione, non un confronto contabile.</li>
          <li>“Vendite non attribuite” = la creator ha turni in CP ma nessuna vendita a suo nome: vanno registrate le vendite (takes). “Senza turni in CP” = nel modulo turni/buste non c&apos;è traccia nel mese: se conosci il suo nome in CP, collegala con “collega a…”.</li>
          <li>Controprova = la revenue vista dal modulo Social Analytics di CP, una terza fonte indipendente, stimata al lordo (netto ÷ 0,80, per questo c&apos;è il ≈). Pallino verde = coerente con Infloww (±15%). “Infloww incompleto?” = l&apos;analytics vede molto più di Infloww: l&apos;account potrebbe essere scollegato da Infloww.</li>
          <li>I “non abbinati” in fondo sono profili che non ho saputo accoppiare con certezza: guardali a mano prima di trarre conclusioni.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

function Badge({ color, bg, tip, children }) {
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 500, color, background: bg, whiteSpace: "nowrap" }} title={tip || ""}>{children}</span>;
}

const unmRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 13 };
const btnLink = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: "none" };
const detailLink = { display: "inline-flex", alignItems: "center", gap: 4, color: CP.accentSoftText, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" };
const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
