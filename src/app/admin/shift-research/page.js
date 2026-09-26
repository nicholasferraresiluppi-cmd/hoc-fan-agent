"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Download, Loader2, FlaskConical } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, SectionTitle, FilterChip, DataTable, Notice, card, NUM } from "@/components/ds";
import { fmt$, fmtPct, fmtPts, fmtInt } from "@/lib/format";
import CompNav from "@/components/CompNav";

/**
 * /admin/shift-research — Ricerca one-shot per il match turno ↔ profilo pagamento.
 * Risponde a 3 domande su un creator × mese, direttamente dal RAW CP API:
 *  Q1: il raw shift contiene il payment profile applicato? campo?
 *  Q2: formula scaglioni: bracket su intero importo o cumulativa?
 *  Q3: dataset completo turni (per ricostruire il foglio stile Scheda Gaja)
 *
 * Redesign 26/09/2026 (pannello tester PAY/BOARD/UX): "Q1/Q2/Q3", "RAW CP API",
 * "Eff %", "Δ", "MONO", "Fase B" erano gergo da sviluppatore → domande scritte
 * per intero, colonne in parole; le righe con differenza tra % pagata e %
 * attesa si isolano con un filtro invece di un fondo rosso su tutta la riga.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const pct1 = (v) => fmtPct(v, 1);
const isMismatch = (r) => r.delta_pct != null && Math.abs(r.delta_pct) > 0.005;

export default function ShiftResearchPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [creator, setCreator] = useState("Giulia Ottorini");
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  async function run() {
    if (!creator.trim() || !periodId) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/admin/shift-research?creator=${encodeURIComponent(creator.trim())}&period_id=${periodId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const rows = (data?.rows || []).map((r, i) => ({ ...r, id: r.shift_id || i }));
  const diffRows = rows.filter(isMismatch);
  const shown = onlyDiff ? diffRows : rows;

  const columns = [
    { key: "date", label: "Data", render: (r) => <span style={NUM}>{r.date}</span> },
    { key: "start", label: "Orario", muted: true, render: (r) => <span style={NUM}>{r.start}–{r.end}</span> },
    { key: "operator", label: "Operatore" },
    { key: "sales_on_creator", label: "Venduto sul creator", align: "right", render: (r) => fmt$(r.sales_on_creator) },
    { key: "sales_total_shift", label: "Venduto nel turno (tutti i creator)", align: "right", muted: true, render: (r) => fmt$(r.sales_total_shift) },
    { key: "earnings", label: "Guadagno operatore", align: "right", render: (r) => fmt$(r.earnings) },
    { key: "eff_pct", label: "% pagata", align: "right", render: (r) => <span style={{ fontWeight: 500 }}>{pct1(r.eff_pct)}</span> },
    { key: "profile_name", label: "Profilo di pagamento", render: (r) => (r.profile_name ? <span title={`co-venditori: ${r.profile_cosellers ?? "?"}`}>{r.profile_name}</span> : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "expected_pct", label: "% attesa dal profilo", align: "right", muted: true, render: (r) => pct1(r.expected_pct) },
    {
      key: "delta_pct", label: "Differenza", align: "right", sort: (r) => (r.delta_pct == null ? null : Math.abs(r.delta_pct)),
      render: (r) => r.delta_pct == null ? <span style={{ color: CP.textMuted }}>—</span>
        : isMismatch(r) ? <span style={{ color: CP.accentRed, fontWeight: 500 }}>{fmtPts(r.delta_pct)}</span>
        : <span style={{ color: CP.textMuted }}>coincide</span>,
    },
    { key: "mono", label: "Tipo di turno", muted: true, sort: (r) => (r.mono ? 1 : r.creators_in_shift || 0), render: (r) => (r.mono ? "solo questo creator" : `${r.creators_in_shift} creator`) },
  ];

  const fieldCols = [
    { key: "path", label: "Campo nel dato del turno", render: (f) => <span style={{ fontWeight: 500 }}>{f.path}</span> },
    { key: "count", label: "Quante volte", align: "right" },
    { key: "distinct_values", label: "Valori diversi", align: "right" },
    { key: "examples", label: "Esempi", sortable: false, muted: true, render: (f) => (
      <span style={{ display: "inline-block", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, verticalAlign: "bottom" }}>
        {f.examples.map((e) => (typeof e === "object" ? JSON.stringify(e) : String(e))).join(" · ")}
      </span>
    ) },
  ];

  const pb = data?.phase_b;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Shift Research" }]}
        title="Shift Research: turni e profili di pagamento"
        subtitle="Per un creator e un mese, legge i turni direttamente da CreatorsPro e verifica se la percentuale pagata a ogni operatore coincide con il suo profilo di pagamento. Serve a controllare i compensi e a ricostruire il foglio di calcolo (CSV)."
      />

      <CompNav />

      <div style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ ...lbl, flex: 1, minWidth: 220 }}>
            Creator (nome del gruppo in CreatorsPro)
            <input value={creator} onChange={(e) => setCreator(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} style={input} />
          </label>
          <label style={lbl}>
            Mese
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 160, cursor: "pointer" }}>
              {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <button onClick={run} disabled={loading || !creator.trim()} style={primaryBtn(loading || !creator.trim())}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> Ricerca…</> : <><FlaskConical size={14} /> Avvia ricerca</>}
          </button>
          {data?.csv_url && (
            <a href={data.csv_url} style={{ ...primaryBtn(false), background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, textDecoration: "none" }}>
              <Download size={14} /> Scarica CSV
            </a>
          )}
        </div>
      </div>

      {error && <Notice danger>{error}</Notice>}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textMuted, fontSize: 14, margin: "8px 0 16px" }}>
          <Loader2 size={16} className="animate-spin" /> Scarico i turni del mese da CreatorsPro (20-40 secondi)…
        </div>
      )}

      {!data && !loading && !error && (
        <Notice>Scrivi il nome del creator come compare in CreatorsPro, scegli il mese e premi &quot;Avvia ricerca&quot;. La ricerca legge i dati di un solo mese e non modifica niente.</Notice>
      )}

      {data && (
        <>
          <div style={{ ...card, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Creator (gruppo CreatorsPro)" value={data.creator} />
            <Metric label="Buste paga analizzate" value={fmtInt(data.wages_count)} />
            <Metric label="Turni totali" value={fmtInt(data.shifts_count)} />
            <Metric label="Turni su un solo creator" value={fmtInt(data.q2_mono_shifts_analyzed)} note="base della domanda 2" />
          </div>

          {/* Q1 */}
          <SectionTitle>1 · Il dato del turno dice quale profilo di pagamento è stato applicato?</SectionTitle>
          <div style={{ marginBottom: 22 }}>
            {!data.q1_profile_fields || data.q1_profile_fields.length === 0 ? (
              <Notice danger>
                No: nel dettaglio turni non c&apos;è nessun campo su profilo, pagamento o scaglione. Il profilo applicato non è esposto qui: servirà un&apos;altra fonte di CreatorsPro.
              </Notice>
            ) : (
              <>
                <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>
                  Sì: {data.q1_profile_fields.length} {data.q1_profile_fields.length === 1 ? "campo trovato" : "campi trovati"}.
                </div>
                <DataTable columns={fieldCols} rows={data.q1_profile_fields.map((f) => ({ ...f, id: f.path }))} minWidth={700} />
              </>
            )}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: CP.textSecondary, fontSize: 13 }}>
                Dato grezzo completo del primo turno ({(data.q1_sample_raw_shift_keys || []).length} campi)
              </summary>
              <div style={{ fontSize: 12, color: CP.textMuted, margin: "6px 0" }}>Campi: {(data.q1_sample_raw_shift_keys || []).join(", ")}</div>
              <pre style={{ marginTop: 6, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto", color: CP.textSecondary }}>
                {JSON.stringify(data.q1_sample_raw_shift, null, 2)}
              </pre>
            </details>
          </div>

          {/* Q2 */}
          <SectionTitle aside="percentuale sull'intero venduto o a fasce, come le tasse">2 · Come calcola gli scaglioni CreatorsPro?</SectionTitle>
          <div style={{ ...card, padding: "14px 18px", marginBottom: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>{data.q2_verdict}</div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Percentuali effettive più frequenti sui turni a creator singolo</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(data.q2_eff_pct_distribution || []).slice(0, 12).map((b) => (
                <div key={b.eff_pct} style={{ padding: "5px 10px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 12, color: CP.textSecondary, ...NUM }}>
                  <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{pct1(b.eff_pct)}</span> × {b.count} turni
                </div>
              ))}
            </div>
          </div>

          {/* Fase B status */}
          {pb?.needs_resync && (
            <Notice>
              I turni salvati non hanno ancora il profilo di pagamento (sono stati sincronizzati prima che lo leggessimo). Rifai la sincronizzazione
              di questo mese da <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync &amp; Audit CP</Link> per riempire le
              colonne Profilo, % attesa e Differenza.
            </Notice>
          )}
          {pb && !pb.needs_resync && pb.rows_with_profile > 0 && (
            <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 12, ...NUM }}>
              Profilo di pagamento presente su <strong style={{ fontWeight: 500, color: CP.textPrimary }}>{pb.rows_with_profile} turni su {pb.rows_total}</strong>
              {" · "}percentuale pagata diversa da quella attesa:{" "}
              <strong style={{ fontWeight: 500, color: pb.mismatches > 0 ? CP.accentRed : CP.textPrimary }}>{pb.mismatches}</strong>
            </div>
          )}

          {/* Q3 */}
          <SectionTitle aside="ordinabili: clic sulle intestazioni">3 · Tutti i turni del mese ({rows.length})</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Tutti (${rows.length})`} active={!onlyDiff} onClick={() => setOnlyDiff(false)} />
            <FilterChip label={`% diversa dall'attesa (${diffRows.length})`} danger={diffRows.length > 0} active={onlyDiff} onClick={() => setOnlyDiff(true)} disabled={!diffRows.length} />
          </div>
          <DataTable
            columns={columns}
            rows={shown}
            minWidth={1200}
            maxHeight={560}
            empty={onlyDiff ? "Nessun turno con percentuale diversa dall'attesa." : "Nessun turno nel mese per questo creator."}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            % pagata = guadagno dell&apos;operatore ÷ venduto sul creator. Differenza = % pagata meno % attesa dal profilo, in punti; sotto mezzo punto
            la consideriamo uguale.
          </div>
        </>
      )}
    </div>
  );
}

const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: CP.textMuted };
const input = { width: "100%", padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "10px 18px",
  background: disabled ? CP.surfaceAlt : CP.accent,
  color: disabled ? CP.textMuted : CP.accentInk,
  border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 500, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
