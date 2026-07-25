"use client";

// Operator Signal Profile — "dove sei carente", per operatore, dal lavoro vero.
// Vista admin (SEED). Diagnosi di coaching dai turni singoli reali; non entra
// in score/comp. Estende /admin/academy-signals (org-level) alla grana operatore.

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const VERDICT = {
  forte: { color: CP.accentGreen, label: "forte" },
  ok: { color: CP.textSecondary, label: "in linea" },
  gap: { color: CP.accentRed, label: "gap" },
  "n/d": { color: CP.textMuted, label: "n/d" },
};

// Quadrante metodo × resa (dal lib). Colori: verde=bene, rosso=coach, blu/viola=le
// diagonali interessanti (metodo ≠ resa).
// short DEVE combaciare con classifyQuadrant (lib) — stessa etichetta ovunque.
const QUAD = {
  star: { color: CP.accentGreen, short: "Metodo e resa" },
  potential: { color: CP.accentBlue, short: "Buone abitudini, resa sotto" },
  fragile: { color: CP.accent, short: "Rende senza metodo" },
  coach: { color: CP.accentRed, short: "Da coachare" },
};
const QUAD_ORDER = ["star", "potential", "fragile", "coach"];
const revVsPeers = (idx) => {
  if (idx == null) return null;
  const d = Math.round((idx - 1) * 100);
  return `${d < 0 ? "−" : "+"}${Math.abs(d)}% vs pari`; // − U+2212 come la legenda
};

function QuadrantBadge({ q }) {
  if (!q) return null;
  const c = QUAD[q.key] || QUAD.coach;
  return (
    <span title={q.note} style={{ fontSize: 11, color: c.color, background: `${c.color}1c`, border: `1px solid ${c.color}55`, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {q.label}
    </span>
  );
}

function MetricChip({ m }) {
  const v = VERDICT[m.verdict] || VERDICT["n/d"];
  return (
    <div
      title={m.caveat || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 10px",
        background: CP.bgSunken,
        border: `1px solid ${m.verdict === "gap" ? `${CP.accentRed}55` : CP.borderSoft}`,
        borderRadius: 8,
        minWidth: 92,
      }}
    >
      <span style={{ fontSize: 10.5, color: CP.textMuted }}>
        {m.label}
        {m.caveat && <span style={{ color: CP.accentBlue }}> *</span>}
      </span>
      <span style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>
        {m.display} <span style={{ fontSize: 10.5, color: v.color }}>{v.label}</span>
      </span>
    </div>
  );
}

// --- Copertura duo (segnali export Infloww) ---
const fmtDuoVal = (key, v) => {
  if (v == null) return "—";
  if (key === "question_rate") return `${Math.round(v * 100)}%`;
  if (key === "avg_ppv_price") return `$${Math.round(v)}`;
  return String(v);
};
// "2026-07-20" → "20/07/2026" (parse manuale: niente shift di fuso su new Date)
const fmtDateIt = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "?";
};
function duoVerdictColor(r) {
  if (r.verdict === "coerente") return CP.textMuted;
  if (r.key === "avg_ppv_price") return CP.accentBlue; // informativo, non un giudizio
  return r.verdict === "più domande in duo" ? CP.accentRed : CP.accentGreen;
}

