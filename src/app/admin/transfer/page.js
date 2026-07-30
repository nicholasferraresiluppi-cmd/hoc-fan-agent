"use client";

// Transfer measurement (Kirkpatrick 3-4) — vista coach (SEED). La traiettoria
// comportamentale di ogni operatore mese per mese, dai turni singoli reali, con
// gli eventi di coaching sovrapposti. Osservazionale: mostra il MOVIMENTO, non
// l'effetto attribuibile. È la domanda "la formazione sposta il comportamento
// vero?" resa concreta — l'unica cosa che i dati del campo permettono.

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const FMT = {
  question_rate: (v) => `${Math.round(v * 100)}%`,
  avg_ppv_price: (v) => `$${Math.round(v)}`,
  ppv_per_h: (v) => `${Number(v).toFixed(1)}/h`,
  msgs_per_h: (v) => `${Math.round(v)}/h`,
};
const fmt = (key, v) => (v == null ? "—" : (FMT[key] || String)(v));

// Sparkline self-referenced (min/max sulla serie dell'operatore), con dot finale,
// mese parziale a vuoto, e tacche per gli eventi di coaching su quella metrica.
function Sparkline({ series, good, eventMonths }) {
  const pts = series.filter((p) => p.value != null);
  const W = 132, H = 36, pad = 4;
  if (pts.length < 2) {
    return <div style={{ height: H, display: "flex", alignItems: "center", fontSize: 11, color: CP.textMuted }}>dati insufficienti</div>;
  }
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const xs = (i, n) => pad + (i * (W - 2 * pad)) / (n - 1);
  const ys = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const line = pts.map((p, i) => `${xs(i, pts.length).toFixed(1)},${ys(p.value).toFixed(1)}`).join(" ");
  const stroke = good == null ? CP.textMuted : good ? CP.accentGreen : CP.accentRed;
  const last = pts[pts.length - 1];
  const monIndex = {};
  series.forEach((p, i) => (monIndex[p.mon] = i));
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={xs(pts.length - 1, pts.length)} cy={ys(last.value)} r="2.6" fill={stroke} />
      {(eventMonths || []).map((m, k) => {
        const i = monIndex[m];
        if (i == null) return null;
        const x = pad + (i * (W - 2 * pad)) / (Math.max(1, series.length - 1));
        return <line key={k} x1={x} y1={H - 2} x2={x} y2={H - 8} stroke={CP.accent} strokeWidth="1.6" />;
      })}
    </svg>
  );
}

function MetricPanel({ m, series, movement, eventMonths }) {
  const mv = movement;
  const arrow = mv ? (mv.good ? "↓" : "↑") : "";
  const arrowColor = mv ? (mv.good ? CP.accentGreen : CP.accentRed) : CP.textMuted;
  // per "better:low" un calo è buono → freccia giù verde; per "better:high" salita buona.
  const dirGood = mv?.good;
  const sign = mv && mv.delta > 0 ? "+" : "";
  return (
    <div style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: CP.textMuted, marginBottom: 4 }}>{m.label}</div>
      <Sparkline series={series} good={dirGood} eventMonths={eventMonths} />
      {mv ? (
        <div style={{ marginTop: 6, fontSize: 12, color: CP.textSecondary, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONTS.mono }}>{fmt(m.key, mv.first)}</span>
          <span style={{ color: CP.textMuted }}>→</span>
          <span style={{ fontFamily: FONTS.mono, color: CP.textPrimary }}>{fmt(m.key, mv.last)}</span>
          <span style={{ color: arrowColor, fontWeight: 500 }}>
            {arrow} {sign}{m.key === "question_rate" ? `${Math.round(mv.delta * 100)}pt` : fmt(m.key, Math.abs(mv.delta))}
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, color: CP.textMuted }}>un solo mese</div>
      )}
    </div>
  );
}

