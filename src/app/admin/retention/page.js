"use client";

/**
 * /admin/retention — Retention creator (Livello 1 "CRM fan").
 *
 * Lente di management sul payout ledger: NON un CRM fan operativo. Fan
 * pseudonimizzati, nessuna azione di contatto (quella vive in Infloww/OF).
 * Risponde a "quanto pesa il top dei fan, tornano nel tempo, chi sta
 * scivolando" — cose che un tool di chat (che guarda il singolo fan) non dà.
 */
import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard, CreatorDot } from "@/components/cp-style";
import { Repeat, Gem, TrendingDown, ChevronLeft, Users2, ShieldCheck } from "lucide-react";

const fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.json();
};
const nf = new Intl.NumberFormat("it-IT");
const usd = (n) => "$" + nf.format(Math.round(n ?? 0));
const int = (n) => nf.format(Math.round(n ?? 0));
const pct = (v) => (v == null ? "0" : String(v).replace(".", ",")) + "%";
const rgba = (hex, a) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

export default function RetentionPage() {
  const [sel, setSel] = useState(null); // creatorId | null

  const { data: ov, error: ovErr, isLoading: ovLoading } = useSWR("/api/admin/retention", fetcher, { revalidateOnFocus: false });
  const { data: drill, error: drillErr, isLoading: drillLoading } = useSWR(
    sel ? `/api/admin/retention?creator=${encodeURIComponent(sel)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const denied = ovErr && (ovErr.status === 401 || ovErr.status === 403);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 80px", fontFamily: FONTS.body, color: CP.textSecondary }}>
      <PageHeader
        section="Comp & Ben"
        title="Retention creator"
        subtitle="Lente di management sul ledger transazioni: concentrazione dei fan altospendenti, coorti che tornano nel tempo, whale che stanno scivolando. Non è uno strumento di contatto — i fan sono pseudonimizzati e l'azione vive in Infloww."
        toolbar={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 999, padding: "6px 12px" }}>
            <ShieldCheck size={14} strokeWidth={1.8} /> fan pseudonimizzati
          </span>
        }
      />

      {denied && <Notice>Accesso riservato. Questa vista mostra dati denaro di tutti i creator e richiede il livello analytics (admin, sales manager o QA).</Notice>}
      {ovErr && !denied && <Notice>Errore nel caricamento ({String(ovErr.status || ovErr.message)}).</Notice>}
      {!ovErr && ov?.needs_sync === "ledger" && <Notice>Il ledger transazioni non è ancora sincronizzato. Avvia il sync da <b>/admin/payout-tree</b>, poi torna qui.</Notice>}

      {!sel && !denied && (
        <Overview ov={ov} loading={ovLoading} onSelect={setSel} />
      )}

      {sel && (
        <Drill
          creatorId={sel}
          data={drill}
          loading={drillLoading}
          error={drillErr}
          onBack={() => setSel(null)}
        />
      )}
    </div>
  );
}

function Notice({ children }) {
  return (
    <CpCard style={{ marginBottom: 18, borderColor: CP.borderStrong }}>
      <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55 }}>{children}</div>
    </CpCard>
  );
}

/* ─────────────────────────── Overview ─────────────────────────── */

function Overview({ ov, loading, onSelect }) {
  if (loading) return <Skeleton lines={6} />;
  if (!ov || !Array.isArray(ov.creators)) return null;
  if (ov.creators.length === 0) return <Notice>Nessun creator con transazioni nel ledger.</Notice>;

  const periods = ov.periods || [];
  const maxTotal = Math.max(...ov.creators.map((c) => c.total_usd), 1);

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="Creator nel ledger" value={ov.creators.length} sub={`${periods.length} mesi sincronizzati`} />
        <StatCard label={`Fatturato ${ov.last_period || "—"}`} value={ov.last_period_gross_usd != null ? usd(ov.last_period_gross_usd) : "—"} sub="lordo, mese più recente" />
        <StatCard label="Finestra" value={periods.length ? `${periods[0]} → ${periods[periods.length - 1]}` : "—"} sub="range coperto dal ledger" />
      </div>

      <SectionLabel style={{ display: "block", marginBottom: 10 }}>Creator · fatturato e andamento</SectionLabel>
      <CpCard padding="6px 0">
        <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 120px 88px 96px", gap: 14, alignItems: "center", padding: "10px 18px", borderBottom: `1px solid ${CP.border}`, fontSize: 11, color: CP.textMuted, fontWeight: 500 }}>
          <span></span>
          <span>Creator</span>
          <span style={{ textAlign: "right" }}>Andamento</span>
          <span style={{ textAlign: "right" }}>Mesi att.</span>
          <span style={{ textAlign: "right" }}>Totale</span>
        </div>
        {ov.creators.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              display: "grid", gridTemplateColumns: "26px 1fr 120px 88px 96px", gap: 14, alignItems: "center", width: "100%",
              padding: "12px 18px", borderBottom: `1px solid ${CP.borderSoft}`, background: "transparent", border: "none",
              borderRadius: 0, cursor: "pointer", textAlign: "left", color: CP.textPrimary,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = CP.surfaceAlt)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <CreatorDot alias={c.name} />
            <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            <span style={{ justifySelf: "end" }}><Sparkline values={c.by_period} /></span>
            <span style={{ textAlign: "right", fontFamily: FONTS.mono, fontSize: 13, color: CP.textMuted }}>{c.active_periods}/{periods.length}</span>
            <span style={{ textAlign: "right", fontFamily: FONTS.mono, fontSize: 14, fontWeight: 500 }}>{usd(c.total_usd)}</span>
          </button>
        ))}
      </CpCard>
      <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 12 }}>Clicca un creator per la lente completa: concentrazione whale, coorti di retention, LTV e whale dormienti.</p>
    </>
  );
}

function Sparkline({ values }) {
  const w = 108, h = 26, pad = 2;
  const vals = (values || []).length ? values : [0];
  const max = Math.max(...vals, 1);
  const step = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => `${pad + i * step},${h - pad - (v / max) * (h - pad * 2)}`).join(" ");
  const lastX = pad + (vals.length - 1) * step;
  const lastY = h - pad - (vals[vals.length - 1] / max) * (h - pad * 2);
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={CP.accentDim} strokeWidth="1.6" />
      <circle cx={lastX} cy={lastY} r="2.6" fill={CP.accent} />
    </svg>
  );
}

/* ─────────────────────────── Drill ─────────────────────────── */

function Drill({ creatorId, data, loading, error, onBack }) {
  const back = (
    <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 12, fontWeight: 500, padding: "6px 12px", cursor: "pointer", marginBottom: 18 }}>
      <ChevronLeft size={15} strokeWidth={1.8} /> tutti i creator
    </button>
  );

  if (error) return <>{back}<Notice>Errore nel caricamento del creator ({String(error.status || error.message)}).</Notice></>;
  if (loading || !data) return <>{back}<Skeleton lines={8} /></>;

  const { creator, concentration: conc, ltv, cohorts, dormant, refunds } = data;
  const emptyData = (data.fan_count || 0) === 0;

  return (
    <>
      {back}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <CreatorDot alias={creator?.name} size={14} />
        <h2 style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 500, margin: 0, color: CP.textPrimary, letterSpacing: "-0.01em" }}>{creator?.name}</h2>
        {creator?.userName && <span style={{ fontSize: 13, color: CP.textMuted }}>@{creator.userName}</span>}
      </div>

      {emptyData ? (
        <Notice>Nessuna transazione fan nel ledger per questo creator nei periodi sincronizzati.</Notice>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <StatCard label="Fan totali" value={int(data.fan_count)} sub={`${int(data.tx_count)} transazioni`} />
            <StatCard label="Fatturato lordo" value={usd(data.total_usd)} sub="tutti i periodi" />
            <StatCard label="Quota top 10% fan" value={pct(conc?.top10?.share ?? 0)} sub={`${int(conc?.top10?.count ?? 0)} fan · ${usd(conc?.top10?.gross_usd ?? 0)}`} accent={CP.accent} color={CP.accent} />
            <StatCard label="Refund" value={pct(refunds?.rate_pct ?? 0)} sub={`${int(refunds?.count ?? 0)} · ${usd(refunds?.amount_usd ?? 0)}`} color={refunds?.rate_pct > 5 ? CP.accentRed : CP.textPrimary} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Concentration conc={conc} />
            <SpendBands ltv={ltv} />
          </div>

          <CohortGrid cohorts={cohorts} />

          <DormantWhales dormant={dormant} />
        </>
      )}
    </>
  );
}

function Concentration({ conc }) {
  const rows = [
    { k: "top1", label: "Top 1% dei fan" },
    { k: "top5", label: "Top 5%" },
    { k: "top10", label: "Top 10%" },
    { k: "top20", label: "Top 20%" },
  ];
  return (
    <CpCard>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Gem size={15} strokeWidth={1.8} color={CP.accent} />
        <SectionLabel>Concentrazione</SectionLabel>
      </div>
      <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "4px 0 14px" }}>Quota del fatturato generata dai fan che spendono di più.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {rows.map((r) => {
          const share = conc?.[r.k]?.share ?? 0;
          return (
            <div key={r.k}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: CP.textSecondary }}>{r.label}</span>
                <span style={{ fontFamily: FONTS.mono, color: CP.textPrimary, fontWeight: 500 }}>{pct(share)}</span>
              </div>
              <div style={{ height: 7, background: CP.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, share)}%`, height: "100%", background: CP.accent, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
    </CpCard>
  );
}