function DuoBlock({ duo, operator }) {
  if (!duo) return null;
  const periodTxt = duo.period ? `${fmtDateIt(duo.period.from)}–${fmtDateIt(duo.period.to)}` : null;
  // nome export mostrato solo se differisce dal nome warehouse: espone un
  // eventuale match dubbio (stessa normalizzazione, scrittura diversa).
  const nameDiffers = duo.operator_export && operator && duo.operator_export.trim().toLowerCase() !== operator.trim().toLowerCase();
  const meta = [nameDiffers ? `export "${duo.operator_export}"` : null, duo.msgs != null ? `${duo.msgs.toLocaleString("it-IT")} msg` : null, periodTxt].filter(Boolean).join(" · ");
  // il flag è "forte" (rosso, bordo acceso) solo se il periodo dell'export è noto e
  // recente: altrimenti il delta può venire dallo sfasamento temporale, non dai duo.
  const liveFlag = duo.flag && !duo.stale && duo.period_known;
  const flagNote = duo.stale ? " · export vecchio" : !duo.period_known ? " · periodo sconosciuto" : "";
  return (
    <div style={{ marginTop: 10, padding: "8px 11px", background: CP.bgSunken, border: `1px solid ${liveFlag ? `${CP.accentRed}55` : CP.borderSoft}`, borderRadius: 8 }}>
      <div style={{ fontSize: 10.5, color: CP.textMuted, marginBottom: duo.rows.length ? 6 : 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>Copertura duo — singolo (warehouse) vs tutti i turni (export)</span>
        {duo.flag && (
          <span style={{ color: liveFlag ? CP.accentRed : CP.textMuted }} title={liveFlag ? undefined : "confronto meno affidabile: verifica il periodo dell'export"}>
            più domande in duo{flagNote}
          </span>
        )}
        {meta && <span style={{ marginLeft: "auto" }}>{meta}</span>}
      </div>
      {duo.rows.length === 0 ? (
        <div style={{ fontSize: 11.5, color: CP.textMuted }}>Export presente ma nessun segnale confrontabile.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {duo.rows.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: CP.textMuted, minWidth: 118 }}>
                {r.label}
                {r.caveat && <span style={{ color: CP.accentBlue }}> *</span>}
              </span>
              <span style={{ color: CP.textSecondary }}>
                {fmtDuoVal(r.key, r.single)} <span style={{ color: CP.textMuted }}>singolo</span>
              </span>
              <span style={{ color: CP.textMuted }}>→</span>
              <span style={{ color: CP.textPrimary }}>
                {fmtDuoVal(r.key, r.all)} <span style={{ color: CP.textMuted }}>tutti</span>
              </span>
              <span style={{ color: duoVerdictColor(r), fontSize: 11 }}>{r.verdict}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InflowwOnly({ list }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, color: CP.accentSoftText }}>
        {list.length} operatori visibili solo dall&apos;export duo
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((o) => (
          <div key={o.operator} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12, flexWrap: "wrap" }}>
            <span style={{ color: CP.textPrimary, minWidth: 120, fontWeight: 500 }}>{o.operator}</span>
            <span style={{ color: CP.textMuted }}>{o.msgs != null ? o.msgs.toLocaleString("it-IT") : "—"} msg</span>
            {o.question_rate != null && <span style={{ color: CP.textSecondary }}>domande {Math.round(o.question_rate * 100)}%</span>}
            {o.avg_ppv_price != null && <span style={{ color: CP.textSecondary }}>PPV ${Math.round(o.avg_ppv_price)}</span>}
          </div>
        ))}
        <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>
          Nessun turno singolo sufficiente per un profilo warehouse — oppure il nome nell&apos;export non combacia. Solo segnali dell&apos;export, coaching.
        </div>
      </div>
    </details>
  );
}

