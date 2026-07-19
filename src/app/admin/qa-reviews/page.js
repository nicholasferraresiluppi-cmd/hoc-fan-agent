"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /admin/qa-reviews — QA conversazionale (CAREER_LADDER §8.1).
 * Rubrica 5 dimensioni 1-4; pass = media ≥ 3 e nessun fail compliance.
 * Campione previsto: 3 conversazioni/mese per operatore, estratte dal Message
 * Dashboard Infloww (v1: selezione manuale; estrazione random in fase 5).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SCALE_HINT = { 1: "1 — fail", 2: "2 — sotto lo standard", 3: "3 — standard", 4: "4 — eccellente" };

export default function QaReviewsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/qa-reviews", fetcher, { revalidateOnFocus: false });
  const dims = data?.dimensions || [];
  const forbidden = data?.error;

  const [employee, setEmployee] = useState("");
  const [periodId, setPeriodId] = useState(currentMonthId());
  const [convRef, setConvRef] = useState("");
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const allScored = dims.length > 0 && dims.every((d) => Number.isInteger(scores[d.key]));
  const preview = useMemo(() => {
    if (!allScored) return null;
    const vals = dims.map((d) => scores[d.key]);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const complianceFail = scores.compliance === 1;
    return { avg: avg.toFixed(2), pass: avg >= 3 && !complianceFail, complianceFail };
  }, [scores, dims, allScored]);

  async function onSubmit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/qa-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employee, period_id: periodId, conversation_ref: convRef, scores, notes }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Errore.");
      else {
        setScores({});
        setConvRef("");
        setNotes("");
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1080, margin: "0 auto" }}>
      <PageHeader
        section="Training & Quality"
        title="QA conversazioni"
        subtitle="Il contrappeso qualità dei gate (career ladder §8.1): 3 conversazioni/mese per operatore, rubrica a 5 dimensioni, pass = media ≥ 3 e nessun fail su compliance. Un fail compliance congela le promozioni in corso. Le review sono definitive: un errore si corregge con una nuova review, mai riscrivendo."
      />

      {forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} /> Accesso riservato (scope "all": admin, SM, QA reviewer — mai il TL diretto da solo). {String(forbidden)}
          </div>
        </CpCard>
      )}

      {!forbidden && (
        <CpCard style={{ marginBottom: 20 }}>
          <SectionLabel>Nuova review</SectionLabel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
            <input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Operatore (nome esatto)"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, width: 220, fontFamily: FONTS.body }} />
            <input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="YYYY-MM"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, width: 110, fontFamily: FONTS.mono }} />
            <input value={convRef} onChange={(e) => setConvRef(e.target.value)} placeholder="Riferimento conversazione (creator · fan · data — dal Message Dashboard)"
              style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, flex: 1, minWidth: 260, fontFamily: FONTS.body }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
            {dims.map((d) => (
              <div key={d.key} style={{ background: CP.surfaceAlt, border: `1px solid ${d.critical && scores[d.key] === 1 ? CP.accentRed : CP.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 12.5, color: CP.textPrimary, marginBottom: 8, fontWeight: 550 }}>
                  {d.label}{d.critical && <span style={{ color: CP.accentRed }}> *</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4].map((v) => (
                    <button key={v} onClick={() => setScores((s) => ({ ...s, [d.key]: v }))} title={SCALE_HINT[v]}
                      style={{ width: 34, height: 30, borderRadius: 7, border: `1px solid ${scores[d.key] === v ? CP.accent : CP.border}`, background: scores[d.key] === v ? CP.accentSoft : "transparent", color: scores[d.key] === v ? CP.accent : CP.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Note per l'operatore (le leggerà nella sua vista): cosa ha funzionato, cosa migliorare."
            style={{ width: "100%", background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body }} />

          {preview && (
            <p style={{ fontSize: 13, margin: "10px 0 0", color: preview.complianceFail ? CP.accentRed : preview.pass ? CP.accentGreen : CP.textSecondary, fontWeight: 600 }}>
              Media {preview.avg} → {preview.complianceFail ? "FAIL COMPLIANCE (congela promozioni)" : preview.pass ? "PASS" : "NO PASS (media < 3)"}
            </p>
          )}
          {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
          <button onClick={onSubmit} disabled={busy || !allScored || !employee || !convRef}
            style={{ marginTop: 10, padding: "8px 16px", background: allScored && employee && convRef ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: allScored && employee && convRef ? CP.accentInk : CP.textMuted, cursor: allScored && employee && convRef ? "pointer" : "not-allowed" }}>
            Registra review
          </button>
        </CpCard>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (
        <>
          <SectionLabel>Ultime review</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(data?.reviews || []).length === 0 && <p style={{ color: CP.textMuted, fontSize: 13.5 }}>Nessuna review ancora. La prima la registri qui sopra.</p>}
            {(data?.reviews || []).map((r) => (
              <CpCard key={r.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {r.compliance_fail ? <XCircle size={15} color={CP.accentRed} /> : r.pass ? <CheckCircle2 size={15} color={CP.accentGreen} /> : <XCircle size={15} color={CP.textMuted} />}
                  <span style={{ fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 600, color: CP.textPrimary }}>{r.employee}</span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.textMuted }}>{r.period_id}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: r.compliance_fail ? CP.accentRed : r.pass ? CP.accentGreen : CP.textMuted }}>
                    media {r.avg} · {r.compliance_fail ? "fail compliance" : r.pass ? "pass" : "no pass"}
                  </span>
                  <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{r.conversation_ref}</span>
                </div>
                {r.notes && <p style={{ fontSize: 12.5, color: CP.textSecondary, margin: "6px 0 0" }}>{r.notes}</p>}
              </CpCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
