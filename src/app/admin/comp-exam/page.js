"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, AlertCircle, CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, Loader2, Coins, Percent, Users } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import CompNav from "@/components/CompNav";

/**
 * /admin/comp-exam — Esame compensation per UN creator.
 * Input: nome creator + numero mesi
 * Output: tabella operatori con profilo attivo, % effettiva, verdetto +
 * sintesi narrativa con candidati da rivedere e profili OLD da pulire.
 */

const VERDICT_STYLE = {
  OK:           { color: "#3FB97E", icon: CheckCircle2, label: "OK" },
  REVIEW:       { color: "#F59E0B", icon: AlertTriangle, label: "RIVEDIBILE" },
  OUT_OF_SCALE: { color: "#D44545", icon: XCircle, label: "FUORI SCALA" },
  UNKNOWN:      { color: "#8F8A82", icon: HelpCircle, label: "?" },
};

function fmtCurrency(n) {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("it-IT")}`;
}
function fmtPct(v, digits = 1) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

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
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1500, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Esame compensation</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Esame compensation per creator"
        subtitle="Per un creator scelta: chi ha lavorato, con che risultati, con che profilo pagamento, e se quel profilo è coerente con la performance. Tabella + sintesi narrativa."
      />

      <CompNav />

      {/* Form */}
      <CpCard padding="18px 22px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={lbl}>Creator</label>
            <input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="es. Giulia Ottorini"
              style={input}
            />
          </div>
          <div>
            <label style={lbl}>Mesi indietro</label>
            <select value={months} onChange={(e) => setMonths(parseInt(e.target.value, 10))} style={{ ...input, minWidth: 110, cursor: "pointer" }}>
              {[1, 2, 3, 4, 6, 9, 12].map((n) => <option key={n} value={n} style={{ background: CP.surface }}>{n} mes{n === 1 ? "e" : "i"}</option>)}
            </select>
          </div>
          <button
            onClick={() => run()}
            disabled={loading || !creator.trim()}
            style={primaryBtn(loading || !creator.trim())}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Esamino…</> : <><Search size={14} /> Avvia esame</>}
          </button>
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "flex-start", gap: 10, whiteSpace: "pre-wrap", fontSize: 13 }}>
            <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} /> {error}
          </div>
        </CpCard>
      )}

      {loading && (
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: CP.textSecondary }}>
            <Loader2 size={16} className="animate-spin" /> Carico {months} mes{months === 1 ? "e" : "i"} di dati + payment profiles + member mapping…
          </div>
        </CpCard>
      )}

      {data && <Results data={data} />}
    </div>
  );
}

function Results({ data }) {
  const teamPct = data.team_avg_pct;
  const totalSales = data.total_team_sales || 0;

  // Sintesi narrativa: identifica top REVIEW e OUT_OF_SCALE
  const reviewOps = data.operators.filter((o) => o.verdict === "REVIEW" || o.verdict === "OUT_OF_SCALE");
  const unknownOps = data.operators.filter((o) => o.verdict === "UNKNOWN" && o.totalSales > 0);
  const oldProfiles = data.old_profiles_on_creator || [];

  return (
    <>
      {/* Stat header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Creator esaminata" value={data.creator.name} />
        <StatCard label="Operatori attivi" value={data.operators_count} sub={`su ${data.months_analyzed.length} mes${data.months_analyzed.length === 1 ? "e" : "i"}`} />
        <StatCard label="Sales team totale" value={fmtCurrency(totalSales)} color={CP.accentGreen} />
        <StatCard label="Guadagno team totale" value={fmtCurrency(data.total_team_earnings)} color="#D4AF7A" />
        <StatCard label="% media team incassata" value={fmtPct(teamPct)} color="#D4AF7A" sub="= guadagno / sales" />
        <StatCard label="Profili linkati" value={data.total_profiles_on_creator} sub={oldProfiles.length > 0 ? `${oldProfiles.length} OLD da pulire` : null} color={oldProfiles.length > 0 ? "#F59E0B" : null} />
      </div>

      {/* Mesi analizzati */}
      <div style={{ marginBottom: 14, fontSize: 12, color: CP.textSecondary }}>
        Mesi: <code style={mono}>{data.months_analyzed.join(", ")}</code>
        {data.months_errors?.length > 0 && (
          <span style={{ marginLeft: 12, color: "#F59E0B" }}>⚠️ Errori su: {data.months_errors.map((e) => e.period_id).join(", ")}</span>
        )}
        {data.creator.matched_aliases?.length > 0 && (
          <span style={{ marginLeft: 12, color: CP.textMuted }}>Alias creator nei dati: <code style={mono}>{data.creator.matched_aliases.join(", ")}</code></span>
        )}
      </div>

      {/* Tabella principale */}
      <SectionLabel style={{ display: "block", marginBottom: 10 }}>
        Tabella operatori · ordinati per sales decrescente
      </SectionLabel>
      <CpCard padding="0" style={{ overflow: "hidden", marginBottom: 24 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: CP.surfaceAlt, borderBottom: `2px solid ${CP.border}` }}>
                <Th>#</Th>
                <Th>Operatore</Th>
                <Th align="right">Turni</Th>
                <Th align="right">Sales $</Th>
                <Th align="right">Solo %</Th>
                <Th align="right">Guadagno reale</Th>
                <Th align="right">% effettiva</Th>
                <Th>Mix scaglioni applicati</Th>
                <Th>Verdetto</Th>
              </tr>
            </thead>
            <tbody>
              {data.operators.map((o, i) => <OpRow key={o.operator} o={o} rank={i + 1} teamPct={teamPct} />)}
              {data.operators.length === 0 && (
                <tr><td colSpan={10} style={{ padding: "20px 16px", textAlign: "center", color: CP.textMuted, fontStyle: "italic" }}>
                  Nessun operatore ha lavorato su questa creator nei mesi selezionati.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CpCard>

      {/* Sintesi narrativa */}
      <CpCard padding="20px 24px" style={{ marginBottom: 20 }}>
        <SectionLabel style={{ display: "block", marginBottom: 12 }}>
          <FileText size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Sintesi narrativa
        </SectionLabel>
        <div style={{ fontSize: 13, color: CP.textPrimary, lineHeight: 1.7 }}>
          <p>
            <b>{data.creator.name}</b> — analisi su {data.months_analyzed.length} mes{data.months_analyzed.length === 1 ? "e" : "i"} chius{data.months_analyzed.length === 1 ? "o" : "i"} ({data.months_analyzed.join(", ")}).
            Su questa creator hanno lavorato <b>{data.operators_count} operatori</b>, generando <b>{fmtCurrency(totalSales)}</b> di sales totali e
            incassando <b>{fmtCurrency(data.total_team_earnings)}</b> di compensi.
            La <b>% media REALE</b> incassata dal team è <b>{fmtPct(teamPct)}</b> (= guadagno / sales, dato CP).
            Margine residuo HOC: <b>{fmtCurrency(totalSales - data.total_team_earnings)}</b> ({fmtPct(teamPct != null ? 1 - teamPct : null)}).
          </p>

          {reviewOps.length > 0 && (
            <>
              <p style={{ marginTop: 12 }}><b>Operatori da rivedere ({reviewOps.length}):</b></p>
              <ul style={{ marginLeft: 16, marginTop: 4 }}>
                {reviewOps.slice(0, 5).map((o) => {
                  const dir = o.pct_effective != null && teamPct != null
                    ? (o.pct_effective > teamPct ? "sopra-pagato" : "sotto-pagato")
                    : null;
                  return (
                    <li key={o.operator} style={{ marginBottom: 6 }}>
                      <b>{o.operator}</b> ({fmtCurrency(o.totalSales)} sales, {o.totalShifts.toFixed(1)} turni){" "}
                      {dir && <>— {dir}: profilo "{o.active_profile?.name}" gli rende {fmtPct(o.pct_effective)} vs media team {fmtPct(teamPct)}.</>}
                      {o.verdict_note && !dir && <> — {o.verdict_note}</>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {unknownOps.length > 0 && (
            <p style={{ marginTop: 12 }}>
              <b>{unknownOps.length} operator{unknownOps.length === 1 ? "e" : "i"}</b> {unknownOps.length === 1 ? "ha" : "hanno"} lavorato su questa creator ma <b>non riusciamo ad attribuirgli un profilo pagamento</b>:
              {" "}{unknownOps.slice(0, 5).map((o) => o.operator).join(", ")}
              {unknownOps.length > 5 && ` (+${unknownOps.length - 5})`}.
              {" "}Verificare il mapping CP member ↔ operatore Infloww in Debug Mapping.
            </p>
          )}

          {oldProfiles.length > 0 && (
            <p style={{ marginTop: 12 }}>
              <b>{oldProfiles.length} profil{oldProfiles.length === 1 ? "o" : "i"} OLD/DISMESSO/TEST</b> ancora linkat{oldProfiles.length === 1 ? "o" : "i"} a questa creator — da pulire in CP:
              {" "}{oldProfiles.map((p) => `"${p.name}"`).join(", ")}.
            </p>
          )}

          <p style={{ marginTop: 14, padding: "10px 12px", background: CP.surfaceAlt, borderLeft: `3px solid ${CP.accentGreen}`, borderRadius: 4, fontSize: 12, color: CP.textSecondary }}>
            <b>Suggerimento operativo:</b>{" "}
            {reviewOps.length > 0
              ? `Aprire una review con HR sui ${reviewOps.length} operatori "RIVEDIBILE/FUORI SCALA" sopra. Per i sotto-pagati il rischio è demotivazione; per i sopra-pagati il margine HOC è erosivo.`
              : `Setup compensation coerente — no action immediata richiesta. Continuare a monitorare con questo strumento mese per mese.`}
          </p>
        </div>
      </CpCard>

      {/* Profili OLD section */}
      {oldProfiles.length > 0 && (
        <>
          <SectionLabel style={{ display: "block", marginBottom: 10, color: "#F59E0B" }}>
            Profili OLD/DISMESSO/TEST ancora linkati alla creator
          </SectionLabel>
          <CpCard accent="#F59E0B" padding="14px 18px" style={{ marginBottom: 20 }}>
            {oldProfiles.map((p) => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${CP.border}`, fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {p.members_linked && p.members_linked.length > 0 && (
                  <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>
                    Operatori linkati: {p.members_linked.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </CpCard>
        </>
      )}

      {/* Diagnostics */}
      <details style={{ marginTop: 20, fontSize: 11, color: CP.textMuted }}>
        <summary style={{ cursor: "pointer", fontFamily: FONTS.mono }}>Diagnostica</summary>
        <pre style={{ marginTop: 8, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 4, fontSize: 10, overflow: "auto" }}>
          {JSON.stringify(data.diagnostics, null, 2)}
        </pre>
      </details>
    </>
  );
}

