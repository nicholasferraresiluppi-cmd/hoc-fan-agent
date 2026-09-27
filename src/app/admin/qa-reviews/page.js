"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { CheckCircle2, XCircle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, card } from "@/components/ds";

/**
 * /admin/qa-reviews — QA conversazionale (CAREER_LADDER §8.1).
 * Rubrica 5 dimensioni 1-4; pass = media ≥ 3 e nessun fail compliance.
 * Campione previsto: 3 conversazioni/mese per operatore, estratte dal Message
 * Dashboard Infloww (v1: selezione manuale; estrazione random in fase 5).
 *
 * Redesign DS (26/09/2026): la scala 1-4 è scritta a schermo (prima solo nel
 * tooltip), etichette sui campi, mese con selettore (stesso formato AAAA-MM),
 * regole in parole. API, calcolo dell'anteprima e invio invariati.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SCALE_HINT = { 1: "1 — non accettabile", 2: "2 — sotto lo standard", 3: "3 — standard", 4: "4 — eccellente" };

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 };
const inp = { width: "100%", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, color: CP.textPrimary, fontFamily: FONTS.body, boxSizing: "border-box" };
const outcomeText = (r) => (r.compliance_fail ? "non superata: regola di compliance violata" : r.pass ? "superata" : "non superata: media sotto 3");
const avgFmt = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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

  const reviews = data?.reviews || [];
  const passN = reviews.filter((r) => r.pass && !r.compliance_fail).length;
  const failCompliance = reviews.filter((r) => r.compliance_fail).length;
  const canSubmit = allScored && employee && convRef;
  const missing = [!employee && "operatore", !convRef && "riferimento della conversazione", !allScored && "un voto per ogni voce"].filter(Boolean);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "QA conversazioni" }]}
        title="QA conversazioni"
        subtitle="Valuti la qualità di conversazioni vere degli operatori, non solo quanto vendono: serve a promuovere chi vende bene e in modo corretto. L'operatore legge voto e note nella sua pagina."
      />

      <Notice>
        Come funziona (career ladder §8.1): 3 conversazioni al mese per operatore, 5 voci da 1 a 4. La review è <b style={{ color: CP.textPrimary, fontWeight: 500 }}>superata</b> se la media è almeno 3 e la compliance non ha preso 1.
        Un 1 in compliance blocca le promozioni in corso. Le review non si modificano: un errore si corregge registrandone una nuova.
      </Notice>

      {forbidden && (
        <Notice danger>Riservata a chi vede i dati di tutti (admin, sales manager, QA): il team lead diretto da solo non può valutare i suoi operatori. {String(forbidden)}</Notice>
      )}

      {!forbidden && data && !isLoading && reviews.length > 0 && (
        <HeroMetric label="Review registrate" value={fmtInt(reviews.length)} compare="Tra le ultime mostrate qui sotto.">
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Superate" value={fmtInt(passN)} />
            <Metric label="Compliance violata" value={fmtInt(failCompliance)} danger={failCompliance > 0} />
          </div>
        </HeroMetric>
      )}

      {!forbidden && (
        <section style={{ ...card, padding: "18px 20px", marginBottom: 24 }}>
          <SectionTitle>Nuova review</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl} htmlFor="qa-emp">Operatore (nome esatto)</label>
              <input id="qa-emp" value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Nome Cognome" style={inp} />
            </div>
            <div>
              <label style={lbl} htmlFor="qa-month">Mese</label>
              <input id="qa-month" type="month" value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl} htmlFor="qa-ref">Quale conversazione (creator · fan · data, dal Message Dashboard di Infloww)</label>
            <input id="qa-ref" value={convRef} onChange={(e) => setConvRef(e.target.value)} placeholder="Es. Ella · fan Marco · 08/07" style={inp} />
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textMuted, marginBottom: 10 }}>
            <span>Scala:</span>
            {Object.values(SCALE_HINT).map((h) => <span key={h}>{h}</span>)}
          </div>
          {dims.length === 0 && !isLoading && <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 12 }}>Le voci della valutazione non sono arrivate: ricarica la pagina.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14 }}>
            {dims.map((d) => (
              <div key={d.key} style={{ background: CP.bg, border: `1px solid ${d.critical && scores[d.key] === 1 ? CP.accentRed : CP.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 8, lineHeight: 1.4 }}>
                  {d.label}{d.critical && <span style={{ color: CP.textMuted, fontSize: 12 }}> · un 1 blocca le promozioni</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }} role="group" aria-label={d.label}>
                  {[1, 2, 3, 4].map((v) => {
                    const on = scores[d.key] === v;
                    return (
                      <button key={v} onClick={() => setScores((s) => ({ ...s, [d.key]: v }))} title={SCALE_HINT[v]} aria-pressed={on}
                        style={{ width: 38, height: 32, borderRadius: 8, border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : CP.surface, color: on ? CP.accentSoftText : CP.textSecondary, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <label style={lbl} htmlFor="qa-notes">Note per l'operatore (le legge nella sua pagina): cosa ha funzionato, cosa migliorare</label>
          <textarea id="qa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />

          {preview && (
            <p style={{ fontSize: 14, margin: "12px 0 0", color: CP.textPrimary }}>
              Media {avgFmt(preview.avg)} ·{" "}
              <span style={{ color: preview.complianceFail ? CP.accentRed : preview.pass ? CP.accentGreen : CP.textSecondary }}>
                {preview.complianceFail ? "non superata: compliance a 1, blocca le promozioni in corso" : preview.pass ? "superata" : "non superata: media sotto 3"}
              </span>
            </p>
          )}
          {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={onSubmit} disabled={busy || !canSubmit}
              style={{ padding: "8px 16px", background: canSubmit ? CP.accent : CP.surfaceAlt, border: `1px solid ${canSubmit ? CP.accent : CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, color: canSubmit ? CP.accentInk : CP.textMuted, cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: FONTS.body }}>
              Registra review
            </button>
            {!canSubmit && missing.length > 0 && <span style={{ fontSize: 12, color: CP.textMuted }}>Manca: {missing.join(", ")}.</span>}
          </div>
        </section>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (
        <>
          <SectionTitle>Ultime review</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reviews.length === 0 && (
              <div style={{ ...card, padding: "18px 20px", color: CP.textSecondary, fontSize: 14 }}>
                Nessuna review ancora. La prima la registri nel modulo qui sopra.
              </div>
            )}
            {reviews.map((r) => (
              <section key={r.id} style={{ ...card, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {r.compliance_fail ? <XCircle size={15} color={CP.accentRed} /> : r.pass ? <CheckCircle2 size={15} color={CP.accentGreen} /> : <XCircle size={15} color={CP.textMuted} />}
                  <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{r.employee}</span>
                  <span style={{ fontSize: 13, color: CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.period_id}</span>
                  <span style={{ fontSize: 13, color: r.compliance_fail ? CP.accentRed : CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                    media {avgFmt(r.avg)} · {outcomeText(r)}
                  </span>
                  <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{r.conversation_ref}</span>
                </div>
                {r.notes && <p style={{ fontSize: 13, color: CP.textSecondary, margin: "6px 0 0", lineHeight: 1.5 }}>{r.notes}</p>}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