export default function TransferPage() {
  const { data, error, isLoading } = useSWR("/api/admin/transfer", fetcher, { revalidateOnFocus: false });
  const [recomputing, setRecomputing] = useState(false);
  const [onlyCoached, setOnlyCoached] = useState(false);

  async function recompute() {
    setRecomputing(true);
    try {
      const fresh = await fetch("/api/admin/transfer", { method: "POST" }).then((r) => r.json());
      mutate("/api/admin/transfer", fresh, false);
    } finally {
      setRecomputing(false);
    }
  }

  const metrics = data?.metrics || [];
  let operators = data?.operators || [];
  if (onlyCoached) operators = operators.filter((o) => o.events?.length);
  const shown = operators.slice(0, 40);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Academy · misura del transfer"
        title="Il comportamento si muove?"
        subtitle="La traiettoria comportamentale di ogni operatore sui suoi turni reali, mese per mese — con gli eventi di coaching sovrapposti. È Kirkpatrick livello 3-4: non «hai fatto la lezione?» ma «il tuo comportamento si è spostato sul campo?». L'unica cosa che i dati del vivo permettono, e che quasi nessuno può fare."
        toolbar={
          <button
            onClick={recompute}
            disabled={recomputing}
            style={{ all: "unset", cursor: recomputing ? "default" : "pointer", fontSize: 13, color: CP.accentSoftText, background: CP.accentSoft, border: `1px solid ${CP.accentDim}`, borderRadius: 8, padding: "7px 12px" }}
          >
            {recomputing ? "Ricalcolo…" : "Ricalcola dal warehouse"}
          </button>
        }
      />

      {/* banner di onestà — sempre visibile, è il punto */}
      <div style={{ background: `${CP.accentRed}12`, border: `1px solid ${CP.accentRed}33`, borderRadius: 12, padding: "14px 18px", fontSize: 13, color: CP.textSecondary, lineHeight: 1.55, marginBottom: 20 }}>
        <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Osservazionale, non causale.</span>{" "}
        Nessun gruppo di controllo: maturazione, stagionalità e fortuna-del-creator non sono separate. La traiettoria mostra il <b style={{ color: CP.textPrimary }}>movimento</b>, non l'effetto attribuibile del coaching — è Kirkpatrick come ambizione di misura, non prova. Mese corrente parziale. Solo turni a operatore singolo.
      </div>

      {error ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          Non riesco a calcolare il transfer: {error.message}
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Calcolo le traiettorie dal warehouse…</div>
      ) : data?.available === false ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14 }}>
          {data.reason || "Warehouse non disponibile."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "center", marginBottom: 18, fontSize: 13, color: CP.textMuted }}>
            <span><b style={{ color: CP.textPrimary }}>{operators.length}</b> operatori con traiettoria</span>
            <span><b style={{ color: CP.textPrimary }}>{data.months?.length || 0}</b> mesi</span>
            <span><b style={{ color: CP.textPrimary }}>{data.coaching_events_total || 0}</b> eventi di coaching sovrapposti</span>
            <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: CP.textSecondary }}>
              <input type="checkbox" checked={onlyCoached} onChange={(e) => setOnlyCoached(e.target.checked)} />
              solo con eventi di coaching
            </label>
          </div>

          {shown.length === 0 ? (
            <div style={{ color: CP.textMuted, fontSize: 14, padding: "16px 0" }}>
              {onlyCoached ? "Nessun operatore con eventi di coaching registrati ancora. Le sessioni di coaching compaiono qui man mano che vengono create." : "Nessuna traiettoria."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {shown.map((op) => (
                <div key={op.name} style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 13, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>{op.name}</span>
                    <span style={{ fontSize: 12, color: CP.textMuted }}>{op.months_active} mesi · {op.total_shifts} turni singoli</span>
                    {op.events?.length > 0 && (
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {op.events.slice(0, 3).map((e, i) => (
                          <span key={i} title={e.topic} style={{ fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 6, padding: "2px 8px" }}>
                            coaching {e.mon}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {metrics.map((m) => (
                      <MetricPanel
                        key={m.key}
                        m={m}
                        series={op.series[m.key]}
                        movement={op.movement[m.key]}
                        eventMonths={(op.events || []).filter((e) => e.metric === m.key).map((e) => e.mon)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {operators.length > shown.length && (
                <div style={{ fontSize: 12, color: CP.textMuted, padding: "6px 2px" }}>
                  Mostro i primi {shown.length} di {operators.length} (prima chi ha eventi di coaching, poi le traiettorie più lunghe).
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 24, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            Sparkline self-referenced (min/max sulla serie dell'operatore): il colore è la direzione del movimento (verde = verso il meglio secondo l'evidenza). Le tacche viola sono eventi di coaching sulla metrica corrispondente (mappatura euristica dal topic). Materiale di coaching, fuori da score/comp.
          </div>
        </>
      )}
    </div>
  );
}