function OpRow({ o, rank, teamPct }) {
  const v = VERDICT_STYLE[o.verdict] || VERDICT_STYLE.UNKNOWN;
  const Icon = v.icon;
  const showSplit = o.mix_solo_pct != null && o.mix_solo_pct < 100;
  return (
    <tr style={{ borderBottom: `1px solid ${CP.border}`, fontSize: 13 }}>
      <Td><span style={{ fontFamily: FONTS.mono, color: CP.textMuted, fontSize: 11 }}>{String(rank).padStart(2, "0")}</span></Td>
      <Td>
        <div style={{ fontWeight: 600 }}>{o.operator}</div>
        {!o.member_matched && <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 1 }}>⚠ member CP non mappato</div>}
      </Td>
      <Td align="right" mono>{o.totalShifts.toFixed(1)}</Td>
      <Td align="right" mono><span style={{ color: CP.accentGreen, fontWeight: 600 }}>{fmtCurrency(o.totalSales)}</span></Td>
      <Td align="right" mono>
        {o.mix_solo_pct != null ? (
          <span style={{ color: o.mix_solo_pct >= 80 ? "#4F8CCB" : "#D4AF7A" }}>{o.mix_solo_pct}%</span>
        ) : "—"}
        {showSplit && <div style={{ fontSize: 9, color: CP.textMuted }}>{100 - o.mix_solo_pct}% split</div>}
      </Td>
      <Td align="right" mono>
        <span style={{ color: "#D4AF7A", fontWeight: 600 }}>{fmtCurrency(o.totalEarnings)}</span>
      </Td>
      <Td align="right" mono>
        {o.pct_effective != null ? (
          <span style={{ color: teamPct != null && Math.abs((o.pct_effective - teamPct) / teamPct) > 0.15 ? "#F59E0B" : CP.textPrimary, fontWeight: 600 }}>
            {fmtPct(o.pct_effective)}
          </span>
        ) : "—"}
      </Td>
      <Td>
        <PctDistribution dist={o.pct_distribution} />
      </Td>
      <Td>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 4, background: v.color + "22", color: v.color, fontSize: 11, fontWeight: 700 }}>
          <Icon size={12} /> {v.label}
        </div>
        {o.verdict_note && <div style={{ fontSize: 10, color: CP.textMuted, marginTop: 3, maxWidth: 240 }}>{o.verdict_note}</div>}
      </Td>
    </tr>
  );
}

