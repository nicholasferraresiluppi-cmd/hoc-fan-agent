"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel } from "@/components/cp-style";
import HowToRead from "@/components/HowToRead";

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
function relTime(ts) {
  if (!ts) return "mai";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

// Semaforo sul rapporto CP/lordo-reale. Tolleranza fisiologica: gli
// abbonamenti (~1-2%) non passano dagli operatori.
function health(ratio) {
  if (ratio == null) return { label: "n/d", color: CP.textMuted, bg: "transparent" };
  if (ratio > 1.15) return { label: "anomalo", color: "#F59E0B", bg: "#F59E0B18" };
  if (ratio >= 0.9) return { label: "ok", color: CP.accentGreen, bg: CP.accentGreen + "18" };
  if (ratio >= 0.75) return { label: "da controllare", color: "#F59E0B", bg: "#F59E0B18" };
  return { label: "probabile buco", color: CP.accentRed, bg: CP.accentRed + "18" };
}

export default function InflowwReconcilePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  // Profili Infloww che incassano ma non hanno NESSUN dato CP abbinato:
  // il caso peggiore (buco totale) o un alias non riconosciuto. Mai nasconderli.
  const noCp = useMemo(() => (data?.unmatched_infloww || []).filter((u) => u.gross >= NO_CP_MIN_GROSS), [data]);
  const noCpGross = noCp.reduce((s, u) => s + u.gross, 0);
  const holes = rows.filter((r) => r.ratio_cp_over_gross != null && r.ratio_cp_over_gross < 0.75);
  const holesGap = holes.reduce((s, r) => s + Math.max(0, r.gap_gross), 0);
  const agencyRatio = data?.agency?.ratio_cp_over_infgross_matched;
  const ratioColor = agencyRatio == null ? CP.textMuted
    : agencyRatio >= 0.9 && agencyRatio <= 1.1 ? CP.accentGreen
    : agencyRatio < 0.75 ? CP.accentRed
    : "#F59E0B";

  const hasData = data && !data.needs_sync;

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Controllo dati CP</span>
          </div>
        }
        section="Data · Controllo qualità"
        title="Controllo dati CP"
        subtitle="Il venduto registrato in CreatorsPro è completo? Per ogni creator lo confrontiamo con l'incasso reale (lordo) da Infloww, una fonte indipendente, sugli stessi giorni. Se CP registra molto meno del reale, lì c'è un buco nei dati — e lo vedi prima che inquini buste, P&L e classifiche."
        toolbar={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: CP.accentSoftText, fontFamily: FONTS.mono }}>
            <ShieldCheck size={13} /> guardiano dati
          </span>
        }
      />

      <HowToRead items={[
        "Ogni riga confronta due fonti sugli stessi giorni: quanto CP dice che una creator ha venduto, e quanto ha incassato DAVVERO (lordo Infloww).",
        "Rapporto ≈ 1.0 = CP completo (verde). Sotto 0.90 qualcosa manca (giallo). Sotto 0.75 = probabile buco: turni o vendite non registrati in CP (rosso).",
        "'Vendite non attribuite' = la creator ESISTE in CP e ha turni, ma nessuna vendita è registrata a suo nome (team multi-creator senza takes): l'azione è far registrare i takes. 'Assente in CP' = non trovo proprio il suo alias nei turni del mese.",
        "Qualche punto sotto 1.0 è fisiologico: gli abbonamenti (~1-2% del lordo) non passano dagli operatori. È un allarme direzionale, non un confronto contabile.",
        "I 'non abbinati' in fondo sono profili che non ho saputo accoppiare con certezza tra le due piattaforme: guardali a mano prima di trarre conclusioni.",
      ]} />

      {/* Controlli + freshness */}
      <CpCard padding="14px 18px" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 190, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          {data?.last_sync_at != null && (
            <span style={{ fontSize: 11, color: CP.textMuted, paddingBottom: 10 }}>
              dati Infloww: sync {relTime(data.last_sync_at)} ·{" "}
              <Link href="/admin/infloww-agency" style={{ color: CP.accentSoftText, textDecoration: "none" }}>aggiorna →</Link>
            </span>
          )}
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginBottom: 10 }} />}
        </div>
      </CpCard>

      {/* Banner copertura: SEMPRE esplicito su quali giorni stiamo confrontando */}
      {hasData && (
        <CpCard accent={data.coverage_partial ? "#F59E0B" : undefined} padding="10px 16px" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: data.coverage_partial ? "#F59E0B" : CP.textSecondary }}>
            {data.coverage_partial ? "⚠ Copertura parziale: " : ""}
            confronto sui giorni <b>{fmtDayIt(data.coverage_from)} → {fmtDayIt(data.coverage_to)}</b>, gli stessi su entrambe le fonti (gli shift CP fuori da questa finestra sono esclusi).
            {data.failed_creators?.length > 0 && (
              <span style={{ color: CP.accentRed }}> · ⚠ {data.failed_creators.length} creator non sincronizzate nell'ultimo sync Infloww: i loro numeri possono mancare.</span>
            )}
          </div>
        </CpCard>
      )}

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {/* Stati "manca una delle due fonti" — mai un verdetto su dati inesistenti */}
      {data?.needs_sync === "infloww" && (
        <CpCard padding="30px" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
            {data.reason === "month_out_of_coverage" ? "Infloww non copre questo mese" : "Manca il dato Infloww"}
          </div>
          <div style={{ fontSize: 13, color: CP.textMuted, maxWidth: 500, margin: "0 auto 16px" }}>
            {data.reason === "month_out_of_coverage"
              ? "Il sync Infloww conserva una finestra recente (fino a 60 giorni): per questo mese non ci sono giorni sincronizzati, quindi NON posso dire se i dati CP sono completi o no. Nessun verdetto ≠ tutto ok."
              : "Per confrontare serve prima sincronizzare la revenue reale da Infloww."}
          </div>
          <Link href="/admin/infloww-agency" style={btnLink}><RefreshCw size={13} /> Vai a Revenue agency e sincronizza</Link>
        </CpCard>
      )}
      {data?.needs_sync === "cp" && (
        <CpCard padding="30px" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Manca il dato CP per questo mese</div>
          <div style={{ fontSize: 13, color: CP.textMuted, maxWidth: 460, margin: "0 auto 16px" }}>
            Le buste di {periods.find((p) => p.value === periodId)?.label || periodId} non sono in archivio: sincronizza il mese da Sync & Audit CP.
          </div>
          <Link href="/admin/wage-audit" style={btnLink}><RefreshCw size={13} /> Vai a Sync & Audit CP</Link>
        </CpCard>
      )}

      {hasData && (
        <>
          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Incasso reale (lordo Infloww)" value={fmt$(data.agency.matched_infloww_gross)} sub={`${data.counts.matched} creator abbinate`} />
            <StatCard label="Venduto registrato in CP" value={fmt$(data.agency.matched_cp_sales)} sub="stesse creator, stessi giorni" />
            <StatCard
              label="Quanto cattura CP"
              value={agencyRatio != null ? `${Math.round(agencyRatio * 100)}%` : "—"}
              color={ratioColor}
              sub="del venduto reale (sano ≈ 95-100%)"
              tooltip="Venduto CP ÷ lordo Infloww, sulle sole creator abbinate. Sopra il 110% è anomalo quanto sotto il 90%."
            />
            <StatCard
              label="Probabili buchi"
              value={holes.length + noCp.length}
              color={holes.length + noCp.length > 0 ? CP.accentRed : CP.accentGreen}
              sub={
                holes.length + noCp.length === 0
                  ? "nessuna creator sotto il 75%"
                  : `${holes.length} sotto il 75%${noCp.length ? ` + ${noCp.length} senza CP` : ""} · ≈ ${fmt$(holesGap + noCpGross)} non registrati`
              }
            />
          </div>

          {/* Tabella creator, peggiori in cima; in testa gli "assente in CP" */}
          <CpCard padding="0" style={{ overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${CP.border}` }}>
              <SectionLabel>Creator a confronto — peggiori in cima</SectionLabel>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={th}>Esito</th>
                    <th style={th}>Creator</th>
                    <th style={{ ...th, textAlign: "right" }}>Incasso reale</th>
                    <th style={{ ...th, textAlign: "right" }}>Registrato CP</th>
                    <th style={{ ...th, textAlign: "right" }}>Cattura</th>
                    <th style={{ ...th, textAlign: "right" }}>Mancante</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {noCp.map((u) => (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${CP.border}55`, background: CP.accentRed + "08" }}>
                      <td style={td}>
                        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, color: CP.accentRed, background: CP.accentRed + "18", whiteSpace: "nowrap" }}
                          title={u.cp_presence ? `Esiste in CP (${u.cp_presence.shifts} turni come "${u.cp_presence.alias}") ma nessuna vendita è attribuita a lei: takes non registrati.` : "Nessun alias CP riconducibile a lei nei turni del mese."}>
                          {u.cp_presence ? "vendite non attribuite" : "assente in CP"}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(u.cp_presence?.alias || u.name), flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{u.cp_presence?.alias || u.name}</span>
                          {u.cp_presence && u.cp_presence.alias !== u.name && (
                            <span style={{ fontSize: 10.5, color: CP.textMuted, fontFamily: FONTS.mono }}>↔ {u.name}</span>
                          )}
                          {u.cp_presence && (
                            <span style={{ fontSize: 10.5, color: CP.textMuted }}>({u.cp_presence.shifts} turni, $0 attribuiti)</span>
                          )}
                          {u.truncated && <span title="Dato Infloww troncato (volume altissimo): lordo sottostimato" style={{ color: "#F59E0B" }}>⚠</span>}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(u.gross)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentRed }}>$0</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 600, color: CP.accentRed }}>0%</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.accentRed }}>{fmt$(u.gross)}</td>
                      <td style={td}>
                        <Link href={`/admin/infloww-revenue?creatorId=${encodeURIComponent(u.id)}`} style={detailBtn}>
                          Dettaglio <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {rows.map((mm) => {
                    const h = health(mm.ratio_cp_over_gross);
                    const missing = Math.max(0, mm.gap_gross);
                    const isBad = mm.ratio_cp_over_gross != null && mm.ratio_cp_over_gross < 0.9;
                    return (
                      <tr key={mm.infloww_id} style={{ borderBottom: `1px solid ${CP.border}55` }}>
                        <td style={td}>
                          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, color: h.color, background: h.bg, whiteSpace: "nowrap" }}>
                            {h.label}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: creatorDotColor(mm.cp_alias), flexShrink: 0 }} />
                            <span style={{ fontWeight: 500 }}>{mm.cp_alias}</span>
                            {mm.infloww_name !== mm.cp_alias && (
                              <span style={{ fontSize: 10.5, color: CP.textMuted, fontFamily: FONTS.mono }}>↔ {mm.infloww_name}</span>
                            )}
                            {mm.manual && (
                              <span style={{ fontSize: 10, color: CP.accentSoftText, background: CP.accentSoft, padding: "2px 7px", borderRadius: 999 }} title="Abbinamento impostato a mano">
                                manuale
                                <button onClick={() => saveOverride(mm.infloww_id, mm.infloww_name, null)} title="Rimuovi abbinamento manuale"
                                  style={{ marginLeft: 5, background: "none", border: "none", color: CP.accentSoftText, cursor: "pointer", padding: 0, fontSize: 11 }}>×</button>
                              </span>
                            )}
                            {mm.truncated && <span title="Dato Infloww troncato (volume altissimo): lordo sottostimato" style={{ color: "#F59E0B" }}>⚠</span>}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(mm.infloww_gross)}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(mm.cp_sales)}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 600, color: h.color }}>
                          {mm.ratio_cp_over_gross != null ? `${Math.round(mm.ratio_cp_over_gross * 100)}%` : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: isBad && missing > 0 ? CP.accentRed : CP.textMuted }}>
                          {missing > 0 ? fmt$(missing) : "—"}
                        </td>
                        <td style={td}>
                          <Link href={`/admin/infloww-revenue?creatorId=${encodeURIComponent(mm.infloww_id)}`} style={detailBtn}>
                            Dettaglio <ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && noCp.length === 0 && (
                    <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: CP.textMuted, padding: 26 }}>Nessuna creator abbinata per questo mese.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.agency.cp_unattributed > 0 && (
              <div style={{ padding: "10px 18px", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 11.5, color: CP.textMuted }}>
                ≈ {fmt$(data.agency.cp_unattributed)} di venduto CP non attribuibile a una creator specifica (turni multi-creator senza dettaglio): esclusi dai rapporti, non dai totali CP.
              </div>
            )}
          </CpCard>

          {/* Non abbinati */}
          {(data.unmatched_infloww.length > 0 || data.unmatched_cp.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <CpCard padding="16px 18px">
                <SectionLabel style={{ marginBottom: 4 }}>Su Infloww ma non abbinati ({data.unmatched_infloww.length})</SectionLabel>
                <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 12 }}>
                  Incassano su Infloww ma non ho trovato con certezza il loro alias CP. Se TU sai chi sono (es. nome d&apos;arte diverso), collegali qui: l&apos;abbinamento resta salvato per sempre.
                </div>
                {data.unmatched_infloww.map((u) => (
                  <div key={u.id} style={{ ...unmRow, alignItems: "center" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(u.gross)}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) saveOverride(u.id, u.name, e.target.value); }}
                        style={{ ...input, padding: "4px 8px", fontSize: 11, maxWidth: 180, cursor: "pointer" }}
                        title="Collega manualmente a un alias CP"
                      >
                        <option value="" style={{ background: CP.surface }}>collega a…</option>
                        {(data.unmatched_cp || []).map((c) => (
                          <option key={c.alias} value={c.alias} style={{ background: CP.surface }}>{c.alias}</option>
                        ))}
                        {(u.cp_presence && !(data.unmatched_cp || []).some((c) => c.alias === u.cp_presence.alias)) && (
                          <option value={u.cp_presence.alias} style={{ background: CP.surface }}>{u.cp_presence.alias}</option>
                        )}
                      </select>
                    </span>
                  </div>
                ))}
                {data.unmatched_infloww.length === 0 && <div style={{ fontSize: 12, color: CP.textMuted }}>Nessuno.</div>}
              </CpCard>
              <CpCard padding="16px 18px">
                <SectionLabel style={{ marginBottom: 4 }}>In CP ma non abbinati ({data.unmatched_cp.length})</SectionLabel>
                <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 12 }}>Hanno venduto in CP ma non ho trovato con certezza il loro profilo Infloww.</div>
                {data.unmatched_cp.map((u) => (
                  <div key={u.alias} style={unmRow}>
                    <span>{u.alias}</span>
                    <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(u.sales)}</span>
                  </div>
                ))}
                {data.unmatched_cp.length === 0 && <div style={{ fontSize: 12, color: CP.textMuted }}>Nessuno.</div>}
              </CpCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" };
const td = { padding: "9px 12px", verticalAlign: "middle" };
const unmRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 12.5 };
const btnLink = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none" };
const detailBtn = { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 5, color: CP.accentSoftText, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" };
