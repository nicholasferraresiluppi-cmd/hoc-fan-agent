"use client";

// Operator Signal Profile — "dove sei carente", per operatore, dal lavoro vero.
// Vista admin (SEED). Diagnosi di coaching dai turni singoli reali; non entra
// in score/comp. Estende /admin/academy-signals (org-level) alla grana operatore.
//
// Redesign 26/09/2026 (pannello tester SM/TL/BOARD/UX): 168 card una sotto
// l'altra, con "Da lavorare" in rosso su 134 → nessuno sapeva da chi partire e
// il rosso non significava più niente. Ora: numero principale = operatori
// "da coachare" (metodo e resa sotto i colleghi) con gli altri tre gruppi
// spiegati accanto; filtri per gruppo; UNA tabella ordinabile (ogni abitudine
// è una colonna, si ordina per trovare chi è più indietro su quella); il
// dettaglio (percorso Academy, copertura duo, link al game film) si apre al
// clic sulla riga. Tenute tutte le dichiarazioni: solo turni singoli, metodo e
// resa affiancati mai fusi, prezzo PPV dipende dal mix, duo = invito a guardare.

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, card, NUM } from "@/components/ds";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const VERDICT = {
  forte: { color: CP.accentGreen, label: "forte" },
  ok: { color: CP.textMuted, label: "in linea" },
  gap: { color: CP.accentRed, label: "da allenare" },
  "n/d": { color: CP.textMuted, label: "n/d" },
};

// Quadrante metodo × resa (dal lib). Colori: verde=bene, rosso=coach, viola=le
// diagonali interessanti (metodo ≠ resa). Solo come puntino-segnale.
// short DEVE combaciare con classifyQuadrant (lib) — stessa etichetta ovunque.
const QUAD = {
  star: { color: CP.accentGreen, short: "Metodo e resa", hint: "abitudini giuste e vende sopra i colleghi: da replicare" },
  potential: { color: CP.accentSoftText, short: "Buone abitudini, resa sotto", hint: "fa le cose giuste ma vende meno: guarda creator e turni assegnati" },
  fragile: { color: CP.accent, short: "Rende senza metodo", hint: "vende sopra i colleghi senza le abitudini: regge finché regge il creator" },
  coach: { color: CP.accentRed, short: "Da coachare", hint: "sotto sia sulle abitudini sia sul venduto" },
};
const QUAD_ORDER = ["coach", "potential", "fragile", "star"];
const revVsPeers = (idx) => {
  if (idx == null) return null;
  const d = Math.round((idx - 1) * 100);
  return `${d < 0 ? "−" : "+"}${Math.abs(d)}%`; // − U+2212 come la legenda
};

const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const Dot = ({ color }) => <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0, display: "inline-block" }} />;

function QuadrantTag({ q }) {
  if (!q) return <span style={{ color: CP.textMuted }}>—</span>;
  const c = QUAD[q.key] || QUAD.coach;
  return (
    <span title={q.note} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 13, color: CP.textSecondary }}>
      <Dot color={c.color} />
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
        border: `1px solid ${m.verdict === "gap" ? alpha(CP.accentRed, "55") : CP.borderSoft}`,
        borderRadius: 8,
        minWidth: 110,
      }}
    >
      <span style={{ fontSize: 12, color: CP.textMuted }}>
        {m.label}
        {m.caveat && <span style={{ color: CP.accentSoftText }}> *</span>}
      </span>
      <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500, ...NUM }}>
        {m.display} <span style={{ fontSize: 12, fontWeight: 400, color: v.color }}>{v.label}</span>
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
  if (r.key === "avg_ppv_price") return CP.accentSoftText; // informativo, non un giudizio
  return r.verdict === "più domande in duo" ? CP.accentRed : CP.accentGreen;
}