function PctDistribution({ dist }) {
  if (!dist || Object.keys(dist).length === 0) {
    return <span style={{ color: CP.textMuted, fontStyle: "italic", fontSize: 11 }}>—</span>;
  }
  const entries = Object.entries(dist);
  const totalShifts = entries.reduce((s, [, c]) => s + c, 0);
  // Colore in base al bucket %: <0.10 rosso, 0.10-0.12 giallo, >=0.12 verde
  const colorFor = (b) => {
    const v = parseFloat(b);
    if (v < 0.09) return "#D44545";
    if (v < 0.11) return "#F59E0B";
    if (v < 0.13) return "#D4AF7A";
    return "#3FB97E";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
      {/* Mini-bar chart: una stripe per bucket, larghezza proporzionale al count */}
      <div style={{ display: "flex", height: 6, borderRadius: 2, overflow: "hidden", background: CP.surfaceAlt }}>
        {entries.map(([bucket, count]) => (
          <div
            key={bucket}
            title={`${count} turn${count === 1 ? "o" : "i"} al ${(parseFloat(bucket) * 100).toFixed(1)}%`}
            style={{ width: `${(count / totalShifts) * 100}%`, background: colorFor(bucket) }}
          />
        ))}
      </div>
      {/* Lista compatta */}
      <div style={{ fontSize: 10, fontFamily: FONTS.mono, color: CP.textSecondary, lineHeight: 1.35 }}>
        {entries.map(([bucket, count], i) => (
          <span key={bucket} style={{ color: colorFor(bucket), marginRight: 6 }}>
            {count}×{(parseFloat(bucket) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function Th({ children, align }) {
  return <th style={{ padding: "12px 14px", textAlign: align || "left", fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: 0.6, fontFamily: FONTS.mono }}>{children}</th>;
}
function Td({ children, align, mono }) {
  return <td style={{ padding: "11px 14px", textAlign: align || "left", fontFamily: mono ? FONTS.mono : FONTS.body, verticalAlign: "top" }}>{children}</td>;
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { width: "100%", padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "12px 20px",
  background: disabled ? CP.surfaceAlt : CP.accent,
  color: disabled ? CP.textMuted : CP.accentInk,
  border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
const mono = { padding: "2px 6px", background: "#0a0a0a", borderRadius: 4, fontFamily: "ui-monospace, monospace", fontSize: 11, margin: "0 3px", color: "#f0f0f0" };
