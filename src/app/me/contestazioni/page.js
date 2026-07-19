"use client";

import { useState } from "react";
import useSWR from "swr";
import { HelpCircle, MessageSquareWarning, CheckCircle2, XCircle, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/contestazioni — "Le mie contestazioni" (scope own, CAREER_LADDER §8.2).
 * Un numero che non torna si contesta qui, in forma strutturata: chi esamina
 * non è mai il tuo TL da solo, l'esito è scritto, le correzioni sono tracciate.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_META = {
  open: { label: "in esame", color: CP.accentBlue, Icon: Clock },
  accepted: { label: "accolta", color: CP.accentGreen, Icon: CheckCircle2 },
  partial: { label: "accolta in parte", color: "#d9a44a", Icon: CheckCircle2 },
  rejected: { label: "respinta", color: CP.textMuted, Icon: XCircle },
};

const SLA_MS = 10 * 24 * 3600 * 1000;

export default function MyDisputesPage() {
  const { data, mutate, isLoading } = useSWR("/api/me/disputes", fetcher, { revalidateOnFocus: false });
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

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Le mie contestazioni"
        subtitle="Un numero non ti torna — score, compenso, un turno attribuito male? Contestalo qui, in forma scritta. Chi esamina non è mai il tuo team lead da solo, l'esito arriva motivato, e se hai ragione la correzione viene fatta in modo tracciato: mai in silenzio."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && !data.linked && !data.error && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>Account non ancora collegato a un profilo operatore.</p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
          </div>
        </CpCard>
      )}

      {data?.linked && (
        <>
          {/* Nuova contestazione */}
          <CpCard style={{ marginBottom: 20 }}>
            <SectionLabel>Apri una contestazione</SectionLabel>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
              {[["score", "Sul mio score"], ["compenso", "Sul mio compenso"], ["altro", "Altro"]].map(([v, l]) => (
                <button key={v} onClick={() => setType(v)}
                  style={{ padding: "6px 14px", borderRadius: 99, border: `1px solid ${type === v ? CP.accent : CP.border}`, background: type === v ? CP.accentSoft : "transparent", color: type === v ? CP.accent : CP.textMuted, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
                  {l}
                </button>
              ))}
              <input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="Mese (es. 2026-07, opzionale)"
                style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.mono, width: 200 }} />
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
              placeholder="Spiega cosa non torna e perché — più sei specifico (mese, creator, turno), più veloce è la verifica."
              style={{ width: "100%", background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13.5, color: CP.textPrimary, fontFamily: FONTS.body, resize: "vertical", boxSizing: "border-box" }} />
            {formError && <p style={{ color: CP.accentRed, fontSize: 13, margin: "8px 0 0" }}>{formError}</p>}
            <button onClick={onSubmit} disabled={sending || message.trim().length < 10}
              style={{ marginTop: 10, padding: "8px 16px", background: message.trim().length >= 10 ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: message.trim().length >= 10 ? CP.accentInk : CP.textMuted, cursor: message.trim().length >= 10 ? "pointer" : "not-allowed" }}>
              Invia contestazione
            </button>
            <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Tempo di risposta previsto: 10 giorni. L'esito ti arriva qui, motivato.</p>
          </CpCard>

          {/* Le mie contestazioni */}
          <SectionLabel>Storico</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(data.disputes || []).length === 0 && (
              <p style={{ color: CP.textMuted, fontSize: 13.5 }}>Nessuna contestazione aperta finora.</p>
            )}
            {(data.disputes || []).map((d) => {
              const meta = STATUS_META[d.status] || STATUS_META.open;
              const overdue = d.status === "open" && Date.now() - d.created_at > SLA_MS;
              return (
                <CpCard key={d.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <meta.Icon size={15} color={meta.color} />
                    <span style={{ fontSize: 12.5, fontWeight: 650, color: meta.color }}>{meta.label}</span>
                    {overdue && <span style={{ fontSize: 11.5, color: CP.accentRed }}>oltre i 10 giorni — sollecita il tuo SM</span>}
                    <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>
                      {d.type}{d.period_id ? ` · ${d.period_id}` : ""} · {new Date(d.created_at).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  <p style={{ fontSize: 13.5, color: CP.textPrimary, margin: 0 }}>{d.message}</p>
                  {d.resolution_note && (
                    <p style={{ fontSize: 13, color: CP.textSecondary, margin: "8px 0 0", paddingTop: 8, borderTop: `1px solid ${CP.borderSoft}` }}>
                      <b>Esito:</b> {d.resolution_note}
                    </p>
                  )}
                </CpCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
