"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, FlaskConical, Plus, X, RotateCcw } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import CompNav from "@/components/CompNav";
import { PageHead, HeroMetric, Metric, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";
import { fmt$, fmtSigned$, fmtInt, fmtPct as fmtPctIt, MONTHS_IT } from "@/lib/format";
import HowToRead from "@/components/HowToRead";

/**
 * /admin/profiles-compare — Scaglioni a confronto cross-creator.
 * Una riga per creator: scaglioni applicati, venduto, costo operatori
 * attribuito, % costo, mismatch. Per la conversazione di standardizzazione
 * dei profili pagamento. Click → griglia calendario del creator.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * numero principale = % del venduto pagata agli operatori (il confronto che la
 * pagina serve a fare), tabella ordinabile dalle intestazioni (sostituisce il
 * bottone "Ordina per"), simulatore chiuso di default come nel Calendario,
 * numeri in formato it-IT unico. Contenuti del 26/09 invariati: legenda
 * scaglioni a un solo colore, "Fuori scaglione N su M".
 */

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const fmtPct = (v, d = 1) => fmtPctIt(v, d);
// Scala sequenziale su UN colore (DESIGN.md: un solo accento): più scuro = % più alta.
// Prima arcobaleno rosso/arancio/verde/blu senza legenda: l'arancione sembrava un allarme.
const TIER_ALPHA = ["14", "26", "40", "5c", "80"];

// Formula BRACKET su intero importo (confermata dalla ricerca shift-research)
function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage !== "" && t.percentage != null);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let winning = sorted[0];
  for (const t of sorted) if ((Number(t.threshold) || 0) <= total) winning = t;
  return Number(winning.percentage);
}