function DuoCoverageSection({ dc }) {
  // dc null = store non leggibile: silenzioso, il profilo regge lo stesso.
  if (!dc) return null;
  if (!dc.store_count) {
    return (
      <div style={{ padding: "12px 14px", marginBottom: 14, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, fontSize: 12.5, color: CP.textSecondary }}>
        Copertura duo: nessun export Infloww ingerito. I turni in duo restano fuori dal profilo (il warehouse non attribuisce chi ha scritto).{" "}
        <Link href="/admin/infloww-ingest" style={{ color: CP.accentSoftText, textDecoration: "none" }}>
          Carica un export →
        </Link>
      </div>
    );
  }
  return (
    <div style={{ padding: "12px 14px", marginBottom: 14, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12.5, color: CP.textSecondary, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Copertura duo</span>
        <span>{dc.matched} con confronto</span>
        {dc.diverging > 0 && <span style={{ color: CP.accentRed }}>{dc.diverging} con più domande in duo</span>}
        {dc.infloww_only.length > 0 && <span>{dc.infloww_only.length} solo da export</span>}
        {dc.warehouse_only > 0 && <span style={{ color: CP.textMuted }}>{dc.warehouse_only} senza export</span>}
        {dc.ambiguous > 0 && (
          <span style={{ color: CP.textMuted }} title="nomi che coincidono una volta normalizzati: non attribuiti per prudenza">
            {dc.ambiguous} {dc.ambiguous === 1 ? "nome ambiguo" : "nomi ambigui"}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: CP.textMuted, fontSize: 11.5 }}>
          export agg. {dc.store_updated_at ? new Date(dc.store_updated_at).toLocaleDateString("it-IT") : "—"}
        </span>
      </div>
      {dc.infloww_only.length > 0 && <InflowwOnly list={dc.infloww_only} />}
    </div>
  );
}

function OperatorCard({ p }) {
  return (
    <div
      style={{
        background: CP.surface,
        border: `1px solid ${p.top_gap ? `${CP.accentRed}44` : CP.border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>{p.operator}</span>
          <QuadrantBadge q={p.quadrant} />
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted }}>
          {p.shifts} turni singoli · {p.msgs.toLocaleString("it-IT")} messaggi
          {p.rev_per_h != null ? ` · $${p.rev_per_h.toLocaleString("it-IT")}/h` : ""}
          {p.rev_index != null ? <span style={{ color: p.rev_index >= 1 ? CP.accentGreen : CP.accentRed }}>{` · ${revVsPeers(p.rev_index)}`}</span> : ""}
        </div>
      </div>

      {p.top_gap ? (
        <div style={{ margin: "8px 0 0" }}>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>
            <span style={{ color: CP.accentRed }}>Da lavorare — {p.top_gap.label}:</span>{" "}
            {p.top_gap.path?.focus || p.top_gap.coaching}
          </div>
          {p.top_gap.path?.scenarios?.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: CP.textMuted }}>Percorso:</span>
              {p.top_gap.path.scenarios.map((s) => (
                <span
                  key={s.id}
                  title={`${s.title} · difficoltà ${s.difficulty}/5`}
                  style={{ fontSize: 11.5, color: CP.textSecondary, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, padding: "3px 9px", borderRadius: 999 }}
                >
                  {s.title.length > 46 ? s.title.slice(0, 44) + "…" : s.title}
                </span>
              ))}
              <Link href="/" style={{ fontSize: 11.5, color: CP.accentSoftText, textDecoration: "none" }}>
                apri Academy →
              </Link>
            </div>
          )}
        </div>
      ) : p.top_strength ? (
        <div style={{ margin: "8px 0 0", fontSize: 13, color: CP.textSecondary }}>
          <span style={{ color: CP.accentGreen }}>Punto forte — {p.top_strength.label}.</span> Nessun gap marcato sui segnali misurati.
        </div>
      ) : (
        <div style={{ margin: "8px 0 0", fontSize: 13, color: CP.textMuted }}>Profilo in linea con l&apos;org.</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {p.metrics.map((m) => (
          <MetricChip key={m.key} m={m} />
        ))}
      </div>

      <DuoBlock duo={p.duo} operator={p.operator} />
    </div>
  );
}

export default function OperatorSignalsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/operator-signals", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);
  const [q, setQ] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [quadFilter, setQuadFilter] = useState(null);

  async function refresh() {
    setBusy(true);
    setRefreshErr(null);
    try {
      const res = await fetch("/api/admin/operator-signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const fresh = await res.json();
      if (res.ok) mutate(fresh, { revalidate: false });
      else setRefreshErr(fresh.error || "Ricalcolo fallito");
    } catch (e) {
      setRefreshErr(e.message || "Ricalcolo fallito");
    } finally {
      setBusy(false);
    }
  }

  const profiles = data?.profiles || [];
  const withGap = profiles.filter((p) => p.top_gap).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return profiles.filter(
      (p) =>
        (!onlyGaps || p.top_gap) &&
        (!quadFilter || p.quadrant?.key === quadFilter) &&
        (!needle || p.operator.toLowerCase().includes(needle))
    );
  }, [profiles, q, onlyGaps, quadFilter]);

  // conteggi per quadrante sul sottoinsieme visibile (ricerca + solo-gap), non
  // globali: così il numero sul bottone riflette cosa restituisce cliccarlo.
  const quadCounts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = profiles.filter((p) => (!onlyGaps || p.top_gap) && (!needle || p.operator.toLowerCase().includes(needle)));
    const c = { star: 0, potential: 0, fragile: 0, coach: 0 };
    for (const p of base) if (p.quadrant) c[p.quadrant.key] = (c[p.quadrant.key] || 0) + 1;
    return c;
  }, [profiles, q, onlyGaps]);

  const inputStyle = { background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, padding: "8px 10px", outline: "none" };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Admin · Academy"
        title="Profilo segnali operatore"
        subtitle="Per ogni operatore: quanto fa le mosse che pagano (metodo) e quanto rende rispetto ai pari sugli stessi creator (resa aggiustata per il mix). Due misure separate, confrontate — non fuse: le diagonali opposte (abitudini ok ma resa bassa, o viceversa) sono le più istruttive. Turni a operatore singolo. Coaching, non score."
        toolbar={
          <button
            onClick={refresh}
            disabled={busy || data?.bigquery === false}
            style={{ background: CP.surfaceAlt, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Ricalcolo…" : "Ricalcola"}
          </button>
        }
      />

      {refreshErr && (
        <div style={{ padding: "12px 16px", marginBottom: 12, background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 10, color: CP.accentRed, fontSize: 13 }}>
          Ricalcolo fallito: {refreshErr}.
        </div>
      )}

      {error ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          Non riesco a calcolare i profili: {error.message}.
        </div>
      ) : data?.bigquery === false ? (
        <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14 }}>
          BigQuery non configurato in questo ambiente: i profili non sono calcolabili.
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Calcolo dai turni reali…</div>
      ) : (
        <>
          <DuoCoverageSection dc={data?.duo_coverage} />

          {profiles.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                <input placeholder="Cerca operatore…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, minWidth: 200 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textSecondary, cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
                  solo con gap
                </label>
                <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: "auto" }}>
                  {profiles.length} operatori · {withGap} con un gap da coachare
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {QUAD_ORDER.map((k) => {
                  const c = QUAD[k];
                  const active = quadFilter === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setQuadFilter(active ? null : k)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: active ? `${c.color}22` : CP.surface,
                        border: `1px solid ${active ? c.color : CP.border}`,
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        color: CP.textSecondary,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.color, flexShrink: 0 }} />
                      <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{quadCounts[k] || 0}</span>
                      {c.short}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {profiles.length === 0 ? (
            <div style={{ padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14 }}>
              Nessun operatore con abbastanza turni a operatore singolo nel periodo. I turni in duo non entrano
              (non si può attribuire chi ha scritto) — la copertura si estende col match dell&apos;export Infloww.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shown.map((p) => (
                <OperatorCard key={p.operator} p={p} />
              ))}
              {shown.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun operatore con questi filtri.</div>}
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 12, color: CP.textMuted }}>
            <span style={{ color: CP.accentBlue }}>*</span> Prezzo PPV: dipende in parte dal mix di creator/fan seguiti, non solo dall&apos;operatore — leggilo insieme alla cadenza.
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            Base: turni a operatore singolo degli ultimi {data?.params?.days} giorni, min {data?.params?.minOpShifts} turni per operatore.
            <strong> Metodo</strong>: media dei segnali comportamentali vs la distribuzione org. <strong>Resa</strong>: venduto reale ÷ venduto
            atteso dato il mix di creator che lavora (baseline = venduto/ora dei pari sullo stesso creator) → +% sopra i pari, −% sotto. Le due
            misure sono <strong>affiancate, mai fuse</strong>. <strong>Copertura duo</strong>: dove esiste un export Infloww per l&apos;operatore, il
            tasso domande e il prezzo PPV del solo turno singolo (warehouse) sono affiancati agli stessi segnali su <em>tutti</em> i turni (export,
            inclusi i duo) — la differenza riguarda anche i turni in duo. Fonti separate, finestre e definizioni diverse: è un invito a guardare,
            non un dato contabile. Metodologia {data?.version}. Aggiornato {data?.generated_at ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}.{data?.cached ? " (cache)" : ""}
          </div>
        </>
      )}
    </div>
  );
}
