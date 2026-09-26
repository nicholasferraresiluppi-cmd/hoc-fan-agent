"use client";

/**
 * /admin/comp-exam — Esame compensi per UNA creator.
 * Input: nome creator + numero mesi.
 * Output: quanto è costato il team sul venduto (numero principale), chi incassa
 * fuori dalla media del team (verdetto), cosa fare, profili vecchi da pulire.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * - la pagina vuota ora spiega cosa si ottiene prima di avviare l'esame;
 * - il numero principale è la % del venduto pagata al team, col margine HOC accanto;
 * - verdetti in parole ("In linea", "Da rivedere", "Molto fuori media") con la
 *   regola scritta (±15% / ±35% dalla media del team) invece di etichette in inglese;
 * - "Sintesi narrativa" → "Cosa fare": prima l'azione, poi il dettaglio.
 * API e calcoli invariati.
 */

import { useState, useEffect } from "react";
import { Search, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { CP, FONTS, DATA_SCALE } from "@/lib/brand";
import { useTheme } from "@/lib/theme-client";
import CompNav from "@/components/CompNav";
import { fmt$, fmtInt, fmtPct } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";

// Verdetto: il rosso solo per "molto fuori media" (segnale su un dato).
const VERDICT = {
  OK:           { color: CP.textMuted, icon: CheckCircle2, label: "In linea" },
  REVIEW:       { color: CP.accentSoftText, icon: AlertTriangle, label: "Da rivedere" },
  OUT_OF_SCALE: { color: CP.accentRed, icon: XCircle, label: "Molto fuori media" },
  UNKNOWN:      { color: CP.textMuted, icon: HelpCircle, label: "Senza dati" },
};
const VERDICT_RANK = { OUT_OF_SCALE: 3, REVIEW: 2, UNKNOWN: 1, OK: 0 };
const pct1 = (v) => fmtPct(v, 1);
const monthsLabel = (n) => `${n} mes${n === 1 ? "e" : "i"}`;

export default function CompExamPage() {
  const [creator, setCreator] = useState("");
  const [months, setMonths] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fill da query string
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("creator");
    const m = sp.get("months");
    if (c) setCreator(c);
    if (m) setMonths(parseInt(m, 10) || 3);
    if (c) setTimeout(() => run(c, parseInt(m, 10) || 3), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(c = creator, m = months) {
    const name = (c || "").trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/comp-exam?creator=${encodeURIComponent(name)}&months=${m}`);
      const j = await res.json();
      if (!res.ok) {
        if (j.suggestions?.length) {
          throw new Error(`${j.error}\n\nForse intendevi: ${j.suggestions.join(", ")}`);
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Esame creator" }]}
        title="Esame compensi per creator"
        subtitle="Scegli una creator: vedi quanto del venduto è andato agli operatori, chi incassa molto più o molto meno della media del team e quali profili di pagamento vanno sistemati in CreatorsPro."
      />

      <CompNav />

      {/* Form */}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label style={lbl}>Creator</label>
            <input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="es. Giulia Ottorini"
              aria-label="Creator"
              style={input}
            />
          </div>
          <div>
            <label style={lbl}>Mesi chiusi da esaminare</label>
            <select value={months} onChange={(e) => setMonths(parseInt(e.target.value, 10))} style={{ ...input, minWidth: 120, cursor: "pointer" }}>
              {[1, 2, 3, 4, 6, 9, 12].map((n) => <option key={n} value={n}>{monthsLabel(n)}</option>)}
            </select>
          </div>
          <button onClick={() => run()} disabled={loading || !creator.trim()} style={primaryBtn(loading || !creator.trim())}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> Esamino…</> : <><Search size={14} /> Avvia esame</>}
          </button>
        </div>
      </section>

      {error && <Notice danger><span style={{ whiteSpace: "pre-wrap" }}>{error}</span></Notice>}

      {loading && (
        <div style={{ ...card, padding: "18px 20px", display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 14 }}>
          <Loader2 size={16} className="animate-spin" /> Carico {monthsLabel(months)} di turni, profili di pagamento e collegamenti operatore ↔ CreatorsPro…
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
          Scrivi il nome di una creator e premi <b style={{ fontWeight: 500, color: CP.textPrimary }}>Avvia esame</b>. Otterrai:
          <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
            <li>quanto del venduto è andato agli operatori e quanto è rimasto a HOC;</li>
            <li>per ogni operatore la percentuale incassata davvero, confrontata con la media del team;</li>
            <li>chi è da rivedere (oltre il 15% sopra o sotto la media) e i profili di pagamento vecchi ancora collegati.</li>
          </ul>
        </div>
      )}

      {data && <Results data={data} />}
    </div>
  );
}

function Results({ data }) {
  const [theme] = useTheme();
  const S = DATA_SCALE[theme] || DATA_SCALE.light;
  const teamPct = data.team_avg_pct;
  const totalSales = data.total_team_sales || 0;
  const nMonths = data.months_analyzed.length;

  const reviewOps = data.operators.filter((o) => o.verdict === "REVIEW" || o.verdict === "OUT_OF_SCALE");
  const unknownOps = data.operators.filter((o) => o.verdict === "UNKNOWN" && o.totalSales > 0);
  const oldProfiles = data.old_profiles_on_creator || [];
  const unmapped = data.operators.filter((o) => !o.member_matched).length;

  const columns = [
    { key: "operator", label: "Operatore", render: (o) => (
      <div>
        <div>{o.operator}</div>
        {!o.member_matched && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}><AlertTriangle size={11} /> non collegato a CreatorsPro</div>}
      </div>
    ) },
    { key: "totalShifts", label: "Turni", align: "right", render: (o) => o.totalShifts.toLocaleString("it-IT", { maximumFractionDigits: 1 }) },
    { key: "totalSales", label: "Venduto", align: "right", render: (o) => fmt$(o.totalSales) },
    { key: "mix_solo_pct", label: "Turni da solo", align: "right", render: (o) => (o.mix_solo_pct != null ? `${o.mix_solo_pct}%` : "—") },
    { key: "totalEarnings", label: "Pagato", align: "right", render: (o) => fmt$(o.totalEarnings) },
    { key: "pct_effective", label: "% incassata", align: "right", render: (o) => {
      if (o.pct_effective == null) return "—";
      const off = teamPct != null && Math.abs((o.pct_effective - teamPct) / teamPct) > 0.15;
      return <span style={{ fontWeight: 500, color: off ? CP.accentSoftText : CP.textPrimary }}>{pct1(o.pct_effective)}</span>;
    } },
    { key: "mix", label: "Scaglioni pagati", sortable: false, render: (o) => <PctDistribution dist={o.pct_distribution} S={S} /> },
    { key: "verdict", label: "Verdetto", sort: (o) => VERDICT_RANK[o.verdict] ?? 0, render: (o) => {
      const v = VERDICT[o.verdict] || VERDICT.UNKNOWN;
      const Icon = v.icon;
      return (
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: v.color, fontSize: 13 }}><Icon size={13} /> {v.label}</span>
          {o.verdict_note && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, maxWidth: 260 }}>{o.verdict_note}</div>}
        </div>
      );
    } },
  ];

  return (
    <>
      <HeroMetric
        label={`Pagato agli operatori sul venduto · ${data.creator.name}`}
        value={pct1(teamPct)}
        compare={teamPct != null ? `A HOC resta ${fmt$(totalSales - data.total_team_earnings)} (${pct1(1 - teamPct)} del venduto)` : null}
        hint={`${monthsLabel(nMonths)} chius${nMonths === 1 ? "o" : "i"}: ${data.months_analyzed.join(", ")}`}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Metric label="Venduto" value={fmt$(totalSales)} />
          <Metric label="Pagato agli operatori" value={fmt$(data.total_team_earnings)} />
          <Metric label="Operatori" value={fmtInt(data.operators_count)} />
          <Metric label="Da rivedere" value={fmtInt(reviewOps.length)} danger={data.operators.some((o) => o.verdict === "OUT_OF_SCALE")} />
          <Metric label="Profili collegati" value={fmtInt(data.total_profiles_on_creator)} note={oldProfiles.length ? `${oldProfiles.length} vecchi da pulire` : null} />
        </div>
      </HeroMetric>

      {data.months_errors?.length > 0 && (
        <Notice danger>Non sono riuscito a leggere questi mesi: {data.months_errors.map((e) => e.period_id).join(", ")}. I numeri sopra non li includono.</Notice>
      )}

      {/* Cosa fare: l'azione prima del dettaglio */}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
        <SectionTitle>Cosa fare</SectionTitle>
        <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
          {reviewOps.length > 0 ? (
            <>
              <p style={{ margin: "0 0 8px", color: CP.textPrimary }}>
                Rivedi con HR {reviewOps.length === 1 ? "l'operatore" : `i ${reviewOps.length} operatori`} fuori dalla media del team. Chi incassa meno rischia di demotivarsi; chi incassa di più erode il margine HOC.
              </p>
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                {reviewOps.slice(0, 5).map((o) => {
                  const dir = o.pct_effective != null && teamPct != null ? (o.pct_effective > teamPct ? "incassa più della media" : "incassa meno della media") : null;
                  return (
                    <li key={o.operator} style={{ marginBottom: 4 }}>
                      <span style={{ color: CP.textPrimary }}>{o.operator}</span> ({fmt$(o.totalSales)} venduti, {o.totalShifts.toLocaleString("it-IT", { maximumFractionDigits: 1 })} turni)
                      {dir && <> — {dir}: con il profilo “{o.active_profile?.name}” prende {pct1(o.pct_effective)} contro {pct1(teamPct)} del team.</>}
                      {o.verdict_note && !dir && <> — {o.verdict_note}</>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p style={{ margin: 0 }}>Nessun operatore è oltre il 15% sopra o sotto la media del team: i compensi su questa creator sono coerenti. Nessuna azione per ora; ricontrolla il mese prossimo.</p>
          )}
          {unknownOps.length > 0 && (
            <p style={{ margin: "10px 0 0" }}>
              {unknownOps.length === 1 ? "1 operatore ha" : `${unknownOps.length} operatori hanno`} venduto su questa creator ma non riusciamo ad abbinarl{unknownOps.length === 1 ? "o" : "i"} a un profilo di pagamento: {unknownOps.slice(0, 5).map((o) => o.operator).join(", ")}{unknownOps.length > 5 && ` (+${unknownOps.length - 5})`}. Controlla il collegamento operatore ↔ CreatorsPro.
            </p>
          )}
          {oldProfiles.length > 0 && (
            <p style={{ margin: "10px 0 0" }}>
              {oldProfiles.length === 1 ? "1 profilo vecchio (dismesso o di prova) è" : `${oldProfiles.length} profili vecchi (dismessi o di prova) sono`} ancora collegat{oldProfiles.length === 1 ? "o" : "i"} a questa creator: da togliere in CreatorsPro (elenco sotto).
            </p>
          )}
        </div>
      </section>

      <SectionTitle aside={`Media del team ${pct1(teamPct)}. “Da rivedere” = oltre il 15% sopra o sotto la media; “Molto fuori media” = oltre il 35%.${unmapped ? ` ${unmapped} non collegati a CreatorsPro.` : ""}`}>
        Operatori su questa creator
      </SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <DataTable columns={columns} rows={data.operators.map((o) => ({ ...o, id: o.operator }))} defaultSort={{ key: "totalSales", dir: -1 }} minWidth={960} maxHeight={640}
          empty="Nessun operatore ha lavorato su questa creator nei mesi scelti. Prova ad allargare il periodo." />
      </div>

      {oldProfiles.length > 0 && (
        <section style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
          <SectionTitle aside="Profili dismessi o di prova ancora collegati: vanno tolti in CreatorsPro">Profili vecchi da pulire</SectionTitle>
          {oldProfiles.map((p) => (
            <div key={p.id} style={{ padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14 }}>
              <div>{p.name}</div>
              {p.members_linked && p.members_linked.length > 0 && (
                <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>Operatori collegati: {p.members_linked.join(", ")}</div>
              )}
            </div>
          ))}
        </section>
      )}

      {data.creator.matched_aliases?.length > 0 && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 10 }}>Nomi della creator trovati nei dati: {data.creator.matched_aliases.join(", ")}</div>
      )}

      <details style={{ marginTop: 12, fontSize: 12, color: CP.textMuted }}>
        <summary style={{ cursor: "pointer" }}>Dettagli tecnici (per chi fa manutenzione)</summary>
        <pre style={{ marginTop: 8, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, overflow: "auto", color: CP.textSecondary }}>
          {JSON.stringify(data.diagnostics, null, 2)}
        </pre>
      </details>
    </>
  );
}

// Scaglioni pagati: una tinta sola (scala dati), più scuro = scaglione più alto.
function PctDistribution({ dist, S }) {
  if (!dist || Object.keys(dist).length === 0) return <span style={{ color: CP.textMuted }}>—</span>;
  const entries = Object.entries(dist).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  const totalShifts = entries.reduce((s, [, c]) => s + c, 0) || 1;
  const step = (b) => { const v = parseFloat(b); return v < 0.09 ? 0 : v < 0.11 ? 1 : v < 0.13 ? 2 : 4; };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", border: `1px solid ${CP.border}` }}>
        {entries.map(([bucket, count]) => (
          <div key={bucket} title={`${count} turn${count === 1 ? "o" : "i"} al ${fmtPct(parseFloat(bucket), 1)}`}
            style={{ width: `${(count / totalShifts) * 100}%`, background: S.fill[step(bucket)] }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: CP.textSecondary, ...NUM }}>
        {entries.map(([bucket, count]) => `${count}×${fmtPct(parseFloat(bucket))}`).join("  ")}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: CP.textSecondary, fontWeight: 500, marginBottom: 6 };
const input = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "10px 18px",
  background: disabled ? CP.surfaceAlt : CP.accent,
  color: disabled ? CP.textMuted : CP.accentInk,
  border: "none", borderRadius: 8,
  fontSize: 14, fontWeight: 500, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