function SpendBands({ ltv }) {
  const bands = ltv?.bands || [];
  return (
    <CpCard>
      <SectionLabel style={{ display: "block", marginBottom: 4 }}>Bande di spesa (LTV)</SectionLabel>
      <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "4px 0 14px" }}>
        Fan per fascia di spesa lifetime. Mediana {usd(ltv?.median_usd ?? 0)} · media {usd(ltv?.mean_usd ?? 0)} · p90 {usd(ltv?.p90_usd ?? 0)}.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {bands.map((b) => (
          <div key={b.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: b.id === "whale" ? CP.accent : CP.textSecondary, fontWeight: b.id === "whale" ? 500 : 400 }}>
                {b.label} <span style={{ color: CP.textMuted }}>· {int(b.fans)} fan</span>
              </span>
              <span style={{ fontFamily: FONTS.mono, color: CP.textPrimary }}>{pct(b.gross_pct)} ric.</span>
            </div>
            <div style={{ height: 7, background: CP.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, b.gross_pct)}%`, height: "100%", background: b.id === "whale" ? CP.accent : CP.accentDim, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </CpCard>
  );
}

function CohortGrid({ cohorts }) {
  const rows = cohorts?.cohorts || [];
  if (rows.length === 0) return null;
  const maxOff = Math.max(...rows.map((r) => r.retention.length), 1);
  const offsets = Array.from({ length: maxOff }, (_, i) => i);
  return (
    <CpCard style={{ marginBottom: 12 }} padding="16px 18px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Repeat size={15} strokeWidth={1.8} color={CP.accent} />
        <SectionLabel>Coorti di retention</SectionLabel>
      </div>
      <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "4px 0 14px" }}>
        Dei fan entrati in ciascun mese (colonna sinistra), quanti tornano ad acquistare nei mesi successivi. Cella = % della coorte ancora attiva.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px", color: CP.textMuted, fontWeight: 500, whiteSpace: "nowrap" }}>Coorte</th>
              <th style={{ textAlign: "right", padding: "6px 8px", color: CP.textMuted, fontWeight: 500 }}>Fan</th>
              {offsets.map((o) => (
                <th key={o} style={{ textAlign: "center", padding: "6px 8px", color: CP.textMuted, fontWeight: 500, minWidth: 42 }}>M+{o}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort}>
                <td style={{ padding: "5px 10px", color: CP.textSecondary, fontFamily: FONTS.mono, whiteSpace: "nowrap" }}>{r.cohort}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: CP.textMuted, fontFamily: FONTS.mono }}>{int(r.size)}</td>
                {offsets.map((o) => {
                  const cell = r.retention[o];
                  if (!cell) return <td key={o} style={{ padding: 3 }}></td>;
                  const p = cell.pct;
                  return (
                    <td key={o} style={{ padding: 3, textAlign: "center" }}>
                      <div
                        title={`${cell.month}: ${cell.active}/${r.size} attivi (${pct(p)})`}
                        style={{
                          background: rgba(CP.accent, 0.08 + 0.5 * (p / 100)),
                          color: p >= 55 ? CP.textPrimary : CP.textSecondary,
                          borderRadius: 5, padding: "6px 4px", fontFamily: FONTS.mono, fontSize: 11.5, fontWeight: 500,
                        }}
                      >
                        {pct(p)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CpCard>
  );
}

function DormantWhales({ dormant }) {
  const fans = dormant?.fans || [];
  return (
    <CpCard padding="16px 18px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <TrendingDown size={15} strokeWidth={1.8} color={CP.accentRed} />
        <SectionLabel>Whale dormienti · segnale di retention-risk</SectionLabel>
      </div>
      <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "4px 0 14px" }}>
        Fan da almeno $500 lifetime che non acquistano da oltre 21 giorni (rispetto all'ultima attività registrata). Segnale per una review di retention — l'azione di riattivazione, se decisa, si fa in Infloww.
      </p>
      {fans.length === 0 ? (
        <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Nessun whale dormiente: nessun fan altospendente è inattivo oltre soglia.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 420 }}>
            <thead>
              <tr style={{ color: CP.textMuted }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Fan</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Lifetime</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Acquisti</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Fermo da</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Tipo prev.</th>
              </tr>
            </thead>
            <tbody>
              {fans.map((f) => (
                <tr key={f.pseudo} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                  <td style={{ padding: "8px 10px", fontFamily: FONTS.mono, color: CP.textSecondary }}>fan·{f.pseudo}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: FONTS.mono, color: CP.textPrimary, fontWeight: 500 }}>{usd(f.gross_usd)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: FONTS.mono, color: CP.textMuted }}>{f.count}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: FONTS.mono, color: f.days_since > 45 ? CP.accentRed : CP.textSecondary }}>{f.days_since}g</td>
                  <td style={{ padding: "8px 10px", color: CP.textMuted }}>{f.top_type ? f.top_type.replace(/_/g, " ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CpCard>
  );
}

function Skeleton({ lines = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 44, background: CP.surface, border: `1px solid ${CP.borderSoft}`, borderRadius: 8, opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}
