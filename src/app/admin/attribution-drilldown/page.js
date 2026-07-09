"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Download, ClipboardList } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel } from "@/components/cp-style";
import HowToRead from "@/components/HowToRead";

/**
 * /admin/attribution-drilldown — Recupero takes: la lista NOMINALE dei turni
 * senza vendite attribuite per una creator. Da girare al team lead per il
 * backfill in CP: chi, quando, quanto ha venduto il turno, quanto manca.
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 13) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " · in corso" : ""}` });
  }
  return out;
}
const fmtDay = (iso) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };

export default function AttributionDrilldownPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [alias, setAlias] = useState("");
  const [inflowwId, setInflowwId] = useState("");
  const [aliases, setAliases] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Preselect da query (?alias=&period_id=&infloww_id=) — arrivo dal Controllo dati CP
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("period_id")) setPeriodId(q.get("period_id"));
    if (q.get("alias")) setAlias(q.get("alias"));
    if (q.get("infloww_id")) setInflowwId(q.get("infloww_id") || "");
  }, []);

  // Alias disponibili per il mese (per il selettore)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/creator-aliases?period_id=${periodId}`);
        const j = await r.json();
        setAliases(j.aliases || []);
      } catch { setAliases([]); }
    })();
  }, [periodId]);

  async function load() {
    if (!alias) return;
    setLoading(true); setError(null); setData(null);
    try {
      const qs = new URLSearchParams({ period_id: periodId, alias });
      if (inflowwId) qs.set("infloww_id", inflowwId);
      const r = await fetch(`/api/admin/attribution-drilldown?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [alias, periodId, inflowwId]);

  const t = data?.totals;
  const maxDayVal = useMemo(() => Math.max(1, ...(data?.days || []).map((d) => Math.max(d.infloww_gross || 0, d.cp_mine || 0))), [data]);
  const csvHref = alias ? `/api/admin/attribution-drilldown?${new URLSearchParams({ period_id: periodId, alias, format: "csv", ...(inflowwId ? { infloww_id: inflowwId } : {}) })}` : null;

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/admin/infloww-reconcile" style={{ color: "inherit", textDecoration: "none" }}>Controllo dati CP</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Recupero takes</span>
          </div>
        }
        section="Data · Controllo qualità"
        title="Recupero takes"
        subtitle="La lista nominale per chiudere i buchi: per ogni turno della creator vedi chi c'era, quanto ha venduto il team e quanto è stato attribuito. I turni 'senza takes' sono quelli da recuperare in CP — scarica il CSV e giralo al team lead."
        toolbar={csvHref && data ? (
          <a href={csvHref} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
            <Download size={14} /> CSV per il team lead
          </a>
        ) : null}
      />

      <HowToRead items={[
        "Ogni riga è un turno che ha coinvolto questa creator: chi era l'operatore, quanto ha venduto il turno in totale, quanto è stato attribuito a LEI (takes), quanto ad altre creator del team, e quanto non è stato attribuito a nessuno.",
        "'SENZA TAKES' = il turno ha venduto ma a questa creator risulta $0: è lì che si recupera, registrando i takes in CP (anche retroattivamente).",
        "Il confronto per giorno con l'incasso reale Infloww ti dice QUANDO mancano i pezzi: i giorni col gap più grosso sono i primi da sistemare.",
        "'Chi deve registrare' ordina gli operatori per turni senza takes: è la lista delle conversazioni da fare, non una classifica di colpa — spesso è il processo del team, non la singola persona.",
        "IL flusso: scarica il CSV → il team lead verifica e registra i takes in CP → risincronizza da Sync & Audit → il Controllo dati CP misura il recupero.",
      ]} />

      {/* Controlli */}
      <CpCard padding="14px 18px" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mese</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 180, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Creator (alias turni)</label>
            <select value={alias} onChange={(e) => { setAlias(e.target.value); setInflowwId(""); }} style={{ ...input, minWidth: 240, cursor: "pointer" }}>
              <option value="" style={{ background: CP.surface }}>scegli…</option>
              {aliases.map((a) => <option key={a.alias} value={a.alias} style={{ background: CP.surface }}>{a.alias} · {a.shifts} turni</option>)}
            </select>
          </div>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, marginBottom: 10 }} />}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 18 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {!alias && !error && (
        <div style={{ padding: "50px 20px", textAlign: "center", color: CP.textMuted, fontSize: 14 }}>
          Scegli una creator (o arriva qui dal Controllo dati CP con il link "Turni").
        </div>
      )}

      {data && (
        <>
          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Incasso reale (Infloww)" value={fmt$(t.infloww_gross)} sub={t.infloww_gross == null ? "profilo non collegato" : "lordo, giorni del mese"} />
            <StatCard label="Attribuito a lei (takes)" value={fmt$(t.attributed_mine)} color={t.attributed_mine > 0 ? CP.textPrimary : CP.accentRed} sub={`${t.shifts} turni nel mese`} />
            <StatCard label="Turni senza takes" value={t.shifts_no_takes} color={t.shifts_no_takes > 0 ? CP.accentRed : CP.accentGreen} sub="da recuperare in CP" />
            <StatCard label="Non attribuito (team)" value={fmt$(t.unattributed_pool)} color={t.unattributed_pool > 0 ? "#F59E0B" : CP.textMuted} sub="venduto dei suoi turni senza takes di nessuno" tooltip="Somma, sui turni che la coinvolgono, del venduto che non è stato attribuito a NESSUNA creator del team." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
            {/* Giorni */}
            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 12 }}>Quando mancano i pezzi (per giorno)</SectionLabel>
              {(data.days || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun giorno nel mese.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {data.days.map((d) => (
                    <div key={d.day} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", fontSize: 12 }}>
                      <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtDay(d.day)}</span>
                      <div style={{ position: "relative", height: 14, background: CP.borderSoft, borderRadius: 4, overflow: "hidden" }}
                        title={`${d.day}: reale ${fmt$(d.infloww_gross)} · attribuito ${fmt$(d.cp_mine)}${d.gap != null ? ` · gap ${fmt$(d.gap)}` : ""} · ${d.shifts} turni (${d.shifts_no_takes} senza takes)`}>
                        {d.infloww_gross != null && (
                          <div style={{ position: "absolute", inset: 0, width: `${(d.infloww_gross / maxDayVal) * 100}%`, background: CP.accentRed + "55", borderRadius: 4 }} />
                        )}
                        <div style={{ position: "absolute", inset: 0, width: `${((d.cp_mine || 0) / maxDayVal) * 100}%`, background: CP.accent, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontFamily: FONTS.mono, color: d.gap > 0 ? CP.accentRed : CP.textMuted, minWidth: 76, textAlign: "right" }}>
                        {d.gap != null ? (d.gap > 0 ? `−${fmt$(d.gap).slice(1)}` : "ok") : `${d.shifts} turni`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 10.5, color: CP.textMuted }}>
                barra viola = attribuito a lei · sfondo rosso = incasso reale Infloww · il numero a destra è il gap del giorno
              </div>
            </CpCard>

            {/* Operatori */}
            <CpCard padding="16px 18px">
              <SectionLabel style={{ marginBottom: 4 }}><ClipboardList size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />Chi deve registrare</SectionLabel>
              <div style={{ fontSize: 11, color: CP.textMuted, marginBottom: 12 }}>operatori ordinati per turni senza takes — lista di conversazioni, non di colpe</div>
              {(data.operators || []).map((o) => (
                <div key={o.operator} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 12.5 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.operator}</span>
                  <span style={{ fontFamily: FONTS.mono, whiteSpace: "nowrap", color: o.shifts_no_takes > 0 ? CP.accentRed : CP.textMuted }}>
                    {o.shifts_no_takes}/{o.shifts} senza takes
                  </span>
                </div>
              ))}
            </CpCard>
          </div>

          {/* Turni */}
          <CpCard padding="0" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${CP.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel>Turni ({data.shifts.length}) — quelli rossi sono da recuperare</SectionLabel>
              {csvHref && <a href={csvHref} style={{ fontSize: 11.5, color: CP.accentSoftText, textDecoration: "none" }}><Download size={12} style={{ verticalAlign: "-2px" }} /> CSV</a>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                    <th style={th}>Data</th>
                    <th style={th}>Orario</th>
                    <th style={th}>Operatore</th>
                    <th style={th}>Team</th>
                    <th style={{ ...th, textAlign: "right" }}>Venduto turno</th>
                    <th style={{ ...th, textAlign: "right" }}>A lei</th>
                    <th style={{ ...th, textAlign: "right" }}>Ad altre</th>
                    <th style={{ ...th, textAlign: "right" }}>Non attribuito</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shifts.map((s, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${CP.border}55`, background: s.no_takes ? CP.accentRed + "0A" : "transparent" }}>
                      <td style={{ ...td, fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmtDay(s.day)}</td>
                      <td style={{ ...td, fontFamily: FONTS.mono, color: CP.textMuted }}>{s.start}{s.end ? `–${s.end}` : ""}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{s.operator}</td>
                      <td style={{ ...td, color: CP.textMuted, fontSize: 11 }}>
                        {s.team.length === 0 ? "solo lei" : s.team.map((a) => (
                          <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: creatorDotColor(a), display: "inline-block" }} />{a.replace(/\s*-\s*\w+$/, "")}
                          </span>
                        ))}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono }}>{fmt$(s.total_shift)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, fontWeight: 600, color: s.no_takes ? CP.accentRed : CP.accentGreen }}>{fmt$(s.mine)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: CP.textSecondary }}>{fmt$(s.others)}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: FONTS.mono, color: s.unattributed > 0 ? "#F59E0B" : CP.textMuted }}>{s.unattributed > 0 ? fmt$(s.unattributed) : "—"}</td>
                    </tr>
                  ))}
                  {data.shifts.length === 0 && (
                    <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: CP.textMuted, padding: 26 }}>Nessun turno per questa creator nel mese.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CpCard>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: 0.6, fontFamily: FONTS.mono, whiteSpace: "nowrap" };
const td = { padding: "8px 12px", verticalAlign: "middle" };
