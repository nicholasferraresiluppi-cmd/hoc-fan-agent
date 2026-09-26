"use client";

/**
 * /admin/comp-review — Coppie operatore × creator pagate fuori dalla media.
 * Tutte le creator insieme, ordinate per $ in gioco. Clic su una riga →
 * turni uno per uno sotto la tabella; "Esame creator" per la vista completa.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * - UN numero in cima (coppie fuori media) con le due direzioni e l'impatto
 *   netto spiegato a parole (prima "$-1317" in verde: sembrava un guadagno);
 * - "Impatto" = pagato − venduto × media del team: detto in chiaro;
 * - direzione come filtro a chip, creator/operatori ricorrenti come chip;
 * - colori: rosso solo per "molto fuori media"; niente verde/oro/blu decorativi;
 * - dettaglio turni sotto la tabella (pattern Calendario compensi).
 * API, parametri e calcoli invariati.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, TrendingUp, TrendingDown, Loader2, X, AlertTriangle } from "lucide-react";
import { CP, FONTS, DATA_SCALE } from "@/lib/brand";
import { useTheme } from "@/lib/theme-client";
import CompNav from "@/components/CompNav";
import { fmt$, fmtSigned$, fmtInt, fmtPct, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const pct1 = (v) => fmtPct(v, 1);
const monthName = (pid) => (pid ? `${MONTHS_IT[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : "");
const FEW_SHIFTS = 5; // sotto: la % del mese dipende da pochi turni
const INTERVAL_IT = { Morning: "Mattino", Afternoon: "Pomeriggio", Evening: "Sera", Night: "Notte" };

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function CompReviewPage() {
  const [theme] = useTheme();
  const S = DATA_SCALE[theme] || DATA_SCALE.light;
  const periods = useMemo(() => monthOpts(12), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [direction, setDirection] = useState("all");
  const [minSales, setMinSales] = useState(200);
  const [minShifts, setMinShifts] = useState(2);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [sel, setSel] = useState(null); // { creator, operator }
  const detailRef = useRef(null);

  const url = periodId
    ? `/api/admin/comp-review?period_id=${periodId}&direction=${direction}&min_sales=${minSales}&min_shifts=${minShifts}&limit=200`
    : null;

  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });

  const filteredAnomalies = useMemo(() => {
    if (!data?.anomalies) return [];
    return data.anomalies.filter((a) => {
      if (creatorFilter && !a.creator_alias.toLowerCase().includes(creatorFilter.toLowerCase())) return false;
      if (operatorFilter && !a.operator.toLowerCase().includes(operatorFilter.toLowerCase())) return false;
      return true;
    });
  }, [data, creatorFilter, operatorFilter]);

  // TUTTE le creator analizzate (anche con 0 anomalie): nel menu si vede che
  // esistono ma non hanno anomalie nel mese
  const allCreatorsAnalyzed = data?.all_creators_analyzed || [];
  const selRow = sel ? filteredAnomalies.find((a) => a.creator_alias === sel.creator && a.operator === sel.operator) : null;
  useEffect(() => { setSel(null); }, [periodId, direction, minSales, minShifts]);
  useEffect(() => { if (selRow && detailRef.current) detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selRow]);

  const s = data?.summary;
  const net = s?.net_impact_usd ?? 0;

  const columns = [
    { key: "creator_alias", label: "Creator" },
    { key: "operator", label: "Operatore" },
    { key: "shifts", label: "Turni", align: "right", render: (a) => (
      <span>{a.shifts.toLocaleString("it-IT", { maximumFractionDigits: 1 })}{a.shifts < FEW_SHIFTS && <div style={{ fontSize: 11, color: CP.textMuted }}>pochi turni</div>}</span>
    ) },
    { key: "sales", label: "Venduto", align: "right", render: (a) => fmt$(a.sales) },
    { key: "earnings", label: "Pagato", align: "right", render: (a) => fmt$(a.earnings) },
    { key: "effective_pct", label: "% incassata", align: "right", render: (a) => <span style={{ fontWeight: 500 }}>{pct1(a.effective_pct)}</span> },
    { key: "team_avg_pct", label: "Media team", align: "right", muted: true, render: (a) => pct1(a.team_avg_pct) },
    { key: "delta_pct", label: "Scarto", align: "right", render: (a) => `${a.delta_pct > 0 ? "+" : a.delta_pct < 0 ? "−" : ""}${Math.abs(Math.round(a.delta_pct * 100))}%` },
    { key: "impact_usd", label: "Impatto $", align: "right", sort: (a) => Math.abs(a.impact_usd), render: (a) => <span style={{ fontWeight: 500 }}>{fmtSigned$(a.impact_usd)}</span> },
    { key: "direction", label: "Verdetto", render: (a) => {
      const Dir = a.direction === "overpaid" ? TrendingUp : TrendingDown;
      const out = a.verdict === "OUT_OF_SCALE";
      return (
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}><Dir size={13} color={CP.textMuted} /> {a.direction === "overpaid" ? "Più della media" : "Meno della media"}</span>
          <div style={{ fontSize: 12, color: out ? CP.accentRed : CP.textMuted }}>{out ? "molto fuori media" : "da rivedere"}</div>
        </div>
      );
    } },
    { key: "mix", label: "Scaglioni pagati", sortable: false, render: (a) => <InlinePctDist dist={a.pct_distribution} S={S} /> },
    { key: "go", label: "", sortable: false, render: (a) => (
      <Link href={`/admin/comp-exam?creator=${encodeURIComponent(a.creator_alias)}&months=1`} onClick={(e) => e.stopPropagation()}
        title="Esame completo della creator" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>
        Esame <ArrowRight size={12} />
      </Link>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Review compensi" }]}
        title="Review compensi"
        subtitle="Le coppie operatore × creator in cui l'operatore incassa oltre il 15% più o meno della media del team su quella creator, ordinate per dollari in gioco. Da qui scegli chi rivedere con HR."
        actions={
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={{ ...input, minWidth: 170, cursor: "pointer" }}>
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
      />

      <CompNav />

      {(error || data?.error) && <Notice danger>Non riesco a calcolare la review: {String(data?.error || error?.message || error)}</Notice>}

      {isLoading && (
        <div style={{ ...card, padding: "18px 20px", display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 14, marginBottom: 14 }}>
          <Loader2 size={16} className="animate-spin" /> Calcolo le coppie fuori media su tutte le creator…
        </div>
      )}

      {s && (
        <HeroMetric
          label={`Coppie fuori media · ${monthName(periodId)}`}
          value={fmtInt(s.total_anomalies)}
          compare={`su ${fmtInt(data.creators_analyzed)} creator e ${fmtInt(data.operators_analyzed)} operatori analizzati`}
          hint={net === 0 ? "Nel complesso le differenze si compensano." : `Nel complesso queste coppie sono pagate ${fmt$(Math.abs(net))} ${net > 0 ? "in più" : "in meno"} di quanto prenderebbero alla media del team.`}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Metric label="Pagati più della media" value={fmtInt(s.overpaid_count)} note={`${fmtSigned$(s.total_overpaid_impact_usd)} di costo in più`} />
            <Metric label="Pagati meno della media" value={fmtInt(s.underpaid_count)} note={`${fmtSigned$(s.total_underpaid_impact_usd)} · rischio che se ne vadano`} />
            <Metric label="Molto fuori media" value={fmtInt(s.out_of_scale_count)} note="oltre il 35%" danger={s.out_of_scale_count > 0} />
            <Metric label="Da rivedere" value={fmtInt(s.review_count)} note="tra 15% e 35%" />
          </div>
        </HeroMetric>
      )}

      {/* Filtri */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <FilterChip label="Tutte" active={direction === "all"} onClick={() => setDirection("all")} />
        <FilterChip label="Pagati più della media (costo per HOC)" active={direction === "overpaid"} onClick={() => setDirection(direction === "overpaid" ? "all" : "overpaid")} />
        <FilterChip label="Pagati meno della media (rischio che se ne vadano)" active={direction === "underpaid"} onClick={() => setDirection(direction === "underpaid" ? "all" : "underpaid")} />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <label style={lbl}>Venduto minimo $</label>
          <input type="number" value={minSales} onChange={(e) => setMinSales(parseInt(e.target.value) || 0)} style={{ ...input, width: 100 }} />
        </div>
        <div>
          <label style={lbl}>Turni minimi</label>
          <input type="number" value={minShifts} onChange={(e) => setMinShifts(parseInt(e.target.value) || 1)} style={{ ...input, width: 80 }} />
        </div>
        <div style={{ flex: "1 1 220px", position: "relative" }}>
          <label style={lbl}>Creator ({allCreatorsAnalyzed.length} analizzate)</label>
          <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} style={{ ...input, width: "100%", paddingRight: creatorFilter ? 30 : 12, cursor: "pointer" }}>
            <option value="">Tutte le creator</option>
            {allCreatorsAnalyzed.filter((c) => c.anomaly_count > 0).length > 0 && (
              <optgroup label="Con coppie fuori media">
                {allCreatorsAnalyzed.filter((c) => c.anomaly_count > 0).map((c) => (
                  <option key={c.alias} value={c.alias}>{c.alias} ({c.anomaly_count})</option>
                ))}
              </optgroup>
            )}
            {allCreatorsAnalyzed.filter((c) => c.anomaly_count === 0).length > 0 && (
              <optgroup label="Tutte in linea">
                {allCreatorsAnalyzed.filter((c) => c.anomaly_count === 0).map((c) => (
                  <option key={c.alias} value={c.alias}>{c.alias} (0)</option>
                ))}
              </optgroup>
            )}
          </select>
          {creatorFilter && <button onClick={() => setCreatorFilter("")} title="Togli filtro" aria-label="Togli filtro creator" style={clearBtn}><X size={12} /></button>}
        </div>
        <div style={{ flex: "1 1 180px", position: "relative" }}>
          <label style={lbl}>Operatore</label>
          <input value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)} placeholder="Cerca operatore" style={{ ...input, paddingRight: operatorFilter ? 30 : 12, width: "100%" }} />
          {operatorFilter && <button onClick={() => setOperatorFilter("")} title="Togli filtro" aria-label="Togli filtro operatore" style={clearBtn}><X size={12} /></button>}
        </div>
      </div>

      {s?.top_creators_with_anomalies?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Creator con più coppie fuori media</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {s.top_creators_with_anomalies.map((c) => (
                <FilterChip key={c.creator} label={`${c.creator} · ${c.count}`} active={creatorFilter === c.creator} onClick={() => setCreatorFilter(creatorFilter === c.creator ? "" : c.creator)} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Operatori con più coppie fuori media</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {s.top_operators_with_anomalies.map((o) => (
                <FilterChip key={o.operator} label={`${o.operator} · ${o.count}`} active={operatorFilter === o.operator} onClick={() => setOperatorFilter(operatorFilter === o.operator ? "" : o.operator)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {data?.anomalies && (
        <>
          <SectionTitle aside={`${filteredAnomalies.length} di ${data.anomalies.length} · clic su una riga per i turni uno per uno. Impatto = pagato − venduto × media del team.`}>
            Coppie ordinate per dollari in gioco
          </SectionTitle>
          {filteredAnomalies.length === 0 ? (
            <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary, marginBottom: 16 }}>
              {creatorFilter ? (
                <>
                  <div style={{ marginBottom: 10 }}>Su <span style={{ color: CP.textPrimary }}>{creatorFilter}</span> nessun operatore è fuori media a {monthName(periodId)} con questi filtri: i compensi sono in linea.</div>
                  <Link href={`/admin/comp-exam?creator=${encodeURIComponent(creatorFilter)}&months=1`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>
                    Vedi comunque l'esame completo di {creatorFilter} <ArrowRight size={12} />
                  </Link>
                </>
              ) : data.anomalies.length === 0 ? (
                "Nessuna coppia fuori media questo mese con questi filtri: tutti gli operatori incassano entro il 15% dalla media del team sulla loro creator."
              ) : (
                "Nessuna coppia corrisponde alla ricerca. Togli il filtro creator o operatore."
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <DataTable columns={columns} rows={filteredAnomalies.map((a) => ({ ...a, id: `${a.creator_alias}|${a.operator}` }))}
                minWidth={1180} maxHeight={560}
                onRowClick={(a) => setSel(sel && sel.creator === a.creator_alias && sel.operator === a.operator ? null : { creator: a.creator_alias, operator: a.operator })}
                selected={(a) => !!sel && sel.creator === a.creator_alias && sel.operator === a.operator} />
            </div>
          )}

          {selRow && (
            <section ref={detailRef} style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{selRow.operator} su {selRow.creator_alias}</h2>
                <span style={{ fontSize: 13, color: CP.textMuted }}>turni di {monthName(periodId)}</span>
                <button onClick={() => setSel(null)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, padding: "5px 10px", color: CP.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}><X size={12} /> Chiudi</button>
              </div>
              <ShiftBreakdown creator={selRow.creator_alias} operator={selRow.operator} periodId={periodId} expectedSales={selRow.sales} expectedEarnings={selRow.earnings} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ShiftBreakdown({ creator, operator, periodId, expectedSales, expectedEarnings }) {
  const { data, error, isLoading } = useSWR(
    `/api/admin/op-shifts?creator=${encodeURIComponent(creator)}&operator=${encodeURIComponent(operator)}&period_id=${periodId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={13} className="animate-spin" /> Carico i turni…</div>;
  if (error || data?.error) return <Notice danger>Non riesco a caricare i turni: {data?.error || String(error)}</Notice>;
  if (!data?.shifts || data.shifts.length === 0) return <Notice>Nessun turno trovato per questa coppia. Di solito vuol dire che l'operatore non è collegato al suo account CreatorsPro.</Notice>;

  const totals = data.totals;
  // Verifica integrità: i totali dei turni devono tornare con la riga della tabella
  const salesMatch = Math.abs(totals.sales - expectedSales) / Math.max(expectedSales, 1) < 0.05;
  const earnMatch = Math.abs(totals.earnings - expectedEarnings) / Math.max(expectedEarnings, 1) < 0.05;
  const fmtTime = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", weekday: "short" });

  const columns = [
    { key: "started_at", label: "Data", render: (x) => <span style={NUM}>{fmtDate(new Date(x.started_at))}</span> },
    { key: "orario", label: "Orario", sortable: false, muted: true, render: (x) => <span style={NUM}>{fmtTime(new Date(x.started_at))}–{fmtTime(new Date(x.ended_at))}</span> },
    { key: "interval", label: "Fascia", muted: true, render: (x) => INTERVAL_IT[x.interval] || x.interval || "—" },
    { key: "total_shift_sales", label: "Venduto nel turno", align: "right", muted: true, render: (x) => fmt$(x.total_shift_sales) },
    { key: "sales_on_creator", label: "Venduto sulla creator", align: "right", render: (x) => fmt$(x.sales_on_creator) },
    { key: "earnings_on_creator", label: "Pagato", align: "right", render: (x) => fmt$(x.earnings_on_creator) },
    { key: "pct_on_creator", label: "%", align: "right", render: (x) => <span style={{ fontWeight: 500 }}>{pct1(x.pct_on_creator)}</span> },
    { key: "multi_creator", label: "Tipo di turno", render: (x) => x.multi_creator ? (
      <span title={`Creator nel turno: ${x.all_creators_in_shift.join(", ")}`} style={{ color: x.exact_attribution ? CP.textSecondary : CP.accentSoftText }}>
        {x.exact_attribution ? "Più creator · diviso sulle vendite reali" : "Più creator · diviso a metà (stima)"}
      </span>
    ) : <span style={{ color: CP.textSecondary }}>Una creator</span> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8, fontSize: 13, color: CP.textSecondary }}>
        <div style={NUM}>{data.shifts.length} turni · venduto {fmt$(totals.sales)} · pagato {fmt$(totals.earnings)} · {pct1(totals.overall_pct)} in media</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: salesMatch && earnMatch ? CP.textMuted : CP.accentRed }}>
          {salesMatch && earnMatch
            ? "I totali tornano con la riga della tabella"
            : <><AlertTriangle size={13} /> I totali non tornano: la tabella dice {fmt$(expectedSales)} venduti e {fmt$(expectedEarnings)} pagati</>}
        </div>
      </div>
      <DataTable columns={columns} rows={data.shifts.map((x, i) => ({ ...x, id: x.shift_id || i }))} minWidth={860} maxHeight={420} />
      <div style={{ marginTop: 10, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
        Per verificare a mano: in CreatorsPro apri Timeline → {creator} → {monthName(periodId)} e confronta date, orari e venduto dei turni di {operator}. Nei turni con una sola creator venduto e % sono diretti; con più creator il venduto è diviso sulle vendite reali di ciascuna o, se non disponibili, a metà.
      </div>
    </div>
  );
}

// Scaglioni pagati: una tinta sola, più scuro = scaglione più alto.
function InlinePctDist({ dist, S }) {
  if (!dist || Object.keys(dist).length === 0) return <span style={{ color: CP.textMuted }}>—</span>;
  const entries = Object.entries(dist).sort(([a], [b]) => parseFloat(a) - parseFloat(b));
  const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
  const step = (b) => { const v = parseFloat(b); return v < 0.09 ? 0 : v < 0.11 ? 1 : v < 0.13 ? 2 : 4; };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", border: `1px solid ${CP.border}` }}>
        {entries.map(([b, c]) => (
          <div key={b} title={`${c} turni al ${fmtPct(parseFloat(b), 1)}`} style={{ width: `${(c / total) * 100}%`, background: S.fill[step(b)] }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: CP.textSecondary, whiteSpace: "nowrap", ...NUM }}>
        {entries.map(([b, c]) => `${c}×${fmtPct(parseFloat(b))}`).join("  ")}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: CP.textSecondary, fontWeight: 500, marginBottom: 6 };
const input = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const clearBtn = { position: "absolute", right: 8, bottom: 9, padding: 3, background: CP.surfaceAlt, border: "none", borderRadius: 4, color: CP.textMuted, cursor: "pointer", display: "flex", alignItems: "center" };
