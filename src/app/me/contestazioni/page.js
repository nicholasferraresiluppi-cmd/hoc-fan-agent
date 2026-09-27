"use client";

import { useState } from "react";
import useSWR from "swr";
import { HelpCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, FilterChip, Notice, card, NUM } from "@/components/ds";

/**
 * /me/contestazioni — "Le mie contestazioni" (scope own, CAREER_LADDER §8.2).
 * Un numero che non torna si contesta qui, in forma strutturata: chi esamina
 * non è mai il tuo TL da solo, l'esito è scritto, le correzioni sono tracciate.
 * Ridisegno sul design system 26/09/2026: API, validazione (≥10 caratteri) e
 * comportamento invariati.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

// Colore solo come segnale sull'icona; l'etichetta dice sempre lo stato a parole.
const STATUS_META = {
  open: { label: "In esame", color: CP.accentSoftText, Icon: Clock },
  accepted: { label: "Accolta", color: CP.accentGreen, Icon: CheckCircle2 },
  partial: { label: "Accolta in parte", color: CP.accentGreen, Icon: CheckCircle2 },
  rejected: { label: "Respinta", color: CP.textMuted, Icon: XCircle },
};
const TYPES = [["score", "Sul mio score"], ["compenso", "Sul mio compenso"], ["altro", "Altro"]];
const TYPE_LABEL = { score: "Score", compenso: "Compenso", altro: "Altro" };

const SLA_MS = 10 * 24 * 3600 * 1000;

const fieldLabel = { display: "block", fontSize: 13, fontWeight: 500, color: CP.textSecondary, margin: "0 0 6px" };
const input = { background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body, boxSizing: "border-box" };

export default function MyDisputesPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/me/disputes", fetcher, { revalidateOnFocus: false });
  const [type, setType] = useState("score");
  const [periodId, setPeriodId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState(null);

  async function onSubmit() {
    setSending(true);
    setFormError(null);
    try {
      const r = await fetch("/api/me/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, period_id: periodId || null, message }),
      });
      const j = await r.json();
      if (!r.ok) setFormError(j.error || "Errore.");
      else {
        setMessage("");
        setPeriodId("");
        await mutate();
      }
    } catch (e) {
      setFormError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  const ready = message.trim().length >= 10;
  const disputes = data?.disputes || [];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 880, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Le mie contestazioni" }]}
        title="Le mie contestazioni"
        subtitle="Se un numero non ti torna (score, compenso, un turno attribuito male) puoi contestarlo qui, per iscritto."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {error && !data && <Notice danger>Errore di rete: la pagina non si è caricata. Riprova tra poco.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.linked && !data.error && (
        <div style={{ ...card, padding: "28px 18px", textAlign: "center" }}>
          <HelpCircle size={28} color={CP.mutedIcons} />
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: "10px 0 4px" }}>Il tuo account non è ancora collegato a un profilo operatore.</p>
          <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
        </div>
      )}

      {data?.linked && (
        <>
          {/* Come funziona: le garanzie della procedura, prima del modulo */}
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
            <SectionTitle>Come funziona</SectionTitle>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
              <li>Scrivi cosa non torna e perché. Resta tutto per iscritto.</li>
              <li>Chi esamina la contestazione non è mai il tuo team lead da solo.</li>
              <li>Ricevi l&apos;esito qui, con la motivazione. Tempo di risposta previsto: 10 giorni.</li>
              <li>Se hai ragione, la correzione viene fatta in modo tracciato, mai in silenzio.</li>
            </ol>
          </section>

          {/* Nuova contestazione */}
          <section style={{ ...card, padding: "16px 18px", marginBottom: 24 }}>
            <SectionTitle>Apri una contestazione</SectionTitle>

            <span style={fieldLabel}>Su cosa</span>
            <div role="group" aria-label="Tipo di contestazione" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {TYPES.map(([v, l]) => (
                <FilterChip key={v} label={l} active={type === v} onClick={() => setType(v)} />
              ))}
            </div>

            <label htmlFor="dispute-period" style={fieldLabel}>Mese (facoltativo)</label>
            <input id="dispute-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="es. 2026-07"
              style={{ ...input, width: 200, maxWidth: "100%", marginBottom: 14, ...NUM }} />

            <label htmlFor="dispute-message" style={fieldLabel}>Cosa non torna</label>
            <textarea id="dispute-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="Spiega cosa non torna e perché. Più dettagli dai (mese, creator, turno), più veloce è la verifica."
              style={{ ...input, width: "100%", fontSize: 14, padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }} />
            {!ready && message.length > 0 && (
              <p style={{ fontSize: 12, color: CP.textMuted, margin: "6px 0 0" }}>Scrivi almeno 10 caratteri per poter inviare.</p>
            )}
            {formError && <Notice danger>{formError}</Notice>}
            <button onClick={onSubmit} disabled={sending || !ready}
              style={{ marginTop: 12, padding: "9px 16px", background: ready ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: ready ? CP.accentInk : CP.textMuted, cursor: ready && !sending ? "pointer" : "not-allowed", fontFamily: FONTS.body }}>
              {sending ? "Invio in corso…" : "Invia contestazione"}
            </button>
          </section>

          {/* Le mie contestazioni */}
          <SectionTitle>Storico</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {disputes.length === 0 && (
              <div style={{ ...card, padding: "16px 18px", fontSize: 13, color: CP.textSecondary }}>Non hai ancora aperto contestazioni.</div>
            )}
            {disputes.map((d) => {
              const meta = STATUS_META[d.status] || STATUS_META.open;
              const overdue = d.status === "open" && Date.now() - d.created_at > SLA_MS;
              return (
                <article key={d.id} style={{ ...card, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <meta.Icon size={15} color={meta.color} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>{meta.label}</span>
                    <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto", ...NUM }}>
                      {TYPE_LABEL[d.type] || d.type}{d.period_id ? ` · ${d.period_id}` : ""} · aperta il {new Date(d.created_at).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  {overdue && (
                    <p style={{ fontSize: 12, color: CP.accentRed, margin: "0 0 8px" }}>
                      Sono passati più di 10 giorni senza esito: sollecita il tuo sales manager.
                    </p>
                  )}
                  <p style={{ fontSize: 14, color: CP.textPrimary, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{d.message}</p>
                  {d.resolution_note && (
                    <p style={{ fontSize: 13, color: CP.textSecondary, margin: "10px 0 0", paddingTop: 10, borderTop: `1px solid ${CP.borderSoft}`, lineHeight: 1.55 }}>
                      <span style={{ fontWeight: 500, color: CP.textPrimary }}>Esito:</span> {d.resolution_note}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