function DuoBlock({ duo, operator }) {
  if (!duo) return null;
  const periodTxt = duo.period ? `${fmtDateIt(duo.period.from)}–${fmtDateIt(duo.period.to)}` : null;
  // nome export mostrato solo se differisce dal nome warehouse: espone un
  // eventuale match dubbio (stessa normalizzazione, scrittura diversa).
  const nameDiffers = duo.operator_export && operator && duo.operator_export.trim().toLowerCase() !== operator.trim().toLowerCase();
  const meta = [nameDiffers ? `export "${duo.operator_export}"` : null, duo.msgs != null ? `${duo.msgs.toLocaleString("it-IT")} messaggi` : null, periodTxt].filter(Boolean).join(" · ");
  // il flag è "forte" (rosso, bordo acceso) solo se il periodo dell'export è noto e
  // recente: altrimenti il delta può venire dallo sfasamento temporale, non dai duo.
  const liveFlag = duo.flag && !duo.stale && duo.period_known;
  const flagNote = duo.stale ? " · export vecchio" : !duo.period_known ? " · periodo sconosciuto" : "";
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: CP.bgSunken, border: `1px solid ${liveFlag ? alpha(CP.accentRed, "55") : CP.borderSoft}`, borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: duo.rows.length ? 6 : 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: CP.textSecondary }}>Turni in coppia: da solo (warehouse) contro tutti i turni (export Infloww)</span>
        {duo.flag && (
          <span style={{ color: liveFlag ? CP.accentRed : CP.textMuted }} title={liveFlag ? undefined : "confronto meno affidabile: verifica il periodo dell'export"}>
            più domande in coppia{flagNote}
          </span>
        )}
        {meta && <span style={{ marginLeft: "auto" }}>{meta}</span>}
      </div>
      {duo.rows.length === 0 ? (
        <div style={{ fontSize: 12, color: CP.textMuted }}>Export presente ma nessun segnale confrontabile.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {duo.rows.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, flexWrap: "wrap", ...NUM }}>
              <span style={{ color: CP.textMuted, minWidth: 130 }}>
                {r.label}
                {r.caveat && <span style={{ color: CP.accentSoftText }}> *</span>}
              </span>
              <span style={{ color: CP.textSecondary }}>
                {fmtDuoVal(r.key, r.single)} <span style={{ color: CP.textMuted }}>da solo</span>
              </span>
              <span style={{ color: CP.textMuted }}>→</span>
              <span style={{ color: CP.textPrimary }}>
                {fmtDuoVal(r.key, r.all)} <span style={{ color: CP.textMuted }}>tutti i turni</span>
              </span>
              <span style={{ color: duoVerdictColor(r), fontSize: 12 }}>{r.verdict}</span>
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
      <summary style={{ cursor: "pointer", fontSize: 13, color: CP.accentSoftText }}>
        {list.length} operatori visibili solo dall&apos;export Infloww
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((o) => (
          <div key={o.operator} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, flexWrap: "wrap", ...NUM }}>
            <span style={{ color: CP.textPrimary, minWidth: 140, fontWeight: 500 }}>{o.operator}</span>
            <span style={{ color: CP.textMuted }}>{o.msgs != null ? o.msgs.toLocaleString("it-IT") : "—"} messaggi</span>
            {o.question_rate != null && <span style={{ color: CP.textSecondary }}>domande {Math.round(o.question_rate * 100)}%</span>}
            {o.avg_ppv_price != null && <span style={{ color: CP.textSecondary }}>PPV ${Math.round(o.avg_ppv_price)}</span>}
          </div>
        ))}
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>
          Non hanno abbastanza turni da soli per un profilo dal warehouse, oppure il nome nell&apos;export non combacia. Solo segnali
          dell&apos;export, per il coaching.
        </div>
      </div>
    </details>
  );
}

