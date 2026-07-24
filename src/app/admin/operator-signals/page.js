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
        <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>{p.operator}</div>
        <div style={{ fontSize: 12, color: CP.textMuted }}>
          {p.shifts} turni singoli · {p.msgs.toLocaleString("it-IT")} messaggi{p.rev_per_h != null ? ` · $${p.rev_per_h.toLocaleString("it-IT")}/h` : ""}
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
    </div>
  );
}

export default function OperatorSignalsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/operator-signals", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);
  const [q, setQ] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

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
    return profiles.filter((p) => (!onlyGaps || p.top_gap) && (!needle || p.operator.toLowerCase().includes(needle)));
  }, [profiles, q, onlyGaps]);

  const inputStyle = { background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, padding: "8px 10px", outline: "none" };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Admin · Academy"
        title="Profilo segnali operatore"
        subtitle="Dove ogni operatore è carente, dal suo lavoro VERO (turni a operatore singolo), sui comportamenti che monetizzano. Diagnosi di coaching, non un punteggio: non entra in score né comp. Copertura limitata ai turni singoli — quelli in duo si estendono con il match dell'export Infloww."
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
            Verdetti per confronto con la distribuzione org (mediana domande {data?.org_medians?.question_rate != null ? Math.round(data.org_medians.question_rate * 100) + "%" : "—"},
            prezzo PPV ${data?.org_medians?.avg_ppv_price != null ? Math.round(data.org_medians.avg_ppv_price) : "—"}).
            Metodologia {data?.version}. Aggiornato {data?.generated_at ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}.{data?.cached ? " (cache)" : ""}
          </div>
        </>
      )}
    </div>
  );
}