export default function ProfilesComparePage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSim, setShowSim] = useState(false);
  const [simThs, setSimThs] = useState(null); // null = simulatore spento

  async function run(pid = periodId) {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/admin/profiles-compare?period_id=${pid}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // auto-load al mount e al cambio mese
  useEffect(() => { run(periodId); /* eslint-disable-next-line */ }, [periodId]);


  // Scala colori comune: tutte le % di scaglione distinte del mese
  const pctScale = useMemo(() => {
    if (!data?.creators) return [];
    const s = new Set();
    for (const c of data.creators) for (const t of c.thresholds || []) if (t.percentage != null) s.add(t.percentage);
    return [...s].sort((a, b) => a - b);
  }, [data]);
  const chipStyle = (pct, big) => {
    const i = pctScale.indexOf(pct);
    const a = i >= 0 ? TIER_ALPHA[Math.min(Math.round((i / Math.max(1, pctScale.length - 1)) * (TIER_ALPHA.length - 1)), TIER_ALPHA.length - 1)] : "10";
    return { padding: big ? "2px 7px" : "1px 6px", borderRadius: 4, background: alpha(CP.scale, a), border: `1px solid ${alpha(CP.scale, "40")}`, color: CP.textPrimary, fontSize: big ? 12 : 11.5, fontWeight: 500, whiteSpace: "nowrap", ...NUM };
  };

  const missingPhaseB = data ? data.creators_count - data.phase_b_coverage : 0;
  const noProfiles = (data?.creators || []).filter((c) => (!c.profiles || c.profiles.length === 0) && (c.thresholds || []).length === 0).map((c) => c.alias);

  // Simulazione: profilo standard applicato a TUTTI i creator
  const sim = useMemo(() => {
    if (!data?.creators || !simThs?.length) return null;
    const valid = simThs.filter((t) => t.percentage !== "" && t.percentage != null);
    if (valid.length === 0) return null;
    const perCreator = {};
    let totSim = 0;
    for (const c of data.creators) {
      let s = 0;
      for (const [total, onCreator] of c.shift_pairs || []) {
        const pct = bracketPct(total, valid);
        if (pct != null) s += pct * onCreator;
      }
      perCreator[c.alias] = Math.round(s);
      totSim += s;
    }
    return {
      perCreator,
      total: Math.round(totSim),
      delta: Math.round(totSim - data.totals.earn_attr),
    };
  }, [data, simThs]);

  const costAvg = data && data.totals.sales > 0 ? data.totals.earn_attr / data.totals.sales : null;
  const costs = (data?.creators || []).map((c) => c.cost_pct).filter((v) => v != null);
  const minCost = costs.length ? Math.min(...costs) : null;
  const maxCost = costs.length ? Math.max(...costs) : null;
  const withMismatch = (data?.creators || []).filter((c) => c.mismatches > 0).length;

  const columns = data ? [
    { key: "alias", label: "Creator", render: (c) => <span style={{ fontWeight: 500 }}>{c.alias}</span> },
    { key: "thresholds", label: "Scaglioni", sortable: false, render: (c) => (
      (!c.profiles || c.profiles.length === 0) && c.thresholds.length === 0 ? (
        <span style={{ color: CP.textMuted, fontSize: 12 }}>da risincronizzare</span>
      ) : c.profiles && c.profiles.length > 0 ? (
        // Inventario completo: una riga per profilo (Solo/Coppia/Triplo
        // hanno set propri — niente più "un solo profilo per creator")
        <div style={{ display: "flex", flexDirection: "column" }}>
          {c.profiles.map((p, pi, all) => (
            <div key={p.name} title={`${p.name} · ${p.shifts} turni`} style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", padding: "3px 0", borderTop: pi ? `1px dashed ${CP.borderSoft}` : "none" }}>
              <span style={{ fontSize: 12, color: CP.textMuted, minWidth: 48 }}>
                {p.cosellers_count === 1 ? "da solo" : p.cosellers_count === 2 ? "in 2" : p.cosellers_count != null ? `in ${p.cosellers_count}` : "?"}
              </span>
              {(p.thresholds || []).map((t, i) => (
                <span key={i} style={chipStyle(t.percentage)}>
                  {t.threshold > 0 ? `≥${fmt$(t.threshold)}` : "base"}→{fmtPct(t.percentage, 0)}
                </span>
              ))}
              {/* più profili per la stessa squadra (es. due "da solo"): il nome li distingue, sennò sembrano doppioni */}
              {all.filter((x) => x.cosellers_count === p.cosellers_count).length > 1 && (
                <span style={{ fontSize: 12, color: CP.textMuted }}>{p.name} · {p.shifts} turni</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {c.thresholds.map((t, i) => (
            <span key={i} style={chipStyle(t.percentage, true)}>
              {t.threshold > 0 ? `≥${fmt$(t.threshold)}` : "base"}→{fmtPct(t.percentage, 0)}
            </span>
          ))}
        </div>
      )
    ) },
    { key: "sales", label: "Venduto", align: "right", render: (c) => fmt$(c.sales) },
    { key: "earn_attr", label: "Pagato", align: "right", render: (c) => fmt$(c.earn_attr) },
    { key: "cost_pct", label: "% costo", align: "right", render: (c) => <span style={{ fontWeight: 500 }}>{fmtPct(c.cost_pct)}</span> },
    ...(sim ? [
      { key: "sim", label: "Simulato", align: "right", sort: (c) => sim.perCreator?.[c.alias] ?? null, render: (c) => (sim.perCreator?.[c.alias] != null ? fmt$(sim.perCreator[c.alias]) : "—") },
      { key: "simd", label: "Differenza", align: "right", sort: (c) => (sim.perCreator?.[c.alias] != null ? sim.perCreator[c.alias] - c.earn_attr : null), render: (c) => {
        const simPaid = sim.perCreator?.[c.alias];
        const delta = simPaid != null ? simPaid - c.earn_attr : null;
        return <span style={{ fontWeight: 500, color: delta == null || Math.abs(delta) < 1 ? CP.textMuted : delta > 0 ? CP.accentRed : CP.accentGreen }}>{delta == null ? "—" : Math.abs(delta) < 1 ? "=" : fmtSigned$(delta)}</span>;
      } },
    ] : []),
    { key: "shifts", label: "Turni", align: "right", muted: true, render: (c) => fmtInt(c.shifts) },
    { key: "operators_count", label: "Operatori", align: "right", muted: true, render: (c) => fmtInt(c.operators_count) },
    { key: "mismatches", label: "Fuori scaglione", align: "right", sort: (c) => (c.checked > 0 ? c.mismatches : null), render: (c) => (
      <span title={c.checked > 0 ? (c.mismatches > 0 ? `${c.mismatches} turni su ${c.checked} controllati pagati con una % diversa dallo scaglione: apri il Calendario per vederli` : `Tutti i ${c.checked} turni controllati rispettano gli scaglioni`) : "Nessun turno controllabile (scaglioni mancanti)"}
        style={{ fontWeight: 500, color: c.mismatches > 0 ? CP.accentRed : CP.textMuted }}>
        {c.checked > 0 ? (c.mismatches > 0
          ? <Link href={`/admin/comp-calendar?creator=${encodeURIComponent(c.alias)}&period_id=${data.period_id}`} style={{ color: CP.accentRed }}>{c.mismatches} su {c.checked}</Link>
          : "✓") : "—"}
      </span>
    ) },
    { key: "go", label: "", sortable: false, render: (c) => (
      <Link href={`/admin/comp-calendar?creator=${encodeURIComponent(c.alias)}&period_id=${data.period_id}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>
        Calendario <ArrowRight size={12} />
      </Link>
    ) },
  ] : [];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Scaglioni a confronto" }]}
        title="Scaglioni a confronto"
        subtitle="Tutte le creator affiancate: scaglioni applicati, quanto sono costati gli operatori e quanto pesa quel costo sul venduto. Serve a decidere quali profili di pagamento uniformare."
        actions={<>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={{ ...input, minWidth: 170, cursor: "pointer" }}>
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: CP.textSecondary, alignSelf: "center" }} />}
        </>}
      />

      <CompNav />

      <HowToRead items={[
        "In cima: quanto del venduto va agli operatori, in media e tra la creator più bassa e la più alta.",
        "Una riga per creator: i suoi scaglioni reali, quanto ha venduto, quanto sono costati gli operatori e quanto pesa quel costo sul venduto (% costo).",
        "Nella colonna Scaglioni vedi più righe per creator: “da solo” è il profilo per chi lavora da solo, “in 2” in coppia, “in 3” in tre. Ogni configurazione ha le sue soglie.",
        "Fuori scaglione: ✓ = i pagamenti del mese rispettano gli scaglioni. “3 su 120” in rosso = 3 turni pagati con una % diversa, da verificare nel Calendario.",
        "Il confronto da fare: la colonna “% costo” tra creator simili (clicca l'intestazione per ordinare). Differenze grandi = profili da rivedere.",
        "Il link Calendario apre il dettaglio giorno per giorno di quella creator.",
      ]} />

      {error && <Notice danger>Non riesco a caricare il mese: {error}</Notice>}
      {loading && !data && <div style={{ ...card, padding: "18px 20px", color: CP.textSecondary, fontSize: 14 }}>Carico gli scaglioni di tutte le creator…</div>}
      {data && data.creators_count === 0 && <Notice>Nessuna creator con turni in questo mese. Se il mese è appena chiuso, la sincronizzazione con CreatorsPro potrebbe non essere finita: prova il mese prima o controlla in <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync e controllo CP</Link>.</Notice>}

      {data && data.creators_count > 0 && (
        <>
          <HeroMetric
            label="Pagato agli operatori sul venduto · media di tutte le creator"
            value={costAvg != null ? fmtPct(costAvg) : "—"}
            compare={minCost != null ? `da ${fmtPct(minCost)} a ${fmtPct(maxCost)} tra le creator` : null}
            hint={withMismatch ? `${withMismatch} creator con turni pagati fuori scaglione: controllali nel Calendario.` : "Tutti i turni controllati rispettano gli scaglioni."}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Venduto" value={fmt$(data.totals.sales)} />
              <Metric label="Pagato agli operatori" value={fmt$(data.totals.earn_attr)} />
              <Metric label="Creator nel mese" value={fmtInt(data.creators_count)} />
            </div>
          </HeroMetric>

          {missingPhaseB > 0 && (
            <Notice>
              {missingPhaseB === 1 ? "1 creator non ha" : `${missingPhaseB} creator non hanno`} gli scaglioni del mese
              {noProfiles.length ? `: ${noProfiles.join(", ")}` : ""}. Si recuperano ri-sincronizzando il mese da <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Sync e controllo CP</Link>.
            </Notice>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: CP.textSecondary, marginBottom: 8 }}>
            <span>Scaglioni: <span style={{ fontWeight: 500 }}>da solo / in 2 / in 3</span> = profilo per chi lavora da solo o in squadra; <span style={chipStyle(pctScale[0], true)}>base→%</span> fino a <span style={chipStyle(pctScale[pctScale.length - 1], true)}>≥$→%</span> = più scuro, percentuale più alta</span>
            <span>Pagato = compenso dei turni attribuito a quella creator</span>
            <span>Fuori scaglione: turni pagati con una % diversa da quella prevista (✓ = tutti in regola)</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <DataTable columns={columns} rows={data.creators.map((c) => ({ ...c, id: c.alias }))} defaultSort={{ key: "sales", dir: -1 }} minWidth={sim ? 1180 : 1000} maxHeight={720} />
          </div>

          {/* Simulatore profilo STANDARD su tutti i creator — chiuso di default */}
          <Disclosure open={showSim || !!simThs} onToggle={() => setShowSim(!showSim)} icon={<FlaskConical size={15} />}
            title="Simulatore: e se tutte le creator avessero gli stessi scaglioni?"
            summary={sim ? `Con gli scaglioni provati: ${fmtSigned$(sim.delta)} agli operatori in un mese` : "Applica un solo set di scaglioni a tutti i turni di tutte le creator"}>
            <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 12 }}>
              Scenario “scaglioni unici”: applica UN solo set di scaglioni a TUTTI i turni, da solo, in coppia e in tre.
              Per provare scaglioni diversi per profilo su una sola creator usa il simulatore nel suo Calendario.
            </div>
            {!simThs ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: CP.textSecondary }}>Parti dagli scaglioni di una creator e applicali a tutte:</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const c = data.creators.find((x) => x.alias === e.target.value);
                    if (c?.thresholds?.length) setSimThs(c.thresholds.map((t) => ({ threshold: t.threshold ?? 0, percentage: t.percentage ?? 0 })));
                  }}
                  style={{ ...input, minWidth: 240, cursor: "pointer" }}
                >
                  <option value="">Scegli gli scaglioni di partenza</option>
                  {data.creators.filter((c) => c.thresholds.length > 0).map((c) => (
                    <option key={c.alias} value={c.alias}>
                      {c.alias} ({c.thresholds.map((t) => fmtPct(t.percentage, 0)).join("/")})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                  {simThs.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                      <div>
                        <label style={lbl}>{i === 0 ? "Base (da $)" : `Soglia ${i + 1} (da $)`}</label>
                        <input
                          type="number" value={t.threshold} disabled={i === 0}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, threshold: e.target.value === "" ? "" : Number(e.target.value) } : x))}
                          style={{ ...input, width: 96, opacity: i === 0 ? 0.5 : 1 }}
                        />
                      </div>
                      <div>
                        <label style={lbl}>%</label>
                        <input
                          type="number" step="0.5"
                          value={t.percentage === "" ? "" : Math.round(Number(t.percentage) * 1000) / 10}
                          onChange={(e) => setSimThs(simThs.map((x, j) => j === i ? { ...x, percentage: e.target.value === "" ? "" : Number(e.target.value) / 100 } : x))}
                          style={{ ...input, width: 68 }}
                        />
                      </div>
                      {i > 0 && (
                        <button onClick={() => setSimThs(simThs.filter((_, j) => j !== i))} aria-label="Togli scaglione" style={iconBtn}><X size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setSimThs([...simThs, { threshold: (Number(simThs[simThs.length - 1]?.threshold) || 0) + 500, percentage: (Number(simThs[simThs.length - 1]?.percentage) || 0.1) + 0.02 }])}
                    aria-label="Aggiungi scaglione" style={iconBtn}
                  ><Plus size={13} /></button>
                  <button onClick={() => { setSimThs(null); setShowSim(false); }} title="Spegni simulatore" style={{ ...iconBtn, color: CP.textSecondary, gap: 6, fontSize: 13, fontFamily: FONTS.body }}><RotateCcw size={13} /> Spegni</button>
                </div>
                {sim && (
                  <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                    <Metric label="Pagato oggi (tutte)" value={fmt$(data.totals.earn_attr)} />
                    <Metric label="Pagato simulato" value={fmt$(sim.total)} />
                    <Metric
                      label="Differenza"
                      value={fmtSigned$(sim.delta)}
                      danger={sim.delta > 0}
                      note={data.totals.earn_attr > 0 ? `${sim.delta >= 0 ? "+" : "−"}${Math.abs(100 * sim.delta / data.totals.earn_attr).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% · circa ${fmtSigned$(sim.delta * 12)} in un anno` : null}
                    />
                    <Metric label="% costo simulata" value={data.totals.sales > 0 ? fmtPct(sim.total / data.totals.sales) : "—"} note={`oggi ${data.totals.sales > 0 ? fmtPct(data.totals.earn_attr / data.totals.sales) : "—"}`} />
                  </div>
                )}
                {sim && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Nella tabella sopra compaiono le colonne “Simulato” e “Differenza” per ogni creator.</div>}
              </>
            )}
          </Disclosure>
        </>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: CP.textSecondary, fontWeight: 500, marginBottom: 6 };
const input = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const iconBtn = { padding: "9px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, cursor: "pointer", display: "inline-flex", alignItems: "center" };