// Coda film: momenti NUOVI da giudicare sugli operatori seguiti (libreria
// attivata). È il punto d'ingresso del rituale settimanale del coach: si parte
// da qui, non dal ricordarsi di aprire N pagine.
function FilmQueueBanner() {
  const { data } = useSWR("/api/admin/operator-film/queue", fetcher, { revalidateOnFocus: false });
  if (!data || !data.rows?.length) return null;
  return (
    <div style={{ ...card, padding: "12px 14px", marginBottom: 14, borderColor: data.nuovi > 0 ? alpha(CP.accent, "55") : CP.border }}>
      <div style={{ fontSize: 13, color: CP.textSecondary, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", ...NUM }}>
        <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Coda del game film</span>
        <span>{data.operators} operatori seguiti</span>
        {data.nuovi > 0 ? (
          <span style={{ color: CP.accentSoftText, fontWeight: 500 }}>{data.nuovi} momenti nuovi da giudicare</span>
        ) : (
          <span style={{ color: CP.textMuted }}>nessun momento nuovo</span>
        )}
      </div>
      {data.nuovi > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {data.rows
            .filter((r) => r.counts?.nuovi > 0)
            .slice(0, 12)
            .map((r) => (
              <Link
                key={r.operator}
                href={`/admin/operator-signals/${encodeURIComponent(r.operator)}`}
                style={{ fontSize: 12, color: CP.textSecondary, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, padding: "3px 10px", borderRadius: 999, textDecoration: "none", ...NUM }}
              >
                {r.operator} · <span style={{ color: CP.accentSoftText }}>{r.counts.nuovi}</span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

function DuoCoverageSection({ dc }) {
  // dc null = store non leggibile: silenzioso, il profilo regge lo stesso.
  if (!dc) return null;
  if (!dc.store_count) {
    return (
      <Notice>
        Turni in coppia: nessun export Infloww caricato, quindi restano fuori dal profilo (il warehouse non sa chi ha scritto).{" "}
        <Link href="/admin/infloww-ingest" style={{ color: CP.accentSoftText, textDecoration: "none" }}>
          Carica un export →
        </Link>
      </Notice>
    );
  }
  return (
    <div style={{ ...card, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: CP.textSecondary, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", ...NUM }}>
        <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Turni in coppia (export Infloww)</span>
        <span>{dc.matched} con confronto</span>
        {dc.diverging > 0 && <span style={{ color: CP.accentRed }}>{dc.diverging} fanno più domande in coppia</span>}
        {dc.infloww_only.length > 0 && <span>{dc.infloww_only.length} solo da export</span>}
        {dc.warehouse_only > 0 && <span style={{ color: CP.textMuted }}>{dc.warehouse_only} senza export</span>}
        {dc.ambiguous > 0 && (
          <span style={{ color: CP.textMuted }} title="nomi che coincidono una volta normalizzati: non attribuiti per prudenza">
            {dc.ambiguous} {dc.ambiguous === 1 ? "nome ambiguo" : "nomi ambigui"}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: CP.textMuted, fontSize: 12 }}>
          export aggiornato al {dc.store_updated_at ? new Date(dc.store_updated_at).toLocaleDateString("it-IT") : "—"}
        </span>
      </div>
      {dc.infloww_only.length > 0 && <InflowwOnly list={dc.infloww_only} />}
    </div>
  );
}

function OperatorDetail({ p, onClose }) {
  const q = p.quadrant ? QUAD[p.quadrant.key] : null;
  return (
    <div style={{ ...card, padding: "16px 18px", marginBottom: 12, borderColor: CP.accentDim }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{p.operator}</span>
            <QuadrantTag q={p.quadrant} />
          </div>
          {p.quadrant?.note && <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 2 }}>{p.quadrant.note}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href={`/admin/operator-signals/${encodeURIComponent(p.operator)}`} style={{ ...btn, textDecoration: "none" }}>
            Game film: vinte e occasioni scivolate →
          </Link>
          <button onClick={onClose} aria-label="Chiudi" style={{ ...btn, padding: "8px 10px", display: "inline-flex" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 8, ...NUM }}>
        {p.shifts} turni da solo · {p.msgs.toLocaleString("it-IT")} messaggi
        {p.rev_per_h != null ? ` · $${p.rev_per_h.toLocaleString("it-IT")} venduti all'ora` : ""}
        {p.rev_index != null ? (
          <span style={{ color: p.rev_index >= 1 ? CP.accentGreen : CP.accentRed }}>{` · ${revVsPeers(p.rev_index)} rispetto ai colleghi sugli stessi creator`}</span>
        ) : (
          ""
        )}
      </div>

      {p.top_gap ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Da allenare: {p.top_gap.label}.</span> {p.top_gap.path?.focus || p.top_gap.coaching}
          </div>
          {p.top_gap.path?.scenarios?.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: CP.textMuted }}>Scenari Academy consigliati:</span>
              {p.top_gap.path.scenarios.map((s) => (
                <span
                  key={s.id}
                  title={`${s.title} · difficoltà ${s.difficulty}/5`}
                  style={{ fontSize: 12, color: CP.textSecondary, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, padding: "3px 9px", borderRadius: 999 }}
                >
                  {s.title.length > 46 ? s.title.slice(0, 44) + "…" : s.title}
                </span>
              ))}
              <Link href="/" style={{ fontSize: 12, color: CP.accentSoftText, textDecoration: "none" }}>
                apri Academy →
              </Link>
            </div>
          )}
        </div>
      ) : p.top_strength ? (
        <div style={{ marginTop: 12, fontSize: 14, color: CP.textSecondary }}>
          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Punto forte: {p.top_strength.label}.</span> Nessuna abitudine chiaramente sotto
          gli altri.
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 14, color: CP.textMuted }}>Profilo in linea con il resto dell&apos;organizzazione.</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
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
  const [sel, setSel] = useState(null);
  const detailRef = useRef(null);

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
  // conteggi globali per il numero principale (indipendenti dai filtri)
  const quadAll = useMemo(() => {
    const c = { star: 0, potential: 0, fragile: 0, coach: 0 };
    for (const p of profiles) if (p.quadrant) c[p.quadrant.key] = (c[p.quadrant.key] || 0) + 1;
    return c;
  }, [profiles]);

  const selected = sel ? profiles.find((p) => p.operator === sel) : null;
  useEffect(() => {
    if (selected && detailRef.current) detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  // una colonna per abitudine, nell'ordine del lib (stessa definizione ovunque)
  const metricDefs = (profiles.find((p) => p.metrics?.length)?.metrics || []).map((m) => ({ key: m.key, label: m.label, caveat: m.caveat }));
  const columns = [
    { key: "operator", label: "Operatore", render: (p) => <span style={{ fontWeight: 500 }}>{p.operator}</span> },
    { key: "quadrant", label: "Gruppo", sort: (p) => (p.quadrant ? QUAD_ORDER.indexOf(p.quadrant.key) : 9), render: (p) => <QuadrantTag q={p.quadrant} /> },
    { key: "top_gap", label: "Da allenare", sort: (p) => p.top_gap?.label || "~", render: (p) => (p.top_gap ? p.top_gap.label : <span style={{ color: CP.textMuted }}>—</span>) },
    {
      key: "rev_index", label: "Venduto vs colleghi", align: "right",
      render: (p) => (p.rev_index == null ? <span style={{ color: CP.textMuted }}>—</span> : <span style={{ color: p.rev_index >= 1 ? CP.accentGreen : CP.accentRed }}>{revVsPeers(p.rev_index)}</span>),
    },
    { key: "rev_per_h", label: "Venduto all'ora", align: "right", muted: true, render: (p) => (p.rev_per_h == null ? "—" : `$${p.rev_per_h.toLocaleString("it-IT")}`) },
    { key: "shifts", label: "Turni da solo", align: "right", muted: true },
    ...metricDefs.map((d) => ({
      key: `m_${d.key}`,
      label: d.caveat ? `${d.label} *` : d.label,
      align: "right",
      sort: (p) => p.metrics.find((m) => m.key === d.key)?.value ?? null,
      render: (p) => {
        const m = p.metrics.find((x) => x.key === d.key);
        if (!m) return "—";
        const v = VERDICT[m.verdict] || VERDICT["n/d"];
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            {m.display}
            {m.verdict !== "ok" && m.verdict !== "n/d" && <span style={{ marginLeft: 6, fontSize: 12, color: v.color }}>{v.label}</span>}
          </span>
        );
      },
    })),
  ];

  const inputStyle = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 999, color: CP.textPrimary, fontSize: 13, padding: "7px 12px", outline: "none", fontFamily: FONTS.body };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Training" }, { label: "Profilo operatore" }]}
        title="Profilo segnali operatore"
        subtitle="Chi allenare e su cosa: per ogni operatore, le abitudini che fanno vendere (metodo) accanto a quanto vende rispetto ai colleghi sugli stessi creator (resa). Serve al coaching, non è uno score."
        actions={
          <button onClick={refresh} disabled={busy || data?.bigquery === false} style={{ ...btn, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Ricalcolo…" : "Ricalcola"}
          </button>
        }
      />

      {refreshErr && <Notice danger>Ricalcolo fallito: {refreshErr}.</Notice>}

      {error ? (
        <Notice danger>Non riesco a calcolare i profili: {error.message}.</Notice>
      ) : data?.bigquery === false ? (
        <Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente: i profili non sono calcolabili.</Notice>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Calcolo dai turni reali…</div>
      ) : (
        <>
          {profiles.length > 0 && (
            <HeroMetric
              label="Da coachare: sotto i colleghi sia sulle abitudini sia sul venduto"
              value={quadAll.coach}
              compare={`su ${profiles.length} operatori profilati · ${withGap} hanno almeno un'abitudine da allenare`}
              hint={`turni con un solo operatore in chat, ultimi ${data?.params?.days} giorni, almeno ${data?.params?.minOpShifts} turni a testa`}
            >
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                {["potential", "fragile", "star"].map((k) => (
                  <div key={k} style={{ maxWidth: 220 }}>
                    <Metric label={QUAD[k].short} value={quadAll[k]} note={QUAD[k].hint} />
                  </div>
                ))}
              </div>
            </HeroMetric>
          )}

          <FilmQueueBanner />
          <DuoCoverageSection dc={data?.duo_coverage} />

          {profiles.length === 0 ? (
            <Notice>
              Nessun operatore con abbastanza turni da solo nel periodo. I turni in coppia non entrano (non si può sapere chi ha scritto): la
              copertura si estende caricando l&apos;export Infloww.
            </Notice>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <FilterChip label={`Tutti (${quadCounts.star + quadCounts.potential + quadCounts.fragile + quadCounts.coach})`} active={!quadFilter} onClick={() => setQuadFilter(null)} />
                {QUAD_ORDER.map((k) => (
                  <FilterChip
                    key={k}
                    label={`${QUAD[k].short} (${quadCounts[k] || 0})`}
                    active={quadFilter === k}
                    onClick={() => setQuadFilter(quadFilter === k ? null : k)}
                    disabled={!quadCounts[k]}
                  />
                ))}
                <FilterChip label="Solo con un'abitudine da allenare" active={onlyGaps} onClick={() => setOnlyGaps(!onlyGaps)} />
                <input placeholder="Cerca operatore…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, minWidth: 180, flex: "0 1 220px" }} aria-label="Cerca operatore" />
              </div>

              <div ref={detailRef}>{selected && <OperatorDetail p={selected} onClose={() => setSel(null)} />}</div>

              <DataTable
                columns={columns}
                rows={shown.map((p) => ({ ...p, id: p.operator }))}
                defaultSort={{ key: "rev_index", dir: -1 }}
                onRowClick={(p) => setSel(sel === p.operator ? null : p.operator)}
                selected={(p) => p.operator === sel}
                minWidth={1250}
                maxHeight="calc(100vh - 240px)"
                empty="Nessun operatore con questi filtri."
              />
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>
                Clic su una riga per il percorso di allenamento, il confronto coi turni in coppia e il game film. Clic sulle intestazioni per
                ordinare: su un&apos;abitudine trovi chi è più indietro.
              </div>
            </>
          )}

          <div style={{ marginTop: 16, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 6px" }}>
              <span style={{ color: CP.accentSoftText }}>*</span> Prezzo PPV: dipende in parte dal mix di creator e fan seguiti, non solo
              dall&apos;operatore. Leggilo insieme alla cadenza.
            </p>
            <p style={{ margin: "0 0 6px" }}>
              <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Metodo</strong>: le abitudini dell&apos;operatore confrontate con
              quelle di tutti gli altri. <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Resa</strong>: venduto reale diviso il
              venduto atteso sui creator che lavora (quanto vendono all&apos;ora i colleghi su quegli stessi creator); +% sopra i colleghi, −%
              sotto. Le due misure sono <strong style={{ fontWeight: 500, color: CP.textSecondary }}>affiancate, mai fuse</strong>: le coppie
              opposte (abitudini buone ma resa bassa, o il contrario) sono le più istruttive.
            </p>
            <p style={{ margin: "0 0 6px" }}>
              Base: turni con un solo operatore in chat degli ultimi {data?.params?.days} giorni, almeno {data?.params?.minOpShifts} turni per
              operatore. <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Turni in coppia</strong>: dove esiste un export Infloww
              dell&apos;operatore, tasso di domande e prezzo PPV dei soli turni da solo (warehouse) sono affiancati agli stessi segnali su{" "}
              <em>tutti</em> i turni (export, coppie incluse). Fonti separate, periodi e definizioni diversi: è un invito a guardare, non un dato
              contabile.
            </p>
            <p style={{ margin: 0 }}>
              Metodo {data?.version}. Aggiornato{" "}
              {data?.generated_at ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}.
              {data?.cached ? " (dati in cache)" : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
